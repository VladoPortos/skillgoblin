<template>
  <div class="avatar-selector">
    <!-- Avatar Preview (only shown if hidePreview is false) -->
    <div v-if="!hidePreview" ref="previewContainer" class="avatar-preview mb-4 flex justify-center">
      <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
        <!-- Show loading spinner when avatar is being randomized -->
        <div v-if="isAvatarLoading" class="flex items-center justify-center w-full h-full">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
        <!-- Show avatar when not loading -->
        <Beanhead 
          v-else
          :skin="avatar.skin"
          :body="avatar.body"
          :eye="avatar.eye"
          :with-lashes="avatar.withLashes"
          :eyebrows="avatar.eyebrows"
          :mouth="avatar.mouth"
          :lip-color="avatar.lipColor"
          :facial-hair="avatar.facialHair"
          :hair="avatar.hair"
          :hair-color="avatar.hairColor"
          :clothing="avatar.clothing"
          :clothing-color="avatar.clothingColor"
          :clothing-graphic="avatar.clothingGraphic"
          :hat="avatar.hat"
          :hat-color="avatar.hatColor"
          :accessory="avatar.accessory"
          :face-mask="avatar.faceMask"
          :face-mask-color="avatar.faceMaskColor"
        />
      </div>
    </div>

    <!-- Floating Preview (appears when scrolled) -->
    <div v-show="isPreviewFloating && !isAvatarLoading" class="floating-preview">
      <div class="w-16 h-16 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center shadow-lg">
        <Beanhead 
          :skin="avatar.skin"
          :body="avatar.body"
          :eye="avatar.eye"
          :with-lashes="avatar.withLashes"
          :eyebrows="avatar.eyebrows"
          :mouth="avatar.mouth"
          :lip-color="avatar.lipColor"
          :facial-hair="avatar.facialHair"
          :hair="avatar.hair"
          :hair-color="avatar.hairColor"
          :clothing="avatar.clothing"
          :clothing-color="avatar.clothingColor"
          :clothing-graphic="avatar.clothingGraphic"
          :hat="avatar.hat"
          :hat-color="avatar.hatColor"
          :accessory="avatar.accessory"
          :face-mask="avatar.faceMask"
          :face-mask-color="avatar.faceMaskColor"
        />
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
            v-for="skin in ['light', 'yellow', 'brown', 'dark', 'red', 'black']" 
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
            v-for="eye in ['content-eyes', 'dizzy-eyes', 'happy-eyes', 'heart-eyes', 'left-twitch-eyes', 'normal-eyes', 'simple-eyes', 'squint-eyes', 'wink']" 
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
            v-for="eyebrow in ['normal', 'left-lowered', 'angry', 'concerned']" 
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
            v-for="mouth in ['grin', 'lips', 'sad', 'serious', 'open', 'tongue']" 
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
            v-for="color in ['red', 'purple', 'pink', 'turquoise', 'green']" 
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
            v-for="hair in ['none', 'afro', 'balding', 'bob', 'bun', 'buzz', 'long', 'pixie', 'short']" 
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
            v-for="color in ['blonde', 'orange', 'black', 'white', 'brown', 'blue', 'pink']" 
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
            v-for="facialHair in ['none', 'stubble', 'medium-beard']" 
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
            v-for="clothing in ['naked', 'dress', 'dress-shirt', 'shirt', 'tank-top', 'v-neck']" 
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
            v-for="color in ['white', 'blue', 'black', 'green', 'red']" 
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
            v-for="accessory in ['none', 'round-glasses', 'tiny-glasses', 'shades']" 
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
            v-for="hat in ['none', 'beanie', 'turban']" 
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
            v-for="color in ['white', 'blue', 'black', 'green', 'red']" 
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
import { ref, reactive, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
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
  clothing: 'none',
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

// Lifecycle hooks
onMounted(() => {
  // Only randomize on mount if no avatar data was provided
  if (!props.modelValue) {
    randomizeAvatar();
  }
  
  // Set up scroll observer for preview
  setupScrollObserver();
});

onBeforeUnmount(() => {
  // Remove scroll event listener
  const scrollContainer = document.querySelector('.avatar-customization-container');
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', checkPreviewVisibility);
  }
});

// Check if the preview is visible in the viewport
const checkPreviewVisibility = () => {
  if (!previewContainer.value) return;
  
  const rect = previewContainer.value.getBoundingClientRect();
  const scrollContainer = document.querySelector('.avatar-customization-container');
  
  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    // If the preview is above the visible part of the container, show the floating preview
    isPreviewFloating.value = rect.bottom < containerRect.top || rect.top < containerRect.top;
  }
};

