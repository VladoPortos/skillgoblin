import { defineEventHandler } from 'h3';
import { initialScanStatus } from '../../utils/courseWatcher';

// Endpoint to get the current status of the initial scan
export default defineEventHandler(async () => {
  return {
    ...initialScanStatus,
    timestamp: Date.now()
  };
});
