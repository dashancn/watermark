import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const version = await (await fetch('http://127.0.0.1:9222/json/version')).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
};
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
const requests = [];
const downloads = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.sessionId === sessionId && message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  if (message.sessionId === sessionId && message.method === 'Page.downloadWillBegin') downloads.push(message.params);
});
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp/watermark-downloads' }, sessionId);
await send('Page.navigate', { url: base }, sessionId);
await new Promise((resolve) => setTimeout(resolve, 1500));
const evaluate = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId)).result.value;
assert.match(await evaluate("document.querySelector('#fileInput').accept"), /\.heic/);
assert.equal(requests.some((url) => url.includes('/public/heic/')), false, 'HEIC runtime loaded before HEIC selection');
await evaluate(`(async()=>{const response=await fetch('/test/fixtures-libheif-example.heic');const blob=await response.blob();const file=new File([blob],'fixture.heic',{type:'image/heic'});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('#fileInput');Object.defineProperty(input,'files',{configurable:true,value:transfer.files});input.dispatchEvent(new Event('change',{bubbles:true}))})()`, true);
await new Promise((resolve) => setTimeout(resolve, 12000));
const result = await evaluate(`(() => ({status:document.querySelector('#heicStatus').textContent,count:document.querySelector('#fileCount').textContent,name:document.querySelector('#currentName').textContent,width:document.querySelector('#preview').width,height:document.querySelector('#preview').height}))()`);
assert.match(result.status, /本地转换为 PNG/);
assert.match(result.count, /已添加 1 张图片/);
assert.match(result.name, /\.png$/);
assert.ok(result.width > 0 && result.height > 0);
assert.ok(requests.some((url) => url.includes('/public/heic/heic-worker.js')));
const runtimeResponse = await fetch(`${base}/public/heic/heic-to-1.5.2.worker.js`);
assert.equal(runtimeResponse.status, 200);
assert.ok(Number(runtimeResponse.headers.get('content-length') || 0) > 1_000_000);
await evaluate("document.querySelector('#downloadCurrent').click()");
await new Promise((resolve) => setTimeout(resolve, 1500));
assert.equal(downloads.length, 1);
assert.match(downloads[0].suggestedFilename, /-watermarked\.png$/);
assert.ok(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"));
console.log(JSON.stringify({ result, downloads, heicRequests: requests.filter((url) => url.includes('/public/heic/')) }, null, 2));
socket.close();
