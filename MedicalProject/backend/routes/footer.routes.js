import express from 'express';
import { 
  assignStudies, 
  markStudiesUnauthorized, 
  exportWorklist, 
  dispatchReports, 
  bulkZipDownload 
} from '../controllers/footer.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// Assign studies to a doctor
router.post('/assign', authorize('admin', 'lab_staff'), assignStudies);

// Mark studies as unauthorized
router.post('/unauthorized', authorize('admin', 'lab_staff'), markStudiesUnauthorized);

// Export worklist to Excel
router.get('/export', authorize('admin', 'lab_staff', 'doctor_account'), exportWorklist);

// Dispatch reports
router.post('/reports/dispatch', authorize('admin', 'lab_staff'), dispatchReports);

// Bulk download studies as a ZIP file
router.get('/download-zip', authorize('admin', 'lab_staff', 'doctor_account'), bulkZipDownload);

export default router;