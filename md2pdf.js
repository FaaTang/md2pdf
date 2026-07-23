#!/usr/bin/env node
/**
 * md2pdf — 最小成本 Markdown → PDF
 *
 * 原理：
 * 1. marked 把 MD 转成 HTML（含 base64 图）
 * 2. 按 #/##/### 生成文内「目录」锚点链接
 * 3. 调本机 Chrome（puppeteer-core）page.pdf，outline:true 生成书签
 *
 * 用法：
 *   node md2pdf.js <input.md> [output.pdf]
 *   node md2pdf.js D:\docs\design.md
 *   node md2pdf.js design.md out.pdf
 *
 * 可选环境变量：
 *   CHROME_PATH  Chrome/Edge 可执行文件路径
 */

const fs = require("fs");
const path = require("path");
const { marked } = require("marked");
const puppeteer = require("puppeteer-core");

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
    "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function slugify(text, used) {
  let base = String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (!base) base = "section";
  let slug = base;
  let i = 2;
  while (used.has(slug)) slug = `${base}-${i++}`;
  used.add(slug);
  return slug;
}

function extractHeadings(md) {
  const lines = md.split(/\r?\n/);
  const headings = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].replace(/\s+#+\s*$/, "").trim(),
      });
    }
  }
  return headings;
}

function prepareMarkdown(raw) {
  // 去掉手写「总目录」，避免与正文标题重复；保留 page-break div
  let md = raw.replace(
    /\n## 总目录\n[\s\S]*?(?=\n(?:<div style="page-break-before)|$)/,
    "\n"
  );

  const prelim = extractHeadings(md);
  const used = new Set();
  const withIds = prelim.map((h) => ({ ...h, id: slugify(h.text, used) }));

  const toc = ["## 目录", ""];
  for (const h of withIds) {
    if (h.level === 1 && withIds[0] && h.text === withIds[0].text && h === withIds[0]) {
      continue; // 跳过文首大标题
    }
    if (h.text === "目录" || h.text === "总目录") continue;
    const indent = "  ".repeat(Math.max(0, h.level - 1));
    toc.push(`${indent}- [${h.text}](#${h.id})`);
  }
  toc.push("");

  const marker = '<div style="page-break-before: always;"></div>';
  const idx = md.indexOf(marker);
  if (idx === -1) {
    return toc.join("\n") + "\n" + md;
  }
  return (
    md.slice(0, idx).trimEnd() +
    "\n\n" +
    toc.join("\n") +
    "\n" +
    md.slice(idx)
  );
}

function toHtml(md) {
  const used = new Set();
  const renderer = new marked.Renderer();
  renderer.heading = function (token) {
    const depth = token.depth;
    const text =
      typeof token.text === "string"
        ? token.text
        : this.parser.parseInline(token.tokens);
    const id = slugify(String(text).replace(/<[^>]+>/g, ""), used);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };
  marked.setOptions({ renderer, gfm: true, breaks: false });
  const body = marked.parse(md);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
    font-size: 11pt; line-height: 1.55; color: #1a1a1a;
  }
  h1 { font-size: 22pt; margin: 1.2em 0 0.6em; page-break-after: avoid; }
  h2 { font-size: 16pt; margin: 1.1em 0 0.5em; page-break-after: avoid;
       border-bottom: 1px solid #ddd; padding-bottom: 0.2em; }
  h3 { font-size: 13pt; margin: 1em 0 0.4em; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 9.5pt; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
  th { background: #f5f5f5; }
  pre, code { font-family: Consolas, "Courier New", monospace; font-size: 8.5pt; }
  pre {
    background: #f7f7f7; border: 1px solid #e5e5e5; padding: 8px 10px;
    white-space: pre-wrap; word-break: break-word;
  }
  img { max-width: 100%; height: auto; page-break-inside: avoid; }
  blockquote {
    margin: 0.6em 0; padding: 0.3em 0.8em; border-left: 3px solid #999;
    color: #444; background: #fafafa;
  }
  a { color: #0645ad; text-decoration: none; }
</style>
</head>
<body>${body}</body>
</html>`;
}

async function convert(input, output) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      "未找到 Chrome/Edge。请安装 Chrome，或设置环境变量 CHROME_PATH"
    );
  }

  const absIn = path.resolve(input);
  const absOut = path.resolve(
    output || absIn.replace(/\.md$/i, ".pdf")
  );
  console.log("in :", absIn);
  console.log("out:", absOut);
  console.log("chrome:", chrome);

  const raw = fs.readFileSync(absIn, "utf8");
  const html = toHtml(prepareMarkdown(raw));
  const tmpHtml = absOut + ".__tmp__.html";
  fs.writeFileSync(tmpHtml, html, "utf8");

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(600000);
    await page.goto("file:///" + tmpHtml.replace(/\\/g, "/"), {
      waitUntil: "load",
      timeout: 600000,
    });
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete
            ? null
            : new Promise((r) => {
                img.onload = img.onerror = r;
              })
        )
      );
    });
    await page.pdf({
      path: absOut,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:center;color:#666;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: "18mm", bottom: "18mm", left: "14mm", right: "14mm" },
      outline: true,
      tagged: true,
    });
  } finally {
    await browser.close();
    try {
      fs.unlinkSync(tmpHtml);
    } catch (_) {}
  }

  const mb = (fs.statSync(absOut).size / 1024 / 1024).toFixed(2);
  console.log("done:", mb + "MB");
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (args.length < 1) {
    console.log(`用法: node md2pdf.js <input.md> [output.pdf]

示例:
  node md2pdf.js design.md
  node md2pdf.js design.md out.pdf

依赖: 本机已装 Chrome 或 Edge；首次在本目录执行 npm install`);
    process.exit(1);
  }
  await convert(args[0], args[1]);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
