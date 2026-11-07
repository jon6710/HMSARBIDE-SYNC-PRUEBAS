(()=>{
'use strict';
const DB_NAME='hmsarbide_offline_sync_piloto_v1';
const DB_VERSION=2;
const Q='queue', B='blobs', S='state';
const CFG_KEY='hmsarbide_cloudflare_disabled_sync_piloto_v1_config';
let dbp;
const listeners=new Set();
let syncing=false;
function openDB(){
  if(dbp)return dbp;
  dbp=new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{
      const db=r.result;
      if(!db.objectStoreNames.contains(Q)){
        const s=db.createObjectStore(Q,{keyPath:'id'});
        s.createIndex('status','status',{unique:false});
        s.createIndex('updatedAt','updatedAt',{unique:false});
      }
      if(!db.objectStoreNames.contains(B))db.createObjectStore(B,{keyPath:'id'});
      if(!db.objectStoreNames.contains(S))db.createObjectStore(S,{keyPath:'id'});
    };
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  return dbp;
}
function tx(store,mode='readonly'){return openDB().then(db=>db.transaction(store,mode).objectStore(store));}
function req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});}
async function putQueue(item){const s=await tx(Q,'readwrite');await req(s.put(item));notify();}
async function enqueue(kind,payload,{dedupeKey='',blobId=''}={}){
  // El piloto Supabase mantiene su propia cola. Para archivos, quedan localmente en IndexedDB.
  return 'guardado-local';
  const now=new Date().toISOString();
  if(dedupeKey){
    const all=await listQueue();
    const old=all.find(x=>x.dedupeKey===dedupeKey&&x.status==='pending');
    if(old){old.payload=payload;old.updatedAt=now;old.blobId=blobId||old.blobId;await putQueue(old);return old.id;}
  }
  const id='q_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  await putQueue({id,kind,payload,dedupeKey,blobId,status:'pending',createdAt:now,updatedAt:now,tries:0,lastError:''});
  return id;
}
async function listQueue(){const s=await tx(Q);return (await req(s.getAll()))||[];}
async function pendingCount(){return (await listQueue()).filter(x=>x.status==='pending').length;}
async function storeBlob(blob,meta={}){
  const id='blob_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const s=await tx(B,'readwrite');
  await req(s.put({id,blob,meta,createdAt:new Date().toISOString()}));
  return id;
}
async function getBlob(id){if(!id)return null;const s=await tx(B);return req(s.get(id));}
async function saveState(value){const s=await tx(S,'readwrite');await req(s.put({id:'main',value,updatedAt:new Date().toISOString()}));}
async function loadState(){const s=await tx(S);const rec=await req(s.get('main'));return rec?.value||null;}
async function deleteBlob(id){if(!id)return;const s=await tx(B,'readwrite');return req(s.delete(id));}
async function setStatus(id,status,lastError=''){const s=await tx(Q,'readwrite');const item=await req(s.get(id));if(!item)return;item.status=status;item.lastError=lastError;item.updatedAt=new Date().toISOString();if(status==='pending')item.tries=(item.tries||0)+1;await req(s.put(item));}
async function deleteQueue(id){const s=await tx(Q,'readwrite');await req(s.delete(id));notify();}
function getConfig(){
  try{return JSON.parse(localStorage.getItem(CFG_KEY)||'{}')}catch{return {}}
}
function configure({endpoint='',token=''}={}){
  throw new Error('Cloudflare está deshabilitado en este piloto de Supabase');
  endpoint=String(endpoint||'').trim().replace(/\/+$/,'');
  token=String(token||'').trim();
  if(endpoint&&!/^https:\/\//i.test(endpoint))throw new Error('La URL debe empezar por https://');
  localStorage.setItem(CFG_KEY,JSON.stringify({endpoint,token}));
  notify();
  if(navigator.onLine&&endpoint&&token)setTimeout(syncNow,100);
}
function clearConfig(){localStorage.removeItem(CFG_KEY);notify();}
function endpoint(){return (getConfig().endpoint||'').trim();}
function token(){return (getConfig().token||'').trim();}
function authHeaders(extra={}){const t=token();return {...extra,...(t?{Authorization:`Bearer ${t}`}:{})};}
function fileToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(r.error);r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});}
async function hydratePhotos(remote,files){
  if(!remote||!Array.isArray(remote.services)||!Array.isArray(files))return remote;
  const ep=endpoint();
  const photos=files.filter(f=>f.kind==='photo');
  for(const f of photos){
    const svc=remote.services.find(s=>s.id===f.serviceId);if(!svc)continue;
    svc.photos=svc.photos||{};
    try{
      const resp=await fetch(`${ep}/file/${encodeURIComponent(f.id)}`,{headers:authHeaders()});
      if(!resp.ok)continue;
      const blob=await resp.blob();
      svc.photos[f.refKey]=await fileToDataURL(blob);
    }catch{}
  }
  const atts=files.filter(f=>f.kind==='attachment');
  for(const f of atts){
    const svc=remote.services.find(s=>s.id===f.serviceId);if(!svc)continue;
    svc.attachments=svc.attachments||[];
    let a=svc.attachments.find(x=>x.id===f.refKey);
    if(!a){a={id:f.refKey,name:f.fileName||'Documento',type:f.contentType||'application/octet-stream',size:f.size||0,createdAt:f.createdAt,syncStatus:'synced',remoteFileId:f.id};svc.attachments.push(a)}
    else{a.syncStatus='synced';a.remoteFileId=f.id;a.localOnly=false;}
  }
  return remote;
}
async function pullRemote(){
  const ep=endpoint();if(!ep||!token()||!navigator.onLine)return {updated:false,reason:'not-ready'};
  const resp=await fetch(`${ep}/snapshot`,{headers:authHeaders({'Accept':'application/json'})});
  if(resp.status===404)return {updated:false,reason:'empty'};
  if(!resp.ok)throw new Error('Descarga nube HTTP '+resp.status);
  const data=await resp.json();
  if(!data?.state||!Array.isArray(data.state.services))return {updated:false,reason:'empty'};
  const remote=await hydratePhotos(data.state,data.files||[]);
  if(window.MHSApp?.applyRemoteState){
    await window.MHSApp.applyRemoteState(remote,{source:'cloudflare',updatedAt:data.updatedAt||''});
    return {updated:true};
  }
  await saveState(remote);
  return {updated:true,reloadRecommended:true};
}
async function syncNow(){
  if(syncing||!navigator.onLine)return {synced:0,pending:await pendingCount(),reason:!navigator.onLine?'offline':'busy'};
  const ep=endpoint();
  if(!ep||!token()){notify();return {synced:0,pending:await pendingCount(),reason:'no-endpoint'};}
  syncing=true;notify();let synced=0;let pulled=false;
  try{
    const items=(await listQueue()).filter(x=>x.status==='pending').sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    for(const item of items){
      try{
        const fd=new FormData();fd.append('kind',item.kind);fd.append('payload',JSON.stringify(item.payload||{}));fd.append('queueId',item.id);
        if(item.blobId){const rec=await getBlob(item.blobId);if(rec?.blob)fd.append('file',rec.blob,rec.meta?.name||'archivo');}
        const resp=await fetch(`${ep}/sync`,{method:'POST',body:fd,headers:authHeaders({'X-MHS-Offline-Queue':'1'})});
        if(!resp.ok){const txt=await resp.text().catch(()=>String(resp.status));throw new Error(`HTTP ${resp.status} ${txt.slice(0,100)}`);}
        await deleteQueue(item.id);if(item.blobId)await deleteBlob(item.blobId);synced++;
      }catch(e){await setStatus(item.id,'pending',String(e?.message||e));break;}
    }
    try{const r=await pullRemote();pulled=!!r.updated;}catch(e){console.warn('No se pudo descargar estado remoto',e);}
  }finally{syncing=false;notify();}
  return {synced,pulled,pending:await pendingCount(),reason:'done'};
}
async function testConnection(){
  const ep=endpoint();if(!ep||!token())throw new Error('Falta URL o token');
  const r=await fetch(`${ep}/health`,{headers:authHeaders()});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}
async function getStatus(){const c=getConfig();return {online:navigator.onLine,pending:await pendingCount(),syncing,configured:!!(c.endpoint&&c.token),endpoint:c.endpoint||''};}
function onStatus(fn){listeners.add(fn);getStatus().then(fn);return()=>listeners.delete(fn);}
async function notify(){const st=await getStatus();listeners.forEach(fn=>{try{fn(st)}catch{}});}
window.addEventListener('online',()=>{notify();syncNow();});
window.addEventListener('offline',notify);
setInterval(()=>{if(navigator.onLine)syncNow();},45000);
openDB().then(notify).catch(()=>{});
window.MHSOffline={enqueue,storeBlob,getBlob,saveState,loadState,listQueue,pendingCount,syncNow,pullRemote,testConnection,getStatus,onStatus,endpoint,getConfig,configure,clearConfig};
})();
