(()=>{
'use strict';
const APP='hmsarbide_sync_piloto_v1_local';
const app=document.getElementById('app');
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowDate=()=>new Date().toISOString().slice(0,10);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const trunc4=n=>Number.isFinite(n)?Math.trunc(n*10000)/10000:NaN;
const num=v=>{if(v===null||v===undefined||String(v).trim()==='')return NaN;return Number(String(v).trim().replace(',','.'))};
const fmt4=v=>Number.isFinite(trunc4(v))?trunc4(v).toFixed(4).replace('.',','):'—';
const money=v=>Number.isFinite(v)?v.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'—';
const db={get(){try{return JSON.parse(localStorage.getItem(APP)||'{"services":[],"company":{},"clients":[],"products":[]}')}catch{return {services:[],company:{},clients:[],products:[]}}},set(v){localStorage.setItem(APP,JSON.stringify(v))}};
let state=db.get();state.services=Array.isArray(state.services)?state.services:[];state.company=state.company||{};state.clients=Array.isArray(state.clients)?state.clients:[];state.products=Array.isArray(state.products)?state.products:[];state.invoices=Array.isArray(state.invoices)?state.invoices:[];state.budgets=Array.isArray(state.budgets)?state.budgets:[];state.numbering=state.numbering||{};if(!Number.isFinite(Number(state.numbering.serviceNext)))state.numbering.serviceNext=26001;let currentId=null;
const typeMeta={
 madera:{name:'Madera in situ',icon:'🪵',desc:'Tratamientos sobre estructuras de madera'},
 ddd:{name:'DDD',icon:'🛡️',desc:'Desinfección, desinsectación y desratización'},
 autoclave:{name:'Autoclave',icon:'♨️',desc:'Control de volumen, entrega y facturación'},
 mobiliario:{name:'Mobiliario',icon:'🪑',desc:'Tratamiento de piezas y mobiliario'},
 termitas:{name:'Termitas',icon:'🐜',desc:'Expediente de 3 años · instalación, contacto, control y cobros'}
};
function serviceBase(s){const raw=String(s?.baseNumber||s?.number||'').match(/(\d{3,})/);return raw?raw[1]:''}
function serviceDocNo(s,prefix='HS'){const b=serviceBase(s);return b?`${prefix} ${b}`:''}
function nextServiceBase(){const n=Math.max(1,Math.trunc(Number(state.numbering?.serviceNext)||26001));state.numbering={...(state.numbering||{}),serviceNext:n+1};return String(n)}
function budgetNumber(date=nowDate()){
 const ymd=String(date||nowDate()).replaceAll('-','');
 const base=`PRE${ymd}`;
 const used=(state.budgets||[]).map(b=>String(b.number||''));
 if(!used.includes(base))return base;
 let i=1;while(used.includes(`${base}-${String(i).padStart(2,'0')}`))i++;
 return `${base}-${String(i).padStart(2,'0')}`;
}
async function shareDocument({title='Documento',text='',filename='documento.txt'}={}){
 const payloadText=text||title;
 try{
  const file=new File([payloadText],filename,{type:'text/plain;charset=utf-8'});
  if(navigator.canShare?.({files:[file]})){await navigator.share({title,text:payloadText,files:[file]});return true}
  if(navigator.share){await navigator.share({title,text:payloadText});return true}
 }catch(e){if(e?.name==='AbortError')return false;console.warn('Compartir',e)}
 alert('Este dispositivo no permite compartir directamente desde la app. Genera el PDF y compártelo desde el sistema.');return false
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function syncPayload(){
 const clone=JSON.parse(JSON.stringify(state));
 for(const svc of clone.services||[]){
  if(svc.photos){for(const k of Object.keys(svc.photos)){if(String(svc.photos[k]||'').startsWith('data:'))svc.photos[k]='[adjunto-local]'}}
  if(svc.attachments)svc.attachments=svc.attachments.map(a=>({...a,localOnly:true}));
 }
 return clone;
}
function save(){
 try{db.set(state)}catch(e){console.warn('localStorage lleno; se mantiene copia IndexedDB',e);toast('Guardado local alternativo activado')}
 if(window.HMSSupabasePilot)HMSSupabasePilot.onLocalSave(state);
 if(window.MHSOffline){
  MHSOffline.saveState(state).catch(()=>{});
  MHSOffline.enqueue('state_snapshot',syncPayload(),{dedupeKey:'state-main'}).catch(()=>{});
 }
}
function getCurrent(){return state.services.find(x=>x.id===currentId)}
function commonNew(type){return{id:uid(),type,number:'',date:nowDate(),status:'BORRADOR',client:{name:'',address:'',contact:'',phone:'',email:''},technician:'',notes:'',data:{},photos:{before:'',after:''},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function field(id,label,value='',type='text',extra=''){return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`}
function textarea(id,label,value=''){return `<div class="field full"><label for="${id}">${label}</label><textarea id="${id}">${esc(value)}</textarea></div>`}
function select(id,label,options,value=''){return `<div class="field"><label for="${id}">${label}</label><select id="${id}">${options.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`}
function setActiveNav(key){document.querySelectorAll('.side-link').forEach(b=>b.classList.remove('active'));let el=key==='dashboard'?document.getElementById('btnDashboard'):key==='clients'?document.getElementById('btnClients'):key==='products'?document.getElementById('btnProducts'):key==='settings'?document.getElementById('btnSettings'):document.querySelector(`[data-module="${key}"],[data-area="${key}"]`);if(el)el.classList.add('active')}
function bindNav(){document.getElementById('btnDashboard').onclick=()=>{setActiveNav('dashboard');renderDashboard()};document.getElementById('btnSettings').onclick=()=>{setActiveNav('settings');renderSettings()};document.getElementById('btnClients').onclick=()=>{setActiveNav('clients');renderClients()};document.getElementById('btnProducts').onclick=()=>{setActiveNav('products');renderProducts()};document.getElementById('btnExit').onclick=exitApp;document.querySelectorAll('[data-module]').forEach(b=>b.onclick=()=>{setActiveNav(b.dataset.module);renderModuleOverview(b.dataset.module)});document.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>{setActiveNav(b.dataset.area);renderArea(b.dataset.area)})}
bindNav();

function renderDashboard(){currentId=null;setActiveNav('dashboard');const counts={};Object.keys(typeMeta).forEach(k=>counts[k]=state.services.filter(s=>s.type===k).length);app.innerHTML=`
<section class="hero hero-dashboard"><div><span class="eyebrow">PANEL OPERATIVO</span><h1>Todos los servicios, un solo flujo</h1><p>Cada tratamiento mantiene su propia lógica, compartiendo clientes, documentos, facturación y certificado final.</p></div><div class="hero-actions"><button class="btn secondary" id="quickExport">Exportar copia</button></div></section>
<div class="service-switch">${Object.entries(typeMeta).map(([k,m])=>`<button class="service-tile service-${k}" data-open-module="${k}"><span class="service-ico">${m.icon}</span><span><b>${m.name}</b><small>${m.desc}</small></span><em>${counts[k]}</em></button>`).join('')}</div>
<section class="flow-card"><div class="flow-title"><b>Flujo general</b><span>adaptado a la lógica de cada servicio</span></div><div class="flow-steps"><div><i>1</i><b>Hoja de servicio</b><small>Registro técnico y evidencias.</small></div><span>→</span><div><i>2</i><b>Documentación / entrega</b><small>Fotos, partes y albaranes.</small></div><span>→</span><div><i>3</i><b>Facturación</b><small>Según modalidad del servicio.</small></div><span>→</span><div><i>4</i><b>Certificado final</b><small>Cierre documental.</small></div></div></section>
<div class="dashboard-grid"><section class="list-card"><div class="list-head"><div><h2>Hojas recientes</h2><small class="muted">Últimas actividades del piloto</small></div><span class="tag">${state.services.length} total</span></div><div class="service-list">${state.services.length?state.services.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,12).map(s=>row(s)).join(''):'<div class="empty">Aún no hay hojas. Elige un servicio arriba para crear la primera.</div>'}</div></section><aside class="summary-card"><h2>Estado del piloto</h2><div class="summary-list">${Object.entries(typeMeta).map(([k,m])=>`<button data-open-module="${k}"><span>${m.icon} ${m.name}</span><b>${counts[k]}</b></button>`).join('')}</div><div class="notice"><b>Prueba segura:</b> trabaja en una rama independiente y exporta una copia JSON al terminar cada sesión.</div></aside></div>`;
app.querySelectorAll('[data-open-module]').forEach(b=>b.onclick=()=>{setActiveNav(b.dataset.openModule);renderModuleOverview(b.dataset.openModule)});bindServiceRows();$('#quickExport').onclick=exportData;}
function moduleFeatures(type){const f={madera:['Fotos antes / después','Modalidades: m², presupuesto, Pack y combinada','Certificado final'],ddd:['Hoja independiente','Parte / conformidad','Facturación provisional configurable'],autoclave:['Comparación con albarán del cliente','Medición propia y 4 decimales sin redondear','m³ a facturar = nuestra medición','Albarán transportista'],mobiliario:['Fotos antes / después','Medidas y volumen para espacio en autoclave','Entrega y recogida'],termitas:['Expediente de 3 años','Seguimiento por visitas','Contacto con colonia según evidencias','Plan económico por hitos']} ;return f[type]||[]}
function renderModuleOverview(type){currentId=null;const m=typeMeta[type],items=state.services.filter(s=>s.type===type).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));app.innerHTML=`<section class="module-hero module-hero-${type}"><div class="module-hero-icon">${m.icon}</div><div><span class="eyebrow">MÓDULO</span><h1>${m.name}</h1><p>${m.desc}</p></div><button class="btn" id="moduleNew">+ Nueva hoja</button></section><div class="module-overview-grid"><section class="panel"><h2>Qué incluye</h2><div class="feature-list">${moduleFeatures(type).map(x=>`<div>✓ ${esc(x)}</div>`).join('')}</div></section><section class="panel"><h2>Flujo</h2><div class="mini-flow"><span>Hoja</span><b>→</b><span>Documentación</span><b>→</b><span>Facturación</span><b>→</b><span>Certificado</span></div></section></div><section class="list-card"><div class="list-head"><h2>Expedientes / hojas de ${m.name}</h2><span class="tag">${items.length}</span></div><div class="service-list">${items.length?items.map(s=>row(s)).join(''):'<div class="empty">No hay hojas todavía en este módulo.</div>'}</div></section>`;$('#moduleNew').onclick=()=>createService(type);bindServiceRows()}
function renderArea(area){const labels={albaranes:'Albaranes',facturacion:'Facturación',documentos:'Documentos'},title=labels[area]||area;let eligible=state.services;if(area==='albaranes')eligible=eligible.filter(s=>['autoclave','mobiliario'].includes(s.type));app.innerHTML=`<section class="hero"><div><span class="eyebrow">ÁREA COMÚN</span><h1>${title}</h1><p>Acceso central a los documentos generados desde cada hoja de servicio.</p></div></section><section class="list-card"><div class="list-head"><h2>Servicios disponibles</h2><span class="tag">${eligible.length}</span></div><div class="service-list">${eligible.length?eligible.map(s=>`<div class="service-row area-row"><div><b>${typeMeta[s.type].icon} ${esc(typeMeta[s.type].name)}</b><br><small>${esc(s.number||'Sin número')} · ${esc(s.client?.name||'Sin cliente')}</small></div><div><small>${esc(s.date||'')}</small></div><div><span class="tag ${s.status==='FINALIZADA'?'done':'pending'}">${esc(s.status)}</span></div><div></div><button class="btn secondary" data-area-open="${s.id}">Abrir hoja</button></div>`).join(''):'<div class="empty">Todavía no hay documentos disponibles.</div>'}</div></section>`;app.querySelectorAll('[data-area-open]').forEach(b=>b.onclick=()=>{currentId=b.dataset.areaOpen;setActiveNav(getCurrent()?.type);renderService()})}
function row(s){const m=typeMeta[s.type]||{};return `<div class="service-row"><div><b>${m.icon||''} ${esc(m.name||s.type)}</b><br><small>${esc(s.number||'Sin número')} · ${esc(s.client?.name||'Sin cliente')}</small></div><div class="hide-mobile"><small>${esc(s.date||'')}</small><br>${esc(s.client?.address||'')}</div><div class="hide-tablet"><span class="tag ${s.status==='FINALIZADA'?'done':'pending'}">${esc(s.status)}</span></div><div class="hide-tablet"><small>${new Date(s.updatedAt).toLocaleDateString('es-ES')}</small></div><div class="row-actions"><button class="btn secondary" data-edit="${s.id}">Abrir</button><button class="btn red" data-delete-service="${s.id}">Eliminar</button></div></div>`}

// PRUEBA AISLADA: textos por defecto solo para hojas nuevas de Mobiliario/Autoclave.
// Los datos legales/técnicos se mantienen editables y deben comprobarse con la etiqueta vigente.
const MHS_OBS_DEFAULT = `LAS CONDICIONES IDÓNEAS DE HUMEDAD PARA EL TRATAMIENTO DE LA MADERA ES DEL 20% AL INICIO DEL PROCESO DE TRATAMIENTO.
EL CLIENTE TENDRÁ DERECHO A QUE SE LE COMPRUEBE LA HUMEDAD EN SU PRESENCIA O EN LA DE UNA PERSONA DESIGNADA POR ÉL. EN EL CASO DE NO SOLICITARLO, ENTENDEMOS QUE CONOCE EL GRADO DE HUMEDAD.
CONSIENTE/AUTORIZA EFECTUAR UN TRATAMIENTO DE PULVERIZADO MANUAL (2 MANOS) A LAS PARTIDAS RELACIONADAS EN ESTE ALBARÁN.`;
const MHS_BIOCIDE_DEFAULTS = {
  bioRegistration: 'DGSP 13-30-06710',
  bioActives: 'Cipermetrina 40/60, Propiconazol, Tebuconazol, 3-iodo-propinilbutil carbamato',
  bioProduct: 'Madera tratada con producto biocida TP-8',
  bioProperties: 'Insecticida y fungicida',
  bioNano: 'No contiene',
  bioInstructions: 'Tener en cuenta el mecanizado y las medidas de protección para las personas, animales y el medio ambiente en la manipulación de este artículo.'
};
function mhsObsFields(d){
 return `<div class="notice" style="margin-top:10px"><b>Texto de observaciones automático y editable.</b> Los datos del biocida también se pueden cambiar en cada hoja. Comprueba la etiqueta y el registro vigentes antes de emitir documentos.</div><div class="grid">${field('bioRegistration','N.º de registro del biocida',d.bioRegistration??'')}${textarea('bioActives','Materias activas (editable)',d.bioActives??'')}${field('bioProduct','Descripción del biocida',d.bioProduct??'')}${field('bioProperties','Propiedad biocida',d.bioProperties??'')}${field('bioNano','Nanomateriales',d.bioNano??'')}${textarea('bioInstructions','Instrucciones de uso',d.bioInstructions??'')}</div>`;
}
function mhsObsCollect(d){for(const k of Object.keys(MHS_BIOCIDE_DEFAULTS)){const el=$('#'+k);if(el)d[k]=el.value}}
function mhsObsAnnex(s,kind){
 if(!s.data?.mhsObsDefaultV1)return null;
 const d=s.data, obs=kind==='delivery' ? (d.documentReceipt?.notes|| (s.type==='autoclave'?d.autoObs:d.furnObs)||'') : ((s.type==='autoclave'?d.autoObs:d.furnObs)||'');
 // Anexo únicamente en hojas nuevas de este piloto. No afecta a documentos históricos.
 return {number:s.number||'',observations:obs,registration:d.bioRegistration||'',actives:d.bioActives||'',product:d.bioProduct||'',properties:d.bioProperties||'',nano:d.bioNano||'',instructions:d.bioInstructions||''};
}

function createService(type){const s=commonNew(type);if(type==='autoclave'||type==='mobiliario'){s.data={mhsObsDefaultV1:true,...MHS_BIOCIDE_DEFAULTS,[type==='autoclave'?'autoObs':'furnObs']:MHS_OBS_DEFAULT}}s.baseNumber=nextServiceBase();s.number=serviceDocNo(s,'HS');state.services.unshift(s);save();currentId=s.id;setActiveNav(type);renderService()}
function renderService(){const s=getCurrent();if(!s)return renderDashboard();setActiveNav(s.type);if(s.type==='madera')return renderMadera(s);if(s.type==='autoclave')return renderAutoclave(s);if(s.type==='ddd')return renderDDD(s);if(s.type==='mobiliario')return renderMobiliario(s);return renderTermitas(s)}
function toolbar(s,{transport=false,billing=true,certificate=true}={}){
 const n=(s.attachments||[]).length;
 return `<div class="toolbar"><button class="btn secondary" id="backBtn">← Volver</button><button class="btn" id="saveBtn">💾 Guardar hoja</button><label class="btn secondary import-label">📎 Adjuntar documento<input id="serviceAttachment" type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" hidden></label>${n?`<span class="attachment-count">${n} adjunto${n===1?'':'s'} local${n===1?'':'es'}</span>`:''}<span class="spacer"></span>${transport?'<button class="btn blue" id="transportBtn">Albarán transportista</button>':''}${billing?'<button class="btn amber" id="billingBtn">Facturación</button>':''}${certificate?'<button class="btn secondary" id="certificateBtn">Certificado final</button>':''}<button class="btn" id="finishBtn">Finalizar</button></div>`;
}
function commonHeader(s,title){return `<div class="sheet-title"><div><h1>${esc(title)}</h1><small>${esc(s.number||'Nueva hoja')} · ${esc(s.status)}</small></div><div>${esc(s.date)}</div></div>`}
function commonSection(s){const opts=(state.clients||[]).filter(c=>c.active!==false).map(c=>`<option value="${esc(c.name)}"></option>`).join('');return `<section class="section"><h3>1. Datos generales</h3><div class="inner"><div class="grid three">${field('number','N.º hoja',s.number,'text','readonly class=\"readonly\"')}${field('date','Fecha',s.date,'date')}${field('technician','Técnico',s.technician)}<div class="field"><label>Cliente</label><input id="clientName" list="clientCatalog" value="${esc(s.client.name)}"><datalist id="clientCatalog">${opts}</datalist></div>${field('clientContact','Contacto',s.client.contact)}${field('clientPhone','Teléfono',s.client.phone)}<div class="field full"><label>Dirección / ubicación</label><input id="clientAddress" value="${esc(s.client.address)}"></div>${field('clientEmail','Email',s.client.email,'email')}</div></div></section>`}
function commonCollect(s){s.number=$('#number')?.value.trim()||s.number;s.date=$('#date')?.value||s.date;s.technician=$('#technician')?.value.trim()||'';s.client={name:$('#clientName')?.value.trim()||'',contact:$('#clientContact')?.value.trim()||'',phone:$('#clientPhone')?.value.trim()||'',address:$('#clientAddress')?.value.trim()||'',email:$('#clientEmail')?.value.trim()||''};s.updatedAt=new Date().toISOString()}
function bindCommon(s,collector,opts={}){
 $('#backBtn').onclick=renderDashboard;
 $('#saveBtn').onclick=()=>{collector(s);save();toast(navigator.onLine?'Hoja guardada · sincronización en cola':'Hoja guardada sin conexión')};
 const saveShortcut=(e)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();collector(s);save();toast(navigator.onLine?'Hoja guardada · sincronización en cola':'Hoja guardada sin conexión')}};document.addEventListener('keydown',saveShortcut,{once:false});
 $('#finishBtn').onclick=()=>{collector(s);if(!s.client.name||!s.date){alert('Completa al menos cliente y fecha.');return}s.status='FINALIZADA';save();toast('Hoja finalizada');renderService()};
 if($('#certificateBtn'))$('#certificateBtn').onclick=()=>{collector(s);save();printCertificate(s)};
 if($('#billingBtn'))$('#billingBtn').onclick=()=>{collector(s);save();openBilling(s)};
 if($('#transportBtn'))$('#transportBtn').onclick=()=>{collector(s);save();openTransport(s)};
 const att=$('#serviceAttachment');
 if(att)att.onchange=async()=>{const f=att.files?.[0];if(!f)return;try{let blobId='';if(window.MHSOffline)blobId=await MHSOffline.storeBlob(f,{name:f.name,type:f.type,size:f.size,serviceId:s.id});s.attachments=s.attachments||[];const a={id:uid(),blobId,name:f.name,type:f.type||'application/octet-stream',size:f.size,createdAt:new Date().toISOString(),syncStatus:'pending'};s.attachments.push(a);s.updatedAt=new Date().toISOString();save();if(window.MHSOffline)await MHSOffline.enqueue('attachment',{serviceId:s.id,attachmentId:a.id,name:a.name,type:a.type,size:a.size},{blobId});toast(navigator.onLine?'Documento guardado · pendiente de sincronizar':'Documento guardado sin conexión');renderService()}catch(e){alert('No se pudo guardar el documento en este dispositivo.')}};
 bindPhoto('photoBefore',s,'before');bindPhoto('photoAfter',s,'after');
 const cn=$('#clientName');if(cn)cn.addEventListener('change',()=>{const c=(state.clients||[]).find(x=>String(x.name||'').toLowerCase()===cn.value.trim().toLowerCase());if(c){$('#clientContact').value=c.contact||'';$('#clientPhone').value=c.phone||'';$('#clientAddress').value=c.address||'';$('#clientEmail').value=c.email||'';}});
 bindRecoveredAttachments(s);
}

function photoSection(s){return `<section class="section"><h3>Fotos antes y después</h3><div class="inner"><div class="photos">${photoBox('photoBefore','Foto ANTES',s.photos?.before)}${photoBox('photoAfter','Foto DESPUÉS',s.photos?.after)}</div></div></section>${recoveredAttachmentsSection(s)}`}
function photoBox(id,title,src){return `<div class="photo-box"><h4>${title}</h4><div class="photo-preview" id="${id}Preview">${src?`<img src="${src}" alt="${title}">`:'Sin foto'}</div><input id="${id}" type="file" accept="image/*"></div>`}
function bindPhoto(id,s,key){
 const inp=$('#'+id);if(!inp)return;
 inp.onchange=async()=>{const f=inp.files?.[0];if(!f)return;try{const data=await compressImage(f);s.photos=s.photos||{};s.photos[key]=data;s.updatedAt=new Date().toISOString();let blobId='';if(window.MHSOffline){const blob=await (await fetch(data)).blob();blobId=await MHSOffline.storeBlob(blob,{name:`${s.id}-${key}.jpg`,type:'image/jpeg',serviceId:s.id,photoKey:key})}save();if(window.MHSOffline)await MHSOffline.enqueue('photo',{serviceId:s.id,key,name:`${s.id}-${key}.jpg`,type:'image/jpeg'},{dedupeKey:`photo-${s.id}-${key}`,blobId});$('#'+id+'Preview').innerHTML=`<img src="${data}" alt="Foto ${key}">`;toast(navigator.onLine?'Foto guardada · pendiente de sincronizar':'Foto guardada sin conexión')}catch(e){alert('No se pudo procesar la foto.')}};
}
function compressImage(file){return new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const img=new Image();img.onerror=rej;img.onload=()=>{const max=1280;let w=img.width,h=img.height;if(Math.max(w,h)>max){const k=max/Math.max(w,h);w=Math.round(w*k);h=Math.round(h*k)}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);res(c.toDataURL('image/jpeg',.76))};img.src=r.result};r.readAsDataURL(file)})}

