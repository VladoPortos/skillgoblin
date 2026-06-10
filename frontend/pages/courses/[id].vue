<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 min-w-[320px]">
    <CourseHeader
      :course="course"
      :total-videos="totalVideos"
      :completed-videos-count="completedVideosCount"
      :course-completion-percentage="courseCompletionPercentage"
      :is-favorite="isFavorite"
      :user="userObject"
      @toggle-favorite="toggleFavorite"
      @mark-completed="markCourseCompleted"
      @reset-progress="resetCourseProgress"
      @logout="handleLogout"
      @delete="showDeleteConfirm = true"
      @manage="showUserManagement = true"
      @admin="showAdminPanel = true"
      @rescan="showRescanConfirm = true"
    />

    <!-- Delete-account confirmation -->
    <ConfirmationModal
      v-if="showDeleteConfirm"
      title="Delete Account"
      message="Are you sure you want to delete your account? This action cannot be undone and all your progress will be lost."
      confirm-button-text="Delete Account"
      cancel-button-text="Cancel"
      confirm-button-color="red"
      :show="showDeleteConfirm"
      :is-loading="isDeleting"
      loading-text="Deleting..."
      @confirm="deleteAccount"
      @cancel="showDeleteConfirm = false"
    />

    <!-- My Profile modal (personal: name, avatar, password, PIN) -->
    <UserManagement
      v-if="showUserManagement"
      :show="showUserManagement"
      :user="userObject"
      @close="showUserManagement = false"
      @updated="showUserManagement = false"
    />

    <!-- Admin Panel modal (admin-only entry; server enforces authz) -->
    <AdminPanel
      v-if="showAdminPanel"
      :show="showAdminPanel"
      @close="showAdminPanel = false"
    />

    <!-- Rescan confirmation -->
    <RescanConfirmModal
      v-if="showRescanConfirm"
      v-model="preserveMetadata"
      :show="showRescanConfirm"
      @confirm="confirmRescan"
      @cancel="showRescanConfirm = false"
    />
    
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <!-- Video Player -->
      <VideoPlayer
        ref="videoPlayer"
        class="mb-4"
        :src="currentVideoUrl"
        :autoplay="false"
        :current-time="currentTimeForPlayer"
        :subtitle-src="subtitleSrc"
        @timeupdate="updateProgress"
        @ended="markAsCompleted"
        @pause="flushProgressSave"
        @seeked="flushProgressSave"
        @loadedmetadata="handleVideoLoaded"
        @start-from-beginning="startFromBeginning"
      />

      <!-- Video Info -->
      <VideoInfo 
        v-if="currentVideo" 
        :video="currentVideo" 
        :video-id="currentVideoId" 
        :is-completed="!!completedVideos[currentVideoId]" 
        :progress-percentage="videoProgress[currentVideoId] || 0"
      />
      
      <!-- Lesson search — filters lesson titles AND video titles inside each
           lesson. While a query is active, every lesson with at least one
           match is force-expanded (overriding the one-lesson-open accordion
           behavior) so the user can scan results without extra clicks. -->
      <div v-if="course.lessons?.length" class="mb-3">
        <div class="relative">
          <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.45 6.45a7.5 7.5 0 0 0 10.2 10.2z" />
          </svg>
          <input
            v-model="lessonSearchQuery"
            type="search"
            placeholder="Search lessons..."
            data-testid="lesson-search-input"
            aria-label="Search lessons in this course"
            class="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <!-- Lessons List -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <div
          v-if="isLessonSearchActive && filteredLessons.length === 0"
          data-testid="lesson-search-empty"
          class="p-6 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          No lessons match &ldquo;{{ lessonSearchQuery }}&rdquo;.
        </div>
        <div v-for="lesson in filteredLessons" :key="lesson.id" class="border-b last:border-b-0">
          <div
            class="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700"
            :class="isLessonSearchActive ? 'cursor-default' : 'cursor-pointer'"
            @click="toggleLesson(lesson.id)"
          >
            <h3 class="text-lg font-medium text-gray-900 dark:text-white" v-html="highlightMatch(lesson.title)"></h3>
            <svg
              v-if="!isLessonSearchActive"
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 transform transition-transform"
              :class="expandedLessons[lesson.id] ? 'rotate-180' : ''"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <!-- Video List -->
          <div v-if="expandedLessons[lesson.id] || isLessonSearchActive" class="bg-gray-50 dark:bg-gray-700 p-4">
            <div
              v-for="(video, index) in lesson.videos"
              :key="`${lesson.id}-${index}`"
              :data-testid="`lesson-video-${lesson.id}-${index}`"
              class="py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 rounded mb-2 cursor-pointer"
              @click="playVideo(lesson, video, index)"
            >
              <div class="flex items-center">
                <div class="mr-3 shrink-0">
                  <div v-if="completedVideos[`${lesson.id}-${index}`]" class="w-5 h-5 bg-green-500 dark:bg-green-400 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div v-else-if="videoProgress[`${lesson.id}-${index}`]" class="w-5 h-5 rounded-full border-2 border-blue-500 dark:border-blue-400 relative">
                    <div class="absolute inset-0.5 bg-blue-500 dark:bg-blue-400 rounded-full" :style="{
                      clipPath: `polygon(0 0, 100% 0, 100% ${videoProgress[`${lesson.id}-${index}`]}%, 0 ${videoProgress[`${lesson.id}-${index}`]}%)`
                    }"></div>
                  </div>
                  <div v-else class="w-5 h-5 rounded-full border-2 border-gray-400 dark:border-gray-500"></div>
                </div>
                <div class="flex-grow" v-html="highlightMatch(video.title)"></div>
                <!-- Action buttons must not bubble into the row's playVideo handler. -->
                <div @click.stop>
                  <VideoControlButtons
                    :is-completed="completedVideos[`${lesson.id}-${index}`]"
                    @toggle-completion="toggleVideoCompletionById(`${lesson.id}-${index}`)"
                    @reset-progress="resetVideoProgressById(`${lesson.id}-${index}`)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Files Button -->
      <div class="mt-8 mb-4 text-center">
        <button 
          @click="openFilesModal"
          class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          View Course Files
        </button>
      </div>

    </main>

    <!-- Course-completion toast: surfaces once per page-mount when the
         percentage transitions to 100. Read-only and archival on purpose
         (research is clear that confetti / streaks read as patronizing to
         the kind of user who self-hosts a learning library); the message
         is the fact, the dismiss button is the only interaction. -->
    <div
      v-if="showCompletionToast"
      role="status"
      aria-live="polite"
      data-testid="course-completion-toast"
      class="fixed bottom-4 right-4 z-50 max-w-sm bg-gray-900 text-white border border-green-500/60 rounded-lg shadow-xl p-4 flex items-start gap-3"
    >
      <div class="shrink-0 w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
      </div>
      <div class="flex-1 text-sm">
        <p class="font-semibold">Course complete</p>
        <p class="text-gray-300 mt-0.5">{{ completedVideosCount }} / {{ totalVideos }} lessons watched.</p>
      </div>
      <button
        type="button"
        class="text-gray-400 hover:text-white"
        aria-label="Dismiss"
        data-testid="course-completion-dismiss"
        @click="dismissCompletionToast"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <CourseFilesModal 
      :visible="showFilesModal" 
      :course-id="course?.id" 
      @close="closeFilesModal"
    />

  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useSession } from '~/composables/useSession';
