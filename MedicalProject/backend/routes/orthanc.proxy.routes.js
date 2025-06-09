import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  getStudyDetails,
  downloadStudyArchive,
  getStudyMetadata,
  searchStudies,
  getOrthancStatus
} from '../controllers/orthanc.proxy.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(authorize('admin', 'doctor_account', 'lab_staff'));

// Orthanc status
router.get('/status', getOrthancStatus);

// Study operations
router.get('/studies/search', searchStudies);
router.get('/studies/:studyId', getStudyDetails);
router.get('/studies/:studyId/download', downloadStudyArchive);
router.get('/studies/:studyId/metadata', getStudyMetadata);

export default router;