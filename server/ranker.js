// Dedupe and rank articles by likely market relevance.
// Focus: big tech / mega-cap, tech developments, global macro — all with a stock-market angle.

const FINANCE_SOURCES = new Set([
  'bloomberg', 'reuters', 'financial-times', 'ft', 'wsj', 'cnbc',
  'marketwatch', 'barrons', 'seekingalpha', 'investing.com', 'finnhub',
  'marketaux', 'the-wall-street-journal', 'techcrunch', 'theverge',
  'arstechnica', 'wired',
]);

// Mega-cap tickers get an extra bonus on top of the watchlist match.
const MEGA_CAP = new Set([
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA',
  'BRK.B', 'BRK.A', 'AVGO', 'TSM', 'V', 'MA', 'JPM',
  'UNH', 'XOM', 'JNJ', 'WMT', 'ORCL', 'NFLX', 'ADBE', 'CRM',
  'AMD', 'INTC', 'ASML', 'QCOM', 'AMAT',
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
  const articleTickers = (a.tickers || []).map(t => t.toUpperCase());

  // Watchlist ticker hits
  const watchlistHits = articleTickers.filter(t => watched.has(t)).length;
  s += watchlistHits * 5;

  // Mega-cap ticker bonus (on top of watchlist)
  const megaCapHits = articleTickers.filter(t => MEGA_CAP.has(t)).length;
  s += megaCapHits * 3;

  // Any ticker tagging is a positive signal
  s += Math.min(articleTickers.length, 3);

  // Finance-native or tech-native sources get a bonus
  const src = (a.source || '').toLowerCase();
  if (FINANCE_SOURCES.has(src) || [...FINANCE_SOURCES].some(f => src.includes(f))) {
    s += 2;
  }

  // Recency: exponential decay over 24h
  const ageHours = a.publishedAt
    ? Math.max(0, (Date.now() - new Date(a.publishedAt).getTime()) / 3600_000)
    : 24;
  s += Math.max(0, 3 - ageHours / 8);

  const text = `${a.title} ${a.summary}`.toLowerCase();

  // Big tech company name mentions (catches articles without ticker tags)
  const techNameHits = [
    'apple', 'microsoft', 'nvidia', 'google', 'alphabet', 'amazon', 'meta',
    'tesla', 'broadcom', 'tsmc', 'samsung', 'openai', 'anthropic',
    'oracle', 'salesforce', 'adobe', 'netflix', 'amd', 'intel', 'qualcomm',
    'asml', 'arm holdings',
  ].filter(n => text.includes(n)).length;
  s += Math.min(techNameHits, 4) * 2;

  // Tech development keywords
  const techHits = [
    'artificial intelligence', ' ai ', 'machine learning', 'large language model',
    'llm', 'chip', 'semiconductor', 'data center', 'cloud computing',
    'autonomous', 'self-driving', 'robotics', 'quantum computing',
    'cybersecurity', 'ev battery', 'electric vehicle',
  ].filter(k => text.includes(k)).length;
  s += Math.min(techHits, 3) * 2;

  // Macro / global news keywords
  const macroHits = [
    'fed', 'federal reserve', 'ecb', 'boe', 'boj', 'inflation', 'cpi',
    'gdp', 'recession', 'interest rate', 'rate cut', 'rate hike',
    'earnings', 'revenue', 'guidance', 'downgrade', 'upgrade',
    'merger', 'acquisition', 'ipo', 'tariff', 'sanction', 'trade war',
    'antitrust', 'regulation', 'sec ',
  ].filter(k => text.includes(k)).length;
  s += Math.min(macroHits, 4) * 1.5;

  // Penalize consumer/lifestyle fluff that slips through business feeds
  const fluffHits = [
    'coupon', 'discount code', 'best deals', 'gift guide', 'how to save',
    'personal finance tip', 'credit score', 'mortgage rate', 'home buying',
    'energy bill', 'broadband deal',
  ].filter(k => text.includes(k)).length;
  s -= fluffHits * 3;

  return s;
}
