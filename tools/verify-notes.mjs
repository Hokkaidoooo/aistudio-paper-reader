import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createMarkdownHarness } from '../tests/render-markdown.mjs';

const ids = {
    dialog: '#note-dialog', answer: '#note-answer',
    title: '#note-title', format: '#note-format', description: '#note-description',
    category: '#note-category', tags: '#note-tags', source: '#note-source',
    body: '#note-body', save: '#note-save', download: '#note-download',
    status: '#note-status', error: '#note-error', warning: '#note-warning'
};

async function withRenderedMarkdown(context, harness, file, action) {
    const parsed = harness.parse(file.text);
    const rendered = await harness.renderer.render(parsed.body, { frontmatter: parsed.metadata });
    const page = await context.newPage();
    try {
        await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">' + '<style>' + rendered.css + '</style>' + rendered.code);
        await action(page, parsed);
    } finally {
        await page.close();
    }
}

async function openNotes(page) {
    const launcher = page.getByRole('button', { name: '阅读设置', exact: true });
    if (await launcher.getAttribute('aria-expanded') !== 'true') await launcher.click();
    await page.locator('#reader-record').click();
    await page.locator(ids.dialog).waitFor({ state: 'visible' });
}

async function replaceConversation(page) {
    await page.evaluate(() => {
        const node = (tag, text = '', attrs = {}) => {
            const result = document.createElement(tag);
            result.textContent = text;
            for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
            return result;
        };
        const turn = (role, content) => {
            const result = node('ms-chat-turn', '', { 'data-turn-role': role });
            const box = node('div', '', { class: 'chat-turn-container ' + role.toLowerCase() });
            box.append(node('div', '角色工具条不要收录', { class: 'turn-information' }), content);
            box.append(node('div', '复制按钮不要收录', { class: 'actions-container' }));
            result.append(box);
            return result;
        };
        const content = () => node('div', '', { class: 'turn-content' });
        const math = (tex, block) => {
            const wrapper = node('ms-katex', '', { class: block ? 'katex-display' : 'inline' });
            const rendered = node('span', '视觉层不要重复收录', { class: 'katex-html' });
            const annotation = node('annotation', tex, { encoding: 'application/x-tex' });
            const mathml = node('span', '', { class: 'katex-mathml' });
            mathml.append(annotation);
            wrapper.append(rendered, mathml);
            return wrapper;
        };
        const question = content();
        question.textContent = '第一对问题：怎样检查选择是否准确？';
        const first = content();
        first.append(node('ms-text-chunk', '第一对回答，仅用于检查选择。'));
        const secondQuestion = content();
        secondQuestion.append(node('p', '第二对问题：嵌套容器应该计为几次？'));
        const simpleSecond = content();
        simpleSecond.append(node('ms-text-chunk', '第二对回答：同一条消息只计一次。'));
        const thirdQuestion = node('ms-prompt-chunk');
        const questionMarkdown = node('ms-cmark-node');
        questionMarkdown.append(node('p', '第三对问题：请保留数学与代码，并说明以下条件。'));
        const questionConditions = node('ul');
        questionConditions.append(node('li', '条件甲需要完整保留'), node('li', '条件乙需要完整保留'));
        questionMarkdown.append(questionConditions);
        thirdQuestion.append(questionMarkdown);
        const second = content();
        const thoughts = node('ms-thought-chunk', '私密思考不要收录');
        thoughts.prepend(node('h2', '私密思考标题不要收录'));
        second.append(thoughts);
        const chunk = node('ms-text-chunk');
        const markdown = node('ms-cmark-node');
        markdown.append(node('h2', '第三对：数学与代码'));
        const paragraph = node('p', '正文只属于第三对。');
        paragraph.append(node('strong', '粗体重点'), '，', node('em', '斜体片段'), '，');
        paragraph.append(node('a', '参考资料', { href: 'https://example.org/reference?q=1&x=2' }));
        paragraph.append('，', node('code', 'a`b'), '。原文 <script>alert(1)</script>，价格 $5。');
        markdown.append(paragraph);
        const sentence = node('p', '行内公式 ');
        sentence.append(math('x^2 + y^2 = 1', false), ' 结束。');
        markdown.append(sentence, math('\\int_0^1 x^2\\,dx = \\frac13', true));
        const block = node('ms-code-block');
        block.append(node('div', '复制代码不要收录', { class: 'code-block-header' }));
        const pre = node('pre');
        pre.append(node('code', 'function keepIndent() {\n    return "```";\n}\n', { class: 'language-javascript' }));
        block.append(pre);
        markdown.append(block);
        const list = node('ol', '', { start: '3' });
        const item = node('li', '第三步');
        const nested = node('ul');
        nested.append(node('li', '嵌套项目'));
        item.append(nested);
        const itemWrapper = node('ms-cmark-node');
        itemWrapper.append(item);
        list.append(itemWrapper, node('li', '第四步'));
        markdown.append(list);
        const tasks = node('ul');
        const task = node('li');
        const checkbox = node('input', '', { type: 'checkbox' });
        checkbox.checked = true;
        task.append(checkbox, '已复习的知识点');
        tasks.append(task);
        markdown.append(tasks);
        const quote = node('blockquote');
        quote.append(node('p', '值得记住的一句话。'));
        markdown.append(quote);
        const table = node('table');
        const header = node('tr');
        header.append(node('th', '项目'), node('th', '内容'));
        const row = node('tr');
        row.append(node('td', '含管道'), node('td', 'a | b'));
        table.append(header, row);
        markdown.append(table);
        chunk.append(markdown);
        chunk.prepend(thoughts);
        second.append(chunk);
        const nestedSecond = turn('Model', simpleSecond);
        nestedSecond.removeAttribute('data-turn-role');
        const innerBox = node('div', '', { class: 'chat-turn-container model' });
        innerBox.append(...nestedSecond.firstElementChild.childNodes);
        nestedSecond.firstElementChild.append(innerBox);
        const thoughtContent = content();
        thoughtContent.append(node('ms-thoughts', '独立思考消息不要收录'));
        const thirdModel = turn('Model', second);
        const thirdBox = thirdModel.firstElementChild;
        second.replaceChildren(node('header', 'Model 9:25 PM'));
        thirdBox.append(chunk);
        const continuation = content();
        continuation.append(node('ms-text-chunk', '第三对回答的后续分块，也要保留且仅出现一次。'));
        document.querySelector('ms-autoscroll-container').replaceChildren(
            turn('User', question), turn('Model', first), turn('User', secondQuestion), nestedSecond,
            turn('User', thirdQuestion), turn('Model', thoughtContent), thirdModel, turn('Model', continuation)
        );
    });
}

async function replaceMessageSequence(page, messages) {
    await page.evaluate(messages => {
        const node = (tag, text = '', attrs = {}) => {
            const result = document.createElement(tag);
            result.textContent = text;
            for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
            return result;
        };
        const turns = messages.map(({ role, text = '', kind = 'body' }) => {
            const turn = node('ms-chat-turn', '', { 'data-turn-role': role });
            const box = node('div', '', { class: 'chat-turn-container ' + role });
            const content = node('div', '', { class: 'turn-content' });
            const chunk = node('ms-text-chunk');
            const markdown = node('ms-cmark-node');
            markdown.append(node('p', text));
            chunk.append(markdown);
            if (kind === 'plain-user') {
                content.textContent = text;
            } else if (kind === 'thought' || kind === 'thought-with-unknown-body') {
                const thoughts = node('ms-thoughts');
                thoughts.append(chunk);
                content.append(thoughts);
                if (kind === 'thought-with-unknown-body') {
                    const unknown = node('section', '尚未识别结构的实际回答不可静默丢失', { class: 'unknown-answer-shape' });
                    box.append(unknown);
                }
            } else {
                if (kind === 'header-and-body') {
                    const header = node('header');
                    header.append(node('span', 'Model'), node('time', '9:25 PM'));
                    content.append(header);
                }
                content.append(chunk);
            }
            box.append(content);
            turn.append(box);
            return turn;
        });
        document.querySelector('ms-autoscroll-container').replaceChildren(...turns);
    }, messages);
}

async function verifyCitations({ context, check, syntheticPage, artifactDir, scratch }) {
    const page = await syntheticPage(null, '/prompts/citation-fixture');
    const tex = '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}';
    const rawCode = 'const cite = "\\[1\\]";\nconst formula = "$a & b$";\n';
    let file;
    try {
        await replaceMessageSequence(page, [
            { role: 'User', text: '请说明引用编号 [1] 和符号 R&D。' },
            { role: 'Model', text: '引用说明' }
        ]);
        await page.locator('ms-chat-turn[data-turn-role="Model"] .turn-content').evaluate((content, { tex, rawCode }) => {
            const node = (tag, text = '', attributes = {}) => {
                const result = document.createElement(tag);
                result.textContent = text;
                for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value);
                return result;
            };
            const markdown = node('ms-cmark-node');
            markdown.append(node('h1', '引用与公式'));
            const paragraph = node('p', '资料中的 R&D 可参见 ');
            paragraph.append(document.createTextNode('['), node('a', '1', { href: 'https://example.org/?a=1&b=2' }), document.createTextNode(']。字面括号 [2] 也应保留。'));
            markdown.append(paragraph, node('ms-katex', '', { class: 'katex-display', 'data-tex': tex }));
            const pre = node('pre');
            pre.append(node('code', rawCode));
            markdown.append(pre);
            const chunk = node('ms-text-chunk');
            chunk.append(markdown);
            content.replaceChildren(chunk);
        }, { tex, rawCode });
        await check('引用外层括号导出为字面实体，链接参数、真公式与代码原文完整', async () => {
            await openNotes(page);
            assert(await page.locator(ids.error).isHidden());
            assert(await page.locator(ids.warning).isHidden());
            const body = await page.locator(ids.body).inputValue();
            assert(body.includes('&#91;[1](<https://example.org/?a=1&b=2>)&#93;'));
            assert(body.includes('字面括号 &#91;2&#93;'));
            assert(body.includes('R&amp;D'));
            assert(body.includes(`$$\n${tex}\n$$`));
            assert(body.includes(rawCode));
            const prose = body.slice(0, body.indexOf('$$'));
            assert(!prose.includes('\\[') && !prose.includes('\\]'), '引用被重新写成 Typora 公式边界');
            file = await downloadMarkdown(page, scratch, 'citation-export.md');
            assert(file.text.includes('&#91;[1](<https://example.org/?a=1&b=2>)&#93;'));
            assert.equal(await page.locator(ids.title).inputValue(), '引用与公式');
            await page.setViewportSize({ width: 1280, height: 900 });
            await page.screenshot({ path: path.join(artifactDir, '引用导出面板.png') });
        });
        await check('引用 Markdown 实际渲染为可点击编号，只有真公式进入数学渲染且无错误', async () => {
            await withRenderedMarkdown(context, createMarkdownHarness(), file, async rendered => {
                const citation = rendered.locator('a[href="https://example.org/?a=1&b=2"]');
                assert.equal(await citation.count(), 1);
                assert.equal(await citation.textContent(), '1');
                assert((await rendered.locator('body').textContent()).includes('R&D 可参见 [1]。字面括号 [2] 也应保留。'));
                assert.equal(await rendered.locator('.katex-display').count(), 1);
                assert.equal(await rendered.locator('.katex').count(), 1);
                assert.equal(await rendered.locator('.katex-error, mjx-merror, merror').count(), 0);
                assert.deepEqual(await rendered.locator('annotation[encoding="application/x-tex"]').allTextContents(), [tex]);
                assert.equal((await rendered.locator('pre code').textContent()).replace(/\n$/, ''), rawCode.replace(/\n$/, ''));
                await rendered.setViewportSize({ width: 1280, height: 720 });
                await rendered.addStyleTag({ content: 'body { max-width: 840px; margin: 48px auto; padding: 24px; font: 18px/1.8 "Segoe UI", sans-serif; color: #343c36; background: #faf7ef; } pre { padding: 20px; background: #eeeee3; } a { color: #386981; }' });
                await rendered.screenshot({ path: path.join(artifactDir, '引用实际渲染.png') });
            });
        });
        await check('自动标题恢复正文括号与 HTML 字面字符，仅解码一层实体', async () => {
            const title = '字面标题 [1] & <标签> &amp;';
            await page.locator('ms-chat-turn[data-turn-role="Model"] h1').evaluate((heading, title) => { heading.textContent = title; }, title);
            await page.locator('#note-close').click();
            await openNotes(page);
            assert.equal(await page.locator(ids.title).inputValue(), title);
            const result = await downloadMarkdown(page, scratch, 'literal-heading-title.md');
            assert.equal(createMarkdownHarness().parse(result.text).metadata.title, title);
            assert(result.text.includes('# 字面标题 &#91;1&#93; &amp; &lt;标签&gt; &amp;amp;'));
        });
    } finally {
        await page.close();
    }
}

