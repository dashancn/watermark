import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateWatermarkPositions, sanitizeFilename } from '../src/watermark.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('默认仅生成两条清晰水印', () => {
  const positions = calculateWatermarkPositions(1200, 800, 2);
  assert.equal(positions.length, 2);
  assert.deepEqual(positions, [
    { x: 600, y: 304 },
    { x: 600, y: 496 },
  ]);
});

test('水印数量允许在一至三条范围内调整', () => {
  assert.equal(calculateWatermarkPositions(1200, 800, 1).length, 1);
  assert.equal(calculateWatermarkPositions(1200, 800, 3).length, 3);
  assert.equal(calculateWatermarkPositions(1200, 800, 99).length, 3);
});

test('导出文件名安全且保留扩展名', () => {
  assert.equal(sanitizeFilename('身份证 正面.jpg'), '身份证-正面-watermarked.png');
});

test('页面包含完整工具生态、模板、批量和隐私说明', async () => {
  const html = await read('index.html');
  for (const url of ['https://www.i41.cn','https://tools.i41.cn','https://imgzip.i41.cn','https://pdf.i41.cn','https://idphoto.i41.cn','https://clip.i41.cn']) assert.ok(html.includes(url));
  for (const text of ['临时剪贴板','客户端加密、自动过期、读取次数限制和阅后即焚','仅供实名认证使用，他用无效','仅供入职审核使用，他用无效','仅供银行开户使用，他用无效','水印数量','value="2"','批量下载','图片仅在浏览器本地处理']) assert.ok(html.includes(text));
});

test('页面加载 i41 匿名统计脚本并声明 watermark 站点', async () => {
  const html = await read('index.html');
  assert.match(html, /<html[^>]*data-i41-site="watermark"[^>]*>/);
  assert.match(html, /<script[^>]*src="https:\/\/stats\.i41\.cn\/analytics\.js"[^>]*><\/script>/);
});

test('隐私声明准确区分本地敏感处理与匿名统计', async () => {
  const [html, readme] = await Promise.all([read('index.html'), read('README.md')]);
  for (const content of [html, readme]) {
    for (const text of ['图片和水印文字仅在浏览器本地处理', '匿名访问', '性能', 'UTM', '跨站点击', '不含图片、文件名、水印文字或永久标识']) assert.ok(content.includes(text), `缺少隐私说明：${text}`);
    assert.doesNotMatch(content, /没有[^；。\n]*(?:分析脚本|分析)|无分析脚本/);
  }
});

test('CSP 允许加载 i41 匿名统计并发送统计请求', async () => {
  const headers = await read('_headers');
  const csp = headers.split('\n').find(line => line.includes('Content-Security-Policy:')) || '';
  assert.match(csp, /script-src[^;]*https:\/\/stats\.i41\.cn/);
  assert.match(csp, /connect-src[^;]*https:\/\/stats\.i41\.cn/);
});

test('顶部生态导航的 i方案入口携带来源与位置 UTM', async () => {
  const html = await read('index.html');
  assert.match(html, /<nav[^>]*>[\s\S]*?<a class="featured" href="https:\/\/www\.i41\.cn\?utm_source=watermark&amp;utm_medium=tool_referral&amp;utm_campaign=ifangan&amp;utm_content=ecosystem_nav"[^>]*>i方案<\/a>/);
});

test('浅黄色推广横幅的 i方案入口使用 promo_banner UTM', async () => {
  const html = await read('index.html');
  assert.match(html, /<aside class="iplan">[\s\S]*?<a href="https:\/\/www\.i41\.cn\?utm_source=watermark&amp;utm_medium=tool_referral&amp;utm_campaign=ifangan&amp;utm_content=promo_banner"[^>]*>访问 i方案 →<\/a>/);
});

test('页面展示 i41 免费实用工具归属且保留 MIT 声明', async () => {
  const html = await read('index.html');
  assert.match(html, />[^<]*i41 免费实用工具[^<]*</);
  assert.match(html, /MIT License/);
});

test('PWA 与开源文件完整', async () => {
  const [html, manifest, sw, license] = await Promise.all([read('index.html'),read('manifest.webmanifest'),read('sw.js'),read('LICENSE')]);
  assert.match(html,/manifest\.webmanifest/);
  assert.match(manifest,/"display": "standalone"/);
  assert.match(sw,/CACHE_NAME/);
  assert.match(license,/MIT License/);
});
