import { clampWatermarkOffset, drawWatermark, expandTemplate, sanitizeFilename, shouldRecommendCompression } from './watermark.js';
import { CACHE_KEY, VersionOwner, baseName, hasHeicSignature, readinessMessage, validateHeicFile, validateImageDimensions } from './heic-core.js';

const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['fileInput','dropZone','heicStatus','fileList','fileCount','clearFiles','text','color','opacity','opacityOut','fontSize','sizeOut','angle','angleOut','count','countOut','downloadCurrent','downloadAll','preview','empty','thumbs','currentName','dragHint','resetPosition','largeImageDialog','largeImageMessage','continueWatermark'].map(id => [id,$(id)]));
const state = { files: [], active: 0, image: null, imageUrl: null, renderId: 0, offsets: new Map(), pendingFiles: [] };
const selectionOwner = new VersionOwner();
let activeHeicClient;

function options(file) {
  return {
    text: expandTemplate(elements.text.value, file.name),
    color: elements.color.value,
    opacity: Number(elements.opacity.value) / 100,
    fontSize: Number(elements.fontSize.value),
    angle: Number(elements.angle.value),
    count: Number(elements.count.value),
    offset: state.offsets.get(file) || { x: 0, y: 0 },
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片')); };
    image.src = url;
  });
}

function showHeicStatus(message, error = false) {
  elements.heicStatus.hidden = false;
  elements.heicStatus.textContent = message;
  elements.heicStatus.classList.toggle('error', error);
}

function hideHeicStatus() {
  elements.heicStatus.hidden = true;
  elements.heicStatus.textContent = '';
  elements.heicStatus.classList.remove('error');
}

async function adaptFile(file, version) {
  const header = new Uint8Array(await file.slice(0, Math.min(file.size, 128)).arrayBuffer());
  if (!selectionOwner.isCurrent(version)) return null;
  const heic = hasHeicSignature(header);
  const heicNamed = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
  if (heicNamed && !heic) throw new Error('该文件不是有效的 HEIC/HEIF 图片');
  if (!heic) return file;
  validateHeicFile(file);
  showHeicStatus(readinessMessage(localStorage));
  const { HeicWorkerClient } = await import('./heic-worker-client.js');
  if (!selectionOwner.isCurrent(version)) return null;
  const client = new HeicWorkerClient({ workerUrl: new URL('../public/heic/heic-worker.js', import.meta.url) });
  activeHeicClient = client;
  try {
    const result = await client.decode(file, validateImageDimensions);
    if (!selectionOwner.isCurrent(version)) return null;
    validateImageDimensions(result.width, result.height);
    const converted = new File([result.buffer], `${baseName(file.name)}.png`, { type: 'image/png' });
    const { image, url } = await loadImage(converted);
    URL.revokeObjectURL(url);
    if (image.naturalWidth !== result.width || image.naturalHeight !== result.height) throw new Error('PNG 尺寸校验失败');
    localStorage.setItem(CACHE_KEY, '1');
    showHeicStatus('HEIC/HEIF 已在浏览器本地转换为 PNG，可继续加水印。元数据/EXIF 可能不会保留。');
    return converted;
  } finally {
    if (activeHeicClient === client) activeHeicClient = undefined;
    client.terminate();
  }
}

async function render() {
  const file = state.files[state.active];
  if (!file) { elements.empty.hidden = false; elements.preview.width = 0; elements.preview.height = 0; elements.currentName.textContent = ''; return; }
  const renderId = ++state.renderId;
  const loaded = await loadImage(file);
  if (renderId !== state.renderId) { URL.revokeObjectURL(loaded.url); return; }
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.image = loaded.image; state.imageUrl = loaded.url;
  drawWatermark(elements.preview, state.image, options(file));
  elements.dragHint.hidden = false;
  elements.empty.hidden = true;
  elements.currentName.textContent = file.name;
}

function refreshFiles() {
  elements.fileCount.textContent = state.files.length ? `已添加 ${state.files.length} 张图片` : '尚未添加图片';
  elements.fileList.innerHTML = '';
  elements.thumbs.innerHTML = '';
  state.files.forEach((file,index) => {
    const item = document.createElement('div'); item.className = `file-item${index===state.active?' active':''}`;
    const name = document.createElement('button'); name.textContent=file.name; name.onclick=()=>{state.active=index;refreshFiles();render()};
    const remove = document.createElement('button'); remove.textContent='移除'; remove.onclick=()=>{state.files.splice(index,1);state.active=Math.min(state.active,state.files.length-1);refreshFiles();render()};
    item.append(name,remove); elements.fileList.append(item);
    const thumb=document.createElement('button'); thumb.className=`thumb${index===state.active?' active':''}`; const img=document.createElement('img'); const url=URL.createObjectURL(file); img.onload=()=>URL.revokeObjectURL(url); img.src=url; thumb.append(img); thumb.onclick=()=>{state.active=index;refreshFiles();render()}; elements.thumbs.append(thumb);
  });
  const enabled=state.files.length>0; elements.downloadCurrent.disabled=!enabled; elements.downloadAll.disabled=!enabled;
}