import { useAccountActions } from '~/composables/useAccountActions';
import CourseFilesModal from '~/components/CourseFilesModal.vue';
import CourseHeader from '../../components/course/CourseHeader.vue';
import VideoPlayer from '../../components/video/VideoPlayer.vue';
import VideoInfo from '../../components/video/VideoInfo.vue';
import { pickNextNotCompleted } from '~/utils/smartOpen.js';
import VideoControlButtons from '../../components/video/VideoControlButtons.vue';
import UserManagement from '../../components/UserManagement.vue';
import AdminPanel from '../../components/AdminPanel.vue';
import ConfirmationModal from '../../components/ui/ConfirmationModal.vue';
import RescanConfirmModal from '../../components/RescanConfirmModal.vue';

// Apply auth middleware
definePageMeta({
  middleware: ['auth']
});

const route = useRoute();

// Get user from session composable
const { logout, userId } = useSession();

// Flush any throttled / pending progress save BEFORE the session tears down.
// useSession.logout() clears userId synchronously, after which a trailing
// edge save would skip its own userId guard and silently drop up to
// SAVE_INTERVAL_MS of progress. Same hazard for onBeforeUnmount (which
// runs after logout has already cleared the session).
async function handleLogout() {
  // Await the in-flight save — without this, the POST is still in flight
  // when useSession.logout() clears the auth cookie, and the server rejects
  // the late write under requireSelfOrAdmin.
  await flushProgressSave();
  await logout();
}

