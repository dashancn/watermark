import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url);
const chromium = process.env.CHROMIUM || '/snap/bin/chromium';

async function startChrome(width, height) {
  const port = 9800 + Math.floor(Math.random() * 100);
  const userDataDir = `/tmp/watermark-chromium-${process.pid}-${width}`;
  const child = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`, 'about:blank'
  ], { stdio: 'ignore' });
  let targets;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      if (targets[0]?.webSocketDebuggerUrl) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(targets?.[0]?.webSocketDebuggerUrl, 'Chromium DevTools endpoint did not start');
  return { child, wsUrl: targets[0].webSocketDebuggerUrl };
}

async function withPage(width, height, run) {
  const [html, css, tooltipScript] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('style.css', root), 'utf8'),
    readFile(new URL('src/nav-tooltip.js', root), 'utf8')
  ]);
  const document = html
    .replace('<link rel="stylesheet" href="./style.css">', `<style>${css}</style>`)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
  const chrome = await startChrome(width, height);
  const socket = new WebSocket(chrome.wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    const timer = setTimeout(() => { pending.delete(messageId); reject(new Error(`CDP ${method} timed out`)); }, 5000);
    pending.set(messageId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 480 });
    const frameTree = await send('Page.getFrameTree');
    await send('Page.setDocumentContent', { frameId: frameTree.frameTree.frame.id, html: document });
    let loaded = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      loaded = await evaluate(`document.readyState === 'complete' && Boolean(document.querySelector('.site-header nav'))`);
      if (loaded) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(loaded, '页面未完成加载');
    await evaluate(tooltipScript);
    await run({ evaluate });
  } finally {
    socket.close();
    chrome.child.kill('SIGTERM');
  }
}

async function verifyNavigation({ width, height }) {
  await withPage(width, height, async ({ evaluate }) => {
    const layout = await evaluate(`(() => {
      const header = document.querySelector('.site-header');
      const nav = header.querySelector('nav');
      const links = [...nav.querySelectorAll('a')];
      return {
        headerPosition: getComputedStyle(header).position,
        headerTop: getComputedStyle(header).top,
        navFont: getComputedStyle(links[1]).fontSize,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        rows: new Set(links.map(link => Math.round(link.getBoundingClientRect().top))).size
      };
    })()`);
    assert.equal(layout.headerPosition, 'sticky');
    assert.equal(layout.headerTop, '0px');
    assert.equal(layout.navFont, width <= 520 ? '12px' : '13px');
    assert.equal(layout.documentWidth, layout.viewportWidth, '页面不应产生水平溢出');
    if (width === 375) assert.ok(layout.rows > 1, '窄屏导航应自然换行');

    const count = await evaluate("document.querySelectorAll('.site-header nav a').length");
    for (let index = 0; index < count; index += 1) {
      await evaluate(`(() => { const link = document.querySelectorAll('.site-header nav a')[${index}]; link.focus(); link.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); })()`);
      await new Promise(resolve => setTimeout(resolve, 180));
      await evaluate(`document.querySelector('[role="tooltip"]')?.getAnimations().forEach(animation => animation.finish())`);
      const tip = await evaluate(`(() => {
        const element = document.querySelector('[role="tooltip"]');
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { text: element.textContent, opacity: style.opacity, inlineOpacity: element.style.opacity, className: element.className, activeTag: document.activeElement?.tagName, position: style.position, whiteSpace: style.whiteSpace, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      })()`);
      assert.ok(tip?.text, `第 ${index + 1} 个链接 focus 后应渲染真实 Tip`);
      assert.equal(tip.opacity, '1', JSON.stringify(tip));
      assert.equal(tip.position, 'fixed');
      assert.equal(tip.whiteSpace, 'normal');
      assert.ok(tip.width > 0 && tip.height > 0);
      assert.ok(tip.left >= 0 && tip.top >= 0 && tip.right <= width && tip.bottom <= height, `第 ${index + 1} 个 Tip 应完整位于视口内`);
    }
  });
}

test('桌面菜单使用 watermark 基准字号且所有 Tip 位于视口内', () => verifyNavigation({ width: 1280, height: 800 }));
test('375px 菜单自然换行、无水平溢出且所有 Tip 位于视口内', () => verifyNavigation({ width: 375, height: 812 }));