async function installPicker(page, mode = 'success') {
    await page.evaluate(mode => {
        window.__noteSaved = '';
        window.__notePickerCalls = [];
        window.__notePickerReceivers = [];
        window.__notePickerActivations = [];
        window.__notePermissionCalls = [];
        window.__noteFileCalls = [];
        window.__noteFiles = new Map();
        window.__noteWriterClosed = false;
        window.__noteWriterAborted = false;
        window.__noteReadbacks = 0;
        window.showDirectoryPicker = async function(options) {
            window.__notePickerCalls.push(options);
            const correctReceiver = this === document.defaultView;
            window.__notePickerReceivers.push(correctReceiver);
            window.__notePickerActivations.push(navigator.userActivation.isActive);
            if (!correctReceiver) throw new TypeError("Failed to execute 'showDirectoryPicker' on 'Window': Illegal invocation");
            if (mode === 'cancel') throw new DOMException('测试：用户取消选择', 'AbortError');
            if (mode === 'denied') throw new DOMException('测试：目录权限被拒绝', 'NotAllowedError');
            const directory = {
                kind: 'directory',
                name: '测试笔记目录',
                requestPermission: async options => {
                    window.__notePermissionCalls.push({ options, active: navigator.userActivation.isActive });
                    return mode === 'permission-denied' ? 'denied' : 'granted';
                },
                getFileHandle: async (name, { create = false } = {}) => {
                    window.__noteFileCalls.push({ name, create });
                    if (!window.__noteFiles.has(name)) {
                        if (!create) throw new DOMException('测试：文件不存在', 'NotFoundError');
                        window.__noteFiles.set(name, '');
                    }
                    return {
                        kind: 'file', name,
                        createWritable: async () => ({
                            write: async value => {
                                if (mode === 'write-failure') throw new Error('测试：磁盘写入失败');
                                window.__noteSaved = typeof value === 'string' ? value : await value.text();
                            },
                            close: async () => {
                                if (mode === 'close-failure') throw new Error('测试：文件关闭失败');
                                window.__noteWriterClosed = true;
                                window.__noteFiles.set(name, window.__noteSaved);
                            },
                            abort: async () => { window.__noteWriterAborted = true; }
                        }),
                        getFile: async () => {
                            window.__noteReadbacks++;
                            if (mode === 'readback-failure') throw new Error('测试：文件回读失败');
                            return new File(
                                [mode === 'readback-mismatch' ? '测试：写回内容不一致' : window.__noteFiles.get(name)],
                                name, { type: 'text/markdown' }
                            );
                        }
                    };
                }
            };
            window.__noteSelectedDirectory = directory;
            return directory;
        };
    }, mode);
}

async function chooseDirectory(page) {
    await page.locator(ids.save).click();
    await page.waitForFunction(() => {
        const root = document.querySelector('#air-reader-controls').shadowRoot;
        return root.querySelector('.note-destination').textContent.includes('测试笔记目录')
            && !root.querySelector('#note-save').disabled;
    });
}

async function saveToSelectedDirectory(page) {
    const readbacks = await page.evaluate(() => window.__noteReadbacks);
    await page.locator(ids.download).click();
    await page.waitForFunction(before => {
        const root = document.querySelector('#air-reader-controls').shadowRoot;
        return window.__noteReadbacks > before
            && root.querySelector('#note-status').textContent.includes('已保存并核对')
            && !root.querySelector('#note-save').disabled;
    }, readbacks);
}

async function installNativeDirectory(page, groupName) {
    await page.evaluate(async groupName => {
        const root = await navigator.storage.getDirectory();
        const group = await root.getDirectoryHandle(groupName, { create: true });
        const directory = await group.getDirectoryHandle('测试笔记目录', { create: true });
        window.__nativeNoteDirectory = directory;
        window.__nativeNoteCreates = 0;
        window.__nativeNotePickerCalls = [];
        window.__nativeNotePermissions = [];
        const selected = {
            kind: directory.kind, name: directory.name,
            requestPermission: async options => {
                window.__nativeNotePermissions.push({ options, active: navigator.userActivation.isActive });
                return directory.requestPermission(options);
            },
            getFileHandle: async (name, options) => {
                const handle = await directory.getFileHandle(name, options);
                if (options?.create) window.__nativeNoteCreates++;
                return handle;
            }
        };
        window.showDirectoryPicker = async function(options) {
            if (this !== document.defaultView) throw new TypeError('测试：目录选择接收对象错误');
            window.__nativeNotePickerCalls.push({ id: options.id, mode: options.mode, active: navigator.userActivation.isActive });
            return selected;
        };
        const NativeDate = Date;
        const fixedTime = NativeDate.parse('2026-11-23T12:34:56+08:00');
        window.Date = class extends NativeDate {
            constructor(...args) { super(...(args.length ? args : [fixedTime])); }
            static now() { return fixedTime; }
        };
    }, groupName);
}

async function nativeDirectoryFiles(page) {
    return page.evaluate(async () => {
        const files = [];
        for await (const [name, handle] of window.__nativeNoteDirectory) {
            if (handle.kind === 'file') files.push({ name, text: await (await handle.getFile()).text() });
        }
        return files.sort((a, b) => a.name.localeCompare(b.name));
    });
}

async function saveNativeDirectory(page) {
    const creates = await page.evaluate(() => window.__nativeNoteCreates);
    await page.locator(ids.download).click();
    await page.waitForFunction(before => {
        const root = document.querySelector('#air-reader-controls').shadowRoot;
        return window.__nativeNoteCreates > before
            && root.querySelector('#note-status').textContent.includes('已保存并核对')
            && !root.querySelector('#note-save').disabled;
    }, creates);
}

async function verifyDirectoryWrites({ check, syntheticPage, artifactDir }) {
    await check('原生目录选择一次后连续直写，重名文件与子目录保留，关闭重开及取消选择仍使用原目录', async () => {
        const page = await syntheticPage(null, '/prompts/native-directory', { wrappedWindow: true, secureOrigin: true });
        const downloads = [];
        page.on('download', download => downloads.push(download));
        try {
            await installNativeDirectory(page, `目录直写-${Date.now()}`);
            await openNotes(page);
            await page.locator(ids.title).fill('目录直写笔记');
            await page.locator(ids.body).fill('首份笔记的原生文件内容。');
            await chooseDirectory(page);
            assert.equal((await nativeDirectoryFiles(page)).length, 0, '选择位置时已写入文件');
            await saveNativeDirectory(page);
            const first = (await nativeDirectoryFiles(page))[0];
            assert(first.text.includes('首份笔记的原生文件内容。'));
            await page.evaluate(async name => {
                await window.__nativeNoteDirectory.getDirectoryHandle(name.slice(0, -3) + ' (2).md', { create: true });
            }, first.name);
            await page.locator(ids.body).fill('第二份笔记的原生文件内容。');
            await saveNativeDirectory(page);
            const second = await nativeDirectoryFiles(page);
            assert.equal(second.length, 2);
            assert.equal(second.find(file => file.name === first.name).text, first.text, '同名导出覆盖了已有文件');
            assert(second.some(file => / \(3\)\.md$/.test(file.name) && file.text.includes('第二份笔记的原生文件内容。')), '同名子目录未被跳过');
            await page.locator('#note-close').click();
            await openNotes(page);
            assert.match(await page.locator('.note-destination').first().textContent(), /测试笔记目录/);
            await page.evaluate(() => {
                window.showDirectoryPicker = async options => {
                    window.__nativeCancelledStartIn = options.startIn.name;
                    throw new DOMException('测试：取消更改目录', 'AbortError');
                };
            });
            await page.locator(ids.save).click();
            await page.waitForFunction(() => document.querySelector('#air-reader-controls').shadowRoot.querySelector('#note-status').textContent.includes('已取消选择'));
            assert.equal(await page.evaluate(() => window.__nativeCancelledStartIn), '测试笔记目录');
            await page.evaluate(() => {
                window.__testLocation.pathname = '/prompts/native-directory-other';
                document.body.append(document.createElement('span'));
            });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
            assert.match(await page.locator('.note-destination').first().textContent(), /测试笔记目录/);
            await page.locator(ids.title).fill('重开后继续直写');
            await page.locator(ids.body).fill('关闭重开后仍写入原目录。');
            await saveNativeDirectory(page);
            const final = await nativeDirectoryFiles(page);
            assert.equal(final.length, 3);
            assert(final.some(file => file.text.includes('关闭重开后仍写入原目录。')));
            assert.equal(await page.evaluate(() => window.__nativeNotePickerCalls.length), 1, '后续下载重复打开目录选择器');
            assert.deepEqual(await page.evaluate(() => window.__nativeNotePermissions), [
                { options: { mode: 'readwrite' }, active: true },
                { options: { mode: 'readwrite' }, active: true },
                { options: { mode: 'readwrite' }, active: true }
            ]);
            assert.equal(downloads.length, 0, '目录直写产生了浏览器默认下载');
            await page.locator(ids.download).scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(artifactDir, '选择目录直接下载.png') });
        } finally {
            await page.close();
        }
    });

    await check('两个安全页面同时导出同名笔记时串行分配文件名，原生文件分别保留完整正文', async () => {
        const pages = await Promise.all([
            syntheticPage(null, '/prompts/concurrent-directory-a', { secureOrigin: true }),
            syntheticPage(null, '/prompts/concurrent-directory-b', { secureOrigin: true })
        ]);
        const downloads = [];
        for (const page of pages) page.on('download', download => downloads.push(download));
        try {
            const groupName = `并发目录-${Date.now()}`;
            for (const [index, page] of pages.entries()) {
                await installNativeDirectory(page, groupName);
                await openNotes(page);
                await page.locator(ids.title).fill('并发同名笔记');
                await page.locator(ids.body).fill(`并发笔记${index + 1}的完整正文。`);
                await chooseDirectory(page);
            }
            await Promise.all(pages.map(page => saveNativeDirectory(page)));
            const files = await nativeDirectoryFiles(pages[0]);
            assert.equal(files.length, 2, '并发导出丢失文件或覆盖同名文件');
            assert.equal(files.filter(file => / \(2\)\.md$/.test(file.name)).length, 1, '并发导出未分配编号副本');
            assert(files.some(file => file.text.includes('并发笔记1的完整正文。')));
            assert(files.some(file => file.text.includes('并发笔记2的完整正文。')));
            assert.equal(downloads.length, 0);
        } finally {
            await Promise.all(pages.map(page => page.close()));
        }
    });

    await check('目录授权等待期间禁用操作并拒绝重复点击，授权完成后仅写入一个文件', async () => {
        const page = await syntheticPage(null, '/prompts/directory-busy', { localFile: true });
        try {
            await installPicker(page);
            await openNotes(page);
            await chooseDirectory(page);
            await page.evaluate(() => {
                window.__noteSelectedDirectory.requestPermission = options => {
                    window.__notePermissionCalls.push({ options, active: navigator.userActivation.isActive });
                    return new Promise(resolve => { window.__releaseNotePermission = () => resolve('granted'); });
                };
            });
            await page.locator(ids.download).click();
            await page.waitForFunction(() => typeof window.__releaseNotePermission === 'function');
            assert(await page.locator(ids.save).isDisabled());
            assert.equal(await page.locator(ids.download).getAttribute('aria-disabled'), 'true');
            await page.locator(ids.download).evaluate(anchor => anchor.click());
            assert.equal(await page.evaluate(() => window.__notePermissionCalls.length), 1, '忙状态重复请求写入授权');
            await page.evaluate(() => window.__releaseNotePermission());
            await page.waitForFunction(() => document.querySelector('#air-reader-controls').shadowRoot.querySelector('#note-status').textContent.includes('已保存并核对'));
            assert.equal(await page.evaluate(() => window.__noteFileCalls.filter(call => call.create).length), 1);
            assert(await page.locator(ids.save).isEnabled());
            assert.equal(await page.locator(ids.download).getAttribute('aria-disabled'), 'false');
        } finally {
            await page.close();
        }
    });
}

