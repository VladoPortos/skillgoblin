import { defineEventHandler, readBody } from 'h3';
import { scanCoursesOnStartup, initialScanStatus } from '../../utils/courseWatcher';
import { requireAdmin } from '../../utils/authz';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  try {
    // Read request body to get metadata preference
    const body = (await readBody(event).catch(() => null)) || {};
    const preserveMetadata = body.preserveMetadata !== undefined ? body.preserveMetadata : true;

    if (initialScanStatus.inProgress) {
      return { success: false, error: 'Scan already in progress' };
    }

    // Start the scan in the background. scanCoursesOnStartup resets the
    // status fields synchronously before its first await, so the status
    // snapshot below already reflects the running scan.
    scanCoursesOnStartup(true, preserveMetadata).catch(error => {
      console.error('Error during rescan:', error);
      initialScanStatus.error = error.message || 'Unknown error during scan';
      initialScanStatus.inProgress = false;
    });

    return {
      success: true,
      message: 'Course rescan initiated',
      options: { preserveMetadata },
      status: { ...initialScanStatus, timestamp: Date.now() }
    };
  } catch (error) {
    console.error('Failed to initiate rescan:', error);
    return {
      success: false,
      error: error.message || 'Unknown error while starting rescan'
    };
  }
});