// Shared account / rescan machinery (header user object, delete-account
// flow, rescan POST and the user-menu modal visibility refs). The user-menu
// in the header (UserProfile) emits `manage` / `admin` / `rescan` / `delete`.
const {
  userObject,
  showUserManagement,
  showAdminPanel,
  showDeleteConfirm,
  isDeleting,
  showRescanConfirm,
  preserveMetadata,
  deleteAccount,
  confirmRescan
} = useAccountActions();

// State
const course = ref({
  title: '',
  lessons: []
});
const isFavorite = ref(false);
const expandedLessons = ref({});
const lessonSearchQuery = ref('');
const currentLesson = ref(null);
const currentVideo = ref(null);
const currentVideoId = ref(null);
const currentVideoIndex = ref(-1);
const completedVideos = ref({});
const videoProgress = ref({});
const videoPlayer = ref(null);
const currentTimeForPlayer = ref(0);
const courseProgress = ref({});
const showFilesModal = ref(false);
// Smart-open must wait until BOTH the course payload AND the user-progress
// fetch have settled, otherwise we would pick the first video with empty
// progress and the early-exit-on-currentVideo guard prevents the later
// progress-loaded trigger from correcting it.
const progressReady = ref(false);
// Scoped one-shot flag: when set to a videoId, the next handleVideoLoaded
// for THAT video id forces seek to 0, bypassing any saved partial progress.
// Holding the flag against a specific videoId (instead of a global boolean)
// matters for the same-src "Start from beginning" rewind case: no
// loadedmetadata fires there, so a global flag would persist and force the
// user's NEXT video selection to start at 0 too — wiping its saved resume.
const forceFromZeroFor = ref(null);
// Gate that suppresses updateProgress writes between a click on a new
// video (in playVideo) and the matching loadedmetadata for that video
// (handleVideoLoaded). Without this gate, a stray timeupdate event during
// the transition window — when currentVideoId already points at the new
// video but the <video> element still has the previous src loaded (or is
// being reset by .load()) — calls updateProgress with currentTime=0/duration
// of the wrong asset, writes 0 to videoProgress[currentVideoId], and
// saveProgress persists that 0 to the backend. Subsequent handleVideoLoaded
// then reads 0 and seeks to 0, so the user sees the video restart from
// scratch and their saved position is gone.
const transitioning = ref(false);
// The src URL the most recent playVideo asked the player to load. Used by
// handleVideoLoaded to reject a stale loadedmetadata event from a previous
// load() that the user has since superseded by clicking another video — if
// we acted on it we'd clear the gate and apply seek math against the wrong
// element duration.
const expectedSrc = ref(null);

// Fetch course data and user progress
onMounted(async () => {
  // Register the pagehide listener up-front, BEFORE the awaited fetches.
  // If the user navigates away while those promises are still pending, the
  // component unmounts immediately and onBeforeUnmount runs — registering
  // here later would leak a listener that fires on a future unload and saves
  // stale state, possibly under a different user.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', saveProgressOnHide);
  }

  try {
    // Fetch course data
    const data = await $fetch(`/api/courses/${route.params.id}`);
    course.value = data;

    // Auto-expand first lesson
    if (course.value.lessons && course.value.lessons.length > 0) {
      expandedLessons.value[course.value.lessons[0].id] = true;
    }

    // Load user progress from the database
    if (userId.value) {
      try {
        const progressData = await $fetch(`/api/user-progress/${userId.value}`);

        if (progressData && progressData.progress) {
          const userProgress = progressData.progress;

          if (userProgress[course.value.id]) {
            courseProgress.value = userProgress[course.value.id];
            if (courseProgress.value.completed) {
              completedVideos.value = courseProgress.value.completed;
            }
            if (courseProgress.value.progress) {
              videoProgress.value = courseProgress.value.progress;
            }
            isFavorite.value = courseProgress.value.favorite || false;
          }
        }
      } catch (err) {
        console.error('Error loading user progress:', err);
      }
    }

  } catch (error) {
    console.error('Error loading course:', error);
  } finally {
    // Always mark progress as ready, even on failure — without this signal
    // the smart-open watcher would never pick anything and the page would
    // stay stuck on the placeholder.
    progressReady.value = true;
  }
});

