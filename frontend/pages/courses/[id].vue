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
      @logout="logout"
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
    <ConfirmationModal
      v-if="showRescanConfirm"
      title="Database Rescan"
      message="Are you sure you want to rescan the courses database?"
      confirm-button-text="Rescan Database"
      cancel-button-text="Cancel"
      :show="showRescanConfirm"
      @confirm="confirmRescan"
      @cancel="showRescanConfirm = false"
    >
      <div class="mb-6">
        <div class="flex items-center mb-2">
          <input
            id="preserve-metadata"
            v-model="preserveMetadata"
            type="checkbox"
            class="rounded text-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
          />
          <label for="preserve-metadata" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
            Preserve course metadata (thumbnails, descriptions, etc.)
          </label>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 italic">
          If unchecked, all custom metadata will be reset to defaults.
        </p>
      </div>
    </ConfirmationModal>
    
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
              @click="playVideo(lesson, video)"
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

    <CourseFilesModal 
      :visible="showFilesModal" 
      :course-id="course?.id" 
      @close="closeFilesModal"
    />

  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '~/composables/useSession';
import CourseFilesModal from '~/components/CourseFilesModal.vue';
import CourseHeader from '../../components/course/CourseHeader.vue';
import VideoPlayer from '../../components/video/VideoPlayer.vue';
import VideoInfo from '../../components/video/VideoInfo.vue';
import { pickNextNotCompleted } from '~/utils/smartOpen.js';
import VideoControlButtons from '../../components/video/VideoControlButtons.vue';
import UserManagement from '../../components/UserManagement.vue';
import AdminPanel from '../../components/AdminPanel.vue';
import ConfirmationModal from '../../components/ui/ConfirmationModal.vue';

// Apply auth middleware
definePageMeta({
  middleware: ['auth']
});

const route = useRoute();
const router = useRouter();

// Get user from session composable
const { userName, userAvatar, logout, deleteAccount: userDelete, userId, isAdmin, isActive } = useSession();

// Create a computed user object with the correct structure. Must include
// id so the My Profile (UserManagement) modal knows which user to load and
// patch — without it the modal opens against an undefined user and silently
// no-ops.
const userObject = computed(() => {
  return {
    id: userId.value,
    name: userName.value,
    avatar: userAvatar.value,
    isAdmin: isAdmin.value ? 1 : 0,
    is_active: isActive.value ? 1 : 0,
  };
});

// User-menu modal state. The user-menu in the header (UserProfile) emits
// `manage` / `admin` / `rescan` / `delete`; before this fix CourseHeader
// dropped manage/admin/rescan silently and routed delete to a back-button
// navigation (no confirmation, no actual deletion).
const showUserManagement = ref(false);
const showAdminPanel = ref(false);
const showRescanConfirm = ref(false);
const showDeleteConfirm = ref(false);
const isDeleting = ref(false);
const preserveMetadata = ref(true);

