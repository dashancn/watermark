import { inspectHeic, decodeHeic } from './heic-to-1.5.2.worker.js'

const MAX_PIXELS = 30_000_000
const MAX_EDGE = 10_000
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])
const text = new TextDecoder('ascii')
function hasHeicSignature(bytes) {
  if (bytes.length < 12 || text.decode(bytes.subarray(4, 8)) !== 'ftyp') return false
  const declaredSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  if (declaredSize < 12 || declaredSize > bytes.length || (declaredSize - 12) % 4 !== 0) return false
  for (let offset = 8; offset + 4 <= declaredSize; offset += 4) {
    if (HEIF_BRANDS.has(text.decode(bytes.subarray(offset, offset + 4)))) return true
  }
  return false
}
function validate(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('图片尺寸无效')
  if (width > MAX_EDGE || height > MAX_EDGE) throw new Error('图片边长不能超过 10000 像素')
  if (width * height > MAX_PIXELS) throw new Error('图片不能超过 3000 万像素')
}
self.onmessage = async ({ data }) => {
  const { id, file } = data || {}
  try {
    const buffer = await file.arrayBuffer()
    if (!hasHeicSignature(new Uint8Array(buffer))) throw new Error('文件不是有效的 HEIC/HEIF 图片')
    const dimensions = inspectHeic(buffer)
    validate(dimensions.width, dimensions.height)
    self.postMessage({ id, type: 'inspected', ...dimensions })
    const imageData = await decodeHeic(buffer, validate)
    const canvas = new OffscreenCanvas(imageData.width, imageData.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法创建后台画布')
    context.putImageData(imageData, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const output = await blob.arrayBuffer()
    const signature = new Uint8Array(output, 0, Math.min(8, output.byteLength))
    if (blob.type !== 'image/png' || output.byteLength < 8 || ![137,80,78,71,13,10,26,10].every((v, i) => signature[i] === v)) throw new Error('浏览器未生成有效 PNG')
    canvas.width = 1; canvas.height = 1
    self.postMessage({ id, type: 'result', buffer: output, mimeType: 'image/png', width: dimensions.width, height: dimensions.height }, [output])
  } catch (error) {
    self.postMessage({ id, type: 'error', error: error?.message || 'HEIC 解码失败' })
  }
}
