import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import http from "http";
import { WebSocketServer } from "ws";

import { env } from "./config/env.js";
import { devicesRouter } from "./routes/devices.routes.js";
import { ingestRouter } from "./routes/ingest.routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { markOfflineDevices } from "./services/deviceStatus.service.js";
import { alarmsRouter } from "./routes/alarms.routes.js";
import { alarmRulesRouter } from "./routes/alarmRules.routes.js";
import { demoRouter } from "./routes/demo.routes.js";
import { demoGeneratorRouter } from "./routes/demoGenerator.routes.js";
import { runDemoGeneratorTick } from "./services/demoGenerator.service.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map();

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "subscribe" && data.userId) {
        clients.set(ws, String(data.userId));
      }
    } catch {
      ws.close();
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

export function broadcastToUser(userId, payload) {
  for (const [ws, clientUserId] of clients.entries()) {
    if (clientUserId === String(userId) && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
});

const ingestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 50_000,
});

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "128kb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "dotwatch-backend" });
});

app.use("/api/devices", apiLimiter, devicesRouter);
app.use("/api/demo", apiLimiter, demoRouter);
app.use("/api/demo-generator", apiLimiter, demoGeneratorRouter);
app.use("/api/ingest", ingestLimiter, ingestRouter);
app.use("/api/alarms", apiLimiter, alarmsRouter);
app.use("/api/alarm-rules", apiLimiter, alarmRulesRouter);

setInterval(async () => {
  try {
    await markOfflineDevices();
  } catch (error) {
    console.error("Offline detection failed:", error.message);
  }
}, 30_000);

setInterval(async () => {
  try {
    await runDemoGeneratorTick();
  } catch (error) {
    console.error("Demo generator failed:", error.message);
  }
}, 30_000);

app.use(errorHandler);

server.listen(env.port, () => {
  console.log(`dotWatch backend running on port ${env.port}`);
});
