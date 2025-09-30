const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Flujo de preguntas
const flujoPreguntas = [
  "¿Cuántos años tienes?",
  "¿Cuál es tu nacionalidad?",
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
  res.send("✅ Marina backend funcionando con reglas Apto / No Apto");
});

// Ruta del chat
app.post("/chat", (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "Falta sessionId" });
  }

  // Inicializar sesión si no existe
  if (!candidatos[sessionId]) {
    candidatos[sessionId] = {
      paso: -1, // -1 significa que aún no se ha hecho la presentación
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
      "Hola, soy Marina y le haré algunas preguntas para encontrar la habitación que mejor se adapte a sus necesidades. " +
      "No le pediré información privada y protegeremos.\n\n" +
      flujoPreguntas[0];
    return res.json({ respuesta });
  }

  // Guardar la respuesta del usuario a la pregunta anterior
  if (candidato.paso > 0 && candidato.paso <= flujoPreguntas.length) {
    const clave = flujoPreguntas[candidato.paso - 1];
    candidato.respuestas[clave] = mensaje;

    // Evaluar reglas de Apto / No Apto
    if (candidato.paso === 2) {
      // Nacionalidad
      const nacionalidad = mensaje.toLowerCase();
      const noAptos = [
        "árabe", "arabe", "africano", "africa", "medio oriente", "musulmán", "musulmana",
        "asiático", "asiatica", "asiático", "ruso", "bielorruso", "ucraniano"
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
    } else {
      respuesta =
        "Gracias por tus respuestas. 🙏\n\n" +
        "Actualmente no tenemos una habitación que cumpla con tus necesidades. " +
        "Nos pondremos en contacto contigo cuando haya alguna disponible.";
    }

    // Reiniciar entrevista (opcional, para que pueda empezar otra vez)
    // candidatos[sessionId] = { paso: -1, respuestas: {}, esApto: true, completado: false };
  }

  res.json({ respuesta });
});

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
