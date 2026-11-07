(function(){
'use strict';
const btn=document.getElementById('btnDocsPilot');
if(!btn)return;
const docs=[["Autoclave · Hoja de servicio", "AUTOCLAVE_HOJA_SERVICIO_APROBADA.pdf", "Visual aprobada"], ["Autoclave · Albarán", "AUTOCLAVE_ALBARAN_APROBADO.pdf", "Visual aprobada"], ["Autoclave · Factura", "AUTOCLAVE_FACTURA_APROBADA.pdf", "Visual conforme"], ["Mobiliario · Hoja de servicio", "MOBILIARIO_HOJA_SERVICIO_REFERENCIA.pdf", "Pendiente de corregir superposición; tratamiento AUTOCLAVE / INSITU GEL en el formulario"], ["Mobiliario · Albarán", "MOBILIARIO_ALBARAN_REFERENCIA.pdf", "Referencia de revisión"], ["Mobiliario · Factura", "MOBILIARIO_FACTURA_REFERENCIA.pdf", "Referencia de revisión"]];
btn.addEventListener('click',function(){
 document.querySelectorAll('.side-link').forEach(n=>n.classList.remove('active'));
 btn.classList.add('active');
 const app=document.getElementById('app');
 const title='<section class="hero"><div><h1>Plantillas A4 · v54</h1><p>Comparación visual; los documentos de referencia NO sustituyen todavía a la impresión dinámica del servicio. Completa un servicio y contrasta su documento impreso con estos modelos.</p></div></section>';
 app.innerHTML=title+docs.map(([name,file,status])=>'<section class="panel" style="padding:16px;margin:12px 0"><h3>'+name+'</h3><p>'+status+'</p><a class="btn" target="_blank" rel="noopener" href="plantillas-aprobadas/'+file+'">Abrir PDF de referencia</a></section>').join('')+'<section class="panel" style="padding:16px"><b>Prueba real:</b> comprobar clientes, productos, medidas, fotos, firmas, impresión y facturación. No emitir facturas fiscales desde esta rama.</section>';
});
})();