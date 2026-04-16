import { fetchJson, makeId } from './_util.js';

const SOURCE = 'marketaux';
const BASE = 'https://api.marketaux.com/v1/news/all';

export async function fetchArticles({ since, limit = 30 } = {}) {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) {
    console.warn(`[${SOURCE}] MARKETAUX_API_KEY not set; skipping`);
    return [];
  }

  const tickers = (process.env.TICKERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .join(',');

  const baseParams = {
    api_token: key,
    language: 'en',
    filter_entities: 'true',
    countries: 'us,gb,de,jp,kr,tw',
    limit: String(Math.min(limit, 100)),
    sort: 'published_desc',
    industries: 'Technology,Financial,Energy,Healthcare',
  };
  if (since instanceof Date) {
    baseParams.published_after = since.toISOString().slice(0, 19);
  }

  // Two parallel calls: general tech/finance + watchlist-specific
  const calls = [
    fetchJson(`${BASE}?${new URLSearchParams(baseParams).toString()}`),
  ];
  if (tickers) {
    calls.push(
      fetchJson(`${BASE}?${new URLSearchParams({ ...baseParams, symbols: tickers }).toString()}`)
    );
  }

  const results = await Promise.allSettled(calls);
  const items = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value?.data)) {
      items.push(...r.value.data);
    } else if (r.status === 'rejected') {
      console.error(`[${SOURCE}] fetch failed:`, r.reason?.message);
    }
  }

  return items.map(raw => normalise(raw)).filter(Boolean);
}

function normalise(raw) {
  const title = raw?.title?.trim();
  if (!title) return null;

  const entities = Array.isArray(raw.entities) ? raw.entities : [];
  const tickers = entities
    .filter(e => e?.symbol && e?.type === 'equity')
    .map(e => String(e.symbol).toUpperCase());

  return {
    id: makeId({ url: raw.url, source: SOURCE, title }),
    title,
    summary: (raw.description || raw.snippet || '').trim(),
    url: raw.url || '',
    source: raw.source || SOURCE,
    publishedAt: raw.published_at || null,
    tickers: [...new Set(tickers)],
    entities: entities.map(e => e?.name).filter(Boolean),
  };
}
