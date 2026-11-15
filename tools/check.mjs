import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'extension', 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.content_scripts.flatMap(item => item.matches), ['https://aistudio.google.com/*']);
assert(!manifest.background && !manifest.host_permissions && !manifest.web_accessible_resources);
const references = [...manifest.content_scripts.flatMap(item => item.js), manifest.action.default_popup,
    ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
for (const name of new Set(references)) {
    const target = path.resolve(root, 'extension', name);
    assert(target.startsWith(path.join(root, 'extension') + path.sep), `资源路径越界：${name}`);
    assert((await stat(target)).isFile(), `缺少扩展资源：${name}`);
}

async function checkDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await checkDirectory(target);
        if (entry.isFile() && /\.(?:mjs|js)$/.test(entry.name)) {
            const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
            assert.equal(result.status, 0, result.stderr || result.error?.message);
        }
    }
}
for (const name of ['extension', 'tools', 'tests']) await checkDirectory(path.join(root, name));
const reader = await readFile(path.join(root, 'extension', 'reader.js'), 'utf8');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|GM_xmlhttpRequest)\b/.test(reader), '阅读脚本不得包含网络请求');
assert(!/\bGM_(?:getValue|setValue)\b/.test(reader), '扩展不得依赖油猴存储');
console.log('JavaScript 语法、MV3 资源、权限与版本检查通过。');