function renderMadera(s){const d=s.data||{};app.innerHTML=toolbar(s)+`<div class="sheet">${commonHeader(s,'Madera in situ')}<div class="sheet-body">${commonSection(s)}<section class="section"><h3>2. Tratamiento de madera</h3><div class="inner"><div class="grid">${select('woodTreatment','Tipo de tratamiento',['Aplicación de gel','Inyección','Pulverización','Combinado','Inspección / toma de datos'],d.woodTreatment||'Aplicación de gel')}${field('woodArea','Superficie tratada (m²)',d.woodArea||'','text','inputmode="decimal"')}${field('woodProduct','Producto / materia activa',d.woodProduct||'')}${field('woodDose','Dosis / concentración',d.woodDose||'')}${textarea('woodZones','Zonas / elementos tratados',d.woodZones||'')}${textarea('woodObs','Observaciones técnicas',d.woodObs||'')}</div></div></section>${photoSection(s)}${billingEditorMadera(s)}</div></div>`;bindCommon(s,collectMadera);bindMaderaBilling();}
function collectMadera(s){commonCollect(s);const d=s.data=s.data||{};['woodTreatment','woodArea','woodProduct','woodDose','woodZones','woodObs','billMode','billBudgetRef','billBudgetAmount','billPackAmount','billPriceM2','billVat','billOther'].forEach(k=>{const e=$('#'+k);if(e)d[k]=e.value});calcMadera();}
function billingEditorMadera(s){const d=s.data||{},mode=d.billMode||'m2';return `<section class="section"><h3>4. Facturación · Madera in situ</h3><div class="inner"><div class="billing-choice">${choice('m2','Por m²','Superficie × precio €/m²',mode)}${choice('presupuesto','Según presupuesto','Importe de referencia',mode)}${choice('pack','Pack Presupuesto','Importe manual',mode)}${choice('combinada','Combinada','Tratamiento + pack/otros',mode)}</div><input type="hidden" id="billMode" value="${esc(mode)}"><div id="billM2Box" class="grid">${field('billPriceM2','Precio €/m²',d.billPriceM2||'','text','inputmode="decimal"')}${field('billOther','Otros conceptos (€)',d.billOther||'0','text','inputmode="decimal"')}</div><div id="billBudgetBox" class="grid hidden">${field('billBudgetRef','Presupuesto de referencia',d.billBudgetRef||'')}${field('billBudgetAmount','Importe presupuesto sin IVA (€)',d.billBudgetAmount||'','text','inputmode="decimal"')}</div><div id="billPackBox" class="grid hidden">${field('billPackAmount','Importe Pack Presupuesto (€)',d.billPackAmount||'','text','inputmode="decimal"')}<div class="field"><label>Concepto</label><input value="Desplazamiento, toma de datos y elaboración del presupuesto" readonly class="readonly"></div><div class="field full"><div class="notice warn"><b>Condición fija:</b> Si el presupuesto es aceptado y su importe supera los 500 € (IVA no incluido), el importe abonado por el Pack Presupuesto se descontará de la factura final.</div></div></div><div class="grid">${field('billVat','IVA (%)',d.billVat||'21','text','inputmode="decimal"')}</div><div class="totals"><div class="total"><span>Base</span><strong id="mBase">—</strong></div><div class="total"><span>IVA</span><strong id="mVat">—</strong></div><div class="total"><span>Total</span><strong id="mTotal">—</strong></div></div></div></section>`}
function choice(v,title,sub,mode){return `<label class="choice"><input type="radio" name="billModeChoice" value="${v}" ${v===mode?'checked':''}><span><b>${title}</b><small>${sub}</small></span></label>`}
function bindMaderaBilling(){document.querySelectorAll('[name=billModeChoice]').forEach(r=>r.onchange=()=>{$('#billMode').value=r.value;showMaderaBilling(r.value);calcMadera()});['woodArea','billPriceM2','billOther','billBudgetAmount','billPackAmount','billVat'].forEach(id=>$('#'+id)?.addEventListener('input',calcMadera));showMaderaBilling($('#billMode').value);calcMadera()}
function showMaderaBilling(mode){$('#billM2Box').classList.toggle('hidden',!['m2','combinada'].includes(mode));$('#billBudgetBox').classList.toggle('hidden',mode!=='presupuesto');$('#billPackBox').classList.toggle('hidden',!['pack','combinada'].includes(mode))}
function calcMadera(){const mode=$('#billMode')?.value||'m2',area=num($('#woodArea')?.value),pm=num($('#billPriceM2')?.value),other=num($('#billOther')?.value)||0,bud=num($('#billBudgetAmount')?.value),pack=num($('#billPackAmount')?.value)||0,vat=num($('#billVat')?.value)||0;let base=0;if(mode==='m2')base=(Number.isFinite(area)&&Number.isFinite(pm)?area*pm:0)+other;if(mode==='presupuesto')base=Number.isFinite(bud)?bud:0;if(mode==='pack')base=pack;if(mode==='combinada')base=(Number.isFinite(area)&&Number.isFinite(pm)?area*pm:0)+pack+other;const iva=base*vat/100,total=base+iva;if($('#mBase')){$('#mBase').textContent=money(base);$('#mVat').textContent=money(iva);$('#mTotal').textContent=money(total)}return{mode,base,iva,total}}

// v54.1: cálculo decimal exacto con BigInt; truncado SOLO al mostrar los cuatro decimales.
function autoDecimal(value){
 const s=String(value??'').trim().replace(',','.');
 if(!/^\d+(?:\.\d+)?$/.test(s))return null;
 const parts=s.split('.');return {n:BigInt(parts[0]+(parts[1]||'')),scale:(parts[1]||'').length};
}
function autoVolume(row){
 const values=[row.units,row.length,row.width,row.thickness].map(autoDecimal);
 if(values.some(x=>!x))return null;
 if(values[0].scale!==0||values.some(x=>x.n<=0n))return null;
 return values.reduce((r,x)=>({n:r.n*x.n,scale:r.scale+x.scale}),{n:1n,scale:0});
}
function autoSum(volumes){
 const scale=Math.max(0,...volumes.map(x=>x.scale));
 return {n:volumes.reduce((sum,v)=>sum+v.n*10n**BigInt(scale-v.scale),0n),scale};
}
function autoFour(v){
 if(!v)return '';
 const n=v.n*10000n/10n**BigInt(v.scale);
 return (n/10000n).toString()+'.'+(n%10000n).toString().padStart(4,'0');
}
function autoRowsFromUI(){return [...document.querySelectorAll('#autoMeasureBody tr')].map(tr=>({
 concept:tr.querySelector('[data-measure="concept"]').value,
 units:tr.querySelector('[data-measure="units"]').value,
 length:tr.querySelector('[data-measure="length"]').value,
 width:tr.querySelector('[data-measure="width"]').value,
 thickness:tr.querySelector('[data-measure="thickness"]').value
}));}
function autoMeasureRow(row={}){
 const keys=['concept','units','length','width','thickness'];
 const labels=['Concepto','Unidades','Largo (m)','Ancho (m)','Grosor (m)'];
 return `<tr>${keys.map((key,i)=>`<td><input aria-label="${labels[i]}" data-measure="${key}" value="${esc(row[key]??'')}" type="text" ${i?'inputmode="decimal"':''} autocomplete="off"></td>`).join('')}<td class="auto-volume" aria-label="Volumen en metros cúbicos">—</td><td><button type="button" class="btn secondary auto-remove" aria-label="Eliminar fila de medición">×</button></td></tr>`;
}
function autoAddRow(row={}){const body=$('#autoMeasureBody');if(!body)return;body.insertAdjacentHTML('beforeend',autoMeasureRow(row));calcAutoclave()}
function renderAutoclave(s){
 const d=s.data||{};
 app.innerHTML=toolbar(s,{transport:true})+`<div class="sheet">${commonHeader(s,'Autoclave')}<div class="sheet-body">${commonSection(s)}
 <section class="section"><h3>2. Albarán del cliente · referencia comparativa</h3><div class="inner"><div class="grid">${field('clientDeliveryNo','N.º albarán cliente (opcional)',d.clientDeliveryNo||'')}${field('declaredM3','m³ declarados por cliente (opcional)',d.declaredM3||'','text','inputmode="decimal"')}<div class="field full"><div class="notice">El albarán del cliente sirve como referencia. Los m³ a facturar se basan siempre en nuestra medición.</div></div></div></div></section>
 <section class="section"><h3>3. Medición propia y control de volumen</h3><div class="inner">
 <div class="auto-table-scroll"><table class="auto-measure-table"><thead><tr><th>Concepto</th><th>Unidades</th><th>Largo (m)</th><th>Ancho (m)</th><th>Grosor (m)</th><th>Volumen (m³)</th><th></th></tr></thead><tbody id="autoMeasureBody">${(Array.isArray(d.autoMeasurements)&&d.autoMeasurements.length?d.autoMeasurements:[{}]).map(autoMeasureRow).join('')}</tbody><tfoot><tr><th colspan="5" scope="row">TOTAL m³</th><td id="autoMeasureTotal">0,0000</td><td></td></tr></tfoot></table></div>
 <div class="auto-measure-actions"><button type="button" class="btn secondary" id="autoAddMeasure">+ Añadir fila</button><small>Volumen = unidades × largo × ancho × grosor. Se muestran 4 decimales truncados, sin redondear.</small></div>
 <div class="grid">${field('checkedM3','Nuestra medición total (m³)',d.checkedM3||'','text','readonly class="readonly"')}${select('checkMethod','Forma de comprobación',['Medición directa','Cubicación','Recuento y dimensiones','Otro'],d.checkMethod||'Medición directa')}</div>
 <div class="notice warn" id="autoIncompleteNotice" hidden>Hay filas incompletas o con medidas no válidas: no se incluyen en el total. Comprueba unidades enteras y dimensiones positivas.</div>
 <div class="notice" id="autoLegacyNotice" hidden>Esta hoja tenía una medición manual anterior. Se conserva hasta que completes una fila de medidas válida.</div>
 <div class="kpis"><div class="kpi"><span>Cliente</span><strong id="aDeclared">—</strong></div><div class="kpi"><span>Nuestra medición</span><strong id="aChecked">—</strong></div><div class="kpi"><span>Diferencia</span><strong id="aDiff">—</strong></div><div class="kpi"><span>Diferencia %</span><strong id="aPct">—</strong></div></div></div></section>
 <section class="section"><h3>4. m³ a facturar</h3><div class="inner"><div class="grid">${field('billM3','m³ a facturar',d.billM3||'','text','readonly class="readonly"')}${field('autoPriceM3','Precio €/m³',d.autoPriceM3||'','text','inputmode="decimal"')}</div><div class="notice"><b>Regla fija:</b> m³ a facturar = nuestra medición, truncada a 4 decimales, sin redondear.</div><div class="totals"><div class="total"><span>Base estimada</span><strong id="aBase">—</strong></div><div class="total"><span>IVA 21 %</span><strong id="aVat">—</strong></div><div class="total"><span>Total</span><strong id="aTotal">—</strong></div></div></div></section>${photoSection(s)}${textarea('autoObs','Observaciones',d.autoObs||'')}${mhsObsFields(d)}</div></div>`;
 // Guardamos el valor anterior solo para compatibilidad con hojas antiguas.
 $('#checkedM3').dataset.legacy=d.checkedM3||'';
 bindCommon(s,collectAutoclave,{transport:true});
 $('#autoAddMeasure').onclick=()=>autoAddRow();
 $('#autoMeasureBody').addEventListener('input',calcAutoclave);
 $('#autoMeasureBody').addEventListener('click',e=>{const btn=e.target.closest('.auto-remove');if(!btn)return;btn.closest('tr').remove();calcAutoclave()});
 ['declaredM3','autoPriceM3'].forEach(id=>$('#'+id)?.addEventListener('input',calcAutoclave));
 $('#declaredM3')?.addEventListener('blur',()=>{const n=trunc4(num($('#declaredM3').value));if(Number.isFinite(n))$('#declaredM3').value=n.toFixed(4);calcAutoclave()});
 calcAutoclave();
}
function collectAutoclave(s){
 commonCollect(s);const d=s.data=s.data||{};
 ['clientDeliveryNo','declaredM3','checkMethod','autoPriceM3','autoObs'].forEach(k=>{const e=$('#'+k);if(e)d[k]=e.value});
 mhsObsCollect(d);
 d.autoMeasurements=autoRowsFromUI();
 calcAutoclave();
 d.checkedM3=$('#checkedM3').value;
 d.billM3=$('#billM3').value.replace(',','.');
}
function calcAutoclave(){
 const rows=autoRowsFromUI(),volumes=[];
 document.querySelectorAll('#autoMeasureBody tr').forEach((tr,i)=>{
  const volume=autoVolume(rows[i]);if(volume)volumes.push(volume);
  tr.querySelector('.auto-volume').textContent=volume?autoFour(volume).replace('.',','):'—';
 });
 const legacy=$('#checkedM3')?.dataset.legacy||'';
 const total=volumes.length?autoFour(autoSum(volumes)):'';
 const incomplete=rows.some(row=>Object.values(row).some(v=>String(v).trim())&&!autoVolume(row));
 if($('#autoIncompleteNotice'))$('#autoIncompleteNotice').hidden=!incomplete;
 const checked=total||(Number.isFinite(num(legacy))?autoFour(autoDecimal(legacy)):''),b=num(checked);
 if($('#checkedM3'))$('#checkedM3').value=checked.replace('.',',');
 if($('#autoMeasureTotal'))$('#autoMeasureTotal').textContent=total?total.replace('.',','):'0,0000';
 if($('#autoLegacyNotice'))$('#autoLegacyNotice').hidden=!!total||!legacy;
 const a=trunc4(num($('#declaredM3')?.value)),diff=Number.isFinite(a)&&Number.isFinite(b)?trunc4(b-a):NaN,pct=Number.isFinite(diff)&&a!==0?trunc4(diff/a*100):NaN,price=num($('#autoPriceM3')?.value);
 if($('#billM3'))$('#billM3').value=Number.isFinite(b)?checked.replace('.',','):'';
 if($('#aDeclared')){$('#aDeclared').textContent=Number.isFinite(a)?fmt4(a)+' m³':'—';$('#aChecked').textContent=Number.isFinite(b)?checked.replace('.',',')+' m³':'—';$('#aDiff').textContent=Number.isFinite(diff)?fmt4(diff)+' m³':'—';$('#aPct').textContent=Number.isFinite(pct)?fmt4(pct)+' %':'—'}
 const base=Number.isFinite(b)&&Number.isFinite(price)?b*price:0,iva=base*.21;
 if($('#aBase')){$('#aBase').textContent=money(base);$('#aVat').textContent=money(iva);$('#aTotal').textContent=money(base+iva)}
 return {a,b,diff,pct,base};
}

function renderDDD(s){const d=s.data||{};app.innerHTML=toolbar(s)+`<div class="sheet">${commonHeader(s,'DDD')}<div class="sheet-body">${commonSection(s)}<section class="section"><h3>2. Actuación DDD</h3><div class="inner"><div class="grid">${select('dddType','Tipo de actuación',['Desinsectación','Desratización','Desinfección','Inspección / seguimiento','Combinada'],d.dddType||'Desinsectación')}${field('dddTarget','Plaga / objetivo',d.dddTarget||'')}${field('dddProduct','Producto',d.dddProduct||'')}${field('dddDose','Dosis / cantidad aplicada',d.dddDose||'')}${textarea('dddAreas','Zonas tratadas',d.dddAreas||'')}${textarea('dddObs','Observaciones y recomendaciones',d.dddObs||'')}</div></div></section>${photoSection(s)}<section class="section"><h3>4. Facturación DDD · provisional</h3><div class="inner"><div class="notice warn">DDD es una hoja independiente. Hasta que definamos contigo su forma exacta de cobro, este piloto permite registrar una referencia e importe manual sin imponer reglas.</div><div class="grid">${field('dddBillRef','Referencia presupuesto / factura',d.dddBillRef||'')}${field('dddBillAmount','Importe base (€)',d.dddBillAmount||'','text','inputmode="decimal"')}</div></div></section></div></div>`;bindCommon(s,collectDDD)}
function collectDDD(s){commonCollect(s);const d=s.data=s.data||{};['dddType','dddTarget','dddProduct','dddDose','dddAreas','dddObs','dddBillRef','dddBillAmount'].forEach(k=>{const e=$('#'+k);if(e)d[k]=e.value})}

