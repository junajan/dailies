import { ref, computed, onUnmounted } from 'vue';

// Web Speech API wrapper.
// - Loads voices (handles the async `voiceschanged` quirk, notably on iOS/Chrome).
// - Splits long text into sentences so iOS Safari doesn't cut off mid-utterance
//   (known iOS bug: utterances longer than ~15s of speech get chopped).
// - Persists the user's voice choice in localStorage.
// - Exposes play / pause / resume / stop + reactive state.

const STORAGE_KEY = 'daily-summary.voiceName';
const PREFERRED_VOICES = [
  'Google UK English Female',
  'Google UK English Male',
  'Google US English',
  'Microsoft Aria Online (Natural) - English (United States)',
  'Microsoft Guy Online (Natural) - English (United States)',
  'Samantha',
  'Daniel',
  'Alex',
];

export function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const voices = ref([]);
  const voicesReady = ref(false);
  const selectedVoiceName = ref(
    (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || ''
  );
  const isSpeaking = ref(false);
  const isPaused = ref(false);
  const progress = ref(0); // 0..1, based on chunk index
  const error = ref(null);

  // --- Voice loading ---
  function loadVoices() {
    if (!supported) return;
    const list = window.speechSynthesis.getVoices();
    voices.value = list;
    voicesReady.value = list.length > 0;
  }
  let voicePollId = null;
  if (supported) {
    loadVoices();
    // Chrome/iOS populate voices asynchronously
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    // Also poll a few times because some iOS versions never fire voiceschanged
    let tries = 0;
    voicePollId = setInterval(() => {
      if (voicesReady.value || ++tries > 10) {
        clearInterval(voicePollId);
        voicePollId = null;
        return;
      }
      loadVoices();
    }, 300);
  }

  const englishVoices = computed(() =>
    voices.value.filter(v => v.lang?.toLowerCase().startsWith('en'))
  );

  const resolvedVoice = computed(() => {
    const list = voices.value;
    if (!list.length) return null;

    // Explicit user choice
    if (selectedVoiceName.value) {
      const hit = list.find(v => v.name === selectedVoiceName.value);
      if (hit) return hit;
    }
    // Preference ladder
    for (const name of PREFERRED_VOICES) {
      const hit = list.find(v => v.name === name);
      if (hit) return hit;
    }
    // Any English voice — prefer en-GB to match the default
    const en =
      list.find(v => v.lang?.toLowerCase().startsWith('en-gb')) ||
      list.find(v => v.lang?.toLowerCase().startsWith('en-us')) ||
      list.find(v => v.lang?.toLowerCase().startsWith('en'));
    return en || list[0];
  });

  function setVoice(name) {
    selectedVoiceName.value = name;
    try { localStorage.setItem(STORAGE_KEY, name); } catch { /* ignore */ }
  }

  // --- Sentence chunking ---
  // Split on sentence terminators while keeping them, then group short fragments.
  function chunkText(text, maxLen = 180) {
    const pieces = text
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s+/);
    const chunks = [];
    let buf = '';
    for (const p of pieces) {
      if ((buf + ' ' + p).trim().length > maxLen && buf) {
        chunks.push(buf.trim());
        buf = p;
      } else {
        buf = buf ? `${buf} ${p}` : p;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
    return chunks;
  }

  // --- Playback ---
  // We do NOT use speechSynthesis.pause()/resume() because they are broken
  // in most browsers (Chrome kills paused utterances after ~15s, mobile
  // browsers often ignore resume entirely). Instead we cancel on pause and
  // restart from the saved chunk index on resume.
  let queue = [];
  let queueIndex = 0;
  let currentUtterance = null;
  let stopping = false;
  let lastText = '';

  function reset() {
    stopping = false;
    queue = [];
    queueIndex = 0;
    currentUtterance = null;
    isSpeaking.value = false;
    isPaused.value = false;
    progress.value = 0;
    error.value = null;
    lastText = '';
  }

  function speakNext() {
    if (stopping || queueIndex >= queue.length) {
      if (!stopping) {
        // Finished naturally — full reset
        isSpeaking.value = false;
        isPaused.value = false;
        progress.value = 1;
      }
      stopping = false;
      currentUtterance = null;
      return;
    }
    const chunk = queue[queueIndex];
    const u = new SpeechSynthesisUtterance(chunk);
    const voice = resolvedVoice.value;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'en-US';
    }
    u.rate = 1.0;
    u.pitch = 1.0;

    u.onend = () => {
      if (stopping) return;
      queueIndex += 1;
      progress.value = queueIndex / queue.length;
      speakNext();
    };
    u.onerror = e => {
      // Safari fires 'canceled' on stop/pause — not a real error
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      console.warn('[speech] error:', e.error);
      error.value = e.error || 'speech error';
      reset();
    };

    currentUtterance = u;
    window.speechSynthesis.speak(u);
  }

  function play(text) {
    if (!supported) {
      error.value = 'Speech synthesis not supported in this browser';
      return;
    }
    cancelSpeech(); // cancel any in-flight speech

    // iOS requires the first speak() to happen inside a user gesture — play() is
    // expected to be called from a click handler, so we just proceed directly.
    lastText = text;
    queue = chunkText(text);
    if (!queue.length) {
      error.value = 'Nothing to speak';
      return;
    }
    queueIndex = 0;
    progress.value = 0;
    isSpeaking.value = true;
    isPaused.value = false;
    error.value = null;
    speakNext();
  }

  function pause() {
    if (!supported || !isSpeaking.value || isPaused.value) return;
    // Cancel current speech but keep queue + queueIndex so we can resume
    stopping = true;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    stopping = false;
    currentUtterance = null;
    isPaused.value = true;
  }

  function resume() {
    if (!supported || !isPaused.value) return;
    // Restart from the saved chunk index
    isPaused.value = false;
    error.value = null;
    speakNext();
  }

  function cancelSpeech() {
    if (!supported) return;
    stopping = true;
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    stopping = false;
    currentUtterance = null;
  }

  function stop() {
    cancelSpeech();
    queue = [];
    queueIndex = 0;
    isSpeaking.value = false;
    isPaused.value = false;
    progress.value = 0;
    error.value = null;
    lastText = '';
  }

  onUnmounted(() => {
    stop();
    if (voicePollId != null) clearInterval(voicePollId);
    if (supported) {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    }
  });

  return {
    supported,
    voices,
    englishVoices,
    resolvedVoice,
    selectedVoiceName,
    setVoice,
    isSpeaking,
    isPaused,
    progress,
    error,
    play,
    pause,
    resume,
    stop,
  };
}
