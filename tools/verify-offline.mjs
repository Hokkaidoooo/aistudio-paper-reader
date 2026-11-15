import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyNotes } from './verify-notes.mjs';
import { verifyNativePicker } from './verify-picker.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const playwrightModule = process.env.AIR_PLAYWRIGHT_MODULE;
const { chromium } = playwrightModule ? require(playwrightModule) : await import('playwright');
const sourcePath = path.join(workspace, 'extension', 'reader.js');
const fixturePath = path.join(workspace, 'tests', 'fixture.html');
const manifest = JSON.parse(await readFile(path.join(workspace, 'extension', 'manifest.json'), 'utf8'));
const source = await readFile(sourcePath, 'utf8');
const fixture = await readFile(fixturePath, 'utf8');
const artifactDir = path.join(workspace, 'artifacts');
await mkdir(artifactDir, { recursive: true });
const scratch = await mkdtemp(path.join(workspace, '.offline-test-'));
const report = { date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }), version: manifest.version, sourceSha256: createHash('sha256').update(source).digest('hex'), checks: [], externalRequests: [], errors: [], cleanup: { path: scratch, removed: false } };
let context;

async function check(name, action) {
    await action();
    report.checks.push(name);
    console.log(`PASS ${name}`);
}

function luminance(hex) {
    const channels = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

function contrast(a, b) {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

async function syntheticPage(stored = null, pathname = '/prompts/new_chat', { wrappedWindow = false, localFile = false } = {}) {
    const page = await context.newPage();
    if (localFile) await page.goto(pathToFileURL(fixturePath).href);
    else await page.setContent(fixture);
    await page.evaluate(({ stored, pathname, wrappedWindow }) => {
        document.documentElement.removeAttribute('data-air-preview');
        window.__testLocation = { protocol: 'https:', hostname: 'aistudio.google.com', origin: 'https://aistudio.google.com', href: `https://aistudio.google.com${pathname}`, pathname };
        window.__stored = stored;
        window.__messageListeners = [];
        window.__storageWrites = [];
        // 显式异步替身只用于离线契约测试；实际扩展加载由独立 smoke 验证。
        window.__chromeHarness = {
            storage: {
                local: {
                    get: async key => window.__stored === null ? {} : { [key]: structuredClone(window.__stored) },
                    set: async values => {
                        if (window.__blockNextWrite) {
                            window.__blockNextWrite = false;
                            await new Promise(resolve => { window.__releaseWrite = resolve; });
                        }
                        if (window.__storageWriteError) throw new Error(window.__storageWriteError);
                        window.__stored = structuredClone(values['air-reader-settings-v1']);
                        window.__storageWrites.push(structuredClone(window.__stored));
                    }
                }
            },
            runtime: {
                onMessage: { addListener: handler => window.__messageListeners.push(handler) }
            }
        };
        window.__policyViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.__policyViolations.push(event.violatedDirective));
        document.getElementById('native-action').addEventListener('click', () => {
            document.getElementById('native-result').textContent = '已读';
            document.getElementById('native-action').setAttribute('aria-pressed', 'true');
        });
        // picker 故意不绑定，用来检验包装 Window 不可替代原生方法的接收对象。
        window.__testWindow = wrappedWindow ? new Proxy(window, {
            get(target, key) {
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' && key !== 'showSaveFilePicker' ? value.bind(target) : value;
            }
        }) : window;
    }, { stored, pathname, wrappedWindow });
    // 本地注入合成 location 和可选包装 Window；不访问任何 Google 页面。
    await page.evaluate(`(function(window, location, chrome) { return ${source}\n})(window.__testWindow, window.__testLocation, window.__chromeHarness)`);
    return page;
}

async function panelOpen(page) {
    const trigger = page.getByRole('button', { name: '阅读设置', exact: true });
    if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}

async function slider(page, name, value) {
    await page.getByRole('slider', { name, exact: true }).evaluate((input, next) => {
        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
}

async function assertImmersiveLayout(page, active) {
    for (const region of ['navbar', 'settings-panel', 'footer', 'prompt-box']) {
        assert.equal(await page.locator(`[data-preview-shell="${region}"]`).isHidden(), active, `${region} 显隐不符合阅读状态`);
    }
    const layout = await page.locator('.layout-wrapper').evaluate(el => ({
        left: el.getBoundingClientRect().left,
        width: el.getBoundingClientRect().width,
        viewport: innerWidth,
        overflow: document.documentElement.scrollWidth - innerWidth
    }));
    assert(layout.overflow <= 1, `页面横向溢出 ${layout.overflow}px`);
    if (active) {
        assert(Math.abs(layout.left) <= 1, `左侧仍预留 ${layout.left}px`);
        assert(Math.abs(layout.width - layout.viewport) <= 1, '正文容器未占满释放后的可用空间');
    }
    assert(await page.getByRole('button', { name: '阅读设置', exact: true }).isVisible(), '退出阅读入口不可见');
}

async function shellAppearance(page) {
    return page.evaluate(() => {
        const resolve = key => {
            const probe = document.createElement('span');
            probe.style.color = `var(--air-${key})`;
            document.body.append(probe);
            const value = getComputedStyle(probe).color;
            probe.remove();
            return value;
        };
        const palette = Object.fromEntries(['bg', 'text', 'code'].map(key => [key, resolve(key)]));
        const styles = {};
        const specs = [
            ['body', 'backgroundColor', 'bg'],
            ['ms-playground-toolbar', 'backgroundColor', 'bg'],
            ['ms-playground-toolbar .mode-title', 'color', 'text'],
            ['.code-block-header', 'backgroundColor', 'code'],
            ['.code-block-header button', 'color', 'text']
        ];
        for (const [selector, property, expected] of specs) {
            styles[`${selector}:${property}`] = { actual: getComputedStyle(document.querySelector(selector))[property], expected: palette[expected] };
        }
        return styles;
    });
}

try {
    await check('扩展仅匹配 AI Studio、只申请本地设置权限，阅读源码没有网络或自动操作代码', async () => {
        for (const expression of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\s*\(/, /\bEventSource\s*\(/, /\bsendBeacon\s*\(/, /GM[_.]xml[Hh]ttpRequest/, /@(?:connect|require|resource|downloadURL|updateURL)\b/, /(?:https?:)?\/\/[^\s]+\.(?:woff2?|ttf|css)(?:\s|['"])/, /\b(?:setInterval|setTimeout)\s*\(/, /(?:cookie|access_token|authorization)/i, /\.(?:fetch|reload|submit|click)\s*\(/]) {
            assert(!expression.test(source), `出现未经允许的功能：${expression}`);
        }
        assert.equal(manifest.manifest_version, 3);
        assert.deepEqual(manifest.permissions, ['storage']);
        assert.deepEqual(manifest.content_scripts.flatMap(script => script.matches), ['https://aistudio.google.com/*']);
        assert.deepEqual(manifest.content_scripts.flatMap(script => script.js), ['reader.js']);
        assert(manifest.content_scripts.every(script => !script.world || script.world === 'ISOLATED'));
        assert(!/\bGM[_\.]/.test(source), '扩展源码不应继续依赖用户脚本接口');
        assert(!/(?:\.innerHTML|\.outerHTML)\s*=|insertAdjacentHTML\s*\(|createContextualFragment\s*\(|trustedTypes\.createPolicy\s*\(/.test(source), '不得使用 HTML 注入或放宽 Trusted Types 策略');
    });

    context = await chromium.launchPersistentContext(path.join(scratch, 'profile'), {
        executablePath: process.env.AIR_CHROMIUM_EXECUTABLE || undefined,
        headless: true,
        viewport: { width: 1920, height: 1080 },
        serviceWorkers: 'block',
        args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND']
    });
    await context.route(/^(?:https?|wss?):/i, async route => {
        report.externalRequests.push(route.request().url());
        await route.abort('blockedbyclient');
    });
    context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
    const page = await syntheticPage(null, '/prompts/new_chat', { localFile: true });

    await check('本地合成页面加载扩展唯一阅读源码，默认排版生效', async () => {
        assert(await page.locator('html').evaluate(el => el.hasAttribute('data-air-active')));
        const styles = await page.locator('.model p').first().evaluate(el => ({ size: getComputedStyle(el).fontSize, leading: getComputedStyle(el).lineHeight, color: getComputedStyle(el).color }));
        assert.equal(styles.size, '18px');
        assert.equal(styles.leading, '34.2px');
        assert.equal(styles.color, 'rgb(52, 60, 54)');
    });

    const contentBefore = await page.locator('.model .turn-content').innerHTML();
    await check('严格 Trusted Types 安全策略下按钮可见且面板可打开', async () => {
        assert((await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).includes("trusted-types 'none'"));
        const probe = await page.evaluate(() => {
            const target = document.createElement('div');
            try { target.innerHTML = '<span>probe</span>'; return 'not-enforced'; }
            catch (error) { return error.name; }
        });
        assert.equal(probe, 'TypeError', '严格策略必须真实拦截字符串 HTML');
        assert(await page.getByRole('button', { name: '阅读设置', exact: true }).isVisible());
        await panelOpen(page);
        assert(await page.getByRole('dialog', { name: '纸间阅读' }).isVisible());
        await page.getByRole('button', { name: '关闭阅读设置', exact: true }).click();
    });
    await check('沉浸阅读隐藏两侧和底部，网格与弹性布局均无空白占位', async () => {
        await assertImmersiveLayout(page, true);
        const article = await page.locator('.model').boundingBox();
        assert(Math.abs(article.x + article.width / 2 - 960) <= 1, '文章没有在可用空间中居中');
        assert.equal(Math.round(article.width), 880, '正文仍应遵守阅读宽度');
        await page.locator('.makersuite-layout').evaluate(el => { el.style.display = 'flex'; });
        await assertImmersiveLayout(page, true);
        await page.locator('.makersuite-layout').evaluate(el => el.style.removeProperty('display'));
    });
    const codeBlock = page.locator('ms-code-block pre');
    await check('嵌套 Markdown 标题继承字号，原生数学字体与行内布局保留', async () => {
        const heading = await page.locator('.model h1').evaluate(el => ({ title: getComputedStyle(el).fontSize, inner: getComputedStyle(el.querySelector('ms-cmark-node')).fontSize }));
        assert.equal(heading.title, '27.9px');
        assert.equal(heading.inner, heading.title);
        const math = await page.locator('ms-katex.inline pre').evaluate(el => ({ display: getComputedStyle(el).display, padding: getComputedStyle(el).padding, border: getComputedStyle(el).borderTopWidth, background: getComputedStyle(el).backgroundColor, font: getComputedStyle(el.querySelector('code')).fontFamily }));
        assert.equal(math.display, 'inline');
        assert.equal(math.padding, '0px');
        assert.equal(math.border, '0px');
        assert.equal(math.background, 'rgba(0, 0, 0, 0)');
        assert(math.font.includes('Times New Roman'));
    });
    await check('四个主题与文字对比度', async () => {
        await panelOpen(page);
        report.contrast = {};
        for (const [theme, name] of [['paper', '宣纸'], ['mist', '雾蓝'], ['sage', '青苔'], ['night', '夜读']]) {
            await panelOpen(page);
            await page.getByRole('button', { name, exact: true }).click();
            const palette = await page.locator('html').evaluate(el => {
                const style = getComputedStyle(el);
                return Object.fromEntries(['paper', 'text', 'muted', 'accent', 'code', 'keyword', 'string', 'number', 'comment'].map(key => [key, style.getPropertyValue(`--air-${key}`).trim()]));
            });
            report.contrast[theme] = {};
            for (const key of ['text', 'muted', 'accent']) {
                const ratio = contrast(palette[key], palette.paper);
                assert(ratio >= 4.5, `${theme} ${key} 对比度不足 ${ratio}`);
                report.contrast[theme][key] = Number(ratio.toFixed(2));
            }
            for (const key of ['text', 'keyword', 'string', 'number', 'comment']) assert(contrast(palette[key], palette.code) >= 4.5, `${theme} ${key} 代码对比度不足`);
            for (const [name, { actual, expected }] of Object.entries(await shellAppearance(page))) assert.equal(actual, expected, `${theme} ${name} 配色未统一`);
            if (theme === 'paper') {
                await page.screenshot({ path: path.join(artifactDir, '阅读设置.png') });
                await page.locator('#reader-panel').screenshot({ path: path.join(artifactDir, '设置面板.png') });
            }
            await page.getByRole('button', { name: '关闭阅读设置', exact: true }).click();
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: path.join(artifactDir, `${name}.png`) });
            if (theme === 'paper') {
                await page.locator('.code-block-header').scrollIntoViewIfNeeded();
                await page.screenshot({ path: path.join(artifactDir, '宣纸代码.png') });
                await page.evaluate(() => scrollTo(0, 0));
            }
        }
        await panelOpen(page);
    });

    await check('可见顶栏和代码配色统一，阴影与重复代码边框移除', async () => {
        const actual = await page.evaluate(() => ({
            toolbarShadow: getComputedStyle(document.querySelector('ms-playground-toolbar')).boxShadow,
            bodyScheme: getComputedStyle(document.body).colorScheme,
            border: getComputedStyle(document.querySelector('.code-block-header')).borderBottomWidth,
            innerCodeBorder: getComputedStyle(document.querySelector('ms-code-block pre')).borderTopWidth,
            innerCodeMargin: getComputedStyle(document.querySelector('ms-code-block pre')).marginTop
        }));
        assert.equal(actual.toolbarShadow, 'none');
        assert.equal(actual.bodyScheme, 'dark');
        assert.equal(actual.border, '1px');
        assert.equal(actual.innerCodeBorder, '0px');
        assert.equal(actual.innerCodeMargin, '0px');
    });

    await check('字号、行距、宽度和字体修改生效，内容保持原样', async () => {
        await slider(page, '正文字号', 20);
        await slider(page, '行间距', 2);
        await slider(page, '阅读宽度', 1040);
        await page.getByRole('combobox', { name: '阅读字体' }).selectOption('serif');
        const styles = await page.locator('.model p').first().evaluate(el => ({ size: getComputedStyle(el).fontSize, leading: getComputedStyle(el).lineHeight, font: getComputedStyle(el).fontFamily }));
        assert.equal(styles.size, '20px');
        assert.equal(styles.leading, '40px');
        assert(styles.font.includes('Serif'));
        assert.equal(Math.round((await page.locator('.model').boundingBox()).width), 1040);
        assert.equal(await page.locator('.model .turn-content').innerHTML(), contentBefore);
    });

    await check('长代码折行仅改变显示，不改变代码文本', async () => {
        const code = await codeBlock.textContent();
        assert.equal(await codeBlock.evaluate(el => getComputedStyle(el).whiteSpace), 'pre');
        await page.getByRole('checkbox', { name: '长代码自动折行' }).check();
        assert.equal(await codeBlock.evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap');
        assert.equal(await codeBlock.textContent(), code);
        assert.equal(await page.locator('ms-katex.inline pre').evaluate(el => getComputedStyle(el).whiteSpace), 'normal');
    });

    await check('原生正文按钮操作保留，点击外部收起面板', async () => {
        await page.getByRole('button', { name: '标记已读' }).click();
        assert.equal(await page.locator('#native-result').textContent(), '已读');
        assert(await page.locator('#air-reader-controls .panel').isHidden());
    });

    await check('退出阅读恢复原布局和输入，草稿与节点在反复切换后保留', async () => {
        await panelOpen(page);
        await page.getByRole('button', { name: '恢复原版', exact: true }).click();
        await assertImmersiveLayout(page, false);
        const originalLayout = await page.locator('.layout-wrapper').evaluate(el => ({ left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width }));
        const draft = page.getByLabel('试试输入，感受阅读与写作之间的切换');
        await draft.fill('读完这段后，我想再看看例子。');
        await draft.evaluate(el => { window.__originalDraftNode = el; });
        assert.equal(await page.locator('.model p').first().evaluate(el => getComputedStyle(el).fontSize), '15px');
        assert.equal(await page.locator('.model').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(29, 32, 35)');
        assert.equal(await page.locator('ms-navbar-v2').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(25, 25, 25)');
        assert.equal(await page.locator('ms-prompt-box .prompt-box-container').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(41, 45, 48)');
        assert.notEqual(await page.locator('ms-playground-toolbar').evaluate(el => getComputedStyle(el).boxShadow), 'none');
        assert((await page.locator('.chunk-editor-main > footer').evaluate(el => getComputedStyle(el, '::before').backgroundImage)).includes('linear-gradient'));
        await panelOpen(page);
        await page.getByRole('button', { name: '开启阅读', exact: true }).click();
        await assertImmersiveLayout(page, true);
        assert.equal(await page.locator('#preview-draft').inputValue(), '读完这段后，我想再看看例子。');
        assert.equal(await page.locator('.model p').first().evaluate(el => getComputedStyle(el).fontSize), '20px');
        await page.getByRole('button', { name: '恢复原版', exact: true }).click();
        await assertImmersiveLayout(page, false);
        assert(await draft.evaluate(el => el === window.__originalDraftNode), '切换阅读重建了输入节点');
        assert.equal(await draft.inputValue(), '读完这段后，我想再看看例子。');
        assert.deepEqual(await page.locator('.layout-wrapper').evaluate(el => ({ left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width })), originalLayout);
        await draft.fill('读完这段后，我想再看看例子。请接着讲。');
        assert.equal(await draft.inputValue(), '读完这段后，我想再看看例子。请接着讲。');
        await panelOpen(page);
        await page.getByRole('button', { name: '恢复默认', exact: true }).click();
        await assertImmersiveLayout(page, true);
        assert.equal(await page.locator('.model p').first().evaluate(el => getComputedStyle(el).fontSize), '18px');
        assert.equal(await codeBlock.evaluate(el => getComputedStyle(el).whiteSpace), 'pre');
    });

    await check('桌面、窄屏与短窗口的设置无需滚动，全部控件完整可见', async () => {
        report.panelLayouts = [];
        for (const viewport of [
            { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 1024, height: 480 },
            { width: 1280, height: 720 }, { width: 768, height: 432 }, { width: 640, height: 360 },
            { width: 480, height: 400 }, { width: 320, height: 480 }
        ]) {
            await page.setViewportSize(viewport);
            await assertImmersiveLayout(page, true);
            await panelOpen(page);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            assert(overflow <= 1, `页面横向溢出 ${overflow}px`);
            const bounds = await page.locator('#air-reader-controls .panel').boundingBox();
            assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height, '面板超出屏幕');
            const layout = await page.locator('#reader-panel').evaluate(panel => {
                const bounds = panel.getBoundingClientRect();
                const outside = [...panel.querySelectorAll('button, input, select, .status')].filter(control => {
                    const rect = control.getBoundingClientRect();
                    return rect.width <= 0 || rect.height <= 0 || rect.left < bounds.left || rect.right > bounds.right + 1
                        || rect.top < bounds.top || rect.bottom > bounds.bottom + 1;
                }).map(control => control.id || control.textContent);
                return { width: bounds.width, height: bounds.height, overflowX: panel.scrollWidth - panel.clientWidth,
                    overflowY: panel.scrollHeight - panel.clientHeight, scrollTop: panel.scrollTop, outside };
            });
            assert.equal(layout.overflowX, 0, '设置面板需要横向滚动');
            assert.equal(layout.overflowY, 0, `设置面板需要上下滚动：${JSON.stringify({ viewport, layout })}`);
            assert.equal(layout.scrollTop, 0, '设置面板发生了自动滚动');
            assert.deepEqual(layout.outside, [], '控件或状态文字被裁切');
            report.panelLayouts.push({ viewport, ...layout });
            if (viewport.width === 640) await page.screenshot({ path: path.join(artifactDir, '设置短窗口.png') });
            if (viewport.width === 480) await page.screenshot({ path: path.join(artifactDir, '设置窄窗口.png') });
            if (viewport.width === 390) {
                await page.getByRole('button', { name: '关闭阅读设置', exact: true }).click();
                await page.evaluate(() => scrollTo(0, 0));
                await page.screenshot({ path: path.join(artifactDir, '窄屏.png') });
            }
            if (viewport.width === 320) {
                await slider(page, '正文字号', 24);
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '最大字号在窄屏下溢出');
                await page.getByRole('button', { name: '恢复原版', exact: true }).click();
                assert(await page.locator('#preview-draft').isVisible(), '窄屏退出阅读后输入区未恢复');
                assert(await page.locator('ms-navbar-v2').isHidden(), '退出阅读破坏了原站窄屏导航断点');
                assert(await page.locator('ms-right-side-panel').isHidden(), '退出阅读破坏了原站窄屏设置断点');
                await page.getByRole('button', { name: '恢复默认', exact: true }).click();
            }
        }
        await page.setViewportSize({ width: 1920, height: 1080 });
    });

    await check('键盘 Esc 可关闭面板，并归还焦点', async () => {
        await panelOpen(page);
        await page.keyboard.press('Escape');
        assert(await page.locator('#air-reader-controls .panel').isHidden());
        assert.equal(await page.locator('#air-reader-controls').evaluate(el => el.shadowRoot.activeElement?.getAttribute('aria-label')), '阅读设置');
    });

    await check('动态新增回答和流式文本使用同一套样式，不反复扫描正文', async () => {
        await page.evaluate(() => {
            window.__queryCount = 0;
            const nativeQuery = document.querySelectorAll.bind(document);
            document.querySelectorAll = (...args) => { window.__queryCount++; return nativeQuery(...args); };
            const turn = document.createElement('ms-chat-turn');
            turn.dataset.turnRole = 'Model';
            const container = document.createElement('div');
            container.className = 'chat-turn-container';
            const content = document.createElement('div');
            content.className = 'turn-content';
            const chunk = document.createElement('ms-text-chunk');
            const markdown = document.createElement('ms-cmark-node');
            const paragraph = document.createElement('p');
            paragraph.id = 'stream';
            paragraph.textContent = '动态回答';
            markdown.append(paragraph);
            chunk.append(markdown);
            content.append(chunk);
            container.append(content);
            turn.append(container);
            document.querySelector('ms-autoscroll-container').append(turn);
            for (let index = 0; index < 100; index++) document.getElementById('stream').append(document.createTextNode('。'));
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        assert.equal(await page.evaluate(() => window.__queryCount), 0);
        assert.equal(await page.locator('#stream').evaluate(el => getComputedStyle(el).fontSize), '18px');
    });

    const production = await syntheticPage();
    await check('源码启动未触发安全策略违规，扩展消息入口复用阅读面板', async () => {
        assert.deepEqual(await production.evaluate(() => window.__policyViolations), []);
        const response = await production.evaluate(() => {
            if (window.__messageListeners.length !== 1) throw new Error('扩展消息监听器应只注册一次');
            let response;
            window.__messageListeners[0]({ type: 'air:open-settings' }, {}, value => { response = value; });
            return response;
        });
        assert.equal(response.ok, true);
        assert(await production.getByRole('dialog', { name: '纸间阅读' }).isVisible());
        await production.getByRole('button', { name: '关闭阅读设置', exact: true }).click();
    });
    await check('生产域名与 SPA 路径判断使用合成对象验证，不访问 Google', async () => {
        assert(await production.locator('html').evaluate(el => el.hasAttribute('data-air-active')));
        await assertImmersiveLayout(production, true);
        await production.evaluate(() => { window.__testLocation.pathname = '/apps'; document.body.append(document.createElement('span')); });
        await production.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        assert(await production.locator('#air-reader-controls').isHidden());
        assert(!(await production.locator('html').evaluate(el => el.hasAttribute('data-air-active'))));
        for (const region of ['navbar', 'settings-panel', 'footer']) assert(await production.locator(`[data-preview-shell="${region}"]`).isVisible(), `离开对话页后 ${region} 未恢复`);
        await production.evaluate(() => { window.__testLocation.pathname = '/prompts/saved-chat'; document.body.append(document.createElement('span')); });
        await production.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        assert(await production.locator('#air-reader-controls').isVisible());
        assert(await production.locator('html').evaluate(el => el.hasAttribute('data-air-active')));
        await assertImmersiveLayout(production, true);
    });

    await check('本地设置可持久恢复，重复加载不重复创建界面', async () => {
        await panelOpen(production);
        await production.getByRole('button', { name: '雾蓝', exact: true }).click();
        await slider(production, '正文字号', 21);
        await production.waitForFunction(() => window.__stored?.theme === 'mist' && window.__stored?.size === 21);
        const stored = await production.evaluate(() => window.__stored);
        const restored = await syntheticPage(stored);
        assert.equal(await restored.locator('.model p').first().evaluate(el => getComputedStyle(el).fontSize), '21px');
        assert.equal(await restored.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--air-paper').trim()), '#f3f8fa');
        await restored.evaluate(`(function(window, location, chrome) { return ${source}\n})(window.__testWindow, window.__testLocation, window.__chromeHarness)`);
        assert.equal(await restored.locator('#air-reader-controls').count(), 1);
        assert.equal(await restored.locator('#air-reader-page-style').count(), 1);
        await restored.close();
    });

    await check('慢存储期间连续调整最终值可持久恢复，旧写入不覆盖新设置', async () => {
        const ordered = await syntheticPage();
        try {
            await panelOpen(ordered);
            await ordered.evaluate(() => { window.__blockNextWrite = true; });
            await ordered.getByRole('button', { name: '雾蓝', exact: true }).click();
            await ordered.waitForFunction(() => typeof window.__releaseWrite === 'function');
            await slider(ordered, '正文字号', 22);
            await ordered.getByRole('button', { name: '青苔', exact: true }).click();
            assert.equal(await ordered.locator('.model p').first().evaluate(el => getComputedStyle(el).fontSize), '22px');
            await ordered.evaluate(() => window.__releaseWrite());
            await ordered.waitForFunction(() => window.__stored?.theme === 'sage' && window.__stored?.size === 22);
            const stored = await ordered.evaluate(() => window.__stored);
            const restored = await syntheticPage(stored);
            try {
                assert.equal(await restored.locator('.model p').first().evaluate(el => getComputedStyle(el).fontSize), '22px');
                assert.equal(await restored.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--air-paper').trim()), '#f3f7ee');
            } finally {
                await restored.close();
            }
        } finally {
            await ordered.close();
        }
    });

    await check('损坏设置显式暂停并报错，可主动重置恢复', async () => {
        const corrupt = await syntheticPage({ enabled: true, theme: 'invalid' });
        assert(!(await corrupt.locator('html').evaluate(el => el.hasAttribute('data-air-active'))));
        await assertImmersiveLayout(corrupt, false);
        await panelOpen(corrupt);
        assert((await corrupt.getByRole('alert').textContent()).includes('读取失败'));
        await corrupt.getByRole('button', { name: '恢复默认', exact: true }).click();
        assert(await corrupt.locator('html').evaluate(el => el.hasAttribute('data-air-active')));
        await corrupt.getByRole('alert').waitFor({ state: 'hidden' });
        assert(await corrupt.getByRole('alert').isHidden());
        await corrupt.close();
    });

    await check('保存失败明确提示，未伪报成功', async () => {
        await production.evaluate(() => { window.__storageWriteError = '测试：存储拒绝写入'; });
        await production.getByRole('button', { name: '青苔', exact: true }).click();
        await production.waitForFunction(() => document.getElementById('air-reader-controls').shadowRoot.getElementById('reader-error').textContent.includes('存储拒绝写入'));
        assert((await production.getByRole('alert').textContent()).includes('保存失败'));
        assert((await production.getByRole('alert').textContent()).includes('存储拒绝写入'));
    });

    await check('未知回答结构明确显示未识别，不假报适配成功', async () => {
        const unknown = await syntheticPage();
        await unknown.locator('.model').evaluate(el => { el.classList.remove('model'); el.closest('ms-chat-turn').removeAttribute('data-turn-role'); });
        await panelOpen(unknown);
        assert((await unknown.getByRole('status').last().textContent()).includes('可能需要适配'));
        await unknown.close();
    });

    await verifyNativePicker({ context, check, source, fixture, scratch });
    await verifyNotes({ context, check, syntheticPage, artifactDir, scratch });

    await check('所有离线页面运行无未捕获异常、无外网请求', async () => {
        assert.deepEqual(report.errors, []);
        assert.deepEqual(report.externalRequests, []);
    });
    report.passed = true;
} catch (error) {
    report.passed = false;
    report.failure = error.stack;
    console.error(error);
    process.exitCode = 1;
} finally {
    if (context) await context.close();
    const scratchResolved = path.resolve(scratch);
    assert(path.dirname(scratchResolved) === workspace && path.basename(scratchResolved).startsWith('.offline-test-'), '临时目录必须位于本任务目录内');
    try {
        await rm(scratchResolved, { recursive: true });
        report.cleanup.removed = !existsSync(scratchResolved);
    } catch (error) {
        report.cleanup.error = error.message;
        process.exitCode = 1;
        console.error(`临时目录清理失败：${scratchResolved}\n${error.message}`);
    }
    const reportPath = path.join(artifactDir, report.passed ? 'offline-results.json' : `offline-failure-${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`验证记录：${path.relative(workspace, reportPath)}`);
}
