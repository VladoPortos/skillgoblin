import { defineEventHandler } from 'h3';
import { initialScanStatus } from '../../utils/courseWatcher';
import { requireAuth } from '../../utils/authz';

// Endpoint to get the current status of the initial scan
export default defineEventHandler(async (event) => {
  requireAuth(event);
  return {
    ...initialScanStatus,
    timestamp: Date.now()
  };
});
