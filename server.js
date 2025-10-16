import express from "express";

const app = express();
app.use(express.json());

// logs de boot bem cedo
console.log("Lucrécia: iniciando processo...");

app.get("/", (_req, res) => {
  res.type("text/plain").send("Lucrécia bridge ok");
});

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

app.post("/telegram/:token", (_req, res) => {
  res.sendStatus(200);
});

// captura erros não tratados para não matar o processo
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

const PORT = process.env.PORT || 3000;
// BIND explícito em 0.0.0.0 (alguns ambientes precisam disso)
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Lucrécia ON em http://${HOST}:${PORT}`);
});
