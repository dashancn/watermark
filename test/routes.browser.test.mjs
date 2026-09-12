import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const rootPath = new URL('../', import.meta.url).pathname;
const chromium = process.env.CHROMIUM || '/snap/bin/chromium';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function startPages() {
  const port = 18080 + Math.floor(Math.random() * 500);
  const child = spawn('npx', ['wrangler', 'pages', 'dev', '.', '--ip', '127.0.0.1', '--port', String(port)], {
    cwd: rootPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`wrangler pages dev exited early:\n${output}`);
    try {
      const response = await fetch(`${origin}/robots.txt`);
      if (response.ok) return { child, origin };
    } catch {}
    await delay(100);
  }
  child.kill('SIGTERM');
  throw new Error(`wrangler pages dev did not start:\n${output}`);
}

async function startChrome() {
  const port = 19080 + Math.floor(Math.random() * 300);
  const userDataDir = `/tmp/watermark-routes-chromium-${process.pid}-${Date.now()}`;
  const child = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore', detached: true });
  let targets;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      if (targets.find(target => target.type === 'page')?.webSocketDebuggerUrl) break;
    } catch {}
    await delay(100);
  }
  const pageTarget = targets?.find(target => target.type === 'page');
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'Chromium DevTools endpoint did not start');
  return { child, wsUrl: pageTarget.webSocketDebuggerUrl };
}

async function withBrowser(run) {
  const chrome = await startChrome();
  const socket = new WebSocket(chrome.wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id;
    const timer = setTimeout(() => {
      pending.delete(messageId);
      reject(new Error(`CDP ${method} timed out`));
    }, 8000);
    pending.set(messageId, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
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
    await run({ send, evaluate });
  } finally {
    socket.close();
    process.kill(-chrome.child.pid, 'SIGTERM');
  }
}

async function navigateAndRead({ send, evaluate }, url) {
  const navigation = await send('Page.navigate', { url });
  assert.equal(navigation.errorText, undefined, `navigation failed: ${navigation.errorText}`);
  let reached = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    reached = await evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`);
    if (reached) break;
    await delay(50);
  }
  assert.equal(reached, true, `browser did not finish navigation to ${url}`);
  return evaluate(`({
    title: document.title,
    robots: document.querySelector('meta[name="robots"]')?.content || '',
    heading: document.querySelector('h1')?.textContent.trim() || '',
    site: document.documentElement.dataset.i41Site || '',
    remoteScripts: [...document.scripts].filter(script => /^https?:/.test(script.src)).map(script => script.src),
    analyticsMarkers: document.documentElement.outerHTML.match(/analytics|beacon|clarity|gtag/gi) || []
  })`);
}

test('Pages 路由对未知路径返回真实且不可索引的 404，同时保留静态入口', async () => {
  const pages = await startPages();
  try {
    const expected = [
      ['/', 200, 'text/html'],
      ['/index.html', 200, 'text/html'],
      ['/style.css', 200, 'text/css'],
      ['/src/app.js', 200, 'application/javascript'],
      ['/robots.txt', 200, 'text/plain'],
      ['/sitemap.xml', 200, 'application/xml'],
      ['/sw.js', 200, 'application/javascript'],
      ['/manifest.webmanifest', 200, 'application/manifest+json'],
    ];
    for (const [path, status, type] of expected) {
      const response = await fetch(`${pages.origin}${path}`);
      assert.equal(response.status, status, path);
      assert.match(response.headers.get('content-type') || '', new RegExp(type.replace('+', '\\+')), path);
    }

    const unknownPath = `/not-found-${Date.now()}/nested`;
    const response = await fetch(`${pages.origin}${unknownPath}`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') || '', /^text\/html/);
    assert.match(response.headers.get('x-robots-tag') || '', /\bnoindex\b[^\r\n]*\bnofollow\b/i);
    const html = await response.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /页面未找到/);
    assert.doesNotMatch(html, /id="fileInput"/);

    await withBrowser(async browser => {
      const page = await navigateAndRead(browser, `${pages.origin}${unknownPath}`);
      assert.match(page.title, /404/);
      assert.equal(page.robots, 'noindex, nofollow');
      assert.match(page.heading, /页面未找到/);
      assert.equal(page.site, 'watermark-404');
      assert.deepEqual(page.remoteScripts, []);
      assert.deepEqual(page.analyticsMarkers, []);
    });
  } finally {
    process.kill(-pages.child.pid, 'SIGTERM');
  }
});
