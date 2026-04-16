import { fetchJson, makeId } from './_util.js';

const SOURCE = 'newsdata';
const BASE = 'https://newsdata.io/api/1/news';

export async function fetchArticles({ since, limit = 30 } = {}) {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) {
    console.warn(`[${SOURCE}] NEWSDATA_API_KEY not set; skipping`);
    return [];
  }

  const baseParams = {
    apikey: key,
    language: 'en',
    country: 'us,gb,de,jp',
  };

  // Two parallel calls: business + technology to cover both financial and tech news
  const calls = [
    fetchJson(`${BASE}?${new URLSearchParams({ ...baseParams, category: 'business' }).toString()}`),
    fetchJson(`${BASE}?${new URLSearchParams({ ...baseParams, category: 'technology' }).toString()}`),
  ];

  const results = await Promise.allSettled(calls);
  const items = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value?.results)) {
      items.push(...r.value.results);
    } else if (r.status === 'rejected') {
      console.error(`[${SOURCE}] fetch failed:`, r.reason?.message);
    }
  }

  const sinceMs = since instanceof Date ? since.getTime() : Date.now() - 24 * 3600 * 1000;

  return items
    .map(raw => normalise(raw))
    .filter(a => a && new Date(a.publishedAt).getTime() >= sinceMs)
    .slice(0, limit);
}

function normalise(raw) {
  const title = raw?.title?.trim();
  if (!title) return null;

  return {
    id: makeId({ url: raw.link, source: SOURCE, title }),
    title,
    summary: (raw.description || '').trim(),
    url: raw.link || '',
    source: raw.source_id || SOURCE,
    publishedAt: raw.pubDate ? new Date(raw.pubDate).toISOString() : new Date().toISOString(),
    tickers: [], // newsdata.io doesn't tag tickers
    entities: Array.isArray(raw.keywords) ? raw.keywords : [],
  };
}
