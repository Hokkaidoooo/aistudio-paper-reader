import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let extensionPath = path.resolve(workspace, process.env.AIR_EXTENSION_PATH || 'extension');
assert(!(process.env.AIR_EXTENSION_PATH && process.env.AIR_EXTENSION_ZIP), 'AIR_EXTENSION_PATH 与 AIR_EXTENSION_ZIP 只能设置一个');
const artifactDir = path.join(workspace, 'artifacts');
const fixtureUrl = 'https://aistudio.google.com/prompts/offline-fixture';
const fixture = await readFile(path.join(workspace, 'tests', 'fixture.html'), 'utf8');
const require = createRequire(import.meta.url);
const { chromium } = process.env.AIR_PLAYWRIGHT_MODULE
    ? require(process.env.AIR_PLAYWRIGHT_MODULE) : await import('playwright');
await mkdir(artifactDir, { recursive: true });
const scratch = await mkdtemp(path.join(workspace, '.extension-test-'));
let packageSha256;
let manifest;
let source;
const report = {
    date: new Date().toISOString(),
    checks: [], fixtureRequests: [], externalRequests: [], errors: [],
    cleanup: { path: scratch, removed: false }
};
let context;

async function check(name, action) {
    await action();
    report.checks.push(name);
    console.log(`PASS ${name}`);
}

async function waitForReader(page) {
    await page.getByRole('button', { name: '阅读设置', exact: true }).waitFor();
    assert.equal(await page.locator('#air-reader-controls').count(), 1);
}

async function inspectExtension() {
    const inspector = await context.newPage();
    try {
        await inspector.goto('chrome://extensions/');
        const extensions = await inspector.evaluate(() => chrome.developerPrivate.getExtensionsInfo({
            includeDisabled: true, includeTerminated: true
        }));
        const candidate = extensions.filter(item => item.name === 'AI Studio 纸间阅读');
        assert.equal(candidate.length, 1, '隔离配置中必须且只能加载一个纸间阅读扩展');
        assert.equal(candidate[0].state, 'ENABLED', JSON.stringify(candidate[0]));
        assert.equal(candidate[0].version, manifest.version);
        assert.equal(candidate[0].runtimeErrors?.length || 0, 0, JSON.stringify(candidate[0].runtimeErrors));
        assert.equal(candidate[0].manifestErrors?.length || 0, 0, JSON.stringify(candidate[0].manifestErrors));
        return candidate[0].id;
    } finally {
        await inspector.close();
    }
}