onBeforeUnmount(() => {
  if (trailingSaveTimer) {
    clearTimeout(trailingSaveTimer);
    trailingSaveTimer = null;
  }
  if (completionToastTimer) {
    clearTimeout(completionToastTimer);
    completionToastTimer = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', saveProgressOnHide);
  }
  // Final flush in case the user navigates within the SPA (no pagehide fires).
  if (userId.value && course.value?.id) {
    saveProgress();
  }
});

// Watch for course data to load and select the first video. The watcher
// fires when EITHER the course or the progressReady signal flips, but the
// body bails until BOTH are present so we never pick with stale empty progress.
watch([course, progressReady], () => {
  const newCourseData = course.value;
  if (!newCourseData?.lessons?.length) return;
  if (!progressReady.value) return;
  // Collapse all lessons (matches the previous "expand only one" UX)
  Object.keys(expandedLessons.value).forEach((id) => {
    expandedLessons.value[id] = false;
  });

  // If a video is already selected (e.g. the user clicked one), don't override.
  if (currentVideo.value) return;

  const pick = pickNextNotCompleted(newCourseData.lessons, {
    completed: completedVideos.value,
    progress: videoProgress.value,
  });
  if (!pick) return;

  const lesson = newCourseData.lessons.find((l) => l.id === pick.lessonId);
  if (!lesson) return;
  const video = lesson.videos[pick.videoIndex];
  if (!video) return;

  expandedLessons.value[lesson.id] = true;
  currentLesson.value = lesson;
  currentVideo.value = video;
  currentVideoIndex.value = pick.videoIndex;
  currentVideoId.value = `${lesson.id}-${pick.videoIndex}`;
  // Initial seek time is computed once duration is known, in handleVideoLoaded.
  currentTimeForPlayer.value = 0;
}, { immediate: true });

// Computed values
const currentVideoUrl = computed(() => {
  if (!currentLesson.value || !currentVideo.value) return '';

  // Use the API endpoint for video content
  // Make sure to properly encode the path components
  const courseId = encodeURIComponent(route.params.id);
  const lessonFolder = currentLesson.value.folder ? encodeURIComponent(currentLesson.value.folder) : '';
  const videoFile = encodeURIComponent(currentVideo.value.file);

  const lessonPath = lessonFolder ? `/${lessonFolder}` : '';
  return `/api/content/${courseId}${lessonPath}/${videoFile}`;
});

const subtitleSrc = computed(() => {
  if (!currentVideo.value || !currentLesson.value) return '';
  if (!currentVideo.value.subtitle) return '';
  // PR-A's server emits the .vtt filename in `subtitle` (it converts the
  // sibling .srt on demand). We just URL-encode it and return the full
  // /api/content/... path.
  const courseId = encodeURIComponent(route.params.id);
  const lessonFolder = currentLesson.value.folder
    ? encodeURIComponent(currentLesson.value.folder)
    : '';
  const subtitleFilename = String(currentVideo.value.subtitle);
  const lessonPath = lessonFolder ? `/${lessonFolder}` : '';
  return `/api/content/${courseId}${lessonPath}/${encodeURIComponent(subtitleFilename)}`;
});

const totalVideos = computed(() => {
  let count = 0;
  for (const lesson of course.value.lessons) {
    count += lesson.videos.length;
  }
  return count;
});

const completedVideosCount = computed(() => {
  let count = 0;
  for (const lesson of course.value.lessons) {
    lesson.videos.forEach((video, index) => {
      if (completedVideos.value[`${lesson.id}-${index}`]) count++;
    });
  }
  return count;
});

const courseCompletionPercentage = computed(() => {
  if (totalVideos.value === 0) return 0;
  return (completedVideosCount.value / totalVideos.value) * 100;
});

