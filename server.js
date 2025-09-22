const express = require("express");
const cors = require("cors");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Configuración OpenAI (Render → Settings → Environment Variables)
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, 
});
const openai = new OpenAIApi(configuration);

// Memoria en sesión muy simple (podemos mejorarla con DB después)
let conversaciones = {};

app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje) {
    return res.status(400).json({ error: "Mensaje vacío" });
  }

  // Identificador de sesión (cada usuario/candidato debe tener uno)
  const id = sessionId || "default";

  if (!conversaciones[id]) {
    conversaciones[id] = [
      {
        role: "system",
        content: `
Eres Marina 🤖, una asistente amable que entrevista a futuros candidatos para alquilar un piso. 
Tu tarea es hacer preguntas paso a paso para conocer al candidato y evaluar si encaja. 
Haz una pregunta cada vez, de manera clara y cercana. 
Recalca siempre la sinceridad y explica que son pocos pasos. 
`
      }
    ];
  }

  // Añadimos el mensaje del usuario a la conversación
  conversaciones[id].push({ role: "user", content: mensaje });

  try {
    // Llamada a OpenAI
    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini", // puedes usar gpt-4o o gpt-3.5-turbo
      messages: conversaciones[id],
      max_tokens: 200,
      temperature: 0.7,
    });

    const respuesta = completion.data.choices[0].message.content;

    // Guardamos la respuesta de Marina
    conversaciones[id].push({ role: "assistant", content: respuesta });

    res.json({ respuesta });
  } catch (error) {
    console.error("Error en OpenAI:", error);
    res.status(500).json({ error: "Error al conectar con Marina" });
  }
});

// Render: puerto dinámico
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
