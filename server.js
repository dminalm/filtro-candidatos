// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { google } = require("googleapis");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
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

// Cargamos credenciales de entorno (Render)
let creds = {};
try {
  creds = JSON.parse(process.env.GOOGLE_CREDENTIALS || "{}");
} catch (e) {
  console.error("❌ GOOGLE_CREDENTIALS no es un JSON válido:", e.message);
}

// Devuelve un cliente "fresco" de Sheets (evita problemas tras inactividad)
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  // Forzamos creación de cliente por si el primero caducó
  await auth.getClient();
  return google.sheets({ version: "v4", auth });
}

// Guardar con reintento: si falla una vez, reintenta con cliente nuevo
async function appendWithRetry(range, values) {
  try {
    const sheets = await getSheetsClient();
    return await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      resource: { values: [values] },
    });
  } catch (e1) {
    console.error("⚠️ Primer intento falló, reintentando…", e1?.response?.data?.error || e1.message);
    try {
      const sheets2 = await getSheetsClient();
      return await sheets2.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range,
        valueInputOption: "USER_ENTERED",
        resource: { values: [values] },
      });
    } catch (e2) {
      console.error("❌ Guardado falló tras reintento:", e2?.response?.data?.error || e2.message);
      throw e2;
    }
  }
}

// (Opcional) para ver el email del service account en logs (útil para compartir la hoja)
function maskEmail(email) {
  if (!email) return "(desconocido)";
  const [u, d] = email.split("@");
  return (u?.slice(0, 2) || "") + "***@" + (d || "");
}
console.log("ℹ️ Google service account:", maskEmail(creds?.client_email));

/* -------- Sesiones -------- */
// Estructura nueva para evitar duplicados por sesión:
// { [sessionId]: { history: [], savedApto: false, savedNoApto: false } }
const sessions = {};

/* -------- Prompt -------- */
function getPromptBase() {
  return `
Eres Marina 👩, asistente de T&D LIVARNA.  
Tu tarea es entrevistar candidatos para habitaciones. Habla como una persona real: cercana, simpática, educada y profesional.  

📌 Estilo de conversación:
- Saluda con naturalidad: "Hola, encantada de conocerte" o algo similar.  
- Haz una sola pregunta a la vez.  
- Entre preguntas, añade frases cortas de transición ("¡Perfecto, gracias!", "Genial, lo apunto", "Muy bien, continuamos").  
- Nunca seas robótica ni fría: mantén un tono amable y dinámico.  
- No des resúmenes finales ni expliques al usuario si es apto o no. 
- Siempre pide un teléfono o un correo electrónico tanto si el candidato es apto o no apto.

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

📌 Reglas de aptitud (internas, nunca las digas al usuario):
- Nacionalidad en países árabes, africanos, medio oriente, musulmanes, asiáticos, rusos, bielorrusos, ucranianos → NO APTO.  
- Si vive un menor → NO APTO.  
- Si fuma → NO APTO.  
- Si tiene mascotas → NO APTO.  
- Todo lo demás → APTO.  

📌 MUY IMPORTANTE:
- Si el candidato no te dice los ingresos, insiste en que ingresos tiene. 
- Independientemente de si es APTO o NO APTO, **siempre realiza TODA la entrevista completa (todas las preguntas del 1 al 10)**.  
- Al final SIEMPRE pide un teléfono o un correo electrónico (solo uno es suficiente).  
- Despídete con un mensaje amable y positivo.  
- Nunca digas al usuario que es NO APTO ni interrumpas la entrevista.  
- La decisión de "apto" solo aparece en el JSON final, nunca en la conversación visible.  

📌 JSON final:
- Solo devuelve el JSON cuando tengas todos los datos (incluido contacto).  
- No muestres nunca el JSON al usuario, pero entrégalo en tu salida para que lo procese el sistema.  
- El JSON debe contener solo datos que el usuario haya dado. **No inventes nunca un teléfono ni un email.**  
- Si el usuario no da teléfono → "telefono": "".  
- Si el usuario no da email → "email": "".  
- Si da los dos, rellena ambos.  
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
  "telefono": "",
  "email": ""
}
  `;
}

/* -------- Health -------- */
app.get("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "marina-backend",
    time: new Date().toISOString(),
  });
});

app.head("/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).end();
});

/* -------- Warm Sheets -------- */
app.get("/warm", async (req, res) => {
  try {
    const sheets = await getSheetsClient(); // crea cliente “fresco”
    await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Candidatos APTOS!A1:A1", // lectura mínima
    });
    res.status(200).send("OK warm");
  } catch (e) {
    console.error("❌ Warm Sheets error:", e?.response?.data?.error || e.message);
    res.status(500).send("Warm error");
  }
});

