import { getItem, setItem, getAll } from './lib/db.js';
import { DEFAULT_WEEK, DAY_NAMES, todayISO, emptyLog, isDone, computeStreak } from './lib/state.js';

const state = { week:null, logs:{}, bestStreak:0, view:'today', editingDay:new Date().getDay(), calMonth:new Date() };

async function saveLog(date, log) {
  log.date = date;
  state.logs[date] = log;
  await setItem('logs', date, log);
  const s = computeStreak(state.logs, state.week);
  if (s > state.bestStreak) { state.bestStreak = s; await setItem('config','bestStreak', s); }
}

function getWeeklyProgress() {
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1 = Lunes, 7 = Domingo
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + 1);
  startOfWeek.setHours(0,0,0,0);

  let workoutDays = 0;
  let completedDays = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const iso = todayISO(d);
    const cfg = state.week[d.getDay()];
    
    if (cfg.mode === 'workout') {
      workoutDays++;
      if (state.logs[iso]?.done) completedDays++;
    }
  }
  const pct = workoutDays === 0 ? 0 : Math.round((completedDays / workoutDays) * 100);
  return { completedDays, workoutDays, pct };
}

let timerInterval = null;

function startRestTimer(seconds = 90) {
  const timerEl = document.getElementById('rest-timer');
  const display = document.getElementById('timer-display');
  if (!timerEl || !display) return;
  
  timerEl.classList.remove('hidden');
  let timeLeft = seconds;

  const updateDisplay = () => {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    display.textContent = `${m}:${s}`;
  };
  
  updateDisplay();
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timeLeft--;
    updateDisplay();
    if (timeLeft <= 0) {
      stopRestTimer();
      playBeep();
    }
  }, 1000);
}

function stopRestTimer() {
  clearInterval(timerInterval);
  document.getElementById('rest-timer')?.classList.add('hidden');
}

function playBeep() {
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.log('Audio no soportado');
  }
}

function viewToday() {
  const today = new Date();
  const iso = todayISO(today);
  const cfg = state.week[today.getDay()];
  const log = state.logs[iso] || emptyLog(iso);
  const weekly = getWeeklyProgress();

  const weeklyWidget = `
    <div class="weekly-widget">
      <h3>Progreso Semanal</h3>
      <div class="weekly-bar"><div style="width:${weekly.pct}%"></div></div>
      <div class="weekly-stats">
        <span>${weekly.completedDays} de ${weekly.workoutDays} entrenamientos</span>
        <span>${weekly.pct}%</span>
      </div>
    </div>
  `;

  if (cfg.mode === 'rest') {
    return weeklyWidget + `<div class="card">
      <h2>🧘‍♂️ ${cfg.restType === 'total' ? 'Descanso Total' : 'Descanso Activo'}</h2>
      <p class="muted" style="margin-bottom:12px">${cfg.note || 'Día de recuperación.'}</p>
      ${log.restDone
        ? `<div class="msg-done"><div class="emoji">✅</div><h3>¡Descanso cumplido!</h3><p>Disfruta el día.</p></div>`
        : `<button class="btn btn-rest" data-action="rest-done">Marcar descanso cumplido</button>`}
    </div>`;
  }

  if (log.done) {
    return weeklyWidget + `<div class="card">
      <h2>${cfg.name}</h2>
      <div class="msg-done"><div class="emoji">✅</div><h3>¡Rutina del día completada!</h3>
      <p>Nos vemos mañana. Descansa y recupera.</p></div></div>`;
  }

  const total = cfg.exercises.length;
  const done = log.completed.length;
  const pct = total ? Math.round(done/total*100) : 0;

  return weeklyWidget + `<div class="card">
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
      <div class="metric"><div class="val">${streak}</div><div class="lbl">Racha</div></div>
      <div class="metric"><div class="val">${state.bestStreak}</div><div class="lbl">Mejor racha</div></div>
      <div class="metric"><div class="val">${trained}</div><div class="lbl">Entrenados</div></div>
    </div>
  </div>
  
  <div class="card" style="margin-top:20px;">
    <h2>💾 Copia de seguridad</h2>
    <p class="muted" style="margin-bottom:16px; font-size:14px;">Guarda tu rutina y racha para migrar a otro dispositivo.</p>
    <button class="btn btn-primary" data-action="export">Exportar mis datos</button>
    
    <label class="btn btn-secondary" style="display:block; text-align:center; margin-top:12px;">
      Importar archivo (.json)
      <input type="file" id="import-input" accept=".json" style="display:none;">
    </label>
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
    await saveLog(iso, log); 
    
    if (cb.checked) startRestTimer(90);
    render();
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

  
  document.getElementById('timer-skip')?.addEventListener('click', stopRestTimer);
  document.querySelector('[data-action="export"]')?.addEventListener('click', exportData);
  document.getElementById('import-input')?.addEventListener('change', importData);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function exportData() {
  try {
    const week = await getItem('config', 'week');
    const logs = await getAll('logs');
    const bestStreak = await getItem('config', 'bestStreak') || 0;
    
    const data = { version: 1, week: week || DEFAULT_WEEK, logs, bestStreak };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `rutinas_backup_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Error al exportar: ' + error.message);
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.week || !data.logs) throw new Error('El archivo no tiene el formato correcto.');
      
      if (confirm('¿Seguro que quieres importar estos datos? Se borrará tu rutina y progreso actual.')) {
        // Guardar nueva config y racha
        await setItem('config', 'week', data.week);
        await setItem('config', 'bestStreak', data.bestStreak || 0);
        
        // Limpiar historial viejo
        const db = await new Promise((res, rej) => {
          const req = indexedDB.open('rutinas-db', 1);
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
        await new Promise((res, rej) => {
          const tx = db.transaction('logs', 'readwrite');
          tx.objectStore('logs').clear();
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
        });

        // Insertar historial nuevo
        for (const log of data.logs) {
          await setItem('logs', log.date, log);
        }
        
        alert('¡Datos importados con éxito!');
        window.location.reload();
      }
    } catch (err) {
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  reader.readAsText(file);
}

async function boot() {

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('view')) {
    state.view = urlParams.get('view');
  }

  state.week = (await getItem('config','week')) || DEFAULT_WEEK;
  const logs = await getAll('logs');
  state.logs = Object.fromEntries(logs.map(l => [l.date, l]));
  state.bestStreak = (await getItem('config','bestStreak')) || 0;
  
  render();
  
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then((reg) => console.log('[SW] registrado, scope:', reg.scope))
        .catch((err) => console.error('[SW] falló:', err));
    });
  }
}


boot();
