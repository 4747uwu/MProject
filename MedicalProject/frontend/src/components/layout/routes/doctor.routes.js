import express from 'express';
import {
  getAssignedStudies,
  getPendingStudies,        // 🆕 NEW
  getInProgressStudies,     // 🆕 NEW
  getCompletedStudies,
  getPatientDetailedViewForDoctor,
  startReport,
  submitReport,
  getDoctorStats,
  getValues,
  getCurrentDoctorProfile
} from '../controllers/doctor.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Use existing middleware - protect first, then authorize for doctor_account role
router.use(protect);
router.use(authorize('doctor_account'));

router.get('/assigned-studies', getAssignedStudies);
router.get('/values',  getValues);

router.get('/studies/pending',  getPendingStudies);
router.get('/studies/inprogress',  getInProgressStudies);
router.get('/studies/completed',  getCompletedStudies);

router.get('/patients/:id/detailed-view', getPatientDetailedViewForDoctor);
router.post('/studies/:studyId/start-report', startReport);
router.post('/studies/:studyId/submit-report', submitReport);
router.get('/stats', getDoctorStats);
router.get('/profile', protect, authorize('doctor_account'), getCurrentDoctorProfile);

export default router;