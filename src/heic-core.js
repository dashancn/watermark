export const MAX_HEIC_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 30_000_000;
export const MAX_IMAGE_EDGE = 10_000;
export const CACHE_KEY = 'i41-watermark-heic-decoder-success-v1';

const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const text = new TextDecoder('ascii');

export function hasHeicSignature(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || text.decode(bytes.subarray(4, 8)) !== 'ftyp') return false;
  const declaredSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (declaredSize < 12 || declaredSize > bytes.length || (declaredSize - 12) % 4 !== 0) return false;
  for (let offset = 8; offset + 4 <= declaredSize; offset += 4) {
    if (HEIF_BRANDS.has(text.decode(bytes.subarray(offset, offset + 4)))) return true;
  }
  return false;
}

export function validateHeicFile(file) {
  if (file.size > MAX_HEIC_BYTES) throw new Error('HEIC/HEIF 文件不能超过 20 MiB');
}

export function validateImageDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('图片尺寸无效');
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) throw new Error('图片边长不能超过 10000 像素');
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('图片不能超过 3000 万像素');
}

export function isPng(mimeType, bytes) {
  return mimeType === 'image/png' && bytes instanceof Uint8Array && bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
}

export class VersionOwner {
  #version = 0;
  next() { this.#version += 1; return this.#version; }
  isCurrent(version) { return version === this.#version; }
}

export function readinessMessage(storage) {
  return storage.getItem(CACHE_KEY) === '1'
    ? 'HEIC 解码资源曾成功加载，本次可能可从浏览器缓存快速开始。'
    : '首次读取 HEIC/HEIF 需加载约 3.0 MB 原始资源（约 0.8 MB 压缩传输），耗时取决于网络，请保持页面打开。';
}

export function baseName(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
