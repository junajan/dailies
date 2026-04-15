import { fetchJson, makeId } from './_util.js';

const SOURCE = 'finnhub';
const BASE = 'https://finnhub.io/api/v1';

// Fetches general market news + per-ticker news for the configured watchlist.
export async function fetchArticles({ since, limit = 30 } = {}) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    console.warn(`[${SOURCE}] FINNHUB_API_KEY not set; skipping`);
    return [];
  }

  const tickers = (process.env.TICKERS || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  const sinceMs = since instanceof Date ? since.getTime() : Date.now() - 24 * 3600 * 1000;

  // General market news
  const generalUrl = `${BASE}/news?category=general&token=${encodeURIComponent(key)}`;

  // Company news — one call per ticker (free tier = 60 req/min, so 10 tickers is fine)
  const fromIso = new Date(sinceMs).toISOString().slice(0, 10);
  const toIso = new Date().toISOString().slice(0, 10);
  const companyUrls = tickers.map(
    t => `${BASE}/company-news?symbol=${t}&from=${fromIso}&to=${toIso}&token=${encodeURIComponent(key)}`
  );

  const results = await Promise.allSettled([
    fetchJson(generalUrl).catch(err => {
      console.error(`[${SOURCE}] general fetch failed:`, err.message);
      return [];
    }),
    ...companyUrls.map((url, i) =>
      fetchJson(url).catch(err => {
        console.error(`[${SOURCE}] company news ${tickers[i]} failed:`, err.message);
        return [];
      })
    ),
  ]);

  const articles = [];
  const generalRaw = results[0]?.status === 'fulfilled' ? results[0].value : [];
  for (const r of arrayify(generalRaw)) {
    const a = normalise(r, null);
    if (a && a.publishedAtMs >= sinceMs) articles.push(a);
  }
  for (let i = 0; i < tickers.length; i++) {
    const r = results[i + 1];
    if (r?.status !== 'fulfilled') continue;
    for (const raw of arrayify(r.value)) {
      const a = normalise(raw, tickers[i]);
      if (a && a.publishedAtMs >= sinceMs) articles.push(a);
    }
  }

  // Cap total to avoid ballooning
  articles.sort((a, b) => b.publishedAtMs - a.publishedAtMs);
  return articles.slice(0, limit).map(({ publishedAtMs, ...a }) => a);
}

function arrayify(v) {
  return Array.isArray(v) ? v : [];
}

function normalise(raw, ticker) {
  const title = raw?.headline?.trim();
  if (!title) return null;

  const publishedAtMs = raw.datetime ? raw.datetime * 1000 : Date.now();
  const tickers = ticker ? [ticker] : raw.related ? String(raw.related).split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];

  return {
    id: makeId({ url: raw.url, source: SOURCE, title }),
    title,
    summary: (raw.summary || '').trim(),
    url: raw.url || '',
    source: raw.source || SOURCE,
    publishedAt: new Date(publishedAtMs).toISOString(),
    publishedAtMs,
    tickers: [...new Set(tickers)],
    entities: [],
  };
}
