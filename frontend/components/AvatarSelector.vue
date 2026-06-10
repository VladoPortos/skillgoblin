<template>
  <div class="avatar-selector">
    <!-- Avatar Preview (only shown if hidePreview is false) -->
    <div v-if="!hidePreview" ref="previewContainer" class="avatar-preview mb-4 flex justify-center">
      <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
        <Beanhead v-bind="avatar" />
      </div>
    </div>

    <!-- Floating Preview (appears when scrolled) -->
    <div v-show="isPreviewFloating" class="floating-preview">
      <div class="w-16 h-16 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center shadow-lg">
        <Beanhead v-bind="avatar" />
      </div>
    </div>

    <!-- Avatar Customization Options -->
    <div class="avatar-options space-y-4">
      <!-- Randomize Button (centered at top) -->
      <div class="flex justify-center mb-2">
        <button 
          type="button"
          @click.prevent="randomizeAvatar"
          :disabled="isRandomizing"
          class="px-4 py-2 rounded-md"
          :class="isRandomizing ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'"
        >
          {{ isRandomizing ? 'Randomizing...' : 'Randomize' }}
        </button>
      </div>
      
      <!-- Body Type -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Body Type</h3>
        <div class="flex gap-2">
          <button 
            type="button"
            :id="'body-type-' + 'chest'"
            :aria-label="'Select male body type'"
            @click.prevent="avatar.body = 'chest'"
            class="p-1 sm:p-2 rounded-md flex-1 text-sm sm:text-base"
            :class="avatar.body === 'chest' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            Male
          </button>
          <button 
            type="button"
            :id="'body-type-' + 'breasts'"
            :aria-label="'Select female body type'"
            @click.prevent="avatar.body = 'breasts'"
            class="p-1 sm:p-2 rounded-md flex-1 text-sm sm:text-base"
            :class="avatar.body === 'breasts' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            Female
          </button>
        </div>
      </div>
      
      <!-- Skin -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Skin</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="skin in skinColors" 
            :key="skin"
            type="button"
            :id="'skin-' + skin"
            :aria-label="'Select ' + skin + ' skin tone'"
            @click.prevent="avatar.skin = skin"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.skin === skin ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ skin }}
          </button>
        </div>
      </div>

      <!-- Eyes -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Eyes</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="eye in eyeStyles" 
            :key="eye"
            type="button"
            :id="'eye-' + eye"
            :aria-label="'Select ' + eye.replace('-eyes', '') + ' eye style'"
            @click.prevent="avatar.eye = eye"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.eye === eye ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ eye.replace('-eyes', '') }}
          </button>
        </div>
      </div>

      <!-- Eyebrows -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Eyebrows</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="eyebrow in eyebrowOptions" 
            :key="eyebrow"
            type="button"
            :id="'eyebrow-' + eyebrow"
            :aria-label="'Select ' + eyebrow + ' eyebrow style'"
            @click.prevent="avatar.eyebrows = eyebrow"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.eyebrows === eyebrow ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ eyebrow }}
          </button>
        </div>
      </div>

      <!-- Mouth -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Mouth</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="mouth in mouthStyles" 
            :key="mouth"
            type="button"
            :id="'mouth-' + mouth"
            :aria-label="'Select ' + mouth + ' mouth style'"
            @click.prevent="avatar.mouth = mouth"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.mouth === mouth ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ mouth }}
          </button>
        </div>
      </div>

      <!-- Lip Color (only show if mouth is 'lips') -->
      <div v-if="avatar.mouth === 'lips'" class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Lip Color</h3>
        <div class="flex justify-center gap-2">
          <button 
            v-for="color in lipColors" 
            :key="color"
            type="button"
            :id="'lip-color-' + color"
            :aria-label="'Select ' + color + ' lip color'"
            @click.prevent="avatar.lipColor = color"
            class="w-8 h-8 rounded-full border-2"
            :class="[
              getLipColorClass(color),
              avatar.lipColor === color ? 'border-blue-500' : 'border-transparent'
            ]"
            :title="color"
          ></button>
        </div>
      </div>

      <!-- Hair -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Hair</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="hair in hairStyles" 
            :key="hair"
            type="button"
            :id="'hair-' + hair"
            :aria-label="'Select ' + hair + ' hair style'"
            @click.prevent="avatar.hair = hair"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.hair === hair ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ hair }}
          </button>
        </div>
      </div>

      <!-- Hair Color (only show if hair is not 'none') -->
      <div v-if="avatar.hair !== 'none'" class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Hair Color</h3>
        <div class="flex justify-center gap-2">
          <button 
            v-for="color in hairColors" 
            :key="color"
            type="button"
            :id="'hair-color-' + color"
            :aria-label="'Select ' + color + ' hair color'"
            @click.prevent="avatar.hairColor = color"
            class="w-8 h-8 rounded-full border-2"
            :class="[
              getHairColorClass(color),
              avatar.hairColor === color ? 'border-blue-500' : 'border-transparent'
            ]"
            :title="color"
          ></button>
        </div>
      </div>

      <!-- Facial Hair -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Facial Hair</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="facialHair in facialHairStyles" 
            :key="facialHair"
            type="button"
            :id="'facial-hair-' + facialHair"
            :aria-label="'Select ' + facialHair + ' facial hair style'"
            @click.prevent="avatar.facialHair = facialHair"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.facialHair === facialHair ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ facialHair }}
          </button>
        </div>
      </div>

      <!-- Clothing -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Clothing</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="clothing in clothingStyles" 
            :key="clothing"
            type="button"
            :id="'clothing-' + clothing"
            :aria-label="'Select ' + clothing + ' clothing style'"
            @click.prevent="avatar.clothing = clothing"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.clothing === clothing ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ clothing }}
          </button>
        </div>
      </div>

      <!-- Clothing Color -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Clothing Color</h3>
        <div class="flex justify-center gap-2">
          <button 
            v-for="color in clothingColors" 
            :key="color"
            type="button"
            :id="'clothing-color-' + color"
            :aria-label="'Select ' + color + ' clothing color'"
            @click.prevent="avatar.clothingColor = color"
            class="w-8 h-8 rounded-full border-2"
            :class="[
              getClothingColorClass(color),
              avatar.clothingColor === color ? 'border-blue-500' : 'border-transparent'
            ]"
            :title="color"
          ></button>
        </div>
      </div>

      <!-- Accessories -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Accessories</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="accessory in accessoryStyles" 
            :key="accessory"
            type="button"
            :id="'accessory-' + accessory"
            :aria-label="'Select ' + (accessory === 'none' ? 'none' : accessory.replace('-glasses', '')) + ' accessory'"
            @click.prevent="avatar.accessory = accessory"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.accessory === accessory ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ accessory === 'none' ? 'none' : accessory.replace('-glasses', '') }}
          </button>
        </div>
      </div>

      <!-- Hat -->
      <div class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Hat</h3>
        <div class="grid grid-cols-3 gap-2">
          <button 
            v-for="hat in hatStyles" 
            :key="hat"
            type="button"
            :id="'hat-' + hat"
            :aria-label="'Select ' + hat + ' hat style'"
            @click.prevent="avatar.hat = hat"
            class="p-1 sm:p-2 rounded-md text-sm sm:text-base"
            :class="avatar.hat === hat ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'"
          >
            {{ hat }}
          </button>
        </div>
      </div>

      <!-- Hat Color (only show if hat is not 'none') -->
      <div v-if="avatar.hat !== 'none'" class="option-group">
        <h3 class="block text-sm font-medium text-gray-300 mb-1">Hat Color</h3>
        <div class="flex justify-center gap-2">
          <button 
            v-for="color in clothingColors" 
            :key="color"
            type="button"
            :id="'hat-color-' + color"
            :aria-label="'Select ' + color + ' hat color'"
            @click.prevent="avatar.hatColor = color"
            class="w-8 h-8 rounded-full border-2"
            :class="[
              getClothingColorClass(color),
              avatar.hatColor === color ? 'border-blue-500' : 'border-transparent'
            ]"
            :title="color"
          ></button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue';
