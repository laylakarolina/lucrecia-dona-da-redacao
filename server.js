import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// CONFIGURAÇÕES
const TOKEN = "8076749353:AAFQd0A1YD1xUKfD0BCA1b6CV3r-fhiRTXo"; // <-- teu token
const EDIT_GROUP_ID = "-4813891159"; // grupo B
const PUBLIC_CHANNEL_ID = "-100xxxxxxxxxx"; // depois me passa o canal
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// ROTA PRINCIPAL
app.get("/", (_req, res) => {
  res.type("text/plain").send("Lucrécia bridge ok");
});

// ROTA DE TESTE DE SAÚDE
app.get("/health", (_req, res) => res.send("ok"));

// ROTA DE RECEBIMENTO DO TELEGRAM
app.post(`/telegram/${TOKEN}`, async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg || !msg.text) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    console.log("📩 Mensagem recebida:", text);

    // responde /start
    if (text === "/start") {
      await sendMessage(chatId, "Lucrécia online e pronta para trabalhar!");
    }

    // responde /pacotao
    else if (text.startsWith("/pacotao")) {
      const conteudo = text.replace("/pacotao", "").trim() || "(vazio)";
      await sendMessage(
        chatId,
        `📦 Pacotão recebido!\n\nConteúdo: ${conteudo}\n\n(Lucrécia ainda está em modo de teste 🧠)`
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Erro ao processar mensagem:", err.message);
    res.sendStatus(500);
  }
});

// Função para enviar mensagens
async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err.response?.data || err.message);
  }
}

// LIGA O SERVIDOR
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`✅ Lucrécia ON em http://${HOST}:${PORT}`);
});
