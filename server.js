const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.SHEET_ID;

// Flujo de preguntas
const flujoPreguntas = [
  "¿Cuántos años tienes?",
  "Genial, gracias 😊 ¿De dónde eres?",
  "¿Estudias o trabajas? Si es así, ¿cuáles son tus ingresos aproximados?",
  "¿Trabajas o estudias en el ámbito sanitario? ¿Eres sanitario?",
  "¿Alquilarás la habitación solo/a o con pareja?",
  "¿Vivirá un menor contigo en la habitación?",
  "¿Fumas?",
  "¿Tienes mascotas?",
  "¿Cuánto tiempo necesitas la habitación?",
  "¿Quieres añadir algo más? Puedes hacerlo libremente."
];

// Memoria temporal en RAM
let candidatos = {}; // { sessionId: { paso, respuestas, esApto, completado } }

// Ruta raíz
app.get("/", (req, res) => {
  res.send("✅ Marina backend funcionando con Google Sheets");
});

// Ruta del chat
app.post("/chat", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "Falta sessionId" });
  }

  // Inicializar sesión si no existe
  if (!candidatos[sessionId]) {
    candidatos[sessionId] = {
      paso: -1, // -1 = solo presentación
      respuestas: {},
      esApto: true,
      completado: false,
    };
  }

  const candidato = candidatos[sessionId];
  let respuesta = "";

  // Presentación inicial
  if (candidato.paso === -1) {
    candidato.paso = 0;
    respuesta =
      "👩 Hola, soy Marina y le haré algunas preguntas para encontrar la habitación que mejor se adapte a sus necesidades. " +
      "No le pediré información privada y protegeremos sus datos conforme a la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD). " +
      "Cuando esté listo/a, puede escribirme para comenzar 🙂";
    return res.json({ respuesta });
  }

  // Guardar respuesta del usuario
  if (candidato.paso > 0 && candidato.paso <= flujoPreguntas.length) {
    const clave = flujoPreguntas[candidato.paso - 1];
    candidato.respuestas[clave] = mensaje;

    // Evaluar reglas de Apto / No Apto
    if (candidato.paso === 2) {
      // Nacionalidad
      const nacionalidad = mensaje.toLowerCase();
      const noAptos = [
        "árabe", "arabe", "africano", "africa", "medio oriente", "musulmán", "musulmana",
        "asiático", "asiatica", "ruso", "bielorruso", "ucraniano"
      ];
      if (noAptos.some(n => nacionalidad.includes(n))) {
        candidato.esApto = false;
      }
    }

    if (candidato.paso === 6) {
      // Menores
      if (mensaje.toLowerCase().includes("sí") || mensaje.toLowerCase().includes("si")) {
        candidato.esApto = false;
      }
    }

    if (candidato.paso === 7) {
      // Fumar
      if (mensaje.toLowerCase().includes("sí") || mensaje.toLowerCase().includes("si")) {
        candidato.esApto = false;
      }
    }

    if (candidato.paso === 8) {
      // Mascotas
      if (mensaje.toLowerCase().includes("sí") || mensaje.toLowerCase().includes("si")) {
        candidato.esApto = false;
      }
    }
  }

  // Si aún quedan preguntas
  if (candidato.paso < flujoPreguntas.length) {
    respuesta = flujoPreguntas[candidato.paso];
    candidato.paso++;
  } else {
    // Entrevista completada
    candidato.completado = true;

    if (candidato.esApto) {
      respuesta =
        "Gracias por tus respuestas. ✅\n\n" +
        "Para continuar, necesitamos un número de teléfono y un correo electrónico para ponernos en contacto contigo y enseñarte fotos y vídeos de la habitación. " +
        "¿Podrías facilitárnoslos, por favor?";

      try {
        const fila = [
          new Date().toLocaleString(),
          candidato.respuestas["¿Cuántos años tienes?"] || "",
          candidato.respuestas["Genial, gracias 😊 ¿De dónde eres?"] || "",
          candidato.respuestas["¿Estudias o trabajas? Si es así, ¿cuáles son tus ingresos aproximados?"] || "",
          candidato.respuestas["¿Trabajas o estudias en el ámbito sanitario? ¿Eres sanitario?"] || "",
          candidato.respuestas["¿Alquilarás la habitación solo/a o con pareja?"] || "",
          candidato.respuestas["¿Vivirá un menor contigo en la habitación?"] || "",
          candidato.respuestas["¿Fumas?"] || "",
          candidato.respuestas["¿Tienes mascotas?"] || "",
          candidato.respuestas["¿Cuánto tiempo necesitas la habitación?"] || "",
          candidato.respuestas["¿Quieres añadir algo más? Puedes hacerlo libremente."] || "",
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: "Candidatos APTOS!A:L",
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [fila] },
        });

        console.log("📋 Candidato Apto guardado en Google Sheets");
      } catch (err) {
        console.error("❌ Error al guardar en Google Sheets:", err.message);
      }
    } else {
      respuesta =
        "Gracias por tus respuestas. 🙏\n\n" +
        "Actualmente no tenemos una habitación que cumpla con tus necesidades. " +
        "Nos pondremos en contacto contigo cuando haya alguna disponible.";
    }

    // Reiniciar entrevista (si quieres entrevistas múltiples)
    // candidatos[sessionId] = { paso: -1, respuestas: {}, esApto: true, completado: false };
  }

  res.json({ respuesta });
});

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
