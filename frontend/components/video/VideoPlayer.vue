<template>
  <div class="bg-black dark:bg-gray-900 rounded-lg overflow-hidden">
    <div class="aspect-video">
      <video
        v-if="src"
        ref="player"
        class="w-full h-full"
        controls
        crossorigin="anonymous"
        @timeupdate="$emit('timeupdate', $event)"
        @ended="$emit('ended')"
        @loadedmetadata="onLoadedMetadata"
      >
        <source :key="src" :src="src" type="video/mp4">
        Your browser does not support the video tag.
      </video>
      <div v-else class="w-full h-full flex items-center justify-center">
        <p class="text-white dark:text-gray-400">{{ placeholderText }}</p>
      </div>
    </div>
    <div
      v-if="src"
      class="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-800 text-gray-200 text-sm"
      data-testid="player-controls"
    >
      <label class="flex items-center gap-1">
        <span class="text-xs uppercase tracking-wide text-gray-400">Speed</span>
        <select
          data-testid="player-speed"
          class="bg-gray-900 border border-gray-700 rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          :value="playbackRate"
          @change="onRateChange"
        >
          <option v-for="r in ALLOWED_RATES" :key="r" :value="r">{{ r }}×</option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import {
  getPlaybackRate,
  setPlaybackRate,
} from '../../utils/playerPreferences.js';

const props = defineProps({
  src: { type: String, default: '' },
  autoplay: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  placeholderText: { type: String, default: 'Select a video to start' },
});

const emit = defineEmits(['timeupdate', 'ended', 'loadedmetadata']);

const player = ref(null);
const ALLOWED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const playbackRate = ref(1);

// Apply the current target time to the player. Safe to call before the
// element is ready — the watcher handles re-application after `loadedmetadata`.
function applySeek() {
  if (!player.value) return;
  const t = Number(props.currentTime);
  if (!Number.isFinite(t)) return;
  if (Math.abs(player.value.currentTime - t) > 0.25) {
    try { player.value.currentTime = t; } catch {}
  }
}

watch(() => props.src, (newSrc, oldSrc) => {
  if (newSrc === oldSrc || !player.value) return;
  player.value.pause();
  player.value.load();
}, { immediate: true });

watch(() => props.currentTime, () => applySeek());

function onLoadedMetadata(event) {
  applySeek();
  if (player.value) {
    player.value.playbackRate = playbackRate.value;
  }
  if (props.autoplay && player.value) {
    try { player.value.play(); } catch {}
  }
  emit('loadedmetadata', event);
}

function onRateChange(event) {
  const v = Number(event.target.value);
  if (!ALLOWED_RATES.includes(v)) return;
  playbackRate.value = v;
  setPlaybackRate(v);
  if (player.value) player.value.playbackRate = v;
}

onMounted(() => {
  playbackRate.value = getPlaybackRate();
  if (player.value) {
    player.value.playbackRate = playbackRate.value;
  }
});

defineExpose({
  play() { if (player.value) player.value.play(); },
  pause() { if (player.value) player.value.pause(); },
  getCurrentTime() { return player.value ? player.value.currentTime : 0; },
  getDuration() { return player.value ? player.value.duration : 0; },
  setCurrentTime(time) { if (player.value) player.value.currentTime = time; },
});
</script>