async function downloadMarkdown(page, scratch, name) {
    const pending = page.waitForEvent('download');
    await page.locator(ids.download).click();
    const download = await pending;
    assert.equal(await download.failure(), null, 'Markdown 下载失败');
    assert.match(download.suggestedFilename(), /\.md$/i);
    const savedPath = path.join(scratch, name);
    await download.saveAs(savedPath);
    const bytes = await readFile(savedPath);
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert(bytes.length > 0, '真实下载的 Markdown 文件为空');
    return { text: body, filename: download.suggestedFilename() };
}

async function noteDraft(page) {
    return page.locator(ids.dialog).evaluate(dialog => {
        const root = dialog.getRootNode();
        return Object.fromEntries([
            'note-answer', 'note-title', 'note-format', 'note-description', 'note-category',
            'note-tags', 'note-source', 'note-body', 'note-preview'
        ].map(id => {
            const control = root.getElementById(id);
            return [id, control.type === 'checkbox' ? control.checked : control.value];
        }));
    });
}

async function wrappedTableFixture(page, kind, selector = '.model .turn-content') {
    return page.locator(selector).first().evaluate((content, kind) => {
        const node = (tag, text = '', attrs = {}) => {
            const result = document.createElement(tag);
            result.textContent = text;
            for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
            return result;
        };
        const wrap = child => {
            const component = node('ms-cmark-node');
            component.append(child);
            return component;
        };
        const row = (cells, directFirst = false) => {
            const result = node('tr');
            result.append(...cells.map((cell, index) => directFirst && index === 0 ? cell : wrap(cell)));
            return result;
        };
        const math = (tex, display = false) => {
            const result = node('ms-katex', '', { class: display ? 'katex-display' : 'inline' });
            result.append(node('annotation', tex, { encoding: 'application/x-tex' }));
            return result;
        };
        const table = node('table');
        table.append(wrap(node('caption', '包装表格唯一标题')));
        const headerless = kind === 'headerless';
        if (kind === 'simple' || headerless) {
            const heading = node(headerless ? 'tbody' : 'thead');
            heading.append(wrap(row(['层级', '核心概念', '示例'].map(text => node(headerless ? 'td' : 'th', text)))));
            const body = node('tbody');
            const strong = node('td');
            strong.append(wrap(node('strong', '商品经济唯一重点')));
            const reference = node('td');
            reference.append(wrap(node('a', '参考资料唯一链接', { href: 'https://example.org/tables?q=1&lang=zh' })));
            body.append(wrap(row([node('td', 'L1 唯一层级'), strong, reference], true)));
            const formula = node('td');
            formula.append(wrap(math('x + y = 2')));
            body.append(wrap(row([node('td', 'L2 唯一层级'), node('td', 'a | b'), formula])));
            table.append(wrap(heading), wrap(body));
        } else if (kind === 'multiline-lists') {
            const header = row(['比较维度', '方案甲', '方案乙', '说明'].map(text => node('th', text)));
            const ordinary = node('td');
            const bullets = node('ul');
            const first = node('li');
            const firstParagraph = node('p', '普通列表唯一首项：');
            firstParagraph.append(wrap(node('strong', '列表唯一粗体')));
            first.append(wrap(firstParagraph));
            const second = node('li');
            second.append(wrap(node('p', '普通列表唯一次项')), wrap(node('p', '条目续段唯一说明')));
            const nested = node('ul');
            nested.append(wrap(node('li', '嵌套列表唯一子项')));
            second.append(wrap(nested));
            bullets.append(wrap(first), wrap(second));
            ordinary.append(wrap(bullets));
            const numbered = node('td');
            const ordered = node('ol', '', { start: '3' });
            for (const text of ['有序列表唯一首项', '有序列表唯一次项']) {
                const item = node('li');
                item.append(wrap(node('p', text)));
                ordered.append(wrap(item));
            }
            numbered.append(wrap(ordered));
            const explanation = node('td');
            const paragraph = node('p', '换行唯一上段');
            const inlineFormula = node('ms-katex', '', { class: 'inline' });
            const formulaPre = node('pre');
            const formulaCode = node('code', '', { class: 'rendered' });
            const katex = node('span', '', { class: 'katex' });
            const sourceMath = node('math', '', { hidden: '' });
            const semantics = node('semantics');
            semantics.append(node('annotation', 'a + b = c', { encoding: 'application/x-tex' }));
            sourceMath.append(semantics);
            katex.append(node('span', '公式视觉副本不可重复导出', { class: 'katex-html' }), sourceMath);
            formulaCode.append(katex);
            formulaPre.append(formulaCode);
            inlineFormula.append(formulaPre);
            paragraph.append(node('br'), '换行唯一下段 ', wrap(inlineFormula), ' [');
            paragraph.append(wrap(node('a', '四列表唯一引用甲', { href: 'https://example.org/multiline?lang=zh&q=table' })), ']');
            explanation.append(wrap(paragraph));
            const secondListCell = node('td');
            const secondList = node('ul');
            secondList.append(wrap(node('li', '第二行列表唯一甲')), wrap(node('li', '第二行列表唯一乙')));
            secondListCell.append(wrap(secondList));
            const paragraphs = node('td');
            paragraphs.append(wrap(node('p', '独立段落唯一甲')), wrap(node('p', '独立段落唯一乙')));
            const secondExplanation = node('td');
            secondExplanation.append(wrap(node('strong', '第二行唯一重点')), ' [');
            secondExplanation.append(wrap(node('a', '四列表唯一引用乙', { href: 'https://example.org/notes?section=2&lang=zh' })), ']');
            const body = node('tbody');
            body.append(wrap(row([node('td', '第一项唯一维度'), ordinary, numbered, explanation])));
            body.append(wrap(row([node('td', '第二项唯一维度'), secondListCell, paragraphs, secondExplanation], true)));
            table.append(wrap(header), wrap(body));
        } else if (kind === 'complex') {
            const header = row([node('th', '外表代码唯一标题', { colspan: '2' })]);
            const code = node('td');
            const pre = node('pre');
            pre.append(node('code', 'const retained = "\\\\|x\\\\|";\n\nconsole.log(retained);\n', { class: 'language-javascript' }));
            code.append(wrap(pre));
            const nestedCell = node('td');
            nestedCell.append(wrap(math('\\left\\|x\\right\\| = 1', true)));
            const nested = node('table');
            nested.append(wrap(row([node('th', '内表唯一列甲'), node('th', '内表唯一列乙')])));
            nested.append(wrap(row([node('td', '内表唯一数据甲'), node('td', '内表唯一数据乙')])));
            nestedCell.append(wrap(nested));
            table.append(wrap(header), wrap(row([code, nestedCell])));
        } else if (kind === 'no-rows') {
            table.append(wrap(node('p', '无行表格正文不可丢失')));
        } else if (kind === 'no-cells') {
            const broken = node('tr');
            broken.append(wrap(node('p', '零单元格行正文不可丢失')));
            table.append(wrap(broken));
        } else {
            table.append(wrap(row([node('td', '已识别单元格甲'), node('td', '已识别单元格乙')])));
            table.append(wrap(node(kind === 'orphan-cell' ? 'td' : 'p', '表内未归属正文不可丢失')));
        }
        const chunk = node('ms-text-chunk');
        const markdown = node('ms-cmark-node');
        markdown.append(node('h2', '表格提取验证'), wrap(table));
        chunk.append(markdown);
        content.replaceChildren(chunk);
        // DOM API 保留组件层级；HTML 字符串解析会提前修正表格，无法复现实际缺陷。
        return [...table.querySelectorAll('tr')].filter(value => value.closest('table') === table).map(value => ({
            nativeCells: value.cells.length,
            descendants: value.querySelectorAll('th, td').length
        }));
    }, kind);
}

async function questionInputFixture(page, questions) {
    await page.evaluate(questions => {
        const node = (tag, attrs = {}, text = '') => {
            const result = document.createElement(tag);
            for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
            result.textContent = text;
            return result;
        };
        const input = (id, value, attrs = {}, initialText = '') => {
            const field = node('textarea', { id, ...attrs }, initialText);
            field.value = value;
            return field;
        };
        const turn = (role, content) => {
            const message = node('ms-chat-turn', { 'data-turn-role': role });
            const box = node('div', { class: 'chat-turn-container ' + role.toLowerCase() });
            box.append(content);
            message.append(box);
            return message;
        };
        const messages = questions.flatMap(({ text, wrapper, readonly, initialText = '' }, index) => {
            const body = node(wrapper === 'div' ? 'div' : wrapper, wrapper === 'div' ? { class: 'turn-content' } : {});
            body.append(input('sent-question-' + index, text, readonly ? { readonly: '' } : {}, initialText));
            const toolbar = node('div', { role: 'toolbar' });
            toolbar.append(input('question-toolbar-' + index, '工具栏辅助文本不可导出'));
            body.append(toolbar, input('question-mirror-' + index, '隐藏文本框镜像不可导出', { hidden: '' }));
            body.append(input('question-display-mirror-' + index, '自身CSS隐藏镜像不可导出', { style: 'display: none' }));
            body.append(input('question-visibility-mirror-' + index, '不可见文本框镜像不可导出', { style: 'visibility: hidden' }));
            const hiddenParent = node('div', { style: 'display: none' });
            hiddenParent.append(input('question-parent-mirror-' + index, '父级CSS隐藏镜像不可导出'));
            body.append(hiddenParent);
            const answer = node('div', { class: 'turn-content' });
            answer.append(node('ms-text-chunk', {}, `文本框问题的第 ${index + 1} 个回答。`));
            answer.append(input('model-input-' + index, '模型消息文本框不可导出'));
            return [turn('User', body), turn('Model', answer)];
        });
        const conversation = document.querySelector('ms-autoscroll-container');
        conversation.replaceChildren(...messages);
        document.querySelector('#preview-draft').value = '底部尚未发送的草稿不可导出';
        window.__questionInputOriginal = {
            conversation,
            html: conversation.innerHTML,
            inputs: [...document.querySelectorAll('textarea')].map(field => ({
                node: field, id: field.id, value: field.value, html: field.outerHTML
            }))
        };
    }, questions);
}

async function assertQuestionInputsUntouched(page) {
    const result = await page.evaluate(() => {
        const original = window.__questionInputOriginal;
        return {
            sameConversation: document.querySelector('ms-autoscroll-container') === original.conversation,
            sameHtml: original.conversation.innerHTML === original.html,
            changedInputs: original.inputs.filter(({ node, id, value, html }) =>
                document.getElementById(id) !== node || node.value !== value || node.outerHTML !== html).map(({ id }) => id)
        };
    });
    assert(result.sameConversation, '记录重建了原始对话节点');
    assert(result.sameHtml, '记录修改了原始对话 HTML');
    assert.deepEqual(result.changedInputs, [], '记录修改了已有文本框节点、value 或 HTML');
}

