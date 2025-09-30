// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { google } = require("googleapis");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === CONFIGURACIÓN OPENAI ===
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// === CONFIGURACIÓN GOOGLE SHEETS ===
async function guardarEnSheets(datos) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const now = new Date().toLocaleString("es-ES");
    const fila = [
      now,
      datos.edad || "",
      datos.nacionalidad || "",
      datos.ocupacionIngresos || "",
      datos.sanitario || "",
      datos.soloPareja || "",
      datos.menores || "",
      datos.fuma || "",
      datos.mascotas || "",
      datos.tiempo || "",
      datos.comentarios || "",
      datos.telefono || "",
      datos.email || "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "Candidatos APTOS",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [fila] },
    });

    console.log("✅ Guardado en Google Sheets:", fila);
  } catch (err) {
    console.error("❌ Error al guardar en Google Sheets:", err.message);
  }
}

// === RUTA DE PRUEBA GOOGLE SHEETS ===
app.get("/test-sheets", async (req, res) => {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SHEET_ID,
    });

    const sheetName = meta.data.sheets[0].properties.title;

    res.json({
      message: "✅ Conexión correcta a Google Sheets",
      sheetName,
    });
  } catch (err) {
    res.status(500).send("❌ Error test Sheets: " + err.message);
  }
});

// === RUTA DEL CHAT ===
app.post("/chat", async (req, res) => {
  const { mensaje, historial = [] } = req.body;

  try {
    const promptBase = `
Eres Marina 👩, una asistente que entrevista candidatos para alquilar habitaciones.
Debes sonar simpática, cercana pero profesional. 

Tu tarea es hacer una entrevista en 10 pasos:
1. ¿Cuántos años tienes?
2. ¿Cuál es tu nacionalidad?
3. ¿Estudias o trabajas? ¿Cuáles son tus ingresos?
4. ¿Eres sanitario o trabajas en el ámbito de la salud?
5. ¿Alquilas solo o con pareja?
6. ¿Vivirá un menor contigo?
7. ¿Fumas?
8. ¿Tienes mascotas?
9. ¿Cuánto tiempo necesitas la habitación?
10. ¿Quieres añadir algo más libremente?

⚠️ Reglas de conversación:
- Haz **solo una pregunta a la vez**.
- No repitas preguntas ya respondidas.
- Cuando el usuario responde, pasa a la siguiente.
- Cuando llegues al final, da el resultado (APTO o NO APTO).

⚠️ Reglas de filtro:
- Nacionalidades NO aptas: árabes, africanos, medio oriente, musulmanes, asiáticos, rusos, bielorrusos, ucranianos.
- Si responde que vivirá un menor → NO APTO.
- Si fuma → NO APTO.
- Si tiene mascotas → NO APTO.

Si el candidato es NO APTO → mensaje final:
"Lo sentimos, actualmente no tenemos una habitación que cumpla con tus necesidades. Nos pondremos en contacto contigo si surge alguna disponible."

Si es APTO → mensaje final:
"Perfecto 🙌, parece que cumples los requisitos. Por favor, facilítanos tu número de teléfono y correo electrónico para contactar contigo."

Al final, responde con un JSON con los datos recogidos y si es apto o no, para guardar en Google Sheets.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: promptBase },
        ...historial,
        { role: "user", content: mensaje },
      ],
    });

    const respuesta = completion.choices[0].message.content;

    // Intentar parsear JSON de la respuesta
    try {
      const jsonStart = respuesta.indexOf("{");
      const jsonEnd = respuesta.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const datosJSON = JSON.parse(respuesta.substring(jsonStart, jsonEnd + 1));
        if (datosJSON && datosJSON.apto === true) {
          await guardarEnSheets(datosJSON);
        }
      }
    } catch (err) {
      console.error("⚠️ No se pudo parsear JSON de la respuesta:", err.message);
    }

    res.json({ respuesta });
  } catch (err) {
    console.error("❌ Error en /chat:", err.message);
    res.status(500).json({ respuesta: "⚠️ Error interno del servidor" });
  }
});

// === INICIAR SERVIDOR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
