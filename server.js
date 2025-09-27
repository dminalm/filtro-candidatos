const express = require("express");
const cors = require("cors");
const { Configuration, OpenAIApi } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Configuración OpenAI (Render → Environment Variables)
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Ruta raíz para comprobar que funciona
app.get("/", (req, res) => {
  res.send("✅ Marina backend funcionando en Render");
});

// Ruta del chat
app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje) {
    return res.status(400).json({ error: "Mensaje vacío" });
  }

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini", // o gpt-4o si tienes acceso
      messages: [
        {
          role: "system",
          content: `
Eres Marina 🤖, una asistente amable que entrevista candidatos para alquilar vivienda.
Haz preguntas paso a paso (edad, nacionalidad, ocupación, hábitos, duración de la estancia).
Sé clara, cercana y pide siempre sinceridad.`
        },
        { role: "user", content: mensaje }
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    const respuesta = completion.data.choices[0].message.content;
    res.json({ respuesta });
  } catch (error) {
    console.error("Error OpenAI:", error.response?.data || error.message);
    res.status(500).json({ error: "Error al conectar con Marina" });
  }
});

// Puerto dinámico de Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
