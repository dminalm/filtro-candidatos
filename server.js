// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { google } = require("googleapis");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 10000;

/* -------- Middlewares -------- */
app.use(cors());               // necesario si el front está en otro dominio
app.use(bodyParser.json());
app.use(express.static("public"));

/* -------- OpenAI -------- */
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function completar(messages) {
  try {
    return await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });
  } catch (e) {
    console.warn("⚠️ Fallback a gpt-3.5-turbo:", e.message);
    return await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    });
  }
}

/* -------- Google Sheets -------- */
const SHEET_ID = "1v-1ItJPfLQeZY0d-ayYSv43fkPxWDkyJ1MplenNstc4";
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

/* -------- Sesiones -------- */
const sessions = {}; // { [sessionId]: { history: [], saved: false } }

/* -------- Prompt -------- */
function getPrompt(history) {
  return `
Eres Marina 👩, asistente de T&D LIVARNA.  
Tu tarea es entrevistar candidatos para habitaciones. Habla como una persona real: cercana, simpática, educada y profesional.  

📌 Estilo de conversación:
- Saluda con naturalidad: "Hola, encantada de conocerte" o algo similar.  
- Haz una sola pregunta a la vez.  
- Entre preguntas, añade frases cortas de transición ("¡Perfecto, gracias!", "Genial, lo apunto", "Muy bien, continuamos").  
- Nunca seas robótica ni fría: mantén un tono amable y dinámico.  
- No des resúmenes finales.  

📌 Flujo de entrevista:
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

📌 Reglas de aptitud:
- Nacionalidad en países árabes, africanos, medio oriente, musulmanes, asiáticos, rusos, bielorrusos, ucranianos → NO APTO.  
- Si vive un menor → NO APTO.  
- Si fuma → NO APTO.  
- Si tiene mascotas → NO APTO.  
- Todo lo demás → APTO.  

📌 Al final:
- Si es NO APTO → agradécele el tiempo y despídete de forma amable, sin JSON.  
- Si es APTO → pide un teléfono **o** un correo (solo uno es suficiente).  

📌 JSON final:
- Solo devuelve un JSON cuando tengas todos los datos y hayas decidido.  
- No muestres nunca el JSON al usuario, pero entrégalo en tu salida para que lo procese el sistema.  
- Formato único y válido:

{
  "apto": true/false,
  "edad": "",
  "nacionalidad": "",
  "ocupacionIngresos": "",
  "sanitario": "",
  "soloPareja": "",
  "menores": "",
  "fuma": "",
  "mascotas": "",
  "tiempo": "",
  "comentarios": "",
  "telefono": "",  // puede estar vacío si dio solo email
  "email": ""      // puede estar vacío si dio solo teléfono
}

---
Historial:
${history.join("\n")}
`;
}


/* -------- Health -------- */
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "marina-backend", time: new Date().toISOString() });
});

/* -------- Chat -------- */
app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje || !sessionId) {
    return res.status(400).json({ respuesta: "⚠️ Faltan 'mensaje' o 'sessionId'." });
  }

  if (!sessions[sessionId]) sessions[sessionId] = { history: [], saved: false };

  sessions[sessionId].history.push(`Usuario: ${mensaje}`);

  try {
    const completion = await completar([
      { role: "system", content: getPrompt(sessions[sessionId].history) },
    ]);

    // 1) CONTENIDO CRUDO de la IA (aquí sí puede venir el JSON)
    const raw = completion.choices[0].message.content || "";
    // Guarda en historial crudo (para el contexto en turnos siguientes)
    sessions[sessionId].history.push(`Marina: ${raw}`);

    // 2) EXTRAER JSON del contenido crudo (code-fences o llaves sueltas)
    let jsonText = null;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      jsonText = fenced[1].trim();
    } else {
      const braces = raw.match(/\{[\s\S]*?\}/g);
      if (braces && braces.length > 0) jsonText = braces[braces.length - 1];
    }

    if (jsonText) {
      try {
        const data = JSON.parse(jsonText);

        // 3) Guardar SOLO si es APTO y no se ha guardado aún
        if (data.apto === true && !sessions[sessionId].saved) {
   // guardar en Sheets
}
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
          console.log(`✅ Guardado APT@ en Sheets (sessionId=${sessionId})`);
        }
      } catch (e) {
        console.error("❌ Error parseando JSON:", e.message);
      }
    }

    // 4) FILTRAR lo que verá el usuario (ocultar cualquier JSON/```...```)
    let visible = raw
      .replace(/```[\s\S]*?```/g, "") // quita fences
      .replace(/\{[\s\S]*?\}/g, "")   // quita JSON suelto
      .trim();

    // Si la IA solo mandó JSON y nos quedamos sin texto visible, damos un cierre amable
    if (!visible) {
      if (sessions[sessionId].saved) {
        visible = "¡Perfecto! Hemos recibido tus datos de contacto. Te escribiremos en breve. 🙌";
      } else {
        visible = "Gracias por la información. Tomo nota. 😊";
      }
    }

    res.json({ respuesta: visible });
  } catch (error) {
    console.error("❌ Error en /chat:", error.message);
    res.status(500).json({ respuesta: "⚠️ Error al conectar con Marina." });
  }
});

/* -------- Start -------- */
app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en puerto ${port}`);
});
