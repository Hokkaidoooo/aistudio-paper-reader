(async () => {
    'use strict';

    if (location.protocol !== 'https:' || location.hostname !== 'aistudio.google.com') return;
    if (document.getElementById('air-reader-controls')) return;

    const STORAGE_KEY = 'air-reader-settings-v1';
    const MODEL = ':is(ms-chat-turn .chat-turn-container.model, ms-chat-turn[data-turn-role="model" i] .chat-turn-container)';
    const TURN = 'ms-chat-turn .chat-turn-container';
    const ACTIVE = 'html[data-air-active]';
    const THEMES = Object.freeze({
        paper: { name: '宣纸', note: '温润纸色，适合白天慢读', bg: '#eeeae0', paper: '#faf7ef', text: '#343c36', title: '#233c31', muted: '#626a60', accent: '#49694e', border: '#d7d9cb', soft: '#e9ecdf', code: '#eeeee3', selection: '#d2dfc4', keyword: '#84503a', string: '#41633d', number: '#71527a', comment: '#626a60', scheme: 'light' },
        mist: { name: '雾蓝', note: '清爽冷色，适合资料与代码', bg: '#e5ecee', paper: '#f3f8fa', text: '#30424b', title: '#213b4c', muted: '#5c6f79', accent: '#386981', border: '#cbd9df', soft: '#e4eef2', code: '#e7eff3', selection: '#c8dfe8', keyword: '#795071', string: '#376453', number: '#70532e', comment: '#5c6f79', scheme: 'light' },
        sage: { name: '青苔', note: '柔和绿调，适合安静长读', bg: '#e4ebe2', paper: '#f3f7ee', text: '#334335', title: '#294331', muted: '#5d6d5c', accent: '#486b4a', border: '#ccd8c6', soft: '#e3ebdc', code: '#e7edde', selection: '#c9dcbe', keyword: '#80503c', string: '#3c653c', number: '#71547a', comment: '#5d6d5c', scheme: 'light' },
        night: { name: '夜读', note: '低亮灰绿，适合较暗的环境', bg: '#1c2524', paper: '#25302e', text: '#d5dfd8', title: '#e5ece1', muted: '#a5b6aa', accent: '#b1cba4', border: '#45544c', soft: '#303e36', code: '#202b28', selection: '#455c45', keyword: '#e6b493', string: '#b1cba4', number: '#d3b9dd', comment: '#a5b6aa', scheme: 'dark' }
    });
    const FONTS = Object.freeze({
        sans: { name: '清晰黑体', stack: '"Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif' },
        serif: { name: '书卷宋体', stack: '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", serif' },
        wenkai: { name: '文楷 / 楷体', stack: '"LXGW WenKai", "LXGW WenKai Screen", "KaiTi", "STKaiti", serif' }
    });
    const DEFAULTS = Object.freeze({ enabled: true, theme: 'paper', font: 'sans', size: 18, leading: 1.9, width: 880, wrapCode: false });
    const RANGES = Object.freeze({ size: [16, 24, 1], leading: [1.6, 2.2, 0.05], width: [640, 1120, 40] });
    const THOUGHT_CONTENT = 'ms-thought-chunk, ms-thinking-chunk, ms-thoughts, ms-thoughts-chunk, .thought-chunk, .thoughts-container, .thinking-container';
    const NOTE_IGNORED = `button, input, select, style, noscript, template, [role="toolbar"], mat-icon, .material-icons, .material-symbols-outlined, .code-block-header, .actions-container, .turn-information, .turn-header, .chat-turn-header, .author-label, .author-name, .role-label, .timestamp, .turn-footer, ms-chat-turn-options, ${THOUGHT_CONTENT}`;
    const NOTE_TEXT_CONTENT = 'ms-text-chunk, ms-cmark-node, .cmark-node, .markdown';
    const NOTE_MATH = 'ms-katex, .katex-display, .katex, mjx-container, math, script[type^="math/tex"]';
    const NOTE_CONTENT = `.user-prompt-container, .model-prompt-container, ms-prompt-chunk, ${NOTE_TEXT_CONTENT}, textarea, ms-code-block, ms-katex, ms-image-chunk, ms-audio-chunk, ms-video-chunk, ms-file-chunk`;
    const MESSAGE_HEADER = /^(?:User|Model|Assistant|用户|模型|你)\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?$/i;
    // 原站与阅读区域共用同一套主题值，避免原生深色组件与浅色正文混用。
    const NATIVE_COLORS = Object.freeze({
        '--color-v3-surface': 'bg',
        '--color-v3-surface-left-nav': 'soft',
        '--color-v3-surface-container': 'paper',
        '--color-v3-surface-container-high': 'soft',
        '--color-v3-surface-container-highest': 'soft',
        '--color-v3-button-container': 'paper',
        '--color-v3-button-container-high': 'soft',
        '--color-v3-button-container-highest': 'border',
        '--color-v3-button-container-accent': 'accent',
        '--color-v3-text': 'text',
        '--color-v3-text-var': 'muted',
        '--color-v3-text-disable': 'muted',
        '--color-v3-text-on-button': 'text',
        '--color-v3-text-on-button-reverse': 'paper',
        '--color-v3-text-link': 'accent',
        '--color-v3-outline': 'border',
        '--color-v3-outline-var': 'border',
        '--color-v3-outline-accent': 'accent',
        '--color-v3-hover': 'soft',
        '--color-v3-inline-code-container': 'code',
        '--color-v3-inline-code-text': 'text',
        '--color-v3-accent-1': 'accent',
        '--color-on-surface': 'text',
        '--color-on-surface-variant': 'muted',
        '--color-logo-lockup': 'title',
        '--color-run-settings-text': 'text',
        '--color-loading-background': 'soft',
        '--color-loading-background-contrast': 'border'
    });

    function validateSettings(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置必须是对象');
        if (typeof value.enabled !== 'boolean' || typeof value.wrapCode !== 'boolean') throw new Error('开关设置无效');
        if (!Object.hasOwn(THEMES, value.theme) || !Object.hasOwn(FONTS, value.font)) throw new Error('主题或字体设置无效');
        for (const [key, [min, max, step]] of Object.entries(RANGES)) {
            const number = value[key];
            if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${key} 超出范围`);
            if (Math.abs((number - min) / step - Math.round((number - min) / step)) > 0.00001) throw new Error(`${key} 步长无效`);
        }
        return Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, value[key]]));
    }

    async function loadSettings() {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        return stored[STORAGE_KEY] === undefined ? { ...DEFAULTS } : validateSettings(stored[STORAGE_KEY]);
    }

    let settings;
    let storageError = '';
    try {
        settings = await loadSettings();
    } catch (error) {
        settings = { ...DEFAULTS, enabled: false };
        storageError = `设置读取失败，阅读优化已暂停。${error.message}。请点“恢复默认”重置。`;
        console.error('[纸间阅读]', error);
    }

    const pageStyle = document.createElement('style');
    pageStyle.id = 'air-reader-page-style';
    const nativeColorRules = Object.entries(NATIVE_COLORS).map(([name, key]) => `${name}:var(--air-${key}) !important;`).join('');
    pageStyle.textContent = `
${ACTIVE}, ${ACTIVE} body {
    background: var(--air-bg) !important;
    color: var(--air-text) !important;
    color-scheme: var(--air-scheme) !important;
}
${ACTIVE} body {
    ${nativeColorRules}
    --color-v3-overlay-background: color-mix(in srgb, var(--air-bg) 24%, transparent) !important;
    --v3-shadow-xs: none !important;
    --v3-shadow-sm: none !important;
    --v3-shadow-md: none !important;
    --v3-shadow-lg: none !important;
}
${ACTIVE} :is(app-root, ms-app, .banner-and-app-container, .makersuite-layout, .layout-wrapper, .layout-main, ms-prompt-renderer, ms-chat-prompt, ms-chunk-editor, .chunk-editor-main, .chat-container, .chat-view-container, ms-autoscroll-container) {
    background: var(--air-bg) !important;
    color: var(--air-text) !important;
}
/* 隐藏原生区域但保留节点和草稿；退出阅读后由原站样式恢复。 */
${ACTIVE} :is(ms-navbar-v2, ms-right-side-panel, ms-prompt-box, ms-chat-bottom-overlay),
${ACTIVE} .chunk-editor-main > footer { display: none !important; }
${ACTIVE} .makersuite-layout {
    grid-template-columns: minmax(0, 1fr) !important;
    column-gap: 0 !important;
}
${ACTIVE} :is(.layout-wrapper, .layout-main) {
    box-sizing: border-box !important;
    grid-column: 1 / -1 !important;
    flex: 1 1 auto !important;
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    margin-inline: 0 !important;
}
${ACTIVE} :is(ms-header, ms-playground-toolbar) {
    background: var(--air-bg) !important;
    color: var(--air-text) !important;
    border-color: var(--air-border) !important;
}
${ACTIVE} ms-playground-toolbar :is(a, button, h1, h2, h3, label, .mode-title, .section-title) { color: var(--air-text) !important; }
${ACTIVE} :is(.ms-button-icon, .ms-button-borderless, ms-token-count) { color: var(--air-muted) !important; }
${ACTIVE} :is(.mat-mdc-menu-panel, .mat-mdc-select-panel, .mdc-dialog__surface) {
    background: var(--air-paper) !important;
    color: var(--air-text) !important;
    border-color: var(--air-border) !important;
}
${ACTIVE} ms-playground-toolbar { box-shadow: none !important; }
${ACTIVE} :is(ms-playground-toolbar, .chat-container)::before,
${ACTIVE} :is(ms-playground-toolbar, .chat-container)::after {
    background: none !important;
    box-shadow: none !important;
}
${ACTIVE} :is(button, a, input, textarea, select, mat-select):focus-visible { outline-color: var(--air-accent) !important; }
${ACTIVE} ms-autoscroll-container { scrollbar-color: var(--air-border) var(--air-bg); }
${ACTIVE} ms-chat-turn { min-width: 0; }
${ACTIVE} ${TURN} {
    box-sizing: border-box !important;
    max-width: min(var(--air-width), 100%) !important;
    margin: 16px auto !important;
    border: 0 !important;
    box-shadow: none !important;
    color: var(--air-text) !important;
}
${ACTIVE} ${MODEL} {
    background: var(--air-paper) !important;
    border-radius: 14px !important;
    padding: clamp(20px, 3vw, 38px) !important;
    color-scheme: var(--air-scheme);
}
${ACTIVE} ms-chat-turn .chat-turn-container.user {
    background: var(--air-soft) !important;
    border-radius: 12px !important;
    padding: 16px 24px !important;
}
${ACTIVE} ms-chat-turn .chat-turn-container.user :is(.turn-content, ms-text-chunk, ms-cmark-node) { color: var(--air-text) !important; }
${ACTIVE} ${TURN} :is(.turn-content, .turn-content-container, .model-prompt-container, .user-prompt-container) {
    background: transparent !important;
    min-width: 0 !important;
}
${ACTIVE} ${MODEL} :is(.turn-content, ms-text-chunk) {
    font-family: var(--air-font) !important;
    font-size: var(--air-size) !important;
    line-height: var(--air-leading) !important;
    letter-spacing: .015em !important;
    color: var(--air-text) !important;
    overflow-wrap: anywhere;
}
${ACTIVE} ${MODEL} ms-cmark-node {
    font-family: inherit !important;
    font-size: inherit !important;
    line-height: inherit !important;
    color: inherit !important;
    overflow-wrap: anywhere;
}
${ACTIVE} ${MODEL} :is(p, li, blockquote, table) {
    font-family: var(--air-font) !important;
    font-size: var(--air-size) !important;
    line-height: var(--air-leading) !important;
    color: var(--air-text) !important;
}
${ACTIVE} ${MODEL} p { margin-block: .8em !important; }
${ACTIVE} ${MODEL} :is(h1, h2, h3, h4, h5, h6) {
    font-family: var(--air-font) !important;
    color: var(--air-title) !important;
    font-weight: 650 !important;
    line-height: 1.5 !important;
    margin-block: 1.6em .65em !important;
    text-wrap: pretty;
}
${ACTIVE} ${MODEL} h1 { font-size: 1.55em !important; }
${ACTIVE} ${MODEL} h2 { font-size: 1.3em !important; padding-bottom: .4em !important; border-bottom: 1px solid var(--air-border) !important; }
${ACTIVE} ${MODEL} h3 { font-size: 1.12em !important; }
${ACTIVE} ${MODEL} :is(h4, h5, h6) { font-size: 1em !important; }
${ACTIVE} ${MODEL} ms-cmark-node > :is(h1, h2, h3):first-child { margin-top: .2em !important; }
${ACTIVE} ${MODEL} :is(strong, b) { color: var(--air-title) !important; font-weight: 650 !important; }
${ACTIVE} ${MODEL} :is(ul, ol) { padding-inline-start: 1.55em !important; margin-block: .8em !important; }
${ACTIVE} ${MODEL} li { margin-block: .35em !important; padding-inline-start: .15em; }
${ACTIVE} ${MODEL} li::marker { color: var(--air-accent); }
${ACTIVE} ${MODEL} blockquote {
    margin: 1.2em 0 !important;
    padding: .65em 1.1em !important;
    border: 0 !important;
    border-inline-start: 3px solid var(--air-accent) !important;
    border-radius: 0 8px 8px 0 !important;
    background: var(--air-soft) !important;
}
${ACTIVE} ${MODEL} a { color: var(--air-accent) !important; text-decoration: underline !important; text-underline-offset: .2em; }
${ACTIVE} ${MODEL} hr { border: 0 !important; border-top: 1px solid var(--air-border) !important; margin-block: 1.8em !important; }
${ACTIVE} ${MODEL} :is(pre, code, kbd, samp):not(ms-katex *, .katex *, mjx-container *) {
    font-family: "Cascadia Code", Consolas, "SFMono-Regular", monospace !important;
    font-size: .88em !important;
    line-height: 1.65 !important;
    letter-spacing: 0 !important;
    text-align: start !important;
    color: var(--air-text) !important;
}
${ACTIVE} ${MODEL} :is(ms-code-block, .code-block, .code-block-container, .code-block-header, .code-block-content) {
    background: var(--air-code) !important;
    color: var(--air-text) !important;
    border-color: var(--air-border) !important;
    min-width: 0 !important;
    max-width: 100% !important;
    color-scheme: var(--air-scheme);
    box-shadow: none !important;
}
${ACTIVE} ${MODEL} ms-code-block { display: block; border: 1px solid var(--air-border) !important; border-radius: 10px !important; margin-block: 1em !important; }
${ACTIVE} ${MODEL} ms-code-block .code-block-container { border: 0 !important; border-radius: 10px !important; }
${ACTIVE} ${MODEL} .code-block-header { color: var(--air-muted) !important; border-bottom: 1px solid var(--air-border) !important; border-radius: 10px 10px 0 0; }
${ACTIVE} ${MODEL} .code-block-header button { color: var(--air-text) !important; background: transparent !important; }
${ACTIVE} ${MODEL} pre:not(ms-katex *, .katex *, mjx-container *) {
    display: block;
    box-sizing: border-box !important;
    max-width: 100% !important;
    overflow-x: auto !important;
    white-space: pre !important;
    overflow-wrap: normal !important;
    padding: 18px 20px !important;
    margin-block: 1em !important;
    border: 1px solid var(--air-border) !important;
    border-radius: 10px !important;
    background: var(--air-code) !important;
    tab-size: 4;
}
${ACTIVE} ${MODEL} ms-code-block pre:not(ms-katex *, .katex *, mjx-container *) { border: 0 !important; margin: 0 !important; border-radius: 0 0 10px 10px !important; }
${ACTIVE} ${MODEL} pre code:not(ms-katex *, .katex *, mjx-container *) {
    font-size: 1em !important;
    background: transparent !important;
    border: 0 !important;
    padding: 0 !important;
    white-space: inherit !important;
    overflow-wrap: inherit !important;
}
${ACTIVE} ${MODEL} pre code:not(ms-katex *, .katex *, mjx-container *) * { color: var(--air-text) !important; }
${ACTIVE} ${MODEL} :not(pre) > code:not(ms-katex *, .katex *, mjx-container *) {
    padding: .15em .35em !important;
    border-radius: 4px !important;
    background: var(--air-code) !important;
}
${ACTIVE}[data-air-wrap-code] ${MODEL} pre:not(ms-katex *, .katex *, mjx-container *) { white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
${ACTIVE} ${MODEL} :is(.hljs-keyword, .hljs-selector-tag, .token.keyword) { color: var(--air-keyword) !important; }
${ACTIVE} ${MODEL} :is(.hljs-string, .hljs-attr, .token.string) { color: var(--air-string) !important; }
${ACTIVE} ${MODEL} :is(.hljs-number, .hljs-literal, .token.number) { color: var(--air-number) !important; }
${ACTIVE} ${MODEL} :is(.hljs-comment, .token.comment) { color: var(--air-comment) !important; font-style: normal !important; }
${ACTIVE} ${MODEL} table {
    display: block !important;
    box-sizing: border-box;
    max-width: 100% !important;
    overflow-x: auto !important;
    border-collapse: collapse !important;
    margin-block: 1.2em !important;
    background: transparent !important;
}
${ACTIVE} ${MODEL} :is(th, td) { padding: .65em .9em !important; border: 1px solid var(--air-border) !important; color: var(--air-text) !important; background: transparent !important; }
${ACTIVE} ${MODEL} th { background: var(--air-soft) !important; color: var(--air-title) !important; font-weight: 650 !important; }
${ACTIVE} ${MODEL} :is(img, video) { max-width: 100% !important; height: auto; border-radius: 8px; }
${ACTIVE} ${MODEL} :is(.katex-display, mjx-container[display="true"]) { max-width: 100%; overflow-x: auto; overflow-y: hidden; overflow-wrap: normal; }
${ACTIVE} ${MODEL} ms-katex { overflow-wrap: normal; }
${ACTIVE} ${TURN} :is(.author-label, .turn-information, .turn-footer) { color: var(--air-muted) !important; }
${ACTIVE} ${TURN} :is(.actions-container, ms-chat-turn-options) { color: var(--air-accent) !important; }
${ACTIVE} ${MODEL} ::selection { background: var(--air-selection); color: var(--air-title); }
@media (max-width: 640px) {
    ${ACTIVE} ${TURN} { margin-block: 12px !important; }
    ${ACTIVE} ${MODEL} { padding: 20px 16px !important; border-radius: 10px !important; }
    ${ACTIVE} ms-chat-turn .chat-turn-container.user { padding: 12px 16px !important; }
    ${ACTIVE} ${MODEL} pre:not(ms-katex *, .katex *, mjx-container *) { padding: 14px 12px !important; }
}
`;
    const paletteStyle = document.createElement('style');
    paletteStyle.id = 'air-reader-palette';
    document.head.append(pageStyle, paletteStyle);

    const host = document.createElement('div');
    host.id = 'air-reader-controls';
    const shadow = host.attachShadow({ mode: 'open' });
    const controlsStyle = document.createElement('style');
    controlsStyle.textContent = `
    :host { all: initial; position: fixed; inset: auto auto 20px 18px; z-index: 10000; font: 14px/1.6 "Segoe UI", "Microsoft YaHei", sans-serif; color: var(--text); color-scheme: var(--scheme); }
    :host([hidden]) { display: none !important; }
    *, *::before, *::after { box-sizing: border-box; }
    button, input, select, textarea { font: inherit; accent-color: var(--accent); }
    button, select { cursor: pointer; }
    button { color: inherit; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    button:disabled { cursor: default; opacity: .55; }
    .launcher { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 15px; border: 1px solid var(--border); border-radius: 24px; background: var(--paper); color: var(--title); box-shadow: 0 3px 16px #00000012; }
    .leaf { width: 11px; height: 15px; border-radius: 9px 2px 9px 2px; background: var(--accent); transform: rotate(24deg); }
    .launcher[aria-pressed="false"] .leaf { background: var(--muted); }
    .panel { position: absolute; left: 0; bottom: 54px; width: min(460px, calc(100vw - 36px)); max-height: calc(100dvh - 86px); overflow-y: auto; overscroll-behavior: contain; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--paper); box-shadow: 0 10px 40px #00000020; }
    .panel > header { align-items: center; margin-bottom: 10px; }
    .panel-content { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 18px; }
    [hidden] { display: none !important; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    h2 { margin: 0; font-size: 19px; font-weight: 650; color: var(--title); letter-spacing: .06em; }
    .subtitle { margin: 4px 0 18px; color: var(--muted); font-size: 12px; }
    .close { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 22px; line-height: 1; }
    .close:hover { background: var(--soft); }
    .themes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .theme { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 4px; border: 1px solid transparent; border-radius: 8px; background: transparent; font-size: 12px; }
    .theme:hover { background: var(--soft); }
    .theme[aria-pressed="true"] { border-color: var(--accent); background: var(--soft); }
    .swatch { display: block; flex: none; width: 17px; height: 17px; border-radius: 50%; background: var(--swatch); border: 1px solid #76837570; }
    .typography { display: grid; align-content: start; gap: 8px; }
    .setting { display: block; min-width: 0; }
    .label { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px; }
    .font-setting { margin-top: 8px; }
    output { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    input[type="range"] { width: 100%; height: 22px; margin: 0; }
    select { width: 100%; min-height: 36px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--paper); color: var(--text); }
    .check { display: flex; align-items: center; gap: 9px; margin-block: 16px; cursor: pointer; }
    .check input { width: 17px; height: 17px; margin: 0; }
    .actions { display: flex; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
    .actions button { flex: 1; min-height: 36px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; background: transparent; }
    .actions button:hover { background: var(--soft); }
    .actions .primary { color: var(--paper); background: var(--accent); border-color: var(--accent); }
    .actions .primary:hover { filter: brightness(.95); background: var(--accent); }
    .status { margin: 14px 0 0; color: var(--muted); font-size: 12px; }
    .error { margin: 12px 0 0; color: var(--text); padding: 10px; border-inline-start: 3px solid var(--accent); background: var(--soft); font-size: 12px; }
    .panel .check { gap: 7px; margin: 8px 0 0; min-height: 24px; font-size: 13px; }
    .panel .check input { flex: none; }
    .panel .actions { margin-top: 10px; padding-top: 10px; gap: 6px; }
    .panel .actions button { padding-inline: 4px; }
    .panel .record-entry { background: var(--soft); color: var(--title); }
    .panel .status { margin-top: 8px; }
    .note-dialog { position: fixed; inset: 24px max(20px, calc((100vw - 900px) / 2)); display: flex; flex-direction: column; gap: 14px; padding: 24px; border: 1px solid var(--border); border-radius: 18px; background: var(--paper); box-shadow: 0 12px 60px #00000040; overflow-y: auto; overscroll-behavior: contain; }
    .note-dialog header { flex: none; }
    .note-dialog h2 { letter-spacing: 0; }
    .note-dialog p { margin: 0; }
    .note-dialog .subtitle { margin-top: 4px; }
    .note-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .note-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .note-wide { grid-column: 1 / -1; }
    .note-dialog input[type="text"], .note-dialog textarea { width: 100%; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; background: var(--paper); color: var(--text); }
    .note-dialog textarea { min-height: 250px; resize: vertical; font: 14px/1.65 Consolas, "Microsoft YaHei", monospace; tab-size: 4; }
    .note-dialog .check { margin: 0; }
    .note-dialog .actions { margin: 0; padding: 0; border: 0; flex-wrap: wrap; }
    .note-dialog .actions a { display: grid; place-items: center; flex: 1; min-height: 36px; padding: 6px 12px; color: var(--text); text-decoration: none; border: 1px solid var(--border); border-radius: 8px; }
    .note-dialog .actions a:hover { background: var(--soft); }
    .note-dialog .actions button, .note-dialog .actions a { white-space: nowrap; }
    .note-dialog .actions button:disabled, .note-dialog .actions a[aria-disabled="true"] { opacity: .6; cursor: wait; }
    .note-destination { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
    .note-dialog .status { color: var(--text); }
    .note-dialog summary { cursor: pointer; color: var(--muted); }
    .note-dialog details textarea { margin-top: 8px; min-height: 180px; }
    @media (max-width: 600px) { .note-dialog { inset: 12px; padding: 16px; gap: 12px; } .note-grid { grid-template-columns: 1fr; } .note-dialog .actions { gap: 8px; } .note-dialog textarea { min-height: 210px; } }
    @media (pointer: coarse) { .close { width: 44px; height: 44px; } .theme, .actions button, select { min-height: 44px; } .check { min-height: 44px; } }
    @media (max-width: 520px) {
        .panel-content { grid-template-columns: minmax(0, 1fr); gap: 10px; }
        .themes { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
        .theme { gap: 4px; }
        .font-setting { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 8px; }
        .font-setting .label { margin: 0; }
        .typography { gap: 6px; }
        .range-setting { display: grid; grid-template-columns: 64px minmax(0, 1fr) 44px; align-items: center; gap: 8px; min-height: 28px; }
        .range-setting .label { display: contents; }
        .range-setting output { grid-column: 3; grid-row: 1; text-align: right; }
        .range-setting input { grid-column: 2; grid-row: 1; min-width: 0; }
    }
    @media (max-height: 600px) { :host { bottom: 12px; } .panel { position: fixed; top: 12px; bottom: auto; left: 18px; max-height: calc(100dvh - 24px); } }
`;

    // 不解析 HTML 字符串；兼容要求 Trusted Types 的页面，也不放宽其安全策略。
    function element(tag, attributes = {}, children = []) {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
        node.append(...children);
        return node;
    }

    function ownedNodes(turn, selector) {
        return [...turn.querySelectorAll(selector)].filter(node => node.closest('ms-chat-turn') === turn);
    }

    function messageRole(turn) {
        const role = turn.getAttribute('data-turn-role')?.toLowerCase();
        if (role) return role === 'assistant' ? 'model' : role;
        const roles = new Set(ownedNodes(turn, '.chat-turn-container').flatMap(node =>
            ['user', 'model'].filter(name => node.classList.contains(name))));
        return roles.size === 1 ? [...roles][0] : 'unknown';
    }

    function conversationPairs() {
        const pairs = [];
        const warnings = new Set();
        let pending = null;
        const finish = () => {
            if (!pending) return;
            if (pending.answers.length) pairs.push(pending);
            else warnings.add('有问题尚无对应 AI 消息，未列入可记录问答。');
            pending = null;
        };
        // 每个消息组件只计一次；同一问题后的 AI 分块归入同一对。
        const turns = [...document.querySelectorAll('ms-chat-turn')].filter(turn => !turn.parentElement.closest('ms-chat-turn'));
        for (const turn of turns) {
            const role = messageRole(turn);
            if (role === 'user') {
                finish();
                pending = { question: turn, answers: [] };
            } else if (role === 'model') {
                if (pending) pending.answers.push(turn);
                else warnings.add('有 AI 消息缺少前面的用户问题，未跨消息猜测配对。');
            } else {
                finish();
                if (role !== 'system') warnings.add('有消息的角色未识别，页面结构可能需要适配；该处未跨消息配对。');
            }
        }
        finish();
        return { pairs, warnings: [...warnings] };
    }

    function noteDecoration(node) {
        if (node.matches(NOTE_IGNORED)) return true;
        if (node.localName === 'textarea') {
            const turn = node.closest('ms-chat-turn');
            // 已发送问题也可能以文本框显示；只读取用户消息里的可见正文，不收录辅助副本。
            return !turn || messageRole(turn) !== 'user' || !node.getClientRects().length
                || getComputedStyle(node).visibility !== 'visible';
        }
        // 消息栏的角色/时间不属于正文；正文组件内的语义标题仍保留。
        if (node.matches('header, time') && !node.closest(NOTE_TEXT_CONTENT)) return true;
        if (!node.matches('.turn-content') || node.querySelector(NOTE_TEXT_CONTENT) || !MESSAGE_HEADER.test(node.textContent.trim())) return false;
        const turn = node.closest('ms-chat-turn');
        return Boolean(turn && ownedNodes(turn, NOTE_TEXT_CONTENT).some(content => !node.contains(content)));
    }

    function visibleNoteContent(node) {
        for (let parent = node; parent && parent.localName !== 'ms-chat-turn'; parent = parent.parentElement) {
            if (noteDecoration(parent) || parent.hidden || parent.getAttribute('aria-hidden') === 'true') return false;
        }
        return true;
    }

    function messageContentRoots(turn, role) {
        const components = ownedNodes(turn, NOTE_CONTENT).filter(visibleNoteContent);
        const legacy = ownedNodes(turn, '.turn-content').filter(node => {
            if (!visibleNoteContent(node)) return false;
            // 旧版纯文字问题仍是正文；只含角色/时间的栏位不作为回答。
            if (components.some(component => node.contains(component))) return true;
            if ([...node.querySelectorAll('p, pre, ul, ol, table, blockquote, h1, h2, h3, img')].some(visibleNoteContent)) return true;
            return role === 'user';
        });
        const candidates = new Set([...components, ...legacy]);
        return [...turn.querySelectorAll(`${NOTE_CONTENT}, .turn-content`)].filter(node => {
            if (!candidates.has(node)) return false;
            for (let parent = node.parentElement; parent && parent !== turn; parent = parent.parentElement) {
                if (candidates.has(parent)) return false;
            }
            return true;
        });
    }

    function hasUnreadContent(node, roots) {
        if (roots.has(node)) return false;
        if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent.trim());
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (noteDecoration(node) || node.hidden || node.getAttribute('aria-hidden') === 'true' || node.localName === 'script') return false;
        if (node.matches('img, video, audio, canvas, svg, iframe, object, embed')) return true;
        return [...node.childNodes].some(child => hasUnreadContent(child, roots));
    }

    function extractMessage(turn, role) {
        const roots = messageContentRoots(turn, role);
        const label = role === 'user' ? '问题' : '回答';
        if (hasUnreadContent(turn, new Set(roots))) throw new Error(`未识别到${label}正文的完整结构，存在尚未提取的内容；请先核对页面结构。`);
        if (!roots.length) {
            if (role === 'model' && ownedNodes(turn, THOUGHT_CONTENT).length) return { body: '', warnings: [] };
            const empty = ownedNodes(turn, '.turn-content').some(node => !node.textContent.trim());
            throw new Error(empty ? `这条${label}尚无可记录的正文。` : `未识别到${label}正文，请确认页面结构后再记录。`);
        }
        const warnings = new Set();

        function escapeText(value, { preserveWhitespace = false } = {}) {
            const text = preserveWhitespace ? value : value.replace(/\s+/g, ' ');
            // Typora 会把反斜杠方括号识别为公式边界；正文用实体保留字面括号。
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\[/g, '&#91;').replace(/\]/g, '&#93;')
                .replace(/[\\`*_{}$|~]/g, '\\$&').replace(/==/g, '\\=\\=')
                .replace(/^(\s*)(#{1,6})(?=\s)/gm, '$1\\$2')
                .replace(/^(\s*)([-+])(?=\s)/gm, '$1\\$2')
                .replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2')
                .replace(/^(\s*)(-{3,})(\s*)$/gm, '$1\\$2$3');
        }

        // 只合并相邻块的边界空行，代码块内部的空行与缩进原样保留。
        function join(parts) {
            return parts.reduce((result, part) => {
                const tail = result.match(/\n+$/)?.[0].length || 0;
                const head = part.match(/^\n+/)?.[0].length || 0;
                return tail && head ? result.slice(0, -tail) + '\n'.repeat(Math.max(tail, head)) + part.slice(head) : result + part;
            }, '');
        }

        function children(node, tableCell = false) {
            return join([...node.childNodes].map(child => render(child, tableCell)));
        }

        function block(value) {
            return value.trim() ? `\n\n${value.trim()}\n\n` : '';
        }

        function emphasis(value, marker) {
            if (!value.trim()) return value;
            return `${value.match(/^\s*/)[0]}${marker}${value.trim()}${marker}${value.match(/\s*$/)[0]}`;
        }

        function code(node, inline = false) {
            const raw = node.textContent.replace(/\r\n?/g, '\n');
            const value = inline ? raw.replace(/\n/g, ' ') : raw;
            const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map(match => match[0].length));
            const fence = '`'.repeat(Math.max(inline ? 1 : 3, longest + 1));
            if (inline) {
                const pad = /^`|`$|^ .*[^ ]|[^ ].* $/.test(value) ? ' ' : '';
                return `${fence}${pad}${value}${pad}${fence}`;
            }
            const languageNode = node.querySelector('code') || node;
            const language = languageNode.className.match(/(?:^|\s)language-([\w+-]+)(?:\s|$)/)?.[1] || '';
            return `\n\n${fence}${language}\n${value}${value.endsWith('\n') ? '' : '\n'}${fence}\n\n`;
        }

        function mathDetails(node) {
            const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
            const sourceNode = node.querySelector('[data-tex], [data-latex]');
            const source = annotation?.textContent || node.getAttribute('data-tex') || node.getAttribute('data-latex')
                || sourceNode?.getAttribute('data-tex') || sourceNode?.getAttribute('data-latex')
                || (node.localName === 'script' ? node.textContent : '');
            const display = node.classList.contains('katex-display') || node.classList.contains('display') || node.classList.contains('block')
                || node.getAttribute('display') === 'true' || node.getAttribute('display') === 'block'
                || node.getAttribute('data-display') === 'true'
                || node.querySelector('.katex-display, math[display="block"]') !== null || /mode\s*=\s*display/i.test(node.getAttribute('type') || '');
            return { source: source.trim(), display };
        }

        function math(node) {
            const { source, display } = mathDetails(node);
            if (source) return display ? `\n\n$$\n${source}\n$$\n\n` : `$${source}$`;
            warnings.add('部分公式没有提供原始 LaTeX，已保留可读说明；请在保存前核对并补充公式。');
            const readable = node.querySelector('.katex-html') || node.querySelector('.katex') || node;
            const value = readable.textContent.trim();
            return `〔公式待核对${value ? `：${escapeText(value)}` : ''}〕`;
        }

        function list(node, tableCell = false) {
            const ordered = node.localName === 'ol';
            // cmark 可能在列表和 li 之间插入组件包装，按最近列表确定归属。
            const items = [...node.querySelectorAll('li')].filter(item => item.closest('ul, ol') === node);
            if (!items.length) {
                warnings.add('部分列表没有可识别的条目，已保留其文字；请核对列表结构。');
                return block(children(node, tableCell));
            }
            const reversed = ordered && node.hasAttribute('reversed');
            const rawStart = node.getAttribute('start');
            let counter = rawStart === null ? (reversed ? items.length : 1) : Number(rawStart);
            if (ordered && (!Number.isSafeInteger(counter) || (rawStart !== null && !/^-?\d+$/.test(rawStart)))) throw new Error('回答中的有序列表起始值无效，请先核对。');
            const numbers = items.map(item => {
                const itemValue = item.getAttribute('value');
                if (ordered && itemValue !== null && !/^-?\d+$/.test(itemValue)) throw new Error('回答中的列表编号无效，请先核对。');
                if (ordered && itemValue !== null) counter = Number(itemValue);
                if (ordered && !Number.isSafeInteger(counter)) throw new Error('回答中的列表编号超出安全范围，请先核对。');
                const value = counter;
                counter += reversed ? -1 : 1;
                return value;
            });
            const exact = !reversed && numbers.every((value, index) => value > 0 && value <= 999999999 && value === numbers[0] + index);
            if (ordered && !exact) warnings.add('列表编号无法通过 Markdown 有序列表准确表示，已按原编号保留为普通条目；请核对排版。');
            return block(items.map((item, index) => {
                const bullet = tableCell ? '• ' : '- ';
                const marker = ordered ? (exact ? `${numbers[index]}. ` : `${bullet}${numbers[index]}\\. `) : bullet;
                const content = children(item, tableCell).trim();
                const checkbox = item.querySelector('input[type="checkbox"]');
                const task = checkbox?.closest('li') === item ? `[${checkbox.checked ? 'x' : ' '}] ` : '';
                const indentation = ' '.repeat(ordered && exact ? marker.length : 2);
                return marker + task + content.replace(/\n/g, '\n' + indentation);
            }).join('\n'));
        }

        function pipeTableMarkdown(rows, hasHeader) {
            const width = Math.max(...rows.map(row => row.length));
            const cells = rows.map(row => Array.from({ length: width }, (_, index) => {
                if (index >= row.length) return '';
                // GFM 单元格只能占一行；显式换行保留段落，实体缩进保留子列表层级。
                return row[index].trim().split('\n').map(line => line
                    .replace(/^ +/, spaces => '&#160;'.repeat(spaces.length))
                    .replace(/(?<!\\)\|/g, '\\|')).join('<br>');
            }));
            const head = hasHeader ? cells[0] : Array(width).fill('');
            const body = hasHeader ? cells.slice(1) : cells;
            const line = row => `| ${row.join(' | ')} |`;
            return [line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n');
        }

        function table(node) {
            // cmark 可在行和单元格之间插入组件；按语义归属取列，避免原生 row.cells 漏读。
            const rows = [...node.querySelectorAll('tr')].filter(row => row.closest('table') === node && visibleNoteContent(row))
                .map(row => [...row.querySelectorAll('th, td')].filter(cell => cell.closest('tr') === row
                    && cell.closest('table') === node));
            if (!rows.length) throw new Error('未识别到表格行，无法完整提取这条回答；请核对原表格。');
            const emptyRow = rows.findIndex(cells => !cells.length);
            if (emptyRow !== -1) throw new Error(`表格第 ${emptyRow + 1} 行未识别到单元格，已停止提取；请核对原表格。`);
            const captions = [...node.querySelectorAll('caption')].filter(caption => caption.closest('table') === node && visibleNoteContent(caption));
            if (hasUnreadContent(node, new Set([...rows.flat(), ...captions]))) {
                throw new Error('表格中存在未归属到行列的内容，无法完整提取这条回答；请核对原表格。');
            }
            const captionText = join(captions.map(caption => block(children(caption))));
            // 隐藏单元格仍占原列，避免后续内容被错配到前面的表头。
            const cellContent = (cell, inline = false) => visibleNoteContent(cell) ? children(cell, inline).trim() : '';
            const unsafeCell = cell => {
                if (cell.colSpan !== 1 || cell.rowSpan !== 1) return true;
                // 行内数学组件内部的 pre/code 属于公式渲染层，不能当作正文代码块。
                const ordinaryContent = selector => [...cell.querySelectorAll(selector)]
                    .filter(part => visibleNoteContent(part) && !part.closest(NOTE_MATH));
                if (ordinaryContent('pre, ms-code-block').length) return true;
                if (ordinaryContent('code, kbd, samp').some(part => /\\\|/.test(part.textContent))) return true;
                return [...cell.querySelectorAll(NOTE_MATH)].filter(visibleNoteContent).some(part => {
                    const { source, display } = mathDetails(part);
                    return display || /[\r\n]/.test(source) || /\\\|/.test(source);
                });
            };
            const complex = rows.some(row => row.some(cell => visibleNoteContent(cell) && unsafeCell(cell)))
                || [...node.querySelectorAll('table')].some(visibleNoteContent);
            if (complex) {
                warnings.add('表格包含合并单元格、嵌套或多行结构，或无法准确转义的代码与公式，已按行和列保留内容；请手动整理表格结构。');
                const content = rows.map((row, rowIndex) => {
                    const values = row.map((cell, cellIndex) => `第 ${cellIndex + 1} 列\n\n${cellContent(cell)}`);
                    return `第 ${rowIndex + 1} 行\n\n${values.join('\n\n')}`;
                }).join('\n\n');
                return join([captionText, block(content)]);
            }
            const hasHeader = rows[0].some(cell => cell.localName === 'th');
            const content = rows.map(row => row.map(cell => cellContent(cell, true)));
            return join([captionText, block(pipeTableMarkdown(content, hasHeader))]);
        }

        function link(node, tableCell = false) {
            const label = children(node, tableCell).trim();
            const raw = node.getAttribute('href') || '';
            if (!raw) return label;
            const base = location.protocol === 'https:' ? `https://${location.hostname}${location.pathname}` : 'https://aistudio.google.com/';
            const destination = new URL(raw, base);
            if (!['https:', 'http:', 'mailto:'].includes(destination.protocol)) {
                warnings.add('部分链接使用本地或不可导出的协议，已保留文字；请手动核对链接。');
                return label;
            }
            return `[${label || escapeText(destination.href)}](<${destination.href.replace(/[<>]/g, char => encodeURIComponent(char))}>)`;
        }

        function attachment(node) {
            const label = node.getAttribute('alt') || node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent.trim();
            warnings.add('回答包含图片、音视频或附件，笔记仅保留说明，文件需另行保存。');
            return block(`〔附件待保存${label ? `：${escapeText(label)}` : ''}〕`);
        }

        function render(node, tableCell = false) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (!node.textContent.trim() && /[\r\n]/.test(node.textContent)) return '';
                return escapeText(node.textContent);
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            const tag = node.localName;
            if (noteDecoration(node)) return '';
            if (node.hidden || node.getAttribute('aria-hidden') === 'true') return '';
            if (node.matches(NOTE_MATH)) return math(node);
            if (tag === 'script') return '';
            // value 才是文本框当前显示的原文；textContent 可能为空或仍是旧的初始值。
            if (tag === 'textarea') return block(escapeText(node.value.replace(/\r\n?/g, '\n'), { preserveWhitespace: true }));
            if (node.matches('img, video, audio, canvas, svg, iframe, object, embed, a[download], ms-image-chunk, ms-audio-chunk, ms-video-chunk, ms-file-chunk')) return attachment(node);
            if (tag === 'pre') return code(node);
            if (tag === 'ms-code-block') {
                const pre = node.querySelector('pre');
                if (!pre) throw new Error('未识别到代码块原文，请核对页面结构后再记录。');
                return code(pre);
            }
            if (tag === 'code' || tag === 'kbd' || tag === 'samp') return code(node, true);
            if (tag === 'br') return '  \n';
            if (tag === 'hr') return '\n\n---\n\n';
            if (tag === 'ul' || tag === 'ol') return list(node, tableCell);
            if (tag === 'table') return table(node);
            if (tag === 'a') return link(node, tableCell);
            const value = children(node, tableCell);
            if (/^h[1-6]$/.test(tag)) return block(`${'#'.repeat(Number(tag[1]))} ${value.trim()}`);
            if (tag === 'strong' || tag === 'b') return emphasis(value, '**');
            if (tag === 'em' || tag === 'i') return emphasis(value, '*');
            if (tag === 'del' || tag === 's' || tag === 'strike') return emphasis(value, '~~');
            if (tag === 'blockquote') return block(value.trim().split('\n').map(line => `> ${line}`).join('\n'));
            if (['p', 'div', 'section', 'article', 'ms-text-chunk'].includes(tag)) return block(value);
            return value;
        }

        const body = join(roots.map(root => block(render(root)))).trim();
        if (!body && role === 'model' && ownedNodes(turn, THOUGHT_CONTENT).length) return { body: '', warnings: [] };
        if (!body) throw new Error(`这条${label}尚无可记录的正文，请等待内容显示后再试。`);
        return { body, warnings: [...warnings] };
    }

    function extractPair(pair) {
        const question = extractMessage(pair.question, 'user');
        const answers = pair.answers.map(turn => extractMessage(turn, 'model'));
        const answer = answers.map(result => result.body).filter(Boolean).join('\n\n');
        if (!answer) throw new Error('这对问答尚无可记录的回答正文，请等待 AI 回答显示。');
        return {
            answer,
            body: `## 我的问题\n\n${question.body}\n\n## AI 回答\n\n${answer}`,
            warnings: [...new Set([...question.warnings, ...answers.flatMap(result => result.warnings)])]
        };
    }

    function themeButton(id, theme) {
        const swatch = element('span', { class: 'swatch', 'aria-hidden': 'true' });
        swatch.style.setProperty('--swatch', theme.paper);
        return element('button', { class: 'theme', type: 'button', 'data-theme': id, 'aria-pressed': 'false', title: theme.note }, [swatch, theme.name]);
    }

    function rangeSetting(key, label) {
        const [min, max, step] = RANGES[key];
        const output = element('output', { id: `${key}-value`, for: `reader-${key}` });
        const caption = element('span', { class: 'label' }, [label, output]);
        const input = element('input', { type: 'range', id: `reader-${key}`, 'data-key': key, min, max, step, 'aria-label': label });
        return element('label', { class: 'setting range-setting' }, [caption, input]);
    }

    const launcher = element('button', { class: 'launcher', type: 'button', 'aria-label': '阅读设置', 'aria-controls': 'reader-panel', 'aria-expanded': 'false' }, [
        element('span', { class: 'leaf', 'aria-hidden': 'true' }), element('span', {}, ['阅读'])
    ]);
    const heading = element('h2', { id: 'reader-title' }, ['纸间阅读']);
    const close = element('button', { class: 'close', type: 'button', 'aria-label': '关闭阅读设置' }, ['×']);
    const fontSelect = element('select', { id: 'reader-font', 'aria-label': '阅读字体' },
        Object.entries(FONTS).map(([id, font]) => element('option', { value: id }, [font.name])));
    const panel = element('section', { class: 'panel', id: 'reader-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'reader-title', hidden: '' }, [
        element('header', {}, [heading, close]),
        element('div', { class: 'panel-content' }, [
            element('div', { class: 'appearance' }, [
                element('div', { class: 'themes', role: 'group', 'aria-label': '阅读主题' }, Object.entries(THEMES).map(([id, theme]) => themeButton(id, theme))),
                element('label', { class: 'setting font-setting' }, [element('span', { class: 'label' }, ['阅读字体']), fontSelect]),
                element('label', { class: 'check' }, [element('input', { id: 'reader-wrap', type: 'checkbox' }), '长代码自动折行'])
            ]),
            element('div', { class: 'typography' }, [
                rangeSetting('size', '正文字号'), rangeSetting('leading', '行间距'), rangeSetting('width', '阅读宽度')
            ])
        ]),
        element('div', { class: 'actions' }, [
            element('button', { type: 'button', class: 'primary', id: 'reader-toggle' }),
            element('button', { type: 'button', id: 'reader-reset' }, ['恢复默认']),
            element('button', { type: 'button', class: 'record-entry', id: 'reader-record' }, ['记录问答'])
        ]),
        element('p', { class: 'status', id: 'reader-status', role: 'status', 'aria-live': 'polite' }),
        element('p', { class: 'error', id: 'reader-error', role: 'alert', hidden: '' })
    ]);
    shadow.append(controlsStyle, launcher, panel);
    document.body.append(host);

    // 原生文件接口由文档所属 Window 调用，保留直接点击带来的用户激活。
    const nativeWindow = document.defaultView;
    const NOTE_FORMATS = Object.freeze(['obsidian', 'blog']);
    const noteField = (label, control, wide = false) => element('label', { class: `note-field${wide ? ' note-wide' : ''}` }, [element('span', {}, [label]), control]);
    const noteAnswer = element('select', { id: 'note-answer', 'aria-label': '选择问答' });
    const noteTitle = element('input', { id: 'note-title', type: 'text', maxlength: '100', 'aria-label': '笔记标题' });
    const noteFormat = element('select', { id: 'note-format', 'aria-label': '保存格式' }, [
        element('option', { value: 'obsidian' }, ['Markdown 笔记（Typora / Obsidian）']), element('option', { value: 'blog' }, ['博客草稿'])
    ]);
    const noteDescription = element('input', { id: 'note-description', type: 'text', maxlength: '180', 'aria-label': '博客摘要', placeholder: '用一两句话概括这篇文章' });
    const noteCategory = element('select', { id: 'note-category', 'aria-label': '文章分类' }, [
        element('option', { value: 'learning' }, ['学习笔记']), element('option', { value: 'life' }, ['生活随笔']), element('option', { value: 'creating' }, ['内容创作'])
    ]);
    const noteTags = element('input', { id: 'note-tags', type: 'text', value: 'AI笔记', 'aria-label': '标签', placeholder: '用逗号分隔，最多 5 个' });
    const noteSource = element('input', { id: 'note-source', type: 'checkbox', checked: '' });
    const noteBody = element('textarea', { id: 'note-body', 'aria-label': '笔记正文（Markdown）', spellcheck: 'false' });
    const notePreview = element('textarea', { id: 'note-preview', 'aria-label': '完整文件预览', readonly: '', spellcheck: 'false' });
    const noteDetails = element('details', {}, [element('summary', {}, ['查看完整 Markdown']), notePreview]);
    const noteStatus = element('p', { id: 'note-status', class: 'status', role: 'status', 'aria-live': 'polite' });
    const noteError = element('p', { id: 'note-error', class: 'error', role: 'alert', hidden: '' });
    const noteWarning = element('p', { id: 'note-warning', class: 'error', role: 'alert', hidden: '' });
    const noteDestination = element('p', { class: 'note-destination' });
    const noteSave = element('button', { id: 'note-save', type: 'button', class: 'primary' }, ['选择保存位置']);
    const noteDownload = element('a', { id: 'note-download', href: '#', download: '' }, ['下载 Markdown']);
    const noteClose = element('button', { id: 'note-close', type: 'button', class: 'close', 'aria-label': '关闭记录' }, ['×']);
    const noteBlogFields = element('div', { class: 'note-grid', hidden: '' }, [noteField('博客摘要', noteDescription, true), noteField('文章分类', noteCategory)]);
    const noteDialog = element('section', { id: 'note-dialog', class: 'note-dialog', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'note-heading', hidden: '' }, [
        element('header', {}, [element('div', {}, [element('h2', { id: 'note-heading' }, ['记录问答']), element('p', { class: 'subtitle' }, ['选择一对问答，问题和 AI 回答会直接显示在正文中。'])]), noteClose]),
        noteField('选择问答', noteAnswer), noteError,
        element('div', { class: 'note-grid' }, [noteField('笔记标题', noteTitle), noteField('保存格式', noteFormat), noteField('标签 · 用逗号分隔，最多 5 个', noteTags, true)]),
        noteBlogFields,
        element('label', { class: 'check' }, [noteSource, '附上对话来源']),
        noteWarning, noteField('笔记正文 · Markdown，可直接修改', noteBody), noteDetails,
        noteDestination,
        element('div', { class: 'actions' }, [noteSave, noteDownload, element('button', { id: 'note-copy', type: 'button' }, ['复制 Markdown'])]),
        noteStatus,
        element('p', { class: 'note-destination' }, ['关闭面板会保留这份草稿；刷新或关闭网页前请保存。'])
    ]);
    shadow.append(noteDialog);
    let noteRecords = [];
    let notePairWarnings = [];
    let noteSnapshot = null;
    let noteDirty = false;
    let noteBusy = false;
    let noteDirectory = null;
    let noteDownloadUrl = '';

    function showNoteError(error) {
        noteError.hidden = false;
        noteError.textContent = error.message;
        noteStatus.textContent = '';
        console.error('[纸间阅读·记录]', error);
    }

    function clearNoteError() {
        noteError.hidden = true;
        noteError.textContent = '';
    }

    function localDate(date) {
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value, index) => String(value).padStart(index ? 2 : 4, '0')).join('-');
    }

    function noteSourceUrl() {
        return `https://aistudio.google.com${location.pathname}`;
    }

    function restoreNoteSelection() {
        const index = noteSnapshot?.source === noteSourceUrl()
            ? noteRecords.findIndex(pair => pair.question === noteSnapshot.question) : -1;
        if (index >= 0) { noteAnswer.value = String(index); return; }
        if (!noteAnswer.querySelector('option[value=""]')) {
            noteAnswer.prepend(element('option', { value: '', disabled: '' }, ['请选择当前对话中的问答']));
        }
        noteAnswer.value = '';
    }

    function collectNotePairs() {
        const result = conversationPairs();
        noteRecords = result.pairs;
        notePairWarnings = result.warnings;
        noteAnswer.replaceChildren(...noteRecords.map((_pair, index) =>
            element('option', { value: index }, [`第 ${index + 1} 对问答`])));
        noteAnswer.disabled = noteRecords.length === 0;
        if (!noteRecords.length) noteAnswer.append(element('option', { value: '' }, ['当前没有识别到成对的问答']));
        else if (noteSnapshot) restoreNoteSelection();
        else noteAnswer.value = String(noteRecords.length - 1);
    }

    function readSelectedPair() {
        if (noteDirty && !window.confirm('切换问答会替换这份草稿中的修改，是否继续？')) {
            restoreNoteSelection();
            return;
        }
        clearNoteError();
        try {
            const index = Number(noteAnswer.value);
            const pair = noteAnswer.value === '' ? null : noteRecords[index];
            if (!pair?.question.isConnected || !pair.answers.every(turn => turn.isConnected) || !isReadingRoute()) {
                throw new Error('所选问答已不在当前页面，请关闭并重新打开记录面板。');
            }
            const result = extractPair(pair);
            const now = new Date();
            noteSnapshot = {
                date: localDate(now),
                source: noteSourceUrl(),
                index: index + 1,
                question: pair.question
            };
            // 标题也来自已过滤的正文，避免收录隐藏思考区的标题。
            const title = result.answer.match(/^#{1,6} ([^\n]+)/m)?.[1]
                .replace(/\\([\\`*_\[\]{}$|~#=])/g, '$1')
                .replace(/&(amp|lt|gt|#91|#93);/g, (_match, entity) => ({ amp: '&', lt: '<', gt: '>', '#91': '[', '#93': ']' })[entity]);
            noteTitle.value = (title || `AI Studio 笔记 ${noteSnapshot.date}`).slice(0, 100);
            noteDescription.value = '';
            noteBody.value = result.body;
            noteDirty = false;
            const warnings = [...notePairWarnings, ...result.warnings];
            noteWarning.textContent = warnings.join('；');
            noteWarning.hidden = !warnings.length;
            noteStatus.textContent = `已载入第 ${noteSnapshot.index} 对问答，包含你的问题和 AI 回答。生成结束后可重新打开面板更新未编辑的正文。`;
            refreshNotePreview();
        } catch (error) {
            restoreNoteSelection();
            showNoteError(new Error(`读取失败${noteSnapshot ? '，原草稿仍保留' : ''}：${error.message}`));
        }
    }

    function buildNoteFile() {
        if (!noteSnapshot) throw new Error('请先选择一对可读取的问答。');
        const title = noteTitle.value.trim();
        const body = noteBody.value.trim();
        const tags = [...new Set(noteTags.value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
        if (!title || title.length > 100) throw new Error('笔记标题需要 1–100 个字符。');
        if (!body) throw new Error('笔记正文不能为空。');
        if (!tags.length || tags.length > 5) throw new Error('请填写 1–5 个标签，用逗号分隔。');
        if (!NOTE_FORMATS.includes(noteFormat.value)) throw new Error('保存格式无效。');
        const metadata = { title, date: noteSnapshot.date, tags };
        if (noteFormat.value === 'blog') {
            const description = noteDescription.value.trim();
            if (!description || description.length > 180) throw new Error('请填写 1–180 个字符的博客摘要。');
            if (!['learning', 'life', 'creating'].includes(noteCategory.value)) throw new Error('文章分类无效。');
            Object.assign(metadata, { description, category: noteCategory.value, cover: 'writing', featured: false, draft: true });
        }
        if (noteSource.checked && noteSnapshot.source) metadata.source = noteSnapshot.source;
        const frontmatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
        const content = `---\n${frontmatter}\n---\n\n${body}\n`;
        const now = new Date();
        const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(value => String(value).padStart(2, '0')).join('');
        const safeTitle = title.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-').replace(/[. ]+$/g, '').slice(0, 70);
        return { content, filename: `${noteSnapshot.date}-${time}-${safeTitle || '笔记'}.md` };
    }

    function refreshNotePreview() {
        if (!noteDetails.open) return;
        try { notePreview.value = buildNoteFile().content; }
        catch (error) { notePreview.value = `尚未生成完整文件：${error.message}`; }
    }

    function updateNoteFormat() {
        const blog = noteFormat.value === 'blog';
        noteBlogFields.hidden = !blog;
        noteSource.checked = !blog;
        updateNoteDestination();
        refreshNotePreview();
    }

    function updateNoteDestination() {
        const supported = typeof nativeWindow.showDirectoryPicker === 'function';
        if (noteDirectory) noteDestination.textContent = `下载位置：${noteDirectory.name}。本页后续下载会直接保存到这个文件夹。`;
        else noteDestination.textContent = supported
            ? '下载位置：浏览器默认下载目录。点击“选择保存位置”可指定自己的文件夹。'
            : '下载位置：浏览器默认下载目录。当前浏览器不支持选择文件夹。';
        noteSave.textContent = noteDirectory ? '更改保存位置' : '选择保存位置';
        noteSave.disabled = !supported || noteBusy;
        noteDownload.setAttribute('aria-disabled', String(noteBusy));
    }

    function setNoteBusy(busy) {
        noteBusy = busy;
        updateNoteDestination();
    }

    function openNoteDialog() {
        setPanelOpen(false);
        collectNotePairs();
        noteDialog.hidden = false;
        updateNoteDestination();
        if (!noteDirty && noteAnswer.value !== '') readSelectedPair();
        else if (!noteSnapshot) showNoteError(new Error(['当前没有识别到成对的问答，请等待回答显示后重新打开。', ...notePairWarnings].join(' ')));
        else noteStatus.textContent = `已保留先前第 ${noteSnapshot.index} 对问答的草稿与来源；选择问答即可更换正文。`;
        noteClose.focus();
    }

    function closeNoteDialog() {
        noteDialog.hidden = true;
        launcher.focus();
    }

    async function chooseNoteDirectory() {
        if (noteBusy) return;
        clearNoteError();
        noteStatus.textContent = '';
        try {
            if (typeof nativeWindow.showDirectoryPicker !== 'function') throw new Error('当前浏览器不支持选择文件夹。');
            setNoteBusy(true);
            noteDirectory = await nativeWindow.showDirectoryPicker({
                id: 'air-note-directory', mode: 'readwrite',
                ...(noteDirectory ? { startIn: noteDirectory } : {})
            });
            noteStatus.textContent = `已选择：${noteDirectory.name}。点击“下载 Markdown”即可保存到这个文件夹。`;
        } catch (error) {
            if (error.name === 'AbortError') noteStatus.textContent = '已取消选择，保存位置和草稿保持不变。';
            else showNoteError(new Error(`选择保存位置失败：${error.message}`));
        } finally {
            setNoteBusy(false);
        }
    }

    async function createNoteFile(directory, filename) {
        const stem = filename.slice(0, -3);
        for (let index = 1; ; index++) {
            const name = index === 1 ? filename : `${stem} (${index}).md`;
            try {
                await directory.getFileHandle(name);
            } catch (error) {
                if (error.name === 'NotFoundError') return directory.getFileHandle(name, { create: true });
                if (error.name !== 'TypeMismatchError') throw error;
            }
        }
    }

    async function saveNoteFile() {
        if (noteBusy) return;
        clearNoteError();
        noteStatus.textContent = '';
        let stage = '检查笔记';
        try {
            const file = buildNoteFile();
            const directory = noteDirectory;
            if (!directory) throw new Error('请先选择保存位置。');
            setNoteBusy(true);
            stage = '授权保存位置';
            if (await directory.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                throw new Error(`没有获得“${directory.name}”的写入权限，请重新选择保存位置并允许访问。`);
            }
            stage = '写入文件';
            // 串行处理同源页面的导出，防止两个标签页同时创建同名笔记。
            const filename = await nativeWindow.navigator.locks.request('air-note-directory-write', async () => {
                const handle = await createNoteFile(directory, file.filename);
                const writer = await handle.createWritable();
                try {
                    await writer.write(file.content);
                    await writer.close();
                } catch (error) {
                    try { await writer.abort(); }
                    catch (abortError) { console.error('[纸间阅读·取消写入]', abortError); }
                    throw error;
                }
                stage = '核对文件';
                const saved = await handle.getFile();
                if (await saved.text() !== file.content) throw new Error('文件回读内容不一致，请检查目标文件。');
                return handle.name;
            });
            noteStatus.textContent = `已保存并核对：${directory.name} / ${filename}`;
        } catch (error) {
            showNoteError(new Error(`${stage}失败：${error.message}`));
        } finally {
            setNoteBusy(false);
        }
    }

    async function copyNoteText(text, message) {
        if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持复制，请使用下载或手动复制预览内容。');
        await navigator.clipboard.writeText(text);
        noteStatus.textContent = message;
    }

    shadow.getElementById('reader-record').addEventListener('click', openNoteDialog);
    noteClose.addEventListener('click', closeNoteDialog);
    noteAnswer.addEventListener('change', readSelectedPair);
    noteSave.addEventListener('click', chooseNoteDirectory);
    noteFormat.addEventListener('change', () => { updateNoteFormat(); noteDirty = true; });
    noteDetails.addEventListener('toggle', refreshNotePreview);
    noteDialog.addEventListener('input', event => {
        if (event.target === noteAnswer) return;
        noteDirty = true;
        clearNoteError();
        refreshNotePreview();
    });
    noteDownload.addEventListener('click', async event => {
        if (noteBusy) { event.preventDefault(); return; }
        if (noteDirectory) {
            event.preventDefault();
            await saveNoteFile();
            return;
        }
        clearNoteError();
        try {
            const file = buildNoteFile();
            if (noteDownloadUrl) URL.revokeObjectURL(noteDownloadUrl);
            noteDownloadUrl = URL.createObjectURL(new Blob([file.content], { type: 'text/markdown;charset=utf-8' }));
            noteDownload.href = noteDownloadUrl;
            noteDownload.download = file.filename;
            noteStatus.textContent = '已发起 Markdown 下载，位置为浏览器默认下载目录，请在下载列表确认完成。';
        } catch (error) { event.preventDefault(); showNoteError(error); }
    });
    shadow.getElementById('note-copy').addEventListener('click', async () => {
        clearNoteError();
        try { await copyNoteText(buildNoteFile().content, '已复制 Markdown，可粘贴到自己的笔记中。'); }
        catch (error) { showNoteError(error); }
    });
    updateNoteFormat();

    let currentPath = location.pathname;

    function isReadingRoute() {
        return /^\/prompts(?:\/|$)/.test(location.pathname);
    }

    function applyPalette() {
        const theme = THEMES[settings.theme];
        const colors = Object.entries(theme).filter(([key]) => !['name', 'note'].includes(key));
        const values = colors.map(([key, value]) => `--air-${key}:${value};`).join('');
        paletteStyle.textContent = `${ACTIVE}{${values}--air-font:${FONTS[settings.font].stack};--air-size:${settings.size}px;--air-leading:${settings.leading};--air-width:${settings.width}px;}`;
        for (const [key, value] of colors) host.style.setProperty(`--${key}`, value);
    }

    function updateRoute() {
        const supported = isReadingRoute();
        host.hidden = !supported;
        document.documentElement.toggleAttribute('data-air-active', supported && settings.enabled);
        document.documentElement.toggleAttribute('data-air-wrap-code', supported && settings.enabled && settings.wrapCode);
        if (!supported) setPanelOpen(false);
    }

    function updateStatus() {
        const status = shadow.getElementById('reader-status');
        if (!settings.enabled) {
            status.textContent = '已恢复原版显示。设置会为你保留。';
            return;
        }
        const { pairs, warnings } = conversationPairs();
        const count = pairs.length;
        if (count > 0) {
            status.textContent = `沉浸阅读已开启 · 当前识别到 ${count} 对问答。恢复原版可继续提问。`;
            return;
        }
        status.textContent = document.querySelector('ms-chat-turn')
            ? `尚未识别到成对的问答。${warnings.join(' ') || '若已有问答，当前页面结构可能需要适配。'}`
            : '沉浸阅读已开启，等待回答显示。恢复原版可继续提问。';
    }

    function renderSettings() {
        for (const button of shadow.querySelectorAll('[data-theme]')) button.setAttribute('aria-pressed', String(button.dataset.theme === settings.theme));
        for (const input of shadow.querySelectorAll('input[data-key]')) input.value = String(settings[input.dataset.key]);
        shadow.getElementById('size-value').textContent = `${settings.size} px`;
        shadow.getElementById('leading-value').textContent = settings.leading.toFixed(2);
        shadow.getElementById('width-value').textContent = `${settings.width} px`;
        shadow.getElementById('reader-font').value = settings.font;
        shadow.getElementById('reader-wrap').checked = settings.wrapCode;
        shadow.getElementById('reader-toggle').textContent = settings.enabled ? '恢复原版' : '开启阅读';
        launcher.setAttribute('aria-pressed', String(settings.enabled));
        const error = shadow.getElementById('reader-error');
        error.hidden = !storageError;
        error.textContent = storageError;
        updateStatus();
    }

    let storageQueue = Promise.resolve();

    function saveSettings(patch) {
        settings = validateSettings({ ...settings, ...patch });
        const snapshot = { ...settings };
        applyPalette();
        updateRoute();
        renderSettings();
        // 按调整顺序写入，防止快速拖动滑块时旧值覆盖新值。
        storageQueue = storageQueue.then(async () => {
            try {
                await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
                storageError = '';
            } catch (error) {
                storageError = `当前调整已显示，但保存失败：${error.message}。重新打开页面后可能丢失。`;
                console.error('[纸间阅读]', error);
            }
            renderSettings();
        });
        return storageQueue;
    }

    function setPanelOpen(open) {
        if (open) noteDialog.hidden = true;
        panel.hidden = !open;
        launcher.setAttribute('aria-expanded', String(open));
        if (open) {
            updateStatus();
            shadow.querySelector('.close').focus();
        }
    }

    launcher.addEventListener('click', () => setPanelOpen(panel.hidden));
    shadow.querySelector('.close').addEventListener('click', () => { setPanelOpen(false); launcher.focus(); });
    shadow.querySelector('.themes').addEventListener('click', event => {
        const button = event.target.closest('[data-theme]');
        if (button) saveSettings({ theme: button.dataset.theme });
    });
    for (const input of shadow.querySelectorAll('input[data-key]')) {
        input.addEventListener('input', () => saveSettings({ [input.dataset.key]: Number(input.value) }));
    }
    shadow.getElementById('reader-font').addEventListener('change', event => saveSettings({ font: event.target.value }));
    shadow.getElementById('reader-wrap').addEventListener('change', event => saveSettings({ wrapCode: event.target.checked }));
    shadow.getElementById('reader-toggle').addEventListener('click', () => saveSettings({ enabled: !settings.enabled }));
    shadow.getElementById('reader-reset').addEventListener('click', () => saveSettings({ ...DEFAULTS }));
    chrome.runtime.onMessage.addListener((message, _sender, respond) => {
        if (!['air:get-state', 'air:open-settings', 'air:record-note'].includes(message?.type)) return;
        updateRoute();
        if (!isReadingRoute()) {
            respond({ ok: false, error: '请先打开 AI Studio 的对话页面。' });
            return;
        }
        if (message.type === 'air:open-settings') setPanelOpen(true);
        if (message.type === 'air:record-note') openNoteDialog();
        respond({ ok: true, enabled: settings.enabled });
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !noteDialog.hidden) { closeNoteDialog(); return; }
        if (event.key !== 'Escape' || panel.hidden) return;
        setPanelOpen(false);
        launcher.focus();
    });
    document.addEventListener('pointerdown', event => {
        if (!panel.hidden && !event.composedPath().includes(host)) setPanelOpen(false);
    });

    function checkRoute() {
        if (currentPath === location.pathname) return;
        currentPath = location.pathname;
        noteRecords = [];
        notePairWarnings = [];
        noteAnswer.replaceChildren(element('option', { value: '' }, ['已切换对话，请重新打开面板以选择问答']));
        noteAnswer.disabled = true;
        if (noteSnapshot) {
            noteStatus.textContent = '已切换对话，仍保留原来的草稿和来源。重新打开面板可选择当前对话的问答。';
        }
        updateRoute();
    }

    // 只比较路径，不逐字扫描回答；CSS 自然覆盖流式追加的内容。
    const routeObserver = new MutationObserver(checkRoute);
    routeObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', checkRoute);
    if (window.navigation) window.navigation.addEventListener('navigatesuccess', checkRoute);

    applyPalette();
    updateRoute();
    renderSettings();
})();