// Mobiliario: medidas para capacidad del autoclave, NUNCA para calcular el precio.
// Cada pieza conserva sus propias medidas y una fotografía independiente.
function furnLegacyPrice(d){
 const n=num(d.furnUnitPrice);if(!Number.isFinite(n))return '';
 const q=num(d.furnQty);
 return String(d.furnBillMode==='Por unidades'&&Number.isFinite(q)?Math.round(n*q*100)/100:n);
}
function furnRows(d){
 if(Array.isArray(d.furnItems)){
  const rows=d.furnItems.map(x=>({id:x.id||uid(),concept:String(x.concept??''),units:String(x.units??''),length:String(x.length??''),width:String(x.width??''),thickness:String(x.thickness??''),price:String(x.price??''),discount:String(x.discount??'0'),vat:String(x.vat??'21')}));
  if(d.furnPriceMode!=='unit')rows.forEach(r=>{const qty=num(r.units),old=num(r.price);if(Number.isFinite(old)&&Number.isFinite(qty)&&qty>0&&r.price.trim())r.price=String(Math.round(old/qty*1000000)/1000000)});
  // Una hoja antigua con precio general conserva el importe en su primer mueble.
  if(rows.length&&!rows.some(r=>r.price.trim())&&d.furnUnitPrice!==undefined&&d.furnUnitPrice!=='')rows[0].price=String((Number(num(furnLegacyPrice(d)))||0)/(Number(num(rows[0].units))||1));
  return rows;
 }
 if(d.furnDesc||d.furnQty||d.furnUnitPrice)return [{id:uid(),concept:String(d.furnDesc||''),units:String(d.furnQty||''),length:'',width:'',thickness:'',price:String((Number(num(furnLegacyPrice(d)))||0)/(Number(num(d.furnQty))||1)),discount:'0',vat:'21'}];
 return [];
}
function furnInvoiceLines(d){
 const rows=Array.isArray(d?.furnItems)?furnRows(d):furnRows(d);
 return rows.filter(r=>r.concept||r.units||r.price).map((r,i)=>{
  const quantity=num(r.units),price=num(r.price),discount=num(r.discount),vat=num(r.vat);
  const q=Number.isFinite(quantity)&&quantity>0?quantity:0;
  const unit=Number.isFinite(price)&&price>=0?price:0;
  const disc=Number.isFinite(discount)&&discount>=0&&discount<=100?discount:0;
  const tax=Number.isFinite(vat)&&vat>=0&&vat<=100?vat:21;
  const base=Math.round((q*unit*(1-disc/100)+Number.EPSILON)*100)/100;
  const vatAmount=Math.round((base*tax/100+Number.EPSILON)*100)/100;
  return {...r,quantity:q,unit,discount:disc,vat:tax,base,vatAmount,total:Math.round((base+vatAmount)*100)/100};
 });
}
function furnMoneyBase(d){
 return Math.round(furnInvoiceLines(d).reduce((sum,r)=>sum+r.base,0)*100)/100;
}
function furnInvoiceTotals(d){const lines=furnInvoiceLines(d);return {lines,base:Math.round(lines.reduce((a,r)=>a+r.base,0)*100)/100,vat:Math.round(lines.reduce((a,r)=>a+r.vatAmount,0)*100)/100,total:Math.round(lines.reduce((a,r)=>a+r.total,0)*100)/100}}
function furnRowHTML(r={},s){
 const id=r.id||uid(),keys=['concept','units','length','width','thickness','price'],labels=['Concepto','Unidades','Largo (m)','Ancho (m)','Grosor (m)','Precio por mueble (€)'];
 const src=s.photos?.['furn_'+id];
 return `<div class="furn-item" data-furn-id="${esc(id)}"><div class="auto-table-scroll"><table class="auto-measure-table"><thead><tr>${labels.slice(0,5).map(v=>`<th>${v}</th>`).join('')}<th>Volumen (m³)</th><th>${labels[5]}</th></tr></thead><tbody><tr>${keys.slice(0,5).map((k,i)=>`<td><input type="text" data-furn="${k}" aria-label="${labels[i]}" value="${esc(r[k]??'')}" ${i?'inputmode="decimal"':''} autocomplete="off"></td>`).join('')}<td class="furn-volume">—</td><td><input type="text" data-furn="price" aria-label="Precio unitario manual del mueble en euros" inputmode="decimal" value="${esc(r.price||'')}" autocomplete="off"></td></tr><tr><td colspan="7"><div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:10px"><label>Descuento (%) <input type="text" data-furn="discount" inputmode="decimal" value="${esc(r.discount??'0')}"></label><label>IVA (%) <input type="text" data-furn="vat" inputmode="decimal" value="${esc(r.vat??'21')}"></label><div><b>Total del mueble (IVA incluido)</b><div class="furn-line-total">0,00 €</div></div></div></td></tr></tbody></table></div><div class="furn-photo-area"><div class="photo-box"><h4>Fotografía de este mueble</h4><div class="photo-preview furn-photo-preview">${src?`<img src="${src}" alt="Fotografía de ${esc(r.concept||'mueble')}">`:'Sin foto'}</div><label class="furn-photo-label">Elegir foto <input type="file" accept="image/*" data-furn-photo aria-label="Seleccionar fotografía de este mueble"></label><label class="furn-photo-label">Hacer foto con el móvil <input type="file" accept="image/*" capture="environment" data-furn-photo aria-label="Hacer fotografía de este mueble"></label><button type="button" class="btn secondary furn-delete-photo" ${src?'':'disabled'}>Eliminar foto</button></div><button type="button" class="btn secondary furn-remove">Eliminar mueble</button></div></div>`;
}
function furnUIRows(){return [...document.querySelectorAll('.furn-item')].map(el=>({id:el.dataset.furnId,...Object.fromEntries(['concept','units','length','width','thickness','price','discount','vat'].map(k=>[k,el.querySelector(`[data-furn="${k}"]`).value]))})).filter(r=>['concept','units','length','width','thickness','price'].some(k=>r[k].trim()));}
function furnUpdate(){
 let all=[],invalid=false,prices=0,priceInvalid=false;
 document.querySelectorAll('.furn-item').forEach(el=>{
  const r={};['concept','units','length','width','thickness','price','discount','vat'].forEach(k=>r[k]=el.querySelector(`[data-furn="${k}"]`).value);
  const isActive=['concept','units','length','width','thickness'].some(k=>String(r[k]).trim());const volume=isActive?autoVolume(r):null;
  if(isActive&&!volume)invalid=true;
  if(volume)all.push(volume);
  const p=num(r.price),q=num(r.units),discount=num(r.discount),vat=num(r.vat);if(r.price.trim()&&(!Number.isFinite(p)||p<0))priceInvalid=true;
  if(!Number.isFinite(discount)||discount<0||discount>100||!Number.isFinite(vat)||vat<0||vat>100)priceInvalid=true;
  const base=Number.isFinite(p)&&Number.isFinite(q)&&q>0&&Number.isFinite(discount)?Math.round(q*p*(1-discount/100)*100)/100:0;const tax=Number.isFinite(vat)?Math.round(base*vat)/100:0;prices+=base;el.querySelector('.furn-line-total').textContent=money(base+tax);
  el.querySelector('.furn-volume').textContent=volume?autoFour(volume).replace('.',','):'—';
 });
 const sum=autoFour(autoSum(all)).replace('.',',');
 $('#furnTotal').textContent=sum;
 $('#furnInvalid').hidden=!invalid;
 $('#furnVolumeNotice').textContent='Volumen para planificar el espacio en el autoclave: '+sum+' m³. No interviene en el precio.';
 if($('#furnPriceTotal'))$('#furnPriceTotal').textContent=money(Math.round(prices*100)/100);
 if($('#furnPriceInvalid'))$('#furnPriceInvalid').hidden=!priceInvalid;
}
function renderMobiliario(s){
 const d=s.data||{},items=furnRows(d);const current=items.length?items:[{id:uid()}];
 app.innerHTML=toolbar(s,{transport:true})+`<div class="sheet">${commonHeader(s,'Mobiliario')}<div class="sheet-body">${commonSection(s)}<section class="section"><h3>2. Muebles y espacio necesario en autoclave</h3><div class="inner"><div id="furnItemsBody">${current.map(r=>furnRowHTML(r,s)).join('')}</div><div class="auto-measure-actions"><button type="button" class="btn secondary" id="furnAdd">+ Añadir mueble</button><small>Un apartado de medidas y una fotografía por mueble.</small></div><div class="notice"><b>Volumen total: <span id="furnTotal">0,0000</span> m³</b><div id="furnVolumeNotice"></div></div><div class="notice" style="margin-top:9px"><b>Base de los muebles (sin IVA): <span id="furnPriceTotal">0,00 €</span></b><div>Precio manual por unidad × cantidad, aplicando descuento e IVA por cada mueble. El volumen no interviene en el precio.</div></div><div class="notice warn" id="furnPriceInvalid" hidden>Comprueba los precios, descuentos (0 a 100 %) e IVA (0 a 100 %).</div><div class="notice warn" id="furnInvalid" hidden>Hay medidas incompletas o no válidas: comprueba unidades enteras y dimensiones positivas.</div><div class="grid">${select('furnTreatment','Tratamiento realizado',['AUTOCLAVE','INSITU GEL'],['AUTOCLAVE','INSITU GEL'].includes(d.furnTreatment)?d.furnTreatment:'AUTOCLAVE')}${textarea('furnObs','Observaciones',d.furnObs||'')}</div>${mhsObsFields(d)}</div></section><section class="section"><h3>Aviso sobre mobiliario barnizado y acabados</h3><div class="inner"><div class="notice warn"><b>Importante:</b> En piezas barnizadas, lacadas o con otros acabados superficiales, el producto de tratamiento penetrará principalmente a través de los orificios existentes producidos por la plaga y por las zonas de madera sin barnizar o sin recubrimiento. Debido a las condiciones propias del tratamiento en autoclave, no se puede garantizar la conservación del estado original de barnices, lacas, pinturas u otros acabados superficiales tras el proceso.</div></div></section>${(s.photos?.before||s.photos?.after)?`<section class="section"><h3>Fotos conservadas de la hoja anterior</h3><div class="inner"><div class="photos">${photoBox('photoBefore','Foto ANTES',s.photos.before)}${photoBox('photoAfter','Foto DESPUÉS',s.photos.after)}</div></div></section>`:''}<section class="section"><h3>Fotografía del conjunto para el albarán</h3><div class="inner"><div class="photo-box"><div class="photo-preview" id="furnGroupPreview">${s.photos?.furnGroup?`<img src="${s.photos.furnGroup}" alt="Conjunto de muebles">`:'Sin foto del conjunto'}</div><label>Seleccionar fotografía del conjunto <input type="file" id="furnGroupPhoto" accept="image/*"></label><label>Hacer foto con el móvil <input type="file" id="furnGroupCamera" accept="image/*" capture="environment"></label><button type="button" id="furnGroupRemove" class="btn secondary" ${s.photos?.furnGroup?'':'disabled'}>Eliminar foto del conjunto</button></div></div></section>${recoveredAttachmentsSection(s)}<section class="section"><h3>4. Facturación Mobiliario</h3><div class="inner"><div class="notice"><b>El precio unitario, el descuento y el IVA se introducen por mueble; la factura suma todas las líneas.</b> Los m³ no afectan a la facturación.</div><div class="grid">${field('furnBudgetRef','Referencia presupuesto',d.furnBudgetRef||'')}</div></div></section></div></div>`;
 bindCommon(s,collectMobiliario,{transport:true});
 $('#furnAdd').onclick=()=>{$('#furnItemsBody').insertAdjacentHTML('beforeend',furnRowHTML({id:uid()},s));furnUpdate()};
 $('#furnItemsBody').addEventListener('input',e=>{if(e.target.matches('[data-furn]'))furnUpdate()});
 $('#furnItemsBody').addEventListener('click',e=>{
  const delPhoto=e.target.closest('.furn-delete-photo');
  if(delPhoto){const el=delPhoto.closest('.furn-item'),key='furn_'+el.dataset.furnId;
   if(!confirm('¿Eliminar la fotografía de este mueble?'))return;
   s.photos=s.photos||{};delete s.photos[key];el.querySelector('.furn-photo-preview').textContent='Sin foto';
   el.querySelectorAll('[data-furn-photo]').forEach(input=>input.value='');delPhoto.disabled=true;
   collectMobiliario(s);save();toast('Fotografía eliminada');return;
  }
  if(!e.target.closest('.furn-remove'))return;
  if(!confirm('¿Eliminar este mueble de la hoja?'))return;
  const el=e.target.closest('.furn-item');if(s.photos)delete s.photos['furn_'+el.dataset.furnId];el.remove();furnUpdate();
 });
 $('#furnItemsBody').addEventListener('change',async e=>{
  if(!e.target.matches('[data-furn-photo]'))return;
  const input=e.target,file=input.files?.[0];if(!file)return;
  const el=input.closest('.furn-item'),id=el.dataset.furnId;
  try{
   const data=await compressImage(file);s.photos=s.photos||{};s.photos['furn_'+id]=data;
   collectMobiliario(s);save();
   if(window.MHSOffline){
    const blob=await(await fetch(data)).blob();const blobId=await MHSOffline.storeBlob(blob,{name:`${s.id}-furn-${id}.jpg`,type:'image/jpeg',serviceId:s.id,photoKey:'furn_'+id});
    await MHSOffline.enqueue('photo',{serviceId:s.id,key:'furn_'+id,name:`${s.id}-furn-${id}.jpg`,type:'image/jpeg'},{dedupeKey:`photo-${s.id}-furn-${id}`,blobId});
   }
   el.querySelector('.furn-photo-preview').innerHTML=`<img src="${data}" alt="Fotografía del mueble">`;el.querySelector('.furn-delete-photo').disabled=false;
   toast('Fotografía del mueble guardada');
  }catch(err){alert('No se pudo guardar la fotografía: '+(err?.message||err))}
 });
 const saveGroup=async input=>{const file=input.files?.[0];if(!file)return;try{const data=await compressImage(file);s.photos=s.photos||{};s.photos.furnGroup=data;collectMobiliario(s);save();$('#furnGroupPreview').innerHTML=`<img src="${data}" alt="Conjunto de muebles">`;$('#furnGroupRemove').disabled=false;toast('Foto del conjunto guardada')}catch(err){alert('No se pudo guardar la foto del conjunto: '+(err?.message||err))}};
 $('#furnGroupPhoto').addEventListener('change',e=>saveGroup(e.target));
 $('#furnGroupCamera').addEventListener('change',e=>saveGroup(e.target));
 $('#furnGroupRemove').onclick=()=>{if(!confirm('¿Eliminar la foto del conjunto?'))return;delete s.photos.furnGroup;collectMobiliario(s);save();$('#furnGroupPreview').textContent='Sin foto del conjunto';$('#furnGroupRemove').disabled=true;$('#furnGroupPhoto').value='';$('#furnGroupCamera').value='';};
 if($('#photoBefore'))bindPhoto('photoBefore',s,'before');
 if($('#photoAfter'))bindPhoto('photoAfter',s,'after');
 furnUpdate();
}
function collectMobiliario(s){
 commonCollect(s);const d=s.data=s.data||{};
 ['furnTreatment','furnObs','furnBudgetRef'].forEach(k=>{const e=$('#'+k);if(e)d[k]=e.value});
 mhsObsCollect(d);
 d.furnItems=furnUIRows();d.furnPriceMode='unit';
 d.furnVolumeM3=autoFour(autoSum(d.furnItems.map(autoVolume).filter(Boolean)));
 // Campos históricos para certificados y albaranes; NO se usan para calcular precios.
 d.furnQty=String(d.furnItems.reduce((sum,r)=>sum+(Number.isInteger(num(r.units))&&num(r.units)>0?num(r.units):0),0));
 d.furnDesc=d.furnItems.map(r=>r.concept.trim()).filter(Boolean).join(', ');
 d.furnUnitPrice=String(furnMoneyBase(d)); // Compatibilidad con facturación y plantillas existentes.
 d.furnBillMode='Importe manual';
}


