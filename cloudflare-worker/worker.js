function cors(request, env){
  const origin=request.headers.get('Origin')||'';
  const allowed=(env.ALLOWED_ORIGIN||'*').trim();
  const value=allowed==='*'?'*':(origin===allowed?origin:allowed);
  return {
    'Access-Control-Allow-Origin':value,
    'Access-Control-Allow-Headers':'Authorization, Content-Type, X-MHS-Offline-Queue',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}})}
function unauthorized(headers){return json({ok:false,error:'unauthorized'},401,headers)}
function isAuth(request,env){const auth=request.headers.get('Authorization')||'';return !!env.SYNC_TOKEN&&auth===`Bearer ${env.SYNC_TOKEN}`;}
function parseTime(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0;}
function mergeStates(server,incoming){
  if(!server||!Array.isArray(server.services))return incoming;
  if(!incoming||!Array.isArray(incoming.services))return server;
  const map=new Map();
  for(const s of server.services)map.set(s.id,s);
  for(const s of incoming.services){const old=map.get(s.id);if(!old||parseTime(s.updatedAt)>=parseTime(old.updatedAt))map.set(s.id,s);}
  const merged={...server,...incoming,services:[...map.values()]};
  if(!incoming.company||!Object.keys(incoming.company).length)merged.company=server.company||{};
  return merged;
}
async function getState(env){
  const row=await env.DB.prepare('SELECT data, updated_at FROM app_state WHERE id=?').bind('main').first();
  if(!row)return null;
  try{return {state:JSON.parse(row.data),updatedAt:row.updated_at}}catch{return null;}
}
async function saveState(env,incoming){
  const current=await getState(env);const merged=mergeStates(current?.state,incoming);const now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO app_state(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at').bind('main',JSON.stringify(merged),now).run();
  return {state:merged,updatedAt:now};
}
async function listFiles(env){return (await env.DB.prepare('SELECT id, service_id as serviceId, kind, ref_key as refKey, file_name as fileName, content_type as contentType, size, created_at as createdAt, updated_at as updatedAt FROM files ORDER BY updated_at').all()).results||[];}
async function handleSync(request,env,headers){
  const form=await request.formData();const kind=String(form.get('kind')||'');let payload={};
  try{payload=JSON.parse(String(form.get('payload')||'{}'))}catch{return json({ok:false,error:'bad-payload'},400,headers)}
  if(kind==='state_snapshot'){
    const saved=await saveState(env,payload);return json({ok:true,kind,updatedAt:saved.updatedAt},200,headers);
  }
  if(kind==='photo'||kind==='attachment'){
    const file=form.get('file');if(!(file instanceof File))return json({ok:false,error:'file-required'},400,headers);
    const serviceId=String(payload.serviceId||'');const refKey=String(kind==='photo'?payload.key:payload.attachmentId||'');
    if(!serviceId||!refKey)return json({ok:false,error:'missing-reference'},400,headers);
    const id=`${serviceId}:${kind}:${refKey}`;const safeName=String(payload.name||file.name||'archivo').replace(/[^a-zA-Z0-9._-]+/g,'_');
    const r2Key=`services/${serviceId}/${kind}/${refKey}-${safeName}`;const now=new Date().toISOString();
    await env.FILES.put(r2Key,file.stream(),{httpMetadata:{contentType:file.type||payload.type||'application/octet-stream'},customMetadata:{serviceId,kind,refKey}});
    await env.DB.prepare(`INSERT INTO files(id,service_id,kind,ref_key,file_name,content_type,size,r2_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(service_id,kind,ref_key) DO UPDATE SET id=excluded.id,file_name=excluded.file_name,content_type=excluded.content_type,size=excluded.size,r2_key=excluded.r2_key,updated_at=excluded.updated_at`).bind(id,serviceId,kind,refKey,payload.name||file.name,file.type||payload.type||'application/octet-stream',file.size||payload.size||0,r2Key,now,now).run();
    return json({ok:true,kind,id},200,headers);
  }
  return json({ok:false,error:'unsupported-kind'},400,headers);
}
export default {
  async fetch(request,env){
    const headers=cors(request,env);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!isAuth(request,env))return unauthorized(headers);
    const url=new URL(request.url);
    if(url.pathname==='/health'&&request.method==='GET')return json({ok:true,service:'mhs-v46-cloudflare',time:new Date().toISOString()},200,headers);
    if(url.pathname==='/sync'&&request.method==='POST')return handleSync(request,env,headers);
    if(url.pathname==='/snapshot'&&request.method==='GET'){
      const saved=await getState(env);if(!saved)return json({ok:false,error:'empty'},404,headers);
      return json({ok:true,state:saved.state,updatedAt:saved.updatedAt,files:await listFiles(env)},200,headers);
    }
    if(url.pathname.startsWith('/file/')&&request.method==='GET'){
      const id=decodeURIComponent(url.pathname.slice('/file/'.length));const row=await env.DB.prepare('SELECT r2_key, content_type, file_name FROM files WHERE id=?').bind(id).first();
      if(!row)return json({ok:false,error:'not-found'},404,headers);const obj=await env.FILES.get(row.r2_key);if(!obj)return json({ok:false,error:'not-found'},404,headers);
      const h=new Headers(headers);h.set('content-type',row.content_type||obj.httpMetadata?.contentType||'application/octet-stream');h.set('cache-control','private, max-age=300');h.set('content-disposition',`inline; filename="${String(row.file_name||'archivo').replace(/"/g,'')}"`);return new Response(obj.body,{headers:h});
    }
    return json({ok:false,error:'not-found'},404,headers);
  }
};
