import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/authMiddleware.js';
import DocumentController from '../controllers/document.controller.js';

const router = express.Router();

// Configure multer for memory storage (Wasabi needs buffer)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word documents, text files, and images are allowed.'));
    }
  }
});




// Apply protection to all routes
router.use(protect);
router.get('/initial-data/:studyId', DocumentController.getInitialReportData);


router.post('/study/:studyId/upload', 
  // authorize('admin', 'lab_staff', 'doctor_account'),
  upload.single('file'), // FIXED: Changed to match frontend
  DocumentController.uploadStudyReport
);

// Generate patient report (NO STORAGE - direct download)
router.get('/study/:studyId/generate-patient-report', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.generatePatientReport
);

// Get all reports for a study (metadata only)
router.get('/study/:studyId/reports', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.getStudyReports
);

// Upload report to study with Wasabi storage
router.post('/study/:studyId/upload', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  upload.single('report'), // FIXED: Changed to match frontend
  DocumentController.uploadStudyReport
);

// Download specific report by index
router.get('/study/:studyId/reports/:reportIndex/download', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.getStudyReport
);

// Delete specific report by index
router.delete('/study/:studyId/reports/:reportIndex', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.deleteStudyReport
);

export default router;