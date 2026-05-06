<template>
  <div class="bg-black dark:bg-gray-900 rounded-lg overflow-hidden">
    <div class="aspect-video relative">
      <video
        v-if="src"
        ref="player"
        class="w-full h-full"
        controls
        crossorigin="anonymous"
        @timeupdate="$emit('timeupdate', $event)"
        @ended="$emit('ended')"
        @pause="$emit('pause')"
        @seeked="$emit('seeked')"
        @waiting="onWaiting"
        @playing="onPlaying"
        @canplay="onCanPlay"
        @error="onError"
        @loadstart="onLoadStart"
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

      <!-- Buffering spinner: visible only when the player is stalled waiting
           for data AND there's no terminal error. The native browser
           controls already show a tiny spinner in some implementations, but
           it's inconsistent and easy to miss against a dark frame; this
           overlay is the explicit "we're loading, don't worry" signal. -->
      <div
        v-if="src && isBuffering && !errorState"
        class="pointer-events-none absolute inset-0 flex items-center justify-center"
        data-testid="player-buffering"
        aria-hidden="true"
      >
        <span class="inline-block h-12 w-12 rounded-full border-4 border-white/30 border-t-white animate-spin"></span>
      </div>

      <!-- Error overlay: covers the entire player area with a retry path so
           the user isn't staring at a frozen frame after a network blip
           or a missing file. The Retry button re-runs <video>.load(),
           which fires loadstart/canplay if the resource recovered. -->
      <div
        v-if="src && errorState"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white text-center px-4"
        data-testid="player-error"
        role="alert"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p class="text-sm font-medium">Could not load this video.</p>
        <button
          type="button"
          data-testid="player-retry"
          class="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 text-sm"
          @click="retryLoad"
        >Retry</button>
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
      <!-- Picture-in-Picture: hidden when the browser doesn't support it
           (Firefox without the toolbar API exposed, anything mobile in iOS
           Safari < 14, etc.). Toggling pulls the video into a floating
           window the user can drag over other tabs. -->
      <button
        v-if="pipSupported"
        type="button"
        data-testid="player-pip"
        class="inline-flex items-center gap-1 px-2 py-1 rounded border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 text-xs"
        :class="isPipActive ? 'border-primary-400 bg-primary-700/30' : 'border-gray-600 hover:border-gray-400'"
        :aria-pressed="isPipActive"
        :title="isPipActive ? 'Exit picture-in-picture' : 'Picture-in-picture'"
        @click="togglePip"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor" stroke="none" />
        </svg>
        PiP
      </button>
      <button
        type="button"
        data-testid="start-from-beginning"
        class="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-600 hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 text-xs"
        title="Restart this video from the beginning"
        @click="$emit('start-from-beginning')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
        Start from beginning
      </button>
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

const emit = defineEmits(['timeupdate', 'ended', 'pause', 'seeked', 'loadedmetadata', 'start-from-beginning']);

const player = ref(null);
const ALLOWED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const playbackRate = ref(1);
const ccOn = ref(false);
// Buffering / error / PiP state. All client-side; survives only as long as
// the player is mounted. The buffering flag turns off on `playing`/`canplay`
// (the standard recovery signals) and the error flag turns off on a
// successful retry (loadstart→canplay), so a transient stall doesn't keep
// chrome stuck visible.
const isBuffering = ref(false);
const errorState = ref(null);
const isPipActive = ref(false);
const pipSupported = ref(false);
// Track which textTracks list we've registered the addtrack listener on,
// so we attach exactly once and detach the same instance on unmount even
// if the underlying <video> remounts.
let attachedTextTracks = null;

function attachTrackListener(videoEl) {
  if (!videoEl || !videoEl.textTracks) return;
  if (attachedTextTracks === videoEl.textTracks) return;
  // Detach any previous binding before re-attaching to a new <video>.
  if (attachedTextTracks && typeof attachedTextTracks.removeEventListener === 'function') {
    try { attachedTextTracks.removeEventListener('addtrack', onTrackAdded); } catch {}
  }
  if (typeof videoEl.textTracks.addEventListener === 'function') {
    videoEl.textTracks.addEventListener('addtrack', onTrackAdded);
    attachedTextTracks = videoEl.textTracks;
  }
}

