import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  launchStudyInRadiant,
  getRadiantStatus,
  cleanupTempFiles,
  universalRadiantLaunch
} from '../controllers/radient.bridge.controller.js';

const router = express.Router();

// 🔧 GET RADIANT BRIDGE STATUS (public endpoint for client checking)
router.get('/status', getRadiantStatus);

// 🔧 LAUNCH STUDY IN RADIANT BY STUDY ID
router.post('/launch/study/:studyId', 
  protect, 
  authorize('admin', 'doctor_account', 'lab_staff'), 
  launchStudyInRadiant
);

// 🔧 LAUNCH STUDY IN RADIANT BY ORTHANC STUDY ID
router.post('/launch/orthanc/:orthancStudyId', 
  protect, 
  authorize('admin', 'doctor_account', 'lab_staff'), 
  launchStudyInRadiant
);

// 🔧 LAUNCH STUDY IN RADIANT BY STUDY INSTANCE UID
router.post('/launch/uid/:studyInstanceUID', 
  protect, 
  authorize('admin', 'doctor_account', 'lab_staff'), 
  launchStudyInRadiant
);

// 🔧 UNIVERSAL LAUNCH ENDPOINT (for external clients)
router.post('/launch/universal', 
  protect, 
  authorize('admin', 'doctor_account', 'lab_staff'), 
  universalRadiantLaunch
);

// 🔧 CLEANUP TEMPORARY FILES
router.delete('/cleanup', 
  protect, 
  authorize('admin'), 
  cleanupTempFiles
);

export default router;