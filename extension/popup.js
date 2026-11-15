'use strict';

const status = document.getElementById('status');
const buttons = [...document.querySelectorAll('button')];

function setBusy(busy) {
    for (const button of buttons) button.disabled = busy;
}

function showError(error) {
    status.textContent = error.message;
    status.setAttribute('data-error', '');
    console.error('[纸间阅读]', error);
}

async function sendToReader(type) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error('没有找到当前标签页。请打开 AI Studio 对话页。');
    let response;
    try {
        response = await chrome.tabs.sendMessage(tab.id, { type });
    } catch (error) {
        throw new Error('无法连接当前页面。请打开 AI Studio 对话页；安装前已打开的页面需要刷新一次。', { cause: error });
    }
    if (!response || typeof response.ok !== 'boolean') throw new Error('扩展返回了无效响应，请重新加载扩展后刷新对话页。');
    if (!response.ok) throw new Error(response.error);
    return response;
}

async function activate(type) {
    setBusy(true);
    try {
        await sendToReader(type);
        window.close();
    } catch (error) {
        showError(error);
        setBusy(false);
    }
}

document.getElementById('open-settings').addEventListener('click', () => activate('air:open-settings'));
document.getElementById('record-note').addEventListener('click', () => activate('air:record-note'));

(async () => {
    try {
        await sendToReader('air:get-state');
        status.textContent = '已连接 AI Studio，可以调整外观或记录问答。';
        setBusy(false);
    } catch (error) {
        showError(error);
    }
})();
