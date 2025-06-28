import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, doc, setDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Configuración Firebase
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
const auth = getAuth(app);

let userUid = null;  // UID del usuario actual (anónimo)

const cronos = {};
const tiemposInicio = {};

function setBotonesEnabled(enabled) {
  const botones = document.querySelectorAll('.botones button');
  botones.forEach(b => b.disabled = !enabled);
}

function initAuth() {
  return new Promise((resolve, reject) => {
    signInAnonymously(auth).catch(err => reject(err));
    onAuthStateChanged(auth, (user) => {
      if (user) {
        userUid = user.uid;
        console.log("Usuario autenticado con UID:", userUid);
        setBotonesEnabled(true); // Habilita botones al autenticarse
        resolve();
      }
    });
  });
}

async function guardarEnFirestore(id, estado, texto, tiempo = '') {
  const data = {
    estado,
    texto,
    tiempo,
    timestamp: new Date().toISOString(),
    usuario: userUid || null
  };
  await setDoc(doc(db, "maquinas", id), data);
}

async function cambiarEstado(id, color, textoManual = null, desdeFirebase = false) {
  // No permitir acciones antes de autenticarse (salvo al recibir update de Firebase)
  if (!userUid && !desdeFirebase) {
    alert("Espere un momento, autenticándose...");
    return;
  }

  const maquina = document.getElementById(id);
  const estado = maquina.querySelector('.estado');
  const mensaje = document.getElementById(`mensaje-${id}`);
  const cronometro = document.getElementById(`cronometro-${id}`);

  estado.className = 'estado ' + color;
  mensaje.textContent = '';
  cronometro.textContent = '';
  clearInterval(cronos[id]);

  // Si la acción viene de Firebase, no pedir prompt y no guardar cambios
  if (desdeFirebase) {
    if (color === 'rojo') {
      const inicio = new Date().getTime(); // no hay timestamp aquí, se usó el timestamp almacenado en onSnapshot
      clearInterval(cronos[id]);
      cronos[id] = setInterval(() => {
        const elapsed = Math.floor((Date.now() - inicio) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        cronometro.textContent = `⏱ Tiempo detenido: ${mins}:${secs}`;
      }, 1000);
    }
    if (textoManual) {
      mensaje.textContent = (color === 'amarillo' ? `⚠️ ${textoManual}` : color === 'rojo' ? `❌ ${textoManual}` : '');
    }
    return;
  }

  // En caso contrario, pedimos texto y guardamos en Firestore
  let texto = textoManual;
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

  // Guardar estado + usuario que hizo el cambio
  await guardarEnFirestore(id, color, texto);

  if (color === 'amarillo' && texto) {
    mensaje.textContent = `⚠️ ${texto}`;
  } else if (color === 'rojo' && texto) {
    mensaje.textContent = `❌ ${texto}`;
  }
}

window.onload = () => {
  setBotonesEnabled(false); // bloqueo inicial
  initAuth().catch(e => alert("Error autenticando: " + e));

  ['maquina1', 'maquina2'].forEach(id => {
    const docRef = doc(db, "maquinas", id);
    onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        // Solo quien generó la alerta puede normalizar
        // En cambio, quien NO es dueño ve solo el estado sin poder cambiarlo
        if (data.estado !== 'verde' && data.usuario && userUid !== data.usuario) {
          // Si otro usuario disparó la alerta, bloqueo botones de esa máquina
          const maquina = document.getElementById(id);
          maquina.querySelectorAll('button').forEach(b => b.disabled = true);
        } else {
          // Si el usuario es el dueño o el estado es verde, habilito botones de esa máquina
          const maquina = document.getElementById(id);
          maquina.querySelectorAll('button').forEach(b => b.disabled = false);
        }

        cambiarEstado(id, data.estado, data.texto, true);
      }
    });
  });
};

window.cambiarEstado = cambiarEstado;
