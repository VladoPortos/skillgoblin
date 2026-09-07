<template>
  <div class="space-y-4 text-sm text-gray-200">
    <div class="flex gap-3 items-center">
      <h3 class="font-semibold text-white">Library diagnostics</h3>
      <button class="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50" :disabled="loading" @click="refresh">Refresh</button>
    </div>
    <p v-if="error" role="alert" class="text-red-400">{{ error }}</p>
    <p v-if="loading" role="status">Loading diagnostics…</p>
    <template v-if="report">
      <p>{{ report.counts.total }} indexed courses; {{ report.counts.unavailable }} unavailable. Missing courses retain their metadata and progress.</p>
      <dl class="grid gap-2 break-all">
        <div v-for="(value, key) in report.configuration" :key="key"><dt class="text-gray-400">{{ key }}</dt><dd>{{ value }}</dd></div>
      </dl>
      <p role="status">Scan: {{ report.scan.inProgress ? 'in progress' : report.scan.complete ? 'complete' : 'idle or failed' }} — {{ report.scan.processedCourses }}/{{ report.scan.totalCourses }} courses</p>
      <p v-if="report.scan.error" class="text-red-400">{{ report.scan.error }}</p>
      <h4 class="font-semibold">Recent scan errors (up to 100, current server session)</h4>
      <p v-if="!report.errors.length" class="text-gray-400">No recorded errors.</p>
      <ul class="max-h-40 overflow-auto space-y-2"><li v-for="(entry, index) in report.errors" :key="index">{{ entry.at }} — {{ entry.course }}: {{ entry.message }}</li></ul>
      <h4 class="font-semibold">Inspect media</h4>
      <p class="text-gray-400">Choose from the first 100 courses, with unavailable courses listed first, or enter any course ID. Each check inspects up to 100 paths and probes one video for up to 10 seconds.</p>
      <label class="block">Course
        <select v-model="courseId" class="block w-full mt-1 bg-gray-700 rounded p-2"><option value="">Choose a course</option><option v-for="course in report.courses" :key="course.id" :value="course.id">{{ course.title }}{{ course.available ? '' : ' (unavailable)' }}</option></select>
      </label>
      <label class="block">Course ID<input v-model="courseId" class="block w-full mt-1 bg-gray-700 rounded p-2" /></label>
      <label class="block">Video number (starts at 1)<input v-model="videoNumber" type="number" min="1" class="block mt-1 bg-gray-700 rounded p-2" /></label>
      <button class="px-3 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50" :disabled="probing || !courseId" @click="inspect">{{ probing ? 'Inspecting…' : 'Inspect video' }}</button>
      <div v-if="media" class="space-y-2" role="status">
        <p v-if="media.error" class="text-orange-300">{{ media.error }}</p>
        <p>{{ media.file }}</p>
        <p v-if="media.probe?.error" class="text-orange-300">{{ media.probe.error }}</p>
        <p v-for="(stream, index) in media.probe?.streams || []" :key="index">{{ stream.codec_type }}: {{ stream.codec_name }}</p>
        <p v-if="media.probe?.format">Container: {{ media.probe.format.format_name }}; duration: {{ media.probe.format.duration }} seconds</p>
        <p v-if="media.checkedFiles != null">Checked {{ media.checkedFiles }} of {{ media.totalVideos }} files. Missing: {{ media.missing?.length || 0 }}.</p>
        <ul><li v-for="file in media.missing || []" :key="file">{{ file }}</li></ul>
        <ul class="text-orange-300 space-y-2"><li v-for="entry in media.fileErrors || []" :key="entry.file">{{ entry.file }}: {{ entry.message }}</li></ul>
        <ul class="text-orange-300 space-y-2"><li v-for="warning in media.warnings || []" :key="warning">{{ warning }}</li></ul>
        <p v-if="media.probe && !media.probe.error && !media.warnings?.length" class="text-green-300">No common codec or container compatibility concerns detected. Playback still depends on your browser and device.</p>
        <p class="text-gray-400">{{ media.advice }}</p>
      </div>
    </template>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
const report = ref(null), media = ref(null), error = ref(''), loading = ref(false), probing = ref(false);
const courseId = ref(''), videoNumber = ref(1);
async function refresh() {
  loading.value = true; error.value = '';
  try { report.value = await $fetch('/api/admin/diagnostics'); }
  catch (e) { error.value = e.data?.statusMessage || 'Could not load diagnostics.'; }
  finally { loading.value = false; }
}
async function inspect() {
  probing.value = true; error.value = ''; media.value = null;
  try { media.value = await $fetch('/api/admin/diagnostics', { query: { courseId: courseId.value, videoIndex: Math.max(0, Number(videoNumber.value) - 1) } }); }
  catch (e) { error.value = e.data?.statusMessage || 'Could not inspect media.'; }
  finally { probing.value = false; }
}
onMounted(refresh);
</script>
