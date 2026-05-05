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
        <track
          v-if="subtitleSrc"
          :key="subtitleSrc"
          kind="subtitles"
          :src="subtitleSrc"
          srclang="en"
          label="English"
        >
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
      <button
        v-if="subtitleSrc"
        type="button"
        data-testid="player-cc-toggle"
        class="px-2 py-1 rounded border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        :class="ccOn ? 'border-primary-400 bg-primary-700/30' : 'border-gray-600 hover:border-gray-400'"
        :aria-pressed="ccOn"
        @click="toggleCc"
      >
        CC
      </button>
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
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  getCcDefault,
  setCcDefault,
  getPlaybackRate,
  setPlaybackRate,
} from '../../utils/playerPreferences.js';

const props = defineProps({
  src: { type: String, default: '' },
  autoplay: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  subtitleSrc: { type: String, default: '' },
  placeholderText: { type: String, default: 'Select a video to start' },
});

const emit = defineEmits(['timeupdate', 'ended', 'loadedmetadata']);

const player = ref(null);
const ALLOWED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const playbackRate = ref(1);
const ccOn = ref(false);

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

// When subtitleSrc changes (different video, different track), re-apply CC
// mode. Also wire the textTracks `addtrack` event so we don't race the
// track-element registration: when the new <track> registers asynchronously,
// onTrackAdded re-applies the user's stored preference.
watch(() => props.subtitleSrc, () => {
  applyCcMode();
});

function onLoadedMetadata(event) {
  applySeek();
  if (player.value) {
    player.value.playbackRate = playbackRate.value;
  }
  applyCcMode();
  if (props.autoplay && player.value) {
    try { player.value.play(); } catch {}
  }
  emit('loadedmetadata', event);
}

function onTrackAdded() {
  applyCcMode();
}

function applyCcMode() {
  if (!player.value) return;
  const tracks = player.value.textTracks;
  if (!tracks) return;
  for (let i = 0; i < tracks.length; i += 1) {
    tracks[i].mode = ccOn.value ? 'showing' : 'hidden';
  }
}

function toggleCc() {
  ccOn.value = !ccOn.value;
  setCcDefault(ccOn.value);
  applyCcMode();
}

function onRateChange(event) {
  const v = Number(event.target.value);
  if (!ALLOWED_RATES.includes(v)) return;
  playbackRate.value = v;
  setPlaybackRate(v);
  if (player.value) player.value.playbackRate = v;
}

onMounted(() => {
  ccOn.value = getCcDefault();
  playbackRate.value = getPlaybackRate();
  if (player.value) {
    player.value.playbackRate = playbackRate.value;
    // Catch tracks that register asynchronously (the addtrack event fires
    // after the <track> element is parsed and connected to the video).
    if (player.value.textTracks && typeof player.value.textTracks.addEventListener === 'function') {
      player.value.textTracks.addEventListener('addtrack', onTrackAdded);
    }
  }
});

onBeforeUnmount(() => {
  if (player.value && player.value.textTracks && typeof player.value.textTracks.removeEventListener === 'function') {
    player.value.textTracks.removeEventListener('addtrack', onTrackAdded);
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
