const SUPABASE_URL='https://hargvujvvhwmvodlbarh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_alaHLd7sOSjAWRzKWLjRHg_-igTTOx8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
async function syncSheetsWithSupabase(){
  const {data:{user},error:userError}=await supabaseClient.auth.getUser();
  if(userError)throw userError;
  if(!user)return [];

  // Supabase es la fuente principal de las hojas. Si una hoja se borra en otro
  // dispositivo, NO se vuelve a subir desde una copia local antigua.
  const {data:remoteRows,error}=await supabaseClient
    .from('service_sheets')
    .select('id,data,updated_at')
    .eq('user_id',user.id);

  if(error){
    console.error('Error cargando hojas desde Supabase:',error);
    throw error;
  }

  const remoteSheets=(remoteRows||[]).map(row=>row.data).filter(Boolean);
  const localOk=DB.set('sheets',remoteSheets);
  if(localOk===false)console.warn('No se pudieron guardar todas las hojas en localStorage; se mantiene la copia en memoria y Supabase sigue siendo la fuente principal.');
  return remoteSheets;
}
async function saveSheetToSupabase(sheet){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user)return;

  const {error}=await supabaseClient
    .from('service_sheets')
    .upsert({
      id:sheet.id,
      user_id:user.id,
      data:sheet,
      updated_at:new Date().toISOString()
    });

  if(error){console.error('Error guardando hoja en Supabase:',error);return false;}
  return true;
}
const $=s=>document.querySelector(s), app=document.querySelector('#app');
const DB={
  mem:Object.create(null),
  get(k,d=[]){
    if(Object.prototype.hasOwnProperty.call(this.mem,k))return this.mem[k];
    try{
      const raw=localStorage.getItem('mhs_'+k);
      if(raw===null)return d;
      const value=JSON.parse(raw)??d;
      this.mem[k]=value;
      return value;
    }catch(e){
      return d;
    }
  },
  set(k,v){
    this.mem[k]=v;
    try{
      localStorage.setItem('mhs_'+k,JSON.stringify(v));
      return true;
    }catch(e){
      if(e?.name==='QuotaExceededError'||/quota/i.test(String(e))){
        return false;
      }
      console.error('Error guardando datos locales:',e);
      return false;
    }
  }
};
let current=null,openBlock=null;
const types={autoclave:'AUTOCLAVE',insitu:'MADERA IN SITU',termitas:'TERMITAS',ddd:'DDD',mobiliario:'MOBILIARIO'};
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function showView(v,arg){if(v==='home')home();if(v==='new')newChooser();if(v==='sheets')sheetList();if(v==='clients')clientList();if(v==='products')productList();if(v==='certs')certs();if(v==='config')config();if(v==='edit')editSheet(arg)}
function home(){app.innerHTML=`<div class="home"><button class="newbtn" onclick="showView('new')">＋ NUEVA HOJA DE SERVICIO</button><div class="grid4">${nav('📋','HOJAS DE SERVICIO','Consultar, editar y gestionar',"showView('sheets')")}${nav('👥','CLIENTES','Fichero de clientes',"showView('clients')")}${nav('🧴','PRODUCTOS','Catálogo de productos',"showView('products')")}${nav('📄','CERTIFICADOS','Generar y consultar',"showView('certs')")}</div></div>`}
function nav(i,t,p,a){return `<div class="card navcard" onclick="${a}"><div class="ico">${i}</div><div><h2>${t}</h2><p>${p}</p></div></div>`}
function newChooser(){app.innerHTML=`<div class="chooser"><h1>Nueva hoja de servicio</h1><div class="services">${choice('🏭','AUTOCLAVE','Tratamiento de madera en autoclave','autoclave')}${choice('🪵','MADERA IN SITU','Tratamiento de madera in situ','insitu')}${choice('🐜','TERMITAS','Tratamiento de termitas','termitas')}${choice('🪳','DDD','Desinfección, desinsectación y desratización','ddd')}</div><p><button class="secondary" onclick="home()">← VOLVER</button></p></div>`}
function choice(i,t,p,k){return `<div class="card serviceChoice" onclick="newSheet('${k}')"><div class="ico">${i}</div><h2>${t}</h2><p>${p}</p></div>`}
function blank(type){let d=new Date().toISOString().slice(0,10);return {id:crypto.randomUUID(),type,number:'',date:d,start:'',end:'',status:'PENDIENTE',modified:d,client:{},data:{},products:[],attachments:[]}}
function newSheet(type){current=blank(type);editSheet()}
function field(id,label,val='',type='text',extra=''){return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val)}" ${extra}></div>`}
function texta(id,label,val=''){return `<div class="field full"><label>${label}</label><textarea id="${id}">${esc(val)}</textarea></div>`}
function acc(id,title,body){return `<section class="accordion"><div class="accHead" onclick="toggleAcc('${id}')"><span>${title}</span><span class="state" id="state_${id}">Pendiente</span><span>⌄</span></div><div class="accBody hidden" id="${id}">${body}<div class="rowactions"><button class="secondary" onclick="prevAcc('${id}')">← ANTERIOR</button><button onclick="nextAcc('${id}')">SIGUIENTE →</button></div></div></section>`}
function toggleAcc(id){document.querySelectorAll('.accBody').forEach(x=>x.classList.add('hidden'));if(openBlock===id){openBlock=null;return}$('#'+id).classList.remove('hidden');openBlock=id}
function accIds(){return [...document.querySelectorAll('.accBody')].map(x=>x.id)}function nextAcc(id){let a=accIds(),i=a.indexOf(id);if(i<a.length-1)toggleAcc(a[i+1])}function prevAcc(id){let a=accIds(),i=a.indexOf(id);if(i>0)toggleAcc(a[i-1])}
function editSheet(id){if(id)current=DB.get('sheets').find(x=>x.id===id);if(!current)return home();let c=current.client||{},d=current.data||{};app.innerHTML=`<div class="toolbar"><button class="secondary" onclick="saveSheet();showView('sheets')">← VOLVER</button><span class="spacer"></span>${current.number?'<button class="secondary" onclick="duplicateSheet()">DUPLICAR</button>':''}<button onclick="saveSheet()">GUARDAR</button><button onclick="finalizeSheet()">FINALIZAR</button><button class="secondary" onclick="printSheet()">HOJA PDF</button></div><div class="sheet"><div class="sheetmeta">${field('num','N.º de hoja *',current.number)}${field('date','Fecha *',current.date,'date')}${field('start','Hora inicio',current.start,'time')}${field('end','Hora fin',current.end,'time')}<div class="field"><label>Estado</label><div class="status">${current.status}</div></div></div>${commonClient(c)}${specific(current.type,d)}${acc('obs','OBSERVACIONES GENERALES',texta('observations','Observaciones',d.observations||''))}${acc('director','DIRECTOR TÉCNICO',`<div class="notice">Nombre y firma se insertarán desde Configuración.</div>`)}</div>`;openBlock=null}
function commonClient(c){return acc('client','CLIENTE',`<div class="formgrid">${field('cname','Nombre / Razón social *',c.name||'')}${field('contact','Persona de contacto *',c.contact||'')}${field('address','Dirección *',c.address||'')}${field('phone','Teléfono *',c.phone||'')}${field('email','Correo electrónico *',c.email||'','email')}<div class="full"><button class="secondary" onclick="pickClient()">🔍 BUSCAR CLIENTE GUARDADO</button> <button onclick="newClientModal()">＋ NUEVO CLIENTE</button></div></div>`)}
function checks(name,arr,selected=[]){return `<div class="checks">${arr.map(x=>`<label class="pill"><input type="checkbox" name="${name}" value="${x}" ${selected.includes(x)?'checked':''}>${x}</label>`).join('')}</div>`}
function radio(name,arr,selected=''){return `<div class="checks">${arr.map(x=>`<label class="pill"><input type="radio" name="${name}" value="${x}" ${selected===x?'checked':''}>${x}</label>`).join('')}</div>`}
function specific(t,d){if(t==='autoclave')return autoForm(d);if(t==='insitu')return insituForm(d);if(t==='termitas')return termiteForm(d);return dddForm(d)}
function autoForm(d){return acc('wood','MADERA',`<div class="formgrid">${field('species','Especie de madera *',d.species||'')}${field('humidity','Humedad antes del tratamiento (%) *',d.humidity||'','number','min="0" max="100" step="0.1"')}${field('useclass','Clase de uso *',d.useclass||'Clase de uso 3.1')}</div><div class="tablewrap"><table><thead><tr><th>Unidades</th><th>Largo (m)</th><th>Ancho (mm)</th><th>Grosor (mm)</th><th>Total (m³)</th></tr></thead><tbody>${[0,1,2,3,4].map(i=>`<tr><td><input class="smallinput" data-w="u${i}" type="number" min="1"></td><td><input class="smallinput" data-w="l${i}" type="number" min="0"></td><td><input class="smallinput" data-w="a${i}" type="number" min="0"></td><td><input class="smallinput" data-w="g${i}" type="number" min="0"></td><td>—</td></tr>`).join('')}</tbody></table></div>`) + acc('product','PRODUCTO',productPicker()) + acc('cycle','CICLO',`<div class="formgrid">${field('cycleNo','N.º ciclo/tratamiento',d.cycleNo||'')}${field('v1','Vacío inicial',d.v1||'')}${field('v2','Vacío constante',d.v2||'')}${field('p2','Pulverización 2',d.p2||'')}${field('pd','Pulverización decreciente',d.pd||'')}${field('dry','Secado',d.dry||'')}</div>`) + acc('delivery','ENTRADA Y SALIDA',`<div class="formgrid">${field('inDoc','Albarán entrada *',d.inDoc||'')}${field('inDate','Fecha entrada *',d.inDate||'','date')}${field('outDoc','Albarán salida/entrega *',d.outDoc||'')}${field('outDate','Fecha salida/entrega *',d.outDate||'','date')}</div>`)}
function productPicker(){return `<div class="notice">Los productos se seleccionarán del catálogo general. Se pueden crear sin salir de la hoja.</div><p><button onclick="pickProduct()">＋ AÑADIR PRODUCTO</button></p><div id="chosenProducts">${(current.products||[]).map(p=>`<div class="pill">${esc(p.name)}</div>`).join('')}</div>`}
function insituForm(d){return acc('treatment','TRATAMIENTO',`<label>Tipo de tratamiento *</label><div onchange="insituTreatChanged()">${checks('treat',['Pulverización','Inyección','Aplicación gel Air Less','Otro'],d.treat||[])}<div class="formgrid">${texta('zones','Elementos / Zonas tratadas *',d.zones||'')}${field('area','Superficie tratada (m²)',d.area||'','number')}${field('volume','Volumen tratado (m³)',d.volume||'','number')}<div class="field"><label>Ubicación</label>${radio('location',['Interior','Exterior','Interior y exterior'],d.location)}</div><div class="field"><label>Finalidad *</label>${radio('purpose',['Preventivo','Curativo','Preventivo y curativo'],d.purpose)}</div></div>`) + acc('product','PRODUCTOS',productPicker()) + acc('safety','PLAZO DE SEGURIDAD',safety(d)) + acc('docs','DOCUMENTACIÓN',attachments())}
function termiteForm(d){return acc('action','TIPO DE ACTUACIÓN',radio('termAction',['Instalación y tratamiento','Revisión','Tratamiento'],d.termAction)) + acc('system','SISTEMA DE TRATAMIENTO',`<div class="field"><label>Sistema *</label>${radio('termSystem',['Sistema de cebos','Barrera química','Otro'],d.termSystem)}</div>${texta('termZones','Zonas / elementos tratados o revisados *',d.termZones||'')}${field('installDate','Fecha de instalación inicial *',d.installDate||'','date')}${field('nextReview','Próxima revisión',d.nextReview||'','date')}<div class="safety">⚠ No manipular ni abrir las cajas. Solo autorizado al técnico competente.</div>`) + acc('stations','ESTACIONES (SISTEMA DE CEBOS)',stations()) + acc('product','PRODUCTOS',productPicker()) + acc('plan','PLANO / CROQUIS',attachments()) + acc('photos','DOCUMENTACIÓN FOTOGRÁFICA',attachments(true))}
function stations(){return `<div class="notice">Orden: primero Suelo (ES), después Pared (EP). Consumo: No · Poco · Medio · Alto.</div><p><button onclick="addStation('ES')">＋ ESTACIÓN ES</button> <button onclick="addStation('EP')">＋ ESTACIÓN EP</button></p><div id="stationsList">${(current.data.stations||[]).map(stationRow).join('')}</div>`}
function stationRow(s){return `<div class="card"><b>${s.code}</b> · ${s.type}<div class="formgrid"><div class="field"><label>Consumo</label><select><option>Sin seleccionar</option><option>No</option><option>Poco</option><option>Medio</option><option>Alto</option></select></div><div class="field"><label>Reposición</label><select><option>Sin seleccionar</option><option>Sí</option><option>No</option></select></div><div class="field"><label>Cantidad repuesta (g)</label><input type="number"></div><div class="field"><label>Observación</label><input></div></div></div>`}
function addStation(kind){current.data.stations=current.data.stations||[];let n=current.data.stations.filter(x=>x.kind===kind).length+1;current.data.stations.push({kind,type:kind==='ES'?'Suelo':'Pared',code:`${kind} ${String(n).padStart(2,'0')}`});editSheet()}
function dddForm(d){return acc('actions','ACTUACIONES',`<label>Tipo de actuación *</label>${checks('dddAction',['Desinfección','Desinsectación','Desratización'],d.dddAction||[])}<label>Plaga / Agente objetivo *</label>${checks('pest',['Cucarachas','Hormigas','Mosquitos','Moscas','Chinches','Pulgas','Roedores','Microorganismos','Otro'],d.pest||[])}<label>Método de aplicación *</label>${checks('method',['Pulverización','Nebulización','Gel','Cebos','Trampas','Portacebos','Otro'],d.method||[])}${texta('dddZones','Zonas / Áreas tratadas *',d.dddZones||'')}`)+acc('product','PRODUCTOS',productPicker())+acc('safety','PLAZO DE SEGURIDAD',safety(d))+acc('result','RESULTADO / VALORACIÓN',radio('result',['Satisfactorio','Requiere seguimiento','Otro'],d.result))+acc('docs','DOCUMENTACIÓN ADJUNTA',attachments())}
function safety(d){return `<div class="formgrid">${field('safetyQty','Cantidad',d.safetyQty||'','number')}<div class="field"><label>Unidad</label><select id="safetyUnit"><option>Horas</option><option>Días</option></select></div><label class="pill full"><input type="checkbox" id="noSafety"> SIN PLAZO DE SEGURIDAD</label><div class="notice full">Si se selecciona “Sin plazo”: Producto biocida. No tocar hasta su completo secado.</div></div>`}
function attachments(photos=false){return `<div class="actions"><button onclick="document.getElementById('attach').click()">📷 ${photos?'HACER / ELEGIR FOTO':'AÑADIR ARCHIVO'}</button><input id="attach" class="hidden" type="file" ${photos?'accept="image/*" capture="environment"':'accept="image/*,.pdf"'} multiple></div><p class="notice">Los adjuntos quedarán asociados a la hoja. En esta primera construcción ya está preparada la interfaz; el almacenamiento de archivos se completará en la siguiente iteración.</p>`}
function collect(){current.number=$('#num')?.value.trim()||'';current.date=$('#date')?.value||'';current.start=$('#start')?.value||'';current.end=$('#end')?.value||'';current.client={name:$('#cname')?.value||'',contact:$('#contact')?.value||'',address:$('#address')?.value||'',phone:$('#phone')?.value||'',email:$('#email')?.value||''};current.data.observations=$('#observations')?.value||'';document.querySelectorAll('input,textarea,select').forEach(el=>{if(el.id && !['num','date','start','end','cname','contact','address','phone','email','observations'].includes(el.id))current.data[el.id]=el.type==='checkbox'?el.checked:el.value});['treat','dddAction','pest','method'].forEach(n=>current.data[n]=[...document.querySelectorAll(`[name="${n}"]:checked`)].map(x=>x.value));['location','purpose','termAction','termSystem','result'].forEach(n=>{let x=document.querySelector(`[name="${n}"]:checked`);if(x)current.data[n]=x.value})}
function saveSheet(){collect();if(!current.number){alert('Introduce el N.º de hoja.');return false}let all=DB.get('sheets'),dup=all.find(x=>x.number.toLowerCase()===current.number.toLowerCase()&&x.id!==current.id);if(dup){alert('Este N.º de hoja ya existe. Introduce otro número.');return false}if(current.status==='PENDIENTE')current.status='EN PROCESO';current.modified=new Date().toISOString().slice(0,10);let i=all.findIndex(x=>x.id===current.id);if(i<0)all.unshift(current);else all[i]=current;DB.set('sheets',all);saveSheetToSupabase(current);$('#saveMsg').textContent='✓ Guardado automáticamente';setTimeout(()=>$('#saveMsg').textContent='',2200);return true}
function finalizeSheet(){collect();let miss=[];if(!current.number)miss.push('N.º de hoja');if(!current.date)miss.push('Fecha');let c=current.client;if(!c.name||!c.address||!c.contact||!c.phone||!c.email)miss.push('Datos completos del cliente');if(current.products.length<1 && ['termitas','ddd'].includes(current.type))miss.push('Al menos un producto');if(current.type==='ddd'){if(!(current.data.dddAction||[]).length)miss.push('Tipo de actuación');if(!(current.data.pest||[]).length)miss.push('Plaga/agente');if(!(current.data.method||[]).length)miss.push('Método de aplicación');if(!current.data.dddZones)miss.push('Zonas/áreas tratadas')}if(current.type==='termitas'){if(!current.data.termAction)miss.push('Tipo de actuación');if(!current.data.termSystem)miss.push('Sistema de tratamiento');if(!current.data.termZones)miss.push('Zonas tratadas/revisadas');if(!current.data.installDate)miss.push('Fecha de instalación inicial');if(current.data.termSystem==='Sistema de cebos'&&!(current.data.stations||[]).length)miss.push('Al menos una estación ES o EP')}if(miss.length){alert(`Faltan ${miss.length} campos/requisitos:\n• `+miss.join('\n• '));return}if(confirm('¿Quieres finalizar esta hoja de servicio? La hoja seguirá pudiendo editarse posteriormente.')){current.status='FINALIZADA';saveSheet();editSheet();alert('Hoja finalizada correctamente.')}}
function duplicateSheet(){let n=blank(current.type);n.client={...current.client};current=n;editSheet()}
function sheetList(){let a=DB.get('sheets');app.innerHTML=`<div class="list"><div class="listhead"><button onclick="showView('new')">＋ NUEVA HOJA</button><input id="search" placeholder="Buscar por N.º, cliente o fecha" oninput="renderSheetRows()"><button class="secondary" onclick="home()">← INICIO</button></div><div class="card"><table><thead><tr><th>N.º hoja</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Estado</th></tr></thead><tbody id="sheetRows"></tbody></table></div></div>`;renderSheetRows()}
function renderSheetRows(){let q=($('#search')?.value||'').toLowerCase();let a=DB.get('sheets').filter(x=>`${x.number} ${x.date} ${x.client?.name||''}`.toLowerCase().includes(q));$('#sheetRows').innerHTML=a.map(x=>`<tr><td onclick="showView('edit','${x.id}')" style="cursor:pointer"><b>${esc(x.number)}</b></td><td onclick="showView('edit','${x.id}')" style="cursor:pointer">${esc(x.date)}</td><td onclick="showView('edit','${x.id}')" style="cursor:pointer">${esc(x.client?.name||'')}</td><td onclick="showView('edit','${x.id}')" style="cursor:pointer">${types[x.type]}</td><td><span class="badge">${x.status}</span> <button type="button" class="danger" style="padding:7px 10px;min-height:36px" onclick="deleteServiceSheet('${x.id}')">ELIMINAR</button></td></tr>`).join('')||'<tr><td colspan="5">No hay hojas guardadas.</td></tr>'}
async function deleteServiceSheet(id){
  const sheet=(DB.get('sheets')||[]).find(x=>x.id===id);if(!sheet)return;
  const label=sheet.number||'(sin número)';
  if(!confirm(`¿Eliminar definitivamente la hoja ${label} de ${sheet.client?.name||'este cliente'}? Esta acción no se puede deshacer.`))return;
  if(!confirm('Se eliminará la hoja de este dispositivo y de Supabase. Los archivos adjuntos asociados también se intentarán eliminar. ¿Continuar?'))return;
  try{
    const {data:{user},error:authError}=await supabaseClient.auth.getUser();if(authError)throw authError;if(!user)throw new Error('No hay sesión iniciada.');
    const {data:deletedRows,error}=await supabaseClient.from('service_sheets').delete().eq('id',id).eq('user_id',user.id).select('id');
    if(error)throw error;
    if(!(deletedRows||[]).some(row=>row.id===id))throw new Error('Supabase no confirmó el borrado de esta hoja. Revisa la política DELETE de service_sheets.');
    const ids=new Set();
    const addList=list=>{if(Array.isArray(list))for(const item of list){if(item&&item.id)ids.add(String(item.id));}};
    addList(sheet.attachments);addList(sheet.data?.attachments);addList(sheet.data?.cycleAttachments);addList(sheet.data?.planAttachments);addList(sheet.data?.photoAttachments);
    for(const r of (sheet.data?.furnitureRows||[]))if(r?.photo?.id)ids.add(String(r.photo.id));
    for(const idFile of ids){
      try{const {error:storageError}=await supabaseClient.storage.from('adjuntos').remove([`${user.id}/${idFile}`]);if(storageError)console.warn('No se pudo borrar el adjunto remoto',idFile,storageError);await delFile(idFile);}catch(fileErr){console.warn('No se pudo limpiar un adjunto local/remoto',idFile,fileErr)}
    }
    DB.set('sheets',(DB.get('sheets')||[]).filter(x=>x.id!==id));
    if(current?.id===id)current=null;
    alert(`Hoja ${label} eliminada.`);renderSheetRows();
  }catch(e){console.error('Error eliminando hoja:',e);alert('No se ha podido confirmar el borrado en Supabase. La hoja se conserva en el dispositivo. Comprueba la conexión y los permisos e inténtalo de nuevo.');}
}
function clientList(){let a=DB.get('clients');app.innerHTML=`<div class="list"><div class="listhead"><button onclick="newClientModal()">＋ NUEVO CLIENTE</button><span class="spacer"></span><button class="secondary" onclick="home()">← INICIO</button></div><div class="card"><table><thead><tr><th>Nombre / Razón social</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th></tr></thead><tbody>${a.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.contact)}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td><td>Activo</td></tr>`).join('')||'<tr><td colspan="5">No hay clientes.</td></tr>'}</tbody></table></div></div>`}
function newClientModal(){modal(`<h2>Nuevo cliente</h2><div class="formgrid">${field('mn','Nombre / Razón social *')}${field('mc','Persona de contacto *')}${field('ma','Dirección *')}${field('mp','Teléfono *')}${field('me','Correo electrónico *','','email')}</div><div class="rowactions"><button class="secondary" onclick="closeModal()">CANCELAR</button><button onclick="saveClientModal()">GUARDAR CLIENTE</button></div>`)}
function saveClientModal(){let c={id:crypto.randomUUID(),name:$('#mn').value,contact:$('#mc').value,address:$('#ma').value,phone:$('#mp').value,email:$('#me').value};if(Object.values(c).slice(1).some(x=>!x)){alert('Completa todos los datos del cliente.');return}let a=DB.get('clients');a.push(c);DB.set('clients',a);if(current){current.client={...c};delete current.client.id}closeModal();current?editSheet():clientList()}
function pickClient(){let a=DB.get('clients');modal(`<h2>Seleccionar cliente</h2>${a.map(c=>`<div class="card" onclick="useClient('${c.id}')" style="cursor:pointer"><b>${esc(c.name)}</b><br>${esc(c.address)}</div>`).join('')||'<p>No hay clientes guardados.</p>'}<div class="rowactions"><button class="secondary" onclick="closeModal()">CERRAR</button></div>`)}function useClient(id){let c=DB.get('clients').find(x=>x.id===id);current.client={...c};delete current.client.id;closeModal();editSheet()}
function productList(){let a=DB.get('products');app.innerHTML=`<div class="list"><div class="listhead"><button onclick="newProductModal()">＋ NUEVO PRODUCTO</button><span class="spacer"></span><button class="secondary" onclick="home()">← INICIO</button></div><div class="notice">Eliminar un producto lo quita del catálogo para futuras hojas. Las hojas ya guardadas conservan su copia histórica.</div><div class="card"><table><thead><tr><th>Nombre comercial</th><th>Fabricante</th><th>N.º registro</th><th>Caducidad</th><th>Acciones</th></tr></thead><tbody>${a.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.maker)}</td><td>${esc(p.reg)}</td><td>${esc(p.expiry)}</td><td><button type="button" class="danger" style="padding:7px 10px;min-height:36px" onclick="deleteCatalogProduct('${p.id}')">ELIMINAR</button></td></tr>`).join('')||'<tr><td colspan="5">No hay productos.</td></tr>'}</tbody></table></div></div>`}
function deleteCatalogProduct(id){const products=DB.get('products')||[];const p=products.find(x=>x.id===id);if(!p)return;if(!confirm(`¿Eliminar “${p.name}” del catálogo de productos?`))return;if(!confirm('Las hojas existentes conservarán los datos del producto, pero ya no aparecerá para nuevas hojas. ¿Continuar?'))return;DB.set('products',products.filter(x=>x.id!==id));productList();}
function newProductModal(){modal(`<h2>Nuevo producto</h2><div class="formgrid">${field('pn','Nombre comercial *')}${field('pm','Fabricante *')}${field('pr','N.º registro/autorización *')}${field('pa','Materia activa/composición *')}${field('pe','Fecha de caducidad *','','date')}</div><div class="rowactions"><button class="secondary" onclick="closeModal()">CANCELAR</button><button onclick="saveProductModal()">GUARDAR PRODUCTO</button></div>`)}
function saveProductModal(){let p={id:crypto.randomUUID(),name:$('#pn').value,maker:$('#pm').value,reg:$('#pr').value,active:$('#pa').value,expiry:$('#pe').value};if(Object.values(p).slice(1).some(x=>!x)){alert('Completa los cinco datos del producto.');return}let a=DB.get('products');a.push(p);DB.set('products',a);closeModal();current?pickProduct():productList()}
function pickProduct(){let a=DB.get('products');modal(`<h2>Añadir producto</h2>${a.map(p=>`<div class="card" onclick="useProduct('${p.id}')" style="cursor:pointer"><b>${esc(p.name)}</b><br>${esc(p.maker)} · ${esc(p.reg)}</div>`).join('')||'<p>No hay productos. Crea el primero.</p>'}<p><button onclick="newProductModal()">＋ NUEVO PRODUCTO</button></p><div class="rowactions"><button class="secondary" onclick="closeModal()">CERRAR</button></div>`)}function useProduct(id){let p=DB.get('products').find(x=>x.id===id);if(p&&!current.products.some(x=>x.id===id))current.products.push(p);closeModal();editSheet()}
function config(){let c=DB.get('config',{});app.innerHTML=`<div class="list"><h1>Configuración</h1><div class="card"><h2>Empresa</h2><div class="formgrid">${field('coName','Nombre / Razón social *',c.name||'')}${field('roesb','ROESB *',c.roesb||'')}${field('coAddr','Dirección *',c.address||'')}${field('coPhone','Teléfono *',c.phone||'')}${field('coEmail','Correo electrónico *',c.email||'','email')}</div><h2>Director Técnico</h2><div class="formgrid">${field('directorName','Nombre y apellidos *',c.director||'')}<div class="notice">La firma guardada se incorporará en una fase posterior.</div></div><div class="rowactions"><button class="secondary" onclick="home()">← VOLVER</button><button onclick="saveConfig()">GUARDAR</button></div></div></div>`}
function saveConfigLegacy(){DB.set('config',{name:$('#coName').value,roesb:$('#roesb').value,address:$('#coAddr').value,phone:$('#coPhone').value,email:$('#coEmail').value,director:$('#directorName').value});alert('Configuración guardada.');home()}
function certs(){app.innerHTML=`<div class="list"><div class="card"><h1>Certificados</h1><p>Este módulo queda preparado para AUTOCLAVE, MADERA IN SITU y DDD. TERMITAS no genera certificado.</p><button class="secondary" onclick="home()">← VOLVER</button></div></div>`}
function printSheet(){if(!saveSheet())return;openPdfPreview(current)}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden')}function closeModal(){$('#modal').classList.add('hidden')}
supabaseClient.auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY') setTimeout(()=>passwordRecoveryView(),0);
});if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});startApp();