async function confirmRescan() {
  showRescanConfirm.value = false;
  try {
    const response = await $fetch('/api/courses/rescan', {
      method: 'POST',
      body: { preserveMetadata: preserveMetadata.value },
    });
    if (!response?.success) {
      console.error('Failed to start rescan:', response?.error || 'Unknown error');
      alert(`Failed to start database rescan: ${response?.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Error initiating rescan:', err);
    alert(`Error initiating database rescan: ${err.message || 'Unknown error'}`);
  }
}

async function deleteAccount() {
  showDeleteConfirm.value = false;
  isDeleting.value = true;
  try {
    const result = await userDelete();
    if (!result?.success) {
      console.error('Failed to delete account:', result?.message);
      alert(`Failed to delete account: ${result?.message || 'Unknown error'}`);
    }
    // On success the useSession composable already logs out and redirects.
  } catch (err) {
    console.error('Error deleting account:', err);
    alert('An error occurred while trying to delete your account.');
  } finally {
    isDeleting.value = false;
  }
}

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
const completedVideos = ref({});
const videoProgress = ref({});
const videoPlayer = ref(null);
const currentTimeForPlayer = ref(0);
const courseProgress = ref({});
const isLoading = ref(true);
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
  try {
    isLoading.value = true;

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

    isLoading.value = false;
  } catch (error) {
    console.error('Error loading course:', error);
    isLoading.value = false;
  } finally {
    // Always mark progress as ready, even on failure — without this signal
    // the smart-open watcher would never pick anything and the page would
    // stay stuck on the placeholder.
    progressReady.value = true;
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
    for (const video of lesson.videos) {
      const videoId = `${lesson.id}-${lesson.videos.indexOf(video)}`;
      if (completedVideos.value[videoId]) count++;
    }
  }
  return count;
});

const courseCompletionPercentage = computed(() => {
  if (totalVideos.value === 0) return 0;
  return (completedVideosCount.value / totalVideos.value) * 100;
});

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

function playVideo(lesson, video, autoPlay = true) {
  // Store previous video info to check if we're changing videos
  const previousVideoId = currentVideoId.value;
  // Snapshot the URL BEFORE we mutate the refs that drive the computed.
  const previousVideoUrl = currentVideoUrl.value;

  // Update current video information
  currentLesson.value = lesson;
  currentVideo.value = video;
  currentVideoId.value = `${lesson.id}-${lesson.videos.indexOf(video)}`;

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

function updateProgress(event) {
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
  saveProgress();
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
  // A completed video should always reopen at 0 even if a stale partial-progress
  // entry exists for it (e.g. user re-watched, then was auto-marked completed).
  if (completedVideos.value[currentVideoId.value]) {
    currentTimeForPlayer.value = 0;
    return;
  }
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

// New function to manually mark a video as completed
function toggleVideoCompletion() {
  if (!currentVideoId.value) return;
  
  completedVideos.value[currentVideoId.value] = !completedVideos.value[currentVideoId.value];
  
  // Save progress to database
  saveProgress();
}

// New function to mark the entire course as completed
function markCourseCompleted() {
  // Mark all videos as completed
  for (const lesson of course.value.lessons) {
    for (const video of lesson.videos) {
      const videoId = `${lesson.id}-${lesson.videos.indexOf(video)}`;
      completedVideos.value[videoId] = true;
    }
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

// New function to reset video progress
function resetVideoProgress() {
  if (!currentVideoId.value) return;
  
  videoProgress.value[currentVideoId.value] = 0;
  
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

// Save progress to database
async function saveProgress() {
  if (!userId.value) return;
  
  try {
    // Prepare progress data for this course
    const progressData = {
      completed: completedVideos.value,
      progress: videoProgress.value,
      favorite: isFavorite.value,
      lastViewed: {
        lessonId: currentLesson.value?.id,
        videoIndex: currentLesson.value?.videos.indexOf(currentVideo.value)
      }
    };
    
    // Save to database
    await $fetch(`/api/user-progress/${userId.value}`, {
      method: 'POST',
      body: {
        courseId: course.value.id,
        data: progressData
      }
    });
  } catch (error) {
    console.error('Error saving progress:', error);
  }
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
  
  const currentIndex = currentLesson.value.videos.indexOf(currentVideo.value);
  
  // If there's another video in this lesson, play it
  if (currentIndex < currentLesson.value.videos.length - 1) {
    const nextVideo = currentLesson.value.videos[currentIndex + 1];
    playVideo(currentLesson.value, nextVideo); 
    return;
  }
  
  // Otherwise, move to the next lesson
  const currentLessonIndex = course.value.lessons.indexOf(currentLesson.value);
  if (currentLessonIndex < course.value.lessons.length - 1) {
    const nextLesson = course.value.lessons[currentLessonIndex + 1];
    expandedLessons.value[nextLesson.id] = true; // Expand the next lesson
    
    // Play the first video in the next lesson
    if (nextLesson.videos && nextLesson.videos.length > 0) {
      playVideo(nextLesson, nextLesson.videos[0]);
    }
  }
}

function toggleFavorite() {
  // Toggle favorite state
  isFavorite.value = !isFavorite.value;
  
  // Save to database
  saveProgress();
  
  // Provide user feedback
  const message = isFavorite.value ? 'Added to favorites' : 'Removed from favorites';
  console.log(message);
}

const openFilesModal = () => {
  showFilesModal.value = true;
};

const closeFilesModal = () => {
  showFilesModal.value = false;
};
</script>
