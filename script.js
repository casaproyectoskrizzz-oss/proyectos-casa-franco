// ═══════════════════════════════════════════
//  CASA MANAGER — script.js v4 (con notificaciones)
// ═══════════════════════════════════════════
 
const SUPA_URL = 'https://wiewpmkgsbsxgwljnhmu.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZXdwbWtnc2JzeGd3bGpuaG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Mjk3MjUsImV4cCI6MjA5NzEwNTcyNX0.UxfZBpVwkWvGNsJpx3BnJxM9NHMF76-A3lYTIfIU8GM';
const OS_APP_ID = '4ed3441f-9cee-4358-8f8b-4f48e20077af';
const OS_API_KEY = 'os_v2_app_j3juih445zbvrd4lj5eoeadxv6lp5ajbmb6emyvdzyznrxwy56qhhvxgsmzipdysi77gruhmdc3vu4ylbphyfsr7ycp7ypixh4t3ady';
 
// ── ONESIGNAL ──────────────────────────────
window.OneSignalDeferred = window.OneSignalDeferred || [];
 
let sb;
window.addEventListener('load', function() {
  sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  initOneSignal();
});
 
let osInitDone = false;
 
async function initOneSignal() {
  window.OneSignalDeferred.push(async function(OneSignal) {
    if (osInitDone) { console.log('OneSignal ya estaba inicializado'); return; }
    try {
      await OneSignal.init({
        appId: OS_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        notifyButton: { enable: false },
      });
      osInitDone = true;
      console.log('OneSignal init OK');
    } catch(e) { console.log('OneSignal init error:', e); }
  });
}
 
async function pedirPermisoYGuardarToken() {
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      await OneSignal.User.PushSubscription.optIn();
 
      // Esperar un poco a que el navegador termine de registrar el token
      let osId = OneSignal.User.PushSubscription.id;
      let intentos = 0;
      while (!osId && intentos < 10) {
        await new Promise(r => setTimeout(r, 500));
        osId = OneSignal.User.PushSubscription.id;
        intentos++;
      }
 
      if (osId && ME) {
        await sb.from('push_tokens').upsert({
          empleado_id: ME.id,
          onesignal_id: osId,
        }, { onConflict: 'empleado_id,onesignal_id' });
        console.log('Token guardado:', osId);
      } else {
        console.log('Sin osId después de esperar.');
      }
    } catch(e) { console.log('Error en optIn/token:', e); }
  });
}
 
async function sendNotification(empleadoId, titulo, mensaje) {
  try {
    const { data: tokens } = await sb.from('push_tokens')
      .select('onesignal_id').eq('empleado_id', empleadoId);
    if (!tokens || tokens.length === 0) return;
    const ids = tokens.map(t => t.onesignal_id);
    await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${OS_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: OS_APP_ID,
        include_subscription_ids: ids,
        headings: { en: titulo },
        contents: { en: mensaje },
        small_icon: 'house',
      }),
    });
  } catch(e) { console.log('Notif error:', e); }
}
 
// ── CONFIG ROLES ───────────────────────────
const ROLES = {
  admin:      { label: 'Administrador',     badge: 'badge-admin',    avatarBg: '#7c3cff22', avatarColor: '#7c3cff' },
  encargado:  { label: 'Encargado',         badge: 'badge-encargado',avatarBg: '#00ffe722', avatarColor: '#00ffe7' },
  trabajador: { label: 'Trabajador',        badge: 'badge-pintura',  avatarBg: '#58a6ff22', avatarColor: '#58a6ff' },
};
 
const TIPOS = {
  pintura:    { label: 'Pintura',     badge: 'badge-pintura',  icon: '🎨' },
  tecnico:    { label: 'Técnico',     badge: 'badge-tecnico',  icon: '🔧' },
  limpieza:   { label: 'Limpieza',    badge: 'badge-limpieza', icon: '🧹' },
  supervision:{ label: 'Supervisión', badge: 'badge-encargado',icon: '👁' },
};
 
const NAV = {
  admin:     [{ id:'resumen', icon:'📊', label:'Resumen' },{ id:'casas', icon:'🏠', label:'Casas' },{ id:'vacantes', icon:'📢', label:'Vacantes' },{ id:'empleados', icon:'👤', label:'Empleados' },{ id:'tareas', icon:'✅', label:'Tareas' },{ id:'equipo', icon:'👥', label:'Equipo y pagos' },{ id:'cotizacion', icon:'📋', label:'Cotización' },{ id:'mi-perfil', icon:'🔑', label:'Mi perfil' }],
  encargado: [{ id:'resumen', icon:'📊', label:'Resumen' },{ id:'casas', icon:'🏠', label:'Casas' },{ id:'mis-tareas', icon:'✅', label:'Mis tareas' },{ id:'trabajos-disponibles', icon:'📢', label:'Trabajos disponibles' },{ id:'equipo', icon:'👥', label:'Equipo y pagos' },{ id:'mi-perfil', icon:'🔑', label:'Mi perfil' }],
  trabajador:[{ id:'mis-tareas', icon:'✅', label:'Mis tareas' },{ id:'trabajos-disponibles', icon:'📢', label:'Trabajos disponibles' },{ id:'mis-pagos', icon:'💰', label:'Mis pagos' },{ id:'mi-perfil', icon:'🔑', label:'Mi perfil' }],
};
 
// ── ESTADO ─────────────────────────────────
let ME = null;
let currentPage = null;
let tareasPredef = [];
let empleados = [];
let casas = [];
let materiales = []; // lista de materiales de la cotización actual: {nombre, precio, cantidad}
 
// ── HELPERS ────────────────────────────────
function $(id) { return document.getElementById(id); }
const fmtMoney = n => '$' + Number(n||0).toLocaleString('es-MX');
const fmtDate  = d => d ? new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '';
const fmtDT    = iso => iso ? new Date(iso).toLocaleDateString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
const isOver   = t => !t.done && t.fecha_limite && new Date(t.fecha_limite) < new Date();
const initials = n => n ? n.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase() : '??';
 
function rolBadge(rol) { return `<span class="badge badge-${rol==='trabajador'?'pintura':rol}">${ROLES[rol]?.label||rol}</span>`; }
function tipoBadge(tipo) { if (!tipo) return ''; return `<span class="badge ${TIPOS[tipo]?.badge||''}">${TIPOS[tipo]?.icon||''} ${TIPOS[tipo]?.label||tipo}</span>`; }
function taskBadge(t) {
  if (t.done) return '<span class="badge badge-completa">✓ Completa</span>';
  if (isOver(t)) return '<span class="badge badge-vencida">⚠ Vencida</span>';
  return '<span class="badge badge-pendiente">⏳ Pendiente</span>';
}
function empName(id) { const e = empleados.find(e=>e.id===id); return e ? e.nombre : '—'; }
function casaNombre(id) { const c = casas.find(c=>c.id===id); return c ? c.nombre : '—'; }
function fechasCasaHTML(casa) {
  if (!casa || (!casa.fecha_inicio && !casa.fecha_fin)) return '';
  return `<div style="font-size:11px;color:var(--text3);margin-top:2px">
    ${casa.fecha_inicio?`🟢 Inicio: ${fmtDate(casa.fecha_inicio)}`:''}
    ${casa.fecha_inicio&&casa.fecha_fin?' · ':''}
    ${casa.fecha_fin?`🏁 Culminación: ${fmtDate(casa.fecha_fin)}`:''}
  </div>`;
}
 
// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
function fillDemo(email) { $('loginEmail').value = email; $('loginPass').value = ''; $('loginPass').focus(); }
 
async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pass  = $('loginPass').value;
  $('loginError').textContent = 'Entrando...';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { $('loginError').textContent = 'Correo o contraseña incorrectos.'; return; }
  if (data.user) {
    const { data: perfil } = await sb.from('perfiles').select('*').eq('id', data.user.id).single();
    if (!perfil) { $('loginError').textContent = 'Perfil no encontrado.'; return; }
    ME = perfil;
    await loadGlobal();
    $('loginScreen').classList.add('hidden');
    $('mainApp').classList.remove('hidden');
    $('loginError').textContent = '';
    initApp();
    pedirPermisoYGuardarToken();
  }
}
 
async function logout() {
  await sb.auth.signOut();
  ME = null;
  $('mainApp').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('loginEmail').value = '';
  $('loginPass').value = '';
}
 
async function loadGlobal() {
  const [{ data: tp }, { data: emp }, { data: cs }] = await Promise.all([
    sb.from('tareas_predefinidas').select('*').order('rol').order('orden'),
    sb.from('perfiles').select('*').order('nombre'),
    sb.from('casas').select('*').order('creado_en', { ascending: false }),
  ]);
  tareasPredef = tp || [];
  empleados    = emp || [];
  casas        = cs || [];
}
 
// ═══════════════════════════════════════════
//  INIT APP
// ═══════════════════════════════════════════
function initApp() {
  const rc = ROLES[ME.rol];
  const av = $('sidebarAvatar');
  av.textContent = initials(ME.nombre);
  av.style.background = rc.avatarBg;
  av.style.color = rc.avatarColor;
  $('sidebarName').textContent = ME.nombre;
  $('sidebarRoleBadge').innerHTML = `<span class="badge ${rc.badge}">${rc.label}</span>`;
  $('sidebarNav').innerHTML = NAV[ME.rol].map(n =>
    `<div class="nav-item" data-page="${n.id}" onclick="goTo('${n.id}')">
      <span class="nav-icon">${n.icon}</span><span>${n.label}</span>
    </div>`).join('');
  goTo(NAV[ME.rol][0].id);
}
 
async function goTo(pageId) {
  closeSidebar();
  currentPage = pageId;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === pageId));
  $('pageContent').innerHTML = '<div class="loading">Cargando...</div>';
  switch(pageId) {
    case 'resumen':    await renderResumen(); break;
    case 'casas':      await renderCasas(); break;
    case 'empleados':  await renderEmpleados(); break;
    case 'tareas':     await renderTareas(); break;
    case 'mis-tareas': await renderMisTareas(); break;
    case 'mis-pagos':  await renderMisPagos(); break;
    case 'equipo':     await renderEquipo(); break;
    case 'cotizacion': await renderCotizacion(); break;
    case 'mi-perfil':  await renderMiPerfil(); break;
    case 'vacantes':   await renderVacantes(); break;
    case 'trabajos-disponibles': await renderTrabajosDisponibles(); break;
  }
}
 
// ── MOBILE SIDEBAR ─────────────────────────
function showConfirm(msg, title='¿Confirmar acción?') {
  return new Promise((resolve) => {
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = msg;
    $('confirmOverlay').classList.add('open');
 
    const okBtn = $('confirmOkBtn');
    const cancelBtn = $('confirmCancelBtn');
 
    function cleanup(result) {
      $('confirmOverlay').classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
 
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}
 
function showToast(msg, type='success', icon=null) {
  const icons = { success: '✅', error: '⚠️', warn: '⏳' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icon || icons[type] || 'ℹ️'}</span><span class="toast-msg">${msg}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => el.remove(), 250);
  }, 4500);
}
 
function toggleSidebar() {
  $('sidebar').classList.toggle('open');
  $('overlay').classList.toggle('open');
}
function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('overlay').classList.remove('open');
}
 
