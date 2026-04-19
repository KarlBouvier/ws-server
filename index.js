/**
 * Point d'entrée Krypton Studio — serveur Node long-running :
 * - API HTTP Express (dont POST /api/pdf)
 * - WebSocket sur le même port (upgrade)
 *
 * Variables : NEXTAUTH_SECRET, DATABASE_LOCAL_URL (Prisma), WS_PORT (défaut 3001),
 * PDF_API_KEY (optionnel, pour sécuriser /api/pdf).
 */
import http from "http";
import express from "express";
import "dotenv/config";
import { pdfRouter } from "./routes/pdf.js";
import { initWebSocket } from "./websocket/wsHandler.js";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "krypton-ws-server" });
});

app.use("/api/pdf", pdfRouter);

const server = http.createServer(app);

initWebSocket(server);

server.listen(PORT, () => {
  console.log(`[Krypton] HTTP + WebSocket listening on port ${PORT}`);
  console.log(`[Krypton] PDF API: POST http://localhost:${PORT}/api/pdf`);
});
