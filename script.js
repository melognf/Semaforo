import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

  // Si el estado ya está activo, solo actualizamos mensaje y cronómetro si viene de Firebase
  if (estado.classList.contains(color)) {
    if (desdeFirebase && textoManual !== null) {
      mensaje.textContent = (color === 'amarillo') ? `⚠️ ${textoManual}` :
                            (color === 'rojo') ? `❌ ${textoManual}` : '';
    }
    return;
  }

  // Cambiar clase y limpiar mensajes e intervalos previos
  estado.className = 'estado ' + color;
  mensaje.textContent = '';
  cronometro.textContent = '';
  clearInterval(cronos[id]);

  let texto = textoManual;

  if (!desdeFirebase) {
    if (color === 'amarillo') {
      texto = prompt('Describa el problema de advertencia:');
      if (!texto) return; // si cancela el prompt no cambiar estado
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
    // Si viene de Firebase y el estado es rojo, arrancar cronómetro desde timestamp guardado
    if (color === 'rojo' && texto) {
      const inicio = new Date().getTime() - (new Date().getTime() - new Date().getTime());
      tiemposInicio[id] = new Date().getTime() - (new Date().getTime() - new Date().getTime());
      // Para no complicar, arrancamos el cronómetro desde la diferencia del timestamp
      clearInterval(cronos[id]);
      cronos[id] = setInterval(() => {
        const elapsed = Math.floor((Date.now() - new Date(inicio)) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        cronometro.textContent = `⏱ Tiempo detenido: ${mins}:${secs}`;
      }, 1000);
    }
  }

  if (color === 'amarillo' && texto) {
    mensaje.textContent = `⚠️ ${texto}`;
  } else if (color === 'rojo' && texto) {
    mensaje.textContent = `❌ ${texto}`;
  }
}

// Al cargar la página, obtenemos el estado de cada máquina y actualizamos sin pedir prompt
window.onload = async () => {
  const maquinas = ['maquina1', 'maquina2'];
  for (const id of maquinas) {
    const docRef = doc(db, "maquinas", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      cambiarEstado(id, data.estado, data.texto, true);
    }
  }
};

// Exportamos la función para que los botones puedan llamarla
window.cambiarEstado = cambiarEstado;