async function splitLargeFiles(files) {
  const regular=[]; const large=[];
  for (const file of files) {
    try {
      const { image, url } = await loadImage(file);
      (shouldRecommendCompression(file, image.naturalWidth, image.naturalHeight) ? large : regular).push(file);
      URL.revokeObjectURL(url);
    } catch { regular.push(file); }
  }
  return { regular, large };
}

function commitFiles(files) {
  const accepted=[...files].filter(file=>/^image\/(jpeg|png|webp)$/.test(file.type) && file.size<=30*1024*1024);
  state.files.push(...accepted); if(state.files.length===accepted.length) state.active=0; refreshFiles(); render();
}

async function addFiles(files) {
  const version = selectionOwner.next();
  activeHeicClient?.terminate();
  activeHeicClient = undefined;
  hideHeicStatus();
  const accepted=[];
  for (const file of files) {
    try {
      const adapted = await adaptFile(file, version);
      if (!selectionOwner.isCurrent(version)) return;
      if (adapted && /^image\/(jpeg|png|webp)$/.test(adapted.type) && adapted.size<=30*1024*1024) accepted.push(adapted);
    } catch (error) {
      if (selectionOwner.isCurrent(version)) showHeicStatus(error?.message?.includes('20 MiB') || error?.message?.includes('有效的 HEIC') ? error.message : 'HEIC 解码失败，请确认文件有效，或检查资源后重试。', true);
    }
  }
  if (!selectionOwner.isCurrent(version)) return;
  const { regular, large } = await splitLargeFiles(accepted);
  if (!selectionOwner.isCurrent(version)) return;
  commitFiles(regular);
  if (large.length) {
    state.pendingFiles = large;
    elements.largeImageMessage.textContent = `检测到 ${large.length} 张较大图片。大图直接加水印会产生更大的导出文件，是否先去压缩？`;
    elements.largeImageDialog.showModal();
  }
}

function exportFile(file) {
  return loadImage(file).then(({image,url}) => {
    const canvas=document.createElement('canvas'); drawWatermark(canvas,image,options(file)); URL.revokeObjectURL(url);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('导出失败')),'image/png'));
  });
}

function downloadBlob(blob,name) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

elements.fileInput.onchange=e=>{const files=[...e.target.files];elements.fileInput.value='';addFiles(files)};
for(const type of ['dragenter','dragover']) elements.dropZone.addEventListener(type,e=>{e.preventDefault();elements.dropZone.classList.add('drag')});
for(const type of ['dragleave','drop']) elements.dropZone.addEventListener(type,e=>{e.preventDefault();elements.dropZone.classList.remove('drag')});
elements.dropZone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
elements.clearFiles.onclick=()=>{selectionOwner.next();activeHeicClient?.terminate();activeHeicClient=undefined;hideHeicStatus();state.files=[];state.active=0;refreshFiles();render()};
elements.continueWatermark.onclick=()=>{const files=state.pendingFiles.splice(0);elements.largeImageDialog.close();commitFiles(files)};
elements.resetPosition.onclick=()=>{const file=state.files[state.active];if(file){state.offsets.set(file,{x:0,y:0});render()}};
document.querySelectorAll('[data-template]').forEach(button=>button.onclick=()=>{elements.text.value=button.dataset.template;render()});
document.querySelectorAll('[data-token]').forEach(button=>button.onclick=()=>{elements.text.value+=button.dataset.token;render()});
for(const id of ['text','color','opacity','fontSize','angle','count']) elements[id].addEventListener('input',()=>{elements.opacityOut.value=`${elements.opacity.value}%`;elements.sizeOut.value=elements.fontSize.value==='0'?'自动':`${elements.fontSize.value}px`;elements.angleOut.value=`${elements.angle.value}°`;elements.countOut.value=`${elements.count.value} 条`;render()});
elements.downloadCurrent.onclick=async()=>{const file=state.files[state.active];downloadBlob(await exportFile(file),sanitizeFilename(file.name))};
elements.downloadAll.onclick=async()=>{elements.downloadAll.disabled=true;for(const file of state.files){downloadBlob(await exportFile(file),sanitizeFilename(file.name));await new Promise(r=>setTimeout(r,180))}elements.downloadAll.disabled=false};

let drag;
elements.preview.addEventListener('pointerdown',event=>{
  const file=state.files[state.active]; if(!file||!state.image)return;
  const current=state.offsets.get(file)||{x:0,y:0};
  drag={file,startX:event.clientX,startY:event.clientY,current};
  elements.preview.setPointerCapture(event.pointerId);
});
elements.preview.addEventListener('pointermove',event=>{
  if(!drag)return;
  const scaleX=elements.preview.width/elements.preview.getBoundingClientRect().width;
  const scaleY=elements.preview.height/elements.preview.getBoundingClientRect().height;
  state.offsets.set(drag.file,clampWatermarkOffset(elements.preview.width,elements.preview.height,{x:drag.current.x+(event.clientX-drag.startX)*scaleX,y:drag.current.y+(event.clientY-drag.startY)*scaleY}));
  drawWatermark(elements.preview,state.image,options(drag.file));
});
for(const type of ['pointerup','pointercancel']) elements.preview.addEventListener(type,()=>{drag=null});

refreshFiles();
window.addEventListener('pagehide',()=>{selectionOwner.next();activeHeicClient?.terminate();activeHeicClient=undefined;if(state.imageUrl)URL.revokeObjectURL(state.imageUrl)});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
