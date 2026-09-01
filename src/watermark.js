export function calculateWatermarkPositions(width, height, requestedCount = 2) {
  const count = Math.min(3, Math.max(1, Math.round(Number(requestedCount) || 2)));
  const spacing = height * 0.24;
  const centerY = height / 2;
  const startY = centerY - spacing * (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: width / 2,
    y: Math.round(startY + spacing * index),
  }));
}

export function sanitizeFilename(filename) {
  const stem = String(filename || 'image').replace(/\.[^.]+$/, '').trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '-');
  return `${stem || 'image'}-watermarked.png`;
}

export function expandTemplate(text, fileName, now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return String(text || '')
    .replaceAll('{date}', `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
    .replaceAll('{time}', `${pad(now.getHours())}:${pad(now.getMinutes())}`)
    .replaceAll('{filename}', String(fileName || '').replace(/\.[^.]+$/, ''));
}

export function drawWatermark(canvas, image, options) {
  const ctx = canvas.getContext('2d');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const fontSize = Math.max(12, Number(options.fontSize) || Math.round(Math.min(canvas.width, canvas.height) * 0.045));
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((Number(options.angle) || -30) * Math.PI / 180);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  ctx.fillStyle = options.color || '#ffffff';
  ctx.globalAlpha = Math.min(1, Math.max(0.05, Number(options.opacity) || 0.25));
  ctx.font = `600 ${fontSize}px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const positions = calculateWatermarkPositions(canvas.width, canvas.height, options.count);
  for (const point of positions) ctx.fillText(options.text, point.x, point.y);
  ctx.restore();
}
