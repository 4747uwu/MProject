// backend/routes/doctorTAT.routes.js
import express from 'express';
import { 
  getDoctorTATReport, 
  exportDoctorTATReport
} from '../controllers/doctorTAT.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all routes and authorize only doctor_account
router.use(protect);
router.use(authorize('doctor_account'));

// TAT Report routes for doctor
router.get('/report', getDoctorTATReport);
router.get('/report/export', exportDoctorTATReport);

export default router;