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

test('首页提供完整且一致的 canonical、OG 与 Twitter 元数据', async () => {
  const html = await read('index.html');
  const canonical = 'https://watermark.i41.cn/';
  const image = 'https://watermark.i41.cn/og-watermark.png';
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}">`));
  for (const [property, content] of [
    ['og:type', 'website'],
    ['og:locale', 'zh_CN'],
    ['og:site_name', 'i41 证件水印'],
    ['og:url', canonical],
    ['og:title', 'i41 证件水印｜图片本地处理的防盗用水印工具'],
    ['og:image', image],
    ['og:image:secure_url', image],
    ['og:image:type', 'image/png'],
    ['og:image:width', '1200'],
    ['og:image:height', '630'],
  ]) assert.match(html, new RegExp(`<meta property="${property}" content="${content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  for (const [name, content] of [
    ['twitter:card', 'summary_large_image'],
    ['twitter:title', 'i41 证件水印｜图片本地处理的防盗用水印工具'],
    ['twitter:image', image],
  ]) assert.match(html, new RegExp(`<meta name="${name}" content="${content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  assert.match(html, /<meta (?:property="og:description"|name="twitter:description") content="[^"]+">/);
});

test('首页提供可解析的 WebApplication 结构化数据', async () => {
  const html = await read('index.html');
  const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, '缺少 JSON-LD');
  const data = JSON.parse(source);
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'WebApplication');
  assert.equal(data.name, 'i41 证件水印');
  assert.equal(data.url, 'https://watermark.i41.cn/');
  assert.equal(data.applicationCategory, 'UtilitiesApplication');
  assert.equal(data.operatingSystem, 'Any');
  assert.equal(data.inLanguage, 'zh-CN');
  assert.equal(data.offers?.price, '0');
  assert.equal(data.offers?.priceCurrency, 'CNY');
  assert.ok(data.description.includes('浏览器本地处理'));
  assert.deepEqual(data.featureList, ['本地图片处理', '用途水印实时预览', '多图批量下载', 'JPG、PNG、WebP、HEIC、HEIF 支持']);
});

