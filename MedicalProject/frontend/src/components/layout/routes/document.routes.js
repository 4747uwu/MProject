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

// Get initial report data
router.get('/initial-data/:studyId', DocumentController.getInitialReportData);
router.post('/study/:studyId/generate-report', DocumentController.generateReportWithDocxService);

router.post('/study/:studyId/generate-draft-report', DocumentController.generateReportWithDocxServiceDraft);


// Generate patient report (NO STORAGE - direct download)
router.get('/study/:studyId/generate-patient-report', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.generatePatientReport
);

// router.post('/study/:studyId/convert-and-upload-libreoffice', 
   
//   DocumentController.convertAndUploadReportViaPandocService
// );

// Get all reports for a study (metadata only)
router.get('/study/:studyId/reports', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.getStudyReports
);

// 🆕 NEW: Online Reporting System download and viewer endpoints
router.get('/study/:studyId/download-info', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.getStudyDownloadInfo
);

router.get('/study/:studyId/download/r2-cdn', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.downloadStudyFromR2CDN
);

router.get('/study/:studyId/download/orthanc-direct', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.downloadStudyFromOrthanc
);

// 🔧 NEW: Convert HTML report and upload to Wasabi
router.post('/study/:studyId/convert-and-upload', 
  authorize('admin', 'lab_staff', 'doctor_account'),
  DocumentController.convertAndUploadReport
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

// 🆕 ADD: Study info for reporting endpoint
router.get('/study/:studyId/reporting-info', 
    DocumentController.getStudyInfoForReporting
);

// In your routes file (e.g., documents.js)
export default router;