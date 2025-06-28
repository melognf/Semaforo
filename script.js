import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCUYhpx2tDjX40Si-DPXWzONa8wqwW9pb8",
  authDomain: "semaforoproductivo.firebaseapp.com",
  projectId: "semaforoproductivo",
  storageBucket: "semaforoproductivo.appspot.com",
  messagingSenderId: "273022276004",
  appId: "1:273022276004:web:2127523c4a0a6b7884f131"
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Variables
const cronos = {};
const estadosActuales = {};
const timestampsVistos = {};  // 🆕 Guardamos el último timestamp recibido por máquina

// Mostrar el estado visualmente
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
}

// Guardar el estado en Firestore
async function guardarEnFirestore(id, estado, texto) {
  const now = new Date().toISOString();
  await setDoc(doc(db, "maquinas", id), {
    estado,
    texto,
    timestamp: now
  });
}

// Cambiar estado desde botones
async function cambiarEstado(id, color) {
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

// Escucha en tiempo real desde Firebase
window.onload = () => {
  ['maquina1', 'maquina2'].forEach(id => {
    const docRef = doc(db, "maquinas", id);
    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const recibido = new Date(data.timestamp).getTime();
        const visto = new Date(timestampsVistos[id] || 0).getTime();

        // Solo aplicar si es más nuevo que lo que ya vimos
        if (recibido > visto) {
          timestampsVistos[id] = data.timestamp;
          mostrarEstado(id, data.estado, data.texto, data.timestamp);
        }
      }
    });
  });
};

window.cambiarEstado = cambiarEstado;
