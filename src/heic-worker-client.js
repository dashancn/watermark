import { isPng } from './heic-core.js';

export class HeicWorkerClient {
  #WorkerClass;
  #workerUrl;
  #timeoutMs;
  #worker;
  #reject;
  #timer;

  constructor({ WorkerClass = Worker, workerUrl = null, timeoutMs = 300_000 } = {}) {
    this.#WorkerClass = WorkerClass;
    this.#workerUrl = workerUrl || new URL('../public/heic/heic-worker.js', import.meta.url);
    this.#timeoutMs = timeoutMs;
  }

  decode(file, onInspected = () => {}) {
    const worker = new this.#WorkerClass(this.#workerUrl, { type: 'module', name: 'watermark-heic-decoder' });
    this.#worker = worker;
    return new Promise((resolve, reject) => {
      this.#reject = reject;
      const finish = (callback, value) => {
        clearTimeout(this.#timer);
        this.#timer = undefined;
        worker.terminate();
        if (this.#worker === worker) this.#worker = undefined;
        this.#reject = undefined;
        callback(value);
      };
      this.#timer = setTimeout(() => finish(reject, new Error('HEIC 解码超时，已停止后台任务')), this.#timeoutMs);
      worker.onerror = () => finish(reject, new Error('HEIC 解码资源不可用，请检查网络后重试'));
      worker.onmessage = ({ data }) => {
        if (data?.id !== 1) return;
        if (data.type === 'inspected') {
          try { onInspected(data.width, data.height); }
          catch (error) { finish(reject, error); }
          return;
        }
        if (data.type === 'error') { finish(reject, new Error(data.error || 'HEIC 解码失败')); return; }
        if (data.type !== 'result') return;
        const bytes = data.buffer instanceof ArrayBuffer ? new Uint8Array(data.buffer) : null;
        if (!isPng(data.mimeType, bytes)) { finish(reject, new Error('HEIC worker 未返回有效 PNG')); return; }
        finish(resolve, { buffer: data.buffer, mimeType: data.mimeType, width: data.width, height: data.height });
      };
      worker.postMessage({ id: 1, file });
    });
  }

  terminate() {
    if (!this.#worker) return;
    const worker = this.#worker;
    this.#worker = undefined;
    worker.terminate();
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const reject = this.#reject;
    this.#reject = undefined;
    reject?.(new Error('HEIC 解码已取消'));
  }
}
