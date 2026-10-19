export const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const EX = (id, name, sets, reps, note='') => ({ id, name, sets, reps, note });

export const DEFAULT_WEEK = {
  0: { mode:'rest', restType:'total', note:'Descanso total: hidrátate, duerme bien y estira suave.' },
  1: { mode:'workout', name:'Pecho y Tríceps', exercises:[
    EX('l1','Flexiones',4,12), EX('l2','Fondos',3,10),
    EX('l3','Extensiones',3,15), EX('l4','Press banca',3,10),
  ]},
  2: { mode:'workout', name:'Espalda y Bíceps', exercises:[
    EX('m1','Dominadas',4,8), EX('m2','Remo con mancuerna',3,12), EX('m3','Curl bíceps',3,12),
  ]},
  3: { mode:'rest', restType:'active', note:'Camina 30 minutos a ritmo suave.' },
  4: { mode:'workout', name:'Piernas', exercises:[
    EX('j1','Sentadillas',4,12), EX('j2','Zancadas',3,10),
    EX('j3','Peso muerto',3,8), EX('j4','Gemelos',4,15),
  ]},
  5: { mode:'workout', name:'Hombros y Core', exercises:[
    EX('v1','Press hombros',3,10), EX('v2','Elevaciones laterales',3,15), EX('v3','Plancha',3,45,'seg'),
  ]},
  6: { mode:'rest', restType:'active', note:'Movilidad y estiramientos 15 min.' },
};

export const todayISO = (d = new Date()) => {
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
};
export const emptyLog = (date) => ({ date, completed:[], done:false, restDone:false });
export const isDone = (log, cfg) => {
  if (!log || !cfg) return false;
  return cfg.mode === 'rest' ? log.restDone === true : log.done === true;
};

export function computeStreak(logs, week, ref = new Date()) {
  const d = new Date(ref); d.setHours(0,0,0,0);
  if (!isDone(logs[todayISO(d)], week[d.getDay()])) d.setDate(d.getDate() - 1);
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    if (!isDone(logs[todayISO(d)], week[d.getDay()])) break;
    n++; d.setDate(d.getDate() - 1);
  }
  return n;
}