test('社交分享图是 1200×630 的本地 PNG 资源', async () => {
  const image = await readFile(new URL('../og-watermark.png', import.meta.url));
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test('robots.txt 与 sitemap.xml 是有效的静态抓取入口', async () => {
  const [robots, sitemap] = await Promise.all([read('robots.txt'), read('sitemap.xml')]);
  assert.equal(robots, 'User-agent: *\nAllow: /\n\nSitemap: https://watermark.i41.cn/sitemap.xml\n');
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, /<loc>https:\/\/watermark\.i41\.cn\/<\/loc>/);
  assert.match(sitemap, /<changefreq>monthly<\/changefreq>/);
  assert.match(sitemap, /<priority>1\.0<\/priority>/);
  assert.doesNotMatch(robots, /<!doctype|<html/i);
  assert.doesNotMatch(sitemap, /<!doctype|<html/i);
});

test('首页静态提供使用步骤、常见问题与安全边界说明', async () => {
  const html = await read('index.html');
  const steps = html.match(/<section class="seo-guide"[\s\S]*?<\/section>/)?.[0] || '';
  const faq = html.match(/<section class="faq"[\s\S]*?<\/section>/)?.[0] || '';
  for (const text of [
    '证件水印怎么加',
    '选择需要处理的图片',
    '填写具体用途',
    '调整水印并确认预览',
    '下载处理后的图片',
    '建议先保留原图备份',
  ]) assert.ok(steps.includes(text), `步骤区缺少：${text}`);
  for (const text of [
    '图片会上传到服务器吗',
    '不会。图片和水印文字仅在浏览器本地处理',
    '水印能完全防止证件被盗用吗',
    '不能。用途水印只能降低被挪用的风险',
    '应该怎样写水印文字',
    '仅供办理某项业务使用，他用无效',
  ]) assert.ok(faq.includes(text), `FAQ 缺少：${text}`);
  assert.doesNotMatch(`${steps}${faq}`, /身份证号|真实姓名|手机号码|住址示例|文件名示例/);
});

test('敏感文件页面不加载可变远程统计脚本', async () => {
  const html = await read('index.html');
  assert.match(html, /<html[^>]*data-i41-site="watermark"[^>]*>/);
  assert.doesNotMatch(html, /<script[^>]*src="https?:\/\//);
});

test('隐私声明准确说明本地处理与同源 HEIC 资源', async () => {
  const [html, readme] = await Promise.all([read('index.html'), read('README.md')]);
  for (const content of [html, readme]) {
    for (const text of ['图片和水印文字仅在浏览器本地处理', 'HEIC', '同源', '不发送']) assert.ok(content.includes(text), `缺少隐私说明：${text}`);
  }
});

test('CSP 仅允许同源脚本并禁止运行时网络连接', async () => {
  const headers = await read('_headers');
  const csp = headers.split('\n').find(line => line.includes('Content-Security-Policy:')) || '';
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /worker-src 'self'/);
  assert.match(csp, /connect-src 'none'/);
  assert.doesNotMatch(csp, /https:/);
});

test('顶部生态导航按标准顺序提供除当前证件水印外的入口', async () => {
  const html = await read('index.html');
  const nav = html.match(/<nav aria-label="i41 工具生态">([\s\S]*?)<\/nav>/)?.[1] || '';
  const labels = [...nav.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(match => match[1]);
  assert.deepEqual(labels, ['i方案', '开发者工具', '图片压缩', 'HEIC 转换', '智能抠图', '多图拼接', 'PDF 工具', '临时剪贴板', '证件照']);
  for (const href of [
    'https://www.i41.cn?utm_source=watermark&amp;utm_medium=tool_referral&amp;utm_campaign=ifangan&amp;utm_content=ecosystem_nav',
    'https://tools.i41.cn',
    'https://imgzip.i41.cn',
    'https://imgzip.i41.cn/heic-converter/',
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

test('i方案使用明确类名并由高优先级规则渲染为蓝底居中 CTA', async () => {
  const [html, css] = await Promise.all([read('index.html'), read('style.css')]);
  assert.match(html, /<a class="primary-product i-plan-link"[^>]*data-tooltip="[^"]+"[^>]*>i方案<\/a>/);
  assert.match(css, /\.site-header\{[^}]*min-height:64px[^}]*background:#fff/);
  const rule = css.match(/\.site-header nav a\.i-plan-link\{([^}]*)\}/)?.[1] || '';
  for (const declaration of [
    /background:#246bfd/,
    /color:#fff/,
    /min-width:(?:7[2-9]|[89]\d|\d{3,})px/,
    /display:inline-flex/,
    /align-items:center/,
    /justify-content:center/,
    /text-align:center/,
    /border-radius:9px/,
  ]) assert.match(rule, declaration);
  assert.match(css, /\.privacy-badge\{[^}]*background:#eaf9f1[^}]*color:#18794e/);
});

test('生态菜单整体右对齐并用自然换行代替横向滚动', async () => {
  const css = await read('style.css');
  const navRules = [...css.matchAll(/\.site-header nav\{([^}]*)\}/g)].map(match => match[1]).join(';');
  assert.match(navRules, /justify-content:flex-end/);
  assert.match(navRules, /flex-wrap:wrap/);
  assert.doesNotMatch(navRules, /overflow-x:(?:auto|scroll)/);
});

test('所有菜单入口使用 hover 和 focus 可见的 viewport-safe data-tooltip', async () => {
  const [html, css, tooltip] = await Promise.all([read('index.html'), read('style.css'), read('src/nav-tooltip.js')]);
  const nav = html.match(/<nav aria-label="i41 工具生态">([\s\S]*?)<\/nav>/)?.[1] || '';
  const links = [...nav.matchAll(/<a\b([^>]*)>/g)];
  assert.equal(links.length, 9);
  for (const [, attributes] of links) assert.match(attributes, /\bdata-tooltip="[^"]+"/);
  assert.match(css, /\.nav-tooltip\{[^}]*position:fixed[^}]*white-space:normal/);
  assert.match(tooltip, /addEventListener\('mouseover',[\s\S]*?placeNavTooltip/);
  assert.match(tooltip, /addEventListener\('focusin',[\s\S]*?placeNavTooltip/);
});

test('页面链接全部在当前窗口打开且不携带新窗口 rel', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /\starget=/);
  assert.doesNotMatch(html, /\srel="(?:noopener|noreferrer|noopener noreferrer)"/);
  assert.match(html, /<aside class="iplan">[\s\S]*?<a href="https:\/\/www\.i41\.cn\?[^>]*>访问 i方案 →<\/a>/);
});

test('移动端保持同一导航顺序并允许自然换行访问全部入口', async () => {
  const css = await read('style.css');
  assert.match(css, /@media\(max-width:850px\)\{[^}]*\.site-header\{[^}]*height:auto[^}]*flex-wrap:wrap/);
  assert.match(css, /@media\(max-width:850px\)[\s\S]*?\.site-header nav\{[^}]*order:3[^}]*width:100%[^}]*justify-content:flex-end[^}]*flex-wrap:wrap/);
  assert.doesNotMatch(css, /@media\(max-width:850px\)[\s\S]*?\.site-header nav\{[^}]*overflow-x:(?:auto|scroll)/);
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
  assert.match(sw,/CACHE_NAME='i41-watermark-original-v5'/);
  assert.match(license,/MIT License/);
});
