import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = [];
async function collect(dir, prefix = '') { for (const item of await readdir(dir, { withFileTypes: true })) { if (item.isDirectory()) await collect(`${dir}/${item.name}`, `${prefix}${item.name}/`); else if (item.name !== 'sw.js') files.push(`/${prefix}${item.name}`); } }
await collect('dist');
const hash = createHash('sha256'); for (const file of files.sort()) hash.update(await readFile('dist' + file));
const name = 'sica-shell-' + hash.digest('hex').slice(0, 12);
await writeFile('dist/sw.js', `const CACHE=${JSON.stringify(name)};const ASSETS=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sica-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const request=event.request;const url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||request.headers.has('authorization'))return;
if(request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/index.html'))||fetch(request)));return;}
if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(request)));
});
self.addEventListener('push',event=>{let data={};try{data=event.data?event.data.json():{};}catch{}
event.waitUntil(self.registration.showNotification(data.title||'Zentry',{body:data.body||'',tag:data.tag,renotify:!!data.tag,icon:'/icon-192.png',badge:'/icon-192.png',data:{url:data.url||'/'}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const target=new URL(event.notification.data?.url||'/',self.location.origin).href;
event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const open=list.find(c=>c.url.startsWith(self.location.origin));if(open){return open.navigate(target).catch(()=>open).then(c=>(c||open).focus());}return self.clients.openWindow(target);}));});`);
console.log('PWA shell:', name, '·', files.length, 'assets. API and QR URLs are never cached.');
