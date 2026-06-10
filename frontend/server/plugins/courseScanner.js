import { scanCoursesOnStartup, setupFileWatcher } from '../utils/courseWatcher';

// Nitro server plugin — kicks off the startup course scan (fire-and-forget)
// and starts the single chokidar watcher instance. This is the ONE place
// CHOKIDAR_POLLING_INTERVAL is parsed; setting it to 0 disables the watcher.
export default defineNitroPlugin(() => {
  scanCoursesOnStartup().catch((error) => {
    console.error('Startup course scan failed:', error);
  });

  const pollingInterval = parseInt(process.env.CHOKIDAR_POLLING_INTERVAL || '60000', 10);
  if (pollingInterval > 0) {
    setupFileWatcher(pollingInterval);
  } else {
    console.log('CHOKIDAR_POLLING_INTERVAL is set to 0. File watcher disabled.');
  }
});
