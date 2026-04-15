// Dedupe and rank articles by likely market relevance.

const FINANCE_SOURCES = new Set([
  'bloomberg', 'reuters', 'financial-times', 'ft', 'wsj', 'cnbc',
  'marketwatch', 'barrons', 'seekingalpha', 'investing.com', 'finnhub',
  'marketaux', 'the-wall-street-journal',
]);

export function rankArticles(articles, { tickers = [] } = {}) {
  const watched = new Set(tickers.map(t => t.toUpperCase()));
  const byKey = new Map();

  for (const a of articles) {
    const key = canonicalKey(a);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, a);
      continue;
    }
    // Keep whichever has richer content
    if ((a.summary?.length || 0) > (existing.summary?.length || 0)) {
      byKey.set(key, a);
    }
  }

  const scored = [...byKey.values()].map(a => ({ ...a, _score: score(a, watched) }));
  scored.sort((a, b) => b._score - a._score);
  return scored.map(({ _score, ...rest }) => rest);
}

function canonicalKey(a) {
  if (a.url) {
    try {
      const u = new URL(a.url);
      return `${u.host}${u.pathname}`.toLowerCase();
    } catch {
      /* fall through */
    }
  }
  return normaliseTitle(a.title);
}

function normaliseTitle(t = '') {
  return t.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

function score(a, watched) {
  let s = 0;

  // Watchlist ticker hits are the strongest signal
  const tickerHits = (a.tickers || []).filter(t => watched.has(t)).length;
  s += tickerHits * 5;

  // Any ticker tagging is a positive signal (finance-focused article)
  s += Math.min((a.tickers || []).length, 3) * 1;

  // Finance-native sources get a bonus
  const src = (a.source || '').toLowerCase();
  if (FINANCE_SOURCES.has(src) || [...FINANCE_SOURCES].some(f => src.includes(f))) {
    s += 2;
  }

  // Recency: exponential decay over 24h
  const ageHours = a.publishedAt
    ? Math.max(0, (Date.now() - new Date(a.publishedAt).getTime()) / 3600_000)
    : 24;
  s += Math.max(0, 3 - ageHours / 8);

  // Keyword hints for macro stories
  const text = `${a.title} ${a.summary}`.toLowerCase();
  const macroHits = [
    'fed', 'federal reserve', 'ecb', 'boe', 'boj', 'inflation', 'cpi',
    'gdp', 'recession', 'earnings', 'guidance', 'downgrade', 'upgrade',
    'merger', 'acquisition', 'ipo', 'tariff', 'sanction',
  ].filter(k => text.includes(k)).length;
  s += Math.min(macroHits, 3);

  return s;
}
