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

test('PWA 与开源文件完整', async () => {
  const [html, manifest, sw, license] = await Promise.all([read('index.html'),read('manifest.webmanifest'),read('sw.js'),read('LICENSE')]);
  assert.match(html,/manifest\.webmanifest/);
  assert.match(manifest,/"display": "standalone"/);
  assert.match(sw,/CACHE_NAME/);
  assert.match(license,/MIT License/);
});
