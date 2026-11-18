import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkSmartypants from 'remark-smartypants';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const katexCss = await readFile(new URL(import.meta.resolve('katex/dist/katex.min.css')), 'utf8');

const blogSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.enum(['learning', 'life', 'creating']),
    tags: z.array(z.string().min(1)).min(1).max(5),
    cover: z.literal('writing'),
    featured: z.literal(false),
    draft: z.literal(true)
}).strict();

export function createMarkdownHarness() {
    const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkSmartypants)
        .use(remarkRehype, { handlers: {
            html(_state, node) {
                if (/^<br\s*\/?>$/i.test(node.value)) return { type: 'element', tagName: 'br', properties: {}, children: [] };
            }
        } })
        .use(rehypeKatex)
        .use(rehypeStringify);
    function parse(text) {
        const matched = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        assert(matched, '下载文件缺少 YAML frontmatter');
        return { metadata: parseYaml(matched[1]), body: text.slice(matched[0].length) };
    }
    return {
        parse,
        schema: blogSchema,
        renderer: {
            async render(body) {
                const rendered = await processor.process(body);
                assert.equal(rendered.messages.length, 0, rendered.messages.map(message => message.message).join('\n'));
                return { code: String(rendered), css: katexCss };
            }
        }
    };
}