// Watch for changes and emit the updated avatar
watch(avatar, () => {
  emit('update:modelValue', JSON.stringify(avatar));
}, { deep: true });

// Randomize avatar function
const skinColors = ['light', 'yellow', 'brown', 'dark', 'red', 'black'];
const hairStyles = ['none', 'afro', 'balding', 'bob', 'bun', 'buzz', 'long', 'pixie', 'short'];
const hairColors = ['blonde', 'orange', 'black', 'white', 'brown', 'blue', 'pink'];
const eyeStyles = ['content-eyes', 'dizzy-eyes', 'happy-eyes', 'heart-eyes', 'left-twitch-eyes', 'normal-eyes', 'simple-eyes', 'squint-eyes', 'wink'];
const eyebrowStyles = ['normal'];
const mouthStyles = ['grin', 'lips', 'sad', 'serious', 'open', 'tongue'];
const lipColors = ['red', 'purple', 'pink', 'turquoise', 'green'];
const facialHairStyles = ['none', 'stubble', 'medium-beard'];
const clothingStyles = ['none', 'naked', 'dress', 'dress-shirt', 'shirt', 'tank-top', 'v-neck'];
const clothingColors = ['white', 'blue', 'black', 'green', 'red'];
const accessoryStyles = ['none', 'round-glasses', 'tiny-glasses', 'shades'];

// Use a ref to track randomization state
const isRandomizing = ref(false);

// Create a completely separate randomization function that doesn't rely on Vue's reactivity
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
    hat: ['none', 'beanie', 'turban'][Math.floor(Math.random() * 3)],
    hatColor: ['white', 'blue', 'black', 'green', 'red'][Math.floor(Math.random() * 5)],
    clothingGraphic: 'none'
  };
}

// Add a loading state to completely hide the avatar during randomization
const isAvatarLoading = ref(false);

// Completely isolated randomization function with loading state
const randomizeAvatar = () => {
  // Prevent multiple clicks
  if (isRandomizing.value) {
    console.log('Already randomizing, ignoring click');
    return;
  }
  
  // Set both randomizing and loading states
  isRandomizing.value = true;
  isAvatarLoading.value = true;
  
  // Create a safe delay before starting any changes
  setTimeout(() => {
    try {
      // Create a completely new avatar object instead of modifying the existing one
      const newAvatar = {
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
        faceMask: false, // Always boolean false
        faceMaskColor: 'white',
        hat: ['none', 'beanie', 'turban'][Math.floor(Math.random() * 3)],
        hatColor: ['white', 'blue', 'black', 'green', 'red'][Math.floor(Math.random() * 5)],
        clothingGraphic: 'none'
      };
      
      // Serialize the new avatar to JSON
      const serializedAvatar = JSON.stringify(newAvatar);
      
      // Wait a bit longer before updating to ensure component stability
      setTimeout(() => {
        try {
          // Emit the new avatar value directly without modifying the reactive object first
          emit('update:modelValue', serializedAvatar);
          
          // Only after emitting, update the local avatar object
          nextTick(() => {
            // Update the local avatar object after the parent has processed the update
            Object.assign(avatar, newAvatar);
            
            // Wait for everything to settle before removing loading state
            setTimeout(() => {
              isAvatarLoading.value = false;
              
              // Wait a bit more before allowing another randomization
              setTimeout(() => {
                isRandomizing.value = false;
              }, 300);
            }, 200);
          });
        } catch (error) {
          console.error('Error during avatar update:', error);
          isAvatarLoading.value = false;
          isRandomizing.value = false;
        }
      }, 200);
    } catch (error) {
      console.error('Error generating random avatar:', error);
      isAvatarLoading.value = false;
      isRandomizing.value = false;
    }
  }, 200); // Longer initial delay for better stability
};

// Color class helpers
const getSkinColorClass = (skin) => {
  const classes = {
    'light': 'bg-amber-200',
    'yellow': 'bg-yellow-300',
    'brown': 'bg-amber-700',
    'dark': 'bg-amber-900',
    'red': 'bg-red-500',
    'black': 'bg-gray-900'
  };
  return classes[skin] || 'bg-amber-200';
};

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

const setupScrollObserver = () => {
  const scrollContainer = document.querySelector('.avatar-customization-container');
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', checkPreviewVisibility);
  }
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