export async function verifyQuestionInputs({ context, check, syntheticPage, artifactDir, scratch }) {
    const questions = [
        { wrapper: 'div', readonly: true, text: '第一条文本框问题：请说明原理。\n第二行条件需要保留。' },
        { wrapper: 'ms-prompt-chunk', readonly: false, text: '第二条文本框问题：请给出例子。', initialText: '已经过期的问题内容不可导出' },
        { wrapper: 'ms-autosize-textarea', readonly: true, text: '第三条文本框问题：请总结步骤。' }
    ];
    const page = await syntheticPage(null, '/prompts/question-inputs');
    try {
        await questionInputFixture(page, questions);
        await check('已发送问题读取文本框当前值，三种正文容器均可默认载入与键盘切换', async () => {
            await openNotes(page);
            assert.deepEqual(await page.locator(ids.answer).locator('option').allTextContents(), ['第 1 对问答', '第 2 对问答', '第 3 对问答']);
            const assertSelected = async index => {
                assert.equal(await page.locator(ids.answer).inputValue(), String(index), '选择后未保留对应问答选项');
                assert(await page.locator(ids.error).isHidden(), '有效文本框问题被错误拒绝');
                const body = await page.locator(ids.body).inputValue();
                assert(body.includes(questions[index].text), '未读取文本框当前值或丢失问题换行');
                assert(body.includes(`文本框问题的第 ${index + 1} 个回答。`), '所选问题与回答不匹配');
                for (const [other, question] of questions.entries()) {
                    if (other !== index) assert(!body.includes(question.text), '导出了其他问答的问题');
                }
            };
            await assertSelected(2);
            await page.locator(ids.answer).focus();
            await page.keyboard.press('Home');
            await assertSelected(0);
            await page.keyboard.press('ArrowDown');
            await assertSelected(1);
            await page.locator(ids.answer).selectOption('2');
            await assertSelected(2);
            await assertQuestionInputsUntouched(page);
        });
        await check('文本框问题真实下载保留换行，仅包含所选问答且不读取草稿或辅助文本框', async () => {
            for (const index of [0, 1, 2]) {
                await page.locator(ids.answer).selectOption(String(index));
                const file = await downloadMarkdown(page, scratch, `question-input-${index + 1}.md`);
                assert(file.text.includes('## 我的问题\n\n' + questions[index].text));
                assert(file.text.includes(`## AI 回答\n\n文本框问题的第 ${index + 1} 个回答。`));
                for (const forbidden of [
                    '底部尚未发送的草稿不可导出', '工具栏辅助文本不可导出', '隐藏文本框镜像不可导出',
                    '自身CSS隐藏镜像不可导出', '不可见文本框镜像不可导出', '父级CSS隐藏镜像不可导出',
                    '模型消息文本框不可导出', '已经过期的问题内容不可导出'
                ]) assert(!file.text.includes(forbidden), forbidden + '进入了下载文件');
                for (const [other, question] of questions.entries()) {
                    if (other === index) continue;
                    assert(!file.text.includes(question.text), '下载混入了其他问题');
                    assert(!file.text.includes(`文本框问题的第 ${other + 1} 个回答。`), '下载混入了其他回答');
                }
            }
            await assertQuestionInputsUntouched(page);
            await page.screenshot({ path: path.join(artifactDir, '文本框问答选择.png') });
        });
    } finally {
        await page.close();
    }

    await check('文本框问题中的 HTML 与 Markdown 保持字面含义，下载和真实渲染保留换行及反斜杠', async () => {
        const harness = createMarkdownHarness();
        const literal = await syntheticPage(null, '/prompts/literal-question-input');
        const lines = [
            '请按原样解释以下文本：',
            '<script>window.__questionHtml = true</script>',
            '<img src="data:image/png;base64," alt="题面图片字面值">',
            '**不是粗体** 和 [不是链接](https://example.org/question-literal)',
            '# 不是标题',
            '- 不是列表',
            '1. 不是编号',
            '路径 C:\\notes\\原题.txt，原始符号 $x_1$ 与 ==记号==。',
            '',
            '保留  两个空格。',
            '  保留两格缩进。',
            '结束。'
        ];
        try {
            await questionInputFixture(literal, [{ wrapper: 'ms-prompt-chunk', readonly: true, text: lines.join('\n') }]);
            await openNotes(literal);
            assert(await literal.locator(ids.error).isHidden(), '普通问题文字不应导致提取失败');
            const file = await downloadMarkdown(literal, scratch, 'literal-question-input.md');
            assert(!file.text.includes('<script>') && !file.text.includes('<img '), '问题字面 HTML 未经转义进入 Markdown');
            assert(file.text.includes('&lt;img src="data:image/png;base64," alt="题面图片字面值"&gt;'), '下载文件改变了问题中的引号');
            assert(file.text.includes('\n\n保留  两个空格。\n  保留两格缩进。\n结束。'), '空行、行内空格或缩进被压平');
            await withRenderedMarkdown(context, harness, file, async rendered => {
                for (const tag of ['script', 'strong', 'h1', 'img']) {
                    assert.equal(await rendered.locator(tag).count(), 0, '问题字面内容生成了额外 ' + tag + ' 元素');
                }
                const text = await rendered.locator('body').textContent();
                // 智能排版会把直引号转为弯引号；原字符另由下载源文件检查。
                const literalText = text.replace(/[“”]/g, '"');
                for (const line of lines.filter(line => line.trim())) {
                    assert(literalText.includes(line.trim()), '问题字面内容渲染后改变：' + line);
                }
            });
            await assertQuestionInputsUntouched(literal);
        } finally {
            await literal.close();
        }
    });

    await check('空问题文本框不能借用底部草稿，首次失败保留占位且错误在窄屏首屏可见', async () => {
        const empty = await syntheticPage(null, '/prompts/empty-question-input');
        try {
            await empty.setViewportSize({ width: 390, height: 844 });
            await questionInputFixture(empty, [{ wrapper: 'ms-autosize-textarea', readonly: true, text: '' }]);
            await openNotes(empty);
            assert.equal(await empty.locator(ids.answer).inputValue(), '');
            assert.match(await empty.locator(ids.answer).locator('option:checked').textContent(), /请选择.*问答/);
            assert.equal((await empty.locator(ids.body).inputValue()).trim(), '');
            assert(await empty.locator(ids.error).isVisible(), '空问题未显示失败原因');
            assert.match(await empty.locator(ids.error).textContent(), /问题.*(?:正文|内容)|(?:正文|内容).*空/);
            assert(!/已载入|已读取/.test(await empty.locator(ids.status).textContent()));
            const bounds = await empty.locator(ids.error).boundingBox();
            assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845,
                '首次读取失败的原因必须在窄屏首屏可见');
            await assertQuestionInputsUntouched(empty);
        } finally {
            await empty.close();
        }
    });

    await check('从成功问答切换到空问题文本框时保留完整草稿和原选项', async () => {
        const failed = await syntheticPage(null, '/prompts/question-input-rollback');
        try {
            await questionInputFixture(failed, [
                { wrapper: 'div', readonly: true, text: '' }, questions[1]
            ]);
            await openNotes(failed);
            assert.equal(await failed.locator(ids.answer).inputValue(), '1');
            await failed.locator(ids.title).fill('需要保留的文本框问题笔记');
            await failed.locator(ids.tags).fill('保留,问题');
            await failed.locator(ids.body).fill('整理过的草稿正文不可丢失。');
            const before = await noteDraft(failed);
            failed.once('dialog', prompt => prompt.accept());
            await failed.locator(ids.answer).selectOption('0');
            assert(await failed.locator(ids.error).isVisible());
            assert.match(await failed.locator(ids.error).textContent(), /问题.*(?:正文|内容)|(?:正文|内容).*空/);
            assert.deepEqual(await noteDraft(failed), before, '读取空问题破坏了既有草稿或选中状态');
            await assertQuestionInputsUntouched(failed);
        } finally {
            await failed.close();
        }
    });
}

export async function verifyPickerReceiver({ check, syntheticPage, scratch }) {
    const scenarios = [
        ['success', '选择目录只取得句柄，下载使用同一目录并保留点击激活完成写入回读', /已保存并核对/],
        ['cancel', '包装 Window 下取消目录选择保留草稿并恢复按钮', /已取消选择/],
        ['denied', '包装 Window 下目录选择拒绝显示真实原因且不重试', /目录权限被拒绝/],
        ['permission-denied', '已选目录的写入授权拒绝显式失败，草稿保持且不自动下载', /写入权限/],
        ['write-failure', '包装 Window 下写入失败终止写入，保留草稿并恢复按钮', /磁盘写入失败/],
        ['close-failure', '文件关闭失败终止写入并显示真实原因', /文件关闭失败/],
        ['readback-mismatch', '包装 Window 下回读不一致明确失败，保留草稿并恢复按钮', /回读内容不一致/],
        ['readback-failure', '文件回读失败显式报错并保留已写文件与草稿', /文件回读失败/]
    ];
    for (const [mode, name, pattern] of scenarios) {
        await check(name, async () => {
            const page = await syntheticPage(null, '/prompts/picker-' + mode, { wrappedWindow: true, localFile: true });
            const downloads = [];
            page.on('download', download => downloads.push(download));
            try {
                assert(await page.evaluate(() => window.__testWindow !== window), '没有启用包装 Window，无法覆盖接收对象差异');
                await replaceMessageSequence(page, [
                    { role: 'user', text: '接收对象测试的完整问题。' },
                    { role: 'model', text: '接收对象测试的完整回答。' }
                ]);
                await installPicker(page, mode);
                await openNotes(page);
                await page.locator(ids.title).fill('保存接收对象测试');
                const before = await noteDraft(page);
                if (mode === 'cancel' || mode === 'denied') await page.locator(ids.save).click();
                else {
                    await chooseDirectory(page);
                    assert.equal(await page.evaluate(() => window.__noteFileCalls.length), 0, '选择目录不应创建或写入文件');
                    assert.equal(await page.evaluate(() => window.__notePermissionCalls.length), 0, '选择目录不应额外请求写入授权');
                    await page.locator(ids.download).click();
                }
                const selector = mode === 'success' || mode === 'cancel' ? ids.status : ids.error;
                await page.waitForFunction(({ selector, pattern }) => {
                    const root = document.querySelector('#air-reader-controls').shadowRoot;
                    return new RegExp(pattern).test(root.querySelector(selector).textContent)
                        && !root.querySelector('#note-save').disabled;
                }, { selector, pattern: pattern.source });
                const saved = await page.evaluate(() => ({
                    content: window.__noteSaved,
                    calls: window.__notePickerCalls,
                    receivers: window.__notePickerReceivers,
                    activations: window.__notePickerActivations,
                    closed: window.__noteWriterClosed,
                    aborted: window.__noteWriterAborted,
                    readbacks: window.__noteReadbacks,
                    permissionCalls: window.__notePermissionCalls,
                    fileCalls: window.__noteFileCalls
                }));
                assert.equal(saved.calls.length, 1, '一次目录选择只应调用一次选择器，下载不再打开选择器');
                assert.deepEqual(saved.receivers, [true], '目录选择未使用原生 Window 接收对象');
                assert.deepEqual(saved.activations, [true], '打开目录选择器时已丢失用户点击激活');
                assert.equal(saved.calls[0].id, 'air-note-directory');
                assert.equal(saved.calls[0].mode, 'readwrite');
                assert.equal(await page.locator(ids.save).isEnabled(), true);
                assert.equal(await page.locator(ids.download).getAttribute('aria-disabled'), 'false');
                assert.deepEqual(await noteDraft(page), before, '保存流程改变了草稿');
                assert.equal(downloads.length, 0, '目录写入流程不应自动改用浏览器下载');
                if (mode !== 'cancel' && mode !== 'denied') {
                    assert.deepEqual(saved.permissionCalls, [{ options: { mode: 'readwrite' }, active: true }], '目录写入授权必须由下载点击直接发起');
                }
                if (mode === 'success') {
                    assert(saved.closed && saved.readbacks === 1 && !saved.aborted, '写入、关闭或回读流程不完整');
                    assert(saved.content.includes('## 我的问题\n\n接收对象测试的完整问题。'));
                    assert(saved.content.includes('## AI 回答\n\n接收对象测试的完整回答。'));
                    assert.match(await page.locator(ids.status).textContent(), /测试笔记目录/);
                    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
                        configurable: true, value: { writeText: async value => { window.__noteCopied = value; } }
                    }));
                    await page.locator('#note-copy').click();
                    await page.waitForFunction(() => typeof window.__noteCopied === 'string');
                    assert.equal(await page.evaluate(() => window.__noteCopied), saved.content, '目录直写和复制的完整 Markdown 内容不一致');
                } else {
                    assert(!(await page.locator(ids.status).textContent()).includes('已保存'));
                    assert.equal(saved.aborted, mode === 'write-failure' || mode === 'close-failure', '写入或关闭失败未终止写入，或错误终止了其他阶段');
                    assert.equal(saved.closed, mode === 'readback-mismatch' || mode === 'readback-failure');
                    assert.equal(saved.readbacks, mode.startsWith('readback-') ? 1 : 0);
                    if (mode === 'permission-denied') assert.equal(saved.fileCalls.length, 0, '写入授权拒绝后仍访问了文件');
                }
            } finally {
                await page.close();
            }
        });
    }
    await check('包装 Window 下目录选择 API 不可用时保持禁用，明确使用默认下载目录', async () => {
        const page = await syntheticPage(null, '/prompts/picker-unavailable', { wrappedWindow: true });
        try {
            await page.evaluate(() => { window.showDirectoryPicker = undefined; });
            await openNotes(page);
            assert(await page.locator(ids.save).isDisabled(), '不存在的目录选择 API 不应启用按钮');
            assert(await page.locator(ids.download).isVisible());
            assert.match(await page.locator('.note-destination').first().textContent(), /浏览器默认下载目录/);
            const downloaded = await downloadMarkdown(page, scratch, 'picker-unavailable-manual-download.md');
            assert(downloaded.text.includes('## 我的问题') && downloaded.text.includes('## AI 回答'), '原生 API 不可用时手动下载应仍可导出问答');
        } finally {
            await page.close();
        }
    });
}

