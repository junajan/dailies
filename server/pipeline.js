import * as marketaux from './sources/marketaux.js';
import * as finnhub from './sources/finnhub.js';
import * as newsdata from './sources/newsdata.js';
import { rankArticles } from './ranker.js';
import { summarise, fallbackSummary } from './summariser.js';
import { saveSummary } from './store.js';

function todayLocal() {
  // Use local timezone for the date key
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Simple in-process mutex so cron + boot + manual regenerate can't overlap.
let inFlight = null;

export async function runPipeline(opts = {}) {
  if (inFlight) {
    console.log('[pipeline] already running, joining existing run');
    return inFlight;
  }
  inFlight = _runPipeline(opts).finally(() => { inFlight = null; });
  return inFlight;
}

async function _runPipeline({ date = todayLocal(), since } = {}) {
  const t0 = Date.now();
  const sinceDate = since || new Date(Date.now() - 24 * 3600 * 1000);

  console.log(`[pipeline] start for ${date}, since=${sinceDate.toISOString()}`);

  const tickers = (process.env.TICKERS || '').split(',').map(s => s.trim()).filter(Boolean);

  const results = await Promise.allSettled([
    marketaux.fetchArticles({ since: sinceDate }),
    finnhub.fetchArticles({ since: sinceDate }),
    newsdata.fetchArticles({ since: sinceDate }),
  ]);

  const articles = [];
  const sourceStats = {};
  const sourceNames = ['marketaux', 'finnhub', 'newsdata'];
  results.forEach((r, i) => {
    const name = sourceNames[i];
    if (r.status === 'fulfilled') {
      sourceStats[name] = r.value.length;
      articles.push(...r.value);
    } else {
      sourceStats[name] = `error: ${r.reason?.message || r.reason}`;
      console.error(`[pipeline] ${name} failed:`, r.reason);
    }
  });

  console.log(`[pipeline] fetched ${articles.length} articles in ${Date.now() - t0}ms`, sourceStats);

  if (articles.length === 0) {
    throw new Error('No articles fetched from any source — check API keys and network.');
  }

  const ranked = rankArticles(articles, { tickers });
  const top = ranked.slice(0, 15);
  console.log(`[pipeline] ranked → top ${top.length}`);

  let summary;
  try {
    summary = await summarise(top);
  } catch (err) {
    console.error('[pipeline] summariser failed, using fallback:', err.message);
    summary = fallbackSummary(top);
  }

  const payload = {
    headlines: summary.headlines,
    script: summary.script,
    model: summary.model,
    sources: top.map(a => ({ title: a.title, url: a.url, source: a.source })),
    sourceStats,
    generatedAt: new Date().toISOString(),
    totalMs: Date.now() - t0,
  };

  const saved = await saveSummary(date, payload);
  console.log(`[pipeline] saved ${date}.json in ${payload.totalMs}ms, script=${summary.script.length}chars`);
  return saved;
}
