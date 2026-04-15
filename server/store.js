import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data', 'summaries');

async function ensureDir() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

function pathFor(date) {
  // Defensive: block path traversal if `date` ever comes from user input.
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${String(date).slice(0, 40)}`);
  }
  return join(DATA_DIR, `${date}.json`);
}

export async function saveSummary(date, payload) {
  await ensureDir();
  const full = { date, ...payload };
  await writeFile(pathFor(date), JSON.stringify(full, null, 2), 'utf8');
  return full;
}

export async function loadSummary(date) {
  try {
    const raw = await readFile(pathFor(date), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function loadLatest() {
  await ensureDir();
  const files = (await readdir(DATA_DIR))
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  if (!files.length) return null;
  const raw = await readFile(join(DATA_DIR, files[0]), 'utf8');
  return JSON.parse(raw);
}

export async function hasSummary(date) {
  return existsSync(pathFor(date));
}
