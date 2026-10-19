import { getItem, setItem, getAll } from './lib/db.js';
import { DEFAULT_WEEK, DAY_NAMES, todayISO, emptyLog, isDone, computeStreak } from './lib/state.js';

const state = { week:null, logs:{}, bestStreak:0, view:'today', editingDay:new Date().getDay(), calMonth:new Date() };

async function boot() {
  state.week = (await getItem('config','week')) || DEFAULT_WEEK;
  const logs = await getAll('logs');
  state.logs = Object.fromEntries(logs.map(l => [l.date, l]));
  state.bestStreak = (await getItem('config','bestStreak')) || 0;
  render();
  if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })   // ⬅️ ruta relativa + scope explícito
      .then((reg) => console.log('[SW] registrado, scope:', reg.scope))
      .catch((err) => console.error('[SW] falló:', err));
  });
}

async function saveLog(date, log) {
  log.date = date;
  state.logs[date] = log;
  await setItem('logs', date, log);
  const s = computeStreak(state.logs, state.week);
  if (s > state.bestStreak) { state.bestStreak = s; await setItem('config','bestStreak', s); }
}

function viewToday() {
  const today = new Date();
  const iso = todayISO(today);
  const cfg = state.week[today.getDay()];
  const log = state.logs[iso] || emptyLog(iso);

  if (cfg.mode === 'rest') {
    return `<div class="card">
      <h2>🧘‍♂️ ${cfg.restType === 'total' ? 'Descanso Total' : 'Descanso Activo'}</h2>
      <p class="muted" style="margin-bottom:12px">${cfg.note || 'Día de recuperación.'}</p>
      ${log.restDone
        ? `<div class="msg-done"><div class="emoji">✅</div><h3>¡Descanso cumplido!</h3><p>Disfruta el día.</p></div>`
        : `<button class="btn btn-rest" data-action="rest-done">Marcar descanso cumplido</button>`}
    </div>`;
  }

  if (log.done) {
    return `<div class="card">
      <h2>${cfg.name}</h2>
      <div class="msg-done"><div class="emoji">✅</div><h3>¡Rutina del día completada!</h3>
      <p>Nos vemos mañana. Descansa y recupera.</p></div></div>`;
  }

  const total = cfg.exercises.length;
  const done = log.completed.length;
  const pct = total ? Math.round(done/total*100) : 0;

  return `<div class="card">
    <h2>${cfg.name}</h2>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <p class="muted" style="font-size:13px;margin-bottom:8px">${done} de ${total} · ${pct}%</p>
    ${cfg.exercises.map(ex => {
      const on = log.completed.includes(ex.id);
      return `<label class="task ${on?'done':''}">
        <input type="checkbox" data-ex="${ex.id}" ${on?'checked':''}>
        <div class="task-info">
          <div class="task-name">${esc(ex.name)}</div>
          <div class="task-meta">${ex.sets}x${ex.reps}${ex.note?' · '+esc(ex.note):''}</div>
        </div></label>`;
    }).join('')}
    <button class="btn btn-primary" data-action="complete-day" ${done<total?'disabled':''}>
      ${done===total ? 'Completar Día' : 'Marca todos para completar'}
    </button>
  </div>`;
}

function viewEditor() {
  const day = state.editingDay;
  const cfg = state.week[day];
  return `<div class="day-tabs">
    ${[1,2,3,4,5,6,0].map(d => `<button data-day="${d}" class="${d===day?'active':''}">${DAY_NAMES[d].slice(0,3)}</button>`).join('')}
  </div>
  <div class="card">
    <div class="field"><label>Modo del día</label>
      <select id="mode-select">
        <option value="workout" ${cfg.mode==='workout'?'selected':''}>Ejercicio</option>
        <option value="rest" ${cfg.mode==='rest'?'selected':''}>Descanso</option>
      </select>
    </div>
    ${cfg.mode === 'workout' ? editorWorkout(cfg) : editorRest(cfg)}
    <button class="btn btn-primary" data-action="save-day">Guardar cambios</button>
  </div>`;
}

function editorWorkout(cfg) {
  return `<div class="field"><label>Nombre de la rutina</label>
      <input id="routine-name" value="${esc(cfg.name||'')}"></div>
    <div class="field"><label>Ejercicios</label>
      <div id="exercise-list">
        ${cfg.exercises.map(ex => `
          <div class="exercise-row" data-exid="${ex.id}">
            <input class="ex-name" value="${esc(ex.name)}" placeholder="Nombre">
            <input class="ex-sets" type="number" min="1" value="${ex.sets}">
            <input class="ex-reps" type="number" min="1" value="${ex.reps}">
            <button class="del" data-action="del-ex">×</button>
          </div>`).join('')}
      </div>
      <button class="btn btn-secondary" data-action="add-ex" style="margin-top:8px">+ Añadir ejercicio</button>
    </div>`;
}

function editorRest(cfg) {
  return `<div class="field"><label>Tipo de descanso</label>
      <select id="rest-type">
        <option value="total" ${cfg.restType==='total'?'selected':''}>Total</option>
        <option value="active" ${cfg.restType==='active'?'selected':''}>Activo</option>
      </select></div>
    <div class="field"><label>Nota del día</label>
      <textarea id="rest-note" rows="3">${esc(cfg.note||'')}</textarea></div>`;
}

