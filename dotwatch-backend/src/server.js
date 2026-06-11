import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { devicesRouter } from './routes/devices.routes.js';
import { ingestRouter } from './routes/ingest.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { markOfflineDevices } from './services/deviceStatus.service.js';

const app = express();

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
app.use(express.json({ limit: '128kb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dotwatch-backend' });
});

app.use('/api/devices', apiLimiter, devicesRouter);
app.use('/api/ingest', ingestLimiter, ingestRouter);

setInterval(async () => {
  try {
    await markOfflineDevices();
  } catch (error) {
    console.error('Offline detection failed:', error.message);
  }
}, 30_000);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`dotWatch backend running on port ${env.port}`);
});