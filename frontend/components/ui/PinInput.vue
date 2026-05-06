<template>
  <!-- No `pattern` attribute on the inputs: the displayed value flips to a
       bullet (●) once the reveal timer expires, and HTML5 validation on
       `pattern="[0-9]*"` would then refuse to submit the parent <form>
       with "Please match the requested format" before our JS handler can
       read the actual digits from v-model. Digit-only enforcement happens
       in onInput via the regex strip, so dropping pattern here is safe. -->
  <div class="flex justify-center space-x-2 pin-input-container">
    <input
      v-for="i in 4"
      :key="i"
      :ref="el => { inputs[i - 1] = el }"
      :id="`${idPrefix}-${i - 1}`"
      :data-testid="testIdPrefix ? `${testIdPrefix}-${i - 1}` : null"
      :value="displayValue(i - 1)"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :disabled="disabled"
      :class="digitClass"
      :aria-label="`PIN digit ${i}`"
      @input="onInput($event, i - 1)"
      @keydown="onKeydown($event, i - 1)"
      @focus="onFocus($event)"
      @keyup.enter="$emit('submit')"
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps({
  modelValue:   { type: String,  default: '' },
  idPrefix:     { type: String,  required: true },
  testIdPrefix: { type: String,  default: '' },
  autofocus:    { type: Boolean, default: false },
  disabled:     { type: Boolean, default: false },
  digitClass:   {
    type: String,
    default:
      'w-12 h-12 text-center text-2xl bg-gray-700 border border-gray-600 ' +
      'rounded-md focus:border-blue-500 focus:ring-2 focus:ring-blue-500 ' +
      'text-white disabled:opacity-50'
  }
});

const emit = defineEmits(['update:modelValue', 'submit']);

// iOS-style "reveal last typed digit, then mask" UX. The digit stays visible
// for REVEAL_MS while the user moves to the next box, then flips to a bullet.
// Only one digit is ever shown in the clear at a time — typing in any box
// remasks every other box immediately.
const REVEAL_MS = 1000;
const MASK_CHAR = '●';

const inputs = ref([null, null, null, null]);
const digits = ref(['', '', '', '']);
const revealedIndex = ref(null);
let maskTimer = null;

watch(() => props.modelValue, (v) => {
  // Only resync when the external value differs from what's already rendered.
  // The guard prevents the watcher firing during our own emitValue() from
  // overwriting digits and stealing focus mid-typing.
  if ((v || '') !== digits.value.join('')) {
    const next = (v || '').slice(0, 4).split('');
    for (let i = 0; i < 4; i++) digits.value[i] = next[i] || '';
    // External resets (parent setting modelValue back to '') should also
    // wipe any pending reveal so a stale digit doesn't briefly flash.
    cancelReveal();
  }
}, { immediate: true });

function emitValue() {
  emit('update:modelValue', digits.value.join(''));
}

function displayValue(i) {
  if (!digits.value[i]) return '';
  return revealedIndex.value === i ? digits.value[i] : MASK_CHAR;
}

function startReveal(i) {
  revealedIndex.value = i;
  if (maskTimer) clearTimeout(maskTimer);
  maskTimer = setTimeout(() => {
    revealedIndex.value = null;
    maskTimer = null;
  }, REVEAL_MS);
}

function cancelReveal() {
  if (maskTimer) clearTimeout(maskTimer);
  maskTimer = null;
  revealedIndex.value = null;
}

function onInput(event, index) {
  // The input may contain the mask character (when typing into a previously
  // masked box) or both the old digit and the new one (when typing into a
  // currently revealed box). Strip non-digits and keep the last digit typed.
  const cleaned = (event.target.value || '').replace(/[^0-9]/g, '');
  if (!cleaned) {
    digits.value[index] = '';
    if (revealedIndex.value === index) cancelReveal();
    emitValue();
    return;
  }
  digits.value[index] = cleaned.slice(-1);
  startReveal(index);
  emitValue();
  if (index < 3) {
    inputs.value[index + 1]?.focus();
  }
}

function onKeydown(event, index) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    inputs.value[index - 1]?.focus();
  }
}

function onFocus(event) {
  // Select existing content so typing replaces it cleanly. Without this,
  // typing into a filled box would append to the masked value (e.g. "●5")
  // and rely on the regex strip — that works, but visually flickers.
  event.target.select();
}

function focus() {
  nextTick(() => inputs.value[0]?.focus());
}

defineExpose({ focus });

onMounted(() => {
  if (props.autofocus) focus();
});

onBeforeUnmount(() => {
  if (maskTimer) clearTimeout(maskTimer);
});
</script>
