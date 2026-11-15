# AI Studio 纸间阅读

让 AI Studio 的长回答更好读，把选中的一对问答保存为 Markdown。适用于 Chrome、Edge 等 Chromium 浏览器。

## 安装

1. 从 [Releases](https://github.com/Hokkaidoooo/aistudio-paper-reader/releases/latest) 下载 `aistudio-paper-reader-2.0.0.zip`，解压到一个固定文件夹。
2. 打开 `chrome://extensions` 或 `edge://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择含有 `manifest.json` 的文件夹。
4. 如果装过旧版「AI Studio 纸间阅读」油猴脚本，先停用它，避免重复运行。
5. 保存网页中尚未保存的笔记草稿，再刷新已打开的 AI Studio 页面一次。

也可以下载本仓库源码，直接加载 `extension` 文件夹。

## 阅读与记录

点击页面的「阅读」按钮或浏览器工具栏扩展图标，可调整四种主题、字体、字号、行距、行宽与代码折行。「恢复原版」可显示 AI Studio 原来的输入区和侧栏。

点击「记录问答」，选择一对问答，检查标题、标签和 Markdown 正文，再点击「选择位置并保存」或「下载 Markdown」。首次保存请选择自己的笔记目录。关闭面板会保留草稿，刷新或关闭网页前请先保存。

- 导出完整问题和 AI 回答，支持标题、引用链接、列表、代码、普通表格与可取得 LaTeX 源码的公式。
- 引用编号使用普通方括号，避免 Typora 将引用链接识别为公式。
- 缺少公式源码、附件或复杂表格时，面板会提示需要核对的内容。
- Markdown 笔记默认附对话来源，可取消；博客草稿含摘要、分类和 `draft: true`，默认不附来源。
- 保存窗口成功写入后会回读核对；下载完成情况可在浏览器下载列表查看。

## 修复旧版导出的引用

安装 Node.js 22 或更高版本，在仓库目录运行 `npm ci`，再执行：

```powershell
npm run repair:citations -- "原笔记.md" "原笔记-引用修正版.md"
```

工具仅替换旧版引用链接外层的转义方括号。输出必须为新文件，原文件保持不变；代码和真正的公式保持原文。

## 数据与权限

扩展仅申请本机 `storage` 权限，用来保存阅读设置。内容脚本只运行于 `aistudio.google.com`，阅读界面仅在对话路径显示。扩展不发送网络请求、不调用模型接口；保存、下载和复制由你的点击发起。笔记草稿保留在当前页面内存中。

设置读取异常时会暂停阅读优化并显示错误，点击「恢复默认」可以重置。油猴与扩展的设置相互独立，安装扩展后可重新选择外观。

## 开发与验证

```powershell
npm ci
npx playwright install chromium
npm test
```

已有 Chromium 时，可通过 `AIR_CHROMIUM_EXECUTABLE` 指定其可执行文件。`npm test` 包含引用修复单测、语法及权限检查、离线回归、打包和真实扩展加载验证。测试页面由本地合成内容提供，Google 域名请求在浏览器中拦截响应，其余外网请求中止。验证回执和截图写入 `artifacts`。

`npm run build` 生成可解压安装的 ZIP 和 SHA-256 校验文件，输出位于 `dist`。

## 许可

[MIT](LICENSE)
