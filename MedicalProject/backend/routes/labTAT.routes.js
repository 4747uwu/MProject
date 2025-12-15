// backend/routes/labTAT.routes.js
import express from 'express';
import { 
  getLabTATReport, 
  exportLabTATReport
} from '../controllers/labTAT.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all routes and authorize only lab_staff
router.use(protect);
router.use(authorize('lab_staff'));

// TAT Report routes for lab
router.get('/report', getLabTATReport);
router.get('/report/export', exportLabTATReport);

export default router;