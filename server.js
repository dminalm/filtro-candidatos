// server.js
const express = require("express");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(express.static("public"));

// --- CONFIG OPENAI ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CONFIG GOOGLE SHEETS ---
const SHEET_ID = "1v-1ItJPfLQeZY0d-ayYSv43fkPxWDkyJ1MplenNstc4";
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- SESIONES ---
let sessions = {};

// --- PROMPT INICIAL ---
function getPrompt(history) {
  return `
Eres Marina, una asistente simpática y cercana (emoji 👩).  
Tu tarea es entrevistar candidatos para una habitación siguiendo estas preguntas en orden:

1. ¿Cuántos años tienes?  
2. ¿Cuál es tu nacionalidad?  
3. ¿Estudias o trabajas y cuáles son tus ingresos?  
4. ¿Trabajas en el ámbito sanitario?  
5. ¿Alquilarás solo/a o con pareja?  
6. ¿Vivirá un menor contigo en la habitación?  
7. ¿Fumas?  
8. ¿Tienes mascotas?  
9. ¿Cuánto tiempo necesitas la habitación?  
10. ¿Quieres añadir algo libremente?

⚠️ Reglas:
- Nacionalidad en países árabes, africanos, medio oriente, musulmanes, asiáticos, rusos, bielorrusos o ucranianos → NO APTO.  
- Si vive un menor → NO APTO.  
- Si fuma → NO APTO.  
- Si tiene mascotas → NO APTO.  
- Todo lo demás → APTO.

👉 Al final:
- Si es NO APTO: responde amablemente que no tenemos una habitación que cumpla sus necesidades.  
- Si es APTO: pide teléfono y correo electrónico.  

📌 IMPORTANTE:  
Cuando decidas, responde con un JSON **solo una vez** en este formato:

{
  "apto": true,
  "edad": "30",
  "nacionalidad": "Española",
  "ocupacionIngresos": "Trabajo 1200€",
  "sanitario": "No",
  "soloPareja": "Solo",
  "menores": "No",
  "fuma": "No",
  "mascotas": "No",
  "tiempo": "6 meses",
  "comentarios": "Ninguno",
  "telefono": "600123123",
  "email": "ejemplo@email.com"
}

o si no es apto:

{
  "apto": false
}

---
Historial:
${history.join("\n")}
`;
}

// --- ENDPOINT CHAT ---
app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;

  if (!sessions[sessionId]) sessions[sessionId] = { history: [], saved: false };

  sessions[sessionId].history.push(`Usuario: ${mensaje}`);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: getPrompt(sessions[sessionId].history) }],
    });

    const respuesta = completion.choices[0].message.content;
    sessions[sessionId].history.push(`Marina: ${respuesta}`);

    // --- Procesar JSON ---
    const matches = respuesta.match(/\{[\s\S]*?\}/g);
    if (matches && matches.length > 0) {
      try {
        const data = JSON.parse(matches[matches.length - 1]);

        if (data.apto === true && !sessions[sessionId].saved) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: "Candidatos APTOS!A:Z",
            valueInputOption: "USER_ENTERED",
            resource: {
              values: [[
                new Date().toLocaleString("es-ES"),
                data.edad || "",
                data.nacionalidad || "",
                data.ocupacionIngresos || "",
                data.sanitario || "",
                data.soloPareja || "",
                data.menores || "",
                data.fuma || "",
                data.mascotas || "",
                data.tiempo || "",
                data.comentarios || "",
                data.telefono || "",
                data.email || ""
              ]]
            }
          });
          sessions[sessionId].saved = true;
          console.log("✅ Candidato apto guardado en Sheets");
        } else {
          console.log("ℹ️ Candidato no apto o ya guardado.");
        }
      } catch (err) {
        console.error("❌ Error parseando JSON:", err.message);
      }
    }

    res.json({ respuesta });
  } catch (error) {
    console.error("❌ Error con OpenAI:", error.message);
    res.status(500).json({ respuesta: "⚠️ Error al conectar con Marina." });
  }
});

// --- START SERVER ---
app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en puerto ${port}`);
});