// ═══════════════════════════════════════════
//  RESUMEN
// ═══════════════════════════════════════════
async function renderResumen() {
  const { data: tareas } = await sb.from('tareas').select('*');
  const all = tareas || [];
  const total   = all.length;
  const done    = all.filter(t=>t.done).length;
  const pending = all.filter(t=>!t.done&&!isOver(t)).length;
  const over    = all.filter(t=>isOver(t)).length;
  const pct     = total ? Math.round(done/total*100) : 0;
 
  const byTipo = Object.keys(TIPOS).map(tipo => {
    const rt = all.filter(t=>t.tipo_trabajo===tipo);
    const rd = rt.filter(t=>t.done).length;
    return { tipo, total:rt.length, done:rd, pct: rt.length ? Math.round(rd/rt.length*100) : 0 };
  }).filter(b => b.total > 0);
 
  const recientes = [...all].filter(t=>t.done)
    .sort((a,b)=>new Date(b.done_at)-new Date(a.done_at)).slice(0,5);
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>📊 Resumen general</h2><p>Progreso de todas las tareas</p></div></div>
    <div class="stats-grid">
      <div class="stat-card stat-cyan"><div class="stat-num">${total}</div><div class="stat-lbl">Total tareas</div></div>
      <div class="stat-card stat-green"><div class="stat-num">${done}</div><div class="stat-lbl">Completadas</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${pending}</div><div class="stat-lbl">Pendientes</div></div>
      <div class="stat-card stat-red"><div class="stat-num">${over}</div><div class="stat-lbl">Vencidas</div></div>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card stat-purple"><div class="stat-num">${casas.length}</div><div class="stat-lbl">Propiedades</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--text)">${empleados.filter(e=>e.rol!=='admin').length}</div><div class="stat-lbl">Empleados</div></div>
      <div class="stat-card stat-cyan"><div class="stat-num">${pct}%</div><div class="stat-lbl">Progreso</div></div>
    </div>
    <div class="card">
      <div class="card-title">Progreso general</div>
      <div class="progress-label"><span>Completado</span><span>${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    ${byTipo.length ? `
    <div class="card">
      <div class="card-title">Por tipo de trabajo</div>
      ${byTipo.map(b=>`
        <div style="margin-bottom:12px">
          <div class="progress-label"><span>${tipoBadge(b.tipo)}</span><span>${b.done}/${b.total} · ${b.pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${b.pct}%"></div></div>
        </div>`).join('')}
    </div>` : ''}
    <div class="card">
      <div class="card-title">✅ Últimas completadas</div>
      ${recientes.length ? recientes.map(t=>`
        <div class="task-item done">
          <div class="task-check checked">✓</div>
          <div class="task-body">
            <div class="task-name done">${t.descripcion}</div>
            <div class="task-meta">
              ${tipoBadge(t.tipo_trabajo)}
              <span style="font-size:11px;color:var(--text2)">👤 ${empName(t.empleado_id)}</span>
              ${t.casa_id?`<span style="font-size:11px;color:var(--cyan)">🏠 ${casaNombre(t.casa_id)}</span>`:''}
              <span class="task-amount">${fmtMoney(t.monto)}</span>
              <span class="task-done-at">· ${fmtDT(t.done_at)}</span>
            </div>
          </div>
        </div>`).join('') : '<div class="empty-state"><div class="empty-icon">🎯</div><p>Ninguna completada aún</p></div>'}
    </div>`;
}
 
// ═══════════════════════════════════════════
//  CASAS
// ═══════════════════════════════════════════
let casaAbierta = null; // id de la casa actualmente expandida en el acordeón
 
async function renderCasas() {
  await loadGlobal();
  const { data: tareas } = await sb.from('tareas').select('*');
  const all = tareas || [];
 
  // El encargado solo ve las casas que el admin le asignó
  const casasVisibles = ME.rol === 'encargado'
    ? casas.filter(c => c.encargado_id === ME.id)
    : casas;
 
  const encargadosOpts = empleados.filter(e=>e.rol==='encargado')
    .map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('');
 
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>🏠 Casas / Propiedades</h2><p>${ME.rol==='encargado'?'Tus propiedades asignadas':'Gestiona las propiedades'}</p></div>
      ${ME.rol==='admin'?`<button class="btn btn-primary" onclick="showFormCasa()">＋ Nueva propiedad</button>`:''}
    </div>
    ${ME.rol==='admin' ? `
    <div id="formCasa" class="card hidden">
      <div class="card-title">Nueva propiedad</div>
      <div class="form-row">
        <div class="field"><label>Nombre</label><input type="text" id="cNombre" placeholder="Casa Familia García" /></div>
        <div class="field"><label>Dirección</label><input type="text" id="cDireccion" placeholder="8409 W 108th St" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Fecha de inicio</label><input type="date" id="cFechaInicio" /></div>
        <div class="field"><label>Fecha de culminación</label><input type="date" id="cFechaFin" /></div>
      </div>
      <div class="field"><label>Encargado asignado</label>
        <select id="cEncargado">
          <option value="">— Sin encargado —</option>
          ${encargadosOpts}
        </select>
      </div>
      <div class="field"><label>Descripción (opcional)</label><input type="text" id="cDescripcion" placeholder="Casa de 2 niveles..." /></div>
      <div id="casaError" class="error-msg"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="addCasa()">Guardar</button>
        <button class="btn" onclick="hideFormCasa()">Cancelar</button>
      </div>
    </div>` : ''}
    ${casasVisibles.length === 0
      ? `<div class="card"><div class="empty-state"><div class="empty-icon">🏠</div><p>${ME.rol==='encargado'?'No tienes propiedades asignadas aún.':'No hay propiedades. Agrega la primera.'}</p></div></div>`
      : casasVisibles.map(casa => {
          const ct = all.filter(t=>t.casa_id===casa.id);
          const cd = ct.filter(t=>t.done).length;
          const pct = ct.length ? Math.round(cd/ct.length*100) : 0;
          const total = ct.reduce((a,t)=>a+Number(t.monto),0);
          const ganado = ct.filter(t=>t.done).reduce((a,t)=>a+Number(t.monto),0);
          const abierta = casaAbierta === casa.id;
          const encargadoNombre = casa.encargado_id ? empName(casa.encargado_id) : null;
          return `
            <div class="card">
              <div style="cursor:pointer" onclick="toggleCasaAcordeon(${casa.id})">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
                  <div>
                    <div style="font-size:16px;font-weight:600;color:var(--cyan)">${abierta?'▾':'▸'} 🏠 ${casa.nombre}</div>
                    <div style="font-size:12px;color:var(--text2);margin-top:3px">📍 ${casa.direccion}</div>
                    ${encargadoNombre?`<div style="font-size:11px;color:var(--text3);margin-top:2px">👤 Encargado: ${encargadoNombre}</div>`:''}
                    ${(casa.fecha_inicio||casa.fecha_fin) ? `
                      <div style="font-size:11px;color:var(--text3);margin-top:2px">
                        ${casa.fecha_inicio?`🟢 Inicio: ${fmtDate(casa.fecha_inicio)}`:''}
                        ${casa.fecha_inicio&&casa.fecha_fin?' · ':''}
                        ${casa.fecha_fin?`🏁 Culminación: ${fmtDate(casa.fecha_fin)}`:''}
                      </div>` : ''}
                  </div>
                  <div style="font-size:13px;color:var(--text2)">${pct}%</div>
                </div>
                <div class="progress-bar" style="margin-top:10px"><div class="progress-fill" style="width:${pct}%"></div></div>
              </div>
 
              ${abierta ? `
                <div style="margin-top:14px">
                  ${casa.descripcion?`<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${casa.descripcion}</div>`:''}
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
                    ${['admin','encargado'].includes(ME.rol)?`<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();goToTareasCasa(${casa.id})">＋ Asignar tarea</button>`:''}
                    <button class="btn btn-sm" onclick="event.stopPropagation();verReporteCasa(${casa.id})">📄 Reporte</button>
                    ${ME.rol==='admin'?`<button class="btn btn-sm" onclick="event.stopPropagation();showFormEditarCasa(${casa.id})">✏ Editar</button>`:''}
                    ${ME.rol==='admin'?`<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteCasa(${casa.id})">🗑</button>`:''}
                  </div>
                  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
                    <div class="stat-card"><div class="stat-num" style="font-size:18px">${ct.length}</div><div class="stat-lbl">Tareas</div></div>
                    <div class="stat-card stat-green"><div class="stat-num" style="font-size:18px">${cd}</div><div class="stat-lbl">Listas</div></div>
                    <div class="stat-card stat-cyan"><div class="stat-num" style="font-size:14px">${fmtMoney(ganado)}</div><div class="stat-lbl">Pagado</div></div>
                    <div class="stat-card stat-amber"><div class="stat-num" style="font-size:14px">${fmtMoney(total-ganado)}</div><div class="stat-lbl">Pendiente</div></div>
                  </div>
                  ${ME.rol==='admin' ? `
                  <div id="formEditarCasa_${casa.id}" class="hidden" style="margin-top:12px;background:var(--bg3);border-radius:var(--radius);padding:12px">
                    <div class="form-row">
                      <div class="field"><label>Fecha de inicio</label><input type="date" id="eFechaInicio_${casa.id}" value="${casa.fecha_inicio||''}" /></div>
                      <div class="field"><label>Fecha de culminación</label><input type="date" id="eFechaFin_${casa.id}" value="${casa.fecha_fin||''}" /></div>
                    </div>
                    <div class="field"><label>Encargado asignado</label>
                      <select id="eEncargado_${casa.id}">
                        <option value="">— Sin encargado —</option>
                        ${empleados.filter(e=>e.rol==='encargado').map(e=>`<option value="${e.id}" ${casa.encargado_id===e.id?'selected':''}>${e.nombre}</option>`).join('')}
                      </select>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();guardarFechasCasa(${casa.id})">Guardar cambios</button>
                  </div>` : ''}
                </div>
              ` : ''}
            </div>`;
        }).join('')}`;
}
 
function toggleCasaAcordeon(id) {
  casaAbierta = casaAbierta === id ? null : id;
  renderCasas();
}
 
function showFormEditarCasa(id) {
  const el = $('formEditarCasa_'+id);
  el.classList.toggle('hidden');
}
 
async function guardarFechasCasa(id) {
  const fi = $('eFechaInicio_'+id).value || null;
  const ff = $('eFechaFin_'+id).value || null;
  const encEl = $('eEncargado_'+id);
  const enc = encEl ? (encEl.value || null) : undefined;
  const updateData = { fecha_inicio: fi, fecha_fin: ff };
  if (enc !== undefined) updateData.encargado_id = enc;
  await sb.from('casas').update(updateData).eq('id', id);
  await loadGlobal();
  await renderCasas();
}
 
function showFormCasa() { $('formCasa').classList.remove('hidden'); $('cNombre').focus(); }
function hideFormCasa()  { $('formCasa').classList.add('hidden'); }
 
async function addCasa() {
  const nombre = $('cNombre').value.trim();
  const dir    = $('cDireccion').value.trim();
  const desc   = $('cDescripcion').value.trim();
  const fi     = $('cFechaInicio').value || null;
  const ff     = $('cFechaFin').value || null;
  const enc    = $('cEncargado').value || null;
  if (!nombre) { $('casaError').textContent = 'Escribe el nombre'; return; }
  if (!dir)    { $('casaError').textContent = 'Escribe la dirección'; return; }
  const { error } = await sb.from('casas').insert({
    nombre, direccion: dir, descripcion: desc||null,
    fecha_inicio: fi, fecha_fin: ff, encargado_id: enc, creado_por: ME.id
  });
  if (error) { $('casaError').textContent = 'Error: '+error.message; return; }
  await loadGlobal();
  hideFormCasa();
  await renderCasas();
}
 
async function deleteCasa(id) {
  if (!confirm('¿Eliminar esta propiedad?')) return;
  await sb.from('casas').delete().eq('id', id);
  await loadGlobal();
  await renderCasas();
}
 
function goToTareasCasa(casaId) {
  currentPage = 'tareas';
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === 'tareas'));
  renderTareas(casaId);
}
 
async function verReporteCasa(casaId) {
  reporteCasaIdActual = casaId;
  const casa = casas.find(c=>c.id===casaId);
  const { data: tareas } = await sb.from('tareas').select('*').eq('casa_id', casaId);
  const all = tareas || [];
  const done = all.filter(t=>t.done).length;
  const pct  = all.length ? Math.round(done/all.length*100) : 0;
  const total = all.reduce((a,t)=>a+Number(t.monto),0);
  const ganado = all.filter(t=>t.done).reduce((a,t)=>a+Number(t.monto),0);
  const workerIds = [...new Set(all.map(t=>t.empleado_id))];
 
  const { data: docs } = await sb.from('documentos_casa').select('*').eq('casa_id', casaId).order('creado_en',{ascending:false});
  const documentos = docs || [];
  const asignados = workerIds.map(id => empleados.find(e=>e.id===id)).filter(Boolean);
  const empOptsDoc = asignados.map(e=>`<option value="${e.id}">${e.nombre}</option>`).join('');
 
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>📄 ${casa.nombre}</h2><p>📍 ${casa.direccion}</p></div>
      <button class="btn" onclick="goTo('casas')">← Volver</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card stat-cyan"><div class="stat-num">${all.length}</div><div class="stat-lbl">Total tareas</div></div>
      <div class="stat-card stat-green"><div class="stat-num">${done}</div><div class="stat-lbl">Completadas</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${all.length-done}</div><div class="stat-lbl">Pendientes</div></div>
      <div class="stat-card stat-purple"><div class="stat-num">${pct}%</div><div class="stat-lbl">Progreso</div></div>
    </div>
    <div class="stats-grid">
      <div class="stat-card stat-green"><div class="stat-num">${fmtMoney(ganado)}</div><div class="stat-lbl">Pagado</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${fmtMoney(total-ganado)}</div><div class="stat-lbl">Por pagar</div></div>
      <div class="stat-card stat-cyan"><div class="stat-num">${fmtMoney(total)}</div><div class="stat-lbl">Total</div></div>
    </div>
    <div class="card">
      <div class="progress-label"><span>Progreso general</span><span>${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
 
    ${['admin','encargado'].includes(ME.rol) ? `
    <div class="card">
      <div class="card-title">📎 Documentos / PDFs de esta propiedad</div>
      <div class="form-row">
        <div class="field">
          <label>Enviar a</label>
          <select id="docDestinatario">
            <option value="todos">👥 Todos los asignados a esta casa</option>
            ${empOptsDoc}
          </select>
        </div>
        <div class="field">
          <label>Archivo PDF</label>
          <input type="file" id="docArchivo" accept="application/pdf" />
        </div>
      </div>
      <div id="docError" class="error-msg"></div>
      <button class="btn btn-primary" onclick="subirDocumento(${casaId})">📤 Subir documento</button>
      <hr class="divider">
      ${documentos.length === 0
        ? '<p style="font-size:13px;color:var(--text3)">No hay documentos subidos aún.</p>'
        : documentos.map(d => {
            const destino = d.destinatario === 'todos' ? '👥 Todos los asignados' : `👤 ${empName(d.destinatario)}`;
            return `
              <div class="task-item">
                <div class="task-body">
                  <div class="task-name">📄 ${d.nombre_archivo}</div>
                  <div class="task-meta">
                    <span style="font-size:11px;color:var(--text2)">${destino}</span>
                    <span style="font-size:11px;color:var(--text3)">· ${fmtDT(d.creado_en)}</span>
                  </div>
                </div>
                <div class="task-actions">
                  <a href="${d.url_archivo}" target="_blank" class="btn btn-sm">👁 Ver</a>
                  ${ME.rol==='admin'?`<button class="btn btn-sm btn-danger" onclick="eliminarDocumento(${d.id},${casaId})">🗑</button>`:''}
                </div>
              </div>`;
          }).join('')}
    </div>` : ''}
 
    ${all.length===0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">📋</div><p>No hay tareas.</p></div></div>'
      : workerIds.map(empId => {
          const emp   = empleados.find(e=>e.id===empId);
          const wt    = all.filter(t=>t.empleado_id===empId);
          const wd    = wt.filter(t=>t.done).length;
          const wp    = wt.length ? Math.round(wd/wt.length*100) : 0;
          const wm    = wt.reduce((a,t)=>a+Number(t.monto),0);
          const wg    = wt.filter(t=>t.done).reduce((a,t)=>a+Number(t.monto),0);
          const rc    = ROLES[emp?.rol]||ROLES.trabajador;
          const tipos = [...new Set(wt.map(t=>t.tipo_trabajo).filter(Boolean))];
          const abiertoEmp = reporteCasaEmpAbierto === empId;
          return `
            <div class="card">
              <div style="cursor:pointer" onclick="toggleReporteCasaEmp('${empId}')">
                <div class="worker-row" style="border:none;padding:0">
                  <div class="worker-avatar" style="background:${rc.avatarBg};color:${rc.avatarColor}">${initials(emp?.nombre||'?')}</div>
                  <div class="worker-info">
                    <div class="worker-name">${abiertoEmp?'▾':'▸'} ${emp?.nombre||'—'}</div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${tipos.map(t=>tipoBadge(t)).join('')}</div>
                    <div style="font-size:11px;color:var(--text3);margin-top:4px">${wd}/${wt.length} tareas · ${wp}%</div>
                    <div class="progress-bar" style="margin-top:6px"><div class="progress-fill" style="width:${wp}%"></div></div>
                  </div>
                  <div class="worker-amount">${fmtMoney(wg)}<small>de ${fmtMoney(wm)}</small></div>
                </div>
              </div>
              ${abiertoEmp ? `
                <hr class="divider">
                <div class="task-list">
                  ${wt.map(t=>`
                    <div class="task-item ${t.done?'done':''}">
                      <div class="task-check ${t.done?'checked':''}" onclick="event.stopPropagation();toggleTareaReporte(${t.id},${casaId})">${t.done?'✓':''}</div>
                      <div class="task-body">
                        <div class="task-name ${t.done?'done':''}">${t.descripcion}</div>
                        <div class="task-meta">
                          ${tipoBadge(t.tipo_trabajo)}
                          <span class="task-amount">${fmtMoney(t.monto)}</span>
                          ${taskBadge(t)}
                          ${t.fecha_limite?`<span class="task-date">📅 ${fmtDate(t.fecha_limite)}</span>`:''}
                          ${t.done&&t.done_at?`<span class="task-done-at">· ${fmtDT(t.done_at)}</span>`:''}
                        </div>
                        ${t.notas?`<div style="font-size:11px;color:var(--text3);margin-top:3px">📌 ${t.notas}</div>`:''}
                      </div>
                      ${ME.rol==='admin'?`<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteTareaReporte(${t.id},${casaId})">🗑</button>`:''}
                    </div>`).join('')}
                </div>
              ` : ''}
            </div>`;
        }).join('')}`;
}
 
