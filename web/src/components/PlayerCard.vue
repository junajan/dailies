<script setup>
import { computed } from 'vue';
import { useSpeech } from '../composables/useSpeech.js';

const props = defineProps({
  script: { type: String, required: true },
});

const speech = useSpeech();

function onPlayPause() {
  if (speech.isPaused.value) {
    speech.resume();
    return;
  }
  if (speech.isSpeaking.value) {
    speech.pause();
    return;
  }
  speech.play(props.script);
}

const buttonLabel = computed(() => {
  if (!speech.isSpeaking.value) return 'Play';
  return speech.isPaused.value ? 'Resume' : 'Pause';
});

const buttonIcon = computed(() => {
  if (!speech.isSpeaking.value || speech.isPaused.value) return '▶';
  return '❚❚';
});

const pct = computed(() => Math.round(speech.progress.value * 100));
</script>

<template>
  <div class="player">
    <button
      class="play-btn"
      :disabled="!speech.supported || !script"
      :aria-label="buttonLabel"
      @click="onPlayPause"
    >
      <span class="icon">{{ buttonIcon }}</span>
    </button>
    <div class="label">{{ buttonLabel }} · 3-min summary</div>

    <div class="progress" v-if="speech.isSpeaking.value">
      <div class="bar" :style="{ width: pct + '%' }" />
      <div class="progress-text">{{ pct }}%</div>
    </div>

    <div class="voice-row" v-if="speech.englishVoices.value.length > 0">
      <label for="voice">Voice</label>
      <select
        id="voice"
        :value="speech.resolvedVoice.value?.name || ''"
        @change="speech.setVoice($event.target.value)"
      >
        <option
          v-for="v in speech.englishVoices.value"
          :key="v.name"
          :value="v.name"
        >
          {{ v.name }} ({{ v.lang }})
        </option>
      </select>
    </div>

    <div class="error" v-if="speech.error.value">{{ speech.error.value }}</div>
    <div class="warning" v-if="!speech.supported">
      Your browser doesn't support speech synthesis. The script is below.
    </div>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: var(--shadow);
}

.play-btn {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease, background 0.2s ease;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
}
.play-btn:not(:disabled):active { transform: scale(0.96); }
.play-btn:not(:disabled):hover { background: var(--accent-hover); }
.play-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.icon { line-height: 1; margin-left: 4px; }

.label {
  color: var(--muted);
  font-size: 15px;
}

.progress {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.progress .bar {
  height: 6px;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.3s ease;
}
.progress {
  position: relative;
  height: 6px;
  background: var(--border);
  border-radius: 999px;
  overflow: hidden;
}
.progress-text {
  position: absolute;
  right: -38px;
  top: -6px;
  font-size: 12px;
  color: var(--muted);
}

.voice-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  width: 100%;
  justify-content: center;
  flex-wrap: wrap;
}
.voice-row select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text);
  font-size: 13px;
  max-width: 260px;
}

.error, .warning {
  font-size: 13px;
  text-align: center;
  padding: 8px 12px;
  border-radius: 8px;
  width: 100%;
}
.error { color: #b91c1c; background: rgba(185, 28, 28, 0.08); }
.warning { color: var(--muted); background: rgba(100, 116, 139, 0.08); }
</style>
