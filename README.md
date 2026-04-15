# Daily Market Briefing

A personal morning news app: every day at 05:00 a backend job pulls stock-market
news, asks an LLM for a ~3-minute script, and serves it to a mobile-friendly web
page. Tapping **Play** speaks it via the browser's free Web Speech API — no
server-side TTS, no audio files, no cost beyond pennies for the LLM.

## Stack

- **Node.js + Express** — HTTP + cron (`node-cron`)
- **Vue 3 + Vite** — mobile-first single page
- **News APIs**: Marketaux, Finnhub, NewsData.io (all free tiers)
- **LLM**: OpenAI `gpt-4o-mini`
- **TTS**: `window.speechSynthesis` (browser, on-device)

## Setup

```bash
# 1. Install deps
npm install
npm --prefix web install

# 2. Get API keys (all have free tiers)
#    - https://www.marketaux.com/
#    - https://finnhub.io/
#    - https://newsdata.io/
#    - https://platform.openai.com/api-keys
cp .env.example .env
# edit .env and paste your keys

# 3. Build the Vue app
npm run build

# 4. Run it
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

On first boot, if there's no summary for today yet, the server runs the
pipeline once immediately. The cron at `CRON_SCHEDULE` (default 05:00
Europe/Prague) takes over from then on.

## Scripts

| Command               | What                                                   |
|-----------------------|--------------------------------------------------------|
| `npm start`           | Production: Express + cron, serves built Vue app       |
| `npm run dev`         | Server with `--watch`                                  |
| `npm run web:dev`     | Vite dev server on :5173 (proxies `/api` → :3000)     |
| `npm run build`       | Build Vue app into `web/dist/`                         |
| `npm run regenerate`  | Force one pipeline run now (writes today's summary)    |

## Manual regenerate (while server runs)

Set `REGENERATE_SECRET` in `.env`, then:

```bash
curl -X POST -H "x-secret: $REGENERATE_SECRET" http://localhost:3000/api/regenerate
```

## File layout

```
server/
  index.js          Express + cron boot
  pipeline.js       fetch → rank → summarise → store
  sources/*.js      Marketaux / Finnhub / NewsData.io adapters
  ranker.js         Dedupe + market-relevance scoring
  summariser.js     OpenAI prompt → {headlines, script}
  store.js          JSON files in data/summaries/
  cli.js            `npm run regenerate` entrypoint
web/                Vue 3 SPA (see web/src/composables/useSpeech.js for TTS)
data/summaries/     YYYY-MM-DD.json (one per day, git-ignored)
```

## Mobile notes

- Add to Home Screen on iOS for a full-screen PWA.
- Speech pauses when the tab backgrounds / screen locks on iOS. Keep the
  screen on for the ~3-min briefing.
- The script is also rendered as "Top stories" — reads fine without audio.

## Deploy (GitHub Actions → SSH)

Every push to `main` triggers `.github/workflows/deploy.yml`, which rsyncs
the code to your server and restarts it via `pm2`.

### One-time server setup

```bash
# on the remote server
sudo apt install -y nodejs npm           # Node 20+
sudo npm install -g pm2
mkdir -p /srv/daily-summary
cd /srv/daily-summary
# create .env with your API keys (this file is NOT pushed by CI)
```

### GitHub repo secrets

Set these under **Settings → Secrets and variables → Actions**
(or scope them to an `environment: production`):

| Secret             | Example                                    |
|--------------------|--------------------------------------------|
| `SSH_HOST`         | `your-server.example.com`                  |
| `SSH_USER`         | `deploy`                                   |
| `SSH_PORT`         | `22` (optional, defaults to 22)            |
| `SSH_PRIVATE_KEY`  | contents of a private key whose public key is in the server's `~/.ssh/authorized_keys` |
| `DEPLOY_PATH`      | `/srv/daily-summary`                       |

### Notes

- `.env` is intentionally excluded from the rsync so CI can't overwrite your
  server's real keys. Put `.env` on the server manually once.
- `data/summaries/` is also excluded so redeploys don't wipe the history.
- The first deploy will `pm2 start`; subsequent ones `pm2 reload`.
- Run the workflow manually any time from the **Actions** tab
  (`workflow_dispatch`).