let reporteCasaEmpAbierto = null;
let reporteCasaIdActual = null;
function toggleReporteCasaEmp(empId) {
  reporteCasaEmpAbierto = reporteCasaEmpAbierto === empId ? null : empId;
  verReporteCasa(reporteCasaIdActual);
}
 
async function toggleTareaReporte(id, casaId) {
  const { data } = await sb.from('tareas').select('done').eq('id',id).single();
  const done = !data.done;
  const { error } = await sb.from('tareas').update({ done, done_at: done?new Date().toISOString():null }).eq('id',id);
  if (error) { alert('No se pudo actualizar la tarea: ' + error.message); return; }
  await verReporteCasa(casaId);
}
 
async function deleteTareaReporte(id, casaId) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  await sb.from('tareas').delete().eq('id',id);
  await verReporteCasa(casaId);
}
 
// ── DOCUMENTOS / PDFs ───────────────────────
async function subirDocumento(casaId) {
  const fileInput = $('docArchivo');
  const destinatario = $('docDestinatario').value;
  const errEl = $('docError');
  const file = fileInput.files[0];
 
  if (!file) { errEl.textContent = 'Selecciona un archivo PDF'; return; }
  if (file.type !== 'application/pdf') { errEl.textContent = 'Solo se permiten archivos PDF'; return; }
 
  errEl.style.color = 'var(--text2)';
  errEl.textContent = 'Subiendo...';
 
  const filePath = `casa_${casaId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await sb.storage.from('documentos').upload(filePath, file);
  if (uploadError) { errEl.style.color='var(--red)'; errEl.textContent = 'Error: '+uploadError.message; return; }
 
  const { data: urlData } = sb.storage.from('documentos').getPublicUrl(filePath);
 
  const { error: insertError } = await sb.from('documentos_casa').insert({
    casa_id: casaId,
    nombre_archivo: file.name,
    url_archivo: urlData.publicUrl,
    destinatario: destinatario,
    subido_por: ME.id,
  });
  if (insertError) { errEl.style.color='var(--red)'; errEl.textContent = 'Error: '+insertError.message; return; }
 
  // Notificar al destinatario o a todos los asignados
  const { data: tareasCasa } = await sb.from('tareas').select('empleado_id').eq('casa_id', casaId);
  const asignadosIds = [...new Set((tareasCasa||[]).map(t=>t.empleado_id))];
  const casa = casas.find(c=>c.id===casaId);
  const targets = destinatario === 'todos' ? asignadosIds : [destinatario];
  for (const empId of targets) {
    await sendNotification(empId, '📄 Nuevo documento disponible', `${casa.nombre} — ${file.name}`);
  }
 
  errEl.style.color = 'var(--green)';
  errEl.textContent = '✓ Documento subido correctamente';
  setTimeout(() => verReporteCasa(casaId), 1200);
}
 
async function eliminarDocumento(docId, casaId) {
  if (!confirm('¿Eliminar este documento?')) return;
  await sb.from('documentos_casa').delete().eq('id', docId);
  await verReporteCasa(casaId);
}
 
// ═══════════════════════════════════════════
//  EMPLEADOS
// ═══════════════════════════════════════════
async function renderEmpleados() {
  const lista = empleados.filter(e=>e.id!==ME.id);
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>👤 Empleados</h2><p>Gestiona tu equipo</p></div>
      <button class="btn btn-primary" onclick="showFormEmpleado()">＋ Agregar empleado</button>
    </div>
    <div id="formEmpleado" class="card hidden">
      <div class="card-title">Nuevo empleado</div>
      <div class="form-row">
        <div class="field"><label>Nombre completo</label><input type="text" id="eNombre" placeholder="Carlos López" /></div>
        <div class="field"><label>Tipo de acceso</label>
          <select id="eRol">
            <option value="trabajador">Trabajador</option>
            <option value="encargado">Encargado</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label>Correo</label><input type="email" id="eEmail" placeholder="empleado@email.com" /></div>
        <div class="field"><label>Contraseña</label><input type="password" id="ePass" placeholder="Mínimo 8 caracteres" /></div>
      </div>
      <div id="empError" class="error-msg"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="addEmpleado()">Guardar</button>
        <button class="btn" onclick="hideFormEmpleado()">Cancelar</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Equipo registrado (${lista.length})</div>
      ${lista.length===0
        ? '<div class="empty-state"><div class="empty-icon">👥</div><p>No hay empleados aún.</p></div>'
        : lista.map(e=>{
            const rc = ROLES[e.rol]||ROLES.trabajador;
            return `<div class="worker-row">
              <div class="worker-avatar" style="background:${rc.avatarBg};color:${rc.avatarColor}">${initials(e.nombre)}</div>
              <div class="worker-info">
                <div class="worker-name">${e.nombre}</div>
                <div class="worker-stats">${rolBadge(e.rol)} · ${e.email}</div>
              </div>
              <span class="badge ${e.activo?'badge-completa':'badge-vencida'}">${e.activo?'Activo':'Inactivo'}</span>
            </div>`;
          }).join('')}
    </div>`;
}
 