// Course-completion celebration: a single dismissible toast that appears
// the first time the percentage TRANSITIONS to 100 within this page-load.
// Reopening a finished course shouldn't refire the toast, so the watcher
// only triggers on a < 100 → === 100 edge, and we mark "shown" once it has
// fired this mount. Auto-dismisses after 8s.
const showCompletionToast = ref(false);
const completionToastShown = ref(false);
let completionToastTimer = null;

watch(courseCompletionPercentage, (newVal, oldVal) => {
  if (completionToastShown.value) return;
  if (totalVideos.value === 0) return;
  // Wait for the smart-open progress fetch to settle before reacting; the
  // initial render briefly sees newVal === 0 against oldVal === undefined,
  // so the strict edge guard below is what keeps us quiet on mount when
  // the user is already at 100 from a previous session.
  if (!progressReady.value) return;
  if (Number.isFinite(oldVal) && oldVal < 100 && newVal >= 100) {
    showCompletionToast.value = true;
    completionToastShown.value = true;
    if (completionToastTimer) clearTimeout(completionToastTimer);
    completionToastTimer = setTimeout(() => {
      showCompletionToast.value = false;
      completionToastTimer = null;
    }, 8000);
  }
});

function dismissCompletionToast() {
  showCompletionToast.value = false;
  if (completionToastTimer) {
    clearTimeout(completionToastTimer);
    completionToastTimer = null;
  }
}

// Lesson search filter — matches lesson titles AND video titles inside each
// lesson, case-insensitive. When a query is active, every lesson with at
// least one match is shown with all of its videos visible (the per-video
// `q in title` filter would split lessons into "matched titles" and "matched
// videos" buckets and confuse the eye); the search is a "where in this
// course is X" tool, not a precise sieve.
const isLessonSearchActive = computed(() => !!lessonSearchQuery.value.trim());
const filteredLessons = computed(() => {
  const lessons = course.value.lessons || [];
  if (!isLessonSearchActive.value) return lessons;
  const q = lessonSearchQuery.value.trim().toLowerCase();
  return lessons.filter((lesson) => {
    if ((lesson.title || '').toLowerCase().includes(q)) return true;
    return (lesson.videos || []).some((v) => (v.title || '').toLowerCase().includes(q));
  });
});

// Highlight helper for v-html. Escapes HTML first so any user-typed query
// (or course-author title) can't inject markup, then wraps every literal
// occurrence of the query in <mark>. Returning escaped-but-unwrapped text
// when there's no query keeps the v-html call safe in both states.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function highlightMatch(text) {
  const safe = escapeHtml(text);
  const q = lessonSearchQuery.value.trim();
  if (!q) return safe;
  const safeQ = escapeHtml(q).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return safe.replace(
    new RegExp(`(${safeQ})`, 'ig'),
    '<mark class="bg-yellow-200 dark:bg-yellow-600 text-gray-900 dark:text-white rounded px-0.5">$1</mark>'
  );
}

// Methods
function toggleLesson(lessonId) {
  // Search forces every matching lesson open, so accordion clicks are a
  // no-op while a query is active — collapsing here would just be re-expanded
  // by the v-if and look broken.
  if (isLessonSearchActive.value) return;

  // Check if the lesson is already expanded
  const isCurrentlyExpanded = expandedLessons.value[lessonId];

  if (isCurrentlyExpanded) {
    // If it's already expanded, just collapse it
    expandedLessons.value[lessonId] = false;
  } else {
    // If expanding a new lesson, first close all other expanded lessons
    for (const id in expandedLessons.value) {
      expandedLessons.value[id] = false;
    }
    // Then expand only the clicked lesson
    expandedLessons.value[lessonId] = true;
  }
}

