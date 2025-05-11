<template>
  <div class="bg-black dark:bg-gray-900 aspect-video rounded-lg overflow-hidden">
    <video
      v-if="src"
      ref="player"
      class="w-full h-full"
      controls
      @timeupdate="$emit('timeupdate', $event)"
      @ended="$emit('ended')"
      @loadedmetadata="$emit('loadedmetadata', $event)"
    >
      <source :key="src" :src="src" type="video/mp4">
      Your browser does not support the video tag.
    </video>
    <div v-else class="w-full h-full flex items-center justify-center">
      <p class="text-white dark:text-gray-400">{{ placeholderText }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

// Props for the component
const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  autoplay: {
    type: Boolean,
    default: false
  },
  currentTime: {
    type: Number,
    default: 0
  },
  placeholderText: {
    type: String,
    default: 'Select a video to start'
  }
});

// Define emitted events
const emit = defineEmits(['timeupdate', 'ended', 'loadedmetadata']);

// Reference to the video element
const player = ref(null);

// Watch for src changes to reset player
watch(() => props.src, (newSrc, oldSrc) => {
  if (newSrc !== oldSrc && player.value) {
    // Reset the player when source changes
    player.value.pause();
    
    // Set current time based on prop after video metadata is loaded
    player.value.addEventListener('loadedmetadata', () => {
      // Check if player.value still exists, as component could be unmounted or src changed again rapidly
      if (player.value) {
        // Set current time if provided
        if (props.currentTime > 0) {
          player.value.currentTime = props.currentTime;
        } else {
          player.value.currentTime = 0;
        }
        
        // Autoplay if requested
        if (props.autoplay) {
          player.value.play();
        }
      }
    }, { once: true });

    // Crucially, tell the HTML5 video player to load the new source.
    player.value.load();

  }
}, { immediate: true });

// Methods that can be called from parent component
defineExpose({
  play() {
    if (player.value) player.value.play();
  },
  pause() {
    if (player.value) player.value.pause();
  },
  getCurrentTime() {
    return player.value ? player.value.currentTime : 0;
  },
  getDuration() {
    return player.value ? player.value.duration : 0;
  },
  setCurrentTime(time) {
    if (player.value) player.value.currentTime = time;
  }
});
</script>
