const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- Configuración OpenAI ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Configuración Google Sheets ---
const SHEET_ID = process.env.SHEET_ID;
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (err) {
  console.error("❌ Error al parsear GOOGLE_CREDENTIALS:", err.message);
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- Función: obtener la primera pestaña del documento ---
async function getFirstSheetName() {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });
  return metadata.data.sheets[0].properties.title;
}

// --- Prompt de Marina ---
function buildPrompt(historial) {
  return `
Eres Marina 👩, una asistente amable y confiable. 
Vas a entrevistar a un candidato para alquilar una habitación. 
No pidas información privada, solo lo necesario. 
Respeta la Ley de Protección de Datos (LOPD).

Preguntas:
1. ¿Cuántos años tienes?
2. ¿Cuál es tu nacionalidad?
3. ¿Estudias o trabajas? ¿Cuáles son tus ingresos?
4. ¿Trabajas en sanidad? ¿Eres sanitario?
5. ¿Alquilas sola/o o con pareja?
6. ¿Vivirá un menor contigo?
7. ¿Fumas?
8. ¿Tienes mascotas?
9. ¿Cuánto tiempo necesitas la habitación?
10. ¿Quieres añadir algo?

Reglas:
- Si es de países árabes, africanos, oriente medio, musulmanes, asiáticos, Rusia, Bielorrusia o Ucrania → NO APTO.
- Si vivirá un menor → NO APTO.
- Si fuma o tiene mascotas → NO APTO.

Si es NO APTO → al final: 
"Actualmente no tenemos una habitación que cumpla tus necesidades, nos pondremos en contacto cuando haya alguna disponible."

Si es APTO → al final:
"¡Perfecto! Por favor, indícanos un número de teléfono y un correo electrónico para contactar contigo."

Historial hasta ahora:
${historial.map(m => `${m.rol}: ${m.texto}`).join("\n")}
`;
}

// --- Manejo de sesiones ---
const sesiones = {};

// --- Endpoint Chat ---
app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje || !sessionId) {
    return res.status(400).json({ error: "Faltan parámetros" });
  }

  if (!sesiones[sessionId]) {
    sesiones[sessionId] = [];
  }

  sesiones[sessionId].push({ rol: "usuario", texto: mensaje });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: buildPrompt(sesiones[sessionId]) }],
    });

    const respuesta = completion.choices[0].message.content.trim();

    sesiones[sessionId].push({ rol: "marina", texto: respuesta });

    // Detectar Apto / No Apto y guardar en Sheets
    if (respuesta.includes("¡Perfecto!")) {
      try {
        const sheetName = await getFirstSheetName();
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: sheetName,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[
              new Date().toLocaleString(),
              JSON.stringify(sesiones[sessionId].map(m => m.texto))
            ]]
          }
        });
        console.log("📋 Candidato Apto guardado en Google Sheets");
      } catch (err) {
        console.error("❌ Error al guardar en Google Sheets:", err.message);
      }
    }

    res.json({ respuesta });
  } catch (error) {
    console.error("Error en OpenAI:", error.message);
    res.status(500).json({ error: "Error al generar respuesta" });
  }
});

// --- Endpoint de test Google Sheets ---
app.get("/test-sheets", async (req, res) => {
  try {
    const sheetName = await getFirstSheetName();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: sheetName,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[new Date().toLocaleString(), "TEST", "Fila de prueba"]]
      }
    });
    res.send("✅ Fila añadida correctamente en Google Sheets");
  } catch (e) {
    console.error("❌ Error test Sheets:", e.message);
    res.status(500).send("Error: " + e.message);
  }
});

// --- Endpoint raíz ---
app.get("/", (req, res) => {
  res.send("✅ Marina backend funcionando con Google Sheets");
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