function playVideo(lesson, video, videoIndex, autoPlay = true) {
  // Store previous video info to check if we're changing videos
  const previousVideoId = currentVideoId.value;
  // Snapshot the URL BEFORE we mutate the refs that drive the computed.
  const previousVideoUrl = currentVideoUrl.value;

  // Update current video information
  currentLesson.value = lesson;
  currentVideo.value = video;
  currentVideoIndex.value = videoIndex;
  currentVideoId.value = `${lesson.id}-${videoIndex}`;

  // Only reset and play if we're changing videos
  if (previousVideoId !== currentVideoId.value) {
    // Switching videos invalidates any pending "rewind to 0 if loadedmetadata
    // fires" override that startFromBeginning may have stamped — otherwise a
    // later click-back to that video would honor a stale token and clobber
    // the newer saved resume.
    forceFromZeroFor.value = null;
    const newVideoUrl = currentVideoUrl.value;
    // Reset the seek prop to 0 BEFORE the new src loads. handleVideoLoaded
    // will recompute the actual seek (from saved progress) once duration is
    // known and reassign currentTimeForPlayer. Without this reset, two videos
    // whose computed seek targets happen to coincide (or the previous video's
    // seek value being reused) would leave currentTimeForPlayer unchanged —
    // VideoPlayer's currentTime watcher only fires on value change, so the
    // freshly-loaded element would never seek and the user would see the
    // video start from 0 instead of resuming.
    currentTimeForPlayer.value = 0;
    if (newVideoUrl !== previousVideoUrl) {
      // Real src change incoming — VideoPlayer's src watcher will pause()
      // and load(). Suppress updateProgress and markAsCompleted until
      // handleVideoLoaded confirms the new src is loaded; stamp expectedSrc
      // so handleVideoLoaded ignores stale loadedmetadata events from a
      // load() the user has since superseded.
      transitioning.value = true;
      expectedSrc.value = newVideoUrl;
    } else {
      // Same media URL: VideoPlayer's src watcher bails (newSrc === oldSrc),
      // no load() fires, and no loadedmetadata follows. Arming the gate here
      // would leave it stuck forever and permanently disable progress
      // tracking. Apply the seek synchronously instead — the element is
      // already loaded so duration is valid and handleVideoLoaded will run
      // its normal saved-progress flow against the new currentVideoId.
      handleVideoLoaded();
      // currentTimeForPlayer was set to 0 above and handleVideoLoaded may
      // have set it back to the same value the prop already had (common
      // when the new video has no saved progress, or its computed target
      // coincides with the previous prop value). Vue coalesces same-tick
      // writes and only fires the watcher on a value change vs. the
      // previously-flushed value, so the parent's seek pipeline can no-op
      // — leaving the reused element at the previous video's playback
      // position. Force the seek out-of-band to make this branch robust.
      if (typeof videoPlayer.value.setCurrentTime === 'function') {
        videoPlayer.value.setCurrentTime(currentTimeForPlayer.value);
      }
    }
    nextTick(() => {
      if (videoPlayer.value) {
        // Our component handles the video source change via props
        // and will auto-set time via loadedmetadata event

        // Auto-play if requested
        if (autoPlay) {
          setTimeout(() => {
            videoPlayer.value.play();
          }, 100);
        }
      }
    });
  }
}

// 90% is the canonical "treat as watched" threshold (Plex / industry standard).
// Lets users skip credits / outros without leaving the lesson stuck at "in
// progress" forever; the `ended` event still fires markAsCompleted for the
// users who watch all the way through.
const COMPLETION_THRESHOLD_PCT = 90;

function updateProgress() {
  if (!videoPlayer.value || !currentVideoId.value) return;
  // Don't write progress while the player is mid-transition between videos
  // — currentVideoId already points at the new video but the <video>
  // element may still be on the previous src or in a load() reset.
  if (transitioning.value) return;
  const currentTime = videoPlayer.value.getCurrentTime();
  const duration = videoPlayer.value.getDuration();
  // Guard against NaN/0 duration leaking into a NaN progress write.
  if (!Number.isFinite(duration) || duration <= 0) return;
  const progress = (currentTime / duration) * 100;
  videoProgress.value[currentVideoId.value] = progress;

  // Auto-complete at the 90% threshold so a missed last 10s doesn't leave
  // the lesson "in progress" forever. Guarded so it runs once per video.
  if (
    progress >= COMPLETION_THRESHOLD_PCT &&
    !completedVideos.value[currentVideoId.value]
  ) {
    completedVideos.value[currentVideoId.value] = true;
    flushProgressSave();
    return;
  }

  scheduleProgressSave();
}

// Video progress handling is done via loadedmetadata event in the template