function detachTrackListener() {
  if (attachedTextTracks && typeof attachedTextTracks.removeEventListener === 'function') {
    try { attachedTextTracks.removeEventListener('addtrack', onTrackAdded); } catch {}
  }
  attachedTextTracks = null;
}

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
  // Reset surface state for the incoming src so the previous video's error
  // overlay or stale spinner doesn't bleed into the new lesson.
  errorState.value = null;
  isBuffering.value = false;
  player.value.pause();
  player.value.load();
}, { immediate: true });

// Attach the addtrack listener once the <video> element actually mounts.
// The element is gated by `v-if="src"`, so it appears only after the parent
// supplies a real src — onMounted of this component fires earlier than that
// on the course-detail page, so onMounted alone misses the binding.
watch(player, (newPlayer) => {
  if (newPlayer) {
    attachTrackListener(newPlayer);
    attachPipListeners(newPlayer);
    // Re-apply current CC mode in case tracks were already attached
    // synchronously (e.g. when src + subtitleSrc both render in the same tick).
    applyCcMode();
  } else {
    detachTrackListener();
    detachPipListeners();
    isPipActive.value = false;
  }
});

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

// HTMLMediaElement event handlers driving the buffering / error overlays.
function onWaiting() {
  if (!errorState.value) isBuffering.value = true;
}
function onPlaying() {
  isBuffering.value = false;
  errorState.value = null;
}
function onCanPlay() {
  isBuffering.value = false;
  // canplay after a retry → the asset recovered, drop the error overlay so
  // the controls become reachable again.
  if (errorState.value) errorState.value = null;
}
function onLoadStart() {
  // A fresh load() (initial src or retry) — clear the previous error so
  // the user isn't told the new attempt has already failed.
  errorState.value = null;
}
function onError() {
  isBuffering.value = false;
  errorState.value = 'load-failed';
}
function retryLoad() {
  if (!player.value) return;
  errorState.value = null;
  // load() re-fires loadstart → metadata → canplay against the same src,
  // which is enough to recover from a transient network blip. For a truly
  // missing file the error event fires again and the overlay reappears.
  try { player.value.load(); } catch {}
}

// Picture-in-Picture wiring. The button is hidden entirely when the
// browser hasn't shipped the API; the events fire when the user enters PiP
// either via our button or the browser's native context menu.
function onEnterPip() { isPipActive.value = true; }
function onLeavePip() { isPipActive.value = false; }

function attachPipListeners(videoEl) {
  if (!videoEl) return;
  videoEl.addEventListener('enterpictureinpicture', onEnterPip);
  videoEl.addEventListener('leavepictureinpicture', onLeavePip);
}
function detachPipListeners() {
  if (!player.value) return;
  try {
    player.value.removeEventListener('enterpictureinpicture', onEnterPip);
    player.value.removeEventListener('leavepictureinpicture', onLeavePip);
  } catch {}
}

async function togglePip() {
  if (!player.value) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (typeof player.value.requestPictureInPicture === 'function') {
      await player.value.requestPictureInPicture();
    }
  } catch (err) {
    // User-cancelled or PiP-blocked-by-policy — silent is the right move
    // here; the alternative is a browser-level error dialog the user
    // already sees.
    console.warn('[player] PiP toggle failed:', err?.message || err);
  }
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
  // Feature-detect PiP up front. Hiding the button entirely on unsupported
  // browsers is friendlier than showing one that fails when clicked.
  pipSupported.value = typeof document !== 'undefined'
    && !!document.pictureInPictureEnabled
    && typeof HTMLVideoElement !== 'undefined'
    && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function';
  // The addtrack listener is wired in the player ref watcher above so it
  // attaches reliably when the <video> element mounts (which can be after
  // this hook on the course-detail page where src starts empty).
  if (player.value) {
    player.value.playbackRate = playbackRate.value;
  }
});

onBeforeUnmount(() => {
  detachTrackListener();
  detachPipListeners();
});

defineExpose({
  play() { if (player.value) player.value.play(); },
  pause() { if (player.value) player.value.pause(); },
  getCurrentTime() { return player.value ? player.value.currentTime : 0; },
  getDuration() { return player.value ? player.value.duration : 0; },
  setCurrentTime(time) { if (player.value) player.value.currentTime = time; },
  // Used by the parent to reject stale loadedmetadata events: if a second
  // playVideo lands before the first src finished loading, the now-superseded
  // metadata event would otherwise clear the transition gate against the
  // wrong duration. The parent compares this against the src it asked for.
  getCurrentSrc() { return player.value ? player.value.currentSrc : ''; },
});
</script>
