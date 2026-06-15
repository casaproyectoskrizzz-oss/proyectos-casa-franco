// ═══════════════════════════════════════════
//  CASA MANAGER — script.js
// ═══════════════════════════════════════════
 
// ── SUPABASE ───────────────────────────────
const SUPA_URL = 'https://wiewpmkgsbsxgwljnhmu.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZXdwbWtnc2JzeGd3bGpuaG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Mjk3MjUsImV4cCI6MjA5NzEwNTcyNX0.UxfZBpVwkWvGNsJpx3BnJxM9NHMF76-A3lYTIfIU8GM';
 
// Esperar a que el DOM y Supabase estén listos
let sb;
window.addEventListener('load', function() {
  sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
 
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      await loadMe(session.user.id);
      await loadGlobal();
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('mainApp').classList.remove('hidden');
      initApp();
    } else {
      document.getElementById('mainApp').classList.add('hidden');
      document.getElementById('loginScreen').classList.remove('hidden');
    }
  });
});
 
// ── CONFIG ROLES ───────────────────────────
const ROLES = {
  admin:     { label: 'Administrador',     badge: 'badge-admin',    avatarBg: '#7c3cff22', avatarColor: '#7c3cff' },
  encargado: { label: 'Encargado de casa', badge: 'badge-encargado',avatarBg: '#00ffe722', avatarColor: '#00ffe7' },
  pintura:   { label: 'Pintura',           badge: 'badge-pintura',  avatarBg: '#58a6ff22', avatarColor: '#58a6ff' },
  tecnico:   { label: 'Técnico',           badge: 'badge-tecnico',  avatarBg: '#d2992222', avatarColor: '#d29922' },
  limpieza:  { label: 'Limpieza',          badge: 'badge-limpieza', avatarBg: '#3fb95022', avatarColor: '#3fb950' },
};
 
const NAV = {
  admin:     [{ id:'resumen', icon:'📊', label:'Resumen' },{ id:'empleados', icon:'👤', label:'Empleados' },{ id:'tareas', icon:'✅', label:'Tareas' },{ id:'equipo', icon:'👥', label:'Equipo y pagos' },{ id:'cotizacion', icon:'📋', label:'Cotización' }],
  encargado: [{ id:'resumen', icon:'📊', label:'Resumen' },{ id:'mis-tareas', icon:'✅', label:'Mis tareas' },{ id:'tareas', icon:'📝', label:'Tareas equipo' },{ id:'equipo', icon:'👥', label:'Equipo y pagos' }],
  pintura:   [{ id:'mis-tareas', icon:'✅', label:'Mis tareas' },{ id:'mis-pagos', icon:'💰', label:'Mis pagos' }],
  tecnico:   [{ id:'mis-tareas', icon:'✅', label:'Mis tareas' },{ id:'mis-pagos', icon:'💰', label:'Mis pagos' }],
  limpieza:  [{ id:'mis-tareas', icon:'✅', label:'Mis tareas' },{ id:'mis-pagos', icon:'💰', label:'Mis pagos' }],
};
 
// ── ESTADO ─────────────────────────────────
let ME = null;
let currentPage = null;
let tareasPredef = [];
let empleados = [];
 
// ── HELPERS ────────────────────────────────
function $(id) { return document.getElementById(id); }
const fmtMoney = n => '$' + Number(n||0).toLocaleString('es-MX');
const fmtDate  = d => d ? new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '';
const fmtDT    = iso => iso ? new Date(iso).toLocaleDateString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
const isOver   = t => !t.done && t.fecha_limite && new Date(t.fecha_limite) < new Date();
const initials = n => n ? n.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase() : '??';
 
function rolBadge(rol) {
  return `<span class="badge badge-${rol}">${ROLES[rol]?.label||rol}</span>`;
}
function taskBadge(t) {
  if (t.done) return '<span class="badge badge-completa">✓ Completa</span>';
  if (isOver(t)) return '<span class="badge badge-vencida">⚠ Vencida</span>';
  return '<span class="badge badge-pendiente">⏳ Pendiente</span>';
}
function rolesAsignables() {
  if (ME.rol === 'admin') return ['encargado','pintura','tecnico','limpieza'];
  if (ME.rol === 'encargado') return ['pintura','tecnico','limpieza'];
  return [];
}
 
// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
function fillDemo(email) {
  $('loginEmail').value = email;
  $('loginPass').value = '';
  $('loginPass').focus();
}
 
async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pass  = $('loginPass').value;
  $('loginError').textContent = 'Entrando...';

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    $('loginError').textContent = 'Correo o contraseña incorrectos.';
    return;
  }
  if (data.user) {
    await loadMe(data.user.id);
    await loadGlobal();
    $('loginScreen').classList.add('hidden');
    $('mainApp').classList.remove('hidden');
    $('loginError').textContent = '';
    initApp();
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
 
async function loadMe(uid) {
  const { data } = await sb.from('perfiles').select('*').eq('id', uid).single();
  ME = data;
}
 
async function loadGlobal() {
  const [{ data: tp }, { data: emp }] = await Promise.all([
    sb.from('tareas_predefinidas').select('*').order('rol').order('orden'),
    sb.from('perfiles').select('*').order('nombre'),
  ]);
  tareasPredef = tp || [];
  empleados    = emp || [];
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
 
  const nav = $('sidebarNav');
  nav.innerHTML = NAV[ME.rol].map(n =>
    `<div class="nav-item" data-page="${n.id}" onclick="goTo('${n.id}')">
      <span class="nav-icon">${n.icon}</span><span>${n.label}</span>
    </div>`
  ).join('');
 
  goTo(NAV[ME.rol][0].id);
}
 
async function goTo(pageId) {
  currentPage = pageId;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === pageId)
  );
  $('pageContent').innerHTML = '<div class="loading">Cargando...</div>';
  switch(pageId) {
    case 'resumen':    await renderResumen(); break;
    case 'empleados':  await renderEmpleados(); break;
    case 'tareas':     await renderTareas(); break;
    case 'mis-tareas': await renderMisTareas(); break;
    case 'mis-pagos':  await renderMisPagos(); break;
    case 'equipo':     await renderEquipo(); break;
    case 'cotizacion': await renderCotizacion(); break;
  }
}
 