function viewHistory() {
  const y = state.calMonth.getFullYear(), m = state.calMonth.getMonth();
  const startOffset = (new Date(y,m,1).getDay()+6)%7;
  const daysInMonth = new Date(y,m+1,0).getDate();
  const todayIso = todayISO();
  const cells = [];
  for (let i=0;i<startOffset;i++) cells.push('<div class="cal-day empty"></div>');
  let trained = 0;
  for (let d=1;d<=daysInMonth;d++) {
    const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const log = state.logs[iso];
    const cfg = state.week[new Date(iso+'T12:00:00').getDay()];
    let cls = '';
    if (isDone(log, cfg)) { cls = cfg.mode==='rest' ? 'rest' : 'done'; if (cfg.mode!=='rest') trained++; }
    else if (iso < todayIso) cls = 'missed';
    if (iso === todayIso) cls += ' today';
    cells.push(`<div class="cal-day ${cls}">${d}</div>`);
  }
  const streak = computeStreak(state.logs, state.week);
  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <button class="nav-btn" data-action="prev-month">‹</button>
      <h2 style="margin:0;text-transform:capitalize">${state.calMonth.toLocaleDateString('es-ES',{month:'long',year:'numeric'})}</h2>
      <button class="nav-btn" data-action="next-month">›</button>
    </div>
    <div class="calendar">
      ${['L','M','X','J','V','S','D'].map(l=>`<div class="cal-head">${l}</div>`).join('')}
      ${cells.join('')}
    </div>
    <div class="metrics">
      <div class="metric"><div class="val">${streak}</div><div class="lbl">Racha actual</div></div>
      <div class="metric"><div class="val">${state.bestStreak}</div><div class="lbl">Mejor racha</div></div>
      <div class="metric"><div class="val">${trained}</div><div class="lbl">Entrenados</div></div>
    </div>
  </div>`;
}

function render() {
  const today = new Date();
  const streak = computeStreak(state.logs, state.week);
  document.getElementById('app-header').innerHTML = `<div class="header-inner">
    <div><div class="header-day">${DAY_NAMES[today.getDay()]}</div>
      <div class="header-date">${today.toLocaleDateString('es-ES',{day:'numeric',month:'long'})}</div></div>
    <div class="streak">🔥 ${streak} día${streak===1?'':'s'}</div>
  </div>`;
  const app = document.getElementById('app');
  app.innerHTML = state.view==='today' ? viewToday() : state.view==='editor' ? viewEditor() : viewHistory();
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.view));
  bind();
}

function bind() {
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => { state.view = b.dataset.tab; render(); });

  
  document.querySelectorAll('[data-ex]').forEach(cb => cb.onchange = async () => {
    const iso = todayISO();
    const log = state.logs[iso] || emptyLog(iso);
    const id = cb.dataset.ex;
    log.completed = cb.checked ? [...new Set([...log.completed, id])] : log.completed.filter(x => x !== id);
    await saveLog(iso, log); render();
  });
  document.querySelector('[data-action="complete-day"]')?.addEventListener('click', async () => {
    const iso = todayISO();
    const log = state.logs[iso] || emptyLog(iso);
    log.done = true; await saveLog(iso, log); render();
  });
  document.querySelector('[data-action="rest-done"]')?.addEventListener('click', async () => {
    const iso = todayISO();
    const log = state.logs[iso] || emptyLog(iso);
    log.restDone = true; await saveLog(iso, log); render();
  });

  
  document.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { state.editingDay = +b.dataset.day; render(); });
  document.getElementById('mode-select')?.addEventListener('change', e => {
    state.week[state.editingDay] = e.target.value === 'rest'
      ? { mode:'rest', restType:'total', note:'' }
      : { mode:'workout', name:'Nueva rutina', exercises:[] };
    render();
  });
  
  const cfg = state.week[state.editingDay];
  if (cfg.mode === 'workout') {
    document.getElementById('routine-name').oninput = e => cfg.name = e.target.value;
    document.querySelectorAll('#exercise-list .exercise-row').forEach(row => {
      const ex = cfg.exercises.find(x => x.id === row.dataset.exid);
      row.querySelector('.ex-name').oninput = e => ex.name = e.target.value;
      row.querySelector('.ex-sets').oninput = e => ex.sets = +e.target.value;
      row.querySelector('.ex-reps').oninput = e => ex.reps = +e.target.value;
    });
  }
  document.querySelector('[data-action="add-ex"]')?.addEventListener('click', () => {
    cfg.exercises.push({ id:'e'+Date.now(), name:'', sets:3, reps:10 }); render();
  });
  document.querySelectorAll('[data-action="del-ex"]').forEach(b => b.onclick = () => {
    const row = b.closest('.exercise-row');
    cfg.exercises = cfg.exercises.filter(e => e.id !== row.dataset.exid); render();
  });
  document.querySelector('[data-action="save-day"]')?.addEventListener('click', async () => {
    if (cfg.mode === 'rest') {
      cfg.restType = document.getElementById('rest-type').value;
      cfg.note = document.getElementById('rest-note').value;
    }
    await setItem('config','week', state.week);
    alert('Guardado ✓');
  });

  
  document.querySelector('[data-action="prev-month"]')?.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()-1, 1); render();
  });
  document.querySelector('[data-action="next-month"]')?.addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()+1, 1); render();
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

boot();
