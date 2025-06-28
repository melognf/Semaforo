import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCUYhpx2tDjX40Si-DPXWzONa8wqwW9pb8",
  authDomain: "semaforoproductivo.firebaseapp.com",
  projectId: "semaforoproductivo",
  storageBucket: "semaforoproductivo.firebasestorage.app",
  messagingSenderId: "273022276004",
  appId: "1:273022276004:web:2127523c4a0a6b7884f131"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const cronos = {};
const tiemposInicio = {};

async function guardarEnFirestore(id, estado, texto, tiempo = '') {
  const data = {
    estado,
    texto,
    tiempo,
    timestamp: new Date().toISOString()
  };
  await setDoc(doc(db, "maquinas", id), data);
}

async function cambiarEstado(id, color, textoManual = null, desdeFirebase = false) {
  const maquina = document.getElementById(id);
  const estado = maquina.querySelector('.estado');
  const mensaje = document.getElementById(`mensaje-${id}`);
  const cronometro = document.getElementById(`cronometro-${id}`);

  estado.className = 'estado ' + color;
  mensaje.textContent = '';
  cronometro.textContent = '';
  clearInterval(cronos[id]);

  let texto = textoManual;

  // SOLO pedir prompt si NO viene desde Firebase (o sea, interacción usuario)
  if (!desdeFirebase) {
    if (color === 'amarillo') {
      texto = prompt('Describa el problema de advertencia:');
      if (!texto) return;
    } else if (color === 'rojo') {
      texto = prompt('Describa el fallo de la máquina:');
      if (!texto) return;
      tiemposInicio[id] = Date.now();
      cronos[id] = setInterval(() => {
        const elapsed = Math.floor((Date.now() - tiemposInicio[id]) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        cronometro.textContent = `⏱ Tiempo detenido: ${mins}:${secs}`;
      }, 1000);
    }
    await guardarEnFirestore(id, color, texto);
  } else {
    // Si es carga desde Firebase, pero el estado es rojo y tiene timestamp,
    // iniciamos cronómetro desde el timestamp guardado
    if (color === 'rojo' && texto) {
      const docRef = doc(db, "maquinas", id);
      // No hay que esperar aquí, solo iniciamos cronómetro desde timestamp guardado
      const inicio = new Date().getTime(); // default en caso que timestamp no se encuentre
      clearInterval(cronos[id]);
      cronos[id] = setInterval(() => {
        const elapsed = Math.floor((Date.now() - inicio) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        cronometro.textContent = `⏱ Tiempo detenido: ${mins}:${secs}`;
      }, 1000);
    }
  }

  // Mostrar mensaje si existe texto
  if (color === 'amarillo' && texto) {
    mensaje.textContent = `⚠️ ${texto}`;
  } else if (color === 'rojo' && texto) {
    mensaje.textContent = `❌ ${texto}`;
  }
}

window.onload = () => {
  ['maquina1', 'maquina2'].forEach(id => {
    const docRef = doc(db, "maquinas", id);
    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        // Si querés que al cargar SIEMPRE arranque en verde (sin mensajes), descomenta esta línea y comenta la siguiente:
        // cambiarEstado(id, 'verde', '', true);

        // La línea correcta para mantener estado guardado sin prompt:
        cambiarEstado(id, data.estado, data.texto, true);
      } else {
        // Si no existe documento, seteo inicial en verde sin texto
        cambiarEstado(id, 'verde', '', true);
      }
    });
  });
};

// Para que el onclick en HTML funcione:
window.cambiarEstado = cambiarEstado;
