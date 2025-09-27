const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Flujo de preguntas en orden
const flujoPreguntas = [
  "¿Cuánto tiempo planeas quedarte?",
  "¿Cuál es tu edad?",
  "¿De qué país vienes?",
  "¿Trabajas o estudias?",
  "¿Tienes algún hábito importante (fumar, mascotas, ruido...)?",
  "¿Cuál es el motivo principal de tu búsqueda?"
];

// Memoria temporal de candidatos en RAM
let candidatos = {}; // { sessionId: { paso: 0, respuestas: {} } }

// Ruta raíz de prueba
app.get("/", (req, res) => {
  res.send("✅ Marina backend funcionando con flujo guiado");
});

// Ruta del chat
app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje) {
    return res.status(400).json({ error: "Mensaje vacío" });
  }

  const id = sessionId || "default";

  // Si no existe la sesión, inicializarla
  if (!candidatos[id]) {
    candidatos[id] = {
      paso: 0,
      respuestas: {}
    };
  }

  const candidato = candidatos[id];
  let respuesta = "";

  // Si todavía quedan preguntas por hacer
  if (candidato.paso < flujoPreguntas.length) {
    const preguntaActual = flujoPreguntas[candidato.paso];

    // Guardar respuesta del usuario a la pregunta anterior (si no es la primera)
    if (candidato.paso > 0) {
      const clave = flujoPreguntas[candidato.paso - 1];
      candidato.respuestas[clave] = mensaje;
    }

    // Pasar a la siguiente pregunta
    respuesta = preguntaActual;
    candidato.paso++;
  } else {
    // Guardar última respuesta
    const clave = flujoPreguntas[candidato.paso - 1];
    candidato.respuestas[clave] = mensaje;

    // Cuando termina el flujo
    respuesta = `Gracias por responder. ✅

Si quieren, pueden dejar su contacto (email o WhatsApp) para que les enviemos fotos y vídeos de la habitación y hablar personalmente para concretar la reserva. 
¿Desean dejar su contacto para avanzar con la reserva?`;

    // Opcional: aquí podrías guardar en BD (Postgres, Google Sheets, etc.)
    console.log("📋 Nuevo candidato:", candidato.respuestas);

    // Reiniciar sesión (si quieres entrevistas múltiples)
    candidatos[id] = {
      paso: 0,
      respuestas: {}
    };
  }

  res.json({ respuesta });
});

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