function handleVideoLoaded() {
  if (!videoPlayer.value || !currentVideoId.value) return;
  // Reject stale loadedmetadata events: if expectedSrc was set by a more
  // recent playVideo and the element's currentSrc is something else, this
  // event is from a load() the user has since superseded. Acting on it
  // would clear the gate and apply seek math against the wrong duration.
  if (expectedSrc.value && typeof videoPlayer.value.getCurrentSrc === 'function') {
    const loadedSrc = videoPlayer.value.getCurrentSrc() || '';
    if (loadedSrc && !loadedSrc.endsWith(expectedSrc.value)) return;
  }
  const duration = videoPlayer.value.getDuration();
  if (!Number.isFinite(duration) || duration <= 0) return;
  // Duration is now valid for the loaded src — reopen the updateProgress
  // gate so playback writes start landing on the new video, and clear the
  // src expectation now that this load is settled.
  transitioning.value = false;
  expectedSrc.value = null;
  // One-shot override from "Start from beginning": the caller wants 0
  // regardless of saved progress, but ONLY for the video they targeted.
  if (forceFromZeroFor.value === currentVideoId.value) {
    currentTimeForPlayer.value = 0;
    forceFromZeroFor.value = null;
    return;
  }
  // Resume from saved position regardless of whether the video was previously
  // marked completed — re-watching a finished lesson should pick up where the
  // user left off, not snap to zero. The "Start from beginning" button stays
  // available for an explicit rewind.
  const savedProgress = videoProgress.value[currentVideoId.value] || 0;
  if (savedProgress > 0 && savedProgress < 100) {
    currentTimeForPlayer.value = (savedProgress / 100) * duration;
  } else {
    currentTimeForPlayer.value = 0;
  }
}

function markAsCompleted() {
  if (!currentVideoId.value) return;
  // A stale `ended` event fired during a video transition (the user
  // clicked another row before the previous video's ended event drained
  // from the queue) would otherwise mark the newly-selected video as
  // completed and auto-advance past it. Same gate as updateProgress.
  if (transitioning.value) return;
  completedVideos.value[currentVideoId.value] = true;
  saveProgress();
  playNextVideo();
}

// New function to mark the entire course as completed
function markCourseCompleted() {
  // Mark all videos as completed
  for (const lesson of course.value.lessons) {
    lesson.videos.forEach((video, index) => {
      completedVideos.value[`${lesson.id}-${index}`] = true;
    });
  }

  // Save progress to database
  saveProgress();
}

// New function to reset course progress
function resetCourseProgress() {
  // Reset completed videos and video progress
  completedVideos.value = {};
  videoProgress.value = {};
  
  // Save progress to database
  saveProgress();
}

// New function to toggle video completion by ID
function toggleVideoCompletionById(videoId) {
  completedVideos.value[videoId] = !completedVideos.value[videoId];
  
  // Save progress to database
  saveProgress();
}

// New function to reset video progress by ID
function resetVideoProgressById(videoId) {
  videoProgress.value[videoId] = 0;
  
  // Save progress to database
  saveProgress();
}

// Throttled progress persistence. The player previously POSTed on every
// timeupdate (~4× / sec) which wasted bandwidth and produced races. We now
// keep the in-memory progress map up-to-date in real time but persist at
// most once per SAVE_INTERVAL_MS, with an immediate flush on
// pause / seeked / ended / 90% completion / page hide so the worst-case
// progress loss on a crash is one window's worth of playback.
const SAVE_INTERVAL_MS = 5000;
let lastProgressSaveAt = 0;
let trailingSaveTimer = null;

function buildProgressBody() {
  return {
    courseId: course.value.id,
    data: {
      completed: completedVideos.value,
      progress: videoProgress.value,
      favorite: isFavorite.value,
      lastViewed: {
        lessonId: currentLesson.value?.id,
        videoIndex: currentLesson.value ? currentVideoIndex.value : undefined
      }
    }
  };
}

