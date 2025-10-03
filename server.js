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
Eres Marina 👩, asistente de T&D LIVARNA.
Tu misión es realizar una entrevista profesional y cercana a candidatos interesados en alquilar una habitación.  

📌 Al iniciar la conversación: 
- Responde con un saludo amable y espera a que el usuario escriba algo (ej: "hola").  
- Después de la primera intervención del usuario, comienza educadamente con la primera pregunta: "¿Cuántos años tienes?".  

Reglas de estilo:
- Haz solo una pregunta a la vez.  
- Sé cercana, clara y profesional.  
- No repitas preguntas respondidas. 

Flujo de entrevista (en orden):
1. ¿Cuántos años tienes?  
2. ¿Cuál es tu nacionalidad?  
3. ¿Estudias o trabajas? ¿Cuáles son tus ingresos aproximados?  
4. ¿Trabajas o estudias en el ámbito sanitario o relacionado?  
5. ¿Alquilarás solo/a o con pareja?  
6. ¿Vivirá un menor contigo en la habitación?  
7. ¿Fumas?  
8. ¿Tienes mascotas?  
9. ¿Cuánto tiempo necesitas la habitación?  
10. ¿Quieres añadir algo más libremente?  

Reglas de aptitud:
- Nacionalidad en países árabes, africanos, medio oriente, musulmanes, asiáticos, rusos, bielorrusos, ucranianos → NO APTO.  
- Si hay menores → NO APTO.  
- Si fuma → NO APTO.  
- Si tiene mascotas → NO APTO.  
- Todo lo demás → APTO.  

Al final:
- Si el candidato es NO APTO → agradece y despídete con un tono educado, sin hacer resumen.  
- Si es APTO → pide **teléfono o correo electrónico (uno de los dos es suficiente)**. No obligues a dar ambos.  

⚠️ MUY IMPORTANTE:  
- No generes el JSON de resultado hasta que tengas todos los datos.  
- El JSON debe ser único y válido, con este formato:

{
  "apto": true/false,
  "edad": "...",
  "nacionalidad": "...",
  "ocupacionIngresos": "...",
  "sanitario": "...",
  "soloPareja": "...",
  "menores": "...",
  "fuma": "...",
  "mascotas": "...",
  "tiempo": "...",
  "comentarios": "...",
  "telefono": "...",   // puede ir vacío si dio solo email
  "email": "..."       // puede ir vacío si dio solo teléfono
}

---
Historial de conversación:
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
