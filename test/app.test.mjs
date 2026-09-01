import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateWatermarkGrid, sanitizeFilename } from '../src/watermark.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('水印网格覆盖旋转后的完整画布', () => {
  const grid = calculateWatermarkGrid(1200, 800, 260, 120, 30);
  assert.ok(grid.length > 20);
  assert.ok(Math.min(...grid.map(p => p.x)) < 0);
  assert.ok(Math.max(...grid.map(p => p.x)) > 1200);
  assert.ok(Math.min(...grid.map(p => p.y)) < 0);
  assert.ok(Math.max(...grid.map(p => p.y)) > 800);
});

test('导出文件名安全且保留扩展名', () => {
  assert.equal(sanitizeFilename('身份证 正面.jpg'), '身份证-正面-watermarked.png');
});

test('页面包含完整工具生态、模板、批量和隐私说明', async () => {
  const html = await read('index.html');
  for (const url of ['https://www.i41.cn','https://tools.i41.cn','https://imgzip.i41.cn','https://pdf.i41.cn','https://idphoto.i41.cn']) assert.ok(html.includes(url));
  for (const text of ['仅供实名认证使用，他用无效','仅供入职审核使用，他用无效','仅供银行开户使用，他用无效','批量下载','图片仅在浏览器本地处理']) assert.ok(html.includes(text));
});

test('PWA 与开源文件完整', async () => {
  const [html, manifest, sw, license] = await Promise.all([read('index.html'),read('manifest.webmanifest'),read('sw.js'),read('LICENSE')]);
  assert.match(html,/manifest\.webmanifest/);
  assert.match(manifest,/"display": "standalone"/);
  assert.match(sw,/CACHE_NAME/);
  assert.match(license,/MIT License/);
});
