import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  checkHelperStatus,
  launchStudyByOrthancId,
  launchStudyByUid,
  getBridgeStatus,
  cleanupTempFiles,
  testClientConnection
} from '../controllers/radient.bridge.controller.js';

const router = express.Router();

// 🔧 PUBLIC ROUTES (for client helper status checks)
router.get('/status', getBridgeStatus);

// 🔧 PROTECTED ROUTES (require authentication)
// router.use(protect);
router.use(authorize('admin', 'doctor_account', 'lab_staff'));

// Helper status check
router.post('/helper/status', checkHelperStatus);

// Study launch routes
router.post('/launch/orthanc/:orthancStudyId', launchStudyByOrthancId);
router.post('/launch/uid/:studyInstanceUID', launchStudyByUid);

// Client connection testing
router.post('/test-connection', testClientConnection);

// Admin routes
router.post('/cleanup', authorize('admin'), cleanupTempFiles);

export default router;