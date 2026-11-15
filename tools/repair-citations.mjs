import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const PROTECTED_NODES = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html']);

function within(offset, ranges) {
    return ranges.some(range => offset >= range.start && offset < range.end);
}

function activeSlash(source, offset) {
    let preceding = offset - 1;
    while (preceding >= 0 && source[preceding] === '\\') preceding--;
    return (offset - preceding - 1) % 2 === 0;
}

function citationCandidate(node, source) {
    if (node.type !== 'link' || node.children.length !== 1) return null;
    const [label] = node.children;
    if (label.type !== 'text' || !/^\d+$/.test(label.value)) return null;
    if (!/^https?:\/\//i.test(node.url)) return null;
    const start = node.position.start.offset - 2;
    const end = node.position.end.offset + 2;
    if (source.slice(start, start + 2) !== '\\[' || source.slice(end - 2, end) !== '\\]') return null;
    if (!activeSlash(source, start) || !activeSlash(source, end - 2)) return null;
    if (/[\r\n]/.test(source.slice(start, end))) return null;
    return { start, end, line: node.position.start.line };
}

function collectNodes(node, source, candidates, protectedRanges) {
    if (PROTECTED_NODES.has(node.type)) {
        protectedRanges.push({ start: node.position.start.offset, end: node.position.end.offset });
        return;
    }
    const candidate = citationCandidate(node, source);
    if (candidate) candidates.push(candidate);
    for (const child of node.children || []) collectNodes(child, source, candidates, protectedRanges);
}

function slashMathRanges(source, protectedRanges, candidates) {
    const ranges = [];
    const stack = [];
    const citations = new Map(candidates.map(candidate => [candidate.start, candidate.end]));
    for (const match of source.matchAll(/\\[\[\]()]/g)) {
        const offset = match.index;
        if (!activeSlash(source, offset) || within(offset, protectedRanges)) continue;
        const delimiter = match[0][1];
        if (delimiter === '[' || delimiter === '(') {
            stack.push({ start: offset, delimiter });
            continue;
        }
        const opening = stack.at(-1);
        if (!opening || opening.delimiter !== (delimiter === ']' ? '[' : '(')) continue;
        stack.pop();
        const end = offset + 2;
        // 仅整个定界区域恰好是一条数字引用时，才将它认定为旧导出器的括号。
        const exactCitation = opening.delimiter === '[' && citations.get(opening.start) === end && stack.length === 0;
        if (!exactCitation) ranges.push({ start: opening.start, end });
    }
    for (const opening of stack) ranges.push({ start: opening.start, end: source.length });
    return ranges;
}

export function repairCitations(input) {
    if (typeof input !== 'string') throw new TypeError('Markdown 输入必须是字符串。');
    // remark 的 offset 不包含 BOM；先分离它，避免按错位置替换正文。
    const prefix = input.startsWith('\uFEFF') ? '\uFEFF' : '';
    const source = input.slice(prefix.length);
    const candidates = [];
    const protectedRanges = [];
    collectNodes(parser.parse(source), source, candidates, protectedRanges);
    protectedRanges.push(...slashMathRanges(source, protectedRanges, candidates));
    const changes = candidates.filter(candidate => !protectedRanges.some(range => candidate.start < range.end && candidate.end > range.start));
    let markdown = source;
    for (const { start, end } of [...changes].reverse()) {
        markdown = markdown.slice(0, start) + '&#91;' + markdown.slice(start + 2, end - 2) + '&#93;' + markdown.slice(end);
    }
    return { markdown: prefix + markdown, count: changes.length, lines: changes.map(change => change.line) };
}

export async function repairCitationFile(input, output) {
    if (!input || !output) throw new Error('用法：npm run repair:citations -- <原文件.md> <另存文件.md>');
    const inputPath = path.resolve(input);
    const outputPath = path.resolve(output);
    const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
    if (comparable(inputPath) === comparable(outputPath)) throw new Error('输出必须另存为新文件，不能覆盖原文件。');
    const result = repairCitations(await readFile(inputPath, 'utf8'));
    if (result.count === 0) throw new Error('未发现可确认的引用转义问题，未写入输出文件。');
    await writeFile(outputPath, result.markdown, { encoding: 'utf8', flag: 'wx' });
    return { count: result.count, inputPath, outputPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.length !== 4) throw new Error('用法：npm run repair:citations -- <原文件.md> <另存文件.md>');
        const result = await repairCitationFile(process.argv[2], process.argv[3]);
        console.log(`已修复 ${result.count} 处引用括号，另存为：${result.outputPath}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