// ===== PDF A4 HORIZONTAL - UNA SOLA PAGINA =====
function pdfText(v, fallback='—'){v=(v??'').toString().trim();return v?esc(v):fallback}
function pdfDate(v){if(!v)return '—';let a=v.split('-');return a.length===3?`${a[2]}/${a[1]}/${a[0]}`:esc(v)}
function pdfJoin(a){return Array.isArray(a)&&a.length?a.map(esc).join(', '):'—'}
function pdfProductName(p){return esc(p?.name||'')}
function pdfFileNames(list){return (list||[]).map(x=>esc(x.name||x.fileName||'Archivo')).join(' · ')||'—'}
function pdfBaseCss(){return `
@page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#172a22;font-family:Arial,Helvetica,sans-serif}body{width:287mm;height:200mm;overflow:hidden}.page{width:287mm;height:200mm;padding:0;overflow:hidden;position:relative;font-size:8.1pt;line-height:1.14}.head{display:grid;grid-template-columns:52mm 1fr 48mm;gap:3mm;align-items:center;border-bottom:2px solid #118b50;padding-bottom:2mm;margin-bottom:2mm}.logo{height:13mm;max-width:48mm;object-fit:contain}.co{font-size:7.2pt;line-height:1.18}.title{text-align:center;font-size:14pt;font-weight:800;color:#0b6d40}.meta{text-align:right;font-size:8pt}.draft{position:absolute;top:8mm;right:84mm;border:2px solid #c33;color:#c33;padding:1mm 3mm;font-weight:900;transform:rotate(-7deg);font-size:12pt;background:#fff}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:2mm}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2mm}.box{border:1px solid #b9cbc1;border-radius:2mm;padding:1.8mm;margin-bottom:1.8mm;overflow:hidden}.box h2{font-size:8.5pt;color:#08723f;margin:0 0 1mm;text-transform:uppercase}.kv{display:grid;grid-template-columns:max-content 1fr;gap:.5mm 1.5mm}.k{font-weight:700;color:#355248}.v{min-width:0}.client{display:grid;grid-template-columns:1.4fr 1.7fr 1fr 1fr;gap:1mm 3mm}.client .wide{grid-column:span 2}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #c8d6cf;padding:.8mm 1mm;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf4ee;color:#145d3b;font-weight:800}.small{font-size:7pt}.tiny{font-size:6.5pt}.strong{font-weight:800}.notice{border:1px solid #d3aa3b;background:#fff6d9;padding:1.3mm;border-radius:1.5mm;font-weight:800}.sign{height:18mm;display:flex;align-items:flex-end;gap:3mm}.sign img{max-height:16mm;max-width:45mm}.footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #b9cbc1;padding-top:1mm;font-size:6.5pt;color:#587066}.nowrap{white-space:nowrap}.cut{max-height:11mm;overflow:hidden}.attach{font-size:6.7pt}.cols{columns:2;column-gap:4mm}.badge{display:inline-block;padding:.5mm 1.5mm;border:1px solid #9dbca9;border-radius:5mm}.mt{margin-top:1mm}`}
function pdfCompany(){let c=DB.get('config',{});return {name:c.name||'Empresa',address:c.address||'',phone:c.phone||'',email:c.email||'',roesb:c.roesb||'',director:c.director||'',signature:c.signature||''}}
function pdfHeader(s,title){let c=pdfCompany();return `<div class="head"><div><img class="logo" src="logo.jpeg"><div class="co"><b>${pdfText(c.name,'')}</b><br>${pdfText(c.address,'')}<br>${pdfText(c.phone,'')} · ${pdfText(c.email,'')}<br><b>ROESB:</b> ${pdfText(c.roesb,'')}</div></div><div class="title">${title}</div><div class="meta"><b>N.º hoja:</b> ${pdfText(s.number)}<br><b>Fecha:</b> ${pdfDate(s.date)}</div></div>${s.status!=='FINALIZADA'?'<div class="draft">BORRADOR</div>':''}`}
function pdfClient(s){let c=s.client||{};return `<div class="box"><h2>Cliente</h2><div class="client"><div><b>Nombre/Razón social:</b> ${pdfText(c.name)}</div><div class="wide"><b>Dirección:</b> ${pdfText(c.address)}</div><div><b>Contacto:</b> ${pdfText(c.contact)}</div><div><b>Teléfono:</b> ${pdfText(c.phone)}</div><div><b>Correo:</b> ${pdfText(c.email)}</div></div></div>`}
function pdfDirector(){let c=pdfCompany();return `<div class="box" style="break-inside:avoid;page-break-inside:avoid"><h2>Director Técnico</h2><div class="sign"><div><b>${pdfText(c.director)}</b></div>${c.signature?`<img src="${c.signature}">`:''}</div></div>`}
function pdfAttachments(s,kind='Documentación adjunta'){let a=s.attachments||[];let photos=a.filter(x=>(x.type||'').startsWith('image')).length,pdfs=a.filter(x=>(x.type||'').includes('pdf')).length;return `<div class="box attach"><h2>${kind}</h2><b>${kind}:</b> ${a.length?`Sí (${a.length} archivos: ${photos} fotos y ${pdfs} PDF)`:'No (0 archivos)'}${a.length?`<br><b>Archivos:</b> ${pdfFileNames(a)}`:''}</div>`}
function woodRows(s){let rows=s.data?.woodRows||[];if(!rows.length){for(let i=0;i<5;i++){let u=s.data?.[`u${i}`],l=s.data?.[`l${i}`],a=s.data?.[`a${i}`],g=s.data?.[`g${i}`];if(u||l||a||g)rows.push({u,l,a,g})}}let calc=r=>{let u=parseFloat(r.u),l=parseFloat(r.l),a=parseFloat(r.a),g=parseFloat(r.g);return [u,l,a,g].every(Number.isFinite)?u*l*(a/1000)*(g/1000):null};let total=rows.reduce((z,r)=>z+(calc(r)||0),0);let first=rows.slice(0,5);while(first.length<5)first.push({});return {rows:first,total,more:rows.length>5,calc}}
function pdfAutoclave(s){let d=s.data||{},w=woodRows(s),p=s.products?.[0];return `${pdfHeader(s,'HOJA DE SERVICIO - TRATAMIENTO DE MADERA EN AUTOCLAVE')}${pdfClient(s)}<div class="grid2"><div><div class="box"><h2>Madera</h2><div class="grid3"><div><b>Especie:</b> ${pdfText(d.species)}</div><div><b>Humedad antes:</b> ${pdfText(d.humidity)}${d.humidity?' %':''}</div><div><b>Clase de uso:</b> ${pdfText(d.useclass)}</div></div><table class="small mt"><thead><tr><th>Unidades</th><th>Largo (m)</th><th>Ancho (mm)</th><th>Grosor (mm)</th><th>Total (m³)</th></tr></thead><tbody>${w.rows.map(r=>`<tr><td>${pdfText(r.u,'')}</td><td>${pdfText(r.l,'')}</td><td>${pdfText(r.a,'')}</td><td>${pdfText(r.g,'')}</td><td>${w.calc(r)!=null?w.calc(r).toFixed(4).replace('.',','):''}</td></tr>`).join('')}</tbody></table>${w.more?'<div class="tiny">Existen líneas adicionales registradas digitalmente.</div>':''}<div class="strong mt">VOLUMEN TOTAL TRATADO: ${w.total.toFixed(4).replace('.',',')} m³</div></div><div class="box"><h2>Producto protector</h2><b>Producto:</b> ${p?pdfProductName(p):'—'}</div><div class="box"><h2>Entrada y salida de madera</h2><div class="grid2"><div><b>Albarán entrada:</b> ${pdfText(d.inDoc)}<br><b>Fecha entrada:</b> ${pdfDate(d.inDate)}</div><div><b>Albarán salida/entrega:</b> ${pdfText(d.outDoc)}<br><b>Fecha salida/entrega:</b> ${pdfDate(d.outDate)}</div></div></div></div><div><div class="box"><h2>Servicio</h2><b>Hora inicio:</b> ${pdfText(s.start)} &nbsp;&nbsp; <b>Hora finalización:</b> ${pdfText(s.end)}</div>${pdfAttachments(s,'Documentación del ciclo adjunta')}<div class="box cut"><h2>Observaciones</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
function pdfInsitu(s){let d=s.data||{};let prods=s.products||[];let pest=d.pest||d.insituPest||[];let safety=d.noSafety===true||d.noSafety==='true'?'<b>SIN PLAZO DE SEGURIDAD</b><br>Producto biocida. No tocar hasta su completo secado.':`${pdfText(d.safetyQty)} ${pdfText(d.safetyUnit,'')}`;return `${pdfHeader(s,'HOJA DE SERVICIO - TRATAMIENTO DE MADERA IN SITU')}${pdfClient(s)}<div class="grid2"><div><div class="box"><h2>Tratamiento</h2><b>Tipo:</b> ${pdfJoin(d.treat)}<br><b>Elementos / Zonas tratadas:</b> ${pdfText(d.zones)}<br><b>Superficie tratada:</b> ${d.area?pdfText(d.area)+' m²':'—'} &nbsp; <b>Volumen tratado:</b> ${d.volume?pdfText(d.volume)+' m³':'—'}<br><b>Ubicación:</b> ${pdfText(d.location)} &nbsp; <b>Finalidad:</b> ${pdfText(d.purpose)}<br><b>Plaga / Agente objetivo:</b> ${pdfJoin(pest)}${d.budget?`<br><b>Según presupuesto:</b> ${pdfText(d.budget)}`:''}${d.treatmentStart||d.treatmentEnd?`<br><b>Inicio tratamiento:</b> ${pdfDate(d.treatmentStart)} &nbsp; <b>Finalización:</b> ${pdfDate(d.treatmentEnd)}`:''}</div><div class="box"><h2>Productos</h2>${prods.length?prods.map(p=>`<div><b>${pdfProductName(p)}</b>${p.treatments?.length?' - '+pdfJoin(p.treatments):''}${p.lot?' · Lote: '+pdfText(p.lot):''}${p.qty?' · '+pdfText(p.qty)+' L':''}</div>`).join(''):'—'}</div><div class="box"><h2>Plazo de seguridad</h2>${safety}</div></div><div>${pdfAttachments(s,'Documentación adjunta')}<div class="box cut"><h2>Observaciones</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
function pdfTermitas(s){let d=s.data||{},sts=(d.stations||[]).slice().sort((a,b)=>(a.kind==='ES'?0:1)-(b.kind==='ES'?0:1)||String(a.code).localeCompare(String(b.code))),show=sts.slice(0,10),es=sts.filter(x=>x.kind==='ES').length,ep=sts.filter(x=>x.kind==='EP').length;let p=s.products||[];return `${pdfHeader(s,'HOJA DE SERVICIO - TRATAMIENTO DE TERMITAS')}${pdfClient(s)}<div class="grid2"><div><div class="box"><h2>Actuación</h2><b>Tipo:</b> ${pdfText(d.termAction)}<br><b>Sistema:</b> ${pdfText(d.termSystem)}${d.termSystem==='Otro'&&d.otherSystem?` - ${pdfText(d.otherSystem)}`:''}<br><b>Zonas / elementos tratados o revisados:</b> ${pdfText(d.termZones)}<br><b>Fecha de instalación inicial:</b> ${pdfDate(d.installDate)}${d.nextReview?` &nbsp; <b>Próxima revisión:</b> ${pdfDate(d.nextReview)}`:''}${d.termSystem==='Barrera química'?`<br><b>Metros lineales tratados:</b> ${pdfText(d.linearMeters)} m`:''}</div>${d.termSystem==='Sistema de cebos'?`<div class="box"><h2>Estaciones</h2><div class="small"><b>Suelo (ES):</b> ${es} &nbsp; <b>Pared (EP):</b> ${ep} &nbsp; <b>Total:</b> ${sts.length}</div><table class="tiny"><thead><tr><th>Código</th><th>Tipo</th><th>Consumo</th><th>Reposición</th><th>Cant. (g)</th><th>Observación</th></tr></thead><tbody>${show.map(x=>`<tr><td>${pdfText(x.code,'')}</td><td>${pdfText(x.type,'')}</td><td>${pdfText(x.consumption,'')}</td><td>${pdfText(x.replacement,'')}</td><td>${pdfText(x.grams,'')}</td><td>${pdfText(x.observation,'')}</td></tr>`).join('')}</tbody></table>${sts.length>10?'<div class="tiny">Existen estaciones adicionales registradas digitalmente.</div>':''}</div>`:''}<div class="notice">No manipular ni abrir las cajas. Solo autorizado al técnico competente.</div></div><div><div class="box"><h2>Productos utilizados</h2>${p.length?p.map(x=>`<div>${pdfProductName(x)}</div>`).join(''):'—'}</div>${(()=>{let a=d.planAttachments||[],img=a.find(x=>x.pdfData);return img?`<div class="box attach"><h2>Plano / croquis de estaciones</h2><img src="${img.pdfData}" style="display:block;max-width:100%;max-height:48mm;width:auto;height:auto;object-fit:contain;margin:auto"></div>`:pdfAttachments({attachments:a},'Plano/croquis de estaciones adjunto')})()}${(()=>{let a=d.photoAttachments||s.attachments||[];return a.length?`<div class="box attach"><h2>Documentación fotográfica</h2>${a.map(x=>x.pdfData?`<div style="margin:2mm 0;text-align:center;break-inside:avoid;page-break-inside:avoid"><img src="${x.pdfData}" style="display:block;max-width:46%;max-height:32mm;width:auto;height:auto;object-fit:contain;margin:auto"></div>`:`<div>${pdfText(x.name,'Foto no disponible')}</div>`).join('')}</div>`:pdfAttachments({attachments:a},'Documentación fotográfica adjunta')})()}<div class="box cut"><h2>Observaciones generales</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
function dddAssociations(d){let acts=d.dddDetails||[];if(acts.length)return acts.map(a=>`<tr><td>${pdfText(a.action,'')}</td><td>${pdfJoin(a.pests)}</td><td>${pdfJoin(a.methods)}</td><td>${pdfText(a.zones,'')}</td></tr>`).join('');return `<tr><td>${pdfJoin(d.dddAction)}</td><td>${pdfJoin(d.pest)}</td><td>${pdfJoin(d.method)}</td><td>${pdfText(d.dddZones)}</td></tr>`}
function pdfDDD(s){let d=s.data||{},p=s.products||[];let safety=d.noSafety===true||d.noSafety==='true'?'<b>SIN PLAZO DE SEGURIDAD</b><br>Producto biocida. No tocar hasta su completo secado.':`${pdfText(d.safetyQty)} ${pdfText(d.safetyUnit,'')}`;return `${pdfHeader(s,'HOJA DE SERVICIO - DDD (DESINFECCIÓN, DESINSECTACIÓN Y DESRATIZACIÓN)')}<div class="box"><b>Hora inicio:</b> ${pdfText(s.start)} &nbsp;&nbsp; <b>Hora fin:</b> ${pdfText(s.end)}</div>${pdfClient(s)}<div class="box"><h2>Actuaciones, plagas, métodos y zonas</h2><table class="small"><thead><tr><th>Actuación</th><th>Plaga / Agente</th><th>Método de aplicación</th><th>Zonas / Áreas tratadas</th></tr></thead><tbody>${dddAssociations(d)}</tbody></table></div><div class="grid2"><div><div class="box"><h2>Productos utilizados</h2><table class="tiny"><thead><tr><th>Nombre comercial</th><th>N.º registro/autorización</th><th>N.º lote</th><th>Cantidad utilizada</th><th>Actuación asociada</th></tr></thead><tbody>${p.length?p.map(x=>`<tr><td>${pdfProductName(x)}</td><td>${pdfText(x.reg,'')}</td><td>${pdfText(x.lot,'')}</td><td>${pdfText(x.qty,'')}</td><td>${pdfJoin(x.actions)}</td></tr>`).join(''):'<tr><td colspan="5">—</td></tr>'}</tbody></table></div><div class="box"><h2>Plazo de seguridad</h2>${safety}</div><div class="box"><h2>Resultado / Valoración del servicio</h2>${pdfText(d.result)}${d.result==='Otro'&&d.resultOther?`: ${pdfText(d.resultOther)}`:''}</div></div><div>${pdfAttachments(s,'Documentación adjunta')}<div class="box cut"><h2>Observaciones generales</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
function pdfBody(s){if(s.type==='autoclave')return pdfAutoclave(s);if(s.type==='insitu')return pdfInsitu(s);if(s.type==='termitas')return pdfTermitas(s);return pdfDDD(s)}
function openPdfPreview(s){let w=window.open('','_blank');if(!w){alert('El navegador ha bloqueado la vista del PDF. Permite ventanas emergentes para esta aplicación.');return}let css=pdfBaseCss();css+=`@page{size:A4 portrait;margin:7mm}body{width:auto;height:auto;overflow:visible;margin:0}.page{box-sizing:border-box;width:196mm;height:auto;min-height:283mm;overflow:visible;padding-bottom:10mm;margin-left:auto;margin-right:auto}.head{grid-template-columns:42mm 1fr 40mm}.draft{right:60mm}.grid2{grid-template-columns:1fr}.footer{position:relative;margin-top:3mm;break-inside:avoid;page-break-inside:avoid}.sign{break-inside:avoid;page-break-inside:avoid}`;let html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hoja ${esc(s.number)}</title><style>${css}</style></head><body><div class="page">${pdfBody(s)}<div class="footer">Mis Hojas de Servicio · Documento generado desde la hoja digital</div></div><script>setTimeout(()=>window.print(),450)<\/script></body></html>`;w.document.open();w.document.write(html);w.document.close()}

// ===== CAMPOS AVANZADOS V3 =====
const val=id=>document.getElementById(id)?.value??'';
const checked=name=>[...document.querySelectorAll(`[name="${name}"]:checked`)].map(x=>x.value);
const one=name=>document.querySelector(`[name="${name}"]:checked`)?.value||'';
function selectField(id,label,opts,value='',extra=''){return `<div class="field"><label>${label}</label><select id="${id}" ${extra}>${opts.map(o=>`<option value="${esc(o)}" ${o===value?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`}
function checkboxField(id,label,on=false,extra=''){return `<label class="pill"><input id="${id}" type="checkbox" ${on?'checked':''} ${extra}>${label}</label>`}
function bindAutoSave(){clearTimeout(window._as);document.querySelectorAll('.sheet input:not([type="file"]),.sheet textarea,.sheet select').forEach(el=>{el.addEventListener('change',queueAutoSave);el.addEventListener('input',queueAutoSave)});updateWoodTotals();updateConditionalFields();updateStates()}function queueAutoSave(){clearTimeout(window._as);window._as=setTimeout(()=>saveSheet(true),650)}
function snapshotForm(){try{collect()}catch(e){console.warn(e)}}
function editSheet(id){if(id)current=DB.get('sheets').find(x=>x.id===id);if(!current)return home();current.data=current.data||{};current.products=current.products||[];current.attachments=current.attachments||[];let c=current.client||{},d=current.data||{};app.innerHTML=`<div class="toolbar"><button class="secondary" onclick="saveSheet(true);showView('sheets')">← VOLVER</button><span class="spacer"></span>${current.number?'<button class="secondary" onclick="duplicateSheet()">DUPLICAR</button>':''}<button onclick="saveSheet()">GUARDAR</button><button onclick="finalizeSheet()">FINALIZAR</button><button class="secondary" onclick="printSheet()">HOJA PDF</button></div><div class="sheet"><div class="sheetmeta">${field('num','N.º de hoja *',current.number)}${field('date','Fecha *',current.date,'date')}${field('start','Hora inicio',current.start,'time')}${field('end','Hora fin',current.end,'time')}<div class="field"><label>Estado</label><div class="status">${current.status}</div></div></div>${commonClient(c)}${specific(current.type,d)}${acc('obs','OBSERVACIONES GENERALES',texta('observations','Observaciones',d.observations||''))}${acc('director','DIRECTOR TÉCNICO',directorBlock())}</div>`;openBlock=null;setTimeout(bindAutoSave,0)}
function directorBlock(){let c=DB.get('config',{});return `<div class="formgrid"><div class="field"><label>Nombre y apellidos</label><input value="${esc(c.director||'')}" readonly></div><div class="field"><label>Firma guardada</label>${c.signature?`<img src="${c.signature}" style="max-height:70px;max-width:220px;object-fit:contain;border:1px solid var(--line);border-radius:8px;padding:4px">`:'<div class="notice">Firma pendiente de configurar.</div>'}</div></div>`}
function commonClient(c){return acc('client','CLIENTE',`<div class="formgrid">${field('cname','Nombre / Razón social *',c.name||'')}${field('contact','Persona de contacto *',c.contact||'')}${field('address','Dirección *',c.address||'')}${field('phone','Teléfono *',c.phone||'')}${field('email','Correo electrónico *',c.email||'','email')}<div class="full"><button class="secondary" onclick="snapshotForm();pickClient()">🔍 BUSCAR CLIENTE GUARDADO</button> <button onclick="snapshotForm();newClientModal()">＋ NUEVO CLIENTE</button> ${checkboxField('updateClient','Actualizar también la ficha del cliente',!!current.data.updateClient)}</div></div>`)}
function specific(t,d){if(t==='autoclave')return autoForm(d);if(t==='insitu')return insituForm(d);if(t==='termitas')return termiteForm(d);return dddForm(d)}
function woodTable(d){let rows=d.woodRows||Array.from({length:5},()=>({}));while(rows.length<5)rows.push({});return `<div class="tablewrap"><table><thead><tr><th>Unidades</th><th>Largo (m)</th><th>Ancho (mm)</th><th>Grosor (mm)</th><th>Total (m³)</th><th></th></tr></thead><tbody id="woodBody">${rows.map((r,i)=>woodRow(r,i)).join('')}</tbody></table></div><div class="rowactions"><button type="button" onclick="addWoodRow()">＋ AÑADIR LÍNEA</button></div><div class="notice"><b>VOLUMEN TOTAL TRATADO: <span id="woodGrand">0,0000</span> m³</b></div>`}
function woodRow(r,i){return `<tr data-wood-row="${i}"><td><input class="smallinput woodin" data-key="u" value="${esc(r.u||'')}" inputmode="numeric"></td><td><input class="smallinput woodin" data-key="l" value="${esc(r.l||'')}" inputmode="decimal"></td><td><input class="smallinput woodin" data-key="a" value="${esc(r.a||'')}" inputmode="decimal"></td><td><input class="smallinput woodin" data-key="g" value="${esc(r.g||'')}" inputmode="decimal"></td><td class="woodtotal">—</td><td>${i>=5?`<button class="danger" type="button" onclick="deleteWoodRow(${i})">✕</button>`:''}</td></tr>`}
function readWoodRows(){return [...document.querySelectorAll('[data-wood-row]')].map(tr=>{let o={};tr.querySelectorAll('[data-key]').forEach(x=>o[x.dataset.key]=x.value.trim());return o})}
function addWoodRow(){snapshotForm();current.data.woodRows=current.data.woodRows||[];while(current.data.woodRows.length<5)current.data.woodRows.push({});current.data.woodRows.push({});editSheet()}
function deleteWoodRow(i){if(!confirm('¿Seguro que quieres eliminar esta línea de madera?'))return;snapshotForm();if(i>=5)current.data.woodRows.splice(i,1);editSheet()}
function numES(v){return parseFloat(String(v).replace(',','.'))}
function updateWoodTotals(){let total=0;document.querySelectorAll('[data-wood-row]').forEach(tr=>{let x={};tr.querySelectorAll('[data-key]').forEach(i=>x[i.dataset.key]=numES(i.value));let ok=[x.u,x.l,x.a,x.g].every(Number.isFinite)&&x.u>=1&&Number.isInteger(x.u)&&x.l>=0&&x.a>=0&&x.g>=0;let n=ok?x.u*x.l*(x.a/1000)*(x.g/1000):null;tr.querySelector('.woodtotal').textContent=n===null?'—':n.toFixed(4).replace('.',',');if(n!==null)total+=n});if($('#woodGrand'))$('#woodGrand').textContent=total.toFixed(4).replace('.',',')}
function autoForm(d){return acc('wood','MADERA',`<div class="formgrid">${field('species','Especie de madera *',d.species||'')}${field('humidity','Humedad antes del tratamiento (%) *',d.humidity||'','number','min="0" max="100" step="0.1"')}${field('useclass','Clase de uso *',d.useclass||'Clase de uso 3.1')}</div>${woodTable(d)}`)+acc('product','PRODUCTO PROTECTOR',productEditor('autoclave'))+acc('cycle','CICLO',`<div class="formgrid">${field('cycleNo','N.º ciclo/tratamiento',d.cycleNo||'')}${field('v1','Vacío inicial',d.v1||'')}${field('v2','Vacío constante',d.v2||'')}${field('p2','Pulverización 2',d.p2||'')}${field('pd','Pulverización decreciente',d.pd||'')}${field('dry','Secado',d.dry||'')}</div>${attachmentSection('cycleAttachments','DOCUMENTACIÓN DEL CICLO',false)}`)+acc('delivery','ENTRADA Y SALIDA',`<div class="formgrid">${field('inDoc','Albarán entrada *',d.inDoc||'')}${field('inDate','Fecha entrada *',d.inDate||'','date')}${field('outDoc','Albarán salida/entrega *',d.outDoc||'')}${field('outDate','Fecha salida/entrega *',d.outDate||'','date')}</div>`)}
function insituForm(d){return acc('treatment','TRATAMIENTO',`<label>Tipo de tratamiento *</label><div onchange="insituTreatChanged()">${checks('treat',['Pulverización','Inyección','Aplicación gel Air Less','Otro'],d.treat||[])}</div><div id="otherTreatWrap" class="formgrid">${field('otherTreat','Otro tratamiento',d.otherTreat||'')}</div><div class="formgrid">${texta('zones','Elementos / Zonas tratadas *',d.zones||'')}${field('area','Superficie tratada (m²)',d.area||'','number','min="0" step="any"')}${field('volume','Volumen tratado (m³)',d.volume||'','number','min="0" step="any"')}<div class="field"><label>Ubicación</label>${radio('location',['Interior','Exterior','Interior y exterior'],d.location)}</div><div class="field"><label>Finalidad *</label>${radio('purpose',['Preventivo','Curativo','Preventivo y curativo'],d.purpose)}</div><div class="field full"><label>Plaga / Agente objetivo</label>${checks('insituPest',['Carcoma','Hongos xilófagos','Termitas','Otro'],d.insituPest||[])}</div>${field('insituPestOther','Especificar otra plaga/agente',d.insituPestOther||'')}${field('treatmentStart','Fecha de inicio del tratamiento',d.treatmentStart||'','date')}${field('treatmentEnd','Fecha de finalización del tratamiento',d.treatmentEnd||'','date')}${texta('budget','SEGÚN PRESUPUESTO',d.budget||'')}</div>`)+acc('product','PRODUCTOS',productEditor('insitu'))+acc('safety','PLAZO DE SEGURIDAD',safety(d))+acc('docs','DOCUMENTACIÓN',attachmentSection('attachments','DOCUMENTACIÓN',false))}
function termiteForm(d){let locked=['Revisión','Tratamiento'].includes(d.termAction)&&!!d.installDate;return acc('action','TIPO DE ACTUACIÓN',`<div onchange="termActionChanged()">${radio('termAction',['Instalación y tratamiento','Revisión','Tratamiento'],d.termAction)}</div>`)+acc('system','SISTEMA DE TRATAMIENTO',`<div class="field"><label>Sistema *</label><div onchange="termSystemChanged()">${radio('termSystem',['Sistema de cebos','Barrera química','Otro'],d.termSystem)}</div></div><div id="otherSystemWrap">${field('otherSystem','Especificar otro sistema *',d.otherSystem||'')}</div>${texta('termZones','Zonas / elementos tratados o revisados *',d.termZones||'')}<div class="formgrid">${field('installDate','Fecha de instalación inicial *',d.installDate||'','date',locked?'readonly':'')}${field('nextReview','Próxima revisión',d.nextReview||'','date')}<div id="linearWrap">${field('linearMeters','Metros lineales tratados (m) *',d.linearMeters||'','number','min="0" step="any"')}</div></div><div class="safety">⚠ No manipular ni abrir las cajas. Solo autorizado al técnico competente.</div>`)+acc('stations','ESTACIONES (SISTEMA DE CEBOS)',stations())+acc('product','PRODUCTOS',productEditor('termitas'))+acc('plan','PLANO / CROQUIS DE ESTACIONES',attachmentSection('planAttachments','PLANO / CROQUIS',false))+acc('photos','DOCUMENTACIÓN FOTOGRÁFICA',attachmentSection('photoAttachments','FOTOGRAFÍAS',true))}
function stations(){let a=(current.data.stations||[]).slice().sort((x,y)=>(x.kind==='ES'?0:1)-(y.kind==='ES'?0:1)||x.seq-y.seq),es=a.filter(x=>x.kind==='ES').length,ep=a.filter(x=>x.kind==='EP').length;return `<div class="notice">Orden: primero Suelo (ES), después Pared (EP). En REVISIÓN, Consumo y Reposición son obligatorios en todas las estaciones.</div><div class="notice"><b>Suelo (ES): ${es} · Pared (EP): ${ep} · Total: ${a.length}</b></div><p><button type="button" onclick="addStation('ES')">＋ ESTACIÓN ES</button> <button type="button" onclick="addStation('EP')">＋ ESTACIÓN EP</button></p><div id="stationsList">${a.map(stationRow).join('')}</div>`}
function stationRow(s){let cons=['','No','Poco','Medio','Alto'],rep=['','Sí','No'];return `<div class="card station" data-station-id="${s.id}"><b>${esc(s.code)}</b> · ${esc(s.type)}<div class="formgrid">${selectField('','Consumo',cons,s.consumption||'','data-st="consumption"')}${selectField('','Reposición',rep,s.replacement||'','data-st="replacement"')}<div class="field"><label>Cantidad repuesta (g)</label><input data-st="grams" type="number" min="0" step="any" value="${esc(s.grams||'')}"></div><div class="field"><label>Observación</label><input data-st="observation" value="${esc(s.observation||'')}"></div></div></div>`}
function readStations(){return [...document.querySelectorAll('.station')].map(card=>{let old=(current.data.stations||[]).find(x=>x.id===card.dataset.stationId)||{};let o={...old};card.querySelectorAll('[data-st]').forEach(x=>o[x.dataset.st]=x.value);return o})}
function addStation(kind){snapshotForm();let a=current.data.stations=current.data.stations||[];let max=Math.max(0,...a.filter(x=>x.kind===kind).map(x=>x.seq||parseInt((x.code||'').match(/\d+/)?.[0]||0)));let seq=max+1;a.push({id:crypto.randomUUID(),kind,seq,type:kind==='ES'?'Suelo':'Pared',code:`${kind} ${String(seq).padStart(2,'0')}`,consumption:'',replacement:'',grams:'',observation:''});editSheet()}
function termActionChanged(){snapshotForm();if(['Revisión','Tratamiento'].includes(current.data.termAction))loadTermiteHistory();editSheet()}
function termSystemChanged(){snapshotForm();editSheet()}
function loadTermiteHistory(){if((current.data.stations||[]).length)return;let cname=(current.client?.name||'').trim().toLowerCase();if(!cname)return;let prev=DB.get('sheets').filter(x=>x.id!==current.id&&x.type==='termitas'&&(x.client?.name||'').trim().toLowerCase()===cname&&x.data?.termSystem==='Sistema de cebos').sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];if(prev){current.data.installDate=prev.data.installDate||current.data.installDate;current.data.stations=(prev.data.stations||[]).map(s=>({...s,consumption:'',replacement:'',grams:'',observation:''}))}}
function dddForm(d){let acts=d.dddAction||[];return acc('actions','ACTUACIONES',`<label>Tipo de actuación *</label><div onchange="dddActionsChanged()">${checks('dddAction',['Desinfección','Desinsectación','Desratización'],acts)}</div><div class="notice">Cada actuación relaciona su plaga/agente, método y zonas.</div><div id="dddDetails">${acts.map(a=>dddDetail(a,(d.dddDetails||[]).find(x=>x.action===a)||{})).join('')}</div>`)+acc('product','PRODUCTOS',productEditor('ddd'))+acc('safety','PLAZO DE SEGURIDAD',safety(d))+acc('result','RESULTADO / VALORACIÓN',`<div onchange="dddResultChanged()">${radio('result',['Satisfactorio','Requiere seguimiento','Otro'],d.result)}</div><div id="resultOtherWrap">${texta('resultOther','Especificar valoración',d.resultOther||'')}</div>`)+acc('docs','DOCUMENTACIÓN ADJUNTA',attachmentSection('attachments','DOCUMENTACIÓN ADJUNTA',false))}
function dddResultChanged(){current.data=current.data||{};current.data.result=one('result');updateConditionalFields();queueAutoSave()}
function dddDetail(action,o){let key=action.replace(/[^a-z]/gi,'');return `<div class="card ddd-detail" data-action="${esc(action)}"><h3>${esc(action)}</h3><label>Plaga / Agente objetivo *</label>${checks(`pest_${key}`,['Cucarachas','Hormigas','Mosquitos','Moscas','Chinches','Pulgas','Roedores','Microorganismos','Otro'],o.pests||[])}${field(`pestOther_${key}`,'Especificar “Otro”',o.pestOther||'')}<label>Método de aplicación *</label>${checks(`method_${key}`,['Pulverización','Nebulización','Gel','Cebos','Trampas','Portacebos','Otro'],o.methods||[])}${field(`methodOther_${key}`,'Especificar “Otro”',o.methodOther||'')}${texta(`zones_${key}`,'Zonas / Áreas tratadas *',o.zones||'')}</div>`}
function dddActionsChanged(){snapshotForm();let selected=checked('dddAction'),old=current.data.dddDetails||[];current.data.dddAction=selected;current.data.dddDetails=selected.map(a=>old.find(x=>x.action===a)||{action:a,pests:[],methods:[],zones:''});editSheet()}
function readDDDDetails(){return [...document.querySelectorAll('.ddd-detail')].map(card=>{let a=card.dataset.action,key=a.replace(/[^a-z]/gi,'');return {action:a,pests:checked(`pest_${key}`),pestOther:val(`pestOther_${key}`),methods:checked(`method_${key}`),methodOther:val(`methodOther_${key}`),zones:val(`zones_${key}`)}})}
function safety(d){return `<div class="formgrid">${field('safetyQty','Cantidad',d.safetyQty||'','number','min="0" step="any"')}${selectField('safetyUnit','Unidad',['Horas','Días'],d.safetyUnit||'Horas')}<div class="full">${checkboxField('noSafety','SIN PLAZO DE SEGURIDAD',!!d.noSafety)}</div><div class="notice full">Si se selecciona “Sin plazo”: Producto biocida. No tocar hasta su completo secado.</div></div>`}
function productEditor(service){let ps=current.products||[];let max=service==='autoclave'?1:999;return `<div class="notice">Selecciona productos del catálogo general. Los datos maestros se guardan como copia histórica en esta hoja.</div><p>${ps.length<max?`<button type="button" onclick="snapshotForm();pickProduct()">＋ AÑADIR PRODUCTO</button>`:''}</p><div id="chosenProducts">${ps.map((p,i)=>productCard(p,i,service)).join('')}</div>`}
function productCard(p,i,service){let assoc='';if(service==='insitu')assoc=`<div class="field full"><label>Tratamientos asociados</label>${checks(`prodTreat_${i}`,['Pulverización','Inyección','Aplicación gel Air Less','Otro'],p.treatments||[])}</div>`;if(service==='termitas')assoc=`<div class="field"><label>Sistema asociado</label><input data-prod="system" value="${esc(p.system||current.data.termSystem||'')}" readonly></div>`;if(service==='ddd')assoc=`<div class="field full"><label>Actuaciones asociadas</label>${checks(`prodAct_${i}`,current.data.dddAction||[],p.actions||[])}</div>`;let qtyLabel=service==='autoclave'?'Cantidad consumida (L)':service==='termitas'?'Cantidad utilizada/repuesta (g)':'Cantidad utilizada';if(service==='insitu')qtyLabel='Cantidad consumida (L)';return `<div class="card product-card" data-prod-index="${i}"><div style="display:flex;gap:8px;align-items:center"><div><b>${esc(p.name)}</b><br><small>${esc(p.maker||'')} · ${esc(p.reg||'')}</small></div><span class="spacer"></span><button class="danger" type="button" onclick="removeProduct(${i})">ELIMINAR</button></div><div class="formgrid">${field('', 'N.º lote (opcional)',p.lot||'','text','data-prod="lot"')}${field('',qtyLabel,p.qty||'','number','min="0" step="any" data-prod="qty"')}${assoc}</div></div>`}
function readProducts(){return [...document.querySelectorAll('.product-card')].map((card,i)=>{let p={...(current.products[i]||{})};card.querySelectorAll('[data-prod]').forEach(x=>p[x.dataset.prod]=x.value);if(current.type==='insitu')p.treatments=checked(`prodTreat_${i}`);if(current.type==='ddd')p.actions=checked(`prodAct_${i}`);return p})}
function removeProduct(i){snapshotForm();current.products.splice(i,1);editSheet()}
function useProduct(id){snapshotForm();let p=DB.get('products').find(x=>x.id===id);if(!p)return;if(current.type==='autoclave')current.products=[{...p}];else if(!current.products.some(x=>x.id===id))current.products.push({...p});closeModal();editSheet()}
function attachmentSection(key,title,photosOnly=false){let a=(key==='attachments'?current.attachments:(current.data[key]||[]));let accept=photosOnly?'image/*':'image/*,.pdf';return `<div class="actions"><button type="button" onclick="document.getElementById('file_${key}').click()">${photosOnly?'📷 HACER / ELEGIR FOTO':'📎 HACER FOTO / ELEGIR FOTO / AÑADIR PDF'}</button><input id="file_${key}" class="hidden" type="file" accept="${accept}" ${photosOnly?'capture="environment"':''} multiple onchange="addAttachments('${key}',this.files)"></div><div>${a.map(x=>`<div class="attachrow"><b>${esc(x.name)}</b> — ${esc(x.date||'')} <span class="spacer"></span><button class="secondary" type="button" onclick="openAttachment('${x.id}')">VER</button><button class="secondary" type="button" onclick="shareAttachment('${x.id}')">COMPARTIR</button><button class="danger" type="button" onclick="deleteAttachment('${key}','${x.id}')">ELIMINAR</button></div>`).join('')||'<div class="notice">Sin archivos adjuntos.</div>'}</div>`}
function fileDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open('mhs_files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function putFile(id,file){
  const db=await fileDB();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('files','readwrite');
    tx.objectStore('files').put(file,id);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error('Se canceló el guardado local del adjunto.'));
  });

  const {data:{user},error:authError}=await supabaseClient.auth.getUser();
  if(authError) throw authError;
  if(!user) throw new Error('No hay una sesión iniciada en Supabase.');

  const path=`${user.id}/${id}`;
  const {error}=await supabaseClient.storage
    .from('adjuntos')
    .upload(path,file,{
      upsert:true,
      contentType:file.type||'application/octet-stream'
    });

  if(error){
    console.error('Error subiendo adjunto a Supabase Storage:',error);
    throw error;
  }
  return true;
}
async function getFile(id){let db=await fileDB();let local=await new Promise((res,rej)=>{let r=db.transaction('files','readonly').objectStore('files').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const{data:{user}}=await supabaseClient.auth.getUser();if(!user)return null;const{data,error}=await supabaseClient.storage.from('adjuntos').download(user.id+'/'+id);if(error){console.error('Error descargando adjunto de Supabase:',error);return null}let file=new File([data],id,{type:data.type||'application/octet-stream'});await new Promise((res,rej)=>{let tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});return file}async function delFile(id){let db=await fileDB();return new Promise((res,rej)=>{let tx=db.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function addAttachments(key,files){if(!current||!files||!files.length)return;
  snapshotForm();
  const list=key==='attachments'?current.attachments:(current.data[key]=current.data[key]||[]);
  let added=0;
  for(const f of [...files]){
    const id=crypto.randomUUID();
    const seq=(current.data.fileSeq||0)+1;
    const ext=(f.name.split('.').pop()||'bin').toLowerCase();
    const base=(current.number||'Hoja').replace(/[^A-Za-z0-9_-]/g,'_');
    const name=`${base}_${key}_${seq}.${ext}`;
    try{
      await putFile(id,f);
      current.data.fileSeq=seq;
      list.push({id,name,type:f.type||'',date:new Date().toLocaleDateString('es-ES')});
      added++;
    }catch(e){
      console.error('No se pudo guardar el adjunto:',e);
      alert(`No se pudo subir "${f.name}" a Supabase. ${e?.message||'Comprueba la conexión y los permisos del bucket adjuntos.'}`);
    }
  }
  if(added){saveSheet(true);editSheet();}
}
async function openAttachment(id){let f=await getFile(id);if(!f)return alert('No se encuentra el archivo.');let u=URL.createObjectURL(f);window.open(u,'_blank');setTimeout(()=>URL.revokeObjectURL(u),60000)}
async function shareAttachment(id){let f=await getFile(id);if(!f)return alert('No se encuentra el archivo.');try{if(navigator.share&&navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'Adjunto hoja de servicio'});else openAttachment(id)}catch(e){}}
async function deleteAttachment(key,id){if(!confirm('¿Seguro que quieres eliminar este archivo?'))return;snapshotForm();let list=key==='attachments'?current.attachments:current.data[key]||[];let i=list.findIndex(x=>x.id===id);if(i>=0)list.splice(i,1);await delFile(id);saveSheet(true);editSheet()}
function collect(){if(!current)return;current.number=val('num').trim();current.date=val('date');current.start=val('start');current.end=val('end');current.client={...(current.client||{}),name:val('cname'),contact:val('contact'),address:val('address'),phone:val('phone'),email:val('email')};let d=current.data=current.data||{};d.observations=val('observations');d.updateClient=$('#updateClient')?.checked||false;['species','humidity','useclass','cycleNo','v1','v2','p2','pd','dry','inDoc','inDate','outDoc','outDate','otherTreat','zones','area','volume','insituPestOther','treatmentStart','treatmentEnd','budget','safetyQty','safetyUnit','termZones','installDate','nextReview','otherSystem','linearMeters','resultOther'].forEach(k=>{if(document.getElementById(k))d[k]=val(k)});d.noSafety=$('#noSafety')?.checked||false;if(document.querySelector('[data-wood-row]'))d.woodRows=readWoodRows();if(document.querySelector('.station'))d.stations=readStations();d.treat=checked('treat');d.insituPest=checked('insituPest');['location','purpose','termAction','termSystem','result'].forEach(n=>{let v=one(n);if(v)d[n]=v});if(document.querySelector('[name="dddAction"]')){d.dddAction=checked('dddAction');d.dddDetails=readDDDDetails()}current.products=readProducts().length||!document.querySelector('.product-card')?readProducts():current.products;updateWoodTotals()}
function saveSheet(auto=false){collect();let all=DB.get('sheets');if(current.number){let dup=all.find(x=>(x.number||'').toLowerCase()===current.number.toLowerCase()&&x.id!==current.id);if(dup){if(!auto)alert('Este N.º de hoja ya existe. Introduce otro número.');return false}}let hasData=current.number||current.client?.name||Object.values(current.data||{}).some(v=>Array.isArray(v)?v.length:!!v);if(current.status==='PENDIENTE'&&hasData)current.status='EN PROCESO';current.modified=new Date().toISOString().slice(0,10);let i=all.findIndex(x=>x.id===current.id);if(i<0)all.unshift(current);else all[i]=current;DB.set('sheets',all);saveSheetToSupabase(current);if(current.data.updateClient&&current.client?.name){let cs=DB.get('clients'),ci=cs.findIndex(x=>x.id===current.client.sourceId||x.name===current.client.name);if(ci>=0)cs[ci]={...cs[ci],...current.client};DB.set('clients',cs)}if($('#saveMsg')){$('#saveMsg').textContent='✓ Guardado automáticamente';setTimeout(()=>{if($('#saveMsg'))$('#saveMsg').textContent=''},1800)}return true}
function validateCompany(miss){let c=DB.get('config',{});if(!c.name||!c.address||!c.phone||!c.email||!c.roesb||!c.logo)miss.push('Datos completos de empresa y logotipo');if(!c.director||!c.signature)miss.push('Director Técnico y firma configurada')}
function finalizeSheet(){collect();let d=current.data||{},miss=[];if(!current.number)miss.push('N.º de hoja');if(!current.date)miss.push('Fecha del servicio');let c=current.client||{};if(!c.name||!c.address||!c.contact||!c.phone||!c.email)miss.push('Datos completos del cliente');validateCompany(miss);if(current.type==='autoclave'){if(!d.species)miss.push('Especie de madera');let h=numES(d.humidity);if(!Number.isFinite(h)||h<0||h>100)miss.push('Humedad antes del tratamiento');if(!d.useclass)miss.push('Clase de uso');let complete=(d.woodRows||[]).some(r=>{let u=numES(r.u),l=numES(r.l),a=numES(r.a),g=numES(r.g);return Number.isInteger(u)&&u>=1&&[l,a,g].every(x=>Number.isFinite(x)&&x>=0)});if(!complete)miss.push('Al menos una línea completa de madera');if(!current.products.length)miss.push('Producto protector');if(!d.inDoc||!d.inDate||!d.outDoc||!d.outDate)miss.push('Albaranes y fechas de entrada/salida')}if(current.type==='insitu'){if(!d.treat?.length)miss.push('Tipo de tratamiento');if(d.treat?.includes('Otro')&&!d.otherTreat)miss.push('Especificar otro tratamiento');if(!d.zones)miss.push('Elementos / Zonas tratadas');if(!d.area&&!d.volume)miss.push('Superficie o volumen tratado');if(!d.purpose)miss.push('Finalidad del tratamiento');if(!current.products.length)miss.push('Al menos un producto');if(!d.noSafety&&!d.safetyQty)miss.push('Plazo de seguridad o Sin plazo')}if(current.type==='termitas'){if(!d.termAction)miss.push('Tipo de actuación');if(!d.termSystem)miss.push('Sistema de tratamiento');if(d.termSystem==='Otro'&&!d.otherSystem)miss.push('Especificar otro sistema');if(!d.termZones)miss.push('Zonas tratadas/revisadas');if(!d.installDate)miss.push('Fecha de instalación inicial');if(!current.products.length)miss.push('Al menos un producto');if(d.termSystem==='Sistema de cebos'){if(!(d.stations||[]).length)miss.push('Al menos una estación ES o EP');if(d.termAction==='Revisión'&&(d.stations||[]).some(s=>!s.consumption||!s.replacement))miss.push('Consumo y Reposición en todas las estaciones')}if(d.termSystem==='Barrera química'&&!d.linearMeters)miss.push('Metros lineales tratados')}if(current.type==='ddd'){if(!d.dddAction?.length)miss.push('Al menos un tipo de actuación');for(let a of d.dddDetails||[]){if(!a.pests?.length)miss.push(`Plaga/agente en ${a.action}`);if(a.pests?.includes('Otro')&&!a.pestOther)miss.push(`Especificar otra plaga en ${a.action}`);if(!a.methods?.length)miss.push(`Método de aplicación en ${a.action}`);if(a.methods?.includes('Otro')&&!a.methodOther)miss.push(`Especificar otro método en ${a.action}`);if(!a.zones)miss.push(`Zonas/áreas en ${a.action}`)}if(!current.products.length)miss.push('Al menos un producto');if(!d.noSafety&&!d.safetyQty)miss.push('Plazo de seguridad o Sin plazo')}
if(miss.length){alert(`Faltan ${miss.length} campos/requisitos:\n• `+miss.join('\n• '));return}if(confirm('¿Quieres finalizar esta hoja de servicio? La hoja seguirá pudiendo editarse posteriormente.')){current.status='FINALIZADA';saveSheet(true);editSheet();setTimeout(()=>alert('Hoja finalizada correctamente.'),50)}}
function updateConditionalFields(){let d=current?.data||{};let toggle=(id,on)=>{let e=document.getElementById(id);if(e)e.style.display=on?'':'none'};toggle('otherTreatWrap',(d.treat||checked('treat')).includes('Otro'));toggle('otherSystemWrap',(d.termSystem||one('termSystem'))==='Otro');toggle('linearWrap',(d.termSystem||one('termSystem'))==='Barrera química');toggle('resultOtherWrap',(d.result||one('result'))==='Otro')}
function updateStates(){document.querySelectorAll('.state').forEach(x=>{x.textContent='Pendiente';x.classList.remove('ok')});let ok=id=>{let e=$('#state_'+id);if(e){e.textContent='Completo';e.classList.add('ok')}};let c=current?.client||{};if(c.name&&c.address&&c.contact&&c.phone&&c.email)ok('client');if(current?.products?.length)ok('product');let d=current?.data||{};if(current?.type==='autoclave'&&d.species&&d.humidity&&d.useclass)ok('wood');if(current?.type==='insitu'&&d.treat?.length&&d.zones&&d.purpose)ok('treatment');if(current?.type==='termitas'){if(d.termAction)ok('action');if(d.termSystem&&d.termZones&&d.installDate)ok('system');if(d.termSystem!=='Sistema de cebos'||d.stations?.length)ok('stations')}if(current?.type==='ddd'&&d.dddAction?.length)ok('actions');let co=DB.get('config',{});if(co.director&&co.signature)ok('director')}
function pickClient(){snapshotForm();let a=DB.get('clients').filter(c=>c.active!==false);modal(`<h2>Seleccionar cliente</h2>${a.map(c=>`<div class="card" onclick="useClient('${c.id}')" style="cursor:pointer"><b>${esc(c.name)}</b><br>${esc(c.address)}</div>`).join('')||'<p>No hay clientes guardados.</p>'}<div class="rowactions"><button class="secondary" onclick="closeModal()">CERRAR</button></div>`)}
function useClient(id){let c=DB.get('clients').find(x=>x.id===id);current.client={...c,sourceId:c.id};delete current.client.id;closeModal();if(current.type==='termitas'&&['Revisión','Tratamiento'].includes(current.data.termAction))loadTermiteHistory();editSheet()}
function config(){let c=DB.get('config',{});app.innerHTML=`<div class="list"><h1>Configuración</h1><div class="card"><h2>Empresa</h2><div class="formgrid">${field('coName','Nombre / Razón social *',c.name||'')}${field('roesb','ROESB *',c.roesb||'')}${field('coAddr','Dirección *',c.address||'')}${field('coPhone','Teléfono *',c.phone||'')}${field('coEmail','Correo electrónico *',c.email||'','email')}<div class="field"><label>Logotipo *</label><input id="logoFile" type="file" accept="image/*">${c.logo?`<img src="${c.logo}" style="max-height:80px;max-width:220px;display:block;margin-top:8px">`:''}</div></div><h2>Director Técnico</h2><div class="formgrid">${field('directorName','Nombre y apellidos *',c.director||'')}<div class="field"><label>Firma *</label><input id="signatureFile" type="file" accept="image/*">${c.signature?`<img src="${c.signature}" style="max-height:80px;max-width:220px;display:block;margin-top:8px">`:''}</div></div><div class="rowactions"><button class="secondary" onclick="home()">← VOLVER</button><button onclick="saveConfig()">GUARDAR</button></div></div></div>`}
function toDataURL(file){return new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
async function saveConfig(){let old=DB.get('config',{}),logo=$('#logoFile').files[0],sig=$('#signatureFile').files[0];let c={...old,name:val('coName'),roesb:val('roesb'),address:val('coAddr'),phone:val('coPhone'),email:val('coEmail'),director:val('directorName')};if(logo)c.logo=await toDataURL(logo);if(sig)c.signature=await toDataURL(sig);DB.set('config',c);alert('Configuración guardada.');home()}
function pdfCompany(){let c=DB.get('config',{});return {name:c.name||'Empresa',address:c.address||'',phone:c.phone||'',email:c.email||'',roesb:c.roesb||'',director:c.director||'',signature:c.signature||'',logo:c.logo||'logo.jpeg'}}
function pdfHeader(s,title){let c=pdfCompany();return `<div class="head"><div><img class="logo" src="${c.logo}"><div class="co"><b>${pdfText(c.name,'')}</b><br>${pdfText(c.address,'')}<br>${pdfText(c.phone,'')} · ${pdfText(c.email,'')}<br><b>ROESB:</b> ${pdfText(c.roesb,'')}</div></div><div class="title">${title}</div><div class="meta"><b>N.º hoja:</b> ${pdfText(s.number)}<br><b>Fecha:</b> ${pdfDate(s.date)}</div></div>${s.status!=='FINALIZADA'?'<div class="draft">BORRADOR</div>':''}`}
function pdfAutoclave(s){let d=s.data||{},w=woodRows(s),p=s.products?.[0];return `${pdfHeader(s,'HOJA DE SERVICIO - TRATAMIENTO DE MADERA EN AUTOCLAVE')}${pdfClient(s)}<div class="grid2"><div><div class="box"><h2>Madera</h2><div class="grid3"><div><b>Especie:</b> ${pdfText(d.species)}</div><div><b>Humedad antes:</b> ${pdfText(d.humidity)}${d.humidity?' %':''}</div><div><b>Clase de uso:</b> ${pdfText(d.useclass)}</div></div><table class="small mt"><thead><tr><th>Unidades</th><th>Largo (m)</th><th>Ancho (mm)</th><th>Grosor (mm)</th><th>Total (m³)</th></tr></thead><tbody>${w.rows.map(r=>`<tr><td>${pdfText(r.u,'')}</td><td>${pdfText(r.l,'')}</td><td>${pdfText(r.a,'')}</td><td>${pdfText(r.g,'')}</td><td>${w.calc(r)!=null?w.calc(r).toFixed(4).replace('.',','):''}</td></tr>`).join('')}</tbody></table>${w.more?'<div class="tiny">Existen líneas adicionales registradas digitalmente.</div>':''}<div class="strong mt">VOLUMEN TOTAL TRATADO: ${w.total.toFixed(4).replace('.',',')} m³</div></div><div class="box"><h2>Producto protector</h2><b>Producto:</b> ${p?pdfProductName(p):'—'}</div><div class="box"><h2>Entrada y salida de madera</h2><div class="grid2"><div><b>Albarán entrada:</b> ${pdfText(d.inDoc)}<br><b>Fecha entrada:</b> ${pdfDate(d.inDate)}</div><div><b>Albarán salida/entrega:</b> ${pdfText(d.outDoc)}<br><b>Fecha salida:</b> ${pdfDate(d.outDate)}</div></div></div></div><div><div class="box"><h2>Servicio</h2><b>Hora inicio:</b> ${pdfText(s.start)} &nbsp; <b>Hora finalización:</b> ${pdfText(s.end)}</div>${(()=>{let a=d.cycleAttachments||[];return a.length?`<div class="box attach"><h2>Documentación del ciclo adjunta</h2>${a.map(x=>x.pdfData?`<div style="margin:2mm 0;text-align:center;break-inside:avoid;page-break-inside:avoid"><img src="${x.pdfData}" style="display:block;max-width:70%;max-height:55mm;width:auto;height:auto;object-fit:contain;margin:auto"></div>`:`<div>${pdfText(x.name,'Archivo adjunto')}</div>`).join('')}</div>`:pdfAttachments({attachments:a},'Documentación del ciclo adjunta')})()}<div class="box cut"><h2>Observaciones</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
function pdfInsitu(s){let d=s.data||{},prods=s.products||[],pests=d.insituPest||[],safety=d.noSafety?'<b>SIN PLAZO DE SEGURIDAD</b><br>Producto biocida. No tocar hasta su completo secado.':`${pdfText(d.safetyQty)} ${pdfText(d.safetyUnit,'')}`;let treat=(d.treat||[]).map(x=>x==='Otro'&&d.otherTreat?`Otro: ${d.otherTreat}`:x);let pest=pests.map(x=>x==='Otro'&&d.insituPestOther?`Otro: ${d.insituPestOther}`:x);return `${pdfHeader(s,'HOJA DE SERVICIO - TRATAMIENTO DE MADERA IN SITU')}${pdfClient(s)}<div class="grid2"><div><div class="box"><h2>Tratamiento</h2><b>Tipo:</b> ${pdfJoin(treat)}<br><b>Elementos / Zonas tratadas:</b> ${pdfText(d.zones)}<br>${d.area?`<b>Superficie tratada:</b> ${pdfText(d.area)} m² `:''}${d.volume?`<b>Volumen tratado:</b> ${pdfText(d.volume)} m³`:''}<br>${d.location?`<b>Ubicación:</b> ${pdfText(d.location)} `:''}<b>Finalidad:</b> ${pdfText(d.purpose)}${pest.length?`<br><b>Plaga / Agente objetivo:</b> ${pdfJoin(pest)}`:''}${d.budget?`<br><b>Según presupuesto:</b> ${pdfText(d.budget)}`:''}${d.treatmentStart||d.treatmentEnd?`<br><b>Inicio:</b> ${pdfDate(d.treatmentStart)} &nbsp; <b>Finalización:</b> ${pdfDate(d.treatmentEnd)}`:''}</div><div class="box"><h2>Productos</h2>${prods.length?prods.map(p=>`<div><b>${pdfProductName(p)}</b>${p.treatments?.length?' - '+pdfJoin(p.treatments):''}${p.lot?' · Lote: '+pdfText(p.lot):''}${p.qty?' · '+pdfText(p.qty)+' L':''}</div>`).join(''):'—'}</div><div class="box"><h2>Plazo de seguridad</h2>${safety}</div></div><div>${(()=>{let a=s.attachments||[];return a.length?`<div class="box attach"><h2>Documentación adjunta</h2>${a.map(x=>x.pdfData?`<div style="margin:2mm 0;text-align:center;break-inside:avoid;page-break-inside:avoid"><img src="${x.pdfData}" style="display:block;max-width:70%;max-height:55mm;width:auto;height:auto;object-fit:contain;margin:auto"></div>`:`<div>${pdfText(x.name,'Archivo adjunto')}</div>`).join('')}</div>`:pdfAttachments(s,'Documentación adjunta')})()}<div class="box cut"><h2>Observaciones</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
function dddAssociations(d){return (d.dddDetails||[]).map(a=>{let pests=(a.pests||[]).map(x=>x==='Otro'&&a.pestOther?`Otro: ${a.pestOther}`:x),methods=(a.methods||[]).map(x=>x==='Otro'&&a.methodOther?`Otro: ${a.methodOther}`:x);return `<tr><td>${pdfText(a.action,'')}</td><td>${pdfJoin(pests)}</td><td>${pdfJoin(methods)}</td><td>${pdfText(a.zones,'')}</td></tr>`}).join('')||'<tr><td colspan="4">—</td></tr>'}

function insituTreatChanged(){snapshotForm();editSheet()}
function attachmentSection(key,title,photosOnly=false){let a=(key==='attachments'?current.attachments:(current.data[key]||[]));let safe=key.replace(/[^a-z0-9]/gi,'');return `<div class="actions"><button type="button" onclick="document.getElementById('cam_${safe}').click()">📷 HACER FOTO</button><button type="button" class="secondary" onclick="document.getElementById('photo_${safe}').click()">🖼 ELEGIR FOTO</button>${photosOnly?'':`<button type="button" class="secondary" onclick="document.getElementById('pdf_${safe}').click()">📄 AÑADIR PDF</button>`}<input id="cam_${safe}" class="hidden" type="file" accept="image/*" capture="environment" onchange="addAttachments('${key}',this.files)"><input id="photo_${safe}" class="hidden" type="file" accept="image/*" multiple onchange="addAttachments('${key}',this.files)">${photosOnly?'':`<input id="pdf_${safe}" class="hidden" type="file" accept="application/pdf,.pdf" multiple onchange="addAttachments('${key}',this.files)">`}</div><div>${a.map(x=>`<div class="attachrow"><b>${esc(x.name)}</b> — ${esc(x.date||'')} <span class="spacer"></span><button class="secondary" type="button" onclick="openAttachment('${x.id}')">VER</button><button class="secondary" type="button" onclick="shareAttachment('${x.id}')">COMPARTIR</button><button class="danger" type="button" onclick="deleteAttachment('${key}','${x.id}')">ELIMINAR</button></div>`).join('')||'<div class="notice">Sin archivos adjuntos.</div>'}</div>`}


/* ===== MOBILIARIO ===== */
function newChooser(){app.innerHTML=`<div class="chooser"><h1>Nueva hoja de servicio</h1><div class="services">${choice('🏭','AUTOCLAVE','Tratamiento de madera en autoclave','autoclave')}${choice('🪵','MADERA IN SITU','Tratamiento de madera in situ','insitu')}${choice('🐜','TERMITAS','Tratamiento de termitas','termitas')}${choice('🪳','DDD','Desinfección, desinsectación y desratización','ddd')}${choice('🪑','MOBILIARIO','Tratamiento de mobiliario','mobiliario')}</div><p><button class="secondary" onclick="home()">← VOLVER</button></p></div>`}

function editSheet(id){if(id)current=DB.get('sheets').find(x=>x.id===id);if(!current)return home();current.data=current.data||{};current.products=current.products||[];current.attachments=current.attachments||[];let c=current.client||{},d=current.data||{},times=current.type==='mobiliario'?'':`${field('start','Hora inicio',current.start,'time')}${field('end','Hora fin',current.end,'time')}`;app.innerHTML=`<div class="toolbar"><button class="secondary" onclick="saveSheet(true);showView('sheets')">← VOLVER</button><span class="spacer"></span>${current.number?'<button class="secondary" onclick="duplicateSheet()">DUPLICAR</button>':''}<button onclick="saveSheet()">GUARDAR</button><button onclick="finalizeSheet()">FINALIZAR</button><button class="secondary" onclick="printSheet()">HOJA PDF</button></div><div class="sheet"><div class="sheetmeta">${field('num','N.º de hoja *',current.number)}${field('date','Fecha *',current.date,'date')}${times}<div class="field"><label>Estado</label><div class="status">${current.status}</div></div></div>${commonClient(c)}${specific(current.type,d)}${acc('obs','OBSERVACIONES GENERALES',texta('observations','Observaciones',d.observations||''))}${acc('director','DIRECTOR TÉCNICO',directorBlock())}</div>`;openBlock=null;setTimeout(bindAutoSave,0)}

function specific(t,d){if(t==='autoclave')return autoForm(d);if(t==='insitu')return insituForm(d);if(t==='termitas')return termiteForm(d);if(t==='mobiliario')return furnitureForm(d);return dddForm(d)}

function furnitureRows(d){let rows=d.furnitureRows||Array.from({length:5},()=>({}));while(rows.length<5)rows.push({});return rows}
function furnitureTable(d){let rows=furnitureRows(d);return `<div class="tablewrap"><table><thead><tr><th>Descripción</th><th>Unidades</th><th>Largo (mm)</th><th>Alto (mm)</th><th>Ancho (mm)</th><th>Fotografía</th><th></th></tr></thead><tbody>${rows.map((r,i)=>furnitureRow(r,i)).join('')}</tbody></table></div><div class="rowactions"><button type="button" onclick="addFurnitureRow()">＋ AÑADIR LÍNEA</button></div>`}
function furnitureRow(r,i){let photo=r.photo;return `<tr class="furniture-row" data-furniture-row="${i}"><td><input data-furn="description" value="${esc(r.description||'')}" placeholder="Ej.: Armario"></td><td><input class="smallinput" data-furn="units" type="number" min="1" step="1" value="${esc(r.units||'')}"></td><td><input class="smallinput" data-furn="length" type="number" min="0" step="any" value="${esc(r.length||'')}"></td><td><input class="smallinput" data-furn="height" type="number" min="0" step="any" value="${esc(r.height||'')}"></td><td><input class="smallinput" data-furn="width" type="number" min="0" step="any" value="${esc(r.width||'')}"></td><td><div>${photo?`<b>${esc(photo.name)}</b><br><button class="secondary" type="button" onclick="openAttachment('${photo.id}')">VER</button> <button class="danger" type="button" onclick="deleteFurniturePhoto(${i})">ELIMINAR</button>`:`<button type="button" onclick="document.getElementById('furnCam_${i}').click()">📷 HACER FOTO</button> <button class="secondary" type="button" onclick="document.getElementById('furnPick_${i}').click()">🖼 ELEGIR FOTO</button>`}<input id="furnCam_${i}" class="hidden" type="file" accept="image/*" capture="environment" onchange="setFurniturePhoto(${i},this)"><input id="furnPick_${i}" class="hidden" type="file" accept="image/*" onchange="setFurniturePhoto(${i},this)"></div></td><td>${i>=5?`<button class="danger" type="button" onclick="deleteFurnitureRow(${i})">✕</button>`:''}</td></tr>`}
function readFurnitureRows(){return [...document.querySelectorAll('.furniture-row')].map((tr,i)=>{let old=(current.data.furnitureRows||[])[i]||{},o={...old};tr.querySelectorAll('[data-furn]').forEach(x=>o[x.dataset.furn]=x.value.trim());return o})}
function addFurnitureRow(){snapshotForm();current.data.furnitureRows=current.data.furnitureRows||[];while(current.data.furnitureRows.length<5)current.data.furnitureRows.push({});current.data.furnitureRows.push({});editSheet()}
function deleteFurnitureRow(i){if(!confirm('¿Seguro que quieres eliminar este artículo?'))return;snapshotForm();let r=current.data.furnitureRows?.[i];if(r?.photo?.id)delFile(r.photo.id);if(i>=5)current.data.furnitureRows.splice(i,1);editSheet()}
async function setFurniturePhoto(i,source){
  // Acepta tanto el input de archivo como una FileList, para funcionar en tabletas y ordenadores.
  const input=source&&source.files?source:null;
  const f=input?(input.files&&input.files[0]):(source&&source[0]);
  if(input)input.value=''; // Permite volver a elegir la misma fotografía si hay que repetir la prueba.
  if(!f){console.warn('No se recibió ningún archivo para la fotografía de mobiliario.');alert('La tablet no ha entregado ninguna fotografía a la aplicación. Prueba de nuevo con ELEGIR FOTO. Si vuelve a ocurrir, no cambies nada más y anota este mensaje.');return;}
  if(!current){alert('Abre una hoja de servicio antes de añadir una fotografía.');return;}
  let rows=null,oldPhoto=null;
  try{clearTimeout(window._as);    snapshotForm();
    rows=current.data.furnitureRows=current.data.furnitureRows||[];
    while(rows.length<=i)rows.push({});
    oldPhoto=rows[i].photo;
    const id=crypto.randomUUID();
    const ext=(f.name.split('.').pop()||'jpg').toLowerCase();
    const base=(current.number||'Hoja').replace(/[^A-Za-z0-9_-]/g,'_');
    const name=`${base}_Mobiliario_${i+1}.${ext}`;
    console.info('Fotografía de mobiliario seleccionada:',f.name,f.type,f.size);
    await putFile(id,f);
    rows[i].photo={id,name,type:f.type||'',date:new Date().toLocaleDateString('es-ES')};
    const saved=saveSheet(true);
if(saved===false) throw new Error('El archivo se ha subido, pero la hoja no se ha podido guardar.');
await saveSheetToSupabase(current);

    editSheet();
  }catch(e){
    console.error('No se pudo guardar la foto de mobiliario:',e);
    if(rows&&rows[i]){
      if(oldPhoto)rows[i].photo=oldPhoto;
      else delete rows[i].photo;
    }
    alert(`No se ha podido añadir la fotografía de mobiliario.\n\nMotivo: ${e&&e.message?e.message:String(e)}\n\nNo cierres la hoja. Comprueba la conexión y la sesión; si vuelve a ocurrir, envíanos una foto de este mensaje.`);
    if(current)editSheet();
  }
}
async function deleteFurniturePhoto(i){if(!confirm('¿Seguro que quieres eliminar esta fotografía?'))return;snapshotForm();let p=current.data.furnitureRows?.[i]?.photo;if(p?.id)await delFile(p.id);if(current.data.furnitureRows?.[i])delete current.data.furnitureRows[i].photo;saveSheet(true);editSheet()}

function furnitureForm(d){return acc('furniture','DATOS DEL MOBILIARIO',`<div class="field"><label>Acabado *</label>${radio('furnitureFinish',['Barnizado','Sin barnizar'],d.furnitureFinish||'')}</div>${furnitureTable(d)}<div class="notice"><b>AVISO:</b> En mobiliario barnizado o con otros acabados superficiales (pinturas, lacas, etc.), la penetración del producto protector queda limitada principalmente a grietas, orificios producidos por la plaga y zonas de madera sin acabado.</div>`)+acc('furnitureTreatment','TRATAMIENTO',`<div class="field"><label>Método de tratamiento *</label>${radio('furnitureMethod',['Autoclave','Aplicación gel'],d.furnitureMethod||'')}</div>`)+acc('product','PRODUCTO PROTECTOR',productEditor('mobiliario'))}

function collect(){if(!current)return;current.number=val('num').trim();current.date=val('date');current.start=current.type==='mobiliario'?'':val('start');current.end=current.type==='mobiliario'?'':val('end');current.client={...(current.client||{}),name:val('cname'),contact:val('contact'),address:val('address'),phone:val('phone'),email:val('email')};let d=current.data=current.data||{};d.observations=val('observations');d.updateClient=$('#updateClient')?.checked||false;['species','humidity','useclass','cycleNo','v1','v2','p2','pd','dry','inDoc','inDate','outDoc','outDate','otherTreat','zones','area','volume','insituPestOther','treatmentStart','treatmentEnd','budget','safetyQty','safetyUnit','termZones','installDate','nextReview','otherSystem','linearMeters','resultOther'].forEach(k=>{if(document.getElementById(k))d[k]=val(k)});d.noSafety=$('#noSafety')?.checked||false;if(document.querySelector('[data-wood-row]'))d.woodRows=readWoodRows();if(document.querySelector('.furniture-row'))d.furnitureRows=readFurnitureRows();if(document.querySelector('.station'))d.stations=readStations();d.treat=checked('treat');d.insituPest=checked('insituPest');['location','purpose','termAction','termSystem','result','furnitureFinish','furnitureMethod'].forEach(n=>{let v=one(n);if(v)d[n]=v});if(document.querySelector('[name="dddAction"]')){d.dddAction=checked('dddAction');d.dddDetails=readDDDDetails()}current.products=readProducts().length||!document.querySelector('.product-card')?readProducts():current.products;updateWoodTotals()}

function productCard(p,i,service){let assoc='';if(service==='insitu')assoc=`<div class="field full"><label>Tratamientos asociados</label>${checks(`prodTreat_${i}`,['Pulverización','Inyección','Aplicación gel Air Less','Otro'],p.treatments||[])}</div>`;if(service==='termitas')assoc=`<div class="field"><label>Sistema asociado</label><input data-prod="system" value="${esc(p.system||current.data.termSystem||'')}" readonly></div>`;if(service==='ddd')assoc=`<div class="field full"><label>Actuaciones asociadas</label>${checks(`prodAct_${i}`,current.data.dddAction||[],p.actions||[])}</div>`;let qtyLabel=service==='autoclave'?'Cantidad consumida (L)':service==='termitas'?'Cantidad utilizada/repuesta (g)':service==='mobiliario'?'Cantidad utilizada':'Cantidad utilizada';if(service==='insitu')qtyLabel='Cantidad consumida (L)';return `<div class="card product-card" data-prod-index="${i}"><div style="display:flex;gap:8px;align-items:center"><div><b>${esc(p.name)}</b><br><small>${esc(p.maker||'')} · ${esc(p.reg||'')}</small></div><span class="spacer"></span><button class="danger" type="button" onclick="removeProduct(${i})">ELIMINAR</button></div><div class="formgrid">${field('', 'N.º lote (opcional)',p.lot||'','text','data-prod="lot"')}${field('',qtyLabel,p.qty||'','number','min="0" step="any" data-prod="qty"')}${assoc}</div></div>`}

function finalizeSheet(){collect();let d=current.data||{},miss=[];if(!current.number)miss.push('N.º de hoja');if(!current.date)miss.push('Fecha del servicio');let c=current.client||{};if(!c.name||!c.address||!c.contact||!c.phone||!c.email)miss.push('Datos completos del cliente');validateCompany(miss);if(current.type==='autoclave'){if(!d.species)miss.push('Especie de madera');let h=numES(d.humidity);if(!Number.isFinite(h)||h<0||h>100)miss.push('Humedad antes del tratamiento');if(!d.useclass)miss.push('Clase de uso');let complete=(d.woodRows||[]).some(r=>{let u=numES(r.u),l=numES(r.l),a=numES(r.a),g=numES(r.g);return Number.isInteger(u)&&u>=1&&[l,a,g].every(x=>Number.isFinite(x)&&x>=0)});if(!complete)miss.push('Al menos una línea completa de madera');if(!current.products.length)miss.push('Producto protector');if(!d.inDoc||!d.inDate||!d.outDoc||!d.outDate)miss.push('Albaranes y fechas de entrada/salida')}if(current.type==='insitu'){if(!d.treat?.length)miss.push('Tipo de tratamiento');if(d.treat?.includes('Otro')&&!d.otherTreat)miss.push('Especificar otro tratamiento');if(!d.zones)miss.push('Elementos / Zonas tratadas');if(!d.area&&!d.volume)miss.push('Superficie o volumen tratado');if(!d.purpose)miss.push('Finalidad del tratamiento');if(!current.products.length)miss.push('Al menos un producto');if(!d.noSafety&&!d.safetyQty)miss.push('Plazo de seguridad o Sin plazo')}if(current.type==='termitas'){if(!d.termAction)miss.push('Tipo de actuación');if(!d.termSystem)miss.push('Sistema de tratamiento');if(d.termSystem==='Otro'&&!d.otherSystem)miss.push('Especificar otro sistema');if(!d.termZones)miss.push('Zonas tratadas/revisadas');if(!d.installDate)miss.push('Fecha de instalación inicial');if(!current.products.length)miss.push('Al menos un producto');if(d.termSystem==='Sistema de cebos'){if(!(d.stations||[]).length)miss.push('Al menos una estación ES o EP');if(d.termAction==='Revisión'&&(d.stations||[]).some(s=>!s.consumption||!s.replacement))miss.push('Consumo y Reposición en todas las estaciones')}if(d.termSystem==='Barrera química'&&!d.linearMeters)miss.push('Metros lineales tratados')}if(current.type==='ddd'){if(!d.dddAction?.length)miss.push('Al menos un tipo de actuación');for(let a of d.dddDetails||[]){if(!a.pests?.length)miss.push(`Plaga/agente en ${a.action}`);if(a.pests?.includes('Otro')&&!a.pestOther)miss.push(`Especificar otra plaga en ${a.action}`);if(!a.methods?.length)miss.push(`Método de aplicación en ${a.action}`);if(a.methods?.includes('Otro')&&!a.methodOther)miss.push(`Especificar otro método en ${a.action}`);if(!a.zones)miss.push(`Zonas/áreas en ${a.action}`)}if(!current.products.length)miss.push('Al menos un producto');if(!d.noSafety&&!d.safetyQty)miss.push('Plazo de seguridad o Sin plazo');if(!d.result)miss.push('Resultado / Valoración');if(d.result==='Otro'&&!d.resultOther)miss.push('Especificar Resultado / Valoración')}if(current.type==='mobiliario'){if(!d.furnitureFinish)miss.push('Acabado del mobiliario');let complete=(d.furnitureRows||[]).some(r=>{let u=numES(r.units),l=numES(r.length),h=numES(r.height),w=numES(r.width);return Number.isInteger(u)&&u>=1&&[l,h,w].every(x=>Number.isFinite(x)&&x>=0)});if(!complete)miss.push('Al menos un artículo con unidades y medidas');if(!d.furnitureMethod)miss.push('Método de tratamiento');if(!current.products.length)miss.push('Producto protector')}if(miss.length){alert(`Faltan ${miss.length} campos/requisitos:\n• `+miss.join('\n• '));return}if(confirm('¿Quieres finalizar esta hoja de servicio? La hoja seguirá pudiendo editarse posteriormente.')){current.status='FINALIZADA';saveSheet(true);editSheet();setTimeout(()=>alert('Hoja finalizada correctamente.'),50)}}

function updateStates(){document.querySelectorAll('.state').forEach(x=>{x.textContent='Pendiente';x.classList.remove('ok')});let ok=id=>{let e=$('#state_'+id);if(e){e.textContent='Completo';e.classList.add('ok')}};let c=current?.client||{};if(c.name&&c.address&&c.contact&&c.phone&&c.email)ok('client');if(current?.products?.length)ok('product');let d=current?.data||{};if(current?.type==='autoclave'&&d.species&&d.humidity&&d.useclass)ok('wood');if(current?.type==='insitu'&&d.treat?.length&&d.zones&&d.purpose)ok('treatment');if(current?.type==='termitas'){if(d.termAction)ok('action');if(d.termSystem&&d.termZones&&d.installDate)ok('system');if(d.termSystem!=='Sistema de cebos'||d.stations?.length)ok('stations')}if(current?.type==='ddd'&&d.dddAction?.length)ok('actions');if(current?.type==='mobiliario'){if(d.furnitureFinish&&(d.furnitureRows||[]).some(r=>r.units&&r.length&&r.height&&r.width))ok('furniture');if(d.furnitureMethod)ok('furnitureTreatment')}let co=DB.get('config',{});if(co.director&&co.signature)ok('director')}

function pdfMobiliario(s){let d=s.data||{},rows=(d.furnitureRows||[]).filter(r=>r.description||r.units||r.length||r.height||r.width||r.photo),p=s.products||[];return `${pdfHeader(s,'HOJA DE SERVICIO - MOBILIARIO')}${pdfClient(s)}<div class="box"><h2>Datos del mobiliario</h2><b>Acabado:</b> ${pdfText(d.furnitureFinish)}<table class="small mt"><thead><tr><th>Descripción</th><th>Unidades</th><th>Largo (mm)</th><th>Alto (mm)</th><th>Ancho (mm)</th><th>Fotografía</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${pdfText(r.description,'')}</td><td>${pdfText(r.units,'')}</td><td>${pdfText(r.length,'')}</td><td>${pdfText(r.height,'')}</td><td>${pdfText(r.width,'')}</td><td>${r.photo?pdfText(r.photo.name,'Sí'):'—'}</td></tr>`).join(''):'<tr><td colspan="6">—</td></tr>'}</tbody></table></div><div class="notice"><b>AVISO:</b> En mobiliario barnizado o con otros acabados superficiales (pinturas, lacas, etc.), la penetración del producto protector queda limitada principalmente a grietas, orificios producidos por la plaga y zonas de madera sin acabado.</div><div class="grid2"><div><div class="box"><h2>Tratamiento</h2><b>Método:</b> ${pdfText(d.furnitureMethod)}</div><div class="box"><h2>Producto protector</h2>${p.length?p.map(x=>`<div><b>${pdfProductName(x)}</b>${x.lot?' · Lote: '+pdfText(x.lot):''}${x.qty?' · Cantidad: '+pdfText(x.qty):''}</div>`).join(''):'—'}</div></div><div><div class="box cut"><h2>Observaciones generales</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
function pdfBody(s){if(s.type==='autoclave')return pdfAutoclave(s);if(s.type==='insitu')return pdfInsitu(s);if(s.type==='termitas')return pdfTermitas(s);if(s.type==='mobiliario')return pdfMobiliario(s);return pdfDDD(s)}

// ===== MOBILIARIO: FOTOGRAFIAS REALES EN PDF =====
function fileToDataURL(file){return new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file)})}
async function prepareFurniturePdfPhotos(s){if(s.type!=='mobiliario')return;let rows=s.data?.furnitureRows||[];for(let r of rows){if(r.photo?.id){try{let f=await getFile(r.photo.id);r.photo.pdfData=f?await fileToDataURL(f):''}catch(e){console.warn('No se pudo cargar la foto de mobiliario para el PDF',e);r.photo.pdfData=''}}}}
function pdfMobiliario(s){let d=s.data||{},rows=(d.furnitureRows||[]).filter(r=>r.description||r.units||r.length||r.height||r.width||r.photo),p=s.products||[];return `${pdfHeader(s,'HOJA DE SERVICIO - MOBILIARIO')}${pdfClient(s)}<div class="box"><h2>Datos del mobiliario</h2><b>Acabado:</b> ${pdfText(d.furnitureFinish)}<table class="small mt"><thead><tr><th>Descripción</th><th>Unidades</th><th>Largo (mm)</th><th>Alto (mm)</th><th>Ancho (mm)</th><th>Fotografía</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${pdfText(r.description,'')}</td><td>${pdfText(r.units,'')}</td><td>${pdfText(r.length,'')}</td><td>${pdfText(r.height,'')}</td><td>${pdfText(r.width,'')}</td><td style="text-align:center">${r.photo?.pdfData?`<img src="${r.photo.pdfData}" style="display:block;max-width:30mm;max-height:22mm;width:auto;height:auto;object-fit:contain;margin:auto">`:(r.photo?'Foto no disponible':'—')}</td></tr>`).join(''):'<tr><td colspan="6">—</td></tr>'}</tbody></table></div><div class="notice"><b>AVISO:</b> En mobiliario barnizado o con otros acabados superficiales (pinturas, lacas, etc.), la penetración del producto protector queda limitada principalmente a grietas, orificios producidos por la plaga y zonas de madera sin acabado.</div><div class="grid2"><div><div class="box"><h2>Tratamiento</h2><b>Método:</b> ${pdfText(d.furnitureMethod)}</div><div class="box"><h2>Producto protector</h2>${p.length?p.map(x=>`<div><b>${pdfProductName(x)}</b>${x.lot?' · Lote: '+pdfText(x.lot):''}${x.qty?' · Cantidad: '+pdfText(x.qty):''}</div>`).join(''):'—'}</div></div><div><div class="box cut"><h2>Observaciones generales</h2>${pdfText(d.observations)}</div>${pdfDirector()}</div></div>`}
async function prepareInsituPdfPhotos(s){if(s.type!=='insitu')return;let a=s.attachments||[];for(let x of a){x.pdfData='';if(x.id){try{let f=await getFile(x.id);if(f&&((f.type||x.type||'').startsWith('image')))x.pdfData=await fileToDataURL(f)}catch(e){x.pdfData=''}}}}
async function prepareAutoclavePdfPhotos(s){if(s.type!=='autoclave')return;let a=s.data?.cycleAttachments||[];for(let x of a){x.pdfData='';if(x.id){try{let f=await getFile(x.id);if(f&&((f.type||x.type||'').startsWith('image')))x.pdfData=await fileToDataURL(f)}catch(e){console.warn('No se pudo cargar la fotografía de autoclave para el PDF',e);x.pdfData=''}}}}
async function prepareTermitePdfPlan(s){if(s.type!=='termitas')return;let a=s.data?.planAttachments||[];for(let x of a){x.pdfData='';if(x.id&&(x.type||'').startsWith('image')){try{let f=await getFile(x.id);x.pdfData=f?await fileToDataURL(f):''}catch(e){console.warn('No se pudo cargar el plano de termitas para el PDF',e);x.pdfData=''}}}}
async function prepareTermitePdfPhotos(s){if(s.type!=='termitas')return;let a=s.data?.photoAttachments||s.attachments||[];for(let x of a){x.pdfData='';if(x.id){try{let f=await getFile(x.id);if(f&&((f.type||x.type||'').startsWith('image')))x.pdfData=await fileToDataURL(f)}catch(e){console.warn('No se pudo cargar la fotografía de termitas para el PDF',e);x.pdfData=''}}}}
async function printSheet(){if(!saveSheet())return;await prepareFurniturePdfPhotos(current);await prepareInsituPdfPhotos(current);await prepareAutoclavePdfPhotos(current);await prepareTermitePdfPlan(current);await prepareTermitePdfPhotos(current);openPdfPreview(current)}


/* ===== ACCESO CON SUPABASE ===== */
function loginView(message='', email=''){
  current=null; openBlock=null;
  app.innerHTML=`<div class="chooser"><div class="card" style="max-width:520px;margin:40px auto;padding:24px"><h1>Acceso</h1><p>Inicia sesión para entrar en Mis Hojas de Servicio.</p><div class="formgrid"><div class="field full"><label>Correo electrónico</label><input id="loginEmail" type="email" autocomplete="username" value="${esc(email)}"></div><div class="field full"><label>Contraseña</label><input id="loginPassword" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')loginApp()"></div></div>${message?`<div class="notice" role="alert" style="margin-top:12px">${esc(message)}</div>`:''}<p><button type="button" onclick="loginApp()">INICIAR SESIÓN</button></p></div></div>`;
}
function loginErrorMessage(error){
  const msg=String(error?.message||'').toLowerCase();
  if(msg.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos. Comprueba los datos e inténtalo de nuevo.';
  if(msg.includes('email not confirmed')) return 'El correo aún no está confirmado en Supabase. Revisa la confirmación de la cuenta.';
  if(msg.includes('too many requests')||msg.includes('rate limit')) return 'Se han realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
  if(msg.includes('failed to fetch')||msg.includes('network')||msg.includes('fetch')) return 'No se ha podido conectar con Supabase. Comprueba la conexión a Internet e inténtalo de nuevo.';
  if(msg.includes('user not found')) return 'No se encuentra una cuenta con ese correo. Comprueba que el usuario esté creado en Supabase.';
  console.error('Error de inicio de sesión de Supabase:',error);
  return 'Supabase ha rechazado el inicio de sesión. Comprueba el usuario, la contraseña y la configuración del proveedor Email.';
}
async function loginApp(){
  const email=$('#loginEmail')?.value.trim()||'';
  const password=$('#loginPassword')?.value||'';
  if(!email||!password){loginView('Escribe el correo y la contraseña.',email);return}
  const btn=document.querySelector('.chooser button');
  if(btn){btn.disabled=true;btn.textContent='ENTRANDO…'}
  try{
    const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error){loginView(loginErrorMessage(error),email);return}
    if(!data?.session){loginView('Supabase no ha devuelto una sesión válida. Comprueba el usuario y vuelve a intentarlo.',email);return}
    await syncSheetsWithSupabase();home();  }catch(e){
    console.error('No se pudo completar el inicio de sesión:',e);
    loginView(loginErrorMessage(e),email);
  }
}function passwordRecoveryView(message=''){
  app.innerHTML=`
    <div class="chooser">
      <div class="card" style="max-width:520px;margin:40px auto;padding:24px">
        <h1>Nueva contraseña</h1>
        <p>Escribe y confirma una contraseña nueva para tu cuenta.</p>
        ${message?`<div class="notice" role="alert">${esc(message)}</div>`:''}
        <div class="field full"><label for="newPassword">Nueva contraseña</label><input id="newPassword" type="password" autocomplete="new-password"></div>
        <div class="field full"><label for="confirmNewPassword">Repite la contraseña</label><input id="confirmNewPassword" type="password" autocomplete="new-password"></div>
        <p><button type="button" onclick="updateRecoveredPassword()">GUARDAR CONTRASEÑA</button></p>
        <p><button type="button" class="secondary" onclick="history.replaceState(null,'',location.pathname);loginView()">VOLVER AL ACCESO</button></p>
      </div>
    </div>
  `;
}

async function updateRecoveredPassword(){
  const password=document.getElementById('newPassword')?.value||'';
  const confirmation=document.getElementById('confirmNewPassword')?.value||'';
  if(password.length<6){alert('La contraseña debe tener al menos 6 caracteres.');return;}
  if(password!==confirmation){alert('Las contraseñas no coinciden.');return;}
  const {data,error}=await supabaseClient.auth.updateUser({password});
  if(error){alert('No se ha podido cambiar la contraseña: '+error.message);return;}
  alert('Contraseña cambiada correctamente.');
  await supabaseClient.auth.signOut();
  history.replaceState(null,'',location.pathname);
  loginView();
}
async function startApp(){
  try{
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    if(location.hash.includes('type=recovery')){
      if(data?.session) passwordRecoveryView();
      else passwordRecoveryView('El enlace de recuperación no ha iniciado una sesión válida. Solicita un nuevo correo y abre el enlace más reciente.');
      return;
    }
    if(data?.session){await syncSheetsWithSupabase();home();}else loginView();
  }catch(e){
    console.error('No se pudo comprobar la sesión de Supabase:',e);
    if(location.hash.includes('type=recovery')) passwordRecoveryView('No se pudo validar el enlace. Solicita un nuevo correo de recuperación.');
    else loginView('No se ha podido comprobar la sesión. Recarga la página y vuelve a intentarlo.');
  }
}
async function logoutApp(){
  const {error}=await supabaseClient.auth.signOut();
  if(error){console.error('No se pudo cerrar la sesión:',error);alert('No se ha podido cerrar la sesión.');return}
  loginView();
}


