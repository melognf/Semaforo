import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ========= Firebase ========= */
const firebaseConfig = {
  apiKey: "AIzaSyCUYhpx2tDjX40Si-DPXWzONa8wqwW9pb8",
  authDomain: "semaforoproductivo.firebaseapp.com",
  projectId: "semaforoproductivo",
  storageBucket: "semaforoproductivo.appspot.com",
  messagingSenderId: "273022276004",
  appId: "1:273022276004:web:2127523c4a0a6b7884f131"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ========= Orden intercalado EXACTO ========= */
const ORDEN = [
  { id:'depaletizadora',                label:'DEPALETIZADORA',                    type:'maquina'     },
  { id:'transporte_aereo',              label:'TRANSPORTE AÉREO',                  type:'transporte'  },
  { id:'llenadora',                     label:'LLENADORA',                         type:'maquina'     },
  { id:'warmer',                        label:'WARMER',                            type:'maquina'     },
  { id:'transporte_latas_llenas',       label:'TRANSPORTE DE LATAS LLENAS',        type:'transporte'  },
  { id:'ocme',                          label:'OCME',                              type:'maquina'     },
  { id:'transporte_paquetes',           label:'TRANSPORTE DE PAQUETES',            type:'transporte'  },
  { id:'paletizadora',                  label:'PALETIZADORA',                      type:'maquina'     },
  { id:'transporte_pallets_terminados', label:'TRANSPORTE DE PALLETS TERMINADOS',  type:'transporte'  },
  { id:'envolvedora',                   label:'ENVOLVEDORA',                       type:'maquina'     }
];

/* ========= Estado local ========= */
const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

const cronos = {};
const estadosActuales = {};
const timestampsVistos = {};
const origenes = {};
const lastNotificadoTs = {};   // anti-duplicado local por equipo

/* ========= WebSocket (WSS) ========= */
/* Cambiá WS_URL por tu endpoint (debe ser wss:// si servís por https) */
const WS_URL   = "wss://TU-SERVIDOR/tu-endpoint";
const WS_TOKEN = ""; // opcional
let ws = null;
let wsReady = false;
const wsQueue = [];

function wsOpen(){
  try { ws = new WebSocket(WS_URL); }
  catch(e){ console.error("[WS] open error:", e); setTimeout(wsOpen, 3000); return; }

  ws.onopen = () => {
    wsReady = true;
    if (WS_TOKEN) ws.send(JSON.stringify({ type:"auth", token:WS_TOKEN }));
    while (wsQueue.length) ws.send(wsQueue.shift());
  };
  ws.onclose  = () => { wsReady = false; setTimeout(wsOpen, 3000); };
  ws.onerror  = () => { try{ ws.close(); }catch{} };
  ws.onmessage = () => {};
}
function wsSend(obj){
  const s = JSON.stringify(obj);
  if (wsReady && ws?.readyState === WebSocket.OPEN) ws.send(s);
  else wsQueue.push(s);
}
wsOpen();

function labelDe(id){
  const n = ORDEN.find(x => x.id === id);
  return n ? n.label : id;
}
function enviarNotiWS({ id, color, texto, timestamp }){
  if (color !== 'amarillo' && color !== 'rojo') return;
  if (lastNotificadoTs[id] === timestamp) return;   // evita doble envío local
  lastNotificadoTs[id] = timestamp;

  wsSend({
    type: "evento_linea",
    nivel: color,                 // 'amarillo' | 'rojo'
    equipo_id: id,
    equipo_label: labelDe(id),
    texto: (texto || '').trim(),
    timestamp,
    origen: deviceId              // quien generó
  });
}

const $ = (s, ctx=document) => ctx.querySelector(s);
const grid = $('#grid-linea');

/* ========= Render ========= */
function crearCard(node){
  if (node.type === 'transporte') return crearCardTransporte(node);
  return crearCardMaquina(node);
}
function crearCardMaquina({id, label}){
  const card = document.createElement('div');
  card.className = 'card maquina';
  card.id = `card-${id}`;
  card.innerHTML = `
    <h3>${label}</h3>
    <div class="estado" id="estado-${id}"></div>
    <div class="botones">
      <button class="verde-btn"    data-id="${id}" data-color="verde">OK</button>
      <button class="amarillo-btn" data-id="${id}" data-color="amarillo">Advertencia</button>
      <button class="rojo-btn"     data-id="${id}" data-color="rojo">Fallo</button>
    </div>
    <div class="msg" id="msg-${id}"></div>
    <div class="cron" id="cron-${id}"></div>
  `;
  return card;
}
function crearCardTransporte({id, label}){
  const card = document.createElement('div');
  card.className = 'card transporte';
  card.id = `card-${id}`;
  card.innerHTML = `
    <h3>${label}</h3>
    <div class="trayecto" id="trayecto-${id}">
      <div class="cinta"></div>
    </div>
    <div class="botones">
      <button class="verde-btn"    data-id="${id}" data-color="verde">OK</button>
      <button class="amarillo-btn" data-id="${id}" data-color="amarillo">Advertencia</button>
      <button class="rojo-btn"     data-id="${id}" data-color="rojo">Fallo</button>
    </div>
    <div class="msg" id="msg-${id}"></div>
    <div class="cron" id="cron-${id}"></div>
  `;
  return card;
}
function montarUI(){
  ORDEN.forEach(n => grid.appendChild(crearCard(n)));
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id][data-color]');
    if (!btn) return;
    const id = btn.dataset.id;
    const color = btn.dataset.color;
    cambiarEstado(id, color);
  });
}

