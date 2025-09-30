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
- S