// ═══════════════════════════════════════════
//  RESUMEN
// ═══════════════════════════════════════════
async function renderResumen() {
  let q = sb.from('tareas').select('*');
  if (ME.rol === 'encargado') q = q.in('rol',['pintura','tecnico','limpieza','encargado']);
  const { data: tareas } = await q;
  const all = tareas || [];
 
  const total   = all.length;
  const done    = all.filter(t=>t.done).length;
  const pending = all.filter(t=>!t.done&&!isOver(t)).length;
  const over    = all.filter(t=>isOver(t)).length;
  const pct     = total ? Math.round(done/total*100) : 0;
 
  const roles = ME.rol==='admin' ? ['pintura','tecnico','limpieza','encargado'] : ['pintura','tecnico','limpieza'];
  const byRole = roles.map(r => {
    const rt = all.filter(t=>t.rol===r);
    const rd = rt.filter(t=>t.done).length;
    return { r, total:rt.length, done:rd, pct: rt.length ? Math.round(rd/rt.length*100) : 0 };
  });
 
  const recientes = [...all].filter(t=>t.done).sort((a,b)=>new Date(b.done_at)-new Date(a.done_at)).slice(0,5);
 
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>📊 Resumen general</h2><p>Progreso de todas las tareas</p></div>
    </div>
    <div class="stats-grid">
      <div class="stat-card stat-cyan"><div class="stat-num">${total}</div><div class="stat-lbl">Total tareas</div></div>
      <div class="stat-card stat-green"><div class="stat-num">${done}</div><div class="stat-lbl">Completadas</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${pending}</div><div class="stat-lbl">Pendientes</div></div>
      <div class="stat-card stat-red"><div class="stat-num">${over}</div><div class="stat-lbl">Vencidas</div></div>
    </div>
    <div class="card">
      <div class="card-title">Progreso general</div>
      <div class="progress-label"><span>Completado</span><span>${pct}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="card">
      <div class="card-title">Por equipo</div>
      ${byRole.map(b=>`
        <div style="margin-bottom:12px">
          <div class="progress-label"><span>${rolBadge(b.r)}</span><span>${b.done}/${b.total} · ${b.pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${b.pct}%"></div></div>
        </div>`).join('')||'<div class="empty-state"><p>Sin tareas aún</p></div>'}
    </div>
    <div class="card">
      <div class="card-title">✅ Últimas completadas</div>
      ${recientes.length ? recientes.map(t=>`
        <div class="task-item done">
          <div class="task-check checked">✓</div>
          <div class="task-body">
            <div class="task-name done">${t.descripcion}</div>
            <div class="task-meta">${rolBadge(t.rol)}<span class="task-amount">${fmtMoney(t.monto)}</span><span class="task-done-at">· ${fmtDT(t.done_at)}</span></div>
          </div>
        </div>`).join('') : '<div class="empty-state"><div class="empty-icon">🎯</div><p>Ninguna completada aún</p></div>'}
    </div>`;
}
 
// ═══════════════════════════════════════════
//  EMPLEADOS
// ═══════════════════════════════════════════
async function renderEmpleados() {
  const lista = empleados.filter(e => e.id !== ME.id);
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>👤 Empleados</h2><p>Gestiona tu equipo de trabajo</p></div>
      <button class="btn btn-primary" onclick="showFormEmpleado()">＋ Agregar empleado</button>
    </div>
    <div id="formEmpleado" class="card hidden">
      <div class="card-title">Nuevo empleado</div>
      <div class="form-row">
        <div class="field"><label>Nombre completo</label><input type="text" id="eNombre" placeholder="Carlos López" /></div>
        <div class="field"><label>Área / Rol</label>
          <select id="eRol">
            <option value="encargado">Encargado de casa</option>
            <option value="pintura">Pintura</option>
            <option value="tecnico">Técnico</option>
            <option value="limpieza">Limpieza</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label>Correo electrónico</label><input type="email" id="eEmail" placeholder="empleado@email.com" /></div>
        <div class="field"><label>Contraseña temporal</label><input type="password" id="ePass" placeholder="Mínimo 8 caracteres" /></div>
      </div>
      <div id="empError" class="error-msg"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="addEmpleado()">Guardar empleado</button>
        <button class="btn" onclick="hideFormEmpleado()">Cancelar</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Equipo registrado</div>
      ${lista.length === 0
        ? '<div class="empty-state"><div class="empty-icon">👥</div><p>No hay empleados. Agrega el primero.</p></div>'
        : lista.map(e => {
            const rc = ROLES[e.rol];
            return `<div class="worker-row">
              <div class="worker-avatar" style="background:${rc.avatarBg};color:${rc.avatarColor}">${initials(e.nombre)}</div>
              <div class="worker-info">
                <div class="worker-name">${e.nombre}</div>
                <div class="worker-stats">${rolBadge(e.rol)} · ${e.email}</div>
              </div>
              <span class="badge ${e.activo ? 'badge-completa' : 'badge-vencida'}">${e.activo ? 'Activo' : 'Inactivo'}</span>
            </div>`;
          }).join('')
      }
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
  if (pass.length < 8) { errEl.textContent = 'La contraseña debe tener al menos 8 caracteres'; return; }
 
  errEl.textContent = 'Creando empleado...';
 
  const { data, error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { nombre, rol } }
  });
 
  if (error) { errEl.textContent = 'Error: ' + error.message; return; }
 
  if (data.user) {
    await sb.from('perfiles').upsert({
      id: data.user.id,
      nombre, email, rol, activo: true
    });
  }
 
  errEl.textContent = '✓ Empleado creado correctamente';
  await loadGlobal();
  setTimeout(() => { hideFormEmpleado(); renderEmpleados(); }, 1500);
}
 
// ═══════════════════════════════════════════
//  TAREAS
// ═══════════════════════════════════════════
async function renderTareas() {
  const asignables = rolesAsignables();
  let q = sb.from('tareas').select('*, empleado:perfiles!tareas_empleado_id_fkey(nombre,rol)');
  if (ME.rol === 'encargado') q = q.in('rol', asignables);
  const { data } = await q.order('creado_en', { ascending: false });
  const tareas = data || [];
 
  const empOpts = empleados
    .filter(e => asignables.includes(e.rol))
    .map(e => `<option value="${e.id}" data-rol="${e.rol}">${e.nombre} (${ROLES[e.rol].label})</option>`)
    .join('');
 
  $('pageContent').innerHTML = `
    <div class="page-header">
      <div><h2>✅ Tareas</h2><p>${ME.rol==='admin'?'Todas las tareas':'Tareas de tu equipo'}</p></div>
      <button class="btn btn-primary" onclick="showFormTarea()">＋ Nueva tarea</button>
    </div>
    <div id="formTarea" class="card hidden">
      <div class="card-title">Nueva tarea</div>
      <div class="form-row">
        <div class="field">
          <label>Empleado</label>
          <select id="fEmpleado" onchange="onEmpleadoChange(this)">
            <option value="">— Selecciona empleado —</option>
            ${empOpts}
          </select>
        </div>
        <div class="field">
          <label>Tarea predefinida</label>
          <select id="fPredefinida" onchange="onPredefinidaChange(this)">
            <option value="">— Selecciona primero un empleado —</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>Descripción (editable)</label>
        <input type="text" id="fDesc" placeholder="Descripción de la tarea" />
      </div>
      <div class="form-row">
        <div class="field"><label>Monto ($)</label><input type="number" id="fMonto" placeholder="0" /></div>
        <div class="field"><label>Fecha límite</label><input type="date" id="fFecha" /></div>
      </div>
      <div class="field"><label>Notas (opcional)</label><input type="text" id="fNotas" placeholder="Materiales, instrucciones..." /></div>
      <div class="divider"></div>
      <div class="card-title" style="font-size:13px">⚡ Selección múltiple con monto global</div>
      <div id="checklistContainer" style="display:none">
        <div id="checklist" class="checklist-grid"></div>
        <div class="form-row" style="margin-top:10px">
          <div class="field">
            <label>Monto global (se divide entre tareas seleccionadas)</label>
            <input type="number" id="fMontoGlobal" placeholder="5000" oninput="calcMontoGlobal()" />
          </div>
          <div class="field" style="display:flex;align-items:flex-end">
            <p id="montoCalc" style="font-size:12px;color:var(--text2);padding-bottom:9px"></p>
          </div>
        </div>
      </div>
      <div id="fError" class="error-msg"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="addTarea()">Guardar tarea</button>
        <button class="btn btn-purple" onclick="addTareasMultiples()">Guardar selección múltiple</button>
        <button class="btn" onclick="hideFormTarea()">Cancelar</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Lista de tareas</div>
      ${tareas.length === 0
        ? '<div class="empty-state"><div class="empty-icon">📋</div><p>No hay tareas. Crea la primera.</p></div>'
        : `<div class="task-list">${tareas.map(t => renderTaskItem(t, true, true)).join('')}</div>`}
    </div>`;
}
 
function onEmpleadoChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  const rol = opt.dataset.rol;
  const predSel = $('fPredefinida');
  if (!rol) {
    predSel.innerHTML = '<option value="">— Selecciona primero un empleado —</option>';
    $('checklistContainer').style.display = 'none';
    return;
  }
  const preds = tareasPredef.filter(t => t.rol === rol);
  predSel.innerHTML = `<option value="">— Selecciona tarea —</option>` +
    preds.map(t => `<option value="${t.descripcion}">${t.descripcion}</option>`).join('') +
    `<option value="custom">✏ Escribir tarea personalizada</option>`;
  $('checklistContainer').style.display = 'block';
  $('checklist').innerHTML = preds.map(t => `
    <label class="check-item">
      <input type="checkbox" value="${t.descripcion}" onchange="calcMontoGlobal()" />
      <span>${t.descripcion}</span>
    </label>`).join('');
}
 
function onPredefinidaChange(sel) {
  if (sel.value && sel.value !== 'custom') {
    $('fDesc').value = sel.value;
  } else if (sel.value === 'custom') {
    $('fDesc').value = '';
    $('fDesc').focus();
  }
}
 
function calcMontoGlobal() {
  const global = Number($('fMontoGlobal').value) || 0;
  const checked = document.querySelectorAll('#checklist input:checked');
  const n = checked.length;
  if (global && n > 0) {
    $('montoCalc').textContent = `${fmtMoney(Math.round(global/n))} por tarea (${n} seleccionadas)`;
  } else {
    $('montoCalc').textContent = '';
  }
}
 
function showFormTarea() { $('formTarea').classList.remove('hidden'); }
function hideFormTarea()  { $('formTarea').classList.add('hidden'); }
 
async function addTarea() {
  const empId = $('fEmpleado').value;
  const desc  = $('fDesc').value.trim();
  const monto = $('fMonto').value;
  const fecha = $('fFecha').value;
  const notas = $('fNotas').value.trim();
  const errEl = $('fError');
 
  if (!empId) { errEl.textContent = 'Selecciona un empleado'; return; }
  if (!desc)  { errEl.textContent = 'Escribe una descripción'; return; }
  if (!monto || Number(monto) <= 0) { errEl.textContent = 'Ingresa un monto válido'; return; }
 
  const emp = empleados.find(e => e.id === empId);
  const { error } = await sb.from('tareas').insert({
    descripcion: desc, rol: emp.rol, empleado_id: empId,
    monto: Number(monto), fecha_limite: fecha || null,
    notas: notas || null, asignado_por: ME.id,
  });
 
  if (error) { errEl.textContent = 'Error: ' + error.message; return; }
  errEl.textContent = '';
  hideFormTarea();
  await renderTareas();
}
 
async function addTareasMultiples() {
  const empId   = $('fEmpleado').value;
  const global  = Number($('fMontoGlobal').value) || 0;
  const fecha   = $('fFecha').value;
  const notas   = $('fNotas').value.trim();
  const errEl   = $('fError');
  const checked = [...document.querySelectorAll('#checklist input:checked')];
 
  if (!empId)            { errEl.textContent = 'Selecciona un empleado'; return; }
  if (checked.length===0){ errEl.textContent = 'Selecciona al menos una tarea'; return; }
  if (!global)           { errEl.textContent = 'Ingresa el monto global'; return; }
 
  const emp  = empleados.find(e => e.id === empId);
  const por  = Math.round(global / checked.length);
  const rows = checked.map(c => ({
    descripcion: c.value, rol: emp.rol, empleado_id: empId,
    monto: por, fecha_limite: fecha || null,
    notas: notas || null, asignado_por: ME.id,
  }));
 
  const { error } = await sb.from('tareas').insert(rows);
  if (error) { errEl.textContent = 'Error: ' + error.message; return; }
  errEl.textContent = '';
  hideFormTarea();
  await renderTareas();
}
 
async function deleteTarea(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  await sb.from('tareas').delete().eq('id', id);
  await goTo(currentPage);
}
 
async function toggleTarea(id) {
  const { data } = await sb.from('tareas').select('done').eq('id',id).single();
  const done = !data.done;
  await sb.from('tareas').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id);
  await goTo(currentPage);
}
 
function renderTaskItem(t, canDelete=false, showRole=false) {
  const emp = t.empleado || empleados.find(e=>e.id===t.empleado_id);
  return `
    <div class="task-item ${t.done?'done':''}">
      <div class="task-check ${t.done?'checked':''}" onclick="toggleTarea(${t.id})">${t.done?'✓':''}</div>
      <div class="task-body">
        <div class="task-name ${t.done?'done':''}">${t.descripcion}</div>
        <div class="task-meta">
          ${showRole ? rolBadge(t.rol) : ''}
          ${emp ? `<span style="font-size:11px;color:var(--text2)">👤 ${emp.nombre||emp}</span>` : ''}
          <span class="task-amount">${fmtMoney(t.monto)}</span>
          ${taskBadge(t)}
          ${t.fecha_limite ? `<span class="task-date">📅 ${fmtDate(t.fecha_limite)}</span>` : ''}
          ${t.done && t.done_at ? `<span class="task-done-at">· ${fmtDT(t.done_at)}</span>` : ''}
        </div>
        ${t.notas ? `<div style="font-size:11px;color:var(--text3);margin-top:3px">📌 ${t.notas}</div>` : ''}
      </div>
      <div class="task-actions">
        ${canDelete && ME.rol==='admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteTarea(${t.id})">🗑</button>` : ''}
      </div>
    </div>`;
}
 
// ═══════════════════════════════════════════
//  MIS TAREAS
// ═══════════════════════════════════════════
async function renderMisTareas() {
  const { data } = await sb.from('tareas').select('*').eq('empleado_id', ME.id).order('creado_en', { ascending: false });
  const mis  = data || [];
  const done = mis.filter(t=>t.done).length;
  const pct  = mis.length ? Math.round(done/mis.length*100) : 0;
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>✅ Mis tareas</h2><p>Solo tus tareas asignadas</p></div></div>
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
    <div class="card">
      <div class="card-title">Mis tareas</div>
      ${mis.length === 0
        ? '<div class="empty-state"><div class="empty-icon">🎯</div><p>No tienes tareas asignadas aún.</p></div>'
        : `<div class="task-list">${mis.map(t=>renderTaskItem(t,false,false)).join('')}</div>`}
    </div>`;
}
 
// ═══════════════════════════════════════════
//  MIS PAGOS
// ═══════════════════════════════════════════
async function renderMisPagos() {
  const { data } = await sb.from('tareas').select('*').eq('empleado_id', ME.id);
  const mis      = data || [];
  const ganado   = mis.filter(t=>t.done).reduce((a,t)=>a+Number(t.monto),0);
  const porGanar = mis.filter(t=>!t.done).reduce((a,t)=>a+Number(t.monto),0);
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>💰 Mis pagos</h2><p>Tu resumen de ganancias</p></div></div>
    <div class="stats-grid">
      <div class="stat-card stat-green"><div class="stat-num">${fmtMoney(ganado)}</div><div class="stat-lbl">Ganado</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${fmtMoney(porGanar)}</div><div class="stat-lbl">Por ganar</div></div>
      <div class="stat-card stat-cyan"><div class="stat-num">${fmtMoney(ganado+porGanar)}</div><div class="stat-lbl">Total asignado</div></div>
    </div>
    <div class="card">
      <div class="card-title">Detalle</div>
      ${mis.length === 0
        ? '<div class="empty-state"><div class="empty-icon">💸</div><p>Sin tareas asignadas aún.</p></div>'
        : `<div class="task-list">${mis.map(t=>`
          <div class="task-item ${t.done?'done':''}">
            <div class="task-check ${t.done?'checked':''}" style="cursor:default">${t.done?'✓':''}</div>
            <div class="task-body">
              <div class="task-name ${t.done?'done':''}">${t.descripcion}</div>
              <div class="task-meta">
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
async function renderEquipo() {
  const roles = ME.rol==='admin' ? ['encargado','pintura','tecnico','limpieza'] : ['pintura','tecnico','limpieza'];
  const { data: tareas } = await sb.from('tareas').select('*').in('rol', roles);
  const all = tareas || [];
  const workers = empleados.filter(e => roles.includes(e.rol));
  const totalGanado = workers.reduce((a,w)=> a + all.filter(t=>t.empleado_id===w.id&&t.done).reduce((s,t)=>s+Number(t.monto),0), 0);
  const totalPend   = workers.reduce((a,w)=> a + all.filter(t=>t.empleado_id===w.id&&!t.done).reduce((s,t)=>s+Number(t.monto),0), 0);
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>👥 Equipo y pagos</h2><p>Progreso y ganancias por trabajador</p></div></div>
    <div class="stats-grid">
      <div class="stat-card stat-green"><div class="stat-num">${fmtMoney(totalGanado)}</div><div class="stat-lbl">Total ganado</div></div>
      <div class="stat-card stat-amber"><div class="stat-num">${fmtMoney(totalPend)}</div><div class="stat-lbl">Por pagar</div></div>
      <div class="stat-card stat-cyan"><div class="stat-num">${fmtMoney(totalGanado+totalPend)}</div><div class="stat-lbl">Total asignado</div></div>
    </div>
    ${workers.length === 0
      ? '<div class="card"><div class="empty-state"><div class="empty-icon">👥</div><p>No hay empleados registrados.</p></div></div>'
      : workers.map(w => {
          const rc = ROLES[w.rol];
          const mis    = all.filter(t=>t.empleado_id===w.id);
          const done   = mis.filter(t=>t.done).length;
          const ganado = mis.filter(t=>t.done).reduce((a,t)=>a+Number(t.monto),0);
          const porG   = mis.filter(t=>!t.done).reduce((a,t)=>a+Number(t.monto),0);
          const pct    = mis.length ? Math.round(done/mis.length*100) : 0;
          return `
            <div class="card">
              <div class="worker-row" style="border:none;padding:0 0 12px">
                <div class="worker-avatar" style="background:${rc.avatarBg};color:${rc.avatarColor}">${initials(w.nombre)}</div>
                <div class="worker-info">
                  <div class="worker-name">${w.nombre}</div>
                  <div class="worker-stats">${rolBadge(w.rol)} · ${done}/${mis.length} tareas</div>
                  <div class="progress-bar" style="margin-top:6px"><div class="progress-fill" style="width:${pct}%"></div></div>
                </div>
                <div class="worker-amount">${fmtMoney(ganado)}<small>de ${fmtMoney(ganado+porG)}</small></div>
              </div>
              <hr class="divider" style="margin:0 0 10px">
              <div class="task-list">
                ${mis.length===0
                  ? '<div class="empty-state" style="padding:.75rem"><p>Sin tareas</p></div>'
                  : mis.map(t=>renderTaskItem(t, ME.rol==='admin', false)).join('')}
              </div>
            </div>`;
        }).join('')}`;
}
 
// ═══════════════════════════════════════════
//  COTIZACIÓN
// ═══════════════════════════════════════════
async function renderCotizacion() {
  const { data } = await sb.from('cotizaciones').select('*').order('creado_en',{ascending:false}).limit(1);
  const ultima = data?.[0] || null;
 
  $('pageContent').innerHTML = `
    <div class="page-header"><div><h2>📋 Cotización</h2><p>Genera la cotización de la propiedad</p></div></div>
    <div class="card">
      <div class="card-title">Datos de la propiedad</div>
      <div class="form-row">
        <div class="field"><label>Dirección</label><input type="text" id="cDir" placeholder="Calle 5 #234" /></div>
        <div class="field"><label>Área (m²)</label><input type="number" id="cArea" placeholder="120" /></div>
      </div>
      <div class="form-row-3">
        <div class="field"><label>Habitaciones</label><input type="number" id="cHab" placeholder="3" /></div>
        <div class="field"><label>Baños</label><input type="number" id="cBan" placeholder="2" /></div>
        <div class="field"><label>Niveles</label><input type="number" id="cNiv" placeholder="1" /></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Costos por área</div>
      <div class="form-row">
        <div class="field"><label>Pintura ($)</label><input type="number" id="cPintura" placeholder="5000" /></div>
        <div class="field"><label>Técnico ($)</label><input type="number" id="cTecnico" placeholder="3000" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Limpieza ($)</label><input type="number" id="cLimpieza" placeholder="1500" /></div>
        <div class="field"><label>Encargado ($)</label><input type="number" id="cEncargado" placeholder="2000" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Materiales ($)</label><input type="number" id="cMat" placeholder="8000" /></div>
        <div class="field"><label>Margen admin (%)</label><input type="number" id="cMargen" value="20" /></div>
      </div>
      <button class="btn btn-primary" onclick="calcCotizacion()">Calcular cotización</button>
    </div>
    <div id="cotResult" class="hidden card">
      <div class="card-title">📄 Resultado</div>
      <div id="cotBody"></div>
    </div>
    ${ultima ? `
      <div class="card">
        <div class="card-title">🕐 Última cotización — ${new Date(ultima.creado_en).toLocaleDateString('es-MX')}</div>
        <div class="cot-result">
          <div class="cot-row"><span>Pintura</span><span class="cot-val">${fmtMoney(ultima.costo_pintura)}</span></div>
          <div class="cot-row"><span>Técnico</span><span class="cot-val">${fmtMoney(ultima.costo_tecnico)}</span></div>
          <div class="cot-row"><span>Limpieza</span><span class="cot-val">${fmtMoney(ultima.costo_limpieza)}</span></div>
          <div class="cot-row"><span>Encargado</span><span class="cot-val">${fmtMoney(ultima.costo_encargado)}</span></div>
          <div class="cot-row"><span>Materiales</span><span class="cot-val">${fmtMoney(ultima.materiales)}</span></div>
          <div class="cot-row"><span>Margen (${ultima.margen}%)</span><span class="cot-val">${fmtMoney(ultima.admin_fee)}</span></div>
          <div class="cot-row total"><span>TOTAL</span><span>${fmtMoney(ultima.total)}</span></div>
        </div>
      </div>` : ''}`;
}
 
async function calcCotizacion() {
  const pintura   = Number($('cPintura').value)||0;
  const tecnico   = Number($('cTecnico').value)||0;
  const limpieza  = Number($('cLimpieza').value)||0;
  const encargado = Number($('cEncargado').value)||0;
  const mat       = Number($('cMat').value)||0;
  const margen    = Number($('cMargen').value)||20;
  const dir       = $('cDir').value;
  const sub       = pintura+tecnico+limpieza+encargado+mat;
  const fee       = Math.round(sub*margen/100);
  const total     = sub+fee;
 
  await sb.from('cotizaciones').insert({
    direccion: dir, area: $('cArea').value||null,
    habitaciones: $('cHab').value||null, banos: $('cBan').value||null, niveles: $('cNiv').value||null,
    costo_pintura: pintura, costo_tecnico: tecnico, costo_limpieza: limpieza,
    costo_encargado: encargado, materiales: mat, margen, subtotal: sub, admin_fee: fee, total,
    creado_por: ME.id,
  });
 
  $('cotResult').classList.remove('hidden');
  $('cotBody').innerHTML = `
    ${dir?`<div class="alert alert-info">📍 ${dir}</div>`:''}
    <div class="cot-result">
      <div class="cot-row"><span>${rolBadge('pintura')} Pintura</span><span class="cot-val">${fmtMoney(pintura)}</span></div>
      <div class="cot-row"><span>${rolBadge('tecnico')} Técnico</span><span class="cot-val">${fmtMoney(tecnico)}</span></div>
      <div class="cot-row"><span>${rolBadge('limpieza')} Limpieza</span><span class="cot-val">${fmtMoney(limpieza)}</span></div>
      <div class="cot-row"><span>${rolBadge('encargado')} Encargado</span><span class="cot-val">${fmtMoney(encargado)}</span></div>
      <div class="cot-row"><span>🔩 Materiales</span><span class="cot-val">${fmtMoney(mat)}</span></div>
      <div class="cot-row"><span>Subtotal</span><span class="cot-val">${fmtMoney(sub)}</span></div>
      <div class="cot-row"><span>Margen admin (${margen}%)</span><span class="cot-val">${fmtMoney(fee)}</span></div>
      <div class="cot-row total"><span>TOTAL</span><span>${fmtMoney(total)}</span></div>
    </div>`;
}
