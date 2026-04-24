import cors from "cors";
import express from "express";
import { apiRouter } from "./routes/api.js";
import { TaxiTelegramBot, setActiveTaxiTelegramBot } from "./services/bot-runtime.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "taxi-api",
    timestamp: new Date().toISOString()
  });
});

app.use("/api", apiRouter);

const server = app.listen(port, () => {
  console.log(`Taxi API listening on http://localhost:${port}`);
});

const botToken = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL ?? "https://mini-app.example.com";
let telegramBot: TaxiTelegramBot | null = null;

if (botToken) {
  telegramBot = new TaxiTelegramBot(botToken, miniAppUrl);
  setActiveTaxiTelegramBot(telegramBot);
  void telegramBot.start();
}

const shutdown = () => {
  telegramBot?.stop();
  setActiveTaxiTelegramBot(null);
  server.close();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
