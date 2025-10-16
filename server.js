import express from "express";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== APP ======
const app = express();
app.use(express.json({ limit: "5mb" }));

// ====== CONFIG (use .env no Render) ======
const TOKEN = process.env.TELEGRAM_TOKEN || "SEU_TOKEN_AQUI";
const EDIT_GROUP_ID = process.env.EDIT_GROUP_ID || "-4813891159";
const PUBLIC_CHANNEL_ID = process.env.PUBLIC_CHANNEL_ID || "-100xxxxxxxxxx";
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// ====== ROTAS BÁSICAS ======
app.get("/", (_req, res) => {
  res.type("text/plain").send("Lucrécia bridge ok");
});

app.get("/health", (_req, res) => res.send("ok"));

// OpenAPI para Actions do GPT (servindo arquivo local openapi.json)
app.get("/openapi.json", (req, res) => {
  res.type("application/json").sendFile(path.join(__dirname, "openapi.json"));
});

// ====== WEBHOOK DO TELEGRAM ======
app.post(`/telegram/${TOKEN}`, async (req, res) => {
  try {
    const body = req.body || {};

    // Pode vir message, edited_message ou callback_query
    const msg = body.message || body.edited_message || body?.callback_query?.message;
    const text = body.message?.text || body.edited_message?.text || body?.callback_query?.data;

    if (!msg || !text) {
      return res.sendStatus(200); // sempre 200 pro Telegram
    }

    const chatId = msg.chat.id;
    const t = text.trim();

    // /start
    if (t === "/start") {
      await sendMessage(chatId, "Lucrécia online e pronta para trabalhar!");
      return res.sendStatus(200);
    }

    // /pacotao <tema>
    if (t.startsWith("/pacotao")) {
      const conteudo = t.replace("/pacotao", "").trim() || "(vazio)";
      await sendMessage(
        chatId,
        `📦 Pacotão recebido!\n\nConteúdo: ${conteudo}\n\n(Lucrécia ainda em modo de teste 🧠)`
      );
      return res.sendStatus(200);
    }

    // default
    await sendMessage(chatId, "Comando não reconhecido. Use /pacotao <tema>.");
    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro ao processar webhook:", err.response?.data || err.message);
    return res.sendStatus(200); // Telegram não curte 500
  }
});

// ====== UTIL ======
async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
    }, { timeout: 15000 });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.response?.data || err.message);
  }
}

// ====== START ======
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`✅ Lucrécia ON em http://${HOST}:${PORT}`);
});