import { Beanhead } from 'beanheads-vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  hidePreview: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue']);

// Default avatar configuration
const defaultAvatar = {
  skin: 'light',
  body: 'chest', // Default to male
  eye: 'normal-eyes',
  withLashes: false,
  eyebrows: 'normal',
  mouth: 'grin',
  lipColor: 'red',
  facialHair: 'none',
  hair: 'none',
  hairColor: 'brown',
  clothing: 'naked',
  clothingColor: 'white',
  clothingGraphic: 'none',
  hat: 'none',
  hatColor: 'white',
  accessory: 'none',
  faceMask: false,
  faceMaskColor: 'white'
};

// Avatar configuration
const avatar = reactive(props.modelValue ? 
  // Try to parse existing avatar data
  (() => {
    try {
      return { ...defaultAvatar, ...JSON.parse(props.modelValue) };
    } catch (e) {
      console.error('Failed to parse avatar data:', e);
      return { ...defaultAvatar };
    }
  })() 
  : 
  // Use default avatar if no data provided
  { ...defaultAvatar }
);
const previewContainer = ref(null);
const isPreviewFloating = ref(false);

// Observes the component's own preview element (works in any scroll
// container — modal or page) and shows the floating preview whenever the
// main one is scrolled out of view.
let previewObserver = null;

const setupPreviewObserver = () => {
  if (!previewContainer.value || typeof IntersectionObserver === 'undefined') return;
  previewObserver = new IntersectionObserver(([entry]) => {
    isPreviewFloating.value = !entry.isIntersecting;
  });
  previewObserver.observe(previewContainer.value);
};

// Lifecycle hooks
onMounted(() => {
  // Only randomize on mount if no avatar data was provided
  if (!props.modelValue) {
    randomizeAvatar();
  }

  setupPreviewObserver();
});

