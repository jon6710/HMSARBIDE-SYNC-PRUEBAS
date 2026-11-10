/* HMSARBIDE — Sincronización experimental aislada. No modifica las tablas antiguas.
   Registro inmutable de versiones en app_data. Ante cualquier divergencia, DETIENE la sincronización.
   No se usa en producción hasta superar las pruebas en los tres dispositivos. */
(()=>{
'use strict';
const URL='https://hargvujvvhwmvodlbarh.supabase.co';
const KEY='sb_publishable_alaHLd7sOSjAWRzKWLjRHg_-igTTOx8'; // Clave pública del cliente original; NUNCA service_role.
const NS='hmsarbide_sync_piloto_v1';
const DB='hmsarbide_supabase_piloto_v1';
const STATE_STORE='journal';
const event=(name,detail={})=>window.dispatchEvent(new CustomEvent('hms-sync-status',{detail:{name,...detail}}));
let client=null,sessionUser=null,working=false,suppressed=false,auto=false,timer=null;
// La recuperación no toca datos ni inicia la sincronización.
let recoveryGranted=false;
let recoveryNotice='';
let recoveryUI=null;
// Capturamos el enlace de recuperación ANTES de que Supabase o la interfaz lo procesen.
// Los tokens se usan una sola vez en memoria; se retiran inmediatamente de la URL.
const returnParams=new URLSearchParams(location.hash.replace(/^#/,''));
const recoveryReturn=(returnParams.get('type')==='recovery' && !!returnParams.get('access_token') && !!returnParams.get('refresh_token'))
  ? {access_token:returnParams.get('access_token'),refresh_token:returnParams.get('refresh_token')}:null;
const recoveryReturnError=returnParams.get('error_code')||returnParams.get('error')||'';
if(recoveryReturn || recoveryReturnError){
 history.replaceState(null,'',location.pathname+location.search);
}

function displayRecovery(){
 if(!recoveryUI)return;
 recoveryUI.panel.hidden=false;
 recoveryUI.area.hidden=!recoveryGranted;
 recoveryUI.status.textContent=recoveryNotice||(recoveryGranted?'Enlace de recuperación validado. Escribe la contraseña nueva.':'Solicita un enlace nuevo desde esta aplicación.');
}
async function sendRecovery(email){
 if(!navigator.onLine)throw Error('Conecta Internet para solicitar el correo.');
 if(!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('Introduce un correo electrónico válido.');
 const redirectTo=location.origin+location.pathname;
 const {error}=await sdk().auth.resetPasswordForEmail(email,{redirectTo});
 if(error)throw error;
 return 'Si el usuario existe, Supabase enviará un enlace. Ábrelo una sola vez; volverá a HMSARBIDE-SYNC-PRUEBAS.';
}
async function finishRecovery(password,confirmPassword){
 if(!recoveryGranted)throw Error('No hay un enlace de recuperación válido.');
 if(password.length<12)throw Error('La contraseña nueva debe tener al menos 12 caracteres.');
 if(password!==confirmPassword)throw Error('Las dos contraseñas no coinciden.');
 const {error}=await sdk().auth.updateUser({password});
 if(error)throw error;
 recoveryGranted=false;auto=false;
 await sdk().auth.signOut({scope:'local'});
 recoveryNotice='Contraseña actualizada. Ya puedes entrar con tu correo y la nueva contraseña.';
 displayRecovery();
 return recoveryNotice;
}
let dbPromise=null;
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STATE_STORE))r.result.createObjectStore(STATE_STORE);};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });return dbPromise;
}
async function get(k){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(STATE_STORE,'readonly');const r=t.objectStore(STATE_STORE).get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function set(k,v){const db=await openDB();return new Promise((resolve,reject)=>{const t=db.transaction(STATE_STORE,'readwrite');t.objectStore(STATE_STORE).put(v,k);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
// Escribe varios marcadores como una sola transacción (sin borrar otras claves).
async function setMany(entries){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const t=db.transaction(STATE_STORE,'readwrite');const store=t.objectStore(STATE_STORE);
  for(const [key,value] of entries)store.put(value,key);
  t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);
 });
}
// Comparación estable para evitar diferencias por el orden de las claves JSON.
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
const sameState=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

const uid=()=>crypto.randomUUID?crypto.randomUUID():('r'+Date.now()+'-'+Math.random().toString(36).slice(2));
const snapshot=()=>window.MHSApp?.getState?.();
const isEmpty=s=>!(s?.clients?.length||s?.services?.length||s?.invoices?.length||s?.products?.length||s?.budgets?.length||Object.values(s?.company||{}).some(Boolean));
let captureJob=Promise.resolve();
function onLocalSave(s){
 if(suppressed)return;
 // Cola escrita en IndexedDB antes de cualquier envío. Nunca se envía durante el guardado local.
 const copy=typeof structuredClone==='function'?structuredClone(s):JSON.parse(JSON.stringify(s));
 captureJob=captureJob.catch(()=>{}).then(async()=>{
  const existing=await get('draft');
  const base=existing?.base??await get('head')??null;
  await set('draft',{id:uid(),base,state:copy,updatedAt:new Date().toISOString()});
  event('pendiente');
 }).catch(e=>event('error',{message:'No se pudo conservar la cola local: '+e.message}));
}
async function handleRecoveryReturn(){
 if(!recoveryReturn)return;
 recoveryNotice='Validando el enlace de recuperación con Supabase…';
 displayRecovery();
 try{
  const {data,error}=await sdk().auth.setSession(recoveryReturn);
  if(error)throw error;
  if(!data?.session?.user)throw Error('Supabase no confirmó la sesión de recuperación.');
  recoveryGranted=true;
  auto=false;
  recoveryNotice='Enlace validado. Introduce y confirma una contraseña nueva (mínimo 12 caracteres).';
 }catch(e){
  recoveryGranted=false;
  recoveryNotice='No se pudo validar el enlace: '+e.message+'. Solicita otro enlace desde Recuperar contraseña.';
 }finally{
  recoveryReturn.access_token='';recoveryReturn.refresh_token='';
  displayRecovery();
 }
}
function sdk(){
 if(!window.supabase?.createClient)throw Error('Supabase no está disponible. La aplicación local sigue funcionando.');
 if(!client){
  client=window.supabase.createClient(URL,KEY,{auth:{storageKey:'hmsarbide-supabase-piloto-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
  client.auth.onAuthStateChange((type)=>{
   if(type==='PASSWORD_RECOVERY'){
    recoveryGranted=true;auto=false;
    recoveryNotice='Enlace válido. Introduce la contraseña nueva y confirma el cambio.';
    setTimeout(displayRecovery,0);
   }
  });
 }
 return client;
}
async function login(email,password){
 if(!navigator.onLine)throw Error('Necesitas Internet para iniciar sesión por primera vez.');
 const {data,error}=await sdk().auth.signInWithPassword({email,password});
 if(error)throw error;
 sessionUser=data.user;event('sesion');return !!sessionUser;
}
async function who(){
 const {data,error}=await sdk().auth.getUser();if(error){sessionUser=null;return null;}sessionUser=data.user||null;
 if(sessionUser)await checkAccount();return sessionUser;
}
async function checkAccount(){
 const existing=await get('owner');
 if(existing&&existing!==sessionUser.id)throw Error('Este perfil ya contiene datos de otro usuario. No se permite mezclar cuentas.');
 if(!existing)await set('owner',sessionUser.id);
}
async function logout(){if(client)await client.auth.signOut();sessionUser=null;auto=false;event('sin-sesion');}
// Lectura verificable: nunca ocultar filas por un filtro silencioso.
// Incluye una consulta puntual por record_id cuando el dispositivo ya reconoció un envío.
function decodeVersion(row){
 let raw=row.data;
 if(typeof raw==='string'){
  try{raw=JSON.parse(raw)}catch{return {error:'JSON no válido en data'}}
 }
 if(!raw||typeof raw!=='object')return {error:'data no es un objeto'};
 const version=raw.version;
 const state=raw.state;
 if(typeof version!=='string'||!version.trim())return {error:'falta version en data'};
 if(!state||!Array.isArray(state.services))return {error:'state.services no es una lista'};
 if(String(row.record_id)!==version)return {error:'record_id no coincide con version'};
 return {item:{...row,version,parent:raw.parent??null,state}};
}
// V6: contrastar dos lecturas independientes. Si una omite una fila, se bloquea
// la publicación y se informa del ID exacto; nunca se considera nube compatible.
async function fetchPaged(makeQuery,label){
 const rows=[];let page=0;
 while(true){
  const {data,error}=await makeQuery().order('created_at',{ascending:true}).range(page*500,(page+1)*500-1);
  if(error)throw Error('Fallo al leer '+label+': '+error.message);
  rows.push(...(data||[]));
  if(!data||data.length<500)break;
  if(++page>=10)throw Error('Demasiados registros en '+label+'. No continuar.');
 }
 return rows;
}
async function versions(){
 if(!await who())throw Error('Inicia sesión primero.');
 const table=()=>sdk().from('app_data').select('record_id,data,created_at,data_type,user_id');
 // La primera lectura filtra por usuario y tipo en el servidor.
 const a=await fetchPaged(()=>table().eq('user_id',sessionUser.id).eq('data_type',NS),'versiones del piloto');
 // La segunda lectura usa únicamente el filtro de usuario, comprobando el tipo localmente.
 const all=await fetchPaged(()=>table().eq('user_id',sessionUser.id),'registros del usuario');
 const b=all.filter(row=>row.data_type===NS);
 const ids=rows=>new Set(rows.map(row=>String(row.record_id)));
 const ai=ids(a),bi=ids(b);
 const onlyA=[...ai].filter(id=>!bi.has(id));
 const onlyB=[...bi].filter(id=>!ai.has(id));
 if(onlyA.length||onlyB.length){
  throw Error('LECTURA INCONSISTENTE: la consulta filtrada devuelve '+a.length+
   ' versiones y la consulta general devuelve '+b.length+
   '. IDs discrepantes: '+[...onlyA,...onlyB].slice(0,5).join(', ')+
   '. No publiques ni descargues; revisa Supabase y conserva JSON.');
 }
 const parsed=[],rejected=[];
 for(const row of a){
  if(row.user_id!==sessionUser.id||row.data_type!==NS){
   rejected.push(String(row.record_id)+': propietario/tipo inesperado');continue;
  }
  const result=decodeVersion(row);
  if(result.error)rejected.push(String(row.record_id)+': '+result.error);
  else parsed.push(result.item);
 }
 if(rejected.length)throw Error('Versiones de prueba ilegibles: '+rejected.slice(0,5).join('; ')+'. No publiques ni descargues.');
 const localHead=await get('head');
 const draft=await get('draft');
 const checkIds=[localHead,draft?.base,draft?.id].filter(Boolean);
 // Incluso si ambos listados coinciden, verificar individualmente las referencias locales.
 for(const id of new Set(checkIds)){
  const {data:probe,error}=await sdk().from('app_data')
   .select('record_id,data,data_type,user_id').eq('record_id',id).limit(2);
  if(error)throw Error('No se pudo comprobar el ID '+id+': '+error.message);
  const row=(probe||[]).find(r=>String(r.record_id)===String(id));
  if(row&&row.user_id===sessionUser.id&&row.data_type===NS){
   const decoded=decodeVersion(row);
   if(decoded.error)throw Error('Registro '+id+' ilegible: '+decoded.error);
   if(!ai.has(String(id)))throw Error('LECTURA INCOMPLETA: Supabase devuelve el registro '+id+
    ' directamente, pero NO aparece en los listados ('+a.length+' versiones). No publiques ni descargues.');
  }else if(id===localHead){
   throw Error('El ID local reconocido '+id+' no se pudo consultar directamente. No publiques ni descargues.');
  }
 }
 const unique=ids(parsed);
 if(unique.size!==parsed.length)throw Error('IDs de versión duplicados. No publiques ni descargues.');
 return parsed;
}

function heads(list){
 const parents=new Set(list.map(x=>x.parent).filter(Boolean));
 return list.filter(x=>!parents.has(x.version));
}
async function inspect(){
 await captureJob;
 if(!navigator.onLine)throw Error('Sin Internet. Los cambios permanecen en el dispositivo.');
 const list=await versions(),h=heads(list),draft=await get('draft'),local= snapshot();
 const head=await get('head');
 let status='';
 if(h.length>1)status='CONFLICTO: existen varias versiones de nube. No se sobrescribirá ninguna.';
 else if(!h.length)status='Nube de pruebas vacía (0 registros válidos y sin publicación reconocida en este dispositivo). No se han tocado los datos antiguos de Supabase.';
 else if(draft&&draft.base!==h[0].version)status='CONFLICTO: hay cambios locales y una versión de nube diferente. No se sobrescribirá nada.';
 else if(draft)status='Hay cambios locales pendientes; nube compatible.';
 else if(head===h[0].version)status='Copia publicada encontrada y verificada. Ordenador y nube están en la misma versión.';
 else if(head===null&& !isEmpty(local))status='Datos locales sin vincular. Se requiere revisión manual antes de adoptar la nube.';
 else status='Hay una versión de nube disponible para descargar de forma segura.';
 const unresolved=await get('unverifiedPublish');
 if(unresolved)status='PUBLICACIÓN SIN VERIFICAR ('+unresolved.id+'). No publiques otra vez. '+status;
 const result={status,count:list.length,heads:h.length,remote:h.length===1?h[0]:null,draft:!!draft,localEmpty:isEmpty(local),localHead:head};
 event('inspeccion',{status});return result;
}
async function publish(){
 if(working)throw Error('Ya hay otra sincronización en curso.');
 working=true;
 try{
  await captureJob;
  const unresolved=await get('unverifiedPublish');
  if(unresolved)throw Error('Hay una publicación ya enviada sin verificar ('+unresolved.id+'). No se permite otra publicación.');
  const inspection=await inspect();
  if(inspection.heads>1)throw Error(inspection.status);
  const head=inspection.remote?.version||null;
  const acknowledged=await get('head')||null;
  const existing=await get('draft');
  if(head!==acknowledged)throw Error('La nube ha cambiado o aún no está vinculada. No se permite publicar hasta revisar los datos remotos.');
  let toSend=existing;
  if(!toSend){
   if(head)return {message:'No hay cambios pendientes.'};
   const local=snapshot();if(!local)throw Error('No hay datos locales.');
   toSend={id:uid(),base:null,state:local,updatedAt:new Date().toISOString()};
   await set('draft',toSend);
  }
  if(!navigator.onLine)throw Error('Sin Internet; se conserva la copia pendiente.');
  const payload={version:toSend.id,parent:head,state:toSend.state,createdAt:new Date().toISOString()};
  if(JSON.stringify(payload).length>3500000)throw Error('La copia supera el tamaño de prueba (3,5 MB); exporta JSON y revisa fotografías antes de sincronizar.');
  const {error}=await sdk().from('app_data').insert({user_id:sessionUser.id,data_type:NS,record_id:toSend.id,data:payload});
  if(error)throw error;
  // Solo reconocer el envío tras comprobar contenido y estructura de la fila recuperada.
  const {data:verify,error:verifyError}=await sdk().from('app_data').select('record_id,data').eq('user_id',sessionUser.id).eq('data_type',NS).eq('record_id',toSend.id).maybeSingle();
  if(verifyError||!verify)throw Error('No se ha podido confirmar la escritura. Conservar copia local; no repetir a ciegas.');
  const checked=decodeVersion(verify);
  if(checked.error||checked.item.version!==toSend.id)throw Error('La copia se recibió, pero su lectura no coincide: '+(checked.error||'ID diferente')+'. No repetir el envío.');
  // Guardar un recibo local permanente antes del listado; ante un error no reinsertar.
  await set('unverifiedPublish',{id:toSend.id,parent:head,createdAt:new Date().toISOString()});
  let check;
  try{
   // Comprobar la versión publicada sin dar por verificado un listado incompleto.
   const published=await versions();
   const h=heads(published);
   if(h.length!==1||h[0].version!==toSend.id)
    throw Error('La versión escrita no aparece como cabeza única de la nube.');
   check={ok:true};
  }catch(e){
   throw Error('Publicación guardada con ID '+toSend.id+', pero sin verificar el historial: '+e.message+
    ' NO REPITAS el envío. Conserva JSON y comprueba la tabla de Supabase.');
  }
  if(check.ok){
   await set('head',toSend.id);
   const latest=await get('draft');if(latest?.id===toSend.id)await set('draft',null);
   await set('unverifiedPublish',null);
  }
  event('publicado');return {message:'Copia de pruebas publicada y verificada. No se han modificado registros de la aplicación antigua.'};
 }finally{working=false;}
}
async function adopt(){
 if(working)throw Error('Sincronización ocupada.');
 working=true;
 try{
  if(await get('unverifiedPublish'))throw Error('Hay una publicación anterior sin verificar. No descargues ni sobrescribas datos.');
  const r=await inspect();
  if(r.heads!==1||!r.remote)throw Error('No hay una única versión segura que adoptar.');
  if(r.draft)throw Error('Hay cambios locales pendientes. Exporta su JSON y resuelve el conflicto antes de continuar.');
  const local=snapshot();
  if(!r.localEmpty&&r.localHead!==r.remote.version){
   const all=await versions(),byId=new Map(all.map(x=>[x.version,x]));let ancestor=r.remote.version;
   while(ancestor&&ancestor!==r.localHead)ancestor=byId.get(ancestor)?.parent||null;
   if(!r.localHead||ancestor!==r.localHead)throw Error('Este dispositivo tiene datos no vinculados o divergentes. Exporta JSON y comprueba las diferencias antes de adoptar la nube.');
  }
  suppressed=true;
  try{await window.MHSApp.applyRemoteState(r.remote.state,{source:'supabase'});await set('head',r.remote.version);}finally{suppressed=false;}
  event('actualizado');return {message:'Versión recibida y guardada localmente.'};
 }finally{working=false;}
}
// Recuperación manual excepcional: adopta la versión remota SOLO tras respaldo y confirmación.
// No elimina IndexedDB, ni cookies, ni historial, ni filas de Supabase.
async function resolveLocalConflict(){
 if(working)throw Error('Hay otra operación de sincronización en curso.');
 working=true;
 auto=false;
 try{
  await captureJob;
  if(!navigator.onLine)throw Error('Sin Internet. Se conservan todos los datos locales.');
  if(await get('unverifiedPublish'))throw Error('Existe una publicación sin verificar. Recuperación bloqueada.');
  if(await get('recoveryCheckpoint'))throw Error('Ya existe un punto de recuperación previo. No repitas el proceso hasta revisarlo.');
  // Verificar cuenta, historial íntegro, único extremo y estado local.
  const list=await versions(),h=heads(list),draft=await get('draft'),localHead=await get('head');
  if(h.length!==1)throw Error('La nube no tiene una única versión final; no se modifica nada.');
  if(!draft)throw Error('No existe un borrador conflictivo. Utiliza Comprobar nube.');
  if(draft.base===h[0].version)throw Error('No hay divergencia de base; utiliza el procedimiento normal.');
  if(!localHead||draft.base!==localHead)throw Error('La base del borrador no coincide con el ID local reconocido. Revisión manual necesaria.');
  if(!list.some(v=>v.version===localHead))throw Error('La base del dispositivo no existe en el historial verificado.');
  const local=snapshot();
  if(!local||!sameState(local,draft.state))throw Error('Los datos actuales no coinciden con el borrador pendiente. Guarda/exporta JSON y revisa antes de continuar.');
  if(!window.MHSApp?.applyRemoteState)throw Error('La aplicación no ofrece aplicación segura del estado remoto.');
  // app.js utiliza localStorage como almacenamiento principal y MHSOffline como respaldo.
  if(!window.localStorage)throw Error('No se puede verificar el almacenamiento local.');
  const remoteVersion=h[0].version;
  // No se ejecuta esta función sin haber conservado antes el JSON externo.
  const answer=prompt('RECUPERACIÓN MANUAL DE PRUEBAS\n\nSe sustituirá SOLO el estado local de este dispositivo por el de Supabase.\nEl JSON externo de la tablet debe estar descargado y conservado.\nNo se alterará la nube ni el segundo iMac.\n\nEscribe exactamente RECUPERAR TABLET para confirmar:');
  if(answer!=='RECUPERAR TABLET')return {message:'Operación cancelada. No se ha cambiado nada.'};
  // Repetir las comprobaciones después de la confirmación: la nube podría cambiar.
  await captureJob;
  const again=await versions(),last=heads(again),nowDraft=await get('draft');
  if(last.length!==1||last[0].version!==remoteVersion||!nowDraft||nowDraft.id!==draft.id||
     !sameState(snapshot(),local))throw Error('Los datos cambiaron durante la confirmación. No se modifica nada.');
  // Copia de recuperación adicional en el almacén AISLADO, antes de tocar el estado.
  const checkpoint={madeAt:new Date().toISOString(),localHead,draft,localState:local,
    remoteVersion,phase:'prepared'};
  await set('recoveryCheckpoint',checkpoint);
  suppressed=true;
  try{
   const applied=await window.MHSApp.applyRemoteState(last[0].state,{source:'supabase'});
   if(applied!==true||!sameState(snapshot(),last[0].state))
     throw Error('La lectura local después de aplicar la nube no coincide.');
   // app.js puede ignorar un fallo de almacenamiento; comprobar persistencia real.
   const saved=window.localStorage.getItem('hmsarbide_sync_piloto_v1_local');
   if(!saved||!sameState(JSON.parse(saved),last[0].state))
     throw Error('La copia nueva no quedó verificada en localStorage.');
   if(window.MHSOffline?.loadState){
     const offline=await window.MHSOffline.loadState();
     if(!offline||!sameState(offline,last[0].state))
       throw Error('La copia nueva no quedó verificada en el almacenamiento offline.');
   }
   await setMany([['head',remoteVersion],['draft',null],
     ['recoveryCheckpoint',{...checkpoint,phase:'completed'}]]);
  }catch(error){
   // No se elimina el punto de recuperación; queda para revisión si algo falla.
   try{
    const restored=await window.MHSApp.applyRemoteState(local,{source:'supabase'});
    if(restored!==true||!sameState(snapshot(),local))throw Error('No se pudo restaurar el estado en memoria.');
    await setMany([['head',localHead],['draft',draft],
      ['recoveryCheckpoint',{...checkpoint,phase:'failed-restored',reason:String(error.message||error)}]]);
   }catch(restoreError){
    throw Error('RECUPERACIÓN INCOMPLETA. Detén las pruebas. Conserva el JSON externo y el navegador abierto. '+restoreError.message);
   }
   throw Error('No se completó la recuperación; se intentó restaurar el estado original. '+error.message);
  }finally{suppressed=false;}
  event('actualizado');
  return {message:'La tablet ha adoptado la versión de Supabase. Punto de recuperación local conservado. Comprueba nube sin cambios.'};
 }finally{working=false;}
}
async function autoTick(){
 if(!auto||working||!navigator.onLine)return;
 try{
  const check=await inspect();
  if(check.heads>1){auto=false;event('conflicto',{message:check.status});return;}
  if(check.draft){
   if(check.remote?.version===(check.localHead||null)||(!check.remote&&!check.localHead))await publish();
   else{auto=false;event('conflicto',{message:check.status});}
  }else if(check.remote&&check.localHead&&check.remote.version!==check.localHead){
   // Solo descarga automáticamente si el usuario ya vinculó este dispositivo, no hay borradores
   // y está en Inicio; nunca interrumpir un formulario o pantalla de documentos.
   const dashboard=!!document.querySelector('#app .hero-dashboard');
   if(dashboard)await adopt();
   else event('descarga-pendiente',{message:'Hay cambios en la nube. Ve a Inicio para recibirlos sin interrumpir el formulario.'});
  }
 }catch(e){event('error',{message:e.message});}
}
function enableAuto(value){auto=!!value;event(auto?'automatico':'manual');if(auto)autoTick();}
function initUI(){
 const top=document.querySelector('.topactions');if(!top)return;
 const b=document.createElement('button');b.className='btn secondary';b.type='button';b.textContent='Supabase · pruebas V7';top.prepend(b);
 const panel=document.createElement('div');panel.hidden=true;panel.className='panel no-print';panel.style.cssText='position:fixed;z-index:9999;top:70px;right:12px;max-width:460px;width:calc(100vw - 24px);max-height:85vh;overflow:auto;box-shadow:0 12px 40px #0003;padding:18px;background:#fff';
 panel.innerHTML=`<h3>Sincronización Supabase · PILOTO V7</h3><p>Separada de los datos antiguos de Supabase. No conecta con Cloudflare ni cambia las tablas existentes.</p><label>Correo del usuario Supabase<input id="hss-email" type="email" autocomplete="username" style="width:100%"></label><label>Contraseña<input id="hss-password" type="password" autocomplete="current-password" style="width:100%"></label><div class="cert-actions"><button class="btn" id="hss-login">Entrar</button><button class="btn secondary" id="hss-logout">Salir de Supabase</button><button class="btn secondary" id="hss-close">Cerrar</button></div><p id="hss-status" style="white-space:pre-wrap;line-height:1.5">Sin comprobar.</p><button class="btn secondary" type="button" id="hss-forgot">Recuperar contraseña</button><div class="cert-actions"><button class="btn secondary" id="hss-inspect">Comprobar nube (sin cambios)</button><button class="btn" id="hss-publish">Publicar copia de PRUEBA</button><button class="btn secondary" id="hss-adopt">Descargar versión segura</button><button class="btn secondary" type="button" id="hss-resolve">Recuperación manual de conflicto (solo pruebas)</button></div><p><label><input type="checkbox" id="hss-auto"> Envío automático de cambios tras activar la prueba</label></p><small>Ante cambios simultáneos se detiene. Antes de publicar, usa datos ficticios y conserva un JSON externo. No emplear con trabajos reales hasta completar las pruebas de los tres dispositivos.</small>`;
 document.body.append(panel);
 // Pantalla de recuperación visible únicamente tras un enlace válido de Supabase.
 // Nunca guarda ni muestra la contraseña fuera de los inputs.
 const rec=document.createElement('section');
 rec.className='panel no-print';rec.hidden=true;
 rec.setAttribute('role','dialog');rec.setAttribute('aria-label','Restablecer contraseña de Supabase');
 rec.style.cssText='position:fixed;z-index:10010;top:8vh;left:50%;transform:translateX(-50%);max-width:520px;width:calc(100vw - 28px);max-height:85vh;overflow:auto;box-shadow:0 10px 60px #0006;padding:22px;background:#fff;border:2px solid #16835b;border-radius:12px';
 rec.innerHTML=`<h3>HMSARBIDE · Recuperar acceso</h3><p>Solo cambia la contraseña de Supabase. No afecta a clientes, hojas ni documentos.</p><p id="hss-rec-message" role="status" style="white-space:pre-wrap"></p><div id="hss-rec-fields" hidden><label>Contraseña nueva (mínimo 12 caracteres)<input id="hss-rec-new" type="password" autocomplete="new-password" minlength="12" style="width:100%"></label><label>Repetir contraseña nueva<input id="hss-rec-confirm" type="password" autocomplete="new-password" minlength="12" style="width:100%"></label><button id="hss-rec-submit" class="btn" type="button">Guardar contraseña nueva</button></div><p><button id="hss-rec-close" class="btn secondary" type="button">Cerrar</button></p>`;
 document.body.append(rec);
 const recGet=id=>rec.querySelector('#'+id);
 recoveryUI={panel:rec,area:recGet('hss-rec-fields'),status:recGet('hss-rec-message')};
 recGet('hss-rec-close').onclick=()=>{rec.hidden=true};
 recGet('hss-rec-submit').onclick=async()=>{
  const b=recGet('hss-rec-submit');b.disabled=true;
  try{
   await finishRecovery(recGet('hss-rec-new').value,recGet('hss-rec-confirm').value);
   recGet('hss-rec-new').value='';recGet('hss-rec-confirm').value='';
   recGet('hss-rec-fields').hidden=true;
  }catch(e){recGet('hss-rec-message').textContent='No se ha podido cambiar: '+e.message}
  finally{b.disabled=false;}
 };
 if(recoveryReturnError){
  recoveryNotice='El enlace de recuperación no es válido o ha caducado. Abre el panel Supabase · pruebas y solicita un enlace nuevo desde «Recuperar contraseña». No uses el correo antiguo.';
  displayRecovery();
  // El fragmento ya se ha retirado antes de inicializar el SDK.
 }
 // Inicializar SDK para procesar #access_token / #type=recovery al volver del correo.
 try{sdk()}catch(e){recoveryNotice='No se pudo cargar Supabase. Comprueba la conexión y recarga.';displayRecovery();}
 if(recoveryReturn)handleRecoveryReturn();
 else if(recoveryGranted)displayRecovery();
 const $=id=>panel.querySelector('#'+id),note=m=>{$('hss-status').textContent=String(m)};
 b.onclick=()=>{panel.hidden=!panel.hidden};$('hss-close').onclick=()=>panel.hidden=true;
 $('hss-login').onclick=async()=>{try{await login($('hss-email').value.trim(),$('hss-password').value);$('hss-password').value='';note('Sesión iniciada. Pulsa Comprobar nube.')}catch(e){note('ERROR: '+e.message)}};
 $('hss-forgot').onclick=async()=>{
  const email=$('hss-email').value.trim();
  if(!email){note('Introduce primero tu correo electrónico en el campo superior.');return;}
  if(!confirm('Se enviará un enlace para cambiar la contraseña de Supabase. No modifica tus datos. ¿Continuar?'))return;
  const button=$('hss-forgot');button.disabled=true;
  try{note(await sendRecovery(email))}catch(e){note('No se pudo solicitar el enlace: '+e.message)}
  finally{button.disabled=false}
 };
 $('hss-logout').onclick=async()=>{try{await logout();note('Sesión cerrada.')}catch(e){note(e.message)}};
 $('hss-inspect').onclick=async()=>{try{const r=await inspect();note(r.status+'\nVersiones de pruebas válidas: '+r.count+' · Pendientes locales: '+(r.draft?'sí':'no')+' · ID local reconocido: '+(r.localHead?String(r.localHead).slice(0,8)+'…':'ninguno'))}catch(e){note('ERROR: '+e.message)}};
 $('hss-publish').onclick=async()=>{try{const r=await inspect();note(r.status);if(!confirm('ATENCIÓN: subirás una copia de PRUEBA a Supabase. ¿Has comprobado que no contiene datos reales y conservas JSON?'))return;const out=await publish();note(out.message)}catch(e){note('BLOQUEADO: '+e.message)}};
 $('hss-adopt').onclick=async()=>{try{const r=await inspect();note(r.status);if(!confirm('¿Descargar la copia de PRUEBA desde Supabase? Solo está permitido si no hay cambios locales en conflicto.'))return;const out=await adopt();note(out.message)}catch(e){note('BLOQUEADO: '+e.message)}};
 $('hss-resolve').onclick=async()=>{const btn=$('hss-resolve');btn.disabled=true;try{const r=await resolveLocalConflict();note(r.message)}catch(e){note('BLOQUEADO: '+e.message)}finally{btn.disabled=false}};
 $('hss-auto').onchange=()=>{if($('hss-auto').checked&&!confirm('Activar envíos automáticos SOLO EN LA VERSIÓN DE PRUEBAS. ¿Confirmas?')){$('hss-auto').checked=false;return;}enableAuto($('hss-auto').checked)};
 window.addEventListener('hms-sync-status',e=>{if(['error','conflicto','descarga-pendiente'].includes(e.detail.name)){note(e.detail.message||e.detail.status||e.detail.name);if(e.detail.name==='conflicto')$('hss-auto').checked=false;}});
}
window.addEventListener('online',()=>autoTick());timer=setInterval(autoTick,30000);
window.HMSSupabasePilot={onLocalSave,login,logout,inspect,publish,adopt,enableAuto,who,sendRecovery};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initUI);else initUI();
})();
