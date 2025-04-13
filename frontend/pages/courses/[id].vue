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
    />
    
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <!-- Video Player -->
      <VideoPlayer
        ref="videoPlayer"
        class="mb-4"
        :src="currentVideoUrl"
        :autoplay="false"
        @timeupdate="updateProgress"
        @ended="markAsCompleted"
        @loadedmetadata="handleVideoLoaded"
      />
      
      <!-- Video Info -->
      <VideoInfo 
        v-if="currentVideo" 
        :video="currentVideo" 
        :video-id="currentVideoId" 
        :is-completed="!!completedVideos[currentVideoId]" 
        :progress-percentage="videoProgress[currentVideoId] || 0"
      />
      
      <!-- Lessons List -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div v-for="lesson in course.lessons" :key="lesson.id" class="border-b last:border-b-0">
          <div 
            class="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
            @click="toggleLesson(lesson.id)"
          >
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ lesson.title }}</h3>
            <svg 
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
          <div v-if="expandedLessons[lesson.id]" class="bg-gray-50 dark:bg-gray-700 p-4">
            <div 
              v-for="(video, index) in lesson.videos" 
              :key="`${lesson.id}-${index}`"
              class="py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 rounded mb-2"
            >
              <div class="flex items-center">
                <div 
                  class="mr-3 flex-shrink-0 cursor-pointer" 
                  @click="playVideo(lesson, video)"
                >
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
                <div 
                  class="flex-grow cursor-pointer"
                  @click="playVideo(lesson, video)"
                >
                  {{ video.title }}
                </div>
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
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '~/composables/useSession';
import CourseHeader from '../../components/course/CourseHeader.vue';
import VideoPlayer from '../../components/video/VideoPlayer.vue';
import VideoInfo from '../../components/video/VideoInfo.vue';
import VideoControlButtons from '../../components/video/VideoControlButtons.vue';

// Apply auth middleware
definePageMeta({
  middleware: ['auth']
});

const route = useRoute();
const router = useRouter();

// Get user from session composable
const { userName, userAvatar, logout, userId, isAdmin } = useSession();

// Create a computed user object with the correct structure
const userObject = computed(() => {
  return {
    name: userName.value,
    avatar: userAvatar.value,
    isAdmin: isAdmin.value ? 1 : 0
  };
});

// State
const course = ref({
  title: '',
  lessons: []
});
const isFavorite = ref(false);
const expandedLessons = ref({});
const currentLesson = ref(null);
const currentVideo = ref(null);
const currentVideoId = ref(null);
const completedVideos = ref({});
const videoProgress = ref({});
const videoPlayer = ref(null);
const courseProgress = ref({});
const isLoading = ref(true);

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
      const progressData = await $fetch(`/api/user-progress/${userId.value}`);
      
      if (progressData && progressData.progress) {
        const userProgress = progressData.progress;
        
        // Get progress for this specific course
        if (userProgress[course.value.id]) {
          courseProgress.value = userProgress[course.value.id];
          
          // Set completed videos
          if (courseProgress.value.completed) {
            completedVideos.value = courseProgress.value.completed;
          }
          
          // Set video progress
          if (courseProgress.value.progress) {
            videoProgress.value = courseProgress.value.progress;
          }
          
          // Set favorite status
          isFavorite.value = courseProgress.value.favorite || false;
        }
      }
    }
    
    isLoading.value = false;
  } catch (error) {
    console.error('Error loading course:', error);
    isLoading.value = false;
  }
});

// Watch for course data to load and select the first video
watch(course, (newCourseData) => {
  if (newCourseData && newCourseData.lessons && newCourseData.lessons.length > 0) {
    const firstLesson = newCourseData.lessons[0];
    
    // Clear any previous lesson expansions to ensure only the first is expanded
    Object.keys(expandedLessons.value).forEach(id => {
      expandedLessons.value[id] = false;
    });
    
    // Expand only the first lesson
    expandedLessons.value[firstLesson.id] = true;
    
    if (firstLesson.videos && firstLesson.videos.length > 0) {
      // Only auto-select if no video is currently selected
      if (!currentVideo.value) { 
        console.log('Auto-selecting first video (paused):', firstLesson.videos[0].title);
        // Load the first video into the player but don't auto-play it
        playVideo(firstLesson, firstLesson.videos[0], false); 
      }
    }
  }
}, { immediate: true }); // immediate: true ensures it runs once on load if data is already available

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

// Methods
function toggleLesson(lessonId) {
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
  
  // Update current video information
  currentLesson.value = lesson;
  currentVideo.value = video;
  currentVideoId.value = `${lesson.id}-${lesson.videos.indexOf(video)}`;
  
  // Only reset and play if we're changing videos
  if (previousVideoId !== currentVideoId.value) {
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
  
  // Get time from the video element via the exposed method
  const currentTime = videoPlayer.value.getCurrentTime();
  const duration = videoPlayer.value.getDuration();
  const progress = (currentTime / duration) * 100;
  
  videoProgress.value[currentVideoId.value] = progress;
  
  // Save progress to database
  saveProgress();
}

// Video progress handling is done via loadedmetadata event in the template

// Handle video loaded event
function handleVideoLoaded(event) {
  if (!videoPlayer.value || !currentVideoId.value) return;
  
  // Set the current time based on saved progress
  const savedProgress = videoProgress.value[currentVideoId.value];
  if (savedProgress && savedProgress > 0) {
    const duration = videoPlayer.value.getDuration();
    const timeToSeek = (savedProgress / 100) * duration;
    videoPlayer.value.setCurrentTime(timeToSeek);
  }
}

function markAsCompleted() {
  if (!currentVideoId.value) return;
  
  completedVideos.value[currentVideoId.value] = true;
  
  // Save progress to database
  saveProgress();
  
  // Auto-play next video if available
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

function navigateTo(path) {
  router.push(path);
}
</script>
