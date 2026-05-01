// md → 단일 HTML (인쇄/PDF 친화 CSS 임베드).
// 사용: node scripts/md-to-html.mjs <input.md> <output.html>
import { marked } from 'marked';
import fs from 'node:fs';
import path from 'node:path';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/md-to-html.mjs <input.md> <output.html>');
  process.exit(1);
}

const md = fs.readFileSync(input, 'utf-8');
marked.setOptions({ gfm: true, breaks: false });
const rawBody = marked.parse(md);

// 이미지 src 의 상대경로 → data: URI (file:// 미사용해도 inline 로드 가능)
const baseDir = path.dirname(path.resolve(input));
const body = rawBody.replace(
  /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/g,
  (match, pre, src, post) => {
    if (src.startsWith('http') || src.startsWith('data:')) return match;
    const full = path.resolve(baseDir, src);
    if (!fs.existsSync(full)) {
      console.warn('img not found:', full);
      return match;
    }
    const ext = path.extname(full).slice(1).toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'svg'
          ? 'image/svg+xml'
          : `image/${ext}`;
    const data = fs.readFileSync(full).toString('base64');
    return `<img ${pre}src="data:${mime};base64,${data}"${post}>`;
  },
);

const css = `
  @page { size: A4; margin: 18mm 16mm; }
  html, body { color: #1f2328; }
  body {
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕",
                 "Noto Sans CJK KR", "Segoe UI", sans-serif;
    line-height: 1.65;
    max-width: 900px;
    margin: 0 auto;
    padding: 0 8px 24px;
    font-size: 12pt;
  }
  h1 { font-size: 1.9em; border-bottom: 2px solid #d0d7de; padding-bottom: 0.25em; margin-top: 1.2em; }
  h2 { font-size: 1.45em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.2em; margin-top: 1.4em; page-break-after: avoid; }
  h3 { font-size: 1.2em; margin-top: 1.2em; page-break-after: avoid; }
  h4 { font-size: 1.05em; margin-top: 1em; }
  p, li { font-size: 1em; }
  a { color: #0969da; text-decoration: none; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0 1em; font-size: 0.95em; }
  th, td { border: 1px solid #d0d7de; padding: 0.45em 0.7em; text-align: left; vertical-align: top; }
  th { background: #f6f8fa; font-weight: 600; }
  code { background: #f6f8fa; padding: 0.18em 0.4em; border-radius: 4px; font-family: ui-monospace, "Consolas", monospace; font-size: 0.92em; }
  pre { background: #f6f8fa; padding: 0.9em 1em; border-radius: 6px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  img { max-width: 100%; height: auto; border: 1px solid #d0d7de; border-radius: 6px; margin: 0.5em 0 0.8em; page-break-inside: avoid; display: block; }
  ul, ol { padding-left: 1.5em; }
  li { margin: 0.18em 0; }
  blockquote { border-left: 4px solid #d0d7de; padding: 0.4em 0.9em; color: #57606a; margin: 0.8em 0; background: #f6f8fa; border-radius: 0 6px 6px 0; }
  hr { border: 0; border-top: 1px solid #d0d7de; margin: 2em 0; }
  /* 인쇄에 어색한 흐름 방지 */
  table, pre, blockquote { page-break-inside: avoid; }
`;

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>SAM Scheduler — 고객 검수 안내</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync(output, html, 'utf-8');
console.log('wrote', output);
