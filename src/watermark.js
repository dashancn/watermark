export function calculateWatermarkGrid(width, height, gapX, gapY, angleDeg) {
  const angle = Math.abs(angleDeg) * Math.PI / 180;
  const extent = Math.ceil(Math.hypot(width, height) + Math.sin(angle) * Math.max(width, height));
  const points = [];
  let row = 0;
  for (let y = -extent; y <= height + extent; y += Math.max(20, gapY)) {
    const offset = row % 2 ? Math.max(20, gapX) / 2 : 0;
    for (let x = -extent - offset; x <= width + extent; x += Math.max(20, gapX)) points.push({ x, y });
    row += 1;
  }
  return points;
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
  const grid = calculateWatermarkGrid(canvas.width, canvas.height, Number(options.gapX) || 280, Number(options.gapY) || 140, Number(options.angle) || -30);
  for (const point of grid) ctx.fillText(options.text, point.x, point.y);
  ctx.restore();
}
