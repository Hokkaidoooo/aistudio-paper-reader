import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairCitations, repairCitationFile } from '../tools/repair-citations.mjs';

const broken = String.raw`\[[15](<https://example.org/search?q=R%26D&lang=zh>)\]`;
const repaired = '&#91;[15](<https://example.org/search?q=R%26D&lang=zh>)&#93;';

test('数字引用修复只替换外层括号，完整保留链接及相邻正文', () => {
    const source = `引用${broken}${broken}。\n\n$\\begin{aligned}a&=b\\\\c&=d\\end{aligned}$`;
    const result = repairCitations(source);
    assert.equal(result.count, 2);
    assert.deepEqual(result.lines, [1, 1]);
    assert.equal(result.markdown, source.replaceAll(broken, repaired));
    assert.equal(repairCitations(result.markdown).count, 0);
});

test('括号嵌套与标题中的引用保留原始 Markdown 链接语法', () => {
    const source = String.raw`# 参考 \[[9](https://example.org/a_(b)?q=1&n=2 "资料标题")\]`;
    assert.equal(repairCitations(source).markdown, source.replace('\\[', '&#91;').replace('\\]', '&#93;'));
});

test('代码围栏、行内代码、缩进代码和 HTML 块中的示例不被修复', () => {
    const source = ['```md', broken, '```', '', '`' + broken + '`', '', '    ' + broken, '', '<pre>', broken, '</pre>', '', broken].join('\n');
    const result = repairCitations(source);
    assert.equal(result.count, 1);
    assert.equal(result.markdown, source.slice(0, -broken.length) + repaired);
});

test('美元及反斜杠定界的真实公式保持原样', () => {
    const source = ['$' + broken + '$', '', '$$', '\\text{' + broken + '}', '$$', '', '\\[x+' + broken + '\\]', '', '\\(x+' + broken + '\\)', '', broken].join('\n');
    const result = repairCitations(source);
    assert.equal(result.count, 1);
    assert.equal(result.markdown, source.slice(0, -broken.length) + repaired);
});

test('未知标签、相对链接、普通括号及未闭合结构不做猜测修复', () => {
    const source = String.raw`\[[参考](<https://example.org/>)\] \[[1](../reference)\] [1](<https://example.org/>) \[a+b\] \[[2](<https://example.org/>)`;
    assert.equal(repairCitations(source).count, 0);
    assert.equal(repairCitations(source).markdown, source);
});

test('BOM、CRLF 和多行正文按原字符保留', () => {
    const source = '\uFEFF# 标题\r\n\r\n' + broken + '\r\n';
    const result = repairCitations(source);
    assert.equal(result.count, 1);
    assert.equal(result.markdown, source.replace(broken, repaired));
});

test('文件修复另存并拒绝覆盖，无匹配时不创建输出', async () => {
    const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const scratch = await mkdtemp(path.join(workspace, '.citation-test-'));
    try {
        const input = path.join(scratch, 'input.md');
        const output = path.join(scratch, 'output.md');
        await writeFile(input, broken, 'utf8');
        await assert.rejects(repairCitationFile(input, input), /不能覆盖原文件/);
        assert.equal((await repairCitationFile(input, output)).count, 1);
        assert.equal(await readFile(input, 'utf8'), broken);
        assert.equal(await readFile(output, 'utf8'), repaired);
        await assert.rejects(repairCitationFile(input, output), { code: 'EEXIST' });
        await assert.rejects(repairCitationFile(output, path.join(scratch, 'unchanged.md')), /未发现可确认/);
        await assert.rejects(readFile(path.join(scratch, 'unchanged.md')), { code: 'ENOENT' });
    } finally {
        assert.ok(scratch.startsWith(workspace + path.sep) && path.basename(scratch).startsWith('.citation-test-'));
        await rm(scratch, { recursive: true });
    }
});
