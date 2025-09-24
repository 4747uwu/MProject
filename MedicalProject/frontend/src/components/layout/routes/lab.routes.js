import express from 'express';
import {
  getAllStudiesForLab,
  getPatientDetailedViewForLab,
  updatePatientInfo,
  getPendingStudies,
  getProcessingStudies,
  getCompletedStudies,
  getValues
  

} from '../controllers/lab.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Use existing middleware - protect first, then authorize for lab_staff role
router.use(protect);
router.use(authorize('lab_staff'));

router.get('/studies', getAllStudiesForLab);
router.get('/patients/:id/detailed-view', getPatientDetailedViewForLab);
router.put('/patients/:id', updatePatientInfo);

// Add these routes after existing routes
// 🆕 NEW: Category-specific endpoints for lab
router.get('/studies/pending', getPendingStudies);
router.get('/studies/processing', getProcessingStudies);
router.get('/studies/completed', getCompletedStudies);
router.get('/values', getValues);



export default router;