/* ===== Mejoras de uso v1.1 (27-10-2026) ===== */
const _mhsOriginalLoginView = loginView;
loginView = function(message='', email=''){
  _mhsOriginalLoginView(message,email);
  const card=app.querySelector('.card');
  if(card && !document.getElementById('mhsRecoveryLink')){
    const p=document.createElement('p');
    p.innerHTML='<button id="mhsRecoveryLink" type="button" class="secondary">RECUPERAR CONTRASEÑA</button>';
    card.appendChild(p);
    document.getElementById('mhsRecoveryLink').onclick=mhsSendRecovery;
  }
};
async function mhsSendRecovery(){
  const email=document.getElementById('loginEmail')?.value.trim()||'';
  if(!email){alert('Escribe primero el correo electrónico de tu cuenta.');return;}
  const redirectTo=location.origin+location.pathname;
  const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});
  if(error){alert('No se pudo enviar el correo de recuperación: '+error.message);return;}
  alert('Si el correo está registrado, recibirás un mensaje para recuperar la contraseña. Revisa también el correo no deseado.');
}
const _mhsOriginalHome=home;
home=function(){
  _mhsOriginalHome();
  const box=app.querySelector('.home');
  if(box&&!document.getElementById('mhsLogout')){
    const b=document.createElement('button');
    b.id='mhsLogout';b.className='secondary';b.textContent='SALIR DE LA APLICACIÓN';
    b.style.marginTop='18px';b.onclick=logoutApp;box.appendChild(b);
  }
};
const _mhsOriginalEditSheet=editSheet;
editSheet=function(id){
  _mhsOriginalEditSheet(id);
  if(!current)return;
  const sheet=document.querySelector('.sheet');
  if(!sheet)return;
  const toolbar=document.querySelector('.toolbar');
  if(toolbar && !toolbar.querySelector('#mhsShareEmail')){
    const emailBtn=document.createElement('button');emailBtn.id='mhsShareEmail';emailBtn.className='secondary';emailBtn.textContent='COMPARTIR PDF POR CORREO';emailBtn.onclick=()=>mhsShareSheet(current.id,'email');toolbar.appendChild(emailBtn);
    const waBtn=document.createElement('button');waBtn.className='secondary';waBtn.textContent='COMPARTIR PDF POR WHATSAPP';waBtn.onclick=()=>mhsShareSheet(current.id,'whatsapp');toolbar.appendChild(waBtn);
  }
  const section=document.createElement('section');
  section.className='accordion mhs-signature';
  section.innerHTML=`<div class="accHead"><span>FIRMA DEL CLIENTE</span><span class="state">${current.clientSignature?'Firmada':'Pendiente'}</span></div>
    <div class="accBody" style="display:block">
      <p>El cliente debe firmar esta hoja. La firma se guarda únicamente en esta hoja de servicio.</p>
      <canvas id="mhsClientSignature" aria-label="Zona para firmar con dedo o lápiz" style="display:block;width:100%;height:180px;touch-action:none;border:1px solid #9aa;padding:0;background:#fff;border-radius:6px"></canvas>
      <div class="rowactions"><button type="button" class="secondary" id="mhsClearSignature">BORRAR FIRMA</button><button type="button" id="mhsSaveSignature">GUARDAR FIRMA</button></div>
      <p class="notice">La firma del cliente no se incluye en el PDF/certificado generado por esta aplicación.</p>
    </div>`;
  sheet.appendChild(section);
  const canvas=document.getElementById('mhsClientSignature');
  const ctx=canvas.getContext('2d');
  let drawing=false, signed=false;
  function fitCanvas(){
    const old=current.clientSignature;
    const rect=canvas.getBoundingClientRect();
    const ratio=Math.max(window.devicePixelRatio||1,1);
    canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.round(180*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
    if(old){const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,rect.width,180);signed=true};img.src=old;}
  }
  fitCanvas();
  function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);drawing=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.1,p.y+.1);ctx.stroke();signed=true;});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>canvas.addEventListener(ev,()=>drawing=false));
  document.getElementById('mhsClearSignature').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);signed=false;current.clientSignature='';section.querySelector('.state').textContent='Pendiente';};
  document.getElementById('mhsSaveSignature').onclick=()=>{if(!signed){alert('Firma primero en el recuadro.');return;}current.clientSignature=canvas.toDataURL('image/png');section.querySelector('.state').textContent='Firmada';if(saveSheet())alert('Firma guardada en esta hoja de servicio.');};
};
const _mhsOriginalCollect=collect;
collect=function(){
  _mhsOriginalCollect();
  const canvas=document.getElementById('mhsClientSignature');
  if(canvas && current){
    try{
      const ctx=canvas.getContext('2d');
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let hasInk=false;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>0){hasInk=true;break;}}
      if(hasInk)current.clientSignature=canvas.toDataURL('image/png');
    }catch(e){console.warn('No se pudo leer la firma en este momento.',e);}
  }
};
/* saveSheet original ya sincroniza con Supabase; no duplicar el upsert. */
/* Importación/exportación de clientes y hojas en JSON */
function mhsDownloadJSON(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function mhsExportAll(){
  mhsDownloadJSON('mis-hojas-servicio-export-'+new Date().toISOString().slice(0,10)+'.json',{
    format:'mis-hojas-servicio-export-v1',exportedAt:new Date().toISOString(),
    clients:DB.get('clients'),sheets:DB.get('sheets')
  });
}
function mhsImportAll(input){
  const file=input.files?.[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const obj=JSON.parse(reader.result);
      if(!obj||(!Array.isArray(obj.clients)&&!Array.isArray(obj.sheets)))throw new Error('El JSON no contiene clientes ni hojas reconocibles.');
      if(!confirm('La importación añadirá los datos del archivo y evitará duplicados por ID. ¿Continuar?'))return;
      const clients=DB.get('clients'),sheets=DB.get('sheets');
      const merge=(old,incoming)=>{const m=new Map(old.map(x=>[x.id,x]));incoming.forEach(x=>{if(x&&x.id)m.set(x.id,x)});return [...m.values()]};
      if(Array.isArray(obj.clients))DB.set('clients',merge(clients,obj.clients));
      if(Array.isArray(obj.sheets)){
        const merged=merge(sheets,obj.sheets);DB.set('sheets',merged);
        (async()=>{for(const s of obj.sheets){try{await saveSheetToSupabase(s)}catch(e){console.error(e)}}alert('Importación terminada. Si alguna hoja no se sincronizó, consulta la consola.');showView('sheets')})();
      }else{alert('Clientes importados.');clientList();}
    }catch(e){alert('No se pudo importar el archivo: '+e.message);}
    input.value='';
  };
  reader.readAsText(file);
}
const _mhsOriginalClientList=clientList;
clientList=function(){
  _mhsOriginalClientList();
  const head=app.querySelector('.listhead');
  if(head){
    const exp=document.createElement('button');exp.className='secondary';exp.textContent='EXPORTAR CLIENTES';exp.onclick=()=>mhsDownloadJSON('clientes-'+new Date().toISOString().slice(0,10)+'.json',{format:'mhs-clients-v1',clients:DB.get('clients')});head.insertBefore(exp,head.firstChild);
    const lab=document.createElement('label');lab.className='secondary';lab.style.cssText='padding:10px 14px;border-radius:8px;cursor:pointer';lab.textContent='IMPORTAR CLIENTES';const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.style.display='none';inp.onchange=()=>mhsImportAll(inp);lab.appendChild(inp);head.insertBefore(lab,head.firstChild); 
  }
};
const _mhsOriginalSheetList=sheetList;
sheetList=function(){
  _mhsOriginalSheetList();
  const head=app.querySelector('.listhead');
  if(head){
    const exp=document.createElement('button');exp.className='secondary';exp.textContent='EXPORTAR HOJAS Y CLIENTES';exp.onclick=mhsExportAll;head.insertBefore(exp,head.firstChild);
    const lab=document.createElement('label');lab.className='secondary';lab.style.cssText='padding:10px 14px;border-radius:8px;cursor:pointer';lab.textContent='IMPORTAR ARCHIVO';const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.style.display='none';inp.onchange=()=>mhsImportAll(inp);lab.appendChild(inp);head.insertBefore(lab,head.firstChild);
  }
};
/* Compartir PDF: usa la hoja nativa del dispositivo para compartir el archivo real cuando esté disponible. */
async function mhsBuildPdfBlob(sheet, asCertificate=false){
  if(typeof html2pdf==='undefined') throw new Error('No se ha podido cargar el generador PDF. Comprueba la conexión y vuelve a intentarlo.');
  const s=JSON.parse(JSON.stringify(sheet));
  await prepareFurniturePdfPhotos(s); await prepareInsituPdfPhotos(s); await prepareAutoclavePdfPhotos(s); await prepareTermitePdfPlan(s); await prepareTermitePdfPhotos(s);
  const css=pdfBaseCss()+`@page{size:A4 portrait;margin:7mm}body{width:auto;height:auto;overflow:visible;margin:0}.page{width:196mm;min-height:283mm;overflow:visible;padding-bottom:10mm;margin:auto}.head{grid-template-columns:42mm 1fr 40mm}`;
  let body=pdfBody(asCertificate?{...s,clientSignature:undefined}:s);
  if(asCertificate) body=body.replace(/HOJA DE SERVICIO/g,'CERTIFICADO DE TRATAMIENTO');
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-20000px;top:0;width:196mm;background:#fff;z-index:-1;';
  host.innerHTML=`<style>${css}</style><div class="page">${body}${asCertificate?'<div class="footer">Certificado generado desde Mis Hojas de Servicio · Firma del cliente excluida</div>':''}</div>`;
  document.body.appendChild(host);
  try{
    const imgs=[...host.querySelectorAll('img')];
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;setTimeout(resolve,5000)})));
    return await html2pdf().set({
      margin:7,
      filename:`${asCertificate?'certificado':'hoja-servicio'}-${(s.number||'sin-numero').replace(/[^a-z0-9_-]/gi,'_')}.pdf`,
      image:{type:'jpeg',quality:0.96},
      html2canvas:{scale:2,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',logging:false},
      jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
      pagebreak:{mode:['css','legacy']}
    }).from(host.querySelector('.page')).outputPdf('blob');
  } finally {host.remove();}
}
function mhsDownloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function mhsShareSheet(id,channel,asCertificate=false){
  const s=DB.get('sheets').find(x=>x.id===id);if(!s)return;
  const title=`${asCertificate?'Certificado':'Hoja de servicio'} ${s.number||''}`.trim();
  const msg=`${title}\nFecha: ${s.date||''}\nCliente: ${s.client?.name||''}\nTipo: ${types[s.type]||s.type}`;
  const filename=`${asCertificate?'certificado':'hoja-servicio'}-${(s.number||'sin-numero').replace(/[^a-z0-9_-]/gi,'_')}.pdf`;
  try{
    if(channel==='email'&&!s.client?.email) {if(!confirm('Esta hoja no tiene correo del cliente. ¿Continuar para elegir destinatario?'))return;}
    const blob=await mhsBuildPdfBlob(s,asCertificate);
    const file=new File([blob],filename,{type:'application/pdf'});
    if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title,text:msg});
      return;
    }
    mhsDownloadBlob(blob,filename);
    const note='El navegador no permite adjuntar archivos automáticamente. El PDF se ha descargado; adjúntalo al mensaje que se abrirá.';
    alert(note);
    if(channel==='email'){
      const to=s.client?.email||'';
      location.href='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent(title)+'&body='+encodeURIComponent(msg+'\n\nAdjunto el PDF generado.');
    }else{
      window.open('https://wa.me/?text='+encodeURIComponent(msg+'\n\nTe envío el PDF generado.'),'_blank','noopener');
    }
  }catch(e){console.error('Error al generar/compartir el PDF:',e);alert('No se pudo generar o compartir el PDF. '+(e?.message||'Comprueba la conexión e inténtalo de nuevo.'));}
}
const _mhsOriginalCerts=certs;
certs=function(){
  const sheets=DB.get('sheets');
  app.innerHTML=`<div class="list"><div class="listhead"><button class="secondary" onclick="home()">← INICIO</button><button onclick="mhsExportAll()">EXPORTAR DATOS</button></div><div class="card"><h1>Certificados</h1><p>El PDF de certificado se genera sin incluir la firma del cliente.</p><table><thead><tr><th>N.º hoja</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>${sheets.map(s=>`<tr><td>${esc(s.number||'')}</td><td>${esc(s.date||'')}</td><td>${esc(s.client?.name||'')}</td><td>${esc(types[s.type]||s.type||'')}</td><td><button onclick="mhsOpenCertificate('${s.id}')">CERTIFICADO PDF</button> <button class="secondary" onclick="mhsShareSheet('${s.id}','email',true)">COMPARTIR CERTIFICADO POR CORREO</button> <button class="secondary" onclick="mhsShareSheet('${s.id}','whatsapp',true)">COMPARTIR CERTIFICADO POR WHATSAPP</button></td></tr>`).join('')||'<tr><td colspan="5">No hay hojas guardadas.</td></tr>'}</tbody></table></div></div>`;
};
async function mhsOpenCertificate(id){
  const original=DB.get('sheets').find(x=>x.id===id);if(!original)return;
  const w=window.open('','_blank');if(!w){alert('Permite ventanas emergentes para generar el certificado.');return;}
  w.document.write('<!doctype html><html lang="es"><meta charset="utf-8"><title>Preparando certificado</title><body style="font-family:Arial;padding:24px">Preparando certificado…</body></html>');
  const s=JSON.parse(JSON.stringify(original));
  try{
    await prepareFurniturePdfPhotos(s);await prepareInsituPdfPhotos(s);await prepareAutoclavePdfPhotos(s);await prepareTermitePdfPlan(s);await prepareTermitePdfPhotos(s);
    let css=pdfBaseCss()+`@page{size:A4 portrait;margin:7mm}body{width:auto;height:auto;overflow:visible;margin:0}.page{width:196mm;height:auto;min-height:283mm;overflow:visible;padding-bottom:10mm;margin:auto}.head{grid-template-columns:42mm 1fr 40mm}`;
    let body=pdfBody({...s,clientSignature:undefined}).replace(/HOJA DE SERVICIO/g,'CERTIFICADO DE TRATAMIENTO');
    const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado ${esc(s.number||'')}</title><style>${css}</style></head><body><div class="page">${body}<div class="footer">Certificado generado desde Mis Hojas de Servicio · Firma del cliente excluida</div></div><script>setTimeout(()=>window.print(),700)<\/script></body></html>`;
    w.document.open();w.document.write(html);w.document.close();
  }catch(e){console.error('No se pudo preparar el certificado:',e);w.document.body.textContent='No se pudo preparar el certificado. Vuelve a intentarlo y consulta la consola si persiste.';}
}


// ===== REVISION 2026-10-27: sincronizacion y firma de cliente =====
// La hoja PDF incluye la firma del cliente. El certificado la excluye expresamente.
const _mhsPdfBodyWithoutClientSignature = pdfBody;
pdfBody=function(s){
  const body=_mhsPdfBodyWithoutClientSignature(s);
  if(!s?.clientSignature) return body;
  return body+`<div class="box" style="break-inside:avoid;page-break-inside:avoid"><h2>Firma del cliente</h2><div class="sign"><img src="${s.clientSignature}" style="display:block;max-width:80mm;max-height:30mm;object-fit:contain;margin:2mm 0"></div></div>`;
};

async function mhsPersistCurrentConfirmed(){
  if(!current) return false;
  collect();
  const all=DB.get('sheets')||[];
  if(current.number){
    const dup=all.find(x=>(x.number||'').toLowerCase()===current.number.toLowerCase()&&x.id!==current.id);
    if(dup){alert('Este N.º de hoja ya existe. Introduce otro número.');return false;}
  }
  const hasData=current.number||current.client?.name||Object.values(current.data||{}).some(v=>Array.isArray(v)?v.length:!!v)||current.clientSignature;
  if(current.status==='PENDIENTE'&&hasData) current.status='EN PROCESO';
  current.modified=new Date().toISOString().slice(0,10);
  const i=all.findIndex(x=>x.id===current.id);
  if(i<0) all.unshift(current); else all[i]=current;
  DB.set('sheets',all);
  const ok=await saveSheetToSupabase(current);
  return ok===true;
}

function mhsCanvasHasInk(canvas){
  try{
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=3;i<data.length;i+=4){if(data[i]>0)return true;}
  }catch(e){console.warn('No se pudo comprobar la firma:',e);}
  return false;
}

const _mhsEditSheetConfirmedSignature=editSheet;
editSheet=function(id){
  _mhsEditSheetConfirmedSignature(id);
  const canvas=document.getElementById('mhsClientSignature');
  const saveBtn=document.getElementById('mhsSaveSignature');
  const clearBtn=document.getElementById('mhsClearSignature');
  const section=document.querySelector('.mhs-signature');
  if(canvas&&saveBtn){
    saveBtn.onclick=async()=>{
      if(!mhsCanvasHasInk(canvas)){alert('Firma primero en el recuadro.');return;}
      saveBtn.disabled=true;saveBtn.textContent='GUARDANDO…';
      try{
        current.clientSignature=canvas.toDataURL('image/png');
        if(section) section.querySelector('.state').textContent='Guardando…';
        const ok=await mhsPersistCurrentConfirmed();
        if(!ok) throw new Error('Supabase no confirmó el guardado.');
        if(section) section.querySelector('.state').textContent='Firmada';
        alert('Firma guardada y sincronizada correctamente.');
      }catch(e){
        console.error('No se pudo guardar la firma:',e);
        if(section) section.querySelector('.state').textContent='Pendiente';
        alert('No se ha podido guardar la firma en Supabase. Comprueba la conexión y vuelve a intentarlo.');
      }finally{saveBtn.disabled=false;saveBtn.textContent='GUARDAR FIRMA';}
    };
  }
  if(canvas&&clearBtn){
    clearBtn.onclick=async()=>{
      canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      current.clientSignature='';
      if(section) section.querySelector('.state').textContent='Guardando…';
      const ok=await mhsPersistCurrentConfirmed();
      if(section) section.querySelector('.state').textContent=ok?'Pendiente':'Error al guardar';
      if(!ok) alert('La firma se ha borrado en pantalla, pero Supabase no confirmó el cambio.');
    };
  }
};

// Al entrar en la lista de hojas, siempre se descarga primero la version actual de Supabase.
const _mhsSheetListWithImportExport=sheetList;
sheetList=async function(){
  try{await syncSheetsWithSupabase();}
  catch(e){console.error('No se pudieron actualizar las hojas antes de mostrar la lista:',e);}
  _mhsSheetListWithImportExport();
};

let _mhsBackgroundSyncBusy=false;
async function mhsBackgroundSync(){
  if(_mhsBackgroundSyncBusy) return;
  if(document.querySelector('.sheet')) return; // no pisar una hoja mientras se esta editando
  _mhsBackgroundSyncBusy=true;
  try{
    const {data}=await supabaseClient.auth.getSession();
    if(!data?.session) return;
    await syncSheetsWithSupabase();
    if(document.getElementById('sheetRows')) renderSheetRows();
  }catch(e){console.warn('Sincronizacion automatica pendiente:',e);}
  finally{_mhsBackgroundSyncBusy=false;}
}
window.addEventListener('focus',mhsBackgroundSync);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')mhsBackgroundSync();});


/* ===== SINCRONIZACION DE DATOS DE EMPRESA CON SUPABASE (28-10-2026) ===== */
async function mhsLoadCompanyConfigFromSupabase(){
  try{
    const {data:{user},error:authError}=await supabaseClient.auth.getUser();
    if(authError) throw authError;
    if(!user) return null;

    const {data:rows,error}=await supabaseClient
      .from('app_data')
      .select('id,data,updated_at')
      .eq('data_type','config')
      .eq('record_id','company')
      .order('updated_at',{ascending:false})
      .limit(1);
    if(error) throw error;

    const row=(rows||[])[0];
    if(row?.data && typeof row.data==='object'){
      DB.set('config',row.data);
      return row.data;
    }
    return null;
  }catch(e){
    console.error('No se pudieron cargar los datos de empresa desde Supabase:',e);
    return null;
  }
}

async function mhsSaveCompanyConfigToSupabase(configData){
  const {data:{user},error:authError}=await supabaseClient.auth.getUser();
  if(authError) throw authError;
  if(!user) throw new Error('No hay una sesión iniciada en Supabase.');

  const {data:rows,error:readError}=await supabaseClient
    .from('app_data')
    .select('id')
    .eq('data_type','config')
    .eq('record_id','company')
    .limit(1);
  if(readError) throw readError;

  const existing=(rows||[])[0];
  if(existing?.id){
    const {error}=await supabaseClient
      .from('app_data')
      .update({data:configData})
      .eq('id',existing.id);
    if(error) throw error;
  }else{
    const {error}=await supabaseClient
      .from('app_data')
      .insert({
        user_id:user.id,
        data_type:'config',
        record_id:'company',
        data:configData
      });
    if(error) throw error;
  }
  DB.set('config',configData);
  return true;
}

const _mhsConfigLocalView=config;
config=async function(){
  // Si existe una configuración en la nube, tiene prioridad sobre la copia local.
  // Si todavía no existe, se conserva la copia local del dispositivo hasta que el usuario pulse GUARDAR.
  try{await mhsLoadCompanyConfigFromSupabase();}
  catch(e){console.warn('Se mostrará la configuración local porque no se pudo leer Supabase.',e);}
  _mhsConfigLocalView();
};

const _mhsSaveConfigLocal=saveConfig;
saveConfig=async function(){
  const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='GUARDAR');
  if(btn){btn.disabled=true;btn.textContent='GUARDANDO…';}
  try{
    let old=DB.get('config',{}),logo=$('#logoFile')?.files?.[0],sig=$('#signatureFile')?.files?.[0];
    let c={
      ...old,
      name:val('coName'),
      roesb:val('roesb'),
      address:val('coAddr'),
      phone:val('coPhone'),
      email:val('coEmail'),
      director:val('directorName')
    };
    if(logo)c.logo=await toDataURL(logo);
    if(sig)c.signature=await toDataURL(sig);

    await mhsSaveCompanyConfigToSupabase(c);
    alert('Configuración de empresa guardada y sincronizada correctamente.');
    home();
  }catch(e){
    console.error('No se pudieron sincronizar los datos de empresa:',e);
    alert('No se han podido guardar los datos de empresa en Supabase. No se ha sobrescrito la configuración de la nube. Comprueba la conexión y vuelve a intentarlo.');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='GUARDAR';}
  }
};

// Cuando la sesión esté disponible, descargar la configuración de empresa si ya existe en Supabase.
supabaseClient.auth.onAuthStateChange((event,session)=>{
  if(session && ['INITIAL_SESSION','SIGNED_IN','TOKEN_REFRESHED'].includes(event)){
    setTimeout(()=>mhsLoadCompanyConfigFromSupabase(),0);
  }
});

// Al volver a la aplicación desde otro dispositivo, actualizar también la configuración de empresa.
window.addEventListener('focus',()=>{mhsLoadCompanyConfigFromSupabase();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')mhsLoadCompanyConfigFromSupabase();});

/* ===== BORRADO DE DATOS DE EMPRESA SOLO PARA ADMINISTRADOR (28-10-2026) ===== */
const MHS_ADMIN_EMAIL='autoclavesarbide@gmail.com';
function mhsIsAdminUser(user){
  return String(user?.email||'').trim().toLowerCase()===MHS_ADMIN_EMAIL;
}

async function mhsDeleteCompanyConfigAdmin(){
  try{
    const {data:{user},error:authError}=await supabaseClient.auth.getUser();
    if(authError) throw authError;
    if(!user || !mhsIsAdminUser(user)){
      alert('Esta función está disponible únicamente para el usuario administrador.');
      return;
    }
    if(!confirm('¿Seguro que quieres borrar TODOS los datos de empresa, incluido logotipo y firma del Director Técnico?')) return;
    if(!confirm('Esta acción dejará vacía la configuración de empresa en todos los dispositivos sincronizados. ¿Continuar?')) return;

    const emptyConfig={};
    const {data:rows,error:readError}=await supabaseClient
      .from('app_data')
      .select('id')
      .eq('data_type','config')
      .eq('record_id','company')
      .limit(1);
    if(readError) throw readError;

    const existing=(rows||[])[0];
    if(existing?.id){
      const {error}=await supabaseClient
        .from('app_data')
        .update({data:emptyConfig})
        .eq('id',existing.id)
        .eq('user_id',user.id);
      if(error) throw error;
    }else{
      const {error}=await supabaseClient
        .from('app_data')
        .insert({
          user_id:user.id,
          data_type:'config',
          record_id:'company',
          data:emptyConfig
        });
      if(error) throw error;
    }

    DB.mem.config=emptyConfig;
    try{localStorage.setItem('mhs_config',JSON.stringify(emptyConfig));}catch(e){console.warn('No se pudo actualizar la copia local de configuración.',e);}
    alert('Datos de empresa borrados y sincronizados correctamente.');
    config();
  }catch(e){
    console.error('No se pudieron borrar los datos de empresa:',e);
    alert('No se han podido borrar los datos de empresa en Supabase. No se ha modificado la configuración sincronizada.');
  }
}

const _mhsConfigWithCompanySync=config;
config=async function(){
  await _mhsConfigWithCompanySync();
  try{
    const {data:{user}}=await supabaseClient.auth.getUser();
    if(!mhsIsAdminUser(user)) return;
    const actions=document.querySelector('.rowactions');
    if(!actions || document.getElementById('mhsDeleteCompanyBtn')) return;
    const btn=document.createElement('button');
    btn.id='mhsDeleteCompanyBtn';
    btn.type='button';
    btn.className='secondary';
    btn.textContent='BORRAR DATOS DE EMPRESA';
    btn.onclick=mhsDeleteCompanyConfigAdmin;
    actions.insertBefore(btn,actions.firstChild);
  }catch(e){console.warn('No se pudo comprobar el usuario administrador para la configuración.',e);}
};


/* ===== SINCRONIZACION DEL CATALOGO DE PRODUCTOS ENTRE DISPOSITIVOS =====
   Guarda el catálogo compartido en app_data (igual que la configuración de empresa).
   Las hojas conservan su copia histórica de cada producto. */
async function mhsLoadProductCatalogFromSupabase(){
  const {data:{user},error:authError}=await supabaseClient.auth.getUser();
  if(authError) throw authError;
  if(!user) return DB.get('products',[])||[];

  const {data:rows,error}=await supabaseClient
    .from('app_data')
    .select('id,data,updated_at')
    .eq('user_id',user.id)
    .eq('data_type','products')
    .eq('record_id','catalog')
    .order('updated_at',{ascending:false})
    .limit(1);
  if(error) throw error;

  const row=(rows||[])[0];
  if(row && Array.isArray(row.data)){
    DB.set('products',row.data);
    return row.data;
  }

  // Migración inicial: si este dispositivo ya tiene un catálogo local, súbelo
  // solo cuando aún no existe catálogo compartido. No crea catálogos vacíos.
  const local=DB.get('products',[])||[];
  if(!row && local.length){
    await mhsSaveProductCatalogToSupabase(local,user.id);
  }
  return local;
}

async function mhsSaveProductCatalogToSupabase(products,userId){
  let uid=typeof userId==='string'?userId:userId?.id;
  if(!uid){
    const {data:{user:currentUser},error:authError}=await supabaseClient.auth.getUser();
    if(authError) throw authError;
    uid=currentUser?.id;
  }
  if(!uid) throw new Error('No hay una sesión iniciada en Supabase.');

  const {data:rows,error:readError}=await supabaseClient
    .from('app_data')
    .select('id')
    .eq('user_id',uid)
    .eq('data_type','products')
    .eq('record_id','catalog')
    .limit(1);
  if(readError) throw readError;

  const existing=(rows||[])[0];
  if(existing?.id){
    const {error}=await supabaseClient
      .from('app_data')
      .update({data:products,updated_at:new Date().toISOString()})
      .eq('id',existing.id)
      .eq('user_id',uid);
    if(error) throw error;
  }else{
    const {error}=await supabaseClient
      .from('app_data')
      .insert({user_id:uid,data_type:'products',record_id:'catalog',data:products});
    if(error) throw error;
  }
  DB.set('products',products);
  return products;
}

const _mhsOriginalProductListForSync=productList;
productList=async function(){
  try{ await mhsLoadProductCatalogFromSupabase(); }
  catch(e){
    console.error('No se pudo sincronizar el catálogo de productos:',e);
    alert('No se ha podido actualizar el catálogo compartido. Comprueba la conexión e inténtalo de nuevo. No se han borrado productos.');
  }
  _mhsOriginalProductListForSync();
};

const _mhsOriginalPickProductForSync=pickProduct;
pickProduct=async function(){
  try{ await mhsLoadProductCatalogFromSupabase(); }
  catch(e){ console.error('No se pudo actualizar el catálogo antes de elegir un producto:',e); }
  _mhsOriginalPickProductForSync();
};

saveProductModal=async function(){
  const p={id:crypto.randomUUID(),name:$('#pn').value,maker:$('#pm').value,reg:$('#pr').value,active:$('#pa').value,expiry:$('#pe').value};
  if(Object.values(p).slice(1).some(x=>!x)){alert('Completa los cinco datos del producto.');return;}
  try{
    const existing=await mhsLoadProductCatalogFromSupabase();
    const products=Array.isArray(existing)?existing.slice():[];
    products.push(p);
    await mhsSaveProductCatalogToSupabase(products);
    closeModal();
    if(current) await pickProduct();
    else _mhsOriginalProductListForSync();
  }catch(e){
    console.error('No se pudo guardar el producto en el catálogo compartido:',e);
    alert('No se ha podido sincronizar el producto. No cierres la aplicación; comprueba la conexión y vuelve a intentarlo.');
  }
};

deleteCatalogProduct=async function(id){
  try{
    await mhsLoadProductCatalogFromSupabase();
    const products=DB.get('products',[])||[];
    const p=products.find(x=>x.id===id);
    if(!p)return;
    if(!confirm(`¿Eliminar “${p.name}” del catálogo de productos?`))return;
    if(!confirm('Las hojas existentes conservarán los datos del producto, pero ya no aparecerá para nuevas hojas. ¿Continuar?'))return;
    const updated=products.filter(x=>x.id!==id);
    await mhsSaveProductCatalogToSupabase(updated);
    _mhsOriginalProductListForSync();
  }catch(e){
    console.error('No se pudo eliminar el producto del catálogo compartido:',e);
    alert('No se ha podido sincronizar el borrado. El producto no se ha eliminado del catálogo compartido. Comprueba la conexión e inténtalo de nuevo.');
  }
};

// Al volver a la aplicación, refresca el catálogo si está abierta esa pantalla.
async function mhsRefreshProductCatalogOnReturn(){
  const firstButton=app.querySelector('.listhead button');
  if(!firstButton || !firstButton.textContent.includes('NUEVO PRODUCTO')) return;
  try{
    await mhsLoadProductCatalogFromSupabase();
    _mhsOriginalProductListForSync();
  }catch(e){ console.warn('Sincronización del catálogo pendiente:',e); }
}
window.addEventListener('focus',mhsRefreshProductCatalogOnReturn);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')mhsRefreshProductCatalogOnReturn();});
