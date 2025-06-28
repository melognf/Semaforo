import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCUYhpx2tDjX40Si-DPXWzONa8wqwW9pb8",
  authDomain: "semaforoproductivo.firebaseapp.com",
  projectId: "semaforoproductivo",
  storageBucket: "semaforoproductivo.firebasestorage.app",
  messagingSenderId: "273022276004",
  appId: "1:273022276004:web:2127523c4a0a6b7884f131"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const cronos = {};
const tiemposInicio = {};
let userUid = null;

async function initAuth() {
  await signInAnonymously(auth);
  auth.onAuthStateChanged(user => {
    if (user) {
      userUid = user.uid;
      console.log("Usuario autenticado con UID:", userUid);
    }
  });
}

async function guardarEnFirestore(id, estado, texto, tiempo = '') {
  if (!userUid) {
    alert("No estás autenticado aún. Intenta recargar.");
    return;
  }
  const data = {
    estado,
    texto,
    tiempo,
    timestamp: new Date().toISOString(),
    uid: userUid
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

  if (!desdeFirebase) {
    if (!userUid) {
      alert("No estás autenticado aún. Espera un momento.");
      return;
    }

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
  }

  if (color === 'amarillo' && texto) {
    mensaje.textContent = `⚠️ ${texto}`;
  } else if (color === 'rojo' && texto) {
    mensaje.textContent = `❌ ${texto}`;
  }
}

window.onload = () => {
  initAuth();

  ['maquina1', 'maquina2'].forEach(id => {
    const docRef = doc(db, "maquinas", id);
    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        cambiarEstado(id, data.estado, data.texto, true);

        const cronometro = document.getElementById(`cronometro-${id}`);
        if (data.estado === 'rojo') {
          const inicio = new Date(data.timestamp).getTime();
          clearInterval(cronos[id]);
          cronos[id] = setInterval(() => {
            const elapsed = Math.floor((Date.now() - inicio) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            cronometro.textContent = `⏱ Tiempo detenido: ${mins}:${secs}`;
          }, 1000);
        }
      }
    });
  });
};

// Para que los botones puedan llamar a cambiarEstado globalmente
window.cambiarEstado = cambiarEstado;