/* ========= Visual ========= */
function mostrarEstado(id, color, texto = '', timestamp = ''){
  clearInterval(cronos[id]);

  const card = document.querySelector(`#card-${id}`);
  const msg  = document.querySelector(`#msg-${id}`);
  const cron = document.querySelector(`#cron-${id}`);

  if (msg)  msg.textContent = '';
  if (cron) cron.textContent = '';

  const esTransporte = !!document.querySelector(`#trayecto-${id}`);
  if (esTransporte) {
    const track = document.querySelector(`#trayecto-${id}`);
    track.classList.remove('verde','amarillo','rojo');
    track.classList.add(color);
  } else {
    const luz = document.querySelector(`#estado-${id}`);
    if (luz) luz.className = 'estado ' + color;
  }

  if (color === 'amarillo' && texto) {
    if (msg) msg.textContent = `⚠️ ${texto}`;
  } else if (color === 'rojo' && texto) {
    if (msg) msg.textContent = `❌ ${texto}`;
    const inicioMs = timestamp ? new Date(timestamp).getTime() : Date.now();
    cronos[id] = setInterval(() => {
      const elapsed = Math.floor((Date.now() - inicioMs) / 1000);
      const hh = String(Math.floor(elapsed/3600)).padStart(2,'0');
      const mm = String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
      const ss = String(elapsed%60).padStart(2,'0');
      if (cron) cron.textContent = `⏱ Tiempo detenido: ${hh}:${mm}:${ss}`;
    }, 1000);
  }

  if (card){
    if (color === 'verde') card.classList.add('compact');
    else card.classList.remove('compact', 'show-controls');
  }

  estadosActuales[id] = color;
  actualizarBotones(id, color);

  updateMobileSummary();
}

/* ========= Firestore ========= */
async function guardarEnFirestore(id, estado, texto, timestamp){
  await setDoc(doc(db, 'equipos', id), {
    estado,
    texto,
    timestamp,     // usamos el mismo ts que enviamos por WS y que vemos en UI
    origen: deviceId
  }, { merge: true });
}

async function cambiarEstado(id, color){
  const estadoActual = estadosActuales[id];
  const origenActual = origenes[id];

  if ((estadoActual === 'rojo' || estadoActual === 'amarillo') &&
      color === 'verde' &&
      origenActual && origenActual !== deviceId) {
    alert('❌ Solo el dispositivo que activó el estado puede restablecer este equipo.');
    return;
  }

  let texto = '';
  if (color === 'amarillo') {
    texto = prompt('Describa el problema de advertencia:') || '';
    if (!texto.trim()) return;
  } else if (color === 'rojo') {
    texto = prompt('Describa el fallo del equipo:') || '';
    if (!texto.trim()) return;
  }

  // timestamp único para este evento (UI, Firestore y WS)
  const ts = new Date().toISOString();

  // feedback inmediato en UI
  mostrarEstado(id, color, texto, ts);
  origenes[id] = deviceId;

  // guardamos en Firestore
  await guardarEnFirestore(id, color, texto, ts);

  // 🔔 envia WS SOLO el generador (este cliente)
  enviarNotiWS({ id, color, texto, timestamp: ts });
}

function actualizarBotones(id, estado){
  const cont = document.querySelector(`#card-${id} .botones`);
  if (!cont) return;

  const btnOk    = cont.querySelector('.verde-btn');
  const btnWarn  = cont.querySelector('.amarillo-btn');
  const btnFail  = cont.querySelector('.rojo-btn');

  if (estado === 'rojo') btnWarn?.classList.add('oculto');
  else btnWarn?.classList.remove('oculto');

  const esRojoOAmarillo = (estado === 'rojo' || estado === 'amarillo');
  const esMiFallo = origenes[id] === deviceId;

  if (btnOk) btnOk.disabled = (esRojoOAmarillo && !esMiFallo);
  if (btnWarn) btnWarn.disabled = false;
  if (btnFail) btnFail.disabled = false;
}