function showFormEmpleado() { $('formEmpleado').classList.remove('hidden'); $('eNombre').focus(); }
function hideFormEmpleado() { $('formEmpleado').classList.add('hidden'); }
 
async function addEmpleado() {
  const nombre = $('eNombre').value.trim();
  const rol    = $('eRol').value;
  const email  = $('eEmail').value.trim();
  const pass   = $('ePass').value;
  const errEl  = $('empError');
  if (!nombre) { errEl.textContent = 'Escribe el nombre'; return; }
  if (!email)  { errEl.textContent = 'Escribe el correo'; return; }
  if (pass.length<8) { errEl.textContent = 'Mínimo 8 caracteres'; return; }
  errEl.textContent = 'Creando...';
  const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { nombre, rol } } });
  if (error) { errEl.textContent = 'Error: '+error.message; return; }
  if (data.user) {
    await sb.from('perfiles').upsert({ id: data.user.id, nombre, email, rol, activo: true });
  }
  errEl.textContent = '✓ Empleado creado';
  await loadGlobal();
  setTimeout(()=>{ hideFormEmpleado(); renderEmpleados(); }, 1500);
}
 
// ═══════════════════════════════════════════
//  TAREAS
// ═══════════════════════════════════════════
async function renderTareas(preselectCasaId=null) {
  const { data } = await sb.from('tareas').select('*').order('creado_en',{ascending:false});
  const tareas = data || [];
  const trabList = empleados.filter(e=>['trabajador','encargado'].includes(e.rol));
  const empOpts  = trabList.map(e=>`<option value="${e.id}">${e.nombre} (${ROLES[e.rol]?.label||e.rol})</option>`).join('');
  const casaOpts = casas.map(c=>`<option value="${c.id}" ${preselectCasaId===c.id?'selected':''}>${c.nombre} — ${c.direccion}</option>`).join('');
  const tipoOpts = Object.entries(TIPOS).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('');
 
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>✅ Tareas</h2><p>Todas las tareas</p></div>
      <button class="btn btn-primary" onclick="showFormTarea()">＋ Nueva tarea</button>
    </div>
    <div id="formTarea" class="card ${preselectCasaId?'':'hidden'}">
      <div class="card-title">Nueva tarea</div>
      <div class="form-row">
        <div class="field"><label>Propiedad</label>
          <select id="fCasa"><option value="">— Sin propiedad —</option>${casaOpts}</select>
        </div>
        <div class="field"><label>Empleado</label>
          <select id="fEmpleado"><option value="">— Selecciona empleado —</option>${empOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label>Tipo de trabajo</label>
          <select id="fTipo" onchange="onTipoChange(this)">
            <option value="">— Selecciona tipo —</option>${tipoOpts}
          </select>
        </div>
        <div class="field"><label>Tarea predefinida</label>
          <select id="fPredefinida" onchange="onPredefinidaChange(this)">
            <option value="">— Selecciona primero el tipo —</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Descripción</label>
        <input type="text" id="fDesc" placeholder="Descripción de la tarea" />
      </div>
      <div class="form-row">
        ${ME.rol==='admin'
          ? `<div class="field"><label>Monto ($)</label><input type="number" id="fMonto" placeholder="0" /></div>`
          : `<input type="hidden" id="fMonto" value="0" />`}
        <div class="field"><label>Fecha límite</label><input type="date" id="fFecha" /></div>
      </div>
      ${ME.rol!=='admin' ? `<div class="alert alert-info">🔒 Solo el administrador puede definir el monto de pago. La tarea se asignará sin monto hasta que el admin lo agregue.</div>` : ''}
      <div class="field"><label>Notas</label><input type="text" id="fNotas" placeholder="Materiales, instrucciones..." /></div>
      <hr class="divider">
      ${ME.rol==='admin' ? `
      <div class="card-title" style="font-size:13px">⚡ Selección múltiple con monto global</div>
      <div id="checklistContainer" style="display:none">
        <div id="checklist" class="checklist-grid"></div>
        <div class="form-row" style="margin-top:10px">
          <div class="field">
            <label>Monto global (se divide entre tareas)</label>
            <input type="number" id="fMontoGlobal" placeholder="5000" oninput="calcMontoGlobal()" />
          </div>
          <div class="field" style="display:flex;align-items:flex-end">
            <p id="montoCalc" style="font-size:12px;color:var(--text2);padding-bottom:9px"></p>
          </div>
        </div>
      </div>` : `<div id="checklistContainer" style="display:none"><div id="checklist" class="checklist-grid"></div></div>`}
      <div id="fError" class="error-msg"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="addTarea()">Guardar tarea</button>
        ${ME.rol==='admin' ? `<button class="btn btn-purple" onclick="addTareasMultiples()">Guardar selección múltiple</button>` : ''}
        <button class="btn" onclick="hideFormTarea()">Cancelar</button>
      </div>
    </div>
    ${renderTareasAgrupadas(tareas)}`;
}
 
let casaTareasAbierta = null; // id de casa expandida en el acordeón de Tareas (o 'sin-casa')
 
function renderTareasAgrupadas(tareas) {
  if (tareas.length === 0) {
    return '<div class="card"><div class="empty-state"><div class="empty-icon">📋</div><p>No hay tareas aún.</p></div></div>';
  }
 
  const grupos = {};
  tareas.forEach(t => {
    const key = t.casa_id || 'sin-casa';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(t);
  });
 
  return Object.entries(grupos).map(([key, ts]) => {
    const casa = key !== 'sin-casa' ? casas.find(c=>c.id===Number(key)) : null;
    const titulo = casa ? `🏠 ${casa.nombre} — ${casa.direccion}` : '📋 Sin propiedad';
    const done = ts.filter(t=>t.done).length;
    const abierto = casaTareasAbierta === key;
    return `
      <div class="card">
        <div style="cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleTareasCasaAcordeon('${key}')">
          <div>
            <div class="card-title" style="margin:0">${abierto?'▾':'▸'} ${titulo}</div>
            ${fechasCasaHTML(casa)}
          </div>
          <span style="font-size:12px;color:var(--text2)">${done}/${ts.length} completas</span>
        </div>
        ${abierto ? `<div class="task-list" style="margin-top:12px">${ts.map(t=>renderTaskItem(t,true,true)).join('')}</div>` : ''}
      </div>`;
  }).join('');
}
 
function toggleTareasCasaAcordeon(key) {
  casaTareasAbierta = casaTareasAbierta === key ? null : key;
  renderTareas();
}
 
function onTipoChange(sel) {
  const tipo = sel.value;
  const predSel = $('fPredefinida');
  if (!tipo) { predSel.innerHTML='<option value="">— Selecciona primero el tipo —</option>'; $('checklistContainer').style.display='none'; return; }
  const preds = tareasPredef.filter(t=>t.rol===tipo);
  predSel.innerHTML = `<option value="">— Selecciona tarea —</option>` +
    preds.map(t=>`<option value="${t.descripcion}">${t.descripcion}</option>`).join('') +
    `<option value="custom">✏ Tarea personalizada</option>`;
  $('checklistContainer').style.display = 'block';
  $('checklist').innerHTML = preds.map(t=>`
    <label class="check-item">
      <input type="checkbox" value="${t.descripcion}" onchange="calcMontoGlobal()" />
      <span>${t.descripcion}</span>
    </label>`).join('');
}
 
function onPredefinidaChange(sel) {
  if (sel.value && sel.value!=='custom') $('fDesc').value = sel.value;
  else if (sel.value==='custom') { $('fDesc').value=''; $('fDesc').focus(); }
}
 
function calcMontoGlobal() {
  const g = Number($('fMontoGlobal').value)||0;
  const n = document.querySelectorAll('#checklist input:checked').length;
  $('montoCalc').textContent = g&&n ? `${fmtMoney(Math.round(g/n))} por tarea (${n} sel.)` : '';
}
 
function showFormTarea() { $('formTarea').classList.remove('hidden'); }
function hideFormTarea()  { $('formTarea').classList.add('hidden'); }
 
async function addTarea() {
  const casaId = $('fCasa').value||null;
  const empId  = $('fEmpleado').value;
  const tipo   = $('fTipo').value;
  const desc   = $('fDesc').value.trim();
  const monto  = $('fMonto').value;
  const fecha  = $('fFecha').value;
  const notas  = $('fNotas').value.trim();
  const errEl  = $('fError');
  if (!empId) { errEl.textContent='Selecciona un empleado'; return; }
  if (!tipo)  { errEl.textContent='Selecciona el tipo de trabajo'; return; }
  if (!desc)  { errEl.textContent='Escribe una descripción'; return; }
  if (!monto||Number(monto)<=0) { errEl.textContent='Ingresa un monto válido'; return; }
 
  const { error } = await sb.from('tareas').insert({
    descripcion: desc, rol: tipo, tipo_trabajo: tipo, empleado_id: empId,
    monto: Number(monto), fecha_limite: fecha||null,
    notas: notas||null, asignado_por: ME.id,
    casa_id: casaId ? Number(casaId) : null,
  });
  if (error) { errEl.textContent='Error: '+error.message; return; }
 
  // Enviar notificación al empleado
  const emp = empleados.find(e=>e.id===empId);
  const casa = casaId ? casas.find(c=>c.id===Number(casaId)) : null;
  await sendNotification(
    empId,
    `🏠 Nueva tarea asignada`,
    `${desc}${casa?' · '+casa.nombre:''} · ${fmtMoney(monto)}`
  );
 
  errEl.textContent='';
  hideFormTarea();
  await renderTareas();
}
 
async function addTareasMultiples() {
  const casaId  = $('fCasa').value||null;
  const empId   = $('fEmpleado').value;
  const tipo    = $('fTipo').value;
  const global  = Number($('fMontoGlobal').value)||0;
  const fecha   = $('fFecha').value;
  const notas   = $('fNotas').value.trim();
  const errEl   = $('fError');
  const checked = [...document.querySelectorAll('#checklist input:checked')];
  if (!empId)          { errEl.textContent='Selecciona un empleado'; return; }
  if (!tipo)           { errEl.textContent='Selecciona el tipo de trabajo'; return; }
  if (!checked.length) { errEl.textContent='Selecciona al menos una tarea'; return; }
  if (!global)         { errEl.textContent='Ingresa el monto global'; return; }
 
  const por  = Math.round(global/checked.length);
  const rows = checked.map(c=>({
    descripcion: c.value, rol: tipo, tipo_trabajo: tipo, empleado_id: empId,
    monto: por, fecha_limite: fecha||null,
    notas: notas||null, asignado_por: ME.id,
    casa_id: casaId ? Number(casaId) : null,
  }));
  const { error } = await sb.from('tareas').insert(rows);
  if (error) { errEl.textContent='Error: '+error.message; return; }
 
  // Notificación
  const casa = casaId ? casas.find(c=>c.id===Number(casaId)) : null;
  await sendNotification(
    empId,
    `🏠 ${checked.length} nuevas tareas asignadas`,
    `${TIPOS[tipo]?.label||tipo}${casa?' · '+casa.nombre:''} · ${fmtMoney(global)} total`
  );
 
  errEl.textContent='';
  hideFormTarea();
  await renderTareas();
}
 
async function deleteTarea(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  await sb.from('tareas').delete().eq('id',id);
  await goTo(currentPage);
}
 
async function toggleTarea(id) {
  const { data } = await sb.from('tareas').select('done').eq('id',id).single();
  const done = !data.done;
  const { error } = await sb.from('tareas').update({ done, done_at: done?new Date().toISOString():null }).eq('id',id);
  if (error) { alert('No se pudo actualizar la tarea: ' + error.message); return; }
  await goTo(currentPage);
}
 
function renderTaskItem(t, canDelete=false, showTipo=false) {
  const casa = t.casa_id ? casas.find(c=>c.id===t.casa_id) : null;
  return `
    <div class="task-item ${t.done?'done':''}">
      <div class="task-check ${t.done?'checked':''}" onclick="toggleTarea(${t.id})">${t.done?'✓':''}</div>
      <div class="task-body">
        <div class="task-name ${t.done?'done':''}">${t.descripcion}</div>
        <div class="task-meta">
          ${showTipo ? tipoBadge(t.tipo_trabajo) : ''}
          <span style="font-size:11px;color:var(--text2)">👤 ${empName(t.empleado_id)}</span>
          ${casa?`<span style="font-size:11px;color:var(--cyan)">🏠 ${casa.nombre}</span>`:''}
          <span class="task-amount">${fmtMoney(t.monto)}</span>
          ${taskBadge(t)}
          ${t.fecha_limite?`<span class="task-date">📅 ${fmtDate(t.fecha_limite)}</span>`:''}
          ${t.done&&t.done_at?`<span class="task-done-at">· ${fmtDT(t.done_at)}</span>`:''}
        </div>
        ${t.notas?`<div style="font-size:11px;color:var(--text3);margin-top:3px">📌 ${t.notas}</div>`:''}
      </div>
      <div class="task-actions">
        ${canDelete&&ME.rol==='admin'?`<button class="btn btn-sm btn-danger" onclick="deleteTarea(${t.id})">🗑</button>`:''}
      </div>
    </div>`;
}
 
// ═══════════════════════════════════════════
//  MIS TAREAS
// ═══════════════════════════════════════════
let misTareasCasaAbierta = null;
 
async function renderMisTareas() {
  const { data: casasFrescas } = await sb.from('casas').select('*').order('creado_en',{ascending:false});
  casas = casasFrescas || [];
  const { data } = await sb.from('tareas').select('*').eq('empleado_id',ME.id).order('creado_en',{ascending:false});
  const mis  = data || [];
  const done = mis.filter(t=>t.done).length;
  const pct  = mis.length ? Math.round(done/mis.length*100) : 0;
  const porCasa = {};
  mis.forEach(t => {
    const key = t.casa_id||'sin-casa';
    if (!porCasa[key]) porCasa[key]=[];
    porCasa[key].push(t);
  });
 
  const casaIds = Object.keys(porCasa).filter(k=>k!=='sin-casa').map(Number);
  let docsPorCasa = {};
  if (casaIds.length) {
    const { data: docs } = await sb.from('documentos_casa').select('*').in('casa_id', casaIds);
    (docs||[]).forEach(d => {
      if (d.destinatario === 'todos' || d.destinatario === ME.id) {
        if (!docsPorCasa[d.casa_id]) docsPorCasa[d.casa_id] = [];
        docsPorCasa[d.casa_id].push(d);
      }
    });
  }
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>✅ Mis tareas</h2><p>Tus tareas asignadas</p></div></div>
    <div class="alert alert-info">🔒 Marca cada tarea cuando la completes.</div>
    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card stat-cyan"><div class="stat-num">${mis.length}</div><div class="stat-lbl">Asignadas</div></div>
      <div class="stat-card stat-green"><div class="stat-num">${done}</div><div class="stat-lbl">Completadas</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${mis.length-done}</div><div class="stat-lbl">Pendientes</div></div>
    </div>
    <div class="card">
      <div class="progress-label"><span>Tu progreso</span><span>${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    ${mis.length===0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">🎯</div><p>No tienes tareas aún.</p></div></div>'
      : Object.entries(porCasa).map(([key,ts])=>{
          const casa = key!=='sin-casa' ? casas.find(c=>c.id===Number(key)) : null;
          const docs = casa ? (docsPorCasa[casa.id]||[]) : [];
          const titulo = casa ? `🏠 ${casa.nombre} — ${casa.direccion}` : '📋 Sin propiedad';
          const doneCasa = ts.filter(t=>t.done).length;
          const abierto = misTareasCasaAbierta === key;
          return `
            <div class="card">
              <div style="cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleMisTareasAcordeon('${key}')">
                <div>
                  <div class="card-title" style="margin:0">${abierto?'▾':'▸'} ${titulo}</div>
                  ${fechasCasaHTML(casa)}
                </div>
                <span style="font-size:12px;color:var(--text2)">${doneCasa}/${ts.length} completas</span>
              </div>
              ${abierto ? `
                <div style="margin-top:12px">
                  ${docs.length ? `
                    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
                      ${docs.map(d=>`
                        <a href="${d.url_archivo}" target="_blank" class="btn btn-sm" style="justify-content:flex-start" onclick="event.stopPropagation()">📄 ${d.nombre_archivo}</a>
                      `).join('')}
                    </div>
                    <hr class="divider" style="margin:0 0 12px">
                  ` : ''}
                  <div class="task-list">${ts.map(t=>renderTaskItem(t,false,true)).join('')}</div>
                </div>
              ` : ''}
            </div>`;
        }).join('')}`;
}
 
function toggleMisTareasAcordeon(key) {
  misTareasCasaAbierta = misTareasCasaAbierta === key ? null : key;
  renderMisTareas();
}
 
// ═══════════════════════════════════════════
//  MIS PAGOS
// ═══════════════════════════════════════════
async function renderMisPagos() {
  const { data } = await sb.from('tareas').select('*').eq('empleado_id',ME.id);
  const mis      = data||[];
  const ganado   = mis.filter(t=>t.done).reduce((a,t)=>a+Number(t.monto),0);
  const porGanar = mis.filter(t=>!t.done).reduce((a,t)=>a+Number(t.monto),0);
 
  const { data: abonosData } = await sb.from('abonos_pago').select('*').eq('empleado_id', ME.id).order('fecha',{ascending:false});
  const abonos = abonosData || [];
  const totalAbonado = abonos.reduce((a,ab)=>a+Number(ab.monto),0);
  const pendientePago = Math.max(0, ganado - totalAbonado);
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>💰 Mis pagos</h2><p>Tu resumen de ganancias</p></div></div>
    <div class="stats-grid">
      <div class="stat-card stat-green"><div class="stat-num">${fmtMoney(ganado)}</div><div class="stat-lbl">Ganado (completado)</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${fmtMoney(porGanar)}</div><div class="stat-lbl">Por ganar</div></div>
      <div class="stat-card stat-cyan"><div class="stat-num">${fmtMoney(ganado+porGanar)}</div><div class="stat-lbl">Total</div></div>
    </div>
 
    <div class="card">
      <div class="card-title">💵 Estado de pago</div>
      <div class="stats-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-card stat-green"><div class="stat-num">${fmtMoney(totalAbonado)}</div><div class="stat-lbl">Ya te pagaron</div></div>
        <div class="stat-card stat-amber"><div class="stat-num">${fmtMoney(pendientePago)}</div><div class="stat-lbl">Aún te deben</div></div>
      </div>
      ${abonos.length === 0
        ? '<p style="font-size:13px;color:var(--text3);margin-top:10px">No tienes abonos registrados aún.</p>'
        : `<div class="section-label" style="margin-top:10px">Historial de pagos</div>
           ${abonos.map(ab => `
             <div class="cot-row">
               <div>
                 <div style="font-weight:600;color:var(--green)">${fmtMoney(ab.monto)}</div>
                 <div style="font-size:11px;color:var(--text3)">${fmtDate(ab.fecha)}${ab.notas?' · '+ab.notas:''}</div>
               </div>
             </div>`).join('')}`}
    </div>
 
    <div class="card">
      <div class="card-title">Detalle de tareas</div>
      ${mis.length===0
        ? '<div class="empty-state"><div class="empty-icon">💸</div><p>Sin tareas aún.</p></div>'
        : `<div class="task-list">${mis.map(t=>`
          <div class="task-item ${t.done?'done':''}">
            <div class="task-check ${t.done?'checked':''}" style="cursor:default">${t.done?'✓':''}</div>
            <div class="task-body">
              <div class="task-name ${t.done?'done':''}">${t.descripcion}</div>
              <div class="task-meta">
                ${tipoBadge(t.tipo_trabajo)}
                ${t.casa_id?`<span style="font-size:11px;color:var(--cyan)">🏠 ${casaNombre(t.casa_id)}</span>`:''}
                <span class="task-amount">${fmtMoney(t.monto)}</span>
                ${taskBadge(t)}
                ${t.done&&t.done_at?`<span class="task-done-at">· ${fmtDT(t.done_at)}</span>`:''}
              </div>
            </div>
          </div>`).join('')}</div>`}
    </div>`;
}
 
// ═══════════════════════════════════════════
//  EQUIPO Y PAGOS
// ═══════════════════════════════════════════
let equipoAbierto = null;
 
async function renderEquipo() {
  const { data: tareas } = await sb.from('tareas').select('*');
  const all = tareas||[];
  const workers = empleados.filter(e=>['trabajador','encargado'].includes(e.rol));
 
  const { data: abonosData } = await sb.from('abonos_pago').select('*');
  const abonos = abonosData || [];
 
  const totalGanado = workers.reduce((a,w)=>a+all.filter(t=>t.empleado_id===w.id&&t.done).reduce((s,t)=>s+Number(t.monto),0),0);
  const totalAbonadoGlobal = workers.reduce((a,w)=>a+abonos.filter(ab=>ab.empleado_id===w.id).reduce((s,ab)=>s+Number(ab.monto),0),0);
  const totalPendGlobal = Math.max(0, totalGanado - totalAbonadoGlobal);
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>👥 Equipo y pagos</h2><p>Progreso y abonos por trabajador</p></div></div>
    <div class="stats-grid">
      <div class="stat-card stat-green"><div class="stat-num">${fmtMoney(totalGanado)}</div><div class="stat-lbl">Total ganado</div></div>
      <div class="stat-card stat-cyan"><div class="stat-num">${fmtMoney(totalAbonadoGlobal)}</div><div class="stat-lbl">Ya pagado</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${fmtMoney(totalPendGlobal)}</div><div class="stat-lbl">Pendiente de pagar</div></div>
    </div>
    ${workers.length===0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">👥</div><p>No hay empleados.</p></div></div>'
      : workers.map(w=>{
          const rc   = ROLES[w.rol]||ROLES.trabajador;
          const mis  = all.filter(t=>t.empleado_id===w.id);
          const done = mis.filter(t=>t.done).length;
          const gan  = mis.filter(t=>t.done).reduce((a,t)=>a+Number(t.monto),0);
          const pend = mis.filter(t=>!t.done).reduce((a,t)=>a+Number(t.monto),0);
          const pct  = mis.length ? Math.round(done/mis.length*100) : 0;
          const tipos = [...new Set(mis.map(t=>t.tipo_trabajo).filter(Boolean))];
 
          const misAbonos = abonos.filter(ab=>ab.empleado_id===w.id).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
          const totalAbonado = misAbonos.reduce((a,ab)=>a+Number(ab.monto),0);
          const pendientePago = Math.max(0, gan - totalAbonado);
          const abierto = equipoAbierto === w.id;
 
          return `
            <div class="card">
              <div style="cursor:pointer" onclick="toggleEquipoAcordeon('${w.id}')">
                <div class="worker-row" style="border:none;padding:0">
                  <div class="worker-avatar" style="background:${rc.avatarBg};color:${rc.avatarColor}">${initials(w.nombre)}</div>
                  <div class="worker-info">
                    <div class="worker-name">${abierto?'▾':'▸'} ${w.nombre}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                      ${rolBadge(w.rol)}
                      ${tipos.map(t=>tipoBadge(t)).join('')}
                    </div>
                    <div style="font-size:11px;color:var(--text3);margin-top:4px">${done}/${mis.length} tareas</div>
                    <div class="progress-bar" style="margin-top:6px"><div class="progress-fill" style="width:${pct}%"></div></div>
                  </div>
                  <div class="worker-amount">
                    ${fmtMoney(totalAbonado)}<small>pagado de ${fmtMoney(gan)}</small>
                  </div>
                </div>
              </div>
 
              ${abierto ? `
                <hr class="divider">
                <div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">
                  <div class="stat-card stat-green"><div class="stat-num" style="font-size:16px">${fmtMoney(totalAbonado)}</div><div class="stat-lbl">Pagado</div></div>
                  <div class="stat-card stat-amber"><div class="stat-num" style="font-size:16px">${fmtMoney(pendientePago)}</div><div class="stat-lbl">Pendiente</div></div>
                  <div class="stat-card stat-cyan"><div class="stat-num" style="font-size:16px">${fmtMoney(gan)}</div><div class="stat-lbl">Total ganado</div></div>
                </div>
 
                ${ME.rol==='admin' ? `
                  <div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-top:10px">
                    <div class="card-title" style="font-size:13px;margin-bottom:8px">💵 Registrar abono</div>
                    <div class="form-row">
                      <div class="field"><label>Monto ($)</label><input type="number" id="abMonto_${w.id}" placeholder="500" step="0.01" /></div>
                      <div class="field"><label>Fecha</label><input type="date" id="abFecha_${w.id}" value="${new Date().toISOString().slice(0,10)}" /></div>
                    </div>
                    <div class="field"><label>Notas (opcional)</label><input type="text" id="abNotas_${w.id}" placeholder="Pago en efectivo, transferencia..." /></div>
                    <div id="abError_${w.id}" class="error-msg"></div>
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();registrarAbono('${w.id}')">＋ Registrar abono</button>
                  </div>
                ` : ''}
 
                <div class="section-label" style="margin-top:14px">Historial de abonos</div>
                ${misAbonos.length === 0
                  ? '<p style="font-size:13px;color:var(--text3)">Sin abonos registrados.</p>'
                  : misAbonos.map(ab => `
                      <div class="cot-row">
                        <div>
                          <div style="font-weight:600;color:var(--green)">${fmtMoney(ab.monto)}</div>
                          <div style="font-size:11px;color:var(--text3)">${fmtDate(ab.fecha)}${ab.notas?' · '+ab.notas:''}</div>
                        </div>
                        ${ME.rol==='admin'?`<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();eliminarAbono(${ab.id},'${w.id}')">🗑</button>`:''}
                      </div>`).join('')}
 
                <div class="section-label" style="margin-top:14px">Tareas</div>
                <div class="task-list">
                  ${mis.length===0
                    ? '<div class="empty-state" style="padding:.75rem"><p>Sin tareas</p></div>'
                    : mis.map(t=>renderTaskItem(t,ME.rol==='admin',true)).join('')}
                </div>
              ` : ''}
            </div>`;
        }).join('')}`;
}
 
function toggleEquipoAcordeon(empId) {
  equipoAbierto = equipoAbierto === empId ? null : empId;
  renderEquipo();
}
 
async function registrarAbono(empId) {
  const monto = Number($('abMonto_'+empId).value)||0;
  const fecha = $('abFecha_'+empId).value;
  const notas = $('abNotas_'+empId).value.trim();
  const errEl = $('abError_'+empId);
 
  if (monto <= 0) { errEl.textContent = 'Ingresa un monto válido'; return; }
  if (!fecha) { errEl.textContent = 'Selecciona una fecha'; return; }
 
  const { error } = await sb.from('abonos_pago').insert({
    empleado_id: empId, monto, fecha, notas: notas||null, registrado_por: ME.id,
  });
  if (error) { errEl.textContent = 'Error: '+error.message; return; }
 
  errEl.textContent = '';
  await renderEquipo();
}
 
async function eliminarAbono(abonoId, empId) {
  if (!confirm('¿Eliminar este abono?')) return;
  await sb.from('abonos_pago').delete().eq('id', abonoId);
  await renderEquipo();
}
 
// ═══════════════════════════════════════════
//  COTIZACIÓN
// ═══════════════════════════════════════════
async function renderCotizacion() {
  const { data } = await sb.from('cotizaciones').select('*').order('creado_en',{ascending:false}).limit(5);
  const lista = data||[];
  materiales = []; // reinicia la lista cada vez que entras a la página
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>📋 Cotización</h2><p>Genera cotizaciones por propiedad</p></div></div>
    <div class="card">
      <div class="card-title">Nueva cotización</div>
      <div class="form-row">
        <div class="field"><label>Propiedad</label>
          <select id="cCasaId" onchange="onCasaCotSelect(this)">
            <option value="">— Sin propiedad —</option>
            ${casas.map(c=>`<option value="${c.id}">${c.nombre} — ${c.direccion}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Dirección manual</label><input type="text" id="cDir" placeholder="O escribe la dirección" /></div>
      </div>
      <div class="form-row-3">
        <div class="field"><label>Habitaciones</label><input type="number" id="cHab" placeholder="3" /></div>
        <div class="field"><label>Baños</label><input type="number" id="cBan" placeholder="2" /></div>
        <div class="field"><label>Área m²</label><input type="number" id="cArea" placeholder="120" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>🎨 Pintura ($)</label><input type="number" id="cPintura" placeholder="0" /></div>
        <div class="field"><label>🔧 Técnico ($)</label><input type="number" id="cTecnico" placeholder="0" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>🧹 Limpieza ($)</label><input type="number" id="cLimpieza" placeholder="0" /></div>
        <div class="field"><label>👁 Supervisión ($)</label><input type="number" id="cSupervision" placeholder="0" /></div>
      </div>
      <div class="field"><label>Margen admin (%)</label><input type="number" id="cMargen" value="20" /></div>
    </div>
 
    <div class="card">
      <div class="card-title">🔩 Materiales (Home Depot)</div>
      <div class="form-row">
        <div class="field" style="flex:2">
          <label>Buscar producto</label>
          <input type="text" id="matBuscar" placeholder="Ej: pintura blanca 1 galón" />
        </div>
        <div class="field" style="display:flex;align-items:flex-end">
          <button class="btn" style="width:100%" onclick="buscarEnHomeDepot()">🔍 Buscar en Home Depot</button>
        </div>
      </div>
      <hr class="divider">
      <div class="form-row-3">
        <div class="field"><label>Nombre del material</label><input type="text" id="matNombre" placeholder="Pintura blanca 1 galón" /></div>
        <div class="field"><label>Precio unitario ($)</label><input type="number" id="matPrecio" placeholder="35.00" step="0.01" /></div>
        <div class="field"><label>Cantidad</label><input type="number" id="matCantidad" placeholder="1" value="1" /></div>
      </div>
      <button class="btn btn-primary" onclick="addMaterial()">＋ Agregar a la lista</button>
      <div id="materialesLista" style="margin-top:12px"></div>
      <div class="cot-row" style="margin-top:8px;border-top:1px solid var(--border);padding-top:10px">
        <span style="font-weight:600">Total materiales</span>
        <span id="totalMateriales" style="font-weight:700;color:var(--green)">$0</span>
      </div>
    </div>
 
    <button class="btn btn-primary btn-full" onclick="calcCotizacion()" style="margin-bottom:1rem">Calcular cotización completa</button>
 
    <div id="cotResult" class="hidden card">
      <div class="card-title">📄 Resultado</div>
      <div id="cotBody"></div>
    </div>
    ${lista.length?`
      <div class="card">
        <div class="card-title">🕐 Cotizaciones anteriores</div>
        ${lista.map(c=>`
          <div class="cot-row">
            <div>
              <div style="font-weight:600;color:var(--cyan)">${c.direccion||'Sin dirección'}</div>
              <div style="font-size:11px;color:var(--text3)">${new Date(c.creado_en).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})}</div>
            </div>
            <span style="font-weight:700;color:var(--cyan)">${fmtMoney(c.total)}</span>
          </div>`).join('')}
      </div>` : ''}`;
}
 
function onCasaCotSelect(sel) {
  const casa = casas.find(c=>c.id===Number(sel.value));
  if (casa) $('cDir').value = casa.direccion;
}
 
function buscarEnHomeDepot() {
  const termino = $('matBuscar').value.trim();
  if (!termino) { alert('Escribe qué producto quieres buscar'); return; }
  const url = `https://www.homedepot.com/s/${encodeURIComponent(termino)}`;
  window.open(url, '_blank');
  // Precarga el nombre en el campo de agregar material
  $('matNombre').value = termino;
}
 
function addMaterial() {
  const nombre = $('matNombre').value.trim();
  const precio = Number($('matPrecio').value)||0;
  const cantidad = Number($('matCantidad').value)||1;
  if (!nombre) { alert('Escribe el nombre del material'); return; }
  if (precio <= 0) { alert('Ingresa un precio válido'); return; }
  materiales.push({ nombre, precio, cantidad });
  $('matNombre').value = '';
  $('matPrecio').value = '';
  $('matCantidad').value = '1';
  $('matBuscar').value = '';
  renderMaterialesLista();
}
 
function removeMaterial(idx) {
  materiales.splice(idx, 1);
  renderMaterialesLista();
}
 
function renderMaterialesLista() {
  const total = materiales.reduce((a,m)=>a+(m.precio*m.cantidad),0);
  $('materialesLista').innerHTML = materiales.length === 0
    ? '<p style="font-size:13px;color:var(--text3)">Sin materiales agregados.</p>'
    : materiales.map((m,i)=>`
        <div class="task-item">
          <div class="task-body">
            <div class="task-name">${m.nombre}</div>
            <div class="task-meta">
              <span style="font-size:12px;color:var(--text2)">${m.cantidad} × ${fmtMoney(m.precio)}</span>
              <span class="task-amount">${fmtMoney(m.precio*m.cantidad)}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="removeMaterial(${i})">🗑</button>
        </div>`).join('');
  $('totalMateriales').textContent = fmtMoney(total);
}
 
async function calcCotizacion() {
  const casaId     = $('cCasaId').value;
  const casa       = casaId ? casas.find(c=>c.id===Number(casaId)) : null;
  const pintura    = Number($('cPintura').value)||0;
  const tecnico    = Number($('cTecnico').value)||0;
  const limpieza   = Number($('cLimpieza').value)||0;
  const supervision= Number($('cSupervision').value)||0;
  const mat        = materiales.reduce((a,m)=>a+(m.precio*m.cantidad),0);
  const margen     = Number($('cMargen').value)||20;
  const dir        = casa ? `${casa.nombre} — ${casa.direccion}` : $('cDir').value;
  const sub        = pintura+tecnico+limpieza+supervision+mat;
  const fee        = Math.round(sub*margen/100);
  const total      = sub+fee;
 
  await sb.from('cotizaciones').insert({
    direccion: dir, area: $('cArea').value||null,
    habitaciones: $('cHab').value||null, banos: $('cBan').value||null,
    costo_pintura: pintura, costo_tecnico: tecnico,
    costo_limpieza: limpieza, costo_encargado: supervision,
    materiales: mat, margen, subtotal: sub, admin_fee: fee, total,
    creado_por: ME.id,
  });
 
  $('cotResult').classList.remove('hidden');
  $('cotBody').innerHTML = `
    ${dir?`<div class="alert alert-info">📍 ${dir}</div>`:''}
    <div class="cot-result">
      <div class="cot-row"><span>🎨 Pintura</span><span class="cot-val">${fmtMoney(pintura)}</span></div>
      <div class="cot-row"><span>🔧 Técnico</span><span class="cot-val">${fmtMoney(tecnico)}</span></div>
      <div class="cot-row"><span>🧹 Limpieza</span><span class="cot-val">${fmtMoney(limpieza)}</span></div>
      <div class="cot-row"><span>👁 Supervisión</span><span class="cot-val">${fmtMoney(supervision)}</span></div>
      <div class="cot-row"><span>🔩 Materiales (${materiales.length} items)</span><span class="cot-val">${fmtMoney(mat)}</span></div>
      <div class="cot-row"><span>Subtotal</span><span class="cot-val">${fmtMoney(sub)}</span></div>
      <div class="cot-row"><span>Margen (${margen}%)</span><span class="cot-val">${fmtMoney(fee)}</span></div>
      <div class="cot-row total"><span>TOTAL</span><span>${fmtMoney(total)}</span></div>
    </div>
    ${materiales.length ? `
      <div class="section-label">Detalle de materiales</div>
      ${materiales.map(m=>`
        <div class="cot-row"><span>${m.nombre} (${m.cantidad}×)</span><span class="cot-val">${fmtMoney(m.precio*m.cantidad)}</span></div>
      `).join('')}
    ` : ''}
    <p style="font-size:11px;color:var(--text3);margin-top:8px">Generado: ${new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})}</p>`;
}
 
// ═══════════════════════════════════════════
//  MI PERFIL
// ═══════════════════════════════════════════
async function renderMiPerfil() {
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>🔑 Mi perfil</h2><p>Actualiza tu contraseña</p></div></div>
    <div class="card">
      <div class="card-title">Información</div>
      <div class="worker-row" style="border:none;padding:0">
        <div class="worker-avatar" style="background:${ROLES[ME.rol]?.avatarBg};color:${ROLES[ME.rol]?.avatarColor};width:48px;height:48px;font-size:16px">${initials(ME.nombre)}</div>
        <div class="worker-info">
          <div class="worker-name">${ME.nombre}</div>
          <div class="worker-stats">${rolBadge(ME.rol)} · ${ME.email}</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Cambiar contraseña</div>
      <div class="field"><label>Nueva contraseña</label><input type="password" id="pPass1" placeholder="Mínimo 8 caracteres" /></div>
      <div class="field"><label>Confirmar contraseña</label><input type="password" id="pPass2" placeholder="Repite la contraseña" /></div>
      <div id="perfilMsg" class="error-msg"></div>
      <button class="btn btn-primary" style="margin-top:8px" onclick="cambiarPassword()">Actualizar contraseña</button>
    </div>`;
}
 
async function cambiarPassword() {
  const p1  = $('pPass1').value;
  const p2  = $('pPass2').value;
  const msg = $('perfilMsg');
  if (p1.length < 8) { msg.style.color='var(--red)'; msg.textContent='Mínimo 8 caracteres'; return; }
  if (p1 !== p2)     { msg.style.color='var(--red)'; msg.textContent='Las contraseñas no coinciden'; return; }
  msg.style.color='var(--text2)'; msg.textContent='Actualizando...';
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) { msg.style.color='var(--red)'; msg.textContent='Error: '+error.message; return; }
  msg.style.color='var(--green)'; msg.textContent='✓ Contraseña actualizada correctamente';
  $('pPass1').value=''; $('pPass2').value='';
}
 
// ═══════════════════════════════════════════
//  VACANTES (Admin)
// ═══════════════════════════════════════════
let formVacanteVisible = false;
 
async function renderVacantes() {
  const { data: tareas } = await sb.from('tareas').select('*');
  const all = tareas || [];
  const { data: vacantesData } = await sb.from('vacantes').select('*').order('creado_en',{ascending:false});
  const vacantes = vacantesData || [];
 
  const workers = empleados.filter(e=>['trabajador','encargado'].includes(e.rol));
  const workersConteo = workers.map(w => ({
    ...w,
    totalTareas: all.filter(t=>t.empleado_id===w.id).length,
    tareasActivas: all.filter(t=>t.empleado_id===w.id && !t.done).length,
  })).sort((a,b) => a.tareasActivas - b.tareasActivas);
 
  const tipoOpts = Object.entries(TIPOS).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('');
  const casaOpts = casas.map(c=>`<option value="${c.id}">${c.nombre} — ${c.direccion}</option>`).join('');
  const empCheckboxes = workers.map(w => `
    <label class="check-item">
      <input type="checkbox" class="vac-emp-check" value="${w.id}" />
      <span>${w.nombre} (${workersConteo.find(x=>x.id===w.id)?.tareasActivas||0} activas)</span>
    </label>`).join('');
 
  const vacantesAbiertas = vacantes.filter(v=>v.estado==='abierta');
  const vacantesCerradas = vacantes.filter(v=>v.estado!=='abierta');
 
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>📢 Vacantes</h2><p>Empleados disponibles y trabajos abiertos</p></div>
      <button class="btn btn-primary" onclick="toggleFormVacante()">＋ Lanzar vacante</button>
    </div>
 
    <div id="formVacante" class="card ${formVacanteVisible?'':'hidden'}">
      <div class="card-title">Nueva vacante de trabajo</div>
      <div class="form-row">
        <div class="field"><label>Propiedad existente</label>
          <select id="vCasaExistente" onchange="onVacCasaToggle(this)">
            <option value="">— Crear casa nueva —</option>
            ${casaOpts}
          </select>
        </div>
        <div class="field"><label>Tipo de trabajo</label>
          <select id="vTipo"><option value="">— Selecciona —</option>${tipoOpts}</select>
        </div>
      </div>
      <div id="vCasaNuevaWrap" class="form-row">
        <div class="field"><label>Nombre de la casa nueva</label><input type="text" id="vCasaNombre" placeholder="Casa Familia López" /></div>
        <div class="field"><label>Dirección</label><input type="text" id="vCasaDireccion" placeholder="123 Main St" /></div>
      </div>
      <div class="field"><label>Especificación del trabajo</label><input type="text" id="vDesc" placeholder="Limpieza profunda de toda la casa antes de entrega" /></div>
      <div class="form-row">
        <div class="field"><label>Fecha inicial</label><input type="date" id="vFechaInicio" /></div>
        <div class="field"><label>Fecha límite</label><input type="date" id="vFechaLimite" /></div>
      </div>
      <div class="field"><label>Pago ($)</label><input type="number" id="vMonto" placeholder="500" step="0.01" /></div>
      <div class="field"><label>Notas (opcional)</label><input type="text" id="vNotas" placeholder="Detalles adicionales..." /></div>
      <hr class="divider">
      <div class="card-title" style="font-size:13px">👥 Empleados que pueden ver esta vacante</div>
      <div class="checklist-grid">${empCheckboxes}</div>
      <div id="vacError" class="error-msg"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" onclick="lanzarVacante()">📢 Lanzar vacante</button>
        <button class="btn" onclick="toggleFormVacante()">Cancelar</button>
      </div>
    </div>
 
    <div class="card">
      <div class="card-title">👤 Empleados (de menos a más cargados)</div>
      ${workersConteo.length === 0
        ? '<div class="empty-state"><p>No hay empleados registrados.</p></div>'
        : workersConteo.map(w => {
            const rc = ROLES[w.rol]||ROLES.trabajador;
            return `<div class="worker-row">
              <div class="worker-avatar" style="background:${rc.avatarBg};color:${rc.avatarColor}">${initials(w.nombre)}</div>
              <div class="worker-info">
                <div class="worker-name">${w.nombre}</div>
                <div class="worker-stats">${rolBadge(w.rol)} · ${w.tareasActivas} tareas activas / ${w.totalTareas} total</div>
              </div>
            </div>`;
          }).join('')}
    </div>
 
    ${vacantesAbiertas.length ? `
      <div class="card">
        <div class="card-title">📢 Vacantes abiertas (${vacantesAbiertas.length})</div>
        ${vacantesAbiertas.map(v => renderVacanteCard(v)).join('')}
      </div>` : ''}
 
    ${vacantesCerradas.length ? `
      <div class="card">
        <div style="cursor:pointer;display:flex;align-items:center;justify-content:space-between" onclick="toggleHistorialVacantes()">
          <div class="card-title" style="margin:0">${historialVacantesAbierto?'▾':'▸'} 📋 Historial de vacantes (${vacantesCerradas.length})</div>
        </div>
        ${historialVacantesAbierto ? vacantesCerradas.map(v => renderVacanteCard(v)).join('') : ''}
      </div>` : ''}`;
}
 
let historialVacantesAbierto = false;
function toggleHistorialVacantes() {
  historialVacantesAbierto = !historialVacantesAbierto;
  renderVacantes();
}
 
function renderVacanteCard(v) {
  const casa = v.casa_id ? casas.find(c=>c.id===v.casa_id) : null;
  const invitados = (v.empleados_invitados||[]).map(id=>empName(id)).join(', ');
  const estadoBadge = v.estado==='abierta'
    ? '<span class="badge badge-pendiente">⏳ Abierta</span>'
    : v.estado==='tomada'
      ? `<span class="badge badge-completa">✓ Tomada por ${empName(v.empleado_aceptado)}</span>`
      : '<span class="badge badge-vencida">Cancelada</span>';
  const editando = vacanteEditando === v.id;
  const tipoOptsEdit = Object.entries(TIPOS).map(([k,t])=>`<option value="${k}" ${v.tipo_trabajo===k?'selected':''}>${t.icon} ${t.label}</option>`).join('');
 
  return `
    <div class="task-item" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;gap:12px">
        <div class="task-body">
          <div class="task-name">${v.descripcion}</div>
          <div class="task-meta">
            ${tipoBadge(v.tipo_trabajo)}
            ${casa?`<span style="font-size:11px;color:var(--cyan)">🏠 ${casa.nombre} — ${casa.direccion}</span>`:''}
            <span class="task-amount">${fmtMoney(v.monto)}</span>
            ${estadoBadge}
            ${v.fecha_limite?`<span class="task-date">📅 ${fmtDate(v.fecha_limite)}</span>`:''}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:3px">👥 Invitados: ${invitados||'—'}</div>
        </div>
        <div class="task-actions" style="flex-shrink:0">
          ${v.estado==='abierta'?`<button class="btn btn-sm" onclick="toggleEditarVacante(${v.id})">✏</button>`:''}
          ${v.estado==='abierta'?`<button class="btn btn-sm btn-danger" onclick="cancelarVacante(${v.id})">🗑</button>`:''}
        </div>
      </div>
 
      ${editando ? `
        <div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-top:10px">
          <div class="form-row">
            <div class="field"><label>Especificación</label><input type="text" id="evDesc_${v.id}" value="${v.descripcion}" /></div>
            <div class="field"><label>Tipo de trabajo</label><select id="evTipo_${v.id}">${tipoOptsEdit}</select></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Fecha inicial</label><input type="date" id="evFechaInicio_${v.id}" value="${v.fecha_inicio||''}" /></div>
            <div class="field"><label>Fecha límite</label><input type="date" id="evFechaLimite_${v.id}" value="${v.fecha_limite||''}" /></div>
          </div>
          <div class="field"><label>Pago ($)</label><input type="number" id="evMonto_${v.id}" value="${v.monto}" step="0.01" /></div>
          <div class="card-title" style="font-size:13px;margin-top:8px">👥 Empleados invitados</div>
          <div class="checklist-grid">
            ${empleados.filter(e=>['trabajador','encargado'].includes(e.rol)).map(e=>`
              <label class="check-item">
                <input type="checkbox" class="ev-emp-check-${v.id}" value="${e.id}" ${(v.empleados_invitados||[]).includes(e.id)?'checked':''} />
                <span>${e.nombre}</span>
              </label>`).join('')}
          </div>
          <div id="evError_${v.id}" class="error-msg"></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-primary btn-sm" onclick="guardarEdicionVacante(${v.id})">Guardar cambios</button>
            <button class="btn btn-sm" onclick="toggleEditarVacante(${v.id})">Cancelar</button>
          </div>
        </div>
      ` : ''}
    </div>`;
}
 
let vacanteEditando = null;
function toggleEditarVacante(id) {
  vacanteEditando = vacanteEditando === id ? null : id;
  renderVacantes();
}
 
async function guardarEdicionVacante(id) {
  const desc = $('evDesc_'+id).value.trim();
  const tipo = $('evTipo_'+id).value;
  const fi = $('evFechaInicio_'+id).value || null;
  const ff = $('evFechaLimite_'+id).value || null;
  const monto = Number($('evMonto_'+id).value)||0;
  const checked = [...document.querySelectorAll(`.ev-emp-check-${id}:checked`)].map(c=>c.value);
  const errEl = $('evError_'+id);
 
  if (!desc) { errEl.textContent = 'Escribe la especificación'; return; }
  if (monto <= 0) { errEl.textContent = 'Ingresa un monto válido'; return; }
  if (!checked.length) { errEl.textContent = 'Selecciona al menos un empleado'; return; }
 
  const { data: vacanteAntes } = await sb.from('vacantes').select('empleados_invitados').eq('id', id).single();
  const invitadosAntes = vacanteAntes?.empleados_invitados || [];
  const nuevosInvitados = checked.filter(empId => !invitadosAntes.includes(empId));
 
  const { error } = await sb.from('vacantes').update({
    descripcion: desc, tipo_trabajo: tipo, fecha_inicio: fi, fecha_limite: ff,
    monto, empleados_invitados: checked,
  }).eq('id', id);
 
  if (error) { errEl.textContent = 'Error: '+error.message; return; }
 
  // Notificar solo a los empleados recién agregados
  if (nuevosInvitados.length) {
    const { data: vacanteCasaData } = await sb.from('vacantes').select('casa_id').eq('id', id).single();
    const casaInfo = casas.find(c => c.id === vacanteCasaData?.casa_id);
    for (const empId of nuevosInvitados) {
      await sendNotification(empId, '📢 Hay un trabajo para ti', `${desc}${casaInfo?' · '+casaInfo.nombre+' — '+casaInfo.direccion:''} · ${fmtMoney(monto)}. ¡Entra ahora si quieres aceptarlo!`);
    }
  }
 
  vacanteEditando = null;
  showToast('Vacante actualizada correctamente', 'success');
  await renderVacantes();
}
 
function toggleFormVacante() {
  formVacanteVisible = !formVacanteVisible;
  renderVacantes();
}
 
function onVacCasaToggle(sel) {
  $('vCasaNuevaWrap').style.display = sel.value ? 'none' : 'flex';
}
 
async function lanzarVacante() {
  const casaExistente = $('vCasaExistente').value;
  const tipo = $('vTipo').value;
  const desc = $('vDesc').value.trim();
  const fi = $('vFechaInicio').value || null;
  const ff = $('vFechaLimite').value || null;
  const monto = Number($('vMonto').value)||0;
  const notas = $('vNotas').value.trim();
  const errEl = $('vacError');
  const checked = [...document.querySelectorAll('.vac-emp-check:checked')].map(c=>c.value);
 
  if (!tipo) { errEl.textContent = 'Selecciona el tipo de trabajo'; return; }
  if (!desc) { errEl.textContent = 'Escribe la especificación'; return; }
  if (monto <= 0) { errEl.textContent = 'Ingresa un monto válido'; return; }
  if (!checked.length) { errEl.textContent = 'Selecciona al menos un empleado'; return; }
 
  let casaId = casaExistente ? Number(casaExistente) : null;
 
  if (!casaId) {
    const nombreCasa = $('vCasaNombre').value.trim();
    const dirCasa = $('vCasaDireccion').value.trim();
    if (!nombreCasa || !dirCasa) { errEl.textContent = 'Completa nombre y dirección de la casa nueva'; return; }
    const { data: nuevaCasa, error: errCasa } = await sb.from('casas').insert({
      nombre: nombreCasa, direccion: dirCasa, creado_por: ME.id
    }).select().single();
    if (errCasa) { errEl.textContent = 'Error creando casa: '+errCasa.message; return; }
    casaId = nuevaCasa.id;
  }
 
  const { data: vacante, error } = await sb.from('vacantes').insert({
    casa_id: casaId, descripcion: desc, tipo_trabajo: tipo,
    fecha_inicio: fi, fecha_limite: ff, monto, notas: notas||null,
    empleados_invitados: checked, creado_por: ME.id,
  }).select().single();
 
  if (error) { errEl.textContent = 'Error: '+error.message; return; }
 
  let casaInfoNotif = casas.find(c=>c.id===casaId);
  if (!casaInfoNotif) {
    const { data: cd } = await sb.from('casas').select('nombre,direccion').eq('id',casaId).single();
    casaInfoNotif = cd;
  }
  const casaTxtNotif = casaInfoNotif ? `${casaInfoNotif.nombre} — ${casaInfoNotif.direccion}` : '';
  for (const empId of checked) {
    await sendNotification(empId, '📢 Hay un trabajo para ti', `${desc}${casaTxtNotif?' · '+casaTxtNotif:''} · ${fmtMoney(monto)}. ¡Entra ahora si quieres aceptarlo!`);
  }
 
  errEl.textContent = '';
  formVacanteVisible = false;
  await loadGlobal();
  await renderVacantes();
}
 
async function cancelarVacante(id) {
  if (!confirm('¿Cancelar esta vacante?')) return;
  await sb.from('vacantes').update({ estado: 'cancelada' }).eq('id', id);
  await renderVacantes();
}
 
// ═══════════════════════════════════════════
//  TRABAJOS DISPONIBLES (Trabajador/Encargado)
// ═══════════════════════════════════════════
async function renderTrabajosDisponibles() {
  const { data } = await sb.from('vacantes').select('*')
    .eq('estado','abierta')
    .contains('empleados_invitados', [ME.id])
    .order('creado_en',{ascending:false});
  const vacantes = data || [];
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>📢 Trabajos disponibles</h2><p>Vacantes abiertas para ti — el primero en aceptar se queda con el trabajo</p></div></div>
    ${vacantes.length === 0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">📭</div><p>No tienes trabajos disponibles por el momento.</p></div></div>'
      : vacantes.map(v => {
          const casa = v.casa_id ? casas.find(c=>c.id===v.casa_id) : null;
          return `
            <div class="card">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
                <div>
                  <div style="font-size:15px;font-weight:600">${v.descripcion}</div>
                  <div class="task-meta" style="margin-top:6px">
                    ${tipoBadge(v.tipo_trabajo)}
                    ${casa?`<span style="font-size:12px;color:var(--cyan)">🏠 ${casa.nombre} — ${casa.direccion}</span>`:''}
                  </div>
                  <div class="task-meta" style="margin-top:6px">
                    <span class="task-amount" style="font-size:14px">${fmtMoney(v.monto)}</span>
                    ${v.fecha_inicio?`<span class="task-date">🟢 Inicio: ${fmtDate(v.fecha_inicio)}</span>`:''}
                    ${v.fecha_limite?`<span class="task-date">🏁 Límite: ${fmtDate(v.fecha_limite)}</span>`:''}
                  </div>
                  ${v.notas?`<div style="font-size:12px;color:var(--text3);margin-top:6px">📌 ${v.notas}</div>`:''}
                </div>
              </div>
              <button class="btn btn-primary btn-full" style="margin-top:12px" onclick="aceptarVacante(${v.id})">✋ Aceptar este trabajo</button>
            </div>`;
        }).join('')}`;
}
 
async function aceptarVacante(id) {
  const ok = await showConfirm('Una vez aceptado quedará asignado a ti.', '¿Aceptar este trabajo?');
  if (!ok) return;
 
  // Update condicional: solo si sigue abierta. Si otro ya la tomó, esto no afecta filas.
  const { data: updated, error } = await sb.from('vacantes')
    .update({ estado: 'tomada', empleado_aceptado: ME.id, aceptada_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'abierta')
    .select();
 
  if (error) { showToast('Error: '+error.message, 'error'); return; }
 
  if (!updated || updated.length === 0) {
    showToast('Este trabajo ya fue tomado por otro compañero.', 'warn', '😕');
    await renderTrabajosDisponibles();
    return;
  }
 
  const v = updated[0];
 
  // Crear la tarea real
  const { data: nuevaTarea, error: errTarea } = await sb.from('tareas').insert({
    descripcion: v.descripcion, rol: v.tipo_trabajo, tipo_trabajo: v.tipo_trabajo,
    empleado_id: ME.id, monto: v.monto, fecha_limite: v.fecha_limite,
    notas: v.notas, asignado_por: v.creado_por, casa_id: v.casa_id,
  }).select().single();
 
  if (!errTarea && nuevaTarea) {
    await sb.from('vacantes').update({ tarea_id: nuevaTarea.id }).eq('id', id);
  }
 
  // Notificar a todos los admins
  const admins = empleados.filter(e=>e.rol==='admin');
  const casaInfo = v.casa_id ? casas.find(c=>c.id===v.casa_id) : null;
  const casaTxt = casaInfo ? `${casaInfo.nombre} — ${casaInfo.direccion}` : '';
  for (const admin of admins) {
    await sendNotification(admin.id, '✅ Trabajo aceptado', `${ME.nombre} aceptó: ${v.descripcion}${casaTxt?' · '+casaTxt:''}`);
  }
 
  showToast('¡Trabajo aceptado! Ya quedó en tus tareas.', 'success', '🎉');
  await loadGlobal();
  await goTo('mis-tareas');
}
