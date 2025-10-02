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

/* ========= WhatsApp (ws) =========
   - Si querés un número fijo: poner WA_NUMBER = "54911xxxxxxxx"
   - WA_PREFIX: texto opcional que se agrega antes del mensaje que escribís
=================================== */
const WA_NUMBER = "";         // ej: "54911xxxxxxxx" (vacío => elegir contacto)
const WA_PREFIX = "";         // ej: "[L2] "
const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function buildWhatsAppURL(msg){
  const text = encodeURIComponent(WA_PREFIX + (msg || ""));
  if (WA_NUMBER && WA_NUMBER.trim()){
    const num = WA_NUMBER.replace(/[^\d]/g,'');
    return isMobileDevice()
      ? `whatsapp://send?phone=${num}&text=${text}`
      : `https://wa.me/${num}?text=${text}`;
  } else {
    return isMobileDevice()
      ? `whatsapp://send?text=${text}`
      : `https://wa.me/?text=${text}`;
  }
}
function enviarWhatsApp(msg){
  const url = buildWhatsAppURL(msg);
  // Intento abrir en nueva pestaña; si el browser lo bloquea, navego en la misma
  const win = window.open(url, '_blank');
  if (!win) window.location.href = url;
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
    timestamp,
    origen: deviceId
  }, { merge: true });
}

/* ========= Cambio de estado + WhatsApp ========= */
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

  const ts = new Date().toISOString();

  // 1) Feedback inmediato UI (sin await, mantiene el gesto de usuario)
  mostrarEstado(id, color, texto, ts);
  origenes[id] = deviceId;

  // 2) WhatsApp (solo cuando es advertencia o fallo) – usa el MISMO texto que escribiste
  if (color === 'amarillo' || color === 'rojo') {
    // Abrimos WA dentro del mismo gesto de clic para evitar bloqueos del navegador
    enviarWhatsApp(texto);
  }

  // 3) Guardar en Firestore (puede resolverse luego)
  await guardarEnFirestore(id, color, texto, ts);
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
      // Importante: NO abrimos WhatsApp acá (solo el generador debe hacerlo)
      mostrarEstado(id, data.estado, data.texto, data.timestamp);
    }
  });

  mostrarEstado(id, estadosActuales[id] || 'verde', '', '');
}

/* ========= Bootstrap + UX ========= */
const BASE_SHOW_MS   = 4000;   // desktop
const MOBILE_SHOW_MS = 10000;  // móvil
const isMobile = () => window.matchMedia('(pointer: coarse)').matches;
const getShowMs = () => (isMobile() ? MOBILE_SHOW_MS : BASE_SHOW_MS);

function forceShowControls(card){
  if (!card.classList.contains('compact')) return;
  card.classList.add('show-controls');
  clearTimeout(card._hideTimer);
  card._hideTimer = setTimeout(() => {
    card.classList.remove('show-controls');
  }, getShowMs());
}

function attachRevealHandlers(){
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('pointerenter', () => forceShowControls(card));
    card.addEventListener('pointerleave', () => {
      clearTimeout(card._hideTimer);
      card.classList.remove('show-controls');
    });
    // Móvil y desktop: un toque/clic en la tarjeta (no en botones) abre con timer
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.botones')) return;
      forceShowControls(card);
    });
    card.addEventListener('focusin', () => forceShowControls(card));
  });
}

function montarYArrancar(){
  montarUI();
  ORDEN.forEach(async n => {
    await setDoc(doc(db,'equipos', n.id), { tipo: n.type }, { merge: true });
    suscribir(n.id);
  });
  attachRevealHandlers();
}
montarYArrancar();

/* ================================
   ===== Resumen móvil (VERDE) ===
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

      <div class="summary-actions" style="margin-top:10px;">
        <button id="btn-intervenir" class="btn-intervenir" style="
          padding:10px 14px;border:none;border-radius:10px;
          background:#31a335;color:#fff;font-weight:800;">
          Reportar fallo / advertencia
        </button>
      </div>

      <div class="summary-footer" id="summary-footer" style="margin-top:8px;font-size:12px;color:#cbd5e1;"></div>
    </div>
  `;
  document.querySelector('.panel')?.insertBefore(wrap, document.getElementById('grid-linea'));

  wrap.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-id]');
    if (chip) {
      enterInterventionMode(chip.dataset.id);
      return;
    }
    if (e.target.id === 'btn-intervenir') {
      enterInterventionMode(ORDEN[0].id);
    }
  });
}

function firstIssueId(){
  for (const n of ORDEN){
    const st = estadosActuales[n.id];
    if (st === 'amarillo' || st === 'rojo') return n.id;
  }
  return null;
}

function enterInterventionMode(targetId){
  document.body.classList.remove('mobile-summary');
  const id = targetId || ORDEN[0].id;
  const el = document.getElementById(`card-${id}`);
  if (!el) return;
  forceShowControls(el);
  setTimeout(() => {
    el.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 0);
}

function scrollToIssue(){
  const id = firstIssueId();
  if (!id) return;
  const el = document.getElementById(`card-${id}`);
  if (!el) return;
  forceShowControls(el);
  setTimeout(() => {
    el.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 0);
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
    if (st === 'amarillo') { warn++; chips.push({t:n.label,c:'warn',id:n.id}); }
    if (st === 'rojo')     { bad++;  chips.push({t:n.label,c:'bad', id:n.id}); }
  }

  const $ok   = document.getElementById('kpi-ok');
  const $warn = document.getElementById('kpi-warn');
  const $bad  = document.getElementById('kpi-bad');
  if ($ok)   $ok.textContent = ok;
  if ($warn) $warn.textContent = warn;
  if ($bad)  $bad.textContent = bad;

  const list = document.getElementById('summary-chips');
  if (list){
    list.innerHTML = chips
      .map(ch => `<span class="chip ${ch.c}" data-id="${ch.id}">${ch.t}</span>`)
      .join('');
  }

  const footer = document.getElementById('summary-footer');
  if (footer){
    footer.textContent = (warn===0 && bad===0)
      ? 'Todo en verde. Podés intervenir si necesitás reportar algo.'
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
