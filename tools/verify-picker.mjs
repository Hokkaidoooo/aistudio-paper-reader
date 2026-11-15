import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function isolatedValue(client, contextId, expression) {
    const result = await client.send('Runtime.evaluate', {
        contextId, expression, awaitPromise: true, returnByValue: true
    });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
}

export async function verifyNativePicker({ context, check, source, fixture, scratch }) {
    const localPath = path.join(scratch, 'native-picker.html');
    await writeFile(localPath, fixture, 'utf8');
    const page = await context.newPage();
    try {
        await page.goto(pathToFileURL(localPath).href);
        const client = await context.newCDPSession(page);
        const { frameTree } = await client.send('Page.getFrameTree');
        const { executionContextId } = await client.send('Page.createIsolatedWorld', {
            frameId: frameTree.frame.id, worldName: 'air-native-picker-verification'
        });
        const evaluate = expression => isolatedValue(client, executionContextId, expression);
        await evaluate(`(() => {
            const owner = document.defaultView;
            window.__pickerNative = owner.showSaveFilePicker;
            window.__pickerCalls = [];
            window.__pickerWindow = new Proxy(owner, {
                get(target, key) {
                    const value = Reflect.get(target, key, target);
                    return key === 'showSaveFilePicker' || typeof value !== 'function' ? value : value.bind(target);
                }
            });
            window.__pickerLocation = {
                protocol: 'https:', hostname: 'aistudio.google.com',
                origin: 'https://aistudio.google.com',
                href: 'https://aistudio.google.com/prompts/native-picker-fixture',
                pathname: '/prompts/native-picker-fixture'
            };
            window.__pickerChrome = {
                storage: { local: { get: async () => ({}), set: async () => {} } },
                runtime: { onMessage: { addListener: () => {} } }
            };
            document.addEventListener('click', event => {
                if (event.composedPath()[0].id === 'note-save') {
                    window.__pickerCalls.push({ trusted: event.isTrusted, active: navigator.userActivation.isActive });
                }
            }, true);
        })()`);

        await check('原生文件接口在隔离世界拒绝包装 Window，并接受文档所属 Window 的接收者', async () => {
            const result = await evaluate(`(async () => {
                const owner = document.defaultView;
                const result = {
                    secure: isSecureContext,
                    native: typeof owner.showSaveFilePicker === 'function' && owner.showSaveFilePicker.toString().includes('[native code]'),
                    active: navigator.userActivation.isActive
                };
                for (const [name, receiver] of [['wrapped', window.__pickerWindow], ['documentWindow', owner]]) {
                    try { await receiver.showSaveFilePicker({ suggestedName: 'native-control.md' }); result[name] = { resolved: true }; }
                    catch (error) { result[name] = { name: error.name, message: error.message }; }
                }
                return result;
            })()`);
            assert(result.secure && result.native, '必须调用安全上下文中的真实 Chromium 原生 API');
            assert.equal(result.active, false, '负向检查不得显示系统窗口');
            assert.equal(result.wrapped.name, 'TypeError');
            assert.match(result.wrapped.message, /Illegal invocation/);
            assert.equal(result.documentWindow.name, 'SecurityError');
            assert.match(result.documentWindow.message, /user gesture/i);
            await writeFile(path.join(scratch, 'native-picker-receiver.json'), JSON.stringify(result, null, 2));
        });

        await check('保存按钮在隔离包装环境调用真实原生选择器，保留点击激活且取消后草稿不变', async () => {
            await evaluate(`(function(window, location, chrome) { return ${source}\n})(window.__pickerWindow, window.__pickerLocation, window.__pickerChrome)`);
            await page.getByRole('button', { name: '阅读设置', exact: true }).click();
            await page.locator('#reader-record').click();
            const before = await page.locator('#note-body').inputValue();
            assert(before.includes('## 我的问题') && before.includes('## AI 回答'));
            assert(await page.locator('#note-save').isEnabled());
            await page.locator('#note-save').click();
            await page.waitForFunction(() => {
                const root = document.getElementById('air-reader-controls').shadowRoot;
                return !root.getElementById('note-error').hidden
                    || root.getElementById('note-status').textContent.includes('已取消保存');
            }, null, { timeout: 10000 });
            assert(await page.locator('#note-error').isHidden(), await page.locator('#note-error').textContent());
            // Chromium 无头模式会取消原生选择窗口；验证接收者和激活，不冒充实际落盘。
            assert.match(await page.locator('#note-status').textContent(), /已取消保存/);
            assert.equal(await page.locator('#note-body').inputValue(), before);
            assert(await page.locator('#note-save').isEnabled());
            const trace = await evaluate(`({
                sameNative: window.__pickerNative === document.defaultView.showSaveFilePicker,
                clicks: window.__pickerCalls
            })`);
            assert.equal(trace.sameNative, true, '不得用测试替身替换原生选择器');
            assert.deepEqual(trace.clicks, [{ trusted: true, active: true }]);
        });
    } finally {
        await page.close();
    }
}
