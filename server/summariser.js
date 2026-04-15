import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are a financial news editor preparing a 3-minute spoken morning briefing for a retail investor who follows large-cap global equities.

From the provided candidate articles, choose the 5 to 8 most market-moving stories.

Rank by market importance — a story is MORE important when it involves:
A. Concrete, confirmed events over speculation or opinion pieces.
B. Larger market cap / broader market impact (mega-cap equities > mid-cap; multi-sector macro > single-stock; confirmed policy > rumoured policy).
C. Unexpected / surprising news over already-priced-in news (beats/misses and surprises outrank in-line prints).
D. Hard news categories in this order: central-bank / rates decisions, major M&A / earnings surprises, geopolitical or regulatory shocks, single-name large-cap catalysts, sector-wide moves.

Skip clickbait, "why X is a buy" opinion posts, crypto noise, minor analyst rating changes, and stories without a clear market angle.

The candidate articles are provided PRE-SORTED from most- to least-likely important by a heuristic ranker (watchlist-ticker hits, finance-native sources, recency, macro keywords). Treat this order as a prior, but override it when the content warrants — a Reuters Fed rate decision at position 8 beats a Seeking Alpha opinion piece at position 1.

Return STRICT JSON with exactly this shape:
{
  "headlines": ["most important headline", "second most important", ...],
  "script": "Good morning. ..."
}

CRITICAL ordering rules:
- "headlines" MUST be listed from most to least market-important (index 0 = top story of the day).
- "script" MUST narrate the same stories in the same order: hook → top story → next → ... → smaller stories → forward-looking close.
- Give proportional airtime: the top story gets the most sentences, the last gets the fewest.

Rules for "script":
- Target 420 to 480 words (about 3 minutes at 150 wpm).
- Write for the ear: short sentences, no bullet lists, no markdown, no headings.
- Spell out numbers naturally ("two point three percent", "seventy-two dollars a barrel").
- Say company names, not tickers, except where the ticker is itself the name (IBM, AMD).
- Open with a one-sentence hook about the overall tone of the day; close with one forward-looking sentence about what to watch next.
- Use soft transitions between stories ("Meanwhile", "In other news", "Turning to macro", "On the geopolitical front").
- Do NOT invent facts. Only use what's in the candidate articles.`;

export async function summarise(articles, { model } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const client = new OpenAI({ apiKey });
  const useModel = model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const userPayload = {
    date: new Date().toISOString().slice(0, 10),
    // Articles are pre-sorted by the ranker; rank_hint = 1 is the top prior.
    articles: articles.map((a, i) => ({
      rank_hint: i + 1,
      title: a.title,
      summary: (a.summary || '').slice(0, 500),
      source: a.source,
      tickers: a.tickers,
      publishedAt: a.publishedAt,
    })),
  };

  const res = await client.chat.completions.create({
    model: useModel,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Here are the candidate articles. Build today's briefing.\n\n${JSON.stringify(userPayload)}` },
    ],
  });

  const content = res.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON: ${err.message}`);
  }

  const headlines = Array.isArray(parsed.headlines) ? parsed.headlines.filter(Boolean) : [];
  const script = typeof parsed.script === 'string' ? parsed.script.trim() : '';
  if (!script) throw new Error('LLM returned empty script');

  return { headlines, script, model: useModel };
}

// Fallback used if the LLM call fails entirely — produces a basic headline-list script.
export function fallbackSummary(articles) {
  const top = articles.slice(0, 6);
  const headlines = top.map(a => a.title);
  const sentences = [
    "Good morning. Today's briefing couldn't be generated in full, so here are the top headlines from overnight.",
    ...top.map((a, i) => `${ordinal(i + 1)}: ${a.title}.`),
    'Please check the sources below for details.',
  ];
  return { headlines, script: sentences.join(' '), model: 'fallback' };
}

function ordinal(n) {
  const s = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  return s[n] || `${n}th`;
}
