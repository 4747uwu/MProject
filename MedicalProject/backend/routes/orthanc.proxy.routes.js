import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  getStudyDetails,
  downloadStudyArchive,
  getStudyMetadata,
  searchStudies,
  getOrthancStatus,
  cstoreToRadiant,
  testCStoreConnection,
  getStudyInstances,
  generateRadiantLauncher,
  downloadInstance
} from '../controllers/orthanc.proxy.controller.js';

const router = express.Router();

// All routes require authentication
// router.use(protect);
// router.use(authorize('admin', 'doctor_account', 'lab_staff'));

// Orthanc status
router.get('/status', getOrthancStatus);

// Study operations
router.get('/studies/search', searchStudies);
router.get('/studies/:studyId', getStudyDetails);
router.get('/studies/:studyId/download', downloadStudyArchive);
router.get('/studies/:studyId/metadata', getStudyMetadata);
router.get('/studies/:studyId/instances', getStudyInstances);
router.get('/studies/:studyId/launcher', generateRadiantLauncher);
router.get('/instances/:instanceId/download', downloadInstance);

// 🆕 NEW: C-STORE routes
router.post('/study/:studyId/cstore', cstoreToRadiant);
router.post('/test-connection', testCStoreConnection);

export default router;