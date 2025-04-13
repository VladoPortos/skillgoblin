import { defineEventHandler, readBody } from 'h3';
import { scanCoursesOnStartup, initialScanStatus } from '../../utils/courseWatcher';

export default defineEventHandler(async (event) => {
  try {
    console.log('Rescan request received');
    
    // Read request body to get metadata preference
    const body = await readBody(event).catch(() => ({}));
    const preserveMetadata = body.preserveMetadata !== undefined ? body.preserveMetadata : true;
    
    console.log(`Rescan options: preserveMetadata=${preserveMetadata}`);
    
    // Force reset all scan status flags, regardless of current state
    // This ensures we can restart even if a previous scan got stuck
    initialScanStatus.inProgress = false;
    initialScanStatus.complete = false;
    initialScanStatus.error = null;
    initialScanStatus.totalCourses = 0;
    initialScanStatus.processedCourses = 0;
    initialScanStatus.startTime = null;
    initialScanStatus.endTime = null;
    initialScanStatus.preserveMetadata = preserveMetadata;
    
    // Give the system a moment to reset
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Now initialize the scan with proper starting values
    initialScanStatus.inProgress = true;
    initialScanStatus.startTime = Date.now();
    
    // Give the client time to see the loading state before potentially finishing too quickly
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Start the scan in the background
    setTimeout(() => {
      scanCoursesOnStartup(true, preserveMetadata).catch(error => {
        console.error('Error during rescan:', error);
        initialScanStatus.error = error.message || 'Unknown error during scan';
        initialScanStatus.inProgress = false;
      });
    }, 100);
    
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