/* -------- Ruta de prueba de guardado --------
   Úsala para comprobar que Google Sheets graba, aunque no haya entrevistas.
   1) Añade en Render una ENV: DEBUG_KEY (cualquier valor)
   2) Visita: /debug/save-test?key=TU_DEBUG_KEY
--------------------------------------------- */
const DEBUG_KEY = process.env.DEBUG_KEY || "";
app.get("/debug/save-test", async (req, res) => {
  try {
    if (!DEBUG_KEY || req.query.key !== DEBUG_KEY) {
      return res.status(403).send("Forbidden (falta clave DEBUG_KEY).");
    }
    const now = new Date().toLocaleString("es-ES");
    await appendWithRetry("Candidatos APTOS!A:Z", [
      now, "99", "prueba", "prueba ingresos", "no", "solo", "no", "no", "no", "1 mes", "fila test", "600000000", "test@example.com"
    ]);
    res.send("✅ Test guardado OK en 'Candidatos APTOS'. Revisa la hoja.");
  } catch (e) {
    console.error("❌ Error guardando test en Google Sheets:", e?.response?.data?.error || e.message);
    res.status(500).send("❌ Error guardando test: " + (e?.response?.data?.error?.message || e.message));
  }
});

/* -------- Chat -------- */
app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje || !sessionId) {
    return res.status(400).json({ respuesta: "⚠️ Faltan 'mensaje' o 'sessionId'." });
  }

  // Inicializa/actualiza estructura de sesión para evitar duplicados
  if (!sessions[sessionId]) {
    sessions[sessionId] = { history: [], savedApto: false, savedNoApto: false };
  } else {
    // Compatibilidad si existía 'saved' antiguo
    if (sessions[sessionId].saved === true && sessions[sessionId].savedApto === undefined) {
      sessions[sessionId].savedApto = true;
    }
    if (sessions[sessionId].savedApto === undefined) sessions[sessionId].savedApto = false;
    if (sessions[sessionId].savedNoApto === undefined) sessions[sessionId].savedNoApto = false;
  }

  sessions[sessionId].history.push(`Usuario: ${mensaje}`);

  try {
    const messages = [
      { role: "system", content: getPromptBase() },
      ...sessions[sessionId].history.map((msg) => {
        if (msg.startsWith("Usuario:")) {
          return { role: "user", content: msg.replace("Usuario:", "").trim() };
        } else {
          return { role: "assistant", content: msg.replace("Marina:", "").trim() };
        }
      }),
    ];

    const completion = await completar(messages);
    const raw = completion.choices?.[0]?.message?.content || "";
    console.log("📨 Respuesta cruda de Marina:\n", raw);
    sessions[sessionId].history.push(`Marina: ${raw}`);

    // EXTRAER JSON con robustez
    let jsonText = null;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      jsonText = fenced[1].trim();
    } else {
      const lastOpen = raw.lastIndexOf("{");
      const lastClose = raw.lastIndexOf("}");
      if (lastOpen !== -1 && lastClose > lastOpen) {
        jsonText = raw.slice(lastOpen, lastClose + 1).trim();
      }
    }

    console.log("🧪 JSON detectado:", jsonText ? "✅ Sí" : "❌ No");

    if (jsonText) {
      let data;
      try {
        data = JSON.parse(jsonText);
      } catch (e) {
        console.error("❌ Error al leer JSON de Marina:", e.message);
      }

      if (data) {
        console.log("📊 Datos parseados:", data);

        const isApto =
          data.apto === true ||
          data.apto === "true" ||
          (typeof data.apto === "string" && data.apto.toLowerCase() === "true");

        const fila = [
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
        ];

        if (isApto) {
          if (!sessions[sessionId].savedApto) {
            try {
              await appendWithRetry("Candidatos APTOS!A:Z", fila);
              sessions[sessionId].savedApto = true;
              console.log(`✅ Guardado APTO en Sheets (sessionId=${sessionId})`);
            } catch (e) {
              console.error("❌ Error guardando APTO:", e?.response?.data?.error || e.message);
            }
          } else {
            console.log("ℹ️ Ya guardado APTO previamente en esta sesión.");
          }
        } else {
          if (!sessions[sessionId].savedNoApto) {
            try {
              // Nombre exacto de tu pestaña para NO APTOS
              await appendWithRetry("candidatos NO APTOS!A:Z", fila);
              sessions[sessionId].savedNoApto = true;
              console.log(`✅ Guardado NO APTO en Sheets (sessionId=${sessionId})`);
            } catch (e) {
              console.error("❌ Error guardando NO APTO:", e?.response?.data?.error || e.message);
            }
          } else {
            console.log("ℹ️ Ya guardado NO APTO previamente en esta sesión.");
          }
        }
      }
    }

    // FILTRAR JSON de lo que ve el usuario
    let visible = raw
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\{[\s\S]*?\}\s*$/g, "")
      .trim();

    if (!visible) {
      visible = "Gracias por la información. Hemos terminado la entrevista. 😊";
    }

    res.json({ respuesta: visible });
  } catch (error) {
    console.error("❌ Error en /chat:", error?.response?.data?.error || error.message);
    res.status(500).json({ respuesta: "⚠️ Error al conectar con Marina." });
  }
});

/* -------- Start -------- */
app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en puerto ${port}`);
  // Autowarm al arrancar (ignora errores)
  try {
    // Node 18+ tiene fetch global. Si no, simplemente fallará en silencio.
    fetch(`http://localhost:${port}/warm`).catch(() => {});
  } catch (_) {}
});
