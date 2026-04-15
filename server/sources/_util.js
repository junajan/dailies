// Shared helpers for news source adapters.

export async function fetchJson(url, { timeoutMs = 10_000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Strip query string so API keys never appear in error messages / logs.
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${stripQuery(url)}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function stripQuery(url) {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url.split('?')[0];
  }
}

// Stable-ish article id from url (or title+source fallback).
export function makeId({ url, source, title }) {
  const key = url || `${source}::${title}`;
  // cheap 32-bit hash, good enough for dedupe
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return `${source}-${(h >>> 0).toString(36)}`;
}
