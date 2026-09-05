const CACHE_NAME='i41-watermark-original-v3';
const ASSETS=['./','./index.html','./style.css','./src/app.js','./src/watermark.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok&&new URL(event.request.url).origin===location.origin)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone()));return response}))) });
