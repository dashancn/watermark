import { drawWatermark, expandTemplate, sanitizeFilename } from './watermark.js';

const $ = id => document.getElementById(id);
const elements = Object.fromEntries(['fileInput','dropZone','fileList','fileCount','clearFiles','text','color','opacity','opacityOut','fontSize','sizeOut','angle','angleOut','gapX','gapY','downloadCurrent','downloadAll','preview','empty','thumbs','currentName'].map(id => [id,$(id)]));
const state = { files: [], active: 0, image: null, imageUrl: null, renderId: 0 };

function options(file) {
  return {
    text: expandTemplate(elements.text.value, file.name),
    color: elements.color.value,
    opacity: Number(elements.opacity.value) / 100,
    fontSize: Number(elements.fontSize.value),
    angle: Number(elements.angle.value),
    gapX: Number(elements.gapX.value),
    gapY: Number(elements.gapY.value),
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

async function render() {
  const file = state.files[state.active];
  if (!file) { elements.empty.hidden = false; elements.preview.width = 0; elements.preview.height = 0; elements.currentName.textContent = ''; return; }
  const renderId = ++state.renderId;
  const loaded = await loadImage(file);
  if (renderId !== state.renderId) { URL.revokeObjectURL(loaded.url); return; }
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.image = loaded.image; state.imageUrl = loaded.url;
  drawWatermark(elements.preview, state.image, options(file));
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

function addFiles(files) {
  const accepted=[...files].filter(file=>/^image\/(jpeg|png|webp)$/.test(file.type) && file.size<=30*1024*1024);
  state.files.push(...accepted); if(state.files.length===accepted.length) state.active=0; refreshFiles(); render();
}

function exportFile(file) {
  return loadImage(file).then(({image,url}) => {
    const canvas=document.createElement('canvas'); drawWatermark(canvas,image,options(file)); URL.revokeObjectURL(url);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('导出失败')),'image/png'));
  });
}

function downloadBlob(blob,name) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

elements.fileInput.onchange=e=>addFiles(e.target.files);
for(const type of ['dragenter','dragover']) elements.dropZone.addEventListener(type,e=>{e.preventDefault();elements.dropZone.classList.add('drag')});
for(const type of ['dragleave','drop']) elements.dropZone.addEventListener(type,e=>{e.preventDefault();elements.dropZone.classList.remove('drag')});
elements.dropZone.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
elements.clearFiles.onclick=()=>{state.files=[];state.active=0;refreshFiles();render()};
document.querySelectorAll('[data-template]').forEach(button=>button.onclick=()=>{elements.text.value=button.dataset.template;render()});
document.querySelectorAll('[data-token]').forEach(button=>button.onclick=()=>{elements.text.value+=button.dataset.token;render()});
for(const id of ['text','color','opacity','fontSize','angle','gapX','gapY']) elements[id].addEventListener('input',()=>{elements.opacityOut.value=`${elements.opacity.value}%`;elements.sizeOut.value=elements.fontSize.value==='0'?'自动':`${elements.fontSize.value}px`;elements.angleOut.value=`${elements.angle.value}°`;render()});
elements.downloadCurrent.onclick=async()=>{const file=state.files[state.active];downloadBlob(await exportFile(file),sanitizeFilename(file.name))};
elements.downloadAll.onclick=async()=>{elements.downloadAll.disabled=true;for(const file of state.files){downloadBlob(await exportFile(file),sanitizeFilename(file.name));await new Promise(r=>setTimeout(r,180))}elements.downloadAll.disabled=false};

refreshFiles();
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
