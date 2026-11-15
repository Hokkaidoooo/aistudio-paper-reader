import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
const output = path.join(root, 'dist');
await mkdir(output, { recursive: true });

async function collect(directory, prefix = '') {
    const files = {};
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = prefix + entry.name;
        const target = path.join(directory, entry.name);
        assert(!entry.isSymbolicLink(), `扩展中不能包含符号链接：${name}`);
        if (entry.isDirectory()) Object.assign(files, await collect(target, name + '/'));
        else if (entry.isFile()) files[name] = new Uint8Array(await readFile(target));
        else throw new Error(`不支持的文件类型：${name}`);
    }
    return files;
}

const files = await collect(extension);
files['LICENSE'] = new Uint8Array(await readFile(path.join(root, 'LICENSE')));
const archiveFiles = Object.fromEntries(Object.entries(files).sort().map(([name, bytes]) => [name, [bytes, { mtime: new Date(2026, 0, 1) }]]));
const archive = zipSync(archiveFiles, { level: 9 });
const restored = unzipSync(archive);
assert.deepEqual(Object.keys(restored).sort(), Object.keys(files).sort());
for (const [name, bytes] of Object.entries(files)) assert.deepEqual(restored[name], bytes, `ZIP 内容不一致：${name}`);
const filename = `aistudio-paper-reader-${manifest.version}.zip`;
await writeFile(path.join(output, filename), archive);
const sha256 = createHash('sha256').update(archive).digest('hex');
await writeFile(path.join(output, filename + '.sha256'), `${sha256}  ${filename}\n`, 'utf8');
console.log(`已生成 dist/${filename}，${Object.keys(files).length} 个文件，SHA-256 ${sha256}`);