export async function verifyNotes({ context, check, syntheticPage, artifactDir, scratch }) {
    await verifyPickerReceiver({ check, syntheticPage, scratch });
    await verifyDirectoryWrites({ check, syntheticPage, artifactDir });
    await verifyQuestionInputs({ context, check, syntheticPage, artifactDir, scratch });
    await verifyCitations({ context, check, syntheticPage, artifactDir, scratch });
    const harness = createMarkdownHarness();
    const page = await syntheticPage(null, '/prompts/notes-fixture');
    let downloadedContent = '';
    try {
        await replaceConversation(page);
        const original = await page.locator('ms-autoscroll-container').innerHTML();
        await check('三对问答准确配对，嵌套容器与思考分块不增加选项，默认最后一对', async () => {
            await openNotes(page);
            assert.deepEqual(await page.locator(ids.answer).locator('option').allTextContents(), ['第 1 对问答', '第 2 对问答', '第 3 对问答']);
            assert.equal(await page.locator(ids.answer).inputValue(), '2');
            assert.equal(await page.locator('#note-load').count(), 0, '不应保留额外读取步骤');
            const body = await page.locator(ids.body).inputValue();
            assert.match(body, /^## 我的问题\n\n第三对问题/);
            assert(body.includes('\n\n## AI 回答\n\n'));
            assert(body.includes('第三对：数学与代码'));
            assert(body.includes('条件甲需要完整保留') && body.includes('条件乙需要完整保留'));
            assert.equal(body.split('第三对回答的后续分块').length - 1, 1);
            for (const excluded of ['第一对问题', '第一对回答', '第二对问题', '第二对回答', '角色工具条', 'Model 9:25 PM', '复制按钮', '复制代码不要收录', '私密思考', '独立思考消息']) assert(!body.includes(excluded), excluded + '进入了笔记');
            assert(!(await page.locator(ids.title).inputValue()).includes('私密思考'), '思考块的标题进入了笔记标题');
            assert.equal(await page.locator(ids.title).inputValue(), '第三对：数学与代码', '标题应优先来自 AI 正文');
            assert.equal(await page.locator('ms-autoscroll-container').innerHTML(), original, '记录修改了原始问答');
        });
        await check('Markdown 保留数学源码、可变代码围栏、列表、引用和表格', async () => {
            const body = await page.locator(ids.body).inputValue();
            assert(body.includes('$x^2 + y^2 = 1$'), '行内公式未保留原始 TeX');
            assert(body.includes('$$\n\\int_0^1 x^2\\,dx = \\frac13\n$$'), '块公式必须独立三行');
            assert(!body.includes('视觉层不要重复收录'), '公式重复收录视觉层');
            assert.match(body, /(?:`{4,}|~{3,})[^\n]*\nfunction keepIndent\(\) \{\n {4}return "```";\n\}/);
            assert.match(body, /3[.)] 第三步/);
            assert.match(body, /\n {2,}[-*+] 嵌套项目/);
            assert(body.includes('- [x] 已复习的知识点'), '任务列表勾选状态丢失');
            assert.match(body, /> 值得记住的一句话/);
            assert(body.includes('a \\| b'), '表格单元格管道未转义');
            assert(body.includes('**粗体重点**') && body.includes('*斜体片段*'));
            assert(body.includes('[参考资料]('));
            assert(!body.includes('<script>'), '文字内容被导出为可执行 HTML');
        });
        await check('富内容 Markdown 实际下载并渲染，数学代码与表格结构完整', async () => {
            const file = await downloadMarkdown(page, scratch, 'rich-answer-smoke.md');
            assert(file.text.includes('## 我的问题') && file.text.includes('第三对问题'));
            assert(file.text.includes('## AI 回答') && file.text.includes('第三对回答的后续分块'));
            await withRenderedMarkdown(context, harness, file, async rendered => {
                assert.equal(await rendered.locator('.katex-display').count(), 1);
                assert.deepEqual(await rendered.locator('annotation[encoding="application/x-tex"]').allTextContents(), ['x^2 + y^2 = 1', '\\int_0^1 x^2\\,dx = \\frac13']);
                assert.equal((await rendered.locator('pre code').textContent()).replace(/\n$/, ''), 'function keepIndent() {\n    return "```";\n}');
                assert.equal(await rendered.locator('table').count(), 1);
                assert.equal(await rendered.locator('tbody td').last().textContent(), 'a | b');
                assert.equal(await rendered.locator('ol').getAttribute('start'), '3');
                assert.equal(await rendered.locator('ol ul').count(), 1);
                assert.equal(await rendered.locator('script').count(), 0);
                assert((await rendered.locator('body').textContent()).includes('<script>alert(1)</script>'));
                assert((await rendered.locator('body').textContent()).includes('价格 $5'));
            });
        });
        await check('选择第几对即自动载入相应问题与回答，原始对话保持不变', async () => {
            for (const [value, prefix] of [['0', '第一对'], ['1', '第二对'], ['2', '第三对']]) {
                await page.locator(ids.answer).selectOption(value);
                const body = await page.locator(ids.body).inputValue();
                assert(body.includes(prefix + '问题'), '选中后没有立即显示对应问题');
                assert(body.includes(prefix + '回答') || body.includes(prefix + '：数学与代码'), '选中后没有立即显示对应回答');
                for (const other of ['第一对', '第二对', '第三对'].filter(item => item !== prefix)) assert(!body.includes(other));
                if (value === '1') assert.equal(body.split('同一条消息只计一次').length - 1, 1, '嵌套容器重复收录正文');
            }
            assert.equal(await page.locator('ms-autoscroll-container').innerHTML(), original);
            await page.screenshot({ path: path.join(artifactDir, '问答自动载入.png') });
        });
        await check('用户编辑后关闭重开保留草稿，取消切换恢复原选项与完整草稿', async () => {
            await page.locator(ids.body).fill('# 我的整理\n\n这是手动整理后的笔记。\n');
            await page.locator(ids.title).fill('我的数学笔记');
            await page.locator('#note-close').click();
            await openNotes(page);
            assert.equal(await page.locator(ids.body).inputValue(), '# 我的整理\n\n这是手动整理后的笔记。\n');
            const before = await noteDraft(page);
            const dialog = page.waitForEvent('dialog');
            const select = page.locator(ids.answer).selectOption('0');
            const prompt = await dialog;
            assert.equal(prompt.type(), 'confirm');
            await prompt.dismiss();
            await select;
            assert.deepEqual(await noteDraft(page), before, '取消切换后选项或草稿字段发生改变');
        });
        await check('未选择文件夹时使用默认下载，完整文件保留标题、来源与编辑正文', async () => {
            const file = await downloadMarkdown(page, scratch, 'default-destination-note.md');
            downloadedContent = file.text;
            assert(file.text.startsWith('---\n'));
            assert(file.text.includes('title: "我的数学笔记"'));
            assert(file.text.includes('source: "https://aistudio.google.com/prompts/notes-fixture"'));
            assert(file.text.includes('这是手动整理后的笔记。'));
            assert.match(await page.locator('.note-destination').first().textContent(), /浏览器默认下载目录/);
        });
        await check('复制与保存使用同一份 Markdown，剪贴板拒绝显示真实原因', async () => {
            await page.evaluate(() => {
                Object.defineProperty(navigator, 'clipboard', {
                    configurable: true,
                    value: { writeText: async value => { window.__noteCopied = value; } }
                });
            });
            await page.locator('#note-copy').click();
            await page.waitForFunction(() => typeof window.__noteCopied === 'string');
            const copied = await page.evaluate(() => window.__noteCopied);
            assert.equal(copied, downloadedContent, '复制和默认下载生成了不同的笔记内容');
            await page.evaluate(() => {
                Object.defineProperty(navigator, 'clipboard', {
                    configurable: true,
                    value: { writeText: async () => { throw new DOMException('测试：剪贴板权限被拒绝', 'NotAllowedError'); } }
                });
            });
            await page.locator('#note-copy').click();
            await page.waitForFunction(() => document.querySelector('#air-reader-controls').shadowRoot.querySelector('#note-error').textContent.includes('剪贴板权限被拒绝'));
            assert.match(await page.locator(ids.error).textContent(), /剪贴板权限被拒绝/);
            assert(!(await page.locator(ids.status).textContent()).includes('已复制'));
        });
        await check('Obsidian Markdown 经真实浏览器下载并落盘，UTF-8 内容正确', async () => {
            const result = await downloadMarkdown(page, scratch, 'obsidian-note-smoke.md');
            assert(result.text.includes('title: "我的数学笔记"'));
            assert(result.text.includes('# 我的整理'));
            assert(result.text.includes('https://aistudio.google.com/prompts/notes-fixture'));
            assert(!result.text.includes('D:\\'), '本机目录泄露进笔记内容');
        });
        await check('博客草稿符合现有字段契约，摘要必填且默认不带对话来源', async () => {
            await page.locator(ids.format).selectOption('blog');
            assert.equal(await page.locator(ids.source).isChecked(), false);
            await page.locator(ids.description).fill('');
            await page.locator(ids.download).click();
            assert(await page.locator(ids.error).isVisible());
            assert.match(await page.locator(ids.error).textContent(), /摘要/);
            await page.locator(ids.description).fill('对学习中遇到的数学问题做一次清晰整理。');
            await page.locator(ids.category).selectOption('learning');
            await page.locator(ids.tags).fill('数学, 学习');
            const result = await downloadMarkdown(page, scratch, 'blog-draft-smoke.md');
            const parsed = harness.parse(result.text);
            const metadata = harness.schema.parse(parsed.metadata);
            assert.equal(metadata.title, '我的数学笔记');
            assert.equal(metadata.description, '对学习中遇到的数学问题做一次清晰整理。');
            assert.equal(metadata.category, 'learning');
            assert.equal(metadata.cover, 'writing');
            assert.equal(metadata.featured, false);
            assert.equal(metadata.draft, true);
            assert.deepEqual(metadata.tags, ['数学', '学习']);
            assert(!result.text.includes('aistudio.google.com'), '博客默认附带了私有对话链接');
            assert(!result.text.includes('D:\\') && !result.text.includes('Obsidian Vault'));
            assert(result.text.includes('这是手动整理后的笔记。'));
        });
        await check('创作分类导出使用 creating 字段值并通过公开博客契约', async () => {
            await page.locator(ids.category).selectOption('creating');
            const result = await downloadMarkdown(page, scratch, 'creating-blog-draft.md');
            const metadata = harness.schema.parse(harness.parse(result.text).metadata);
            assert.equal(metadata.category, 'creating');
            await page.locator(ids.category).selectOption('learning');
        });
        await check('标签数量、空正文和空标题均显式阻止导出', async () => {
            await page.locator(ids.tags).fill('一,二,三,四,五,六');
            await page.locator(ids.download).click();
            assert.match(await page.locator(ids.error).textContent(), /标签/);
            await page.locator(ids.tags).fill('数学');
            await page.locator(ids.body).fill(' \n ');
            await page.locator(ids.download).click();
            assert.match(await page.locator(ids.error).textContent(), /正文/);
            await page.locator(ids.body).fill('# 我的整理\n\n这是手动整理后的笔记。\n');
            await page.locator(ids.title).fill(' ');
            await page.locator(ids.download).click();
            assert.match(await page.locator(ids.error).textContent(), /标题/);
            await page.locator(ids.title).fill('我的数学笔记');
        });
        await check('对话路由切换保留旧草稿和原来源，避免错标新对话', async () => {
            await page.locator(ids.format).selectOption('obsidian');
            await page.locator(ids.source).check();
            const before = await noteDraft(page);
            await page.evaluate(() => {
                window.__testLocation.pathname = '/prompts/different-chat';
                window.__testLocation.href = 'https://aistudio.google.com/prompts/different-chat';
                document.body.append(document.createElement('span'));
            });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
            if (await page.locator(ids.dialog).isHidden()) await openNotes(page);
            assert.equal(await page.locator(ids.answer).inputValue(), '', '旧草稿不得伪装成当前对话中的某一对');
            assert.match(await page.locator(ids.answer).locator('option:checked').textContent(), /请选择.*问答|已切换对话.*选择问答/);
            const after = await noteDraft(page);
            assert.deepEqual({ ...after, 'note-answer': before['note-answer'] }, before, '路由变化修改了旧草稿');
            const result = await downloadMarkdown(page, scratch, 'retained-note-smoke.md');
            assert(result.text.includes('https://aistudio.google.com/prompts/notes-fixture'));
            assert(!result.text.includes('https://aistudio.google.com/prompts/different-chat'));
            assert(result.text.includes('手动整理后的笔记'));
            await page.locator('#note-close').click();
            await openNotes(page);
            assert.equal(await page.locator(ids.answer).inputValue(), '', '重新打开面板不得自动选择新对话中的同序号问答');
            assert.match(await page.locator(ids.body).inputValue(), /手动整理后的笔记/);
        });
        await check('桌面与窄屏记录面板可编辑可保存，无横向溢出', async () => {
            for (const [viewport, file] of [
                [{ width: 1440, height: 1080 }, '保存笔记.png'],
                [{ width: 390, height: 844 }, '保存笔记窄屏.png']
            ]) {
                await page.setViewportSize(viewport);
                const bounds = await page.locator(ids.dialog).boundingBox();
                assert(bounds && bounds.x >= 0 && bounds.y >= 0);
                assert(bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1);
                assert(await page.locator(ids.body).isVisible());
                await page.locator(ids.download).scrollIntoViewIfNeeded();
                assert(await page.locator(ids.download).isVisible());
                assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                await page.screenshot({ path: path.join(artifactDir, file) });
            }
            await page.setViewportSize({ width: 1440, height: 1080 });
            await page.keyboard.press('Escape');
            assert(await page.locator(ids.dialog).isHidden());
        });
    } finally {
        await page.close();
    }

    await check('确认替换草稿后直接载入所选问答及其新来源', async () => {
        const confirmed = await syntheticPage(null, '/prompts/confirm-pair-change');
        try {
            await replaceConversation(confirmed);
            await openNotes(confirmed);
            await confirmed.locator(ids.body).fill('手工修改，确认后可以替换。');
            await confirmed.evaluate(() => {
                window.__testLocation.pathname = '/prompts/confirmed-new-chat';
                window.__testLocation.href = 'https://aistudio.google.com/prompts/confirmed-new-chat';
                document.body.append(document.createElement('span'));
            });
            await confirmed.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
            await confirmed.locator('#note-close').click();
            await openNotes(confirmed);
            assert.equal(await confirmed.locator(ids.answer).inputValue(), '');
            const pending = confirmed.waitForEvent('dialog');
            const select = confirmed.locator(ids.answer).selectOption('0');
            const prompt = await pending;
            assert.equal(prompt.type(), 'confirm');
            await prompt.accept();
            await select;
            assert.equal(await confirmed.locator(ids.answer).inputValue(), '0');
            const body = await confirmed.locator(ids.body).inputValue();
            assert(body.includes('第一对问题') && body.includes('第一对回答'));
            assert(!body.includes('手工修改') && !body.includes('第三对'));
            const file = await downloadMarkdown(confirmed, scratch, 'confirmed-pair-smoke.md');
            assert(file.text.includes('/prompts/confirmed-new-chat'));
            assert(!file.text.includes('/prompts/confirm-pair-change'));
            assert(file.text.includes('第一对问题') && file.text.includes('第一对回答'));
        } finally {
            await confirmed.close();
        }
    });

    await check('所选问答正文损坏时明确报错并恢复原选择、草稿与来源', async () => {
        const failed = await syntheticPage(null, '/prompts/failed-pair-change');
        try {
            await replaceConversation(failed);
            await openNotes(failed);
            await failed.locator(ids.title).fill('失败时保留的标题');
            await failed.locator(ids.tags).fill('保留,草稿');
            await failed.locator(ids.body).fill('失败时保留的完整正文。');
            const before = await noteDraft(failed);
            await failed.locator('ms-chat-turn').nth(1).evaluate(turn => {
                const body = turn.querySelector('.turn-content');
                body.className = 'unknown-answer-shape';
                body.replaceChildren();
                const header = document.createElement('header');
                header.textContent = 'Model 9:25 PM';
                body.append(header);
            });
            const pending = failed.waitForEvent('dialog');
            const select = failed.locator(ids.answer).selectOption('0');
            await (await pending).accept();
            await select;
            assert(await failed.locator(ids.error).isVisible());
            assert.match(await failed.locator(ids.error).textContent(), /正文|内容|结构/);
            assert.deepEqual(await noteDraft(failed), before, '提取失败破坏了之前的草稿或选择');
            const file = await downloadMarkdown(failed, scratch, 'failed-pair-retained-smoke.md');
            assert(file.text.includes('/prompts/failed-pair-change'));
            assert(file.text.includes('失败时保留的完整正文'));
            assert(!file.text.includes('Model 9:25 PM'));
        } finally {
            await failed.close();
        }
    });

    for (const { name, messages, question, answer, excluded, warning } of [
        {
            name: '孤立 AI 消息不误配，后续完整问答仍可选择并明确提示',
            messages: [
                { role: 'model', text: '孤立回答不得收录' },
                { role: 'user', text: '有效问题一' }, { role: 'model', text: '有效回答一' }
            ],
            question: '有效问题一', answer: '有效回答一', excluded: ['孤立回答不得收录'], warning: /缺少.*问题|孤立|未.*配对/
        },
        {
            name: '连续用户消息只配最近问题，未获回答的问题明确提示',
            messages: [
                { role: 'user', text: '前一个未回答的问题' },
                { role: 'user', text: '最近的问题' }, { role: 'model', text: '最近问题的回答' }
            ],
            question: '最近的问题', answer: '最近问题的回答', excluded: ['前一个未回答的问题'], warning: /尚无.*对应|未.*回答|没有.*回答/
        },
        {
            name: '未知角色阻断配对，不能把后续 AI 接到更早的问题',
            messages: [
                { role: 'user', text: '屏障之前的问题' }, { role: 'unknown', text: '未知角色的消息' },
                { role: 'model', text: '屏障之后的孤立回答' },
                { role: 'user', text: '屏障之后的完整问题' }, { role: 'model', text: '屏障之后的完整回答' }
            ],
            question: '屏障之后的完整问题', answer: '屏障之后的完整回答',
            excluded: ['屏障之前的问题', '未知角色的消息', '屏障之后的孤立回答'], warning: /角色.*未识别|未知.*角色/
        },
        {
            name: '结构化独立思考消息跳过，后续 AI 正文完整保留',
            messages: [
                { role: 'user', text: '结构化思考后的问题' },
                { role: 'model', kind: 'thought', text: '结构化私密思考不可收录' },
                { role: 'model', text: '结构化思考后的真实回答' }
            ],
            question: '结构化思考后的问题', answer: '结构化思考后的真实回答', excluded: ['结构化私密思考不可收录']
        },
        {
            name: '角色时间与正文同处内容容器时仍只导出真实问答正文',
            messages: [
                { role: 'user', text: '元数据混排的问题' },
                { role: 'model', kind: 'header-and-body', text: '元数据混排的真实回答' }
            ],
            question: '元数据混排的问题', answer: '元数据混排的真实回答', excluded: ['Model', '9:25 PM']
        },
        {
            name: '合法正文仅为角色字面词时仍保留纯文字问题和正文组件回答',
            messages: [
                { role: 'user', kind: 'plain-user', text: '你' },
                { role: 'model', text: 'Model' }
            ],
            question: '## 我的问题\n\n你', answer: '## AI 回答\n\nModel', excluded: []
        }
    ]) {
        await check(name, async () => {
            const boundary = await syntheticPage(null, '/prompts/pairing-boundary');
            try {
                await replaceMessageSequence(boundary, messages);
                await openNotes(boundary);
                assert.deepEqual(await boundary.locator(ids.answer).locator('option').allTextContents(), ['第 1 对问答']);
                assert(await boundary.locator(ids.error).isHidden(), '有效问答被错误拒绝');
                const body = await boundary.locator(ids.body).inputValue();
                assert(body.includes(question) && body.includes(answer), '对应问题或回答丢失');
                for (const value of excluded) assert(!body.includes(value), value + '不应进入当前问答');
                if (warning) {
                    assert(await boundary.locator(ids.warning).isVisible(), '不完整对话必须提示');
                    assert.match(await boundary.locator(ids.warning).textContent(), warning);
                }
            } finally {
                await boundary.close();
            }
        });
    }

    for (const [name, messages, pattern] of [
        [
            '空 AI 消息明确拒绝，不能仅凭角色节点假报已载入',
            [{ role: 'user', text: '等待回答的问题' }, { role: 'model', text: '' }],
            /正文.*空|尚无.*正文|等待.*回答/
        ],
        [
            '思考消息旁未知正文不能静默丢弃后仅导出后续分块',
            [
                { role: 'user', text: '不能丢失分块的问题' },
                { role: 'model', kind: 'thought-with-unknown-body', text: '思考部分不收录' },
                { role: 'model', text: '后续可识别回答' }
            ],
            /正文|内容|结构/
        ]
    ]) {
        await check(name, async () => {
            const boundary = await syntheticPage(null, '/prompts/invalid-pair-boundary');
            try {
                await replaceMessageSequence(boundary, messages);
                await openNotes(boundary);
                assert(await boundary.locator(ids.error).isVisible(), '无效正文不应显示载入成功');
                assert.match(await boundary.locator(ids.error).textContent(), pattern);
                assert.equal((await boundary.locator(ids.body).inputValue()).trim(), '');
                assert(!/已载入|已读取/.test(await boundary.locator(ids.status).textContent()));
            } finally {
                await boundary.close();
            }
        });
    }

    await check('组件包裹和直接单元格混排的表格实际下载渲染完整，表头与无表头结构均保留', async () => {
        for (const kind of ['simple', 'headerless']) {
            const tablePage = await syntheticPage(null, '/prompts/wrapped-table-' + kind);
            try {
                const structure = await wrappedTableFixture(tablePage, kind);
                assert.deepEqual(structure, [
                    { nativeCells: 0, descendants: 3 }, { nativeCells: 1, descendants: 3 }, { nativeCells: 0, descendants: 3 }
                ], '组件包装没有覆盖原生 cells 遗漏的实际结构');
                await openNotes(tablePage);
                assert(await tablePage.locator(ids.error).isHidden());
                assert(await tablePage.locator(ids.warning).isHidden(), '普通组件包装不应被当作复杂表格');
                const file = await downloadMarkdown(tablePage, scratch, 'wrapped-table-' + kind + '.md');
                for (const unique of ['包装表格唯一标题', 'L1 唯一层级', '商品经济唯一重点', '参考资料唯一链接', 'L2 唯一层级']) {
                    assert.equal(file.text.split(unique).length - 1, 1, unique + '未完整保留或被重复提取');
                }
                assert(file.text.includes('**商品经济唯一重点**'));
                assert(file.text.includes('a \\| b'));
                assert(file.text.includes('$x + y = 2$'));
                assert(!/^\|\s*\|$/m.test(file.text), '导出仍含零列表格');
                await withRenderedMarkdown(context, harness, file, async rendered => {
                    assert.equal(await rendered.locator('table').count(), 1);
                    assert.deepEqual(await rendered.locator('thead th').allTextContents(), kind === 'simple' ? ['层级', '核心概念', '示例'] : ['', '', '']);
                    assert.equal(await rendered.locator('tbody tr').count(), kind === 'simple' ? 2 : 3);
                    for (const row of await rendered.locator('tbody tr').all()) assert.equal(await row.locator('td').count(), 3);
                    const data = await rendered.locator('tbody tr').all();
                    const offset = kind === 'simple' ? 0 : 1;
                    if (offset) assert.deepEqual(await data[0].locator('td').allTextContents(), ['层级', '核心概念', '示例']);
                    assert.deepEqual(await data[offset].locator('td').allTextContents(), ['L1 唯一层级', '商品经济唯一重点', '参考资料唯一链接']);
                    assert.equal(await data[offset].locator('strong').textContent(), '商品经济唯一重点');
                    assert.equal(await data[offset].locator('a').getAttribute('href'), 'https://example.org/tables?q=1&lang=zh');
                    assert.deepEqual(await data[offset + 1].locator('td').allTextContents().then(values => values.slice(0, 2)), ['L2 唯一层级', 'a | b']);
                    assert.equal(await data[offset + 1].locator('annotation[encoding="application/x-tex"]').textContent(), 'x + y = 2');
                    if (kind === 'simple') await rendered.screenshot({ path: path.join(artifactDir, '包装表格实际渲染.png') });
                });
            } finally {
                await tablePage.close();
            }
        }
    });

    await check('四列表格中的普通嵌套列表编号多段文字与引用公式保留在原单元格，实际渲染换行', async () => {
        const tablePage = await syntheticPage(null, '/prompts/four-column-multiline-table');
        const uniqueText = [
            '包装表格唯一标题', '第一项唯一维度', '普通列表唯一首项', '列表唯一粗体', '普通列表唯一次项',
            '条目续段唯一说明', '嵌套列表唯一子项', '有序列表唯一首项', '有序列表唯一次项',
            '换行唯一上段', '换行唯一下段', '四列表唯一引用甲', '第二项唯一维度', '第二行列表唯一甲',
            '第二行列表唯一乙', '独立段落唯一甲', '独立段落唯一乙', '第二行唯一重点', '四列表唯一引用乙'
        ];
        try {
            const structure = await wrappedTableFixture(tablePage, 'multiline-lists');
            assert.deepEqual(structure, [
                { nativeCells: 0, descendants: 4 }, { nativeCells: 0, descendants: 4 }, { nativeCells: 1, descendants: 4 }
            ]);
            await openNotes(tablePage);
            assert(await tablePage.locator(ids.error).isHidden());
            assert(await tablePage.locator(ids.warning).isHidden(), '普通表内列表被误判为需要展开的复杂表格');
            const file = await downloadMarkdown(tablePage, scratch, 'four-column-multiline-table.md');
            for (const unique of uniqueText) assert.equal(file.text.split(unique).length - 1, 1, unique + '被遗漏或重复导出');
            assert(!/第\s*1\s*行|第\s*1\s*列/.test(file.text), '普通表内列表触发表格展开');
            const lines = file.text.split('\n').filter(line => line.startsWith('|'));
            assert.equal(lines.length, 4, '表头分隔与两数据行没有保留为同一张表');
            for (const line of lines) assert.equal(line.match(/(?<!\\)\|/g)?.length, 5, '表内换行破坏了四列结构');
            assert(file.text.includes('<br>'), '多行单元格缺少可渲染换行');
            assert(file.text.includes('**列表唯一粗体**') && file.text.includes('**第二行唯一重点**'));
            assert(file.text.includes('$a + b = c$'));
            await withRenderedMarkdown(context, harness, file, async rendered => {
                assert.equal(await rendered.locator('table').count(), 1);
                assert.deepEqual(await rendered.locator('thead th').allTextContents(), ['比较维度', '方案甲', '方案乙', '说明']);
                const rows = await rendered.locator('tbody tr').all();
                assert.equal(rows.length, 2);
                for (const row of rows) assert.equal(await row.locator('td').count(), 4);
                const bullets = rows[0].locator('td').nth(1);
                assert((await bullets.locator('br').count()) >= 3, '列表和条目续段的换行没有进入渲染结果');
                const bulletText = await bullets.textContent();
                for (const text of ['普通列表唯一首项', '普通列表唯一次项', '嵌套列表唯一子项']) {
                    assert.match(bulletText, new RegExp('•\\s*' + text), '列表项目标记没有保留在原单元格');
                }
                const numbered = rows[0].locator('td').nth(2);
                assert((await numbered.locator('br').count()) >= 1);
                assert.match(await numbered.textContent(), /3[.)]\s*有序列表唯一首项/);
                assert.match(await numbered.textContent(), /4[.)]\s*有序列表唯一次项/);
                const explanation = rows[0].locator('td').nth(3);
                assert((await explanation.locator('br').count()) >= 1);
                assert.equal(await explanation.locator('annotation[encoding="application/x-tex"]').textContent(), 'a + b = c');
                assert.equal(await explanation.locator('a').getAttribute('href'), 'https://example.org/multiline?lang=zh&q=table');
                assert((await rows[1].locator('td').nth(2).locator('br').count()) >= 1, '独立段落被合成同一行');
                assert.deepEqual(await rendered.locator('table strong').allTextContents(), ['列表唯一粗体', '第二行唯一重点']);
                assert.equal(await rows[1].locator('td').nth(3).locator('a').getAttribute('href'), 'https://example.org/notes?section=2&lang=zh');
                assert.equal(await rendered.locator('table ul, table ol').count(), 0, '表内列表未转换为单元格内的项目与换行');
                const text = await rendered.locator('body').textContent();
                for (const unique of uniqueText) assert.equal(text.split(unique).length - 1, 1, unique + '渲染后被遗漏或重复');
                await rendered.screenshot({ path: path.join(artifactDir, '四列表格多行实际渲染.png') });
            });
        } finally {
            await tablePage.close();
        }
    });

    await check('AI Studio行内公式的pre代码包装和隐藏代码副本不使表格展开，LaTeX只提取一次', async () => {
        const tablePage = await syntheticPage(null, '/prompts/inline-formula-table');
        try {
            await wrappedTableFixture(tablePage, 'multiline-lists');
            const formulaSource = tablePage.locator('ms-katex.inline > pre > code.rendered > span.katex > math[hidden] > semantics > annotation');
            assert.equal(await formulaSource.count(), 1, '缺少真实行内公式的pre与隐藏MathML结构');
            assert.equal(await formulaSource.textContent(), 'a + b = c');
            await tablePage.locator('.model .turn-content table').first().evaluate(table => {
                const cell = table.querySelectorAll('td')[6];
                const pre = document.createElement('pre');
                pre.hidden = true;
                const code = document.createElement('code');
                code.textContent = '隐藏代码副本不可导出';
                pre.append(code);
                const hiddenFormula = document.createElement('ms-katex');
                hiddenFormula.hidden = true;
                hiddenFormula.setAttribute('data-tex', 'x_{hidden} = 701');
                const ariaFormula = document.createElement('ms-katex');
                ariaFormula.setAttribute('aria-hidden', 'true');
                ariaFormula.setAttribute('data-tex', 'x_{aria} = 702');
                cell.append(pre, hiddenFormula, ariaFormula);
            });
            await openNotes(tablePage);
            assert(await tablePage.locator(ids.error).isHidden());
            assert(await tablePage.locator(ids.warning).isHidden(), '行内公式包装或隐藏pre触发了块内容判定');
            const file = await downloadMarkdown(tablePage, scratch, 'inline-formula-table.md');
            assert.equal(file.text.split('$a + b = c$').length - 1, 1, 'LaTeX缺失或被视觉层重复导出');
            assert(!file.text.includes('公式视觉副本不可重复导出'));
            assert(!file.text.includes('隐藏代码副本不可导出'));
            assert(!file.text.includes('x_{hidden} = 701'), '独立hidden公式进入了导出');
            assert(!file.text.includes('x_{aria} = 702'), '独立aria-hidden公式进入了导出');
            assert(!/第\s*1\s*行|第\s*1\s*列/.test(file.text));
            await withRenderedMarkdown(context, harness, file, async rendered => {
                assert.equal(await rendered.locator('table').count(), 1);
                assert.equal(await rendered.locator('thead th').count(), 4);
                assert.equal(await rendered.locator('tbody tr').count(), 2);
                for (const row of await rendered.locator('tbody tr').all()) assert.equal(await row.locator('td').count(), 4);
                assert.equal(await rendered.locator('table .katex').count(), 1);
                assert.deepEqual(await rendered.locator('annotation[encoding="application/x-tex"]').allTextContents(), ['a + b = c']);
                assert.equal(await rendered.locator('pre').count(), 0, '公式或隐藏代码被作为可见代码块输出');
            });
        } finally {
            await tablePage.close();
        }
    });

    await check('表内行内公式源码的换行与行尾注释完整保留，明确提示复杂结构且实际渲染不改写源码', async () => {
        const tablePage = await syntheticPage(null, '/prompts/multiline-inline-source-table');
        const source = 'a + % 保留注释\nb = c';
        try {
            await tablePage.locator('.model .turn-content').evaluate((content, source) => {
                const node = (tag, text = '', attrs = {}) => {
                    const result = document.createElement(tag);
                    result.textContent = text;
                    for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
                    return result;
                };
                const formula = node('ms-katex', '', { class: 'inline' });
                const pre = node('pre');
                const code = node('code', '', { class: 'rendered' });
                const katex = node('span', '', { class: 'katex' });
                const math = node('math', '', { hidden: '' });
                const semantics = node('semantics');
                semantics.append(node('annotation', source, { encoding: 'application/x-tex' }));
                math.append(semantics);
                katex.append(node('span', '多行源码视觉副本不可导出', { class: 'katex-html' }), math);
                code.append(katex);
                pre.append(code);
                formula.append(pre);
                const table = node('table');
                const header = node('tr');
                header.append(node('th', '项目'), node('th', '公式'));
                const row = node('tr');
                const cell = node('td');
                cell.append(formula);
                row.append(node('td', '源码边界唯一项'), cell);
                table.append(header, row);
                const chunk = node('ms-text-chunk');
                chunk.append(table);
                content.replaceChildren(chunk);
            }, source);
            await openNotes(tablePage);
            assert(await tablePage.locator(ids.error).isHidden());
            assert(await tablePage.locator(ids.warning).isVisible());
            assert.match(await tablePage.locator(ids.warning).textContent(), /表格/);
            const file = await downloadMarkdown(tablePage, scratch, 'multiline-inline-source-table.md');
            assert.equal(file.text.split(source).length - 1, 1, '多行公式原文被遗漏或重复');
            assert(!file.text.includes('$' + source.replace(/\r?\n/g, '<br>') + '$'), '公式源码换行被改写成HTML换行');
            assert(!file.text.includes('多行源码视觉副本不可导出'));
            await withRenderedMarkdown(context, harness, file, async rendered => {
                assert.equal(await rendered.locator('.katex').count(), 1);
                assert.deepEqual(await rendered.locator('annotation[encoding="application/x-tex"]').allTextContents(), [source], '实际渲染改变了公式换行或行尾注释');
                assert((await rendered.locator('body').textContent()).includes('源码边界唯一项'));
            });
        } finally {
            await tablePage.close();
        }
    });

    await check('隐藏单元格保留原列位置且不提取隐藏文字，隐藏表格行不进入实际下载与渲染', async () => {
        for (const attribute of ['hidden', 'aria-hidden']) {
            const tablePage = await syntheticPage(null, '/prompts/hidden-table-' + attribute);
            try {
                await wrappedTableFixture(tablePage, 'simple');
                await tablePage.locator('.model .turn-content table').first().evaluate((table, attribute) => {
                    const rows = [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
                    const middle = rows[2].querySelectorAll('td')[1].parentElement;
                    middle.setAttribute(attribute, attribute === 'hidden' ? '' : 'true');
                    const hiddenRow = document.createElement('tr');
                    for (const text of ['隐藏整行唯一甲', '隐藏整行唯一乙', '隐藏整行唯一丙']) {
                        const cell = document.createElement('td');
                        cell.textContent = text;
                        const wrapper = document.createElement('ms-cmark-node');
                        wrapper.append(cell);
                        hiddenRow.append(wrapper);
                    }
                    const rowWrapper = document.createElement('ms-cmark-node');
                    rowWrapper.setAttribute(attribute, attribute === 'hidden' ? '' : 'true');
                    rowWrapper.append(hiddenRow);
                    table.append(rowWrapper);
                }, attribute);
                await openNotes(tablePage);
                assert(await tablePage.locator(ids.error).isHidden());
                assert(await tablePage.locator(ids.warning).isHidden());
                const file = await downloadMarkdown(tablePage, scratch, 'hidden-table-' + attribute + '.md');
                assert(!file.text.includes('a \\| b'), '隐藏单元格文字进入了导出');
                assert(!file.text.includes('隐藏整行唯一'), '隐藏表格行进入了导出');
                await withRenderedMarkdown(context, harness, file, async rendered => {
                    assert.deepEqual(await rendered.locator('thead th').allTextContents(), ['层级', '核心概念', '示例']);
                    assert.equal(await rendered.locator('tbody tr').count(), 2, '隐藏行占据了输出行');
                    const last = rendered.locator('tbody tr').last();
                    assert.equal(await last.locator('td').count(), 3, '隐藏单元格改变了原始列数');
                    assert.equal(await last.locator('td').nth(0).textContent(), 'L2 唯一层级');
                    assert.equal(await last.locator('td').nth(1).textContent(), '', '隐藏单元格后面的内容左移');
                    assert.equal(await last.locator('td').nth(2).locator('annotation[encoding="application/x-tex"]').textContent(), 'x + y = 2');
                });
            } finally {
                await tablePage.close();
            }
        }
    });

    await check('组件包裹的复杂单元格和嵌套表格保留全部代码公式与唯一内容，内表不计入外表列', async () => {
        const tablePage = await syntheticPage(null, '/prompts/wrapped-complex-table');
        try {
            const structure = await wrappedTableFixture(tablePage, 'complex');
            assert.deepEqual(structure.map(row => row.nativeCells), [0, 0]);
            await openNotes(tablePage);
            assert(await tablePage.locator(ids.error).isHidden());
            assert(await tablePage.locator(ids.warning).isVisible());
            assert.match(await tablePage.locator(ids.warning).textContent(), /表格/);
            const file = await downloadMarkdown(tablePage, scratch, 'wrapped-complex-table.md');
            for (const unique of ['包装表格唯一标题', '外表代码唯一标题', '内表唯一列甲', '内表唯一列乙', '内表唯一数据甲', '内表唯一数据乙']) {
                assert.equal(file.text.split(unique).length - 1, 1, unique + '被遗漏或错误计入外表后重复提取');
            }
            assert.equal(file.text.split('第 2 行').length - 1, 1, '内表行被计入外表');
            assert(!file.text.includes('第 3 列'), '内表单元格被计入外表');
            await withRenderedMarkdown(context, harness, file, async rendered => {
                assert.equal((await rendered.locator('pre code').textContent()).replace(/\n$/, ''), 'const retained = "\\\\|x\\\\|";\n\nconsole.log(retained);');
                assert.equal(await rendered.locator('.katex-display').count(), 1);
                assert.equal(await rendered.locator('annotation[encoding="application/x-tex"]').textContent(), '\\left\\|x\\right\\| = 1');
                assert.equal(await rendered.locator('table').count(), 1, '内表应保留为独立可渲染表格');
                assert.deepEqual(await rendered.locator('thead th').allTextContents(), ['内表唯一列甲', '内表唯一列乙']);
                assert.deepEqual(await rendered.locator('tbody td').allTextContents(), ['内表唯一数据甲', '内表唯一数据乙']);
            });
        } finally {
            await tablePage.close();
        }
    });

    await check('无行零列和未归属正文的损坏表格明确拒绝提取，切换失败保留完整草稿与来源', async () => {
        for (const kind of ['no-rows', 'no-cells', 'stray-text', 'orphan-cell']) {
            const tablePage = await syntheticPage(null, '/prompts/broken-table-' + kind);
            try {
                await replaceConversation(tablePage);
                await openNotes(tablePage);
                await tablePage.locator(ids.title).fill('表格失败后保留的标题');
                await tablePage.locator(ids.tags).fill('表格,草稿');
                await tablePage.locator(ids.body).fill('表格失败后保留的完整手工正文。');
                const before = await noteDraft(tablePage);
                await wrappedTableFixture(tablePage, kind);
                const pending = tablePage.waitForEvent('dialog');
                const select = tablePage.locator(ids.answer).selectOption('0');
                await (await pending).accept();
                await select;
                assert(await tablePage.locator(ids.error).isVisible(), kind + '未显式失败');
                assert.match(await tablePage.locator(ids.error).textContent(), /表格|单元格|结构/);
                assert.deepEqual(await noteDraft(tablePage), before, kind + '失败破坏了草稿或选择');
                const file = await downloadMarkdown(tablePage, scratch, 'broken-table-' + kind + '-retained.md');
                assert(file.text.includes('表格失败后保留的完整手工正文。'));
                assert(file.text.includes('/prompts/broken-table-' + kind));
                assert(!file.text.includes('不可丢失'), '失败表格取代了保留草稿');
            } finally {
                await tablePage.close();
            }
        }
    });

    await check('复杂表格与异常编号实际渲染保留块内容和原编号，并明确提示核对', async () => {
        const edge = await syntheticPage(null, '/prompts/markdown-boundaries');
        const rawCode = 'const pattern = "\\\\|x\\\\|";\n\nconsole.log(pattern);\n';
        try {
            await edge.locator('.model .turn-content').evaluate((content, rawCode) => {
                const node = (tag, text = '', attrs = {}) => {
                    const result = document.createElement(tag);
                    result.textContent = text;
                    for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
                    return result;
                };
                const markdown = node('ms-cmark-node');
                markdown.append(node('h2', 'Markdown 边界案例'));
                const table = node('table');
                table.append(node('caption', '复杂表格标题'));
                const header = node('tr');
                header.append(node('th', '代码内容'), node('th', '数学内容'));
                const row = node('tr');
                const codeCell = node('td');
                const pre = node('pre');
                pre.append(node('code', rawCode, { class: 'language-javascript' }));
                codeCell.append(pre);
                const mathCell = node('td');
                const math = node('ms-katex', '', { class: 'katex-display' });
                math.append(node('annotation', '\\left\\|x\\right\\| = 1', { encoding: 'application/x-tex' }));
                mathCell.append(math);
                row.append(codeCell, mathCell);
                table.append(header, row);
                const listRow = node('tr');
                const listCell = node('td');
                const nested = node('ul');
                nested.append(node('li', '表内列表内容'));
                listCell.append(nested);
                const slashCell = node('td');
                slashCell.append(node('code', '\\|x\\|'));
                listRow.append(listCell, slashCell);
                table.append(listRow);
                markdown.append(table);
                for (const [attrs, items] of [
                    [{ start: '-2' }, [[null, '负数编号甲'], [null, '负数编号乙']]],
                    [{ reversed: '', start: '3' }, [[null, '逆序编号甲'], [null, '逆序编号乙']]],
                    [{ start: '3' }, [['3', '跳号编号甲'], ['8', '跳号编号乙']]]
                ]) {
                    const list = node('ol', '', attrs);
                    for (const [value, text] of items) list.append(node('li', text, value === null ? {} : { value }));
                    markdown.append(list);
                }
                const chunk = node('ms-text-chunk');
                chunk.append(markdown);
                content.replaceChildren(chunk);
            }, rawCode);
            await openNotes(edge);
            assert(await edge.locator(ids.warning).isVisible());
            const warning = await edge.locator(ids.warning).textContent();
            assert.match(warning, /表格/);
            assert.match(warning, /编号|列表/);
            const file = await downloadMarkdown(edge, scratch, 'markdown-boundaries-smoke.md');
            await withRenderedMarkdown(context, harness, file, async rendered => {
                assert.equal((await rendered.locator('pre code').textContent()).replace(/\n$/, ''), rawCode.replace(/\n$/, ''), '复杂表格中的代码空行或反斜杠丢失');
                assert.equal(await rendered.locator('.katex-display').count(), 1, '表内块公式未保持块结构');
                assert.equal(await rendered.locator('annotation[encoding="application/x-tex"]').textContent(), '\\left\\|x\\right\\| = 1');
                const text = await rendered.locator('body').textContent();
                for (const expected of ['复杂表格标题', '表内列表内容', '\\|x\\|', '-2. 负数编号甲', '-1. 负数编号乙', '3. 逆序编号甲', '2. 逆序编号乙', '3. 跳号编号甲', '8. 跳号编号乙']) assert(text.includes(expected), expected + '在渲染后丢失');
                assert.equal(await rendered.locator('ol').count(), 0, '不能精确保留的编号仍被Markdown重新编号');
            });
        } finally {
            await edge.close();
        }
    });

    await check('缺少公式源码与图片附件明确提示，未知或空问答不假报提取成功', async () => {
        const missingMath = await syntheticPage(null, '/prompts/missing-tex');
        try {
            await missingMath.locator('.model .turn-content').evaluate(content => {
                for (const annotation of content.querySelectorAll('annotation[encoding="application/x-tex"]')) annotation.remove();
                for (const node of content.querySelectorAll('[data-tex], [data-latex]')) {
                    node.removeAttribute('data-tex');
                    node.removeAttribute('data-latex');
                }
                const image = document.createElement('img');
                image.alt = '示例附件图片';
                content.append(image);
            });
            await openNotes(missingMath);
            assert(await missingMath.locator(ids.warning).isVisible());
            assert.match(await missingMath.locator(ids.warning).textContent(), /公式|TeX|LaTeX/);
            assert.match(await missingMath.locator(ids.warning).textContent(), /附件/);
            assert((await missingMath.locator(ids.body).inputValue()).includes('〔附件待保存：示例附件图片〕'));
        } finally {
            await missingMath.close();
        }
        for (const unknown of [false, true]) {
            const empty = await syntheticPage(null, '/prompts/empty');
            try {
                await empty.locator('.model .turn-content').evaluate((element, unknown) => {
                    element.replaceChildren();
                    if (unknown) element.className = 'unknown-answer-shape';
                }, unknown);
                await openNotes(empty);
                assert(await empty.locator(ids.error).isVisible());
                assert.match(await empty.locator(ids.error).textContent(), unknown ? /未识别.*正文|正文.*结构/ : /尚无.*正文|正文.*为空|正文.*空/);
                assert.equal((await empty.locator(ids.body).inputValue()).trim(), '');
            } finally {
                await empty.close();
            }
        }
    });
}
