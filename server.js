// server.js
import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "5mb" }));

// ==== ENV ====
const TOKEN = process.env.TELEGRAM_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;
const EDIT_GROUP_ID = process.env.EDIT_GROUP_ID;      // grupo B
const PUBLIC_CHANNEL_ID = process.env.PUBLIC_CHANNEL_ID; // canal público
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

// ==== memória simples (pode trocar por Redis/DB depois) ====
const store = new Map(); // postId -> { caption, photoUrl, blocks, json }

// ==== helpers Telegram ====
async function tg(method, body) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
const sendMessage = (chat_id, text, extra={}) =>
  tg("sendMessage", { chat_id, text, parse_mode:"HTML", disable_web_page_preview:true, ...extra });

const sendPhoto = (chat_id, photo, caption) =>
  tg("sendPhoto", { chat_id, photo, caption, parse_mode:"HTML" });

// ==== chamada à Lucrécia (OpenAI) ====
async function askLucrecia(systemPrompt, userPrompt) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.6
    })
  });
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

// ==== prompts base ====
const SYSTEM = `
Você é DONA REDAÇÃO 360. Siga o blueprint anexo (resumido aqui):
Entregue /pacotao com: pauta+fact-check (com fontes), gancho/títulos,
roteiro 30-60s, legendas IG/TT (com #ViboraNews e créditos "Reprodução: internet" se aplicável),
brief de thumbnail, 3+ ideias de meme, planejamento (janelas + checklist) e matéria para feed,
e um JSON final estruturado (conforme o schema do blueprint).
Não revele raciocínio interno; seja ética e cética. Cite fontes com URL e rotule confiabilidade.
`;

function buildUserPrompt(cmd, payload) {
  if (cmd === "pacotao") return `/pacotao\nTema/Link: ${payload}\nObjetivo: informação + engajamento leve.\nCanais: IG+TT.\nPúblico: 18-34 pop/fofoca.\nPreferências: incluir "Reprodução: internet"; evitar clickbait vazio.`;
  if (cmd === "gancho")  return `/gancho\nTema: ${payload}\nGere 5 títulos/hooks diferentes.`;
  if (cmd === "fact")    return `/fact\nURL/tema: ${payload}`;
  if (cmd === "agenda")  return `/agenda\nHoje, fuso -03:00. Dê janelas e checklist.`;
  return payload;
}

// ==== formatação da prévia ====
function previewFromAnswer(answer) {
  // estratégia simples: captura blocos-chave por marcadores
  const titulo = (answer.match(/\*\*TÍTULO\*\*[:\s]*([\s\S]*?)\n/i)?.[1] || "").trim();
  const lead = (answer.match(/\*\*LEAD\*\*[:\s]*([\s\S]*?)\n/i)?.[1] || "").trim();
  const legenda = (answer.match(/\*\*LEGENDA IG\*\*[\s\S]*?\n([\s\S]*?)\n\*\*HASHTAGS/i)?.[1] || "").trim();
  const fonteCount = (answer.match(/\*\*FONTES\*\*/i)) ? (answer.match(/https?:\/\/\S+/g)||[]).length : 0;

  const caption = `<b>${titulo || "Prévia de Post"}</b>\n\n<em>${lead || "Lead em anexo"}</em>\n\n<b>Legenda (IG):</b>\n${legenda || "—"}\n\n<b>Fontes</b>: ${fonteCount} link(s)\n\nAprovar para publicar no canal?`;
  return { caption };
}

// ==== teclado inline ====
function keyboard(postId){
  return {
    inline_keyboard: [
      [
        { text: "✅ Aprovar e Publicar", callback_data: `approve:${postId}` },
        { text: "🕒 Agendar", callback_data: `schedule:${postId}` }
      ],
      [
        { text: "✏️ Editar", callback_data: `edit:${postId}` },
        { text: "🗑️ Descartar", callback_data: `discard:${postId}` }
      ]
    ]
  };
}

// ==== webhook ====
app.post(`/telegram/${TOKEN}`, async (req,res) => {
  const update = req.body;

  // Comandos de texto
  if (update.message) {
    const { chat, text } = update.message;
    const cid = String(chat.id);

    // só responde no Grupo B
    if (cid !== String(EDIT_GROUP_ID)) return res.sendStatus(200);

    const [slash, ...rest] = (text || "").trim().split(" ");
    const payload = rest.join(" ");

    const commands = ["/pacotao","/gancho","/fact","/agenda"];
    if (!commands.includes(slash)) return res.sendStatus(200);

    await sendMessage(EDIT_GROUP_ID, "⏳ Processando…");

    const answer = await askLucrecia(SYSTEM, buildUserPrompt(slash.slice(1), payload));
    const { caption } = previewFromAnswer(answer);

    // postId pra controlar callbacks
    const postId = crypto.randomUUID();
    store.set(postId, { caption, blocks: answer, json: null, photoUrl: null });

    await sendMessage(EDIT_GROUP_ID, caption, { reply_markup: keyboard(postId) });
    return res.sendStatus(200);
  }

  // Callbacks (botões)
  if (update.callback_query) {
    const { id, data, message } = update.callback_query;
    const [action, postId] = data.split(":");
    const item = store.get(postId);
    if (!item) return res.sendStatus(200);

    if (action === "approve") {
      // Se tiver foto/thumbnail depois, use sendPhoto; por enquanto só texto
      await sendMessage(PUBLIC_CHANNEL_ID, item.caption);
      await sendMessage(EDIT_GROUP_ID, "✅ Publicado no Canal.");
      store.delete(postId);
    }

    if (action === "discard") {
      await sendMessage(EDIT_GROUP_ID, "🗑️ Rascunho descartado.");
      store.delete(postId);
    }

    if (action === "edit") {
      await sendMessage(EDIT_GROUP_ID, "✏️ Digite a nova legenda/título (responder à mensagem da prévia).");
    }

    if (action === "schedule") {
      await sendMessage(EDIT_GROUP_ID, "🕒 Agendamento: me diga um horário (ex.: 19:30).");
    }

    // confirma callback para remover “loading”
    await tg("answerCallbackQuery", { callback_query_id: id });
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// healthcheck
app.get("/", (_,res)=>res.send("Lucrécia bridge ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`ON :${PORT}`));
