// server.js
import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "5mb" }));

// ==== ENV ====
const TOKEN = process.env.TELEGRAM_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;
const EDIT_GROUP_ID = String(process.env.EDIT_GROUP_ID || "");
const PUBLIC_CHANNEL_ID = String(process.env.PUBLIC_CHANNEL_ID || "");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";

// ==== memória simples ====
const store = new Map(); // postId -> { caption, blocks, json, photoUrl }

// ==== helpers Telegram ====
async function tg(method, body) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
const sendMessage = (chat_id, text, extra = {}) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

const sendPhoto = (chat_id, photo, caption) =>
  tg("sendPhoto", { chat_id, photo, caption, parse_mode: "HTML" });

// ==== chamada à OpenAI ====
async function askLucrecia(systemPrompt, userPrompt) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
    }),
  });
  const j = await r.json();
  if (!j.choices?.[0]?.message?.content) throw new Error(JSON.stringify(j));
  return j.choices[0].message.content;
}

// ==== prompts base ====
const SYSTEM = `
Você é DONA REDAÇÃO 360 (Lucrécia). Entregue /pacotao com:
- pauta + fact-check (com fontes e confiabilidade),
- gancho/títulos,
- roteiro 30–60s,
- legendas IG/TT (com #ViboraNews e “Reprodução: internet” se aplicável),
- brief de thumbnail,
- 3+ ideias de meme,
- planejamento (janelas + checklist),
- matéria para feed,
E finalize com um BLOCO JSON válido com as chaves:
gancho, titulo, roteiro, legenda, thumb_brief, meme_ideias, planejamento, materia.
Não revele raciocínio interno; seja ética e cética. Cite fontes com URL e rotule confiabilidade.
`;

function buildUserPrompt(cmd, payload) {
  if (cmd === "pacotao")
    return `/pacotao
Tema/Link: ${payload}
Objetivo: informação + engajamento leve.
Canais: IG+TT.
Público: 18-34 pop/fofoca.
Preferências: incluir "Reprodução: internet"; evitar clickbait vazio.`;
  if (cmd === "gancho") return `/gancho\nTema: ${payload}\nGere 5 títulos/hooks diferentes.`;
  if (cmd === "fact") return `/fact\nURL/tema: ${payload}`;
  if (cmd === "agenda") return `/agenda\nHoje, fuso -03:00. Dê janelas e checklist.`;
  return payload;
}

// ==== parser simples p/ prévia ====
function previewFromAnswer(answer) {
  const titulo = (answer.match(/\*\*TÍTULO\*\*[:\s]*([\s\S]*?)\n/i)?.[1] || "").trim();
  const lead = (answer.match(/\*\*LEAD\*\*[:\s]*([\s\S]*?)\n/i)?.[1] || "").trim();
  const legenda = (answer.match(/\*\*LEGENDA IG\*\*[\s\S]*?\n([\s\S]*?)\n\*\*HASHTAGS/i)?.[1] || "").trim();
  const fonteCount = answer.includes("**FONTES**") ? (answer.match(/https?:\/\/\S+/g) || []).length : 0;

  const caption =
    `<b>${titulo || "Prévia de Post"}</b>\n\n` +
    `<em>${lead || "Lead em anexo"}</em>\n\n` +
    `<b>Legenda (IG):</b>\n${legenda || "—"}\n\n` +
    `<b>Fontes</b>: ${fonteCount} link(s)\n\n` +
    `Aprovar para publicar no canal?`;
  return { caption };
}

function keyboard(postId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Aprovar e Publicar", callback_data: `approve:${postId}` },
        { text: "🕒 Agendar", callback_data: `schedule:${postId}` },
      ],
      [
        { text: "✏️ Editar", callback_data: `edit:${postId}` },
        { text: "🗑️ Descartar", callback_data: `discard:${postId}` },
      ],
    ],
  };
}

// ====== ROTAS PÚBLICAS (casam com seu openapi.json) ======

// Health (GET /health) — opcionalmente também respondo / para facilitar teste
app.get("/health", (_, res) => res.status(200).send("OK"));
app.get("/", (_, res) => res.send("Lucrécia bridge ok"));

// OpenAPI (GET /openapi.json)
app.get("/openapi.json", (req, res) => {
  const p = path.join(__dirname, "openapi.json");
  if (!fs.existsSync(p)) return res.status(404).json({ error: "openapi.json not found" });
  res.type("application/json").send(fs.readFileSync(p, "utf-8"));
});

// Pacotão (POST /pacotao) — usado pelo GPT Actions
app.post("/pacotao", async (req, res) => {
  try {
    const { tema, tom, rede } = req.body || {};
    if (!tema) return res.status(400).json({ error: "Tema obrigatório" });

    const answer = await askLucrecia(SYSTEM, buildUserPrompt("pacotao", tema));
    // tenta extrair o bloco JSON final (se vier)
    let jsonMatch = answer.match(/\{[\s\S]*\}$/);
    let payload;
    try {
      if (jsonMatch) payload = JSON.parse(jsonMatch[0]);
    } catch (_) {
      payload = null;
    }
    // fallback se não achar JSON
    const resp = payload || { raw: answer };

    return res.status(200).json(resp);
  } catch (err) {
    console.error("Erro /pacotao:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

// Aprovar/publicar (POST /aprovar) — publica no canal
app.post("/aprovar", async (req, res) => {
  try {
    const { conteudo } = req.body || {};
    if (!conteudo) return res.status(400).json({ error: "conteudo obrigatório" });
    if (!PUBLIC_CHANNEL_ID) return res.status(400).json({ error: "PUBLIC_CHANNEL_ID não configurado" });

    await sendMessage(PUBLIC_CHANNEL_ID, conteudo);
    return res.status(200).json({ ok: true, published: true });
  } catch (err) {
    console.error("Erro /aprovar:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

// Editar (POST /editar) — devolve versão revisada
app.post("/editar", async (req, res) => {
  try {
    const { conteudo, instrucoes } = req.body || {};
    if (!conteudo || !instrucoes) return res.status(400).json({ error: "conteudo e instrucoes obrigatórios" });

    const prompt = `Reescreva o texto a seguir conforme as instruções.\n\nTEXTO:\n${conteudo}\n\nINSTRUÇÕES:\n${instrucoes}\n\nDevolva somente o texto final.`;
    const revised = await askLucrecia("Você é uma editora de texto rigorosa e clara.", prompt);
    return res.status(200).json({ texto: revised });
  } catch (err) {
    console.error("Erro /editar:", err);
    return res.status(500).json({ error: String(err.message || err) });
  }
});

// ====== WEBHOOK TELEGRAM (mantido como já estava) ======
app.post(`/telegram/${TOKEN}`, async (req, res) => {
  const update = req.body;

  // Comandos de texto
  if (update.message) {
    const { chat, text } = update.message;
    const cid = String(chat.id);

    // só responde no Grupo B
    if (cid !== EDIT_GROUP_ID) return res.sendStatus(200);

    const [slash, ...rest] = (text || "").trim().split(" ");
    const payload = rest.join(" ");

    const commands = ["/pacotao", "/gancho", "/fact", "/agenda"];
    if (!commands.includes(slash)) return res.sendStatus(200);

    await sendMessage(EDIT_GROUP_ID, "⏳ Processando…");

    const answer = await askLucrecia(SYSTEM, buildUserPrompt(slash.slice(1), payload));
    const { caption } = previewFromAnswer(answer);

    const postId = crypto.randomUUID();
    store.set(postId, { caption, blocks: answer, json: null, photoUrl: null });

    await sendMessage(EDIT_GROUP_ID, caption, { reply_markup: keyboard(postId) });
    return res.sendStatus(200);
  }

  // Callbacks (botões)
  if (update.callback_query) {
    const { id, data } = update.callback_query;
    const [action, postId] = data.split(":");
    const item = store.get(postId);
    if (!item) {
      await tg("answerCallbackQuery", { callback_query_id: id, text: "Rascunho não encontrado." });
      return res.sendStatus(200);
    }

    if (action === "approve") {
      await sendMessage(PUBLIC_CHANNEL_ID, item.caption);
      await sendMessage(EDIT_GROUP_ID, "✅ Publicado no Canal.");
      store.delete(postId);
    }

    if (action === "discard") {
      await sendMessage(EDIT_GROUP_ID, "🗑️ Rascunho descartado.");
      store.delete(postId);
    }

    if (action === "edit") {
      await sendMessage(EDIT_GROUP_ID, "✏️ Responda com a nova legenda/título nesta thread.");
    }

    if (action === "schedule") {
      await sendMessage(EDIT_GROUP_ID, "🕒 Agendamento: me diga um horário (ex.: 19:30).");
    }

    await tg("answerCallbackQuery", { callback_query_id: id });
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// ==== START ====
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`✅ Lucrécia ON em http://0.0.0.0:${PORT}`));

