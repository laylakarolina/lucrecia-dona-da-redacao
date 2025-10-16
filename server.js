import express from "express";

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.type("text/plain").send("Lucrécia bridge ok");
});

app.post("/telegram/:token", (_req, res) => {
  // placeholder: só confirma que a rota existe
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000; // Render injeta PORT
app.listen(PORT, () => console.log(`ON :${PORT}`));
