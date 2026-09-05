import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateWatermarkPositions, calculateResponsiveFontSize, clampWatermarkOffset, sanitizeFilename, shouldRecommendCompression } from '../src/watermark.js';

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

test('自动字号随图片分辨率增长并保持可读比例', () => {
  assert.equal(calculateResponsiveFontSize(1200, 800), 36);
  assert.equal(calculateResponsiveFontSize(6000, 4000), 180);
  assert.equal(calculateResponsiveFontSize(12000, 8000), 360);
});

test('手动拖放偏移被限制在画布范围内', () => {
  assert.deepEqual(clampWatermarkOffset(1200, 800, { x: 900, y: -900 }), { x: 540, y: -360 });
  assert.deepEqual(clampWatermarkOffset(1200, 800, { x: 120, y: 80 }), { x: 120, y: 80 });
});

test('大文件或超高像素图片会建议先压缩', () => {
  assert.equal(shouldRecommendCompression({ size: 2 * 1024 * 1024 }, 1200, 800), false);
  assert.equal(shouldRecommendCompression({ size: 12 * 1024 * 1024 }, 1200, 800), true);
  assert.equal(shouldRecommendCompression({ size: 2 * 1024 * 1024 }, 5000, 4000), true);
});

test('导出文件名安全且保留扩展名', () => {
  assert.equal(sanitizeFilename('身份证 正面.jpg'), '身份证-正面-watermarked.png');
});

test('页面提供拖动定位和大图压缩确认界面', async () => {
  const [html, app] = await Promise.all([read('index.html'), read('src/app.js')]);
  for (const text of ['拖动水印调整位置', '检测到较大的图片', '先去压缩', '继续加水印']) assert.ok(html.includes(text));
  assert.match(html, /https:\/\/imgzip\.i41\.cn\/\?utm_source=watermark&amp;utm_medium=tool_referral&amp;utm_campaign=i41_tools&amp;utm_content=large_image_prompt/);
  assert.match(app, /pointerdown/);
  assert.match(app, /pointermove/);
  assert.match(app, /shouldRecommendCompression/);
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

test('CSP 允许加载两层匿名统计并发送统计请求', async () => {
  const headers = await read('_headers');
  const csp = headers.split('\n').find(line => line.includes('Content-Security-Policy:')) || '';
  assert.match(csp, /script-src[^;]*https:\/\/stats\.i41\.cn/);
  assert.match(csp, /connect-src[^;]*https:\/\/stats\.i41\.cn/);
  assert.match(csp, /script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/cloudflareinsights\.com/);
});

test('顶部生态导航按标准顺序提供除当前证件水印外的入口', async () => {
  const html = await read('index.html');
  const nav = html.match(/<nav aria-label="i41 工具生态">([\s\S]*?)<\/nav>/)?.[1] || '';
  const labels = [...nav.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(match => match[1]);
  assert.deepEqual(labels, ['i方案', '开发者工具', '图片压缩', '智能抠图', '多图拼接', 'PDF 工具', '临时剪贴板', '证件照']);
  for (const href of [
    'https://www.i41.cn?utm_source=watermark&amp;utm_medium=tool_referral&amp;utm_campaign=ifangan&amp;utm_content=ecosystem_nav',
    'https://tools.i41.cn',
    'https://imgzip.i41.cn',
    'https://imgzip.i41.cn/remove-background/',
    'https://imgzip.i41.cn/collage/',
    'https://pdf.i41.cn',
    'https://clip.i41.cn',
    'https://idphoto.i41.cn',
  ]) assert.ok(nav.includes(`href="${href}"`), `缺少导航链接：${href}`);
  assert.doesNotMatch(nav, /证件水印|aria-current/);
  assert.match(html, /<a class="brand"[^>]*><span>水<\/span><strong>i41 证件水印<\/strong><\/a>/);
  assert.match(html, /<span class="privacy-badge"[^>]*>🔒 图片仅在本地处理<\/span>/);
});

test('统一导航为白底 64px 且加宽 i方案主 CTA', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('style.css')]);
  assert.match(html, /<a class="primary-product"[^>]*data-tooltip="[^"]+"[^>]*>i方案<\/a>/);
  assert.match(css, /\.site-header\{[^}]*height:64px[^}]*background:#fff/);
  assert.match(css, /\.site-header nav \.primary-product\{[^}]*(?:min-width|padding):[^}]*background:#246bfd[^}]*color:#fff[^}]*font-weight:800/);
  assert.match(css, /\.privacy-badge\{[^}]*background:#eaf9f1[^}]*color:#18794e/);
});

test('所有菜单入口使用 hover 和 focus 可见的 data-tooltip', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('style.css')]);
  const nav = html.match(/<nav aria-label="i41 工具生态">([\s\S]*?)<\/nav>/)?.[1] || '';
  const links = [...nav.matchAll(/<a\b([^>]*)>/g)];
  assert.equal(links.length, 8);
  for (const [, attributes] of links) assert.match(attributes, /\bdata-tooltip="[^"]+"/);
  assert.match(css, /\[data-tooltip\]:(?:hover|focus-visible)::after/);
  assert.match(css, /\[data-tooltip\]:focus-visible::after/);
});