onBeforeUnmount(() => {
  if (previewObserver) {
    previewObserver.disconnect();
    previewObserver = null;
  }
});

// Watch for changes and emit the updated avatar
watch(avatar, () => {
  emit('update:modelValue', JSON.stringify(avatar));
}, { deep: true });

// Option lists — shared by the template buttons and the randomizer.
const skinColors = ['light', 'yellow', 'brown', 'dark', 'red', 'black'];
const hairStyles = ['none', 'afro', 'balding', 'bob', 'bun', 'buzz', 'long', 'pixie', 'short'];
const hairColors = ['blonde', 'orange', 'black', 'white', 'brown', 'blue', 'pink'];
const eyeStyles = ['content-eyes', 'dizzy-eyes', 'happy-eyes', 'heart-eyes', 'left-twitch-eyes', 'normal-eyes', 'simple-eyes', 'squint-eyes', 'wink'];
// The randomizer deliberately sticks to 'normal' eyebrows; the UI offers more.
const eyebrowStyles = ['normal'];
const eyebrowOptions = ['normal', 'left-lowered', 'angry', 'concerned'];
const mouthStyles = ['grin', 'lips', 'sad', 'serious', 'open', 'tongue'];
const lipColors = ['red', 'purple', 'pink', 'turquoise', 'green'];
const facialHairStyles = ['none', 'stubble', 'medium-beard'];
const clothingStyles = ['naked', 'dress', 'dress-shirt', 'shirt', 'tank-top', 'v-neck'];
const clothingColors = ['white', 'blue', 'black', 'green', 'red'];
const accessoryStyles = ['none', 'round-glasses', 'tiny-glasses', 'shades'];
const hatStyles = ['none', 'beanie', 'turban'];

// Use a ref to track randomization state
const isRandomizing = ref(false);

function getRandomAvatarData() {
  // Create a new avatar object with random values
  return {
    body: Math.random() > 0.5 ? 'chest' : 'breasts',
    skin: skinColors[Math.floor(Math.random() * skinColors.length)],
    hair: hairStyles[Math.floor(Math.random() * hairStyles.length)],
    hairColor: hairColors[Math.floor(Math.random() * hairColors.length)],
    eye: eyeStyles[Math.floor(Math.random() * eyeStyles.length)],
    eyebrows: eyebrowStyles[Math.floor(Math.random() * eyebrowStyles.length)],
    withLashes: Math.random() > 0.5,
    mouth: mouthStyles[Math.floor(Math.random() * mouthStyles.length)],
    lipColor: lipColors[Math.floor(Math.random() * lipColors.length)],
    facialHair: facialHairStyles[Math.floor(Math.random() * facialHairStyles.length)],
    clothing: clothingStyles[Math.floor(Math.random() * clothingStyles.length)],
    clothingColor: clothingColors[Math.floor(Math.random() * clothingColors.length)],
    accessory: accessoryStyles[Math.floor(Math.random() * accessoryStyles.length)],
    faceMask: false,
    faceMaskColor: 'white',
    hat: hatStyles[Math.floor(Math.random() * hatStyles.length)],
    hatColor: clothingColors[Math.floor(Math.random() * clothingColors.length)],
    clothingGraphic: 'none'
  };
}

// Synchronous randomization — the deep watcher above emits the update once.
const randomizeAvatar = () => {
  if (isRandomizing.value) return;
  isRandomizing.value = true;
  Object.assign(avatar, getRandomAvatarData());
  isRandomizing.value = false;
};

defineExpose({ randomize: randomizeAvatar });

// Color class helpers
const getHairColorClass = (color) => {
  return {
    'blonde': 'bg-[#FEDC58]',
    'orange': 'bg-[#D96E27]',
    'black': 'bg-[#592d3d]',
    'white': 'bg-white',
    'brown': 'bg-[#A56941]',
    'blue': 'bg-[#85c5e5]',
    'pink': 'bg-[#D69AC7]'
  }[color] || 'bg-gray-300';
};

const getLipColorClass = (color) => {
  return {
    'red': 'bg-red-400',
    'purple': 'bg-purple-400',
    'pink': 'bg-pink-300',
    'turquoise': 'bg-cyan-300',
    'green': 'bg-green-300'
  }[color] || 'bg-gray-300';
};

const getClothingColorClass = (color) => {
  const classes = {
    'white': 'bg-gray-100',
    'blue': 'bg-blue-500',
    'black': 'bg-gray-900',
    'green': 'bg-green-500',
    'red': 'bg-red-500'
  };
  return classes[color] || 'bg-gray-100';
};
</script>

<style scoped>
.avatar-selector {
  width: 100%;
}

.avatar-preview {
  position: relative;
}

.option-group {
  margin-bottom: 1rem;
}

.color-option {
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.color-option.selected {
  transform: scale(1.1);
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
}

/* Remove any internal scrollbars */
.avatar-options {
  overflow: visible;
}

/* Fix for double scrollbars */
::-webkit-scrollbar {
  display: none;
}
</style>
