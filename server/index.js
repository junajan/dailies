import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

import { runPipeline } from './pipeline.js';
import { loadLatest, loadSummary, hasSummary } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WEB_DIST = join(ROOT, 'web', 'dist');

const app = express();
app.use(express.json());

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Constant-time comparison to avoid timing attacks on the regenerate secret.
function timingSafeEquals(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// --- API ----------------------------------------------------------------

app.get('/api/today', async (_req, res) => {
  try {
    const today = todayLocal();
    const summary = (await loadSummary(today)) || (await loadLatest());
    if (!summary) {
      return res.status(404).json({ error: 'No summary available yet. Check back after 5am or trigger /api/regenerate.' });
    }
    res.json(summary);
  } catch (err) {
    console.error('[api] /api/today failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/regenerate', async (req, res) => {
  const secret = process.env.REGENERATE_SECRET;
  if (!secret) {
    return res.status(403).json({ error: 'Regenerate endpoint disabled (set REGENERATE_SECRET)' });
  }
  if (!timingSafeEquals(req.get('x-secret') || '', secret)) {
    return res.status(401).json({ error: 'Bad secret' });
  }
  try {
    const result = await runPipeline();
    res.json({ ok: true, date: result.date, headlines: result.headlines.length });
  } catch (err) {
    console.error('[api] /api/regenerate failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Static Vue app -----------------------------------------------------

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
} else {
  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      'web/dist not found. Run `npm run build` (or `npm run web:dev` for development).'
    );
  });
}

// --- Cron ---------------------------------------------------------------

const schedule = process.env.CRON_SCHEDULE || '0 5 * * *';
const tz = process.env.TZ || 'Europe/Prague';

if (cron.validate(schedule)) {
  cron.schedule(schedule, async () => {
    console.log(`[cron] firing ${schedule} ${tz}`);
    try {
      await runPipeline();
    } catch (err) {
      console.error('[cron] pipeline failed:', err);
    }
  }, { timezone: tz });
  console.log(`[cron] scheduled "${schedule}" (${tz})`);
} else {
  console.error(`[cron] invalid CRON_SCHEDULE: ${schedule}`);
}

// --- Boot ---------------------------------------------------------------

async function bootFillIfMissing() {
  const today = todayLocal();
  if (await hasSummary(today)) {
    console.log(`[boot] summary for ${today} already exists`);
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[boot] OPENAI_API_KEY not set — skipping boot generation');
    return;
  }
  console.log(`[boot] no summary for ${today}, generating now…`);
  try {
    await runPipeline();
  } catch (err) {
    console.error('[boot] generation failed:', err.message);
  }
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  bootFillIfMissing();
});
