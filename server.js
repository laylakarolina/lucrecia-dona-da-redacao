import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => {
  res.send("Lucrécia bridge ok");
});

// endpoint do webhook do Telegram (placeholder)
app.post(`/telegram/:token`, (req, res) => {
  // só pra confirmar que o Render aceita o POST do Telegram
  // (depois pluga seu handleUpdate aqui)
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ON :${PORT}`));
