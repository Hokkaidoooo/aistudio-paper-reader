import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { repairCitations } from '../tools/repair-citations.mjs';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const markdownRenderer = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify);
const broken = String.raw`\[[15](<https://example.org/search?lang=zh&q=R%26D>)\]`;

function renderMath(html) {
    const document = mathjax.document(html, {
        InputJax: new TeX({
            packages: AllPackages,
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']]
        }),
        OutputJax: new SVG({ fontCache: 'none' })
    });
    document.render();
    return {
        math: [...document.math].map(item => ({ source: item.math, display: item.display })),
        html: adaptor.outerHTML(adaptor.body(document.document))
    };
}

function scanMarkdownMath(source) {
    const text = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return renderMath(`<p>${text}</p>`);
}

test('真实 MathJax 将旧引用定界识别为块公式并报告 Misplaced &', () => {
    const result = scanMarkdownMath(broken);
    assert.equal(result.math.length, 1);
    assert.equal(result.math[0].display, true);
    assert.equal(result.math[0].source, broken.slice(2, -2));
    assert.match(result.html, /data-mml-node="merror"/);
    assert.match(result.html, /data-mjx-error="Misplaced &"/);
});

test('修复后引用不进入公式扫描，Markdown 仍渲染完整可点击链接', async () => {
    const { markdown } = repairCitations('引用' + broken + '。');
    const scanned = scanMarkdownMath(markdown);
    assert.equal(scanned.math.length, 0);
    assert.doesNotMatch(scanned.html, /data-mml-node="merror"/);
    const rendered = String(await markdownRenderer.process(markdown));
    assert.equal(rendered, '<p>引用[<a href="https://example.org/search?lang=zh&#x26;q=R%26D">15</a>]。</p>');
    const final = renderMath(rendered);
    assert.equal(final.math.length, 0);
    assert.doesNotMatch(final.html, /data-mml-node="merror"/);
});

test('修复引用后 aligned、matrix 和转义 ampersand 公式保持可渲染', async () => {
    const formulas = [
        String.raw`$\begin{aligned}a&=b\\c&=d\end{aligned}$`,
        String.raw`\[\begin{matrix}1&2\\3&4\end{matrix}\]`,
        String.raw`\(\text{R\&D}\)`
    ];
    const source = broken + '\n\n' + formulas.join('\n\n');
    const repaired = repairCitations(source);
    assert.equal(repaired.count, 1);
    for (const formula of formulas) assert.ok(repaired.markdown.includes(formula));
    const result = scanMarkdownMath(repaired.markdown);
    assert.equal(result.math.length, 3);
    assert.doesNotMatch(result.html, /data-mml-node="merror"|data-mjx-error=/);
});
