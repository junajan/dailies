<script setup>
import { ref, onMounted, computed } from 'vue';
import PlayerCard from './components/PlayerCard.vue';

const loading = ref(true);
const error = ref(null);
const summary = ref(null);

onMounted(async () => {
  try {
    const res = await fetch('/api/today', { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    summary.value = await res.json();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

const dateLabel = computed(() => {
  if (!summary.value?.date) return '';
  const d = new Date(summary.value.date + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
});

const generatedLabel = computed(() => {
  if (!summary.value?.generatedAt) return '';
  const d = new Date(summary.value.generatedAt);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
});
</script>

<template>
  <main>
    <header class="header">
      <div class="eyebrow" v-if="dateLabel">{{ dateLabel }}</div>
      <h1>Morning Market Briefing</h1>
    </header>

    <section v-if="loading" class="state">Loading…</section>

    <section v-else-if="error" class="state error-state">
      <strong>Couldn't load today's briefing.</strong>
      <p>{{ error }}</p>
    </section>

    <template v-else-if="summary">
      <PlayerCard :script="summary.script" />

      <section class="headlines" v-if="summary.headlines?.length">
        <h2>Top stories</h2>
        <ul>
          <li v-for="(h, i) in summary.headlines" :key="i">{{ h }}</li>
        </ul>
      </section>

      <section class="sources" v-if="summary.sources?.length">
        <h2>Sources</h2>
        <ul>
          <li v-for="s in summary.sources" :key="s.url">
            <a :href="s.url" target="_blank" rel="noopener">{{ s.title }}</a>
            <span class="source-name">· {{ s.source }}</span>
          </li>
        </ul>
      </section>

      <footer class="footer">
        Generated {{ generatedLabel }} · {{ summary.headlines?.length || 0 }} stories
        <span v-if="summary.model"> · {{ summary.model }}</span>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.header {
  text-align: center;
  margin: 20px 0 24px;
}
.eyebrow {
  color: var(--muted);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
h1 {
  font-size: 24px;
  margin: 0;
  font-weight: 700;
}

.state {
  padding: 40px 20px;
  text-align: center;
  color: var(--muted);
  background: var(--card);
  border-radius: 16px;
  border: 1px solid var(--border);
}
.error-state {
  color: #b91c1c;
}
.error-state strong { display: block; margin-bottom: 6px; }

.headlines, .sources {
  margin-top: 28px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--shadow);
}
.headlines h2, .sources h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0 0 12px;
  font-weight: 600;
}
.headlines ul, .sources ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.headlines li {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  line-height: 1.4;
  font-size: 15px;
}
.headlines li:last-child { border-bottom: none; }

.sources li {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.4;
}
.sources li:last-child { border-bottom: none; }
.sources a {
  color: var(--accent);
  text-decoration: none;
}
.sources a:hover { text-decoration: underline; }
.source-name {
  color: var(--muted);
  margin-left: 4px;
}

.footer {
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  padding: 24px 0 8px;
}
</style>