test('页面链接全部在当前窗口打开且不携带新窗口 rel', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /\starget=/);
  assert.doesNotMatch(html, /\srel="(?:noopener|noreferrer|noopener noreferrer)"/);
  assert.match(html, /<aside class="iplan">[\s\S]*?<a href="https:\/\/www\.i41\.cn\?[^>]*>访问 i方案 →<\/a>/);
});

test('移动端保持同一导航顺序并允许横向滚动访问全部入口', async () => {
  const css = await read('style.css');
  assert.match(css, /@media\(max-width:850px\)\{[^}]*\.site-header\{[^}]*height:auto[^}]*flex-wrap:wrap/);
  assert.match(css, /@media\(max-width:850px\)[\s\S]*?\.site-header nav\{[^}]*order:3[^}]*width:100%[^}]*overflow-x:auto/);
  assert.match(css, /@media\(max-width:850px\)[\s\S]*?\.privacy-badge\{[^}]*margin-left:auto/);
});

test('浅黄色推广横幅保留完整文案且使用 promo_banner UTM', async () => {
  const html = await read('index.html');
  for (const text of ['关注 i方案', '获取内容创作、客户跟单、文生图与视频制作方案', '访问 i方案 →']) assert.ok(html.includes(text));
  assert.match(html, /<aside class="iplan">[\s\S]*?<a href="https:\/\/www\.i41\.cn\?utm_source=watermark&amp;utm_medium=tool_referral&amp;utm_campaign=ifangan&amp;utm_content=promo_banner"[^>]*>访问 i方案 →<\/a>/);
});

test('页脚默认极简并将隐私、MIT 与开源说明折叠', async () => {
  const html = await read('index.html');
  const footer = html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] || '';
  assert.match(footer, /i41 免费实用工具/);
  assert.match(footer, /<details>/);
  assert.match(footer, /<summary>[^<]+<\/summary>/);
  for (const text of ['图片和水印文字仅在浏览器本地处理', 'MIT License', '查看源码']) assert.ok(footer.includes(text));
  assert.doesNotMatch(footer, /<details\s+open/);
});

test('PWA 与开源文件完整', async () => {
  const [html, manifest, sw, license] = await Promise.all([read('index.html'),read('manifest.webmanifest'),read('sw.js'),read('LICENSE')]);
  assert.match(html,/manifest\.webmanifest/);
  assert.match(manifest,/"display": "standalone"/);
  assert.match(sw,/CACHE_NAME='i41-watermark-original-v3'/);
  assert.match(license,/MIT License/);
});