function suscribir(id){
  const ref = doc(db, 'equipos', id);
  onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const recibido = new Date(data.timestamp || 0).getTime();
    const visto = new Date(timestampsVistos[id] || 0).getTime();

    if (recibido > visto) {
      timestampsVistos[id] = data.timestamp;
      origenes[id] = data.origen || null;

      // Actualizamos UI (NO enviamos WS aquí para que sólo lo haga el generador)
      mostrarEstado(id, data.estado, data.texto, data.timestamp);
    }
  });

  // Estado inicial (opcional: verde)
  mostrarEstado(id, estadosActuales[id] || 'verde', '', '');
}

/* ========= Bootstrap ========= */
function attachRevealHandlers(){
  const SHOW_MS = 4000;
  const hideTimers = {};
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('pointerenter', () => {
      if (!card.classList.contains('compact')) return;
      card.classList.add('show-controls');
      clearTimeout(hideTimers[card.id]);
      hideTimers[card.id] = setTimeout(()=>card.classList.remove('show-controls'), SHOW_MS);
    });
    card.addEventListener('pointerleave', () => {
      clearTimeout(hideTimers[card.id]);
      card.classList.remove('show-controls');
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('.botones')) return;
      if (!card.classList.contains('compact')) return;
      card.classList.add('show-controls');
      clearTimeout(hideTimers[card.id]);
      hideTimers[card.id] = setTimeout(()=>card.classList.remove('show-controls'), SHOW_MS);
    });
    card.addEventListener('focusin', () => {
      if (!card.classList.contains('compact')) return;
      card.classList.add('show-controls');
    });
  });
}

montarUI();
ORDEN.forEach(async n => {
  await setDoc(doc(db,'equipos', n.id), { tipo: n.type }, { merge: true });
  suscribir(n.id);
});
attachRevealHandlers();

/* ================================
   ===== Resumen móvil (NEW) =====
==================================*/
const isSmallScreen = window.matchMedia('(max-width: 600px)');

function ensureSummaryShell(){
  if (document.getElementById('summary-mobile')) return;
  const wrap = document.createElement('div');
  wrap.id = 'summary-mobile';
  wrap.innerHTML = `
    <div class="summary-card" role="status" aria-live="polite">
      <div class="summary-title">Estado general de la línea</div>
      <div class="summary-kpis">
        <div class="kpi ok"><div class="n" id="kpi-ok">0</div><div>OK</div></div>
        <div class="kpi warn"><div class="n" id="kpi-warn">0</div><div>Advertencias</div></div>
        <div class="kpi bad"><div class="n" id="kpi-bad">0</div><div>Fallas</div></div>
      </div>
      <div class="summary-list" id="summary-chips"></div>
      <div class="summary-footer" id="summary-footer"></div>
    </div>
  `;
  document.querySelector('.panel')?.insertBefore(wrap, document.getElementById('grid-linea'));
}

function firstIssueId(){
  for (const n of ORDEN){
    const st = estadosActuales[n.id];
    if (st === 'amarillo' || st === 'rojo') return n.id;
  }
  return null;
}

function scrollToIssue(){
  const id = firstIssueId();
  if (!id) return;
  const el = document.getElementById(`card-${id}`);
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior:'smooth', block:'start' });
    el.classList.add('show-controls');
  }, 50);
}

function updateMobileSummary(){
  if (!isSmallScreen.matches) {
    document.body.classList.remove('mobile-summary');
    return;
  }
  ensureSummaryShell();

  let ok=0, warn=0, bad=0;
  const chips = [];
  for (const n of ORDEN){
    const st = estadosActuales[n.id] || 'verde';
    if (st === 'verde') ok++;
    if (st === 'amarillo') { warn++; chips.push({t:n.label,c:'warn'}); }
    if (st === 'rojo')     { bad++;  chips.push({t:n.label,c:'bad'});  }
  }

  const $ok   = document.getElementById('kpi-ok');
  const $warn = document.getElementById('kpi-warn');
  const $bad  = document.getElementById('kpi-bad');
  if ($ok)   $ok.textContent = ok;
  if ($warn) $warn.textContent = warn;
  if ($bad)  $bad.textContent = bad;

  const list = document.getElementById('summary-chips');
  if (list){
    list.innerHTML = chips.map(ch => `<span class="chip ${ch.c}">${ch.t}</span>`).join('');
  }

  const footer = document.getElementById('summary-footer');
  if (footer){
    footer.textContent = (warn===0 && bad===0)
      ? 'Todo en verde. No es necesario revisar.'
      : 'Se detectaron incidencias. Mostrando tarjetas…';
  }

  if (warn===0 && bad===0){
    document.body.classList.add('mobile-summary');
  } else {
    document.body.classList.remove('mobile-summary');
    scrollToIssue();
  }
}

updateMobileSummary();
isSmallScreen.addEventListener('change', updateMobileSummary);
