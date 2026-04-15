import { fetchJson, makeId } from './_util.js';

const SOURCE = 'marketaux';
const BASE = 'https://api.marketaux.com/v1/news/all';

export async function fetchArticles({ since, limit = 30 } = {}) {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) {
    console.warn(`[${SOURCE}] MARKETAUX_API_KEY not set; skipping`);
    return [];
  }

  const params = new URLSearchParams({
    api_token: key,
    language: 'en',
    filter_entities: 'true',
    countries: 'us,gb,de,jp',
    limit: String(Math.min(limit, 100)),
    sort: 'published_desc',
  });
  if (since instanceof Date) {
    params.set('published_after', since.toISOString().slice(0, 19));
  }

  const url = `${BASE}?${params.toString()}`;
  let json;
  try {
    json = await fetchJson(url);
  } catch (err) {
    console.error(`[${SOURCE}] fetch failed:`, err.message);
    return [];
  }

  const items = Array.isArray(json?.data) ? json.data : [];
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
