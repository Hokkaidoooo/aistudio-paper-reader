# AI Studio Paper Reader

[简体中文](README.md) · **English** · [Español](README.es.md) · [日本語](README.ja.md)

Read long Google AI Studio replies with fewer distractions and save a selected question and answer as Markdown for Typora or Obsidian. The extension interface is in Chinese.

## Install or update

1. Download the extension ZIP from [Releases](https://github.com/Hokkaidoooo/aistudio-paper-reader/releases/latest) and extract it to a folder you can keep.
2. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the folder containing `manifest.json`. You can also load the repository's [extension folder](extension) directly.
3. Disable the older **AI Studio 纸间阅读** Tampermonkey script if installed. Save any unsaved drafts before refreshing open AI Studio pages. When updating, replace the extension files, reload the extension, then refresh those pages.

## Read and save a note

- Click **阅读** (Read) on the page or the toolbar icon. Choose among four themes and adjust fonts, spacing, line width and code wrapping. Use **恢复原版** to restore the original layout.
- Select **记录问答** (Record Q&A), pick one exchange, and review the title, tags and Markdown. Click **选择保存位置** (Choose save location) to select a folder, then **下载 Markdown** (Download Markdown) to save directly into it.
- The selected folder is reused within the current page, including after closing and reopening the panel or switching conversations. Use **更改保存位置** (Change save location) to choose another folder. After refreshing or reopening the page, confirm the folder again. Without a selected folder, downloads use the browser's default directory. Existing filenames get a numbered copy; permission or write failures appear in the panel and keep the draft.
- Notes can include headings, links, lists, code, tables and formulas when LaTeX source is available. The panel flags missing material to check. If a table cannot be extracted completely, extraction stops and the existing draft is kept. Old exports with missing tables need to be recorded again from the original reply.
- Markdown notes include the conversation link by default; you can turn it off. Blog drafts default to omitting the link and include `draft: true`.

## Privacy and permissions

The only extension permission is `storage` for reading preferences. The content script is scoped to `aistudio.google.com`, and the reader appears on conversation routes. The extension itself makes no network requests or model API calls. Saving, downloading and copying are user-initiated. When you choose a folder, the browser asks for read and write access to it. Drafts and the selected folder handle live in the current page's memory: closing the panel keeps them, but save drafts before refreshing or closing the page.

## Repair citations in an older export

Use Node.js 22 or newer. Run from the repository root, replacing the two example paths with an existing note and a new output file:

```powershell
npm ci
npm run repair:citations -- "note.md" "note-repaired.md"
```

The tool fixes escaped brackets around citation links and leaves the original file, code and formulas intact. `npm run build` creates the extension ZIP and SHA-256 checksum in `dist`.

## License

By Hokkaidoooo, under the [MIT License](LICENSE).
