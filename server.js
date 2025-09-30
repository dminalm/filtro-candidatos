// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { google } = require("googleapis");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- CONFIG OPENAI ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CONFIG GOOGLE SHEETS ---
const SHEET_ID = "1v-1ItJPfLQeZY0d-ayYSv43fkPxWDkyJ1MplenNstc4";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- PROMPT BASE ---
const promptBase = `
Eres Marina 👩, una asistente que entrevista candidatos para alquilar habitaciones.
Habla de forma cercana pero profesional. 

Proceso de entrevista:
1. Edad
2. Nacionalidad
3. Estudias/trabajas + ingresos
4. Sanitario o no
5. Solo o pareja
6. ¿Vivirá un menor?
7. ¿Fumas?
8. ¿Tienes mascotas?
9. Tiempo de estancia
10. Comentarios libres

⚠️ Reglas de aptitud:
- Nacionalidades NO aptas: árabes, africanos, medio oriente, musulmanes, asiáticos, rusos, bielorrusos, ucranianos.
- Si vivirá un menor → NO APTO
- Si fuma → NO APTO
- Si tiene mascotas → NO APTO

Resultados:
- Si NO APTO → Mensaje final: 
"Lo sentimos, actualmente no tenemos una habitación que cumpla con tus necesidades. Nos pondremos en contacto contigo si surge alguna disponible."
- Si APTO → Mensaje final:
"Perfecto 🙌, parece que cumples los requisitos. Por favor, facilítanos tu número de teléfono y correo electrónico para contactar contigo."

⚠️ MUY IMPORTANTE:
Al final de la entrevista, SIEMPRE devuelve un bloque JSON válido con esta estructura:

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
  "telefono": "...",
  "email": "..."
}

El texto normal para el candidato va ANTES del JSON.
No inventes datos si el usuario no los da, deja los campos vacíos.
`;

// --- ENDPOINT DE CHAT ---
app.post("/chat", async (req, res) => {
  const { mensaje } = req.body;
  if (!mensaje) return res.json({ respuesta: "⚠️ No he recibido ningún mensaje" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: promptBase },
        { role: "user", content: mensaje }
      ],
    });

    const respuesta = completion.choices[0].message.content;

    // Buscar bloque JSON en la respuesta
    const match = respuesta.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const data = JSON.parse(match[0]);

        // Guardar solo si es APTO
        if (data.apto === true) {
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
          console.log("✅ Candidato apto guardado en Sheets");
        } else {
          console.log("ℹ️ Candidato no apto, no se guarda.");
        }
      } catch (err) {
        console.error("❌ Error parseando JSON:", err.message);
      }
    }

    res.json({ respuesta });
  } catch (error) {
    console.error("Error en OpenAI:", error);
    res.status(500).json({ respuesta: "⚠️ Error al conectar con Marina" });
  }
});

// --- SERVIDOR ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