// Leading + trailing throttle: first call within a quiet window writes
// immediately, subsequent calls in the same window are coalesced and the
// trailing edge fires SAVE_INTERVAL_MS after the leading save.
function scheduleProgressSave() {
  if (!userId.value || !course.value?.id) return;
  const now = Date.now();
  const elapsed = now - lastProgressSaveAt;
  if (elapsed >= SAVE_INTERVAL_MS) {
    lastProgressSaveAt = now;
    if (trailingSaveTimer) {
      clearTimeout(trailingSaveTimer);
      trailingSaveTimer = null;
    }
    saveProgress();
    return;
  }
  if (trailingSaveTimer) return;
  trailingSaveTimer = setTimeout(() => {
    lastProgressSaveAt = Date.now();
    trailingSaveTimer = null;
    saveProgress();
  }, SAVE_INTERVAL_MS - elapsed);
}

// Returns the in-flight save promise so callers (logout, in particular)
// can await the persisted write before the session is torn down.
function flushProgressSave() {
  if (!userId.value || !course.value?.id) return Promise.resolve();
  if (trailingSaveTimer) {
    clearTimeout(trailingSaveTimer);
    trailingSaveTimer = null;
  }
  lastProgressSaveAt = Date.now();
  return saveProgress();
}

// Immediate write. Used directly by completion / favorite / reset handlers
// where the user expects their action to land before a possible reload.
async function saveProgress() {
  if (!userId.value || !course.value?.id) return;
  try {
    await $fetch(`/api/user-progress/${userId.value}`, {
      method: 'POST',
      body: buildProgressBody()
    });
  } catch (error) {
    console.error('Error saving progress:', error);
  }
}

// Page-hide path: regular fetch may be cancelled by the browser on unload.
// sendBeacon is the documented mechanism for "fire-and-forget on the way
// out" and queues the request even after the page is gone. Falls back to
// a sync flush if the API isn't available.
function saveProgressOnHide() {
  if (!userId.value || !course.value?.id) return;
  if (trailingSaveTimer) {
    clearTimeout(trailingSaveTimer);
    trailingSaveTimer = null;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([JSON.stringify(buildProgressBody())], { type: 'application/json' });
      // sendBeacon returns false when the user agent declines to queue the
      // request — typically because the body is over the keepalive budget or
      // the queue is full. Fall back to the regular fetch path so we don't
      // silently drop the unload save.
      if (navigator.sendBeacon(`/api/user-progress/${userId.value}`, blob)) return;
    } catch (err) {
      // Fall through to fetch fallback below.
    }
  }
  saveProgress();
}

function startFromBeginning() {
  // Rewind the CURRENT video to 0. Same src → no reload, no loadedmetadata,
  // so handleVideoLoaded won't re-apply saved progress on its own. Scope
  // the forceFromZero token to THIS videoId — that way, if a loadedmetadata
  // happens to fire for this video, it will honor the rewind, but if the
  // user clicks a different video before that, the new video's saved resume
  // is not affected.
  if (!videoPlayer.value || !currentVideoId.value) return;
  forceFromZeroFor.value = currentVideoId.value;
  currentTimeForPlayer.value = 0;
  if (typeof videoPlayer.value.setCurrentTime === 'function') {
    videoPlayer.value.setCurrentTime(0);
  }
}

// Play next video in the current lesson or move to the next lesson
function playNextVideo() {
  if (!currentLesson.value || !currentVideo.value) return;

  const currentIndex = currentVideoIndex.value;

  // If there's another video in this lesson, play it
  if (currentIndex < currentLesson.value.videos.length - 1) {
    const nextVideo = currentLesson.value.videos[currentIndex + 1];
    playVideo(currentLesson.value, nextVideo, currentIndex + 1);
    return;
  }

  // Otherwise, move to the next lesson
  const currentLessonIndex = course.value.lessons.indexOf(currentLesson.value);
  if (currentLessonIndex < course.value.lessons.length - 1) {
    const nextLesson = course.value.lessons[currentLessonIndex + 1];
    expandedLessons.value[nextLesson.id] = true; // Expand the next lesson

    // Play the first video in the next lesson
    if (nextLesson.videos && nextLesson.videos.length > 0) {
      playVideo(nextLesson, nextLesson.videos[0], 0);
    }
  }
}

function toggleFavorite() {
  // Toggle favorite state
  isFavorite.value = !isFavorite.value;

  // Save to database
  saveProgress();
}

const openFilesModal = () => {
  showFilesModal.value = true;
};

const closeFilesModal = () => {
  showFilesModal.value = false;
};
</script>
