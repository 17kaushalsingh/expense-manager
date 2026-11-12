/* Public shell assets only. Financial data and credentials live in the encrypted vault. */
const CACHE = "ledgersync-offline-v2";
const DEVICE = "ledgersync-device-shell-v1";
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(c=>c.add("/offline.html")).then(()=>self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith("ledgersync-offline-")&&k!==CACHE)||(k.startsWith("ledgersync-device-shell-")&&k!==DEVICE)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("message",event=>{
 if(event.data?.type!=="ENABLE_DEVICE")return;
 event.waitUntil((async()=>{
  const cache=await caches.open(DEVICE),response=await fetch("/device",{cache:"no-store"});if(!response.ok)throw Error("Device shell unavailable");
  const html=await response.clone().text(),assets=new Set(["/icon-192.png","/icon-512.png"]);
  for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){const url=new URL(match[1],self.location.origin);if(url.origin===self.location.origin&&url.pathname.startsWith("/_next/static/"))assets.add(url.pathname);}
  // Store the document only after every dependency is cached, so an incomplete shell never replaces a working one.
  await cache.addAll([...assets]);await cache.put("/device",response);
  event.source?.postMessage({type:"DEVICE_READY",requestId:event.data.requestId});
 })().catch(()=>{event.source?.postMessage({type:"DEVICE_CACHE_FAILED",requestId:event.data.requestId});}));
});
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 if(url.pathname.startsWith("/_next/static/")){
  event.respondWith(caches.open(DEVICE).then(c=>c.match(event.request)).then(cached=>cached||fetch(event.request)));return;
 }
 if(event.request.mode!=="navigate")return;
 event.respondWith(fetch(event.request).catch(async()=>{
  if(url.pathname==="/device"||url.pathname==="/device/"){const shell=await caches.open(DEVICE).then(c=>c.match("/device"));if(shell)return shell;}
  return await caches.match("/offline.html")||new Response("You are offline. Open /device to use your prepared encrypted workspace.",{headers:{"Content-Type":"text/plain; charset=utf-8"}});
 }));
});