function addYears(dateStr,years){if(!dateStr)return'';const [y,m,d]=dateStr.split('-').map(Number);if(!y||!m||!d)return'';const dt=new Date(Date.UTC(y+years,m-1,d));if(dt.getUTCMonth()!==m-1)dt.setUTCDate(0);return dt.toISOString().slice(0,10)}
function dateLabel(v){if(!v)return'Pendiente';const [y,m,d]=v.split('-');return `${d}/${m}/${y}`}
function termitePhase(d){if(!d.installationDate)return'Pendiente de instalación';if(!d.contactDate)return'Instalación / seguimiento inicial';const end=addYears(d.installationDate,3);if(end&&nowDate()>=end)return'Tratamiento completado';return'Control y seguimiento'}
function termiteSchedule(s){const d=s.data||{},base=num(d.termiteBudgetBase),vat=num(d.termiteVat)||21;if(!Number.isFinite(base))return{base:0,vat:0,total:0,rows:[]};if((d.termiteBillingPlan||'particular')==='personalizado')return{base,vat:base*vat/100,total:base*(1+vat/100),rows:[],custom:true};const rows=[];rows.push({concept:'Diseño, estudio e instalación del sistema',pct:60,amount:base*.60,date:d.installationDate||'',status:d.installationDate?'Generada':'Pendiente'});rows.push({concept:'Toma de contacto con la colonia',pct:25,amount:base*.25,date:d.contactDate||'',status:d.contactDate?'Generada':'Pendiente de evidencia técnica'});if(d.contactDate&&d.installationDate){const anniversaries=[addYears(d.installationDate,2),addYears(d.installationDate,3)].filter(Boolean);let remaining=anniversaries.filter(x=>x>d.contactDate);if(!remaining.length)remaining=[addYears(d.installationDate,3)].filter(Boolean);const eachPct=15/remaining.length;remaining.forEach((date,i)=>rows.push({concept:`Cuota anual de seguimiento ${i+1}/${remaining.length}`,pct:eachPct,amount:base*eachPct/100,date,status:'Programada'}))}else{rows.push({concept:'15 % restante · cuotas anuales hasta 3.er aniversario',pct:15,amount:base*.15,date:'',status:'Se calcula al confirmar contacto'})}return{base,vat:base*vat/100,total:base*(1+vat/100),rows,custom:false}}
function termiteScheduleHtml(s){const sch=termiteSchedule(s),d=s.data||{};if(sch.custom)return `<div class=\"notice warn\"><b>Plan personalizado.</b> El calendario de cobro se registra manualmente para casos excepcionales.</div><div class=\"grid\">${textarea('termiteCustomBilling','Calendario / condiciones de cobro personalizadas',d.termiteCustomBilling||'')}</div><div class=\"totals\"><div class=\"total\"><span>Base presupuesto</span><strong>${money(sch.base)}</strong></div><div class=\"total\"><span>IVA</span><strong>${money(sch.vat)}</strong></div><div class=\"total\"><span>Total</span><strong>${money(sch.total)}</strong></div></div>`;return `<div class=\"payment-table\"><div class=\"payment-row head\"><b>Hito / cuota</b><b>Fecha</b><b>%</b><b>Base</b><b>Estado</b></div>${sch.rows.map(r=>`<div class=\"payment-row\"><span>${esc(r.concept)}</span><span>${dateLabel(r.date)}</span><span>${r.pct.toLocaleString('es-ES',{maximumFractionDigits:2})}%</span><span>${money(r.amount)}</span><span class=\"tag ${r.status==='Generada'?'done':'pending'}\">${esc(r.status)}</span></div>`).join('')}</div><div class=\"totals\"><div class=\"total\"><span>Base presupuesto</span><strong>${money(sch.base)}</strong></div><div class=\"total\"><span>IVA</span><strong>${money(sch.vat)}</strong></div><div class=\"total\"><span>Total</span><strong>${money(sch.total)}</strong></div></div>`}
function termiteVisitsHtml(s){const visits=s.data?.termiteVisits||[];if(!visits.length)return '<div class=\"empty\">Aún no hay hojas de seguimiento registradas.</div>';return `<div class=\"visit-list\">${visits.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(v=>`<div class=\"visit-card\"><div><b>${dateLabel(v.date)}</b> · ${esc(v.technician||'Sin técnico')}<br><small>${esc(v.activeStations||0)} estación/es con actividad · ${esc(v.evidence||'Sin evidencia indicada')}</small><br><small>${esc(v.reason||v.notes||'')}</small></div><div class=\"visit-actions\"><button class=\"btn secondary\" data-print-visit=\"${v.id}\">Parte</button><button class=\"btn red\" data-delete-visit=\"${v.id}\">Eliminar</button></div></div>`).join('')}</div>`}
function contactStatusHtml(s){const d=s.data||{},total=Number(d.termiteStationsTotal)||0;if(d.contactDate)return `<div class=\"notice\"><b>Contacto con colonia confirmado:</b> ${dateLabel(d.contactDate)} · ${esc(d.contactValidationMode==='automatico'?'Automático por hoja de servicio con 3 o más estaciones activas':'Validación manual del técnico')}.</div>`;if(total>3)return `<div class=\"notice warn\">Instalación de más de 3 estaciones: el contacto se confirmará automáticamente cuando una misma hoja de servicio registre actividad en <b>3 o más estaciones</b>.</div>`;if(total>0)return `<div class=\"notice warn\">Instalación de ${total} estaciones: para confirmar contacto se requiere validación manual con evidencia, motivo, fecha y firma del técnico.</div>`;return `<div class=\"notice warn\">Indica el número total de estaciones instaladas para aplicar la regla correcta de confirmación de contacto.</div>`}
function manualContactBox(s){const d=s.data||{},total=Number(d.termiteStationsTotal)||0;if(total>3||d.contactDate)return'';return `<section class=\"section\"><h3>5. Validación manual de contacto · instalaciones de 3 estaciones o menos</h3><div class=\"inner\"><div class=\"grid three\">${field('tcActiveStations','Estaciones con actividad *',d.tcActiveStations||'','number','min=\"1\" max=\"3\"')}${select('tcEvidence','Evidencia observada *',['','Consumo de cebo','Presencia directa de termitas','Galerías / túneles','Otra evidencia'],d.tcEvidence||'')}${field('tcValidationDate','Fecha de validación *',d.tcValidationDate||nowDate(),'date')}${field('tcTechnician','Técnico que valida *',d.tcTechnician||s.technician||'')}${textarea('tcReason','Motivo técnico de confirmación *',d.tcReason||'')}</div><div class=\"signature-wrap\"><label>Firma del técnico *</label><canvas id=\"termiteSignature\" class=\"signature-canvas\" width=\"700\" height=\"180\"></canvas><div class=\"signature-actions\"><button class=\"btn secondary\" id=\"clearTermiteSignature\" type=\"button\">Limpiar firma</button><button class=\"btn amber\" id=\"confirmTermiteContact\" type=\"button\">Confirmar contacto con la colonia</button></div></div></div></section>`}
function renderTermitas(s){const d=s.data=s.data||{};d.termiteVisits=d.termiteVisits||[];app.innerHTML=toolbar(s,{billing:true,certificate:true})+`<div class=\"sheet\">${commonHeader(s,'Termitas · expediente de 3 años')}<div class=\"sheet-body\">${commonSection(s)}<section class=\"section\"><h3>2. Diseño e instalación</h3><div class=\"inner\"><div class=\"grid three\">${field('termiteInstallationDate','Fecha de instalación *',d.termiteInstallationDate||'','date')}${field('termiteStationsTotal','N.º total de estaciones *',d.termiteStationsTotal||'','number','min=\"1\"')}${field('termiteBudgetBase','Presupuesto base sin IVA (€) *',d.termiteBudgetBase||'','text','inputmode=\"decimal\"')}${field('termiteVat','IVA (%)',d.termiteVat||'21','text','inputmode=\"decimal\"')}${select('termiteBillingPlan','Plan de cobro',['particular','personalizado'],d.termiteBillingPlan||'particular')}${field('termiteSystem','Sistema / producto instalado',d.termiteSystem||'')}${textarea('termiteInstallationNotes','Diseño, ubicación de estaciones y observaciones de instalación',d.termiteInstallationNotes||'')}</div><div class=\"termite-timeline\"><span class=\"phase done\">1 · Diseño e instalación</span><span class=\"phase ${d.termiteContactDate?'done':'current'}\">2 · Contacto colonia</span><span class=\"phase ${d.termiteContactDate?'current':''}\">3 · Control y seguimiento</span><span class=\"phase\">Fin · 3.er aniversario</span></div></div></section><section class=\"section\"><h3>3. Hojas de servicio / seguimiento</h3><div class=\"inner\">${contactStatusHtml({data:{...d,termiteStationsTotal:d.termiteStationsTotal,contactDate:d.termiteContactDate,contactValidationMode:d.termiteContactValidationMode}})}<div class=\"grid three visit-entry\">${field('tvDate','Fecha visita',nowDate(),'date')}${field('tvTechnician','Técnico',s.technician||'')}${field('tvActiveStations','Estaciones con actividad','0','number','min=\"0\"')}${select('tvEvidence','Evidencia',['Sin actividad','Consumo de cebo','Presencia directa de termitas','Galerías / túneles','Otra evidencia'],'Sin actividad')}${field('tvReason','Motivo / hallazgo','')}${field('tvNotes','Observaciones','')}</div><div class=\"visit-add\"><input id=\"tvPhoto\" type=\"file\" accept=\"image/*\"><button class=\"btn\" id=\"addTermiteVisit\" type=\"button\">Añadir hoja de seguimiento</button></div>${termiteVisitsHtml(s)}</div></section><section class=\"section\"><h3>4. Plan económico</h3><div class=\"inner\"><div class=\"notice\"><b>Plan particular:</b> 60 % en diseño e instalación · 25 % al confirmar contacto real con la colonia · 15 % restante en cuotas anuales hasta el tercer aniversario.</div><div id=\"termiteSchedule\">${termiteScheduleHtml({data:{...d,installationDate:d.termiteInstallationDate,contactDate:d.termiteContactDate,termiteBillingPlan:d.termiteBillingPlan,termiteBudgetBase:d.termiteBudgetBase,termiteVat:d.termiteVat}})}</div></div></section>${manualContactBox({data:{...d,termiteStationsTotal:d.termiteStationsTotal,contactDate:d.termiteContactDate,tcActiveStations:d.termiteManualActiveStations,tcEvidence:d.termiteManualEvidence,tcValidationDate:d.termiteManualValidationDate,tcTechnician:d.termiteManualTechnician,tcReason:d.termiteManualReason},technician:s.technician})}${photoSection(s)}${textarea('termiteNotes','Observaciones generales del expediente',d.termiteNotes||'')}</div></div>`;
 bindCommon(s,collectTermitas);$('#finishBtn').textContent='Cerrar expediente';$('#finishBtn').onclick=()=>{collectTermitas(s);const end=addYears(s.data.termiteInstallationDate,3);if(!s.data.termiteContactDate){alert('No se puede cerrar el expediente sin contacto con colonia confirmado.');return}if(!end||nowDate()<end){alert('El expediente solo se cierra al alcanzar el tercer aniversario de la instalación.');return}s.status='FINALIZADA';save();toast('Expediente de Termitas cerrado');renderService()};
 ['termiteInstallationDate','termiteStationsTotal','termiteBudgetBase','termiteVat','termiteBillingPlan'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{collectTermitas(s);save();renderService()}));$('#addTermiteVisit').onclick=()=>addTermiteVisit(s);app.querySelectorAll('[data-delete-visit]').forEach(b=>b.onclick=()=>{if(confirm('¿Eliminar esta hoja de seguimiento?')){s.data.termiteVisits=s.data.termiteVisits.filter(v=>v.id!==b.dataset.deleteVisit);save();renderService()}});app.querySelectorAll('[data-print-visit]').forEach(b=>b.onclick=()=>printTermiteVisit(s,b.dataset.printVisit));bindPhoto('photoBefore',s,'before');bindPhoto('photoAfter',s,'after');setupTermiteSignature(s)}
function collectTermitas(s){commonCollect(s);const d=s.data=s.data||{};['termiteInstallationDate','termiteStationsTotal','termiteBudgetBase','termiteVat','termiteBillingPlan','termiteSystem','termiteInstallationNotes','termiteCustomBilling','termiteNotes'].forEach(k=>{const e=$('#'+k);if(e)d[k]=e.value});d.termiteVisits=d.termiteVisits||[]}
async function addTermiteVisit(s){collectTermitas(s);const d=s.data,visit={id:uid(),date:$('#tvDate').value||nowDate(),technician:$('#tvTechnician').value.trim(),activeStations:Number($('#tvActiveStations').value||0),evidence:$('#tvEvidence').value,reason:$('#tvReason').value.trim(),notes:$('#tvNotes').value.trim(),photo:''};const f=$('#tvPhoto').files?.[0];if(f)visit.photo=await compressImage(f);d.termiteVisits.push(visit);const total=Number(d.termiteStationsTotal)||0;if(!d.termiteContactDate&&total>3&&visit.activeStations>=3){d.termiteContactDate=visit.date;d.termiteContactSourceVisitId=visit.id;d.termiteContactValidationMode='automatico';d.termiteContactValidatedBy=visit.technician||s.technician;d.termiteContactValidationDate=visit.date;toast('Contacto con colonia confirmado por evidencia en 3 o más estaciones')}save();renderService()}
function setupTermiteSignature(s){const canvas=$('#termiteSignature');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#203129';let drawing=false,hasInk=false;const pos=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:(p.clientX-r.left)*canvas.width/r.width,y:(p.clientY-r.top)*canvas.height/r.height}};const start=e=>{drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()};const move=e=>{if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true;e.preventDefault()};const end=()=>drawing=false;canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:false});if(s.data.termiteManualSignature){const im=new Image();im.onload=()=>{ctx.drawImage(im,0,0,canvas.width,canvas.height);hasInk=true};im.src=s.data.termiteManualSignature}$('#clearTermiteSignature').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false};$('#confirmTermiteContact').onclick=()=>{collectTermitas(s);const d=s.data,total=Number(d.termiteStationsTotal)||0;if(total>3){alert('En instalaciones de más de 3 estaciones el contacto se confirma desde una hoja con 3 o más estaciones activas.');return}const active=Number($('#tcActiveStations').value||0),evidence=$('#tcEvidence').value,reason=$('#tcReason').value.trim(),date=$('#tcValidationDate').value,tech=$('#tcTechnician').value.trim();if(!active||!evidence||!reason||!date||!tech||!hasInk){alert('Completa estaciones activas, evidencia, motivo, fecha, técnico y firma.');return}d.termiteManualActiveStations=active;d.termiteManualEvidence=evidence;d.termiteManualReason=reason;d.termiteManualValidationDate=date;d.termiteManualTechnician=tech;d.termiteManualSignature=canvas.toDataURL('image/png');d.termiteContactDate=date;d.termiteContactValidationDate=date;d.termiteContactValidatedBy=tech;d.termiteContactValidationMode='manual';save();toast('Contacto con colonia validado por el técnico');renderService()}}
function printTermiteVisit(s,id){const v=(s.data.termiteVisits||[]).find(x=>x.id===id);if(!v)return;printDoc('HOJA DE SEGUIMIENTO · TERMITAS',`<h2>${esc(s.client.name||'')}</h2><p><b>Expediente:</b> ${esc(s.number||'')}<br><b>Fecha:</b> ${esc(dateLabel(v.date))}<br><b>Técnico:</b> ${esc(v.technician||'')}</p><table><tr><th>Estaciones con actividad</th><td>${esc(v.activeStations)}</td></tr><tr><th>Evidencia</th><td>${esc(v.evidence||'')}</td></tr><tr><th>Hallazgo</th><td>${esc(v.reason||'')}</td></tr><tr><th>Observaciones</th><td>${esc(v.notes||'')}</td></tr></table>${v.photo?`<p><img src=\"${v.photo}\" style=\"max-width:100%;max-height:360px\"></p>`:''}`)}

function openTransport(s){const isAuto=s.type==='autoclave',isFurn=s.type==='mobiliario';if(!isAuto&&!isFurn){alert('El albarán de transportista está previsto para Autoclave y Mobiliario.');return}const d=s.data=s.data||{},t=d.transport=d.transport||{};app.innerHTML=`<div class="toolbar"><button class="btn secondary" id="trBack">← Volver a hoja</button><button class="btn" id="trSave">Guardar albarán</button><button class="btn blue" id="trPrint">Imprimir / PDF</button></div><div class="sheet"><div class="sheet-title"><div><h1>Albarán para transportista</h1><small>${esc(typeMeta[s.type].name)} · ${esc(s.number||'')}</small></div></div><div class="sheet-body"><section class="section"><h3>Datos de entrega</h3><div class="inner"><div class="grid three">${field('trNo','N.º albarán salida',t.number||'')}${field('trDate','Fecha',t.date||nowDate(),'date')}${field('trDestination','Destino',t.destination||s.client.address||'')}${field('trCompany','Transportista',t.company||'')}${field('trDriver','Conductor',t.driver||'')}${field('trPlate','Matrícula',t.plate||'')}${field('trTrailer','Remolque',t.trailer||'')}${field('trPackages','Bultos / piezas',t.packages||'')}${isAuto?field('trM3','m³ entregados',fmt4(trunc4(num(s.data.checkedM3))),'text','readonly class="readonly"'):field('trM3','Descripción entrega',t.deliveryDescription||s.data.furnDesc||'')}${textarea('trNotes','Observaciones',t.notes||'')}</div></div></section><section class="section"><h3>Recepción y firma obligatoria</h3><div class="inner"><div class="grid">${field('trReceiver','Nombre de quien recibe *',t.receiver||'')}${field('trReceiverRole','Empresa / función',t.receiverRole||'')}${field('trSignDate','Fecha/hora recepción *',t.signDate||new Date().toLocaleString('es-ES'))}</div><div class="field full"><label>Firma de recepción *</label><canvas id="deliverySignature" width="700" height="220" style="width:100%;max-width:700px;height:180px;border:1px solid #bccbc3;border-radius:10px;background:#fff;touch-action:none"></canvas><div><button type="button" class="btn secondary" id="clearDeliverySignature">Borrar firma</button></div></div></div></section></div></div>`;$('#trBack').onclick=renderService;setupDeliverySignature(s);$('#trSave').onclick=()=>{if(saveTransport(s,true)){toast('Albarán guardado con firma')}};$('#trPrint').onclick=()=>{if(saveTransport(s,true))printTransport(s)}}
function setupDeliverySignature(s){const t=s.data.transport=s.data.transport||{},canvas=$('#deliverySignature');if(!canvas)return;const ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#203129';let drawing=false,hasInk=false;const p=e=>{const r=canvas.getBoundingClientRect(),q=e.touches?e.touches[0]:e;return{x:(q.clientX-r.left)*canvas.width/r.width,y:(q.clientY-r.top)*canvas.height/r.height}};const start=e=>{drawing=true;const q=p(e);ctx.beginPath();ctx.moveTo(q.x,q.y);e.preventDefault()};const move=e=>{if(!drawing)return;const q=p(e);ctx.lineTo(q.x,q.y);ctx.stroke();hasInk=true;e.preventDefault()};canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',()=>drawing=false);if(t.signature){const im=new Image();im.onload=()=>{ctx.drawImage(im,0,0,canvas.width,canvas.height);hasInk=true};im.src=t.signature}$('#clearDeliverySignature').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;t.signature=''};canvas._mhsHasInk=()=>hasInk;canvas._mhsData=()=>canvas.toDataURL('image/png')}
function saveTransport(s,requireSignature=false){const t=s.data.transport=s.data.transport||{},canvas=$('#deliverySignature');t.number=$('#trNo').value;t.date=$('#trDate').value;t.destination=$('#trDestination').value;t.company=$('#trCompany').value;t.driver=$('#trDriver').value;t.plate=$('#trPlate').value;t.trailer=$('#trTrailer').value;t.packages=$('#trPackages').value;t.deliveryDescription=$('#trM3').value;t.notes=$('#trNotes').value;t.receiver=$('#trReceiver').value.trim();t.receiverRole=$('#trReceiverRole').value.trim();t.signDate=$('#trSignDate').value.trim();if(canvas?._mhsHasInk?.())t.signature=canvas._mhsData();if(requireSignature&&(!t.receiver||!t.signDate||!t.signature)){alert('Para guardar o imprimir cualquier albarán es obligatorio indicar quién recibe, la fecha/hora y su firma.');return false}s.updatedAt=new Date().toISOString();save();return true}
function printTransport(s){const t=s.data.transport||{},qty=s.type==='autoclave'?`${fmt4(trunc4(num(s.data.checkedM3)))} m³`:esc(t.deliveryDescription||'');if(!t.receiver||!t.signDate||!t.signature){alert('El albarán necesita firma de recepción antes de imprimir.');return}printDoc('ALBARÁN DE ENTREGA',`<h2>${esc(typeMeta[s.type].name)}</h2><p><b>Albarán:</b> ${esc(t.number||'')} · <b>Fecha:</b> ${esc(t.date||'')}</p><p><b>Cliente:</b> ${esc(s.client.name)}<br><b>Destino:</b> ${esc(t.destination||'')}</p><p><b>Transportista:</b> ${esc(t.company||'')} · <b>Conductor:</b> ${esc(t.driver||'')} · <b>Matrícula:</b> ${esc(t.plate||'')}</p><div class="big">Entrega: ${qty}</div><p><b>Observaciones:</b><br>${esc(t.notes||'')}</p><p><b>Recibido por:</b> ${esc(t.receiver)} ${t.receiverRole?`· ${esc(t.receiverRole)}`:''}<br><b>Fecha/hora:</b> ${esc(t.signDate)}</p><p><img src="${t.signature}" alt="Firma recepción" style="max-width:320px;max-height:130px;border-bottom:1px solid #777"></p>${companyValidationHtml()}<div class="sign"><span>Firma / recepción</span><span>Firma empresa</span></div>`)}

function openBilling(s){if(s.type==='madera'){const r=calcMaderaSafe(s);return printBillingPreview(s,r)}if(s.type==='autoclave'){const q=trunc4(num(s.data.checkedM3)),p=num(s.data.autoPriceM3),base=Number.isFinite(q)&&Number.isFinite(p)?q*p:0;return printBillingPreview(s,{base,iva:base*.21,total:base*1.21,concept:`Tratamiento Autoclave · ${fmt4(q)} m³ × ${Number.isFinite(p)?money(p):'—'}`})}if(s.type==='ddd'){const base=num(s.data.dddBillAmount)||0;return printBillingPreview(s,{base,iva:base*.21,total:base*1.21,concept:`Servicio DDD · ${s.data.dddBillRef||'importe manual'}`})}if(s.type==='mobiliario'){const base=furnMoneyBase(s.data||{});return printBillingPreview(s,{base,iva:base*.21,total:base*1.21,concept:`Mobiliario · ${s.data.furnBillMode||''}`})}if(s.type==='termitas'){return printTermiteBilling(s)}}

function printTermiteBilling(s){const d=s.data||{},sch=termiteSchedule({data:{...d,installationDate:d.termiteInstallationDate,contactDate:d.termiteContactDate}});if(sch.custom){return printDoc('PLAN DE FACTURACIÓN · TERMITAS',`<div class=\"draft\">BORRADOR</div><h2>${esc(s.client.name||'')}</h2><p><b>Plan personalizado</b><br>Presupuesto base: ${money(sch.base)} · IVA: ${money(sch.vat)} · Total: ${money(sch.total)}</p><p class=\"note\">${esc(d.termiteCustomBilling||'Sin calendario personalizado informado.')}</p>`)}const rows=sch.rows.map(r=>`<tr><td>${esc(r.concept)}</td><td>${esc(dateLabel(r.date))}</td><td>${r.pct.toLocaleString('es-ES',{maximumFractionDigits:2})}%</td><td>${money(r.amount)}</td><td>${esc(r.status)}</td></tr>`).join('');printDoc('PLAN DE FACTURACIÓN · TERMITAS',`<div class=\"draft\">BORRADOR</div><h2>${esc(s.client.name||'')}</h2><p><b>Expediente:</b> ${esc(s.number||'')} · <b>Instalación:</b> ${esc(dateLabel(d.termiteInstallationDate))}</p><table><tr><th>Hito</th><th>Fecha</th><th>%</th><th>Base</th><th>Estado</th></tr>${rows}</table><div class=\"tot\"><p>Base: <b>${money(sch.base)}</b></p><p>IVA: <b>${money(sch.vat)}</b></p><p>Total: <b>${money(sch.total)}</b></p></div><p class=\"note\">Plan particular: 60 % diseño/instalación, 25 % en el contacto real con la colonia y 15 % restante repartido en cuotas anuales pendientes hasta el 3.er aniversario.</p>`)}
function calcMaderaSafe(s){const d=s.data||{},mode=d.billMode||'m2',area=num(d.woodArea),pm=num(d.billPriceM2),other=num(d.billOther)||0,bud=num(d.billBudgetAmount),pack=num(d.billPackAmount)||0,vat=num(d.billVat)||21;let base=0,concept='';if(mode==='m2'){base=(Number.isFinite(area)&&Number.isFinite(pm)?area*pm:0)+other;concept=`Aplicación de gel · ${area||0} m²`}if(mode==='presupuesto'){base=Number.isFinite(bud)?bud:0;concept=`Según presupuesto ${d.billBudgetRef||''}`}if(mode==='pack'){base=pack;concept='Pack Presupuesto'}if(mode==='combinada'){base=(Number.isFinite(area)&&Number.isFinite(pm)?area*pm:0)+pack+other;concept='Facturación combinada'}const iva=base*vat/100;return{base,iva,total:base+iva,concept,packNote:['pack','combinada'].includes(mode)}}
function printBillingPreview(s,r){printDoc('BORRADOR DE FACTURACIÓN',`<div class="draft">BORRADOR</div><h2>${esc(typeMeta[s.type].name)}</h2><p><b>Cliente:</b> ${esc(s.client.name)}<br><b>Hoja:</b> ${esc(s.number||'')}</p><table><tr><th>Concepto</th><th>Base</th></tr><tr><td>${esc(r.concept||'Servicio')}</td><td>${money(r.base)}</td></tr></table><div class="tot"><p>Base: <b>${money(r.base)}</b></p><p>IVA: <b>${money(r.iva)}</b></p><p>Total: <b>${money(r.total)}</b></p></div>${r.packNote?'<p class="note">Si el presupuesto es aceptado y su importe supera los 500 € (IVA no incluido), el importe abonado por el Pack Presupuesto se descontará de la factura final.</p>':''}<p class="note"><b>Documento de prueba.</b> No sustituye la factura fiscal definitiva.</p>`)}
function printCertificate(s){const certNo=serviceDocNo(s,'CER');let body=`<p><b>N.º certificado:</b> ${esc(certNo)}</p>`+`<h2>${esc(typeMeta[s.type].name)}</h2><p><b>Cliente:</b> ${esc(s.client.name)}<br><b>Dirección:</b> ${esc(s.client.address)}<br><b>Fecha:</b> ${esc(s.date)}<br><b>Técnico:</b> ${esc(s.technician||'')}</p>`;if(s.type==='autoclave')body+=`<p>Se certifica la realización del tratamiento en autoclave sobre un volumen comprobado de <b>${fmt4(trunc4(num(s.data.checkedM3)))} m³</b>.</p>`;if(s.type==='madera')body+=`<p>Se certifica el tratamiento de madera in situ: <b>${esc(s.data.woodTreatment||'')}</b>, superficie registrada: <b>${esc(s.data.woodArea||'—')} m²</b>, producto: <b>${esc(s.data.woodProduct||'—')}</b>.</p>`;if(s.type==='ddd')body+=`<p>Se certifica la actuación DDD: <b>${esc(s.data.dddType||'')}</b>, objetivo: <b>${esc(s.data.dddTarget||'—')}</b>, producto: <b>${esc(s.data.dddProduct||'—')}</b>.</p>`;if(s.type==='mobiliario')body+=`<p>Se certifica el tratamiento de mobiliario: <b>${esc(s.data.furnTreatment||'')}</b>, piezas: <b>${esc(s.data.furnQty||'—')}</b>.</p><p class="note"><b>Aviso sobre mobiliario barnizado y acabados:</b> En piezas barnizadas, lacadas o con otros acabados superficiales, el producto de tratamiento penetrará principalmente a través de los orificios existentes producidos por la plaga y por las zonas de madera sin barnizar o sin recubrimiento. Debido a las condiciones propias del tratamiento en autoclave, no se puede garantizar la conservación del estado original de barnices, lacas, pinturas u otros acabados superficiales tras el proceso.</p>`;if(s.type==='termitas'){const end=addYears(s.data.termiteInstallationDate,3);if(!s.data.termiteInstallationDate||!s.data.termiteContactDate){alert('Para generar el certificado de Termitas deben constar instalación y contacto con colonia confirmado.');return}if(end&&nowDate()<end&&!confirm('Aún no se ha alcanzado el tercer aniversario. ¿Generar un certificado provisional?'))return;body+=`<p>Se certifica el seguimiento del tratamiento de Termitas iniciado el <b>${esc(dateLabel(s.data.termiteInstallationDate))}</b>, con contacto con colonia confirmado el <b>${esc(dateLabel(s.data.termiteContactDate))}</b>. El expediente registra <b>${(s.data.termiteVisits||[]).length}</b> hojas de seguimiento. Fecha prevista de finalización del tratamiento: <b>${esc(dateLabel(end))}</b>.</p>`}body+=companyValidationHtml();body+=`<div class="sign"><span>Director Técnico / empresa</span><span>Firma / conformidad cliente</span></div>`;printDoc('CERTIFICADO FINAL',body)}
function printDoc(title,body){const c=state.company||{},w=window.open('','_blank');if(!w){alert('Permite ventanas emergentes para imprimir.');return}w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#203129;font-size:11pt}header{border-bottom:3px solid #0f7a49;padding-bottom:10px;margin-bottom:20px}h1{color:#0f7a49;margin:0;font-size:21pt}h2{color:#27543d}.meta{font-size:9pt;color:#64776d}.big{font-size:17pt;font-weight:800;border:1px solid #bdd5c7;padding:12px;border-radius:8px;background:#f3f8f5;margin:15px 0}.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:60px}.sign span{border-top:1px solid #777;padding-top:6px;text-align:center}.draft{position:absolute;right:20mm;top:35mm;font-size:30pt;color:#b44;opacity:.18;transform:rotate(-12deg);font-weight:900}table{width:100%;border-collapse:collapse;margin:15px 0}th,td{border:1px solid #ccc;padding:9px;text-align:left}.tot{text-align:right;font-size:12pt}.note{font-size:9pt;color:#5f6f67;border:1px solid #ddd;padding:10px;border-radius:8px}.company-validation{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:end;margin-top:28px;padding-top:12px;border-top:1px solid #d5ddd8}.company-validation>div{text-align:center}.doc-stamp-img{display:block;max-width:190px;max-height:95px;object-fit:contain;margin:6px auto}.company-validation small{display:block;color:#68766f;margin-top:4px}footer{margin-top:40px;border-top:1px solid #ccc;padding-top:8px;font-size:8pt;color:#666}</style></head><body><header><h1>${esc(title)}</h1><div class="meta">${esc(c.name||'Empresa')} · ${esc(c.taxId||'')} · ${esc(c.address||'')}</div></header>${body}<footer>Generado desde Mis Hojas de Servicio · v47 Migración</footer><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close()}

function renderSettings(){const c=state.company||{};app.innerHTML=`<section class="hero"><div><h1>Datos de empresa</h1><p>Se usarán en albaranes, borradores y certificados del piloto.</p></div></section><div class="panel"><div class="settings-grid">${field('coName','Razón social / nombre',c.name||'')}${field('coTax','NIF/CIF',c.taxId||'')}${field('coAddress','Dirección',c.address||'')}${field('coPhone','Teléfono',c.phone||'')}${field('coEmail','Email',c.email||'')}${field('coReg','N.º registro / autorización (opcional)',c.registration||'')}</div><div class="cert-actions"><button class="btn" id="coSave">Guardar</button><button class="btn secondary" id="coBack">Volver</button><button class="btn red" id="exportBtn">Exportar copia JSON</button><label class="btn secondary import-label">Importar copia JSON<input id="importFile" type="file" accept="application/json" hidden></label><button class="btn blue" id="legacyImportBtn">Recuperar datos de la app anterior</button></div><p class="footer-note">Para pruebas reales conviene exportar una copia periódica. Esta versión piloto todavía no sustituye una copia de seguridad en servidor.</p></div>`;$('#coSave').onclick=()=>{state.company={name:$('#coName').value,taxId:$('#coTax').value,address:$('#coAddress').value,phone:$('#coPhone').value,email:$('#coEmail').value,registration:$('#coReg').value};save();toast('Empresa guardada')};$('#coBack').onclick=renderDashboard;$('#exportBtn').onclick=exportData;$('#importFile').onchange=importData;$('#legacyImportBtn').onclick=()=>{localStorage.removeItem('mhs_legacy_recovery_v503');runLegacyMigration()}}
function importData(){const f=$('#importFile')?.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const parsed=JSON.parse(r.result);if(!parsed||!Array.isArray(parsed.services))throw new Error('Formato no válido');if(!confirm('¿Importar esta copia? Sustituirá los datos actuales de este piloto.'))return;state=parsed;save();toast('Copia importada');renderDashboard()}catch(e){alert('No se pudo importar la copia JSON.')}};r.readAsText(f)}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`MHS-piloto-backup-${nowDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function bindServiceRows(){
 app.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{currentId=b.dataset.edit;setActiveNav(getCurrent()?.type);renderService()});
 app.querySelectorAll('[data-delete-service]').forEach(b=>b.onclick=()=>deleteService(b.dataset.deleteService));
}
function deleteService(id){const svc=state.services.find(x=>x.id===id);if(!svc)return;if(!confirm(`¿Eliminar la hoja ${svc.number||'(sin número)'} de ${svc.client?.name||'este cliente'}?`))return;if(!confirm('Esta acción eliminará la hoja de esta versión del piloto. ¿Continuar?'))return;state.services=state.services.filter(x=>x.id!==id);save();toast('Hoja eliminada');renderDashboard()}
function renderClients(){const a=(state.clients||[]).slice().sort((x,y)=>String(x.name||'').localeCompare(String(y.name||''),'es'));app.innerHTML=`<section class="hero"><div><span class="eyebrow">CATÁLOGO</span><h1>Clientes</h1><p>Clientes recuperados y creados en el piloto.</p></div></section><section class="list-card"><div class="list-head"><h2>Clientes</h2><span class="tag">${a.length}</span></div><div class="service-list">${a.length?a.map(c=>`<div class="service-row"><div><b>${esc(c.name||'Sin nombre')}</b><br><small>${esc(c.address||'')}</small></div><div><small>${esc(c.contact||'')}</small><br>${esc(c.phone||'')}</div><div class="hide-mobile"><small>${esc(c.email||'')}</small></div><div></div><button class="btn red" data-delete-client="${c.id}">Eliminar</button></div>`).join(''):'<div class="empty">No hay clientes.</div>'}</div></section>`;app.querySelectorAll('[data-delete-client]').forEach(b=>b.onclick=()=>{const c=state.clients.find(x=>x.id===b.dataset.deleteClient);if(!c||!confirm(`¿Eliminar el cliente “${c.name}”?`))return;state.clients=state.clients.filter(x=>x.id!==c.id);save();renderClients()})}
function renderProducts(){const a=(state.products||[]).slice().sort((x,y)=>String(x.name||'').localeCompare(String(y.name||''),'es'));app.innerHTML=`<section class="hero"><div><span class="eyebrow">CATÁLOGO</span><h1>Productos</h1><p>Productos recuperados de la aplicación anterior.</p></div></section><section class="list-card"><div class="list-head"><h2>Productos</h2><span class="tag">${a.length}</span></div><div class="service-list">${a.length?a.map(x=>`<div class="service-row"><div><b>${esc(x.name||'Sin nombre')}</b><br><small>${esc(x.maker||'')}</small></div><div><small>Registro: ${esc(x.reg||'—')}</small></div><div class="hide-mobile"><small>Cad.: ${esc(x.expiry||'—')}</small></div><div></div><button class="btn red" data-delete-product="${x.id}">Eliminar</button></div>`).join(''):'<div class="empty">No hay productos.</div>'}</div></section>`;app.querySelectorAll('[data-delete-product]').forEach(b=>b.onclick=()=>{const x=state.products.find(p=>p.id===b.dataset.deleteProduct);if(!x||!confirm(`¿Eliminar el producto “${x.name}”?`))return;state.products=state.products.filter(p=>p.id!==x.id);save();renderProducts()})}
function exitApp(){try{save()}catch{};if(confirm('Los datos locales están guardados. ¿Salir de la aplicación?')){window.close();setTimeout(()=>{app.innerHTML='<section class="hero"><div><h1>Aplicación preparada para cerrar</h1><p>Puedes cerrar esta ventana con ⌘ + Q en Mac, o con el gesto/botón habitual del dispositivo.</p></div></section>'},250)}}
function recoveredAttachmentsSection(s){const a=(s.attachments||[]).filter(x=>x.blobId||x.legacyId);if(!a.length)return '';return `<section class="section"><h3>Documentos y fotos recuperados</h3><div class="inner"><div class="feature-list">${a.map(x=>`<div class="recovered-file"><span>📎 <b>${esc(x.name||'Adjunto')}</b> <small>${x.migrated?'· recuperado':''}</small></span><button type="button" class="btn secondary" data-open-attachment="${x.id}">Ver</button></div>`).join('')}</div></div></section>`}
function bindRecoveredAttachments(s){app.querySelectorAll('[data-open-attachment]').forEach(b=>b.onclick=async()=>{const a=(s.attachments||[]).find(x=>x.id===b.dataset.openAttachment);if(!a||!window.MHSOffline)return;const rec=await MHSOffline.getBlob(a.blobId);if(!rec?.blob){alert('El archivo no está disponible localmente en este dispositivo.');return}const u=URL.createObjectURL(rec.blob);window.open(u,'_blank');setTimeout(()=>URL.revokeObjectURL(u),60000)})}
function legacyJSON(key,def){try{const raw=localStorage.getItem(key);return raw===null?def:(JSON.parse(raw)??def)}catch{return def}}

function legacyAllMhsData(){
 const out={};
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(!k||!k.startsWith('mhs_'))continue;
  const raw=localStorage.getItem(k);let v=raw;
  try{v=JSON.parse(raw)}catch{}
  out[k]=v;
 }
 return out;
}
function legacyFindValue(sources,aliases){
 const wanted=new Set(aliases.map(x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'')));
 const seen=new Set();
 function walk(v,depth=0){
  if(v==null||depth>6)return '';
  if(typeof v!=='object')return '';
  if(seen.has(v))return '';seen.add(v);
  for(const [k,val] of Object.entries(v)){
   const nk=String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
   if(wanted.has(nk) && val!=null && String(val).trim()!=='')return val;
  }
  for(const val of Object.values(v)){const r=walk(val,depth+1);if(r!==''&&r!=null)return r}
  return '';
 }
 for(const src of sources){const r=walk(src);if(r!==''&&r!=null)return r}
 return '';
}
function scanLegacyCompany(){
 const cfg=legacyJSON('mhs_config',{}), all=legacyAllMhsData(), sources=[cfg,all];
 const pick=(...a)=>legacyFindValue(sources,a);
 const company={
  name:pick('name','companyName','businessName','razonSocial','razónSocial','legalName','empresa','nombreEmpresa'),
  commercialName:pick('commercialName','tradeName','nombreComercial','marca'),
  taxId:pick('taxId','nif','cif','nifCif','cifNif'),
  address:pick('address','direccion','dirección','domicilio'),
  postalCode:pick('postalCode','codigoPostal','códigoPostal','cp'),
  province:pick('province','provincia'),
  phone:pick('phone','telefono','teléfono','tel'),
  email:pick('email','mail','correo','correoElectronico'),
  registration:pick('registration','roesb','numeroRoesb','nRoesb','registroRoesb'),
  logo:pick('logo','companyLogo','logoData','logoBase64','logotipo'),
  directorName:pick('directorName','directorTecnicoNombre','nombreDirector','directorNombre','technicalDirectorName'),
  directorSurname:pick('directorSurname','directorTecnicoApellidos','apellidosDirector','directorApellidos','technicalDirectorSurname'),
  directorSignature:pick('directorSignature','directorFirma','firmaDirector','firmaDirectorTecnico','technicalDirectorSignature')
 };
 // claves antiguas separadas frecuentes
 const separate={
  logo:['mhs_logo','mhs_company_logo','mhs_logotipo'],
  directorSignature:['mhs_director_signature','mhs_director_firma','mhs_firma_director'],
  directorName:['mhs_director_name','mhs_director_nombre'],
  directorSurname:['mhs_director_surname','mhs_director_apellidos']
 };
 for(const [field,keys] of Object.entries(separate))if(!company[field])for(const k of keys){const v=localStorage.getItem(k);if(v){company[field]=v;break}}
 return company;
}
function mergeLegacyCompany(company){
 if(!company)return 0; state.company=state.company||{};let n=0;
 for(const [k,v] of Object.entries(company)){
  if(v==null||String(v).trim()==='')continue;
  if(!state.company[k]){state.company[k]=v;n++}
 }
 return n;
}

function legacyFileDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('mhs_files',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function legacyGetFile(id){try{const db=await legacyFileDB();return await new Promise((res,rej)=>{const r=db.transaction('files','readonly').objectStore('files').get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}catch{return null}}
function legacyAttachmentList(sheet){const d=sheet?.data||{},arr=[];for(const list of [sheet?.attachments,d.attachments,d.cycleAttachments,d.planAttachments,d.photoAttachments])if(Array.isArray(list))for(const x of list)if(x?.id&&!arr.some(y=>y.id===x.id))arr.push(x);return arr}
function mapLegacySheet(sh){const map={insitu:'madera',madera:'madera',autoclave:'autoclave',ddd:'ddd',mobiliario:'mobiliario',termitas:'termitas'};const type=map[sh.type]||'ddd',d=sh.data||{},p=(sh.products||[])[0]||{};const svc={id:sh.id||uid(),legacySourceId:sh.id||'',legacyImported:true,type,number:sh.number||'',date:sh.date||nowDate(),status:sh.status==='FINALIZADA'?'FINALIZADA':'BORRADOR',client:{...(sh.client||{})},technician:sh.technician||'',notes:d.observations||'',data:{...d,legacyProducts:sh.products||[]},photos:{before:'',after:''},attachments:[],createdAt:sh.createdAt||new Date().toISOString(),updatedAt:sh.modified?`${sh.modified}T12:00:00`:new Date().toISOString()};if(type==='madera'){svc.data.woodTreatment=Array.isArray(d.treat)?d.treat.join(' + '):(d.woodTreatment||'');svc.data.woodArea=d.area||d.woodArea||'';svc.data.woodProduct=p.name||d.woodProduct||'';svc.data.woodDose=p.qty||d.woodDose||'';svc.data.woodZones=d.zones||d.woodZones||'';svc.data.woodObs=d.observations||d.woodObs||''}if(type==='termitas'){svc.data.termiteInstallationDate=d.installDate||d.termiteInstallationDate||'';svc.data.termiteStationsTotal=Array.isArray(d.stations)?d.stations.length:(d.termiteStationsTotal||'');svc.data.termiteVisits=svc.data.termiteVisits||[]}return svc}
async function scanLegacyData(){
 const clients=legacyJSON('mhs_clients',[]),products=legacyJSON('mhs_products',[]),sheets=legacyJSON('mhs_sheets',[]),cfg=legacyJSON('mhs_config',{}),company=scanLegacyCompany();
 const refs=[];for(const sh of sheets)for(const a of legacyAttachmentList(sh))if(a?.id&&!refs.some(x=>x.id===a.id))refs.push(a);
 let available=0;for(const a of refs){const blob=await legacyGetFile(a.id);if(blob)available++}
 const existingSheets=sheets.filter(sh=>state.services.some(x=>x.id===sh.id||x.legacySourceId===sh.id)).length;
 const clientKeys=new Set((state.clients||[]).map(x=>String(x.id||x.name||'').trim().toLowerCase()).filter(Boolean));
 const productKeys=new Set((state.products||[]).map(x=>String(x.id||x.name||'').trim().toLowerCase()).filter(Boolean));
 const newClients=clients.filter(x=>!clientKeys.has(String(x?.id||x?.name||'').trim().toLowerCase())).length;
 const newProducts=products.filter(x=>!productKeys.has(String(x?.id||x?.name||'').trim().toLowerCase())).length;
 return {clients,products,sheets,cfg,refs,available,missing:Math.max(0,refs.length-available),existingSheets,newClients,newProducts,newSheets:Math.max(0,sheets.length-existingSheets)};
}
function legacyScanMessage(scan){const co=scan.company||{};const coCount=Object.values(co).filter(v=>v!=null&&String(v).trim()!=='').length;const hasDir=!!(co.directorName||co.directorSurname);const hasSign=!!co.directorSignature;return `Datos de versiones anteriores encontrados:

• Clientes: ${scan.clients.length} (${scan.newClients} nuevos)
• Productos: ${scan.products.length} (${scan.newProducts} nuevos)
• Hojas: ${scan.sheets.length}
Datos de empresa: ${coCount?coCount+' campos encontrados':'no detectados'}
Director técnico: ${hasDir?'sí':'no'} · Firma: ${hasSign?'sí':'no'} (${scan.newSheets} nuevas)
• Fotos/documentos referenciados: ${scan.refs.length}
• Adjuntos disponibles en este dispositivo: ${scan.available}${scan.missing?`
• Adjuntos no disponibles localmente: ${scan.missing}`:''}

La recuperación AÑADE datos y NO borra ni modifica los originales. ¿Quieres importarlos ahora?`}
async function runLegacyMigration(preScan=null){
 const scan=preScan||await scanLegacyData();const {clients,products,sheets,cfg,company}=scan;
 if(!clients.length&&!products.length&&!sheets.length){alert('No he encontrado datos locales de versiones anteriores en este navegador. Los datos originales no se han modificado.');return}
 if(!confirm(legacyScanMessage(scan)))return;
 const merge=(old,incoming,key='id')=>{const m=new Map(old.map(x=>[x[key]||String(x.name||'').toLowerCase(),x]));for(const x of incoming){if(!x)continue;const k=x[key]||String(x.name||'').toLowerCase();if(k&&!m.has(k))m.set(k,{...x,legacyImported:true})}return [...m.values()]};
 const before={clients:(state.clients||[]).length,products:(state.products||[]).length,services:(state.services||[]).length};
 state.clients=merge(state.clients||[],clients);state.products=merge(state.products||[],products);
 const companyFieldsAdded=mergeLegacyCompany(company);if(cfg&&Object.keys(cfg).length){state.company=state.company||{};if(!state.company.name)state.company.name=cfg.name||'';if(!state.company.address)state.company.address=cfg.address||'';if(!state.company.phone)state.company.phone=cfg.phone||'';if(!state.company.email)state.company.email=cfg.email||'';if(!state.company.registration)state.company.registration=cfg.roesb||''}
 let imported=0,files=0,missing=0;for(const sh of sheets){if(state.services.some(x=>x.id===sh.id||x.legacySourceId===sh.id))continue;const svc=mapLegacySheet(sh);for(const a of legacyAttachmentList(sh)){const blob=await legacyGetFile(a.id);if(blob&&window.MHSOffline){const blobId=await MHSOffline.storeBlob(blob,{name:a.name||a.id,type:blob.type||a.type||'application/octet-stream',serviceId:svc.id,legacyId:a.id});svc.attachments.push({id:'legacy_'+a.id,legacyId:a.id,blobId,name:a.name||'Adjunto recuperado',type:blob.type||a.type||'application/octet-stream',createdAt:a.date||new Date().toISOString(),syncStatus:'pending',migrated:true});files++}else{svc.attachments.push({id:'legacy_'+a.id,legacyId:a.id,name:a.name||'Adjunto no disponible localmente',type:a.type||'',createdAt:a.date||'',migrated:true,missingLocal:true});missing++}}state.services.push(svc);imported++}
 state.migrationLog=Array.isArray(state.migrationLog)?state.migrationLog:[];state.migrationLog.push({id:uid(),at:new Date().toISOString(),source:'legacy-local',clientsAdded:(state.clients||[]).length-before.clients,productsAdded:(state.products||[]).length-before.products,sheetsAdded:imported,attachmentsRecovered:files,attachmentsMissing:missing,companyFieldsAdded});
 save();await MHSOffline?.saveState(state).catch(()=>{});localStorage.setItem('mhs_legacy_recovery_v503','imported');
 alert(`Recuperación terminada sin borrar los originales.

Clientes añadidos: ${(state.clients||[]).length-before.clients}
Productos añadidos: ${(state.products||[]).length-before.products}
Hojas añadidas: ${imported}
Fotos/documentos recuperados: ${files}${missing?`
Adjuntos no encontrados en este dispositivo: ${missing}`:''}`);renderDashboard()
}
async function autoLegacyRecovery(){
 if(localStorage.getItem('mhs_legacy_recovery_v503'))return;
 try{const scan=await scanLegacyData();if(!scan.clients.length&&!scan.products.length&&!scan.sheets.length){localStorage.setItem('mhs_legacy_recovery_v503','none');return}const ok=confirm(legacyScanMessage(scan));if(ok){await runLegacyMigrationConfirmed(scan)}else{localStorage.setItem('mhs_legacy_recovery_v503','later')}}catch(e){console.warn('Detección de datos anteriores',e)}
}
async function runLegacyMigrationConfirmed(scan){
 const originalConfirm=window.confirm;try{window.confirm=()=>true;await runLegacyMigration(scan)}finally{window.confirm=originalConfirm}
}



/* v48 · revisión integral: clientes, empresa, Hoja PDF/Albarán y facturas */
state.invoices=Array.isArray(state.invoices)?state.invoices:[];
const originalRenderDashboard=renderDashboard;
const normalizeClient=c=>({
 id:c?.id||uid(), name:c?.name||c?.businessName||'', taxId:c?.taxId||c?.cif||c?.nif||'',
 address:c?.address||'', postalCode:c?.postalCode||c?.cp||'', province:c?.province||'',
 phone:c?.phone||'', email:c?.email||'', contact:c?.contact||'', paymentMethod:c?.paymentMethod||'',
 iban:c?.iban||c?.bankAccount||'', active:c?.active!==false
});
state.clients=(state.clients||[]).map(normalizeClient);
function maskIban(v){const s=String(v||'').replace(/\s+/g,'');if(!s)return'';return '•••• •••• •••• •••• '+s.slice(-4)}
function getCatalogClient(s){const n=String(s?.client?.name||'').trim().toLowerCase();return (state.clients||[]).find(c=>String(c.name||'').trim().toLowerCase()===n)||null}
function companyHeaderHtml(){const c=state.company||{};return `<div class="company-doc-head">${c.logo?`<img src="${c.logo}" alt="Logotipo">`:''}<div><b>${esc(c.commercialName||c.name||'Empresa')}</b>${c.name&&c.commercialName?`<small>${esc(c.name)}</small>`:''}<small>${esc(c.taxId||'')}${c.registration?` · ROESB ${esc(c.registration)}`:''}</small><small>${esc([c.address,c.postalCode,c.province].filter(Boolean).join(' · '))}</small><small>${esc([c.phone,c.email].filter(Boolean).join(' · '))}</small></div></div>`}
function companyValidationHtml(){const c=state.company||{},dn=[c.directorName,c.directorSurname].filter(Boolean).join(' ');if(!c.seal&&!c.directorSignature&&!dn)return '';return `<div class="company-validation"><div>${dn?`<p><b>Director Técnico:</b> ${esc(dn)}</p>`:''}${c.directorSignature?`<img src="${c.directorSignature}" alt="Firma Director Técnico" class="doc-stamp-img">`:''}<small>Firma Director Técnico</small></div><div>${c.seal?`<img src="${c.seal}" alt="Sello de empresa" class="doc-stamp-img">`:''}<small>Sello de empresa</small></div></div>`}

renderDashboard=function(){originalRenderDashboard();const h=app.querySelector('.hero-actions');if(h&&!document.getElementById('legacyQuick')){const b=document.createElement('button');b.className='btn blue';b.id='legacyQuick';b.textContent='Recuperar app anterior';b.onclick=()=>{localStorage.removeItem('mhs_legacy_recovery_v503');runLegacyMigration()};h.prepend(b)}};

toolbar=function(s,{billing=true,certificate=true}={}){
 const n=(s.attachments||[]).length;
 return `<div class="toolbar"><button class="btn secondary" id="backBtn">← Volver</button><button class="btn" id="saveBtn">💾 Guardar hoja</button><button class="btn red" id="deleteSheetBtn">🗑 Eliminar</button><label class="btn secondary import-label">📎 Adjuntar documento<input id="serviceAttachment" type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" hidden></label>${n?`<span class="attachment-count">${n} adjunto${n===1?'':'s'} local${n===1?'':'es'}</span>`:''}<span class="spacer"></span><button class="btn blue" id="serviceDocBtn">Hoja PDF / Albarán</button>${billing?'<button class="btn amber" id="billingBtn">Facturación</button>':''}${certificate?'<button class="btn secondary" id="certificateBtn">Certificado final</button>':''}<button class="btn" id="finishBtn">Finalizar</button></div>`;
};

bindCommon=function(s,collector,opts={}){
 $('#backBtn').onclick=renderDashboard;
 $('#saveBtn').onclick=()=>{collector(s);save();toast(navigator.onLine?'Hoja guardada · sincronización en cola':'Hoja guardada sin conexión')};
 if($('#deleteSheetBtn'))$('#deleteSheetBtn').onclick=()=>deleteService(s.id);
 if($('#serviceDocBtn'))$('#serviceDocBtn').onclick=()=>{collector(s);save();openServiceDocument(s)};
 $('#finishBtn').onclick=()=>{collector(s);if(!s.client.name||!s.date){alert('Completa al menos cliente y fecha.');return}s.status='FINALIZADA';save();toast('Hoja finalizada');renderService()};
 if($('#certificateBtn'))$('#certificateBtn').onclick=()=>{collector(s);save();printCertificate(s)};
 if($('#billingBtn'))$('#billingBtn').onclick=()=>{collector(s);save();openBilling(s)};
 const att=$('#serviceAttachment');
 if(att)att.onchange=async()=>{const f=att.files?.[0];if(!f)return;try{let blobId='';if(window.MHSOffline)blobId=await MHSOffline.storeBlob(f,{name:f.name,type:f.type,size:f.size,serviceId:s.id});s.attachments=s.attachments||[];const a={id:uid(),blobId,name:f.name,type:f.type||'application/octet-stream',size:f.size,createdAt:new Date().toISOString(),syncStatus:'pending'};s.attachments.push(a);s.updatedAt=new Date().toISOString();save();if(window.MHSOffline)await MHSOffline.enqueue('attachment',{serviceId:s.id,attachmentId:a.id,name:a.name,type:a.type,size:a.size},{blobId});toast(navigator.onLine?'Documento guardado · pendiente de sincronizar':'Documento guardado sin conexión');renderService()}catch(e){alert('No se pudo guardar el documento en este dispositivo.')}};
 bindPhoto('photoBefore',s,'before');bindPhoto('photoAfter',s,'after');
 const cn=$('#clientName');if(cn)cn.addEventListener('change',()=>{const c=(state.clients||[]).find(x=>String(x.name||'').toLowerCase()===cn.value.trim().toLowerCase());if(c){$('#clientContact').value=c.contact||'';$('#clientPhone').value=c.phone||'';$('#clientAddress').value=c.address||'';$('#clientEmail').value=c.email||'';}});
 bindRecoveredAttachments(s);
};

function renderClientForm(id=''){
 const existing=(state.clients||[]).find(c=>c.id===id),c=normalizeClient(existing||{});
 app.innerHTML=`<section class="hero"><div><span class="eyebrow">CLIENTES</span><h1>${existing?'Editar cliente':'Nuevo cliente'}</h1><p>El IBAN se conserva completo en la ficha interna; en documentos solo se muestran los 4 últimos dígitos.</p></div></section><section class="panel"><div class="settings-grid">${field('clName','Razón social *',c.name)}${field('clTax','CIF / NIF',c.taxId)}${field('clAddress','Dirección',c.address)}${field('clPostal','Código postal',c.postalCode)}${field('clProvince','Provincia',c.province)}${field('clPhone','Teléfono',c.phone)}${field('clEmail','Email',c.email,'email')}${field('clContact','Persona de contacto',c.contact)}${field('clPayment','Forma de pago',c.paymentMethod)}${field('clIban','N.º de c/c · IBAN',c.iban)}</div><div class="cert-actions"><button class="btn" id="clSave">Guardar cliente</button><button class="btn secondary" id="clCancel">Cancelar</button>${existing?'<button class="btn red" id="clDelete">Eliminar cliente</button>':''}</div></section>`;
 $('#clSave').onclick=()=>{const name=$('#clName').value.trim();if(!name){alert('La razón social es obligatoria.');return}const obj={...c,id:existing?.id||c.id,name,taxId:$('#clTax').value.trim(),address:$('#clAddress').value.trim(),postalCode:$('#clPostal').value.trim(),province:$('#clProvince').value.trim(),phone:$('#clPhone').value.trim(),email:$('#clEmail').value.trim(),contact:$('#clContact').value.trim(),paymentMethod:$('#clPayment').value.trim(),iban:$('#clIban').value.trim(),active:true};if(existing)state.clients=state.clients.map(x=>x.id===obj.id?obj:x);else state.clients.push(obj);save();toast('Cliente guardado');renderClients()};
 $('#clCancel').onclick=renderClients;
 if($('#clDelete'))$('#clDelete').onclick=()=>{if(!confirm(`¿Eliminar el cliente “${c.name}”?`))return;state.clients=state.clients.filter(x=>x.id!==c.id);save();renderClients()};
}
renderClients=function(){
 const q='';const a=(state.clients||[]).map(normalizeClient).slice().sort((x,y)=>String(x.name||'').localeCompare(String(y.name||''),'es'));
 app.innerHTML=`<section class="hero"><div><span class="eyebrow">CATÁLOGO</span><h1>Clientes</h1><p>Ficha completa, datos de pago y acceso a las hojas relacionadas.</p></div><div class="hero-actions"><button class="btn" id="newClient">+ Nuevo cliente</button></div></section><section class="panel client-search"><div class="field"><label>Buscar cliente</label><input id="clientSearch" placeholder="Razón social, CIF, teléfono, email…"></div></section><section class="list-card"><div class="list-head"><h2>Clientes</h2><span class="tag">${a.length}</span></div><div class="service-list" id="clientRows">${a.length?a.map(clientRowHtml).join(''):'<div class="empty">No hay clientes.</div>'}</div></section>`;
 $('#newClient').onclick=()=>renderClientForm();
 const paint=()=>{const term=$('#clientSearch').value.trim().toLowerCase();const f=a.filter(c=>[c.name,c.taxId,c.phone,c.email,c.contact,c.address].some(v=>String(v||'').toLowerCase().includes(term)));$('#clientRows').innerHTML=f.length?f.map(clientRowHtml).join(''):'<div class="empty">Sin resultados.</div>';bindClientRows()};
 $('#clientSearch').oninput=paint;bindClientRows();
};
function clientRowHtml(c){const sheets=(state.services||[]).filter(s=>String(s.client?.name||'').trim().toLowerCase()===String(c.name||'').trim().toLowerCase()).length;return `<div class="service-row client-row"><div><b>${esc(c.name||'Sin nombre')}</b><br><small>${esc(c.taxId||'')} · ${esc([c.address,c.postalCode,c.province].filter(Boolean).join(', '))}</small></div><div><small>${esc(c.contact||'')}</small><br>${esc(c.phone||'')}</div><div class="hide-mobile"><small>${esc(c.email||'')}</small><br><small>${esc(c.paymentMethod||'')}${c.iban?` · IBAN ${esc(maskIban(c.iban))}`:''}</small></div><div><span class="tag">${sheets} hojas</span></div><div class="row-actions"><button class="btn secondary" data-edit-client="${c.id}">Editar</button><button class="btn blue" data-client-sheets="${c.id}">Hojas</button><button class="btn red" data-delete-client="${c.id}">Eliminar</button></div></div>`}
function bindClientRows(){app.querySelectorAll('[data-edit-client]').forEach(b=>b.onclick=()=>renderClientForm(b.dataset.editClient));app.querySelectorAll('[data-client-sheets]').forEach(b=>b.onclick=()=>{const c=state.clients.find(x=>x.id===b.dataset.clientSheets);const items=state.services.filter(s=>String(s.client?.name||'').toLowerCase()===String(c?.name||'').toLowerCase());app.innerHTML=`<section class="hero"><div><h1>${esc(c?.name||'Cliente')}</h1><p>Hojas y expedientes relacionados.</p></div><button class="btn secondary" id="backClients">← Clientes</button></section><section class="list-card"><div class="service-list">${items.length?items.map(row).join(''):'<div class="empty">Este cliente no tiene hojas.</div>'}</div></section>`;$('#backClients').onclick=renderClients;bindServiceRows()});app.querySelectorAll('[data-delete-client]').forEach(b=>b.onclick=()=>{const c=state.clients.find(x=>x.id===b.dataset.deleteClient);if(!c||!confirm(`¿Eliminar el cliente “${c.name}”?`))return;state.clients=state.clients.filter(x=>x.id!==c.id);save();renderClients()})}

renderSettings=function(){const c=state.company||{};app.innerHTML=`<section class="hero"><div><h1>Empresa / copias</h1><p>Estos datos, logotipo, sello y firma del Director Técnico se reflejan automáticamente en los documentos correspondientes.</p></div></section><div class="panel"><div class="company-media-grid"><div class="company-logo-editor"><h3>Logotipo</h3><div class="logo-preview" id="logoPreview">${c.logo?`<img src="${c.logo}" alt="Logotipo">`:'Sin logotipo'}</div><label class="btn secondary import-label">Elegir logotipo<input id="coLogo" type="file" accept="image/*" hidden></label>${c.logo?'<button class="btn red" id="coLogoDelete">Quitar logotipo</button>':''}</div><div class="company-logo-editor"><h3>Sello de empresa</h3><div class="logo-preview" id="sealPreview">${c.seal?`<img src="${c.seal}" alt="Sello de empresa">`:'Sin sello'}</div><label class="btn secondary import-label">Elegir sello escaneado<input id="coSeal" type="file" accept="image/*" hidden></label>${c.seal?'<button class="btn red" id="coSealDelete">Quitar sello</button>':''}</div><div class="company-logo-editor"><h3>Firma Director Técnico</h3><div class="logo-preview" id="directorPreview">${c.directorSignature?`<img src="${c.directorSignature}" alt="Firma Director Técnico">`:'Sin firma'}</div><label class="btn secondary import-label">Elegir firma escaneada<input id="coDirectorSignature" type="file" accept="image/*" hidden></label>${c.directorSignature?'<button class="btn red" id="coDirectorDelete">Quitar firma</button>':''}</div></div><div class="settings-grid">${field('coName','Razón social',c.name||'')}${field('coCommercial','Nombre comercial',c.commercialName||'')}${field('coTax','CIF / NIF',c.taxId||'')}${field('coAddress','Dirección',c.address||'')}${field('coPostal','Código postal',c.postalCode||'')}${field('coProvince','Provincia',c.province||'')}${field('coPhone','Teléfono',c.phone||'')}${field('coEmail','Email',c.email||'')}${field('coReg','N.º registro ROESB',c.registration||'')}${field('coDirectorName','Director Técnico · nombre',c.directorName||'')}${field('coDirectorSurname','Director Técnico · apellidos',c.directorSurname||'')}${field('serviceNext','Próximo número base de servicio',state.numbering?.serviceNext||26001,'number','min="1" step="1"')}</div><div class="cert-actions"><button class="btn" id="coSave">Guardar empresa</button><button class="btn secondary" id="coBack">Volver</button><button class="btn red" id="exportBtn">Exportar copia JSON</button><label class="btn secondary import-label">Importar copia JSON<input id="importFile" type="file" accept="application/json" hidden></label><button class="btn blue" id="legacyImportBtn">Recuperar datos de la app anterior</button></div><p class="footer-note">La recuperación de clientes, productos, hojas, fotos y documentos se mantiene intacta. Esta revisión solo amplía los datos de Empresa y su uso documental.</p></div>`;
 let pendingLogo=c.logo||'',pendingSeal=c.seal||'',pendingDirectorSignature=c.directorSignature||'';
 const bindImage=(input,preview,setter)=>{$(input).onchange=async()=>{const f=$(input).files?.[0];if(!f)return;const data=await compressImage(f);setter(data);$(preview).innerHTML=`<img src="${data}" alt="Vista previa">`}};
 bindImage('#coLogo','#logoPreview',v=>pendingLogo=v);bindImage('#coSeal','#sealPreview',v=>pendingSeal=v);bindImage('#coDirectorSignature','#directorPreview',v=>pendingDirectorSignature=v);
 if($('#coLogoDelete'))$('#coLogoDelete').onclick=()=>{pendingLogo='';$('#logoPreview').textContent='Sin logotipo'};
 if($('#coSealDelete'))$('#coSealDelete').onclick=()=>{pendingSeal='';$('#sealPreview').textContent='Sin sello'};
 if($('#coDirectorDelete'))$('#coDirectorDelete').onclick=()=>{pendingDirectorSignature='';$('#directorPreview').textContent='Sin firma'};
 $('#coSave').onclick=()=>{state.company={...state.company,name:$('#coName').value.trim(),commercialName:$('#coCommercial').value.trim(),taxId:$('#coTax').value.trim(),address:$('#coAddress').value.trim(),postalCode:$('#coPostal').value.trim(),province:$('#coProvince').value.trim(),phone:$('#coPhone').value.trim(),email:$('#coEmail').value.trim(),registration:$('#coReg').value.trim(),directorName:$('#coDirectorName').value.trim(),directorSurname:$('#coDirectorSurname').value.trim(),directorSignature:pendingDirectorSignature,seal:pendingSeal,logo:pendingLogo};state.numbering={...(state.numbering||{}),serviceNext:Math.max(1,Math.trunc(Number($('#serviceNext').value)||26001))};save();toast('Empresa, sello y firma guardados')};$('#coBack').onclick=renderDashboard;$('#exportBtn').onclick=exportData;$('#importFile').onchange=importData;$('#legacyImportBtn').onclick=()=>{localStorage.removeItem('mhs_legacy_recovery_v503');runLegacyMigration()};
}
function openServiceDocument(s){const r=s.data.documentReceipt=s.data.documentReceipt||{},kind=r.kind||'Hoja PDF';app.innerHTML=`<div class="toolbar"><button class="btn secondary" id="docBack">← Volver a hoja</button><button class="btn" id="docSave">Guardar documento</button><button class="btn blue" id="docPrint">Imprimir / PDF</button><button class="btn secondary" id="docShare">Compartir</button><button class="btn red" id="docDelete">Eliminar documento</button></div><div class="sheet"><div class="sheet-title"><div><h1>Hoja PDF / Albarán</h1><small>${esc(typeMeta[s.type].name)} · ${esc(s.number||'')}</small></div></div><div class="sheet-body"><section class="section"><h3>Tipo de documento</h3><div class="inner"><div class="grid">${select('docKind','Generar como',['Hoja PDF','Albarán'],kind)}${field('docNo','N.º documento',r.number||(kind==='Albarán'?serviceDocNo(s,'ALB'):serviceDocNo(s,'HS')),'text','readonly class=\"readonly\"')}${field('docDate','Fecha',r.date||s.date||nowDate(),'date')}${field('docNotes','Observaciones del documento',r.notes||'')}</div><div class="notice">La misma hoja sirve como PDF técnico o como albarán. Si eliges <b>Albarán</b>, la firma de recepción es obligatoria.</div></div></section>${s.type==='mobiliario'?`<section class="section" id="docFurnGroupSection"><h3>Fotografía del conjunto para el albarán</h3><div class="inner"><div class="photo-box"><div class="photo-preview" id="docFurnGroupPreview">${s.photos?.furnGroup?`<img src="${s.photos.furnGroup}" alt="Foto del conjunto">`:'Sin foto del conjunto'}</div><label>Seleccionar fotografía de archivo <input type="file" id="docFurnGroupFile" accept="image/*"></label><label>Hacer foto con el móvil <input type="file" id="docFurnGroupCamera" accept="image/*" capture="environment"></label><button type="button" class="btn secondary" id="docFurnGroupRemove" ${s.photos?.furnGroup?'':'disabled'}>Eliminar foto del conjunto</button></div></div></section>`:''}<section class="section" id="receiptSection"><h3>Recepción · obligatoria para Albarán</h3><div class="inner"><div class="grid three">${field('docReceiver','Nombre de quien recibe',r.receiver||'')}${field('docRole','Empresa / función',r.receiverRole||'')}${field('docSignDate','Fecha / hora recepción',r.signDate||new Date().toLocaleString('es-ES'))}${field('docCarrier','Transportista / empresa (opcional)',r.carrier||'')}${field('docPlate','Matrícula (opcional)',r.plate||'')}</div><div class="field full"><label>Firma de recepción</label><canvas id="docSignature" width="700" height="220" class="signature-canvas"></canvas><div class="signature-actions"><button type="button" class="btn secondary" id="clearDocSignature">Borrar firma</button></div></div></div></section></div></div>`;
 $('#docBack').onclick=renderService;setupDocSignature(s);const show=()=>{const isDelivery=$('#docKind').value==='Albarán';$('#receiptSection').classList.toggle('is-optional',!isDelivery);if($('#docFurnGroupSection'))$('#docFurnGroupSection').hidden=!isDelivery};$('#docKind').onchange=()=>{show();$('#docNo').value=$('#docKind').value==='Albarán'?serviceDocNo(s,'ALB'):serviceDocNo(s,'HS')};show();
 if(s.type==='mobiliario'){
  const setPhoto=async input=>{
   const file=input.files?.[0];if(!file)return;
   try{const img=await compressImage(file);s.photos=s.photos||{};s.photos.furnGroup=img;s.updatedAt=new Date().toISOString();save();
    $('#docFurnGroupPreview').innerHTML=`<img src="${img}" alt="Foto del conjunto">`;
    $('#docFurnGroupRemove').disabled=false;toast('Fotografía del conjunto guardada');
   }catch(err){alert('No se pudo guardar la fotografía: '+(err?.message||err))}finally{input.value=''}
  };
  $('#docFurnGroupFile').onchange=e=>setPhoto(e.target);
  $('#docFurnGroupCamera').onchange=e=>setPhoto(e.target);
  $('#docFurnGroupRemove').onclick=()=>{
   if(!confirm('¿Eliminar la fotografía del conjunto?'))return;
   if(s.photos)delete s.photos.furnGroup;
   s.updatedAt=new Date().toISOString();save();
   $('#docFurnGroupPreview').textContent='Sin foto del conjunto';
   $('#docFurnGroupRemove').disabled=true;
  };
 }
 $('#docSave').onclick=()=>{if(collectServiceDocument(s,false)){toast('Documento guardado')}};$('#docPrint').onclick=()=>{if(collectServiceDocument(s,true))printServiceDocument(s)};$('#docShare').onclick=()=>{if(!collectServiceDocument(s,false))return;const r=s.data.documentReceipt||{};shareDocument({title:r.kind==='Albarán'?'Hoja de servicio / Albarán':'Hoja de servicio',text:`${r.kind} ${r.number||s.number} · ${s.client?.name||''} · ${typeMeta[s.type]?.name||s.type}`,filename:`${(r.number||s.number||'documento').replaceAll(' ','_')}.txt`})};$('#docDelete').onclick=()=>{const r=s.data.documentReceipt||{};if(!r.number&&!r.signature&&!r.notes&&!r.receiver){alert('No hay un documento guardado que eliminar.');return}if(!confirm(`¿Eliminar ${r.kind||'el documento'} ${r.number||''}? La hoja de servicio no se borrará.`))return;delete s.data.documentReceipt;s.updatedAt=new Date().toISOString();save();toast('Documento eliminado');renderService()};
}
function setupDocSignature(s){const r=s.data.documentReceipt=s.data.documentReceipt||{},canvas=$('#docSignature'),ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#203129';let drawing=false,hasInk=false;const pos=e=>{const x=canvas.getBoundingClientRect(),p=e;return{x:(p.clientX-x.left)*canvas.width/x.width,y:(p.clientY-x.top)*canvas.height/x.height}};canvas.onpointerdown=e=>{drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()};canvas.onpointermove=e=>{if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true;e.preventDefault()};window.addEventListener('pointerup',()=>drawing=false);if(r.signature){const im=new Image();im.onload=()=>{ctx.drawImage(im,0,0,canvas.width,canvas.height);hasInk=true};im.src=r.signature}$('#clearDocSignature').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false;r.signature=''};canvas._hasInk=()=>hasInk;canvas._data=()=>canvas.toDataURL('image/png')}
function collectServiceDocument(s,forPrint=false){const r=s.data.documentReceipt=s.data.documentReceipt||{},canvas=$('#docSignature');r.kind=$('#docKind').value;r.number=$('#docNo').value.trim();r.date=$('#docDate').value;r.notes=$('#docNotes').value.trim();r.receiver=$('#docReceiver').value.trim();r.receiverRole=$('#docRole').value.trim();r.signDate=$('#docSignDate').value.trim();r.carrier=$('#docCarrier').value.trim();r.plate=$('#docPlate').value.trim();if(canvas?._hasInk?.())r.signature=canvas._data();if(r.kind==='Albarán'&&(!r.receiver||!r.signDate||!r.signature)){alert('Para generar un Albarán debes indicar quién recibe, fecha/hora y firma de recepción.');return false}s.updatedAt=new Date().toISOString();save();return true}
function printServiceDocument(s){const r=s.data.documentReceipt||{},c=getCatalogClient(s),photos=servicePhotosHtml(s),clientPay=c?`<p><b>Forma de pago:</b> ${esc(c.paymentMethod||'—')}${c.iban?` · <b>IBAN:</b> ${esc(maskIban(c.iban))}`:''}</p>`:'';let receipt='';if(r.kind==='Albarán')receipt=`<h3>Recepción</h3><p><b>Recibido por:</b> ${esc(r.receiver)} ${r.receiverRole?`· ${esc(r.receiverRole)}`:''}<br><b>Fecha/hora:</b> ${esc(r.signDate)}${r.carrier?`<br><b>Transportista:</b> ${esc(r.carrier)}`:''}${r.plate?` · <b>Matrícula:</b> ${esc(r.plate)}`:''}</p><p><img src="${r.signature}" alt="Firma recepción" style="max-width:320px;max-height:130px;border-bottom:1px solid #777"></p>`;printDoc(r.kind==='Albarán'?'HOJA DE SERVICIO / ALBARÁN':'HOJA DE SERVICIO',`${companyHeaderHtml()}<h2>${esc(typeMeta[s.type].name)}</h2><p><b>N.º documento:</b> ${esc(r.number||s.number||'')} · <b>Fecha:</b> ${esc(r.date||s.date||'')}</p><p><b>Cliente:</b> ${esc(s.client.name)}<br><b>Dirección:</b> ${esc(s.client.address||c?.address||'')}<br><b>Contacto:</b> ${esc(s.client.contact||c?.contact||'')} · ${esc(s.client.phone||c?.phone||'')}</p>${clientPay}${serviceDetailsHtml(s)}${s.notes?`<p><b>Observaciones:</b><br>${esc(s.notes)}</p>`:''}${r.notes?`<p><b>Observaciones documento:</b><br>${esc(r.notes)}</p>`:''}${photos}${receipt}${companyValidationHtml()}`)}

renderArea=function(area){if(area==='facturacion')return renderInvoices();if(area==='presupuestos')return renderBudgets();const title=area==='albaranes'?'Hoja PDF / Albarán':'Documentos';const eligible=state.services;app.innerHTML=`<section class="hero"><div><span class="eyebrow">ÁREA COMÚN</span><h1>${title}</h1><p>${area==='albaranes'?'Cada hoja de servicio puede generar su PDF técnico o funcionar como albarán con firma de recepción.':'Documentos y certificados asociados a los servicios.'}</p></div></section><section class="list-card"><div class="list-head"><h2>Servicios disponibles</h2><span class="tag">${eligible.length}</span></div><div class="service-list">${eligible.length?eligible.map(s=>`<div class="service-row area-row"><div><b>${typeMeta[s.type].icon} ${esc(typeMeta[s.type].name)}</b><br><small>${esc(s.number||'Sin número')} · ${esc(s.client?.name||'Sin cliente')}</small></div><div><small>${esc(s.date||'')}</small></div><div><span class="tag ${s.status==='FINALIZADA'?'done':'pending'}">${esc(s.status)}</span></div><div></div><button class="btn blue" data-doc-open="${s.id}">${area==='albaranes'?'Hoja PDF / Albarán':'Abrir hoja'}</button></div>`).join(''):'<div class="empty">Todavía no hay servicios.</div>'}</div></section>`;app.querySelectorAll('[data-doc-open]').forEach(b=>b.onclick=()=>{currentId=b.dataset.docOpen;setActiveNav(getCurrent()?.type);area==='albaranes'?openServiceDocument(getCurrent()):renderService()})};

function renderInvoices(){state.invoices=Array.isArray(state.invoices)?state.invoices:[];const list=state.invoices.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));app.innerHTML=`<section class="hero"><div><span class="eyebrow">FACTURACIÓN</span><h1>Facturas</h1><p>Crea facturas y vincúlalas a un cliente y, si procede, a una hoja de servicio.</p></div><div class="hero-actions"><button class="btn" id="addInvoice">+ Añadir factura</button></div></section><section class="list-card"><div class="list-head"><h2>Facturas</h2><span class="tag">${list.length}</span></div><div class="service-list">${list.length?list.map(invoiceRowHtml).join(''):'<div class="empty">Todavía no hay facturas.</div>'}</div></section>`;$('#addInvoice').onclick=()=>openInvoiceForm();bindInvoiceRows()}
function invoiceRowHtml(i){const client=state.clients.find(c=>c.id===i.clientId);return `<div class="service-row"><div><b>${esc(i.number||'Sin número')}</b><br><small>${esc(client?.name||i.clientName||'Sin cliente')}</small></div><div><small>${esc(i.date||'')}</small><br>${esc(i.concept||'')}</div><div><span class="tag ${i.status==='EMITIDA'?'done':'pending'}">${esc(i.status||'BORRADOR')}</span></div><div><b>${money(Number(i.total)||0)}</b></div><div class="row-actions"><button class="btn secondary" data-edit-invoice="${i.id}">Editar</button><button class="btn blue" data-print-invoice="${i.id}">PDF</button><button class="btn secondary" data-share-invoice="${i.id}">Compartir</button><button class="btn red" data-delete-invoice="${i.id}">Eliminar</button></div></div>`}
function bindInvoiceRows(){app.querySelectorAll('[data-share-invoice]').forEach(b=>b.onclick=()=>{const i=state.invoices.find(x=>x.id===b.dataset.shareInvoice),c=state.clients.find(x=>x.id===i?.clientId);if(i)shareDocument({title:'Factura',text:`Factura ${i.number||''} · ${c?.name||''} · Total ${money(Number(i.total)||0)}`,filename:`${String(i.number||'factura').replaceAll(' ','_')}.txt`})});app.querySelectorAll('[data-edit-invoice]').forEach(b=>b.onclick=()=>openInvoiceForm(b.dataset.editInvoice));app.querySelectorAll('[data-print-invoice]').forEach(b=>b.onclick=()=>printInvoice(state.invoices.find(i=>i.id===b.dataset.printInvoice)));app.querySelectorAll('[data-delete-invoice]').forEach(b=>b.onclick=()=>{const i=state.invoices.find(x=>x.id===b.dataset.deleteInvoice);if(!i||!confirm(`¿Eliminar la factura ${i.number||''}?`))return;state.invoices=state.invoices.filter(x=>x.id!==i.id);save();renderInvoices()})}
function openInvoiceForm(id=''){const old=state.invoices.find(i=>i.id===id),i=old||{id:uid(),number:'',date:nowDate(),clientId:'',serviceId:'',concept:'',base:'',vat:'21',status:'BORRADOR',notes:''};const clientOpts=['<option value="">Selecciona cliente</option>',...state.clients.map(c=>`<option value="${c.id}" ${c.id===i.clientId?'selected':''}>${esc(c.name)}</option>`)].join('');const serviceOpts=['<option value="">Sin hoja vinculada</option>',...state.services.map(s=>`<option value="${s.id}" ${s.id===i.serviceId?'selected':''}>${esc(s.number||'Sin número')} · ${esc(typeMeta[s.type]?.name||s.type)} · ${esc(s.client?.name||'')}</option>`)].join('');app.innerHTML=`<section class="hero"><div><h1>${old?'Editar factura':'Añadir factura'}</h1><p>La factura queda guardada en el piloto y puede vincularse con una hoja de servicio.</p></div></section><section class="panel"><div class="settings-grid">${field('invNo','N.º factura',i.number)}${field('invDate','Fecha',i.date,'date')}<div class="field"><label>Cliente</label><select id="invClient">${clientOpts}</select></div><div class="field"><label>Hoja vinculada</label><select id="invService">${serviceOpts}</select></div>${field('invConcept','Concepto',i.concept)}${field('invBase','Base imponible (€)',i.base,'text','inputmode="decimal"')}${select('invVat','IVA (%)',['21','10'],String(i.vat||'21'))}${select('invStatus','Estado',['BORRADOR','EMITIDA'],i.status||'BORRADOR')}${textarea('invNotes','Observaciones',i.notes||'')}</div><div class="totals"><div class="total"><span>Base</span><strong id="invBaseOut">—</strong></div><div class="total"><span>IVA</span><strong id="invVatOut">—</strong></div><div class="total"><span>Total</span><strong id="invTotalOut">—</strong></div></div><div class="cert-actions"><button class="btn" id="invSave">Guardar factura</button><button class="btn secondary" id="invCancel">Cancelar</button>${old?'<button class="btn blue" id="invPrint">Imprimir / PDF</button><button class="btn secondary" id="invShare">Compartir</button>':''}</div></section>`;const calc=()=>{const base=num($('#invBase').value)||0,vat=num($('#invVat').value)||0;$('#invBaseOut').textContent=money(base);$('#invVatOut').textContent=money(base*vat/100);$('#invTotalOut').textContent=money(base*(1+vat/100))};$('#invBase').oninput=calc;$('#invVat').oninput=calc;calc();$('#invService').onchange=()=>{const s=state.services.find(x=>x.id===$('#invService').value);if(s){const c=state.clients.find(x=>String(x.name||'').toLowerCase()===String(s.client?.name||'').toLowerCase());if(c)$('#invClient').value=c.id;if(!$('#invConcept').value)$('#invConcept').value=`${typeMeta[s.type]?.name||s.type} · hoja ${s.number||''}`;$('#invNo').value=serviceDocNo(s,'FRA')}};$('#invSave').onclick=()=>{const base=num($('#invBase').value)||0,vat=num($('#invVat').value)||0,obj={...i,number:$('#invNo').value.trim(),date:$('#invDate').value,clientId:$('#invClient').value,serviceId:$('#invService').value,concept:$('#invConcept').value.trim(),base,vat,status:$('#invStatus').value,notes:$('#invNotes').value.trim(),total:base*(1+vat/100),updatedAt:new Date().toISOString()};if(old)state.invoices=state.invoices.map(x=>x.id===obj.id?obj:x);else state.invoices.push(obj);save();toast('Factura guardada');renderInvoices()};$('#invCancel').onclick=renderInvoices;if($('#invPrint'))$('#invPrint').onclick=()=>printInvoice(state.invoices.find(x=>x.id===i.id)||i);if($('#invShare'))$('#invShare').onclick=()=>{const x=state.invoices.find(x=>x.id===i.id)||i,c=state.clients.find(c=>c.id===x.clientId);shareDocument({title:'Factura',text:`Factura ${x.number||''} · ${c?.name||''} · Total ${money(Number(x.total)||0)}`,filename:`${String(x.number||'factura').replaceAll(' ','_')}.txt`})}}
function printInvoice(i){if(!i)return;const c=state.clients.find(x=>x.id===i.clientId),base=Number(i.base)||0,vat=Number(i.vat)||0;printDoc(i.status==='EMITIDA'?'FACTURA':'BORRADOR DE FACTURA',`${companyHeaderHtml()}${i.status!=='EMITIDA'?'<div class="draft">BORRADOR</div>':''}<h2>${esc(c?.name||'Cliente')}</h2><p>${esc(c?.taxId||'')}<br>${esc([c?.address,c?.postalCode,c?.province].filter(Boolean).join(' · '))}<br>${esc(c?.email||'')} · ${esc(c?.phone||'')}</p><p><b>N.º:</b> ${esc(i.number||'')} · <b>Fecha:</b> ${esc(i.date||'')}</p><table><tr><th>Concepto</th><th>Base</th></tr><tr><td>${esc(i.concept||'Servicio')}</td><td>${money(base)}</td></tr></table><div class="tot"><p>Base: <b>${money(base)}</b></p><p>IVA ${vat}%: <b>${money(base*vat/100)}</b></p><p>Total: <b>${money(base*(1+vat/100))}</b></p></div>${c?.paymentMethod?`<p><b>Forma de pago:</b> ${esc(c.paymentMethod)}${c.iban?` · IBAN ${esc(maskIban(c.iban))}`:''}</p>`:''}${i.notes?`<p class="note">${esc(i.notes)}</p>`:''}`)}


function renderBudgets(){state.budgets=Array.isArray(state.budgets)?state.budgets:[];const list=state.budgets.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));app.innerHTML=`<section class="hero"><div><span class="eyebrow">PRESUPUESTOS</span><h1>Presupuestos</h1><p>La numeración es independiente de los servicios: PREAAAAMMDD y sufijo si hay varios el mismo día.</p></div><div class="hero-actions"><button class="btn" id="addBudget">+ Añadir presupuesto</button></div></section><section class="list-card"><div class="list-head"><h2>Presupuestos</h2><span class="tag">${list.length}</span></div><div class="service-list">${list.length?list.map(budgetRowHtml).join(''):'<div class="empty">Todavía no hay presupuestos.</div>'}</div></section>`;$('#addBudget').onclick=()=>openBudgetForm();bindBudgetRows()}
function budgetRowHtml(b){const c=state.clients.find(x=>x.id===b.clientId);return `<div class="service-row"><div><b>${esc(b.number)}</b><br><small>${esc(c?.name||b.clientName||'Sin cliente')}</small></div><div><small>${esc(b.date||'')}</small><br>${esc(b.concept||'')}</div><div><span class="tag ${b.status==='ACEPTADO'?'done':'pending'}">${esc(b.status||'BORRADOR')}</span></div><div><b>${money(Number(b.total)||0)}</b></div><div class="row-actions"><button class="btn secondary" data-edit-budget="${b.id}">Editar</button><button class="btn blue" data-print-budget="${b.id}">PDF</button><button class="btn secondary" data-share-budget="${b.id}">Compartir</button><button class="btn red" data-delete-budget="${b.id}">Eliminar</button></div></div>`}
function bindBudgetRows(){app.querySelectorAll('[data-edit-budget]').forEach(x=>x.onclick=()=>openBudgetForm(x.dataset.editBudget));app.querySelectorAll('[data-print-budget]').forEach(x=>x.onclick=()=>printBudget(state.budgets.find(b=>b.id===x.dataset.printBudget)));app.querySelectorAll('[data-share-budget]').forEach(x=>x.onclick=()=>{const b=state.budgets.find(y=>y.id===x.dataset.shareBudget),c=state.clients.find(y=>y.id===b?.clientId);if(b)shareDocument({title:'Presupuesto',text:`Presupuesto ${b.number} · ${c?.name||''} · Total ${money(Number(b.total)||0)}`,filename:`${b.number}.txt`})});app.querySelectorAll('[data-delete-budget]').forEach(x=>x.onclick=()=>{const b=state.budgets.find(y=>y.id===x.dataset.deleteBudget);if(b&&confirm(`¿Eliminar el presupuesto ${b.number}?`)){state.budgets=state.budgets.filter(y=>y.id!==b.id);save();renderBudgets()}})}
function openBudgetForm(id=''){const old=state.budgets.find(b=>b.id===id),b=old||{id:uid(),date:nowDate(),number:budgetNumber(nowDate()),clientId:'',concept:'',base:'',vat:'21',status:'BORRADOR',notes:''};const opts=['<option value="">Selecciona cliente</option>',...state.clients.map(c=>`<option value="${c.id}" ${c.id===b.clientId?'selected':''}>${esc(c.name)}</option>`)].join('');app.innerHTML=`<section class="hero"><div><h1>${old?'Editar presupuesto':'Añadir presupuesto'}</h1><p>Los presupuestos no consumen numeración de servicio hasta que se convierten en un trabajo aceptado.</p></div></section><section class="panel"><div class="settings-grid">${field('budNo','N.º presupuesto',b.number,'text','readonly class="readonly"')}${field('budDate','Fecha',b.date,'date')}<div class="field"><label>Cliente</label><select id="budClient">${opts}</select></div>${field('budConcept','Concepto',b.concept)}${field('budBase','Base imponible (€)',b.base,'text','inputmode="decimal"')}${field('budVat','IVA (%)',b.vat,'text','inputmode="decimal"')}${select('budStatus','Estado',['BORRADOR','ENVIADO','ACEPTADO','RECHAZADO'],b.status||'BORRADOR')}${textarea('budNotes','Observaciones',b.notes||'')}</div><div class="totals"><div class="total"><span>Base</span><strong id="budBaseOut">—</strong></div><div class="total"><span>IVA</span><strong id="budVatOut">—</strong></div><div class="total"><span>Total</span><strong id="budTotalOut">—</strong></div></div><div class="cert-actions"><button class="btn" id="budSave">Guardar presupuesto</button><button class="btn secondary" id="budCancel">Cancelar</button>${old?'<button class="btn blue" id="budPrint">Imprimir / PDF</button><button class="btn secondary" id="budShare">Compartir</button>':''}</div></section>`;const calc=()=>{const base=num($('#budBase').value)||0,vat=num($('#budVat').value)||0;$('#budBaseOut').textContent=money(base);$('#budVatOut').textContent=money(base*vat/100);$('#budTotalOut').textContent=money(base*(1+vat/100))};$('#budBase').oninput=calc;$('#budVat').oninput=calc;$('#budDate').onchange=()=>{if(!old)$('#budNo').value=budgetNumber($('#budDate').value)};calc();$('#budSave').onclick=()=>{const base=num($('#budBase').value)||0,vat=num($('#budVat').value)||0,obj={...b,number:$('#budNo').value,date:$('#budDate').value,clientId:$('#budClient').value,concept:$('#budConcept').value.trim(),base,vat,status:$('#budStatus').value,notes:$('#budNotes').value.trim(),total:base*(1+vat/100),updatedAt:new Date().toISOString()};if(old)state.budgets=state.budgets.map(x=>x.id===obj.id?obj:x);else state.budgets.push(obj);save();toast('Presupuesto guardado');renderBudgets()};$('#budCancel').onclick=renderBudgets;if($('#budPrint'))$('#budPrint').onclick=()=>printBudget(state.budgets.find(x=>x.id===b.id)||b);if($('#budShare'))$('#budShare').onclick=()=>{const x=state.budgets.find(x=>x.id===b.id)||b,c=state.clients.find(c=>c.id===x.clientId);shareDocument({title:'Presupuesto',text:`Presupuesto ${x.number} · ${c?.name||''} · Total ${money(Number(x.total)||0)}`,filename:`${x.number}.txt`})}}
function printBudget(b){if(!b)return;const c=state.clients.find(x=>x.id===b.clientId),base=Number(b.base)||0,vat=Number(b.vat)||0;printDoc('PRESUPUESTO',`${companyHeaderHtml()}<h2>${esc(c?.name||'Cliente')}</h2><p>${esc(c?.taxId||'')}<br>${esc([c?.address,c?.postalCode,c?.province].filter(Boolean).join(' · '))}</p><p><b>N.º:</b> ${esc(b.number)} · <b>Fecha:</b> ${esc(b.date)}</p><table><tr><th>Concepto</th><th>Base</th></tr><tr><td>${esc(b.concept||'Servicio')}</td><td>${money(base)}</td></tr></table><div class="tot"><p>Base: <b>${money(base)}</b></p><p>IVA ${vat}%: <b>${money(base*vat/100)}</b></p><p>Total: <b>${money(base*(1+vat/100))}</b></p></div>${b.notes?`<p class="note">${esc(b.notes)}</p>`:''}${companyValidationHtml()}`)}

