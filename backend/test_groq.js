const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.MICA_GROQ_API_KEY });

async function listModels() {
  try {
    const models = await groq.models.list();
    console.log("Available models:");
    models.data.forEach(m => console.log(m.id));
  } catch (e) {
    console.error("Error fetching models:", e.message);
  }
}

listModels();
