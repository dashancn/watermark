import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const canonicalTooltips = new Map([
  ['i方案', 'i方案是一套面向本地实体商家、内容运营人员和营销服务团队的智能内容工作平台。平台围绕行业、平台、品类、风格和使用场景，提供文案生成、文案诊断、客户跟单话术、文生图、视频包制作和精品模板等能力，帮助用户从内容构思、表单草稿、生成优化到后续复用形成完整工作链路。'],
  ['开发者工具', '开发者工具箱汇集编码转换、格式化、加密、网络、文本和图片等常用在线工具，强调快速、易用和浏览器端处理。'],
  ['图片压缩', '图片修改压缩是一款浏览器端在线图片处理工具，支持压缩、调整尺寸和格式转换，图片尽量在本地处理，适合日常上传、分享和网页优化。'],
  ['HEIC 转换', 'HEIC 转换工具可在浏览器本地将 HEIC、HEIF 和 WebP 转为 JPG 或 PNG。'],
  ['智能抠图', '智能抠图在浏览器中自动移除图片背景，适合人像和商品图快速换背景。'],
  ['多图拼接', '多图拼接支持在浏览器中组合多张图片并调整布局。'],
  ['PDF 工具', 'PDF 工具箱提供合并、拆分、压缩、转换、编辑、OCR 和发票拼版等浏览器端 PDF 处理能力。'],
  ['临时剪贴板', '临时剪贴板支持客户端加密、自动过期、读取次数限制和阅后即焚，适合跨设备传递临时文本。'],
  ['证件照', '证件照工作室是一款浏览器端证件照制作工具，支持本地智能抠图、背景换色、常用证件尺寸和 300DPI 多图拼版，照片无需上传到业务服务器。'],
]);

test('top menu uses passport-photo-studio canonical full tooltips in preserved order', async () => {
  const html = await read('index.html');
  const nav = html.match(/<nav aria-label="i41 工具生态">([\s\S]*?)<\/nav>/)?.[1] || '';
  const links = [...nav.matchAll(/<a\b[^>]*data-tooltip="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => [match[2], match[1]]);
  assert.deepEqual(links.map(([label]) => label), [...canonicalTooltips.keys()]);
  assert.deepEqual(new Map(links), canonicalTooltips);
});

test('picker and drop integration lazily convert only real HEIC signatures', async () => {
  const [html, app] = await Promise.all([read('index.html'), read('src/app.js')]);
  assert.match(html, /accept="[^"]*\.heic,[^"]*\.heif/);
  assert.match(html, /支持 JPG、PNG、WebP、HEIC、HEIF/);
  assert.match(app, /hasHeicSignature/);
  assert.match(app, /await import\('\.\/heic-worker-client\.js'\)/);
  assert.match(app, /elements\.fileInput\.onchange=e=>\{const files=\[\.\.\.e\.target\.files\]/);
  assert.match(app, /drop[\s\S]*addFiles/);
  assert.match(app, /selectionOwner/);
});

test('sensitive file page has same-origin runtime policy and no mutable analytics script', async () => {
  const [html, headers] = await Promise.all([read('index.html'), read('_headers')]);
  assert.doesNotMatch(html, /https:\/\/stats\.i41\.cn\/analytics\.js/);
  const csp = headers.split('\n').find((line) => line.includes('Content-Security-Policy:')) || '';
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*https:/);
  assert.match(csp, /worker-src 'self'/);
  assert.match(csp, /connect-src 'none'/);
});

test('LGPL runtime, licenses, corresponding source, and fixture are delivered', async () => {
  const paths = [
    'public/heic/heic-worker.js',
    'public/heic/heic-to-1.5.2.worker.js',
    'public/third-party/heic/BUILD-AND-RELINK.md',
    'public/third-party/heic/corresponding-source/CORRESPONDING-SOURCE.md',
    'public/third-party/heic/corresponding-source/LICENSES/heic-to-LGPL-3.0.txt',
    'public/third-party/heic/corresponding-source/LICENSES/libheif-LGPL-3.0.txt',
    'public/third-party/heic/corresponding-source/LICENSES/libde265-LGPL-3.0.txt',
    'test/fixtures-libheif-example.heic',
  ];
  for (const path of paths) assert.ok((await readFile(new URL(`../${path}`, import.meta.url))).byteLength > 0, `missing ${path}`);
  const html = await read('index.html');
  for (const text of ['heic-to 1.5.2', 'libheif 1.22.2', 'libde265 1.0.16', 'LGPL-3.0', '对应源代码']) assert.ok(html.includes(text));
});
