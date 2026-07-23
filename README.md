# md2pdf

把 Markdown 转成带**文内目录**和 **PDF 书签**的 PDF。不装 Pandoc，复用本机 Chrome。

## 原理（三步）

```text
.md ──marked──▶ HTML（标题加 id，插入「目录」链接）
                     │
                     ▼
              本机 Chrome headless
                     │  page.pdf({ outline: true })
                     ▼
                   .pdf（侧边栏书签 + 可点击目录）
```

| 能力 | 怎么做的 |
|------|----------|
| 文内目录 | 扫描 `#` / `##` / `###`，生成锚点链接列表 |
| PDF 书签 | Chrome 打印参数 `outline: true` |
| base64 图 | 原样进 HTML，Chrome 渲染 |
| 分页 | MD 里的 `page-break-before` div 生效 |

## 安装（一次）

```bash
cd D:\kayou\github\md2pdf
npm install
```

需已安装 **Chrome** 或 **Edge**。找不到时设置：

```bash
# Windows PowerShell 示例
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## 使用

```bash
# 输出与 md 同名的 pdf
node md2pdf.js path\to\doc.md

# 指定输出路径
node md2pdf.js path\to\doc.md path\to\out.pdf
```

## 成本

- 代码：单文件 `md2pdf.js` + 两个 npm 依赖（`marked`、`puppeteer-core`）
- **不**下载 Chromium（`puppeteer-core` 只用本机浏览器）
- 无 GUI、无服务端