printDoc=function(title,body){const c=state.company||{},w=window.open('','_blank');if(!w){alert('Permite ventanas emergentes para imprimir.');return}w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;color:#203129;font-size:11pt;background:#e9ecea;padding:24px}.a4-page{position:relative;width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:14mm;box-shadow:0 8px 28px rgba(0,0,0,.16);overflow:hidden}header{border-bottom:3px solid #0f7a49;padding-bottom:10px;margin-bottom:20px;display:flex;gap:12px;align-items:center}header img{max-width:100px;max-height:60px;object-fit:contain}h1{color:#0f7a49;margin:0;font-size:21pt}h2{color:#27543d}.meta{font-size:9pt;color:#64776d}.company-doc-head{display:flex;gap:12px;align-items:center;border:1px solid #d5e1db;border-radius:8px;padding:10px;margin:8px 0 18px}.company-doc-head img{max-width:100px;max-height:60px}.company-doc-head small{display:block;color:#64776d}.big{font-size:17pt;font-weight:800;border:1px solid #bdd5c7;padding:12px;border-radius:8px;background:#f3f8f5;margin:15px 0}.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:60px}.sign span{border-top:1px solid #777;padding-top:6px;text-align:center}.draft{position:absolute;right:20mm;top:35mm;font-size:30pt;color:#b44;opacity:.18;transform:rotate(-12deg);font-weight:900}table{width:100%;border-collapse:collapse;margin:15px 0}th,td{border:1px solid #ccc;padding:9px;text-align:left}.tot{text-align:right;font-size:12pt}.note{font-size:9pt;color:#5f6f67;border:1px solid #ddd;padding:10px;border-radius:8px}footer{margin-top:40px;border-top:1px solid #ccc;padding-top:8px;font-size:8pt;color:#666}.preview-actions{position:sticky;top:12px;z-index:2;display:flex;justify-content:center;gap:8px;margin-bottom:14px}.preview-actions button{border:0;border-radius:9px;padding:10px 14px;background:#0f7a49;color:#fff;font-weight:700;cursor:pointer}.preview-actions button.secondary{background:#fff;color:#0f7a49;border:1px solid #9fc7b0}@media(max-width:900px){body{padding:12px}.a4-page{width:100%;min-height:auto;padding:clamp(14px,4vw,32px);box-shadow:0 4px 18px rgba(0,0,0,.14)}h1{font-size:18pt}.sign{grid-template-columns:1fr;gap:18px;margin-top:36px}}@media print{body{background:#fff;padding:0}.preview-actions{display:none!important}.a4-page{width:210mm;min-height:297mm;margin:0;box-shadow:none;padding:14mm;overflow:visible}}</style></head><body><div class="preview-actions"><button onclick="window.print()">Imprimir / Guardar PDF</button><button class="secondary" onclick="window.close()">Cerrar</button></div><main class="a4-page"><header>${c.logo?`<img src="${c.logo}" alt="Logo">`:''}<div><h1>${esc(title)}</h1><div class="meta">${esc(c.commercialName||c.name||'Empresa')}${c.name&&c.commercialName?` · ${esc(c.name)}`:''}${c.taxId?` · ${esc(c.taxId)}`:''}${c.registration?` · ROESB ${esc(c.registration)}`:''}<br>${esc([c.address,c.postalCode,c.province].filter(Boolean).join(' · '))}</div></div></header>${body}<footer>Generado desde Mis Hojas de Servicio · Piloto v51</footer></main></body></html>`);w.document.close()};

if(window.MHSOffline){
 MHSOffline.loadState().then(saved=>{if(saved&&Array.isArray(saved.services)){const localStamp=Math.max(0,...(state.services||[]).map(x=>Date.parse(x.updatedAt)||0));const idbStamp=Math.max(0,...saved.services.map(x=>Date.parse(x.updatedAt)||0));if(idbStamp>localStamp){state=saved;try{db.set(state)}catch{};renderDashboard()}}}).catch(()=>{});
}
window.MHSApp={
 getState:()=>JSON.parse(JSON.stringify(state)),
 applyRemoteState:async(remote,{source='remote'}={})=>{
  if(!remote||!Array.isArray(remote.services))return false;
  state=remote;
  try{db.set(state)}catch(e){console.warn('No se pudo actualizar localStorage',e)}
  if(window.MHSOffline)await MHSOffline.saveState(state).catch(()=>{});
  renderDashboard();
  if(source==='cloudflare')toast('Datos actualizados desde Cloudflare');
  return true;
 }
};
window.dispatchEvent(new CustomEvent('mhs-app-ready'));
renderDashboard();
// v54 piloto: no importar automaticamente datos de otras versiones.

/* Integración controlada con las seis maquetas PDF de referencia aprobadas.
 * Las plantillas PDF originales no se modifican. Las imágenes aquí usadas son
 * copias de trabajo vaciadas de sus datos ficticios, nunca modelos rediseñados.
 */
const APPROVED_DOCS={
 autoclave:{sheet:'AUTOCLAVE_HOJA_SERVICIO_APROBADA.png',delivery:'AUTOCLAVE_ALBARAN_APROBADO.png',invoice:'AUTOCLAVE_FACTURA_APROBADA.png'},
 mobiliario:{sheet:'MOBILIARIO_HOJA_SERVICIO_REFERENCIA.png',delivery:'MOBILIARIO_ALBARAN_REFERENCIA.png',invoice:'MOBILIARIO_FACTURA_REFERENCIA.png'}
};
const apDate=d=>{let a=String(d||'').slice(0,10).split('-');return a.length===3&&a[0].length===4?`${a[2]}/${a[1]}/${a[0]}`:String(d||'')};
const apSafe=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const apMoney=v=>Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const ap4=v=>Number.isFinite(num(v))?fmt4(num(v)):'0,0000';
const apClient=s=>{const cat=(state.clients||[]).find(x=>String(x.name||'').trim().toLowerCase()===String(s.client?.name||'').trim().toLowerCase())||{};const own=s.client||{};return {...cat,...Object.fromEntries(Object.entries(own).filter(([k,v])=>String(v??'').trim()!=='')),name:own.name||cat.name||''}};
function apPreview(filename,fields,{title='',draft=false,media=[],readable=false,obsAnnex=null}={}){
 const el=(x,y,value,width=110,size=7,style='')=>{
  let v=String(value??'').trim();if(!v)return '';
  const desired=readable?Math.min(10,Math.max(8.3,size+1.8)):size;
  // Evitar que la negrita desborde su casilla cuando los datos sean largos.
  const fit=readable?Math.max(6.5,Math.min(desired,width/(Math.max(v.length,1)*0.56))):desired;
  return `<div class="ap-field" style="left:${(x/595.276*100).toFixed(5)}%;top:${(y/841.89*100).toFixed(5)}%;width:${(width/595.276*100).toFixed(5)}%;font-size:${fit.toFixed(2)}pt;${readable?'font-weight:700;':''}${style}">${apSafe(v)}</div>`;
 };
 const pages=(fields.length&&Array.isArray(fields[0])&&Array.isArray(fields[0][0]))?fields:[fields];
 const url=apSafe(new URL('approved-backgrounds/'+filename,location.href).href);
 const mediaImg=m=>{const inset=1.5;return `<img class="ap-media" alt="Fotografía del mueble" src="${m.src}" style="left:${((m.x+inset)/595.276*100).toFixed(5)}%;top:${((m.y+inset)/841.89*100).toFixed(5)}%;width:${((m.w-2*inset)/595.276*100).toFixed(5)}%;height:${((m.h-2*inset)/841.89*100).toFixed(5)}%">`};
 const content=pages.map((fs,pageIndex)=>`<main class="ap-sheet"><img class="ap-template" alt="Modelo aprobado" src="${url}">${fs.map(f=>el(...f)).join('')}${media.filter(m=>(m.page===undefined||m.page===pageIndex)&&/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(m.src||'')).map(mediaImg).join('')}${draft?'<div class="ap-watermark">BORRADOR</div>':''}</main>`).join('');
 const annexHtml=obsAnnex?`<main class="ap-sheet ap-annex"><div class="ap-annex-content"><h1>ANEXO · OBSERVACIONES Y PRODUCTO BIOCIDA</h1><p>Hoja ${apSafe(obsAnnex.number)}</p><h2>Observaciones</h2><div class="ap-annex-obs">${apSafe(obsAnnex.observations)}</div><h2>Información del producto biocida</h2><table><tbody><tr><th>Producto</th><td>${apSafe(obsAnnex.product)}</td></tr><tr><th>N.º de registro</th><td>${apSafe(obsAnnex.registration)}</td></tr><tr><th>Propiedad biocida</th><td>${apSafe(obsAnnex.properties)}</td></tr><tr><th>Materias activas</th><td>${apSafe(obsAnnex.actives)}</td></tr><tr><th>Nanomateriales</th><td>${apSafe(obsAnnex.nano)}</td></tr><tr><th>Instrucciones de uso</th><td>${apSafe(obsAnnex.instructions)}</td></tr></tbody></table></div></main>`:'';
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${apSafe(title)}</title><style>
 @page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}body{background:#d7dedb;padding:10px}
 .ap-sheet{width:min(210mm,100%);aspect-ratio:595.276/841.89;position:relative;margin:0 auto;background:white;box-shadow:0 4px 17px #0003;overflow:hidden}
 .ap-sheet+.ap-sheet{margin-top:12px}.ap-template{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}
 .ap-field{position:absolute;color:#101610;line-height:1.12;white-space:nowrap;overflow:hidden;font-weight:400}
 .ap-annex{height:auto;min-height:297mm;aspect-ratio:auto;overflow:visible}.ap-annex-content{padding:18mm 17mm;font-size:10pt;line-height:1.4;overflow-wrap:anywhere}.ap-annex-content h1{font-size:15pt;color:#192e43;margin:0 0 16px}.ap-annex-content h2{font-size:11pt;color:#192e43;margin:20px 0 8px}.ap-annex-obs{white-space:pre-wrap}.ap-annex table{border-collapse:collapse;width:100%;table-layout:fixed}.ap-annex th,.ap-annex td{border:1px solid #999;padding:8px;text-align:left;vertical-align:top}.ap-annex th{width:30%}
 .ap-media{position:absolute;object-fit:contain;object-position:center center;display:block;background:white;border:0}.ap-watermark{position:absolute;top:46%;left:25%;transform:rotate(-25deg);font-size:30pt;font-weight:800;color:#b22;opacity:.25}
 @media print{body{padding:0;background:white}.ap-sheet{width:210mm;height:297mm;box-shadow:none;break-after:page}.ap-sheet+.ap-sheet{margin-top:0}.ap-sheet:last-child{break-after:auto}.ap-template{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
 </style></head><body>${content}${annexHtml}</body></html>`;
 const old=document.getElementById('mhsApprovedOverlay');if(old)old.remove();
 const overlay=document.createElement('div');overlay.id='mhsApprovedOverlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Vista previa sobre diseño aprobado');overlay.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(10,25,18,.83);display:flex;flex-direction:column;gap:8px;padding:12px';
 const bar=document.createElement('div');bar.style.cssText='display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap';
 const msg=document.createElement('span');msg.textContent='Modelo aprobado · datos de la hoja';msg.style.cssText='color:white;margin-right:auto;font-weight:600';
 const btn=document.createElement('button');btn.className='btn blue';btn.textContent='Imprimir / Guardar PDF';btn.disabled=true;
 const close=document.createElement('button');close.className='btn secondary';close.textContent='Cerrar vista previa';
 const iframe=document.createElement('iframe');iframe.title='Documento con diseño aprobado';iframe.style.cssText='flex:1;min-height:0;width:100%;border:0;background:white;border-radius:6px';
 bar.append(msg,btn,close);overlay.append(bar,iframe);document.body.appendChild(overlay);
 iframe.onload=()=>{const images=[...iframe.contentDocument.images];const ready=images.every(i=>i.complete&&i.naturalWidth>0);btn.disabled=!ready;if(!ready)msg.textContent='Error al cargar la plantilla aprobada; no imprimir.'};iframe.srcdoc=html;
 btn.onclick=()=>{try{iframe.contentWindow.focus();iframe.contentWindow.print()}catch(err){alert('Error de impresión: '+err.message)}};
 close.onclick=()=>overlay.remove();overlay.addEventListener('keydown',e=>{if(e.key==='Escape')overlay.remove()});close.focus();
}
function apRows(s){const d=s.data||{};if(s.type==='autoclave')return (d.autoMeasurements||[]).filter(r=>Object.values(r||{}).some(v=>String(v??'').trim()));return Array.isArray(d.furnItems)?d.furnItems.filter(r=>r.concept||r.units||r.length||r.width||r.thickness).map(r=>({...r,condition:'',notes:''})):(d.furnDesc?[{concept:d.furnDesc,units:d.furnQty||1,condition:d.furnCondition||'',notes:d.furnObs||''}]:[])}
function apD(s,kind,forTransport=false){
 const type=s.type;const d=s.data||{},c=apClient(s),r=d.documentReceipt||{},t=d.transport||{};
 const fields=[];const add=(x,y,v,w=120,z=7,style='')=>fields.push([x,y,v,w,z,style]);
 const date=apDate(kind==='delivery'?(forTransport?(t.date||r.date||s.date):(r.date||t.date||s.date)):(r.date||s.date));const suggested=kind==='delivery'?(forTransport?(t.number||r.number):(r.number||t.number)):(r.number||s.number);const number=kind==='delivery'&&(!suggested||/^HS\s*\d/i.test(suggested))?serviceDocNo(s,'ALB'):(suggested||'');
 
 if(kind==='sheet'&&type==='autoclave'){
  add(497,74,number,63,7);add(487,96,date,67,7);
  add(125,176,c.name,120);add(294,176,c.taxId||c.cif,140);add(495,176,c.contact,67);
  add(68,193,c.address,160);add(327,194,[c.postalCode,c.province].filter(Boolean).join(' - '),145);
  add(64,210,c.phone,165);add(285,210,c.email,240);
  add(60,274,d.autoSpecies||'',78);add(215,274,d.autoMoisture||'',35);add(326,274,d.autoUseClass||'',35);
  const rows=apRows(s);
  rows.slice(0,4).forEach((row,i)=>{const y=316+i*18.1;let u=num(row.units??row.unidades),a=num(row.length??row.largo),b=num(row.width??row.ancho),g=num(row.thickness??row.grosor);const v=Number.isFinite(u*a*b*g)?fmt4(u*a*b*g):'';add(35,y,Number.isFinite(u)?String(u):'',33);add(99,y,Number.isFinite(a)?Number(a).toFixed(3).replace('.',','):'',49);add(164,y,Number.isFinite(b)?Number(b).toFixed(3).replace('.',','):'',49);add(228,y,Number.isFinite(g)?Number(g).toFixed(3).replace('.',','):'',50);add(288,y,v,52)});
  add(20,393,'VOLUMEN TOTAL TRATADO: '+ap4(d.checkedM3)+' m³',330,8.1,'font-weight:700');
  add(423,273,d.autoStartTime||'',55);add(452,290,d.autoEndTime||'',60);
  add(520,341,d.autoVacuumStart||'',43);add(520,356,d.autoVacuumConstant||'',43);add(529,371,d.autoVacuumSpray||'',35);add(529,386,d.autoVacuumReduction||'',35);add(529,400,d.autoDryTime||'',35);
  add(240,453,d.autoProduct||'',105);add(269,513,d.clientDeliveryNo||'',70);add(260,530,apDate(d.autoEntryDate||''),96);add(298,551,d.autoExitDeliveryNo||'',54);add(253,563,apDate(d.autoExitDate||''),86);
  add(17,619,d.mhsObsDefaultV1?'Observaciones y datos del biocida: ver anexo adjunto':(d.autoObs||s.notes||''),337,7);add(65,707,state.company?.directorName||'',145);add(90,730,state.company?.directorLicense||'',115);
 } else if(kind==='sheet'&&type==='mobiliario'){
  add(496,57,number,70);add(474,78,date,75);add(156,161,c.name,116);add(330,161,c.taxId,93);add(488,161,c.contact,95);add(84,180,c.address,183);add(369,180,[c.postalCode,c.province].filter(Boolean).join(' / '),188);add(80,200,c.phone,164);add(320,200,c.email,240);
  const rows=apRows(s);rows.slice(0,6).forEach((row,i)=>{const y=288+i*19;add(26,y,row.concept,172);add(213,y,row.units,36);add(256,y,row.condition,50);add(311,y,row.notes,83)});
  add(488,261,apDate(d.furnPickupDate),70);add(488,279,apDate(d.furnDeliveryDate),70);
  // Las únicas casillas del modelo son Desinsectación y Otros.
  // No imprimir marcas genéricas encima del encabezado TRATAMIENTO.
  const treat=String(d.furnTreatment||'').trim().toLowerCase();
  if(treat==='desinsectación'||treat==='desinsectacion')add(416,345,'X',9,7);
  else if(treat==='otros')add(416,369,'X',9,7);
  add(415,529,d.furnCondition||'',150);add(26,623,d.mhsObsDefaultV1?'Observaciones y datos del biocida: ver anexo adjunto':(d.furnObs||s.notes||''),540);add(89,706,state.company?.directorName||'',180);
  // Solo en los huecos de OBSERVACIONES del modelo aprobado; no se rediseña la hoja.
  const piece=rows[0];if(piece){const m3=autoVolume(piece);const dims=[piece.length,piece.width,piece.thickness].map(x=>String(x||'').trim()).join(' × ');
   add(26,636,'Medidas (largo × ancho × grosor): '+dims+' m | Volumen: '+(m3?autoFour(m3).replace('.',','):'—')+' m³',525,8.2);
   add(26,647,'Precio por unidad: '+(Number.isFinite(num(piece.price))?apMoney(num(piece.price))+' €':'Sin indicar')+' | Base total hoja: '+apMoney(furnMoneyBase(s.data))+' €',525,8.2);
  }
 } else if(kind==='delivery'&&type==='autoclave'){
  add(500,81,number,74);add(506,95,date,73);add(122,153,c.name,177);add(348,153,c.address,229);add(69,171,c.phone,101);add(226,171,c.email,178);add(452,171,c.contact,115);
  const rows=apRows(s);
  rows.slice(0,7).forEach((v,i)=>{const y=248+i*15.8;add(27,y,v.concept||'',112);add(148,y,v.units||'',30);add(186,y,v.length||'',43);add(234,y,v.width||'',43);add(285,y,v.thickness||'',38);add(339,y,d.autoMoisture||'',45);add(395,y,d.autoUseClass||'',55);add(456,y,v.notes||'',123,6.3)});
  add(275,375,'Tratamiento de madera en autoclave',270);add(323,389,d.autoStartTime||'',80);add(519,389,d.autoEndTime||'',55);add(311,406,d.autoProduct||'',165);add(333,422,d.autoUseClass||'',160);add(234,473,d.mhsObsDefaultV1?'Observaciones y datos del biocida: ver anexo adjunto':(d.autoObs||s.notes||r.notes||''),330);
  add(118,548,t.company||r.carrier||'',180);add(106,566,t.plate||r.plate||'',135);add(348,566,t.driver||r.receiver||'',165);add(53,583,t.driverId||'',115);
 } else if(kind==='delivery'&&type==='mobiliario'){
  add(467,86,number,108);add(496,99,date,75);add(147,159,c.name,189);add(403,159,c.address,174);add(80,179,c.phone,118);add(254,179,c.email,154);add(473,179,c.contact,99);
  apRows(s).slice(0,7).forEach((v,i)=>{const y=256+i*17.3;add(27,y,v.concept,220);add(270,y,v.units,55);add(331,y,v.condition,50);add(389,y,v.notes,183)});
  // Los valores comienzan después de las etiquetas impresas en el modelo aprobado.
  add(333,392,'Tratamiento de mobiliario',217,7.0);
  add(365,408,apDate(d.furnPickupDate),175,7.2);
  add(406,423,apDate(d.furnDeliveryDate),132,7.2);
  add(335,439,d.furnTreatment,208,7.2);
  add(264,489,d.mhsObsDefaultV1?'Observaciones y datos del biocida: ver anexo adjunto':(d.furnObs||s.notes||r.notes||''),298,7.2);
  // Albarán: conjunto de muebles, sin precios; los m³ son únicamente información logística.
  const volume=autoSum(apRows(s).map(autoVolume).filter(Boolean));
  add(264,507,'Volumen de los muebles de esta página: '+autoFour(volume).replace('.',',')+' m³',295,7.1);
  add(132,562,t.company||r.carrier||'',180);add(124,580,t.plate||r.plate||'',130);add(371,580,t.driver||r.receiver||'',186);
 }
 return fields;
}
function apInvoice(s,invoice=null,results=null){
 const d=s.data||{},type=s.type,c=(invoice?.clientId?(state.clients||[]).find(x=>x.id===invoice.clientId):null)||apClient(s),r=results||{};
 const pages=[],add=(fields,x,y,v,w=120,z=8)=>fields.push([x,y,v,w,z]);
 const invNo=invoice?.number||serviceDocNo(s,'FRA'),date=apDate(invoice?.date||s.date);
 const furniture=type==='mobiliario',bill=furniture?furnInvoiceTotals(d):null;
 const base=furniture?bill.base:(invoice?Number(invoice.base)||0:(Number(r.base)||(num(d.checkedM3)*num(d.autoPriceM3))||0));
 const vatPct=invoice?Number(invoice.vat)||0:21;
 const vatAmount=furniture?bill.vat:Math.round(base*vatPct)/100;
 const total=furniture?bill.total:base+vatAmount;
 const taxRates=furniture?[...new Set(bill.lines.map(x=>x.vat))]:[vatPct];
 const lines=furniture?bill.lines:[{concept:invoice?.concept||r.concept||'Tratamiento en autoclave',quantity:num(d.checkedM3)||1,unit:num(d.autoPriceM3)||0,discount:0,vat:vatPct,base,total}];
 const pageSize=10,totalPages=Math.max(1,Math.ceil(lines.length/pageSize));
 for(let p=0;p<totalPages;p++){
  const fields=[];pages.push(fields);
  add(fields,type==='autoclave'?495:460,74,invNo,111);add(fields,type==='autoclave'?499:468,type==='autoclave'?99:97,date,90);
  add(fields,120,189,c.name,170);add(fields,type==='autoclave'?60:54,207,c.taxId,165);add(fields,98,224,c.address,193);add(fields,108,242,c.postalCode,173);add(fields,95,259,c.province,181);
  add(fields,365,189,c.phone,200);add(fields,354,207,c.email,230);add(fields,433,224,c.contact,138);add(fields,399,242,c.paymentMethod||'',175);
  lines.slice(p*pageSize,(p+1)*pageSize).forEach((row,i)=>{
   const y=(furniture?342.75:347)+i*(193/9),first=p*pageSize+i;
   if(furniture){
    // A4: las líneas horizontales de la tabla están a 342,4, 364,0, 385,4... pt.
    // Todas las celdas de una misma fila usan EXACTAMENTE la misma caja vertical.
    const center='display:flex;align-items:center;height:2.42%;line-height:1.05;';
    const cell=(x,v,w,z)=>fields.push([x,y,v,w,z,center]);
    cell(28,serviceDocNo(s,'MOB')+'-'+(first+1),69,7.5);
    const description=`${row.concept||'Mueble'} (${[row.length,row.width,row.thickness].filter(x=>String(x??'').trim()).join(' × ')} m)`.replace(' ( m)','');
    cell(105,description,173,8.0);
    cell(285,row.quantity,52,8.3);cell(347,apMoney(row.unit),48,8.0);
    // Descuento e IVA: centrar valores DENTRO de sus columnas, con margen a ambos bordes.
    // Los límites de la plantilla son x=401..451 pt (Dto.) y x=451..494 pt (IVA).
    const numericCenter='display:flex;align-items:center;justify-content:center;text-align:center;height:2.42%;line-height:1.05;';
    fields.push([405,y,apMoney(row.discount),42,7.8,numericCenter]);
    fields.push([454,y,apMoney(row.vat),36,7.8,numericCenter]);
    cell(497,apMoney(row.total),69,8.0);
   }else{
    // Autoclave se conserva sin cambios.
    add(fields,27,y,serviceDocNo(s,'AUT'),76,7.7);
    add(fields,105,y,row.concept,174,8.2);
    add(fields,306,y,row.quantity,45,8.4);add(fields,376,y,apMoney(row.unit),49,8.1);
    add(fields,430,y,apMoney(row.discount),34,8);add(fields,467,y,apMoney(row.vat),36,8);
    add(fields,516,y,apMoney(row.total),59,8.2);
   }
  });
  if(p===totalPages-1){
   add(fields,27,603,invoice?.notes||d.autoObs||d.furnObs||s.notes||'',256,8);
   add(fields,500,583,apMoney(base)+' €',76,8.6);
   add(fields,304,654,taxRates.length===1?apMoney(taxRates[0])+' %':'Varios',53,8.1);
   add(fields,421,654,apMoney(base)+' €',60,8.1);
   add(fields,517,654,apMoney(vatAmount)+' €',60,8.1);
   add(fields,495,703,apMoney(total)+' €',79,9.2);
   const method=String(c.paymentMethod||'').trim();
   add(fields,76,725,method,175,8);
   add(fields,76,742,c.paymentTerms||'',140,8);
   if(method&&!/contado|efectivo|metálico|metalico/i.test(method)&&c.iban){
    const clean=String(c.iban).replace(/\s+/g,'');
    add(fields,132,760,'•••• •••• •••• '+clean.slice(-4),235,8);
   }
  }
  if(totalPages>1)add(fields,475,806,'Página '+(p+1)+' de '+totalPages,105,8);
 }
 apPreview(APPROVED_DOCS[type].invoice,pages.length===1?pages[0]:pages,{title:'Factura '+type,draft:!!invoice&&invoice.status!=='EMITIDA'||!invoice,readable:furniture});
}

function apMedia(s,kind,transport=false){
 const m=[],d=s.data||{},r=d.documentReceipt||{},t=d.transport||{};
 const photo=s.photos?.before||'';
 if(photo&&s.type==='autoclave')m.push({src:photo,x:kind==='sheet'?18:34,y:kind==='sheet'?455:382,w:kind==='sheet'?168:173,h:kind==='sheet'?116:118});
 if(s.type==='mobiliario'){
  if(kind==='sheet'){
   const rows=apRows(s);
   rows.forEach((row,i)=>{const pic=s.photos?.['furn_'+row.id];if(pic)m.push({src:pic,page:i,x:27,y:457,w:174,h:101})});
  }else if(kind==='delivery'&&s.photos?.furnGroup){
   m.push({src:s.photos.furnGroup,page:0,x:31,y:414,w:195,h:103}); // casilla interior de FOTOGRAFÍA DEL MOBILIARIO
  }
 }
 if(kind==='delivery'){
  const signature=transport?t.signature:r.signature;
  if(signature)m.push({src:signature,x:s.type==='autoclave'?37:31,y:s.type==='autoclave'?655:665,w:s.type==='autoclave'?235:230,h:65});
 }
 if(kind==='sheet'){
  const sig=state.company?.directorSignature;if(sig)m.push({src:sig,x:220,y:715,w:149,h:48});
 }
 return m;
}

// Divide todas las mediciones de Autoclave en copias sucesivas del mismo modelo aprobado.
// Nunca se omiten filas ni se modifica el original.
function apDocumentPages(s,kind,forTransport=false){
 const rows=apRows(s);
 if(s.type!=='autoclave'&&s.type!=='mobiliario'||!rows.length)return apD(s,kind,forTransport);
 if(s.type==='mobiliario'){
  const isSheet=kind==='sheet',perPage=isSheet?1:7,count=Math.ceil(rows.length/perPage),pages=[];
  for(let i=0;i<count;i++){
   const segment={...s,data:{...(s.data||{}),furnItems:rows.slice(i*perPage,(i+1)*perPage)}};
   const fields=apD(segment,kind,forTransport);
   if(isSheet){const line=fields.find(f=>String(f[2]).startsWith('Precio por unidad:'));if(line)line[2]=line[2].replace(/Base total hoja:.*$/, 'Base total hoja: '+apMoney(furnMoneyBase(s.data))+' €')}
   if(count>1)fields.push([462,806,`${isSheet?'Mueble':'Página'} ${i+1} de ${count}`,120,8,'font-weight:700']);
   pages.push(fields);
  }
  return pages.length===1?pages[0]:pages;
 }
 if(typeof autoVolume==='function'&&rows.some(row=>!autoVolume(row))){
   alert('Hay mediciones incompletas o no válidas. Corrige la tabla antes de generar el documento.');return null;
 }
 const limit=kind==='sheet'?4:7,count=Math.ceil(rows.length/limit),pages=[];
 for(let i=0;i<count;i++){
   const segment={...s,data:{...(s.data||{}),autoMeasurements:rows.slice(i*limit,(i+1)*limit)}};
   const fields=apD(segment,kind,forTransport);
   if(!fields)return null;
   if(count>1)fields.push([470,806,`Página ${i+1} de ${count}`,91,7]);
   pages.push(fields);
 }
 return pages.length===1?pages[0]:pages;
}
// Reutilizar exactamente los puntos de entrada existentes. Los demás módulos no se modifican.
const apLegacyPrintService=printServiceDocument;
printServiceDocument=function(s){
 if(!APPROVED_DOCS[s.type])return apLegacyPrintService(s);
 const r=s.data?.documentReceipt||{},kind=r.kind==='Albarán'?'delivery':'sheet';
 const fields=apDocumentPages(s,kind);if(fields)apPreview(APPROVED_DOCS[s.type][kind],fields,{title:kind==='sheet'?'Hoja de servicio aprobada':'Albarán aprobado',media:apMedia(s,kind),readable:s.type==='mobiliario',obsAnnex:mhsObsAnnex(s,kind)});
};
const apLegacyPrintTransport=printTransport;
printTransport=function(s){
 if(!APPROVED_DOCS[s.type])return apLegacyPrintTransport(s);
 const t=s.data?.transport||{};
 if(!t.receiver||!t.signDate||!t.signature){alert('El albarán necesita firma de recepción antes de imprimir.');return}
 const fields=apDocumentPages(s,'delivery',true);
 if(fields)apPreview(APPROVED_DOCS[s.type].delivery,fields,{title:'Albarán aprobado',media:apMedia(s,'delivery',true),readable:s.type==='mobiliario',obsAnnex:mhsObsAnnex(s,'delivery')});
};
const apLegacyPrintInvoice=printInvoice;
printInvoice=function(i){
 if(!i)return;
 const s=state.services.find(x=>x.id===i.serviceId);
 if(!s){alert('Para utilizar la factura aprobada, vincula primero la factura a su hoja de servicio. No se generará una factura con otro diseño.');return}
 if(!APPROVED_DOCS[s.type])return apLegacyPrintInvoice(i);
 apInvoice(s,i);
};
const apLegacyBillingPreview=printBillingPreview;
printBillingPreview=function(s,r){if(!APPROVED_DOCS[s.type])return apLegacyBillingPreview(s,r);apInvoice(s,null,r);};

})();