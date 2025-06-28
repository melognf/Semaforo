import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Configuración Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCUYhpx2tDjX40Si-DPXWzONa8wqwW9pb8",
  authDomain: "semaforoproductivo.firebaseapp.com",
  projectId: "semaforoproductivo",
  storageBucket: "semaforoproductivo.appspot.com",
  messagingSenderId: "273022276004",
  appId: "1:273022276004:web:2127523c4a0a6b7884f131"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Variables globales
const cronos = {};
const estadosActuales = {};
const timestampsVistos = {};
const origenes = {};

// ID único del dispositivo
const deviceId = localStorage.getItem('deviceId') || crypto.randomUUID();
localStorage.setItem('deviceId', deviceId);

// Mostrar estado
function mostrarEstado(id, color, texto = '', timestamp = '') {
  const maquina = document.getElementById(id);
  const estadoDiv = maquina.querySelector('.estado');
  const mensaje = document.getElementById(`mensaje-${id}`);
  const cronometro = document.getElementById(`cronometro-${id}`);

  estadoDiv.className = 'estado ' + color;
  mensaje.textContent = '';
  cronometro.textContent = '';
  clearInterval(cronos[id]);

  if (color === 'amarillo' && texto) {
    mensaje.textContent = `⚠️ ${texto}`;
  } else if (color === 'rojo' && texto) {
    mensaje.textContent = `❌ ${texto}`;
    if (timestamp) {
      const inicio = new Date(timestamp).getTime();
      cronos[id] = setInterval(() => {
        const elapsed = Math.floor((Date.now() - inicio) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        cronometro.textContent = `⏱ Tiempo detenido: ${mins}:${secs}`;
      }, 1000);
    }
  }

  estadosActuales[id] = color;

  // ✅ Actualiza botones cada vez que cambia algo visual
  actualizarBotones(id, color);
}

// Guardar estado en Firestore
async function guardarEnFirestore(id, estado, texto) {
  const now = new Date().toISOString();
  await setDoc(doc(db, "maquinas", id), {
    estado,
    texto,
    timestamp: now,
    origen: deviceId
  });
}

// Cambiar estado desde botones
async function cambiarEstado(id, color) {
  const estadoActual = estadosActuales[id];
  const origenActual = origenes[id];

  // ❌ BLOQUEO: si intento poner en verde una máquina que no fallé yo
  if ((estadoActual === 'rojo' || estadoActual === 'amarillo') &&
    color === 'verde' &&
    origenActual &&
    origenActual !== deviceId) {
  alert('❌ Solo el dispositivo que activó el estado puede restablecer la máquina.');
  return;
}


  const maquina = document.getElementById(id);
  const mensaje = document.getElementById(`mensaje-${id}`);
  const cronometro = document.getElementById(`cronometro-${id}`);
  const estadoDiv = maquina.querySelector('.estado');

  clearInterval(cronos[id]);
  mensaje.textContent = '';
  cronometro.textContent = '';
  estadoDiv.className = 'estado ' + color;

  let texto = '';

  if (color === 'amarillo') {
    texto = prompt('Describa el problema de advertencia:');
    if (!texto) return;
  } else if (color === 'rojo') {
    texto = prompt('Describa el fallo de la máquina:');
    if (!texto) return;

    const inicio = Date.now();
    cronos[id] = setInterval(() => {
      const elapsed = Math.floor((Date.now() - inicio) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      cronometro.textContent = `⏱ Tiempo detenido: ${mins}:${secs}`;
    }, 1000);
  }

  await guardarEnFirestore(id, color, texto);
  estadosActuales[id] = color;
}

// Escuchar Firebase en tiempo real
window.onload = () => {
  ['maquina1', 'maquina2'].forEach(id => {
    const docRef = doc(db, "maquinas", id);
    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const recibido = new Date(data.timestamp).getTime();
        const visto = new Date(timestampsVistos[id] || 0).getTime();

        if (recibido > visto) {
          timestampsVistos[id] = data.timestamp;
          origenes[id] = data.origen || null;
          mostrarEstado(id, data.estado, data.texto, data.timestamp);
        }
      }
    });
  });
};

// Bloquear botón "OK" si no sos el autor del fallo
function actualizarBotones(id, estado) {
  const esRojo = estado === 'rojo';
  const esMiFallo = origenes[id] === deviceId;
  const botones = document.querySelectorAll(`#${id} .botones button`);

  botones.forEach(btn => {
    if (esRojo && !esMiFallo && btn.classList.contains('verde-btn')) {
      btn.disabled = true;
    } else {
      btn.disabled = false;
    }
  });
}

window.cambiarEstado = cambiarEstado;