async function openPopup(extensionId, fixturePage) {
    const popup = await context.newPage();
    // 独立加载真实 popup 文档；活动标签保持为合成对话，消息走扩展原生 API。
    await fixturePage.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/${manifest.action.default_popup}`);
    await popup.getByRole('button', { name: '调整阅读外观', exact: true }).waitFor();
    await popup.waitForFunction(() => !document.getElementById('open-settings').disabled
        || document.getElementById('status').hasAttribute('data-error'));
    assert(!await popup.locator('#status').getAttribute('data-error'), await popup.locator('#status').textContent());
    assert.match(await popup.locator('#status').textContent(), /已连接 AI Studio/);
    assert.deepEqual(await popup.evaluate(() => window.__airCspViolations), []);
    return popup;
}

async function setTheme(page, theme) {
    await page.getByRole('button', { name: '阅读设置', exact: true }).click();
    await page.locator(`[data-theme="${theme}"]`).click();
    await page.getByRole('button', { name: '关闭阅读设置', exact: true }).click();
}

try {
    if (process.env.AIR_EXTENSION_ZIP) {
        const zipPath = path.resolve(workspace, process.env.AIR_EXTENSION_ZIP);
        const zipBytes = await readFile(zipPath);
        const files = unzipSync(zipBytes);
        assert(Object.hasOwn(files, 'manifest.json'), '最终扩展 ZIP 根目录必须包含 manifest.json');
        extensionPath = path.join(scratch, 'packaged-extension');
        for (const [name, data] of Object.entries(files)) {
            const parts = name.replace(/\/$/, '').split('/');
            assert(!name.includes('\\') && !name.includes(':') && parts.every(part => part && part !== '.' && part !== '..'), `ZIP 路径无效：${name}`);
            const target = path.join(extensionPath, ...parts);
            if (name.endsWith('/')) await mkdir(target, { recursive: true });
            else {
                await mkdir(path.dirname(target), { recursive: true });
                await writeFile(target, data);
            }
        }
        packageSha256 = createHash('sha256').update(zipBytes).digest('hex');
    }
    manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
    source = await readFile(path.join(extensionPath, 'reader.js'), 'utf8');
    assert.equal(manifest.manifest_version, 3);
    Object.assign(report, {
        version: manifest.version, sourceSha256: createHash('sha256').update(source).digest('hex'),
        extensionPath: path.relative(workspace, extensionPath), packageSha256
    });
    context = await chromium.launchPersistentContext(path.join(scratch, 'profile'), {
        executablePath: process.env.AIR_CHROMIUM_EXECUTABLE,
        channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
        acceptDownloads: true, downloadsPath: path.join(scratch, 'downloads'),
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [
            `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`,
            '--disable-background-networking', '--disable-component-update', '--disable-sync',
            '--no-first-run', '--disable-default-apps', '--proxy-server=http://127.0.0.1:9',
            '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND'
        ]
    });
    context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
    await context.addInitScript(() => {
        window.__airCspViolations = [];
        document.addEventListener('securitypolicyviolation', event => {
            window.__airCspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI });
        });
    });
    await context.route('**/*', async route => {
        if (route.request().url() === fixtureUrl) {
            report.fixtureRequests.push(route.request().url());
            await route.fulfill({
                status: 200, contentType: 'text/html; charset=utf-8', body: fixture,
                headers: { 'content-security-policy': "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'" }
            });
            return;
        }
        const url = route.request().url();
        if (url.startsWith('chrome-extension://')) {
            await route.continue();
            return;
        }
        report.externalRequests.push(url);
        await route.abort('blockedbyclient');
    });

    let extensionId;
    await check('最终 Manifest V3 扩展真实加载，无清单与运行错误', async () => {
        extensionId = await inspectExtension();
        report.extensionId = extensionId;
    });
    const page = await context.newPage();
    await check('严格 CSP 合成对话自动注入真实 content script，仅出现一个阅读入口', async () => {
        await page.goto(fixtureUrl);
        await waitForReader(page);
        assert(await page.locator('html').getAttribute('data-air-active') !== null);
        assert.equal(await page.locator('#air-reader-page-style').count(), 1);
    });

    await check('真实 popup 文档连接活动对话并通过原生消息打开阅读设置', async () => {
        const popup = await openPopup(extensionId, page);
        try {
            await popup.locator('body').screenshot({ path: path.join(artifactDir, 'extension-popup.png') });
            await popup.locator('#open-settings').evaluate(button => button.click());
            await page.getByRole('dialog', { name: '纸间阅读', exact: true }).waitFor();
            assert(await page.getByRole('dialog', { name: '纸间阅读', exact: true }).isVisible());
            await page.getByRole('button', { name: '关闭阅读设置', exact: true }).click();
        } finally {
            if (!popup.isClosed()) await popup.close();
        }
    });

    await check('chrome.storage.local 真实持久化主题，并在重载页面后恢复', async () => {
        await setTheme(page, 'night');
        const popup = await openPopup(extensionId, page);
        try {
            await popup.waitForFunction(async () => {
                const values = await chrome.storage.local.get('air-reader-settings-v1');
                return values['air-reader-settings-v1']?.theme === 'night';
            });
            const stored = await popup.evaluate(async () => chrome.storage.local.get('air-reader-settings-v1'));
            report.persistedSettings = stored['air-reader-settings-v1'];
            assert.equal(report.persistedSettings.theme, 'night');
        } finally {
            await popup.close();
        }
        await page.reload();
        await waitForReader(page);
        await page.getByRole('button', { name: '阅读设置', exact: true }).click();
        assert.equal(await page.locator('[data-theme="night"]').getAttribute('aria-pressed'), 'true');
        await page.getByRole('button', { name: '关闭阅读设置', exact: true }).click();
    });

    await check('真实 popup 打开问答并下载 UTF-8 Markdown，组件包裹表格的全部行列完整', async () => {
        const expectedTable = await page.locator('.model table').evaluate(table => {
            const rows = [...table.querySelectorAll('tr')];
            const values = rows.map(row => [...row.cells].map(cell => cell.textContent));
            for (const row of rows) {
                for (const cell of [...row.cells]) {
                    const wrapper = document.createElement('ms-cmark-node');
                    cell.replaceWith(wrapper);
                    wrapper.append(cell);
                }
                if (row.cells.length !== 0) throw new Error('组件包装没有形成零原生 cells 的回归场景');
            }
            return values;
        });
        const popup = await openPopup(extensionId, page);
        try {
            await popup.locator('#record-note').evaluate(button => button.click());
            await page.getByRole('dialog', { name: '记录问答', exact: true }).waitFor();
        } finally {
            if (!popup.isClosed()) await popup.close();
        }
        const body = await page.locator('#note-body').inputValue();
        assert(body.includes('## 我的问题') && body.includes('## AI 回答'));
        assert(body.length > 200);
        assert(await page.locator('#note-error').isHidden(), await page.locator('#note-error').textContent());
        const previewDetails = page.locator('#note-preview').locator('..');
        await previewDetails.locator('summary').click();
        await page.waitForFunction(expectedBody => {
            const root = document.getElementById('air-reader-controls').shadowRoot;
            return root.getElementById('note-preview').value.includes(expectedBody.trim());
        }, body);
        const preview = await page.locator('#note-preview').inputValue();
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#note-download').click();
        const download = await downloadPromise;
        const destination = path.join(scratch, 'downloads', download.suggestedFilename());
        await mkdir(path.dirname(destination), { recursive: true });
        await download.saveAs(destination);
        assert.equal(await download.failure(), null);
        const saved = await readFile(destination, 'utf8');
        assert.equal(saved, preview);
        assert(saved.includes(body.trim()));
        const tables = unified().use(remarkParse).use(remarkGfm).parse(saved).children.filter(node => node.type === 'table');
        assert.equal(tables.length, 1, '实际扩展下载中表格必须能被 Markdown 解析');
        const actualTable = tables[0].children.map(row => row.children.map(cell => cell.children.map(part => {
            assert.equal(part.type, 'text');
            return part.value;
        }).join('')));
        assert.deepEqual(actualTable, expectedTable, '真实扩展提取遗漏单元格或改变行列归属');
        report.table = { rows: actualTable.length, columns: actualTable[0].length, cellsMatch: true };
        assert.match(saved, /source: "https:\/\/aistudio\.google\.com\/prompts\/offline-fixture"/);
        report.download = { filename: download.suggestedFilename(), bytes: Buffer.byteLength(saved), sha256: createHash('sha256').update(saved).digest('hex') };
    });

    await check('真实原生保存选择器接收可信点击，无头取消后按钮与草稿恢复', async () => {
        const before = await page.locator('#note-body').inputValue();
        const client = await context.newCDPSession(page);
        const worlds = [];
        client.on('Runtime.executionContextCreated', ({ context: executionContext }) => worlds.push(executionContext));
        await client.send('Runtime.enable');
        const extensionWorld = worlds.find(world => world.origin === `chrome-extension://${extensionId}`
            || world.name === `chrome-extension://${extensionId}`);
        assert(extensionWorld, '必须找到最终扩展 content script 的真实隔离世界');
        const result = await client.send('Runtime.evaluate', {
            contextId: extensionWorld.id, expression: `(() => {
                window.__airNativeSave = document.defaultView.showSaveFilePicker;
                window.__airSaveClicks = [];
                document.addEventListener('click', event => {
                    if (event.composedPath()[0].id === 'note-save') window.__airSaveClicks.push({ trusted: event.isTrusted, active: navigator.userActivation.isActive });
                }, true);
                return typeof window.__airNativeSave === 'function' && window.__airNativeSave.toString().includes('[native code]');
            })()`, returnByValue: true
        });
        assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
        assert.equal(result.result.value, true, '真实扩展必须使用原生选择器');
        assert(await page.locator('#note-save').isEnabled());
        await page.locator('#note-save').click();
        await page.waitForFunction(() => {
            const root = document.getElementById('air-reader-controls').shadowRoot;
            return !root.getElementById('note-error').hidden
                || root.getElementById('note-status').textContent.includes('已取消保存');
        }, null, { timeout: 10000 });
        assert(await page.locator('#note-error').isHidden(), await page.locator('#note-error').textContent());
        assert.match(await page.locator('#note-status').textContent(), /已取消保存/);
        assert.equal(await page.locator('#note-body').inputValue(), before);
        assert(await page.locator('#note-save').isEnabled());
        const trace = await client.send('Runtime.evaluate', {
            contextId: extensionWorld.id, expression: `({ sameNative: window.__airNativeSave === document.defaultView.showSaveFilePicker, clicks: window.__airSaveClicks })`, returnByValue: true
        });
        assert(!trace.exceptionDetails, JSON.stringify(trace.exceptionDetails));
        assert.equal(trace.result.value.sameNative, true);
        assert.deepEqual(trace.result.value.clicks, [{ trusted: true, active: true }]);
        report.nativePicker = trace.result.value;
        await client.detach();
    });

    await check('真实 popup 从笔记切换阅读设置再返回，面板互斥且编辑草稿不变', async () => {
        const draft = `${await page.locator('#note-body').inputValue()}\n\n记下重点：先看标题，再回到需要的段落。`;
        await page.locator('#note-body').fill(draft);
        let popup = await openPopup(extensionId, page);
        try {
            await popup.locator('#open-settings').evaluate(button => button.click());
            await page.getByRole('dialog', { name: '纸间阅读', exact: true }).waitFor();
            assert(await page.locator('#note-dialog').isHidden());
            assert.equal(await page.locator('#note-body').inputValue(), draft);
        } finally {
            if (!popup.isClosed()) await popup.close();
        }
        popup = await openPopup(extensionId, page);
        try {
            await popup.locator('#record-note').evaluate(button => button.click());
            await page.getByRole('dialog', { name: '记录问答', exact: true }).waitFor();
            assert(await page.getByRole('dialog', { name: '纸间阅读', exact: true }).isHidden());
            assert.equal(await page.locator('#note-body').inputValue(), draft);
        } finally {
            if (!popup.isClosed()) await popup.close();
        }
    });

    await check('真实对话路径切换恢复原站，再返回时保留编辑草稿与来源', async () => {
        const draft = `${await page.locator('#note-body').inputValue()}\n\n阅读偏好：晚上使用夜读主题。`;
        await page.locator('#note-body').fill(draft);
        await page.evaluate(() => { history.pushState(null, '', '/apps'); document.body.append(document.createElement('span')); });
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-air-active'));
        assert(await page.getByRole('button', { name: '阅读设置', exact: true }).isHidden());
        await page.evaluate(() => history.pushState(null, '', '/prompts/offline-fixture-next'));
        // 路由观察器由真实 DOM 变化唤醒，不注入扩展监听或虚构响应。
        await page.evaluate(() => document.body.append(document.createElement('span')));
        await page.waitForFunction(() => document.documentElement.hasAttribute('data-air-active'));
        assert(await page.locator('#note-dialog').isVisible());
        assert.equal(await page.locator('#note-body').inputValue(), draft);
        await page.getByRole('button', { name: '关闭记录', exact: true }).click();
        await page.getByRole('button', { name: '阅读设置', exact: true }).click();
        await page.locator('#reader-record').click();
        assert.equal(await page.locator('#note-body').inputValue(), draft);
        assert.equal(await page.locator('#note-answer').inputValue(), '');
        if (!await page.locator('#note-preview').isVisible()) await page.locator('#note-preview').locator('..').locator('summary').click();
        assert.match(await page.locator('#note-preview').inputValue(), /source: "https:\/\/aistudio\.google\.com\/prompts\/offline-fixture"/);
    });

    await check('合成桌面与窄屏扩展面板真实渲染，全部控件可触达', async () => {
        if (await page.locator('#note-preview').isVisible()) await page.locator('#note-preview').locator('..').locator('summary').click();
        await page.locator('#note-dialog').evaluate(element => { element.scrollTop = 0; });
        await page.locator('#note-body').evaluate(element => { element.scrollTop = 0; });
        await page.screenshot({ path: path.join(artifactDir, 'extension-note-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.locator('#note-answer').isVisible());
        await page.locator('#note-dialog').evaluate(element => { element.scrollTop = 0; });
        await page.screenshot({ path: path.join(artifactDir, 'extension-note-mobile-top.png') });
        await page.locator('#note-download').scrollIntoViewIfNeeded();
        assert(await page.locator('#note-download').isVisible());
        const geometry = await page.locator('#note-dialog').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        });
        assert(geometry.left >= 0 && geometry.right <= 390, JSON.stringify(geometry));
        assert(geometry.scrollWidth <= geometry.clientWidth, JSON.stringify(geometry));
        await page.screenshot({ path: path.join(artifactDir, 'extension-note-mobile.png') });
        report.mobilePanel = geometry;
    });

    await check('严格 CSP 零违规，扩展无未捕获异常，Google 与其它外网请求为零', async () => {
        assert.deepEqual(await page.evaluate(() => window.__airCspViolations), []);
        assert.deepEqual(report.errors, []);
        assert.deepEqual(report.externalRequests, []);
        assert(report.fixtureRequests.length >= 2);
        assert.equal(await inspectExtension(), extensionId);
    });
    report.passed = true;
} catch (error) {
    report.passed = false;
    report.failure = error.stack;
    console.error(error);
    process.exitCode = 1;
} finally {
    let browserClosed = !context;
    if (context) {
        try { await context.close(); browserClosed = true; }
        catch (error) { report.cleanup.closeError = error.message; console.error(error); process.exitCode = 1; }
    }
    try {
        assert(browserClosed, '浏览器关闭失败，保留本轮临时目录');
        const actualWorkspace = await realpath(workspace);
        const actualScratch = await realpath(scratch);
        const relative = path.relative(actualWorkspace, actualScratch);
        assert(!relative.startsWith('..') && !path.isAbsolute(relative) && path.dirname(relative) === '.'
            && path.basename(actualScratch).startsWith('.extension-test-'), '临时目录必须在工作区内且属于本次验证');
        await rm(actualScratch, { recursive: true });
        report.cleanup.removed = !existsSync(actualScratch);
    } catch (error) {
        report.cleanup.error = error.message;
        console.error(`临时目录保留：${scratch}；${error.message}`);
        process.exitCode = 1;
    }
    const rendered = JSON.stringify(report, null, 2) + '\n';
    await writeFile(path.join(artifactDir, 'extension.json'), rendered, 'utf8');
    if (!report.passed) await writeFile(path.join(artifactDir, `extension-failure-${Date.now()}.json`), rendered, 'utf8');
    console.log('验证记录：artifacts/extension.json');
}
