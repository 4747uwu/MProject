import express from 'express';
import { 
  getPatientDetailedView,
  updatePatientDetails,
  uploadDocument,
  deleteDocument,
  downloadDocument,
  getDocumentDownloadUrl,
  getPatientDocuments,
  updateStudyStatus,
  getAllPatients,
  bulkUpdateStudies,
  downloadStudyReport, // 🔧 NEW: Import the downloadStudyReport controller
  deleteStudyReport
} from '../controllers/labEdit.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// 🔧 FIXED: Configure multer for memory storage (Wasabi needs buffer)
const storage = multer.memoryStorage(); // Changed from diskStorage

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit for documents
    files: 10 // Single file upload
  },
  fileFilter: (req, file, cb) => {
    console.log(`🔍 File filter - Original name: ${file.originalname}, MIME type: ${file.mimetype}`);
    
    // Allowed file types for medical documents
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|xml|json|csv|xlsx|xls|rtf|tiff|bmp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                     file.mimetype.includes('application/') || 
                     file.mimetype.includes('text/') ||
                     file.mimetype.includes('image/');
    
    if (extname && mimetype) {
      console.log(`✅ File accepted: ${file.originalname}`);
      return cb(null, true);
    } else {
      console.log(`❌ File rejected: ${file.originalname} - Type: ${file.mimetype}`);
      cb(new Error('Only document and image files are allowed (PDF, DOC, DOCX, JPG, PNG, etc.)'));
    }
  }
});
router.use(protect);

// 🔧 DEBUG: Add logging middleware
router.use((req, res, next) => {
  console.log(`🔍 [labEdit] ${req.method} ${req.path}`);
  console.log(`🔍 [labEdit] User:`, req.user ? {
    id: req.user.id || req.user._id,
    role: req.user.role,
    email: req.user.email
  } : 'No user');
  next();
});

// All routes require authentication

// 🔧 STUDY REPORT DOWNLOAD - MUST BE FIRST
router.get('/studies/:studyId/reports/:reportId/download', 
  authorize('lab_staff', 'admin', 'doctor_account'),
  downloadStudyReport
);

// 🔧 PATIENT DOCUMENT MANAGEMENT (comes after study routes)

// Get patient documents list
router.get('/patients/:patientId/documents', 
  authorize('lab_staff', 'admin', 'doctor_account'), 
  getPatientDocuments
);

router.delete(
  '/studies/:studyId/reports/:reportId',
  authorize('lab_staff', 'admin'),
  deleteStudyReport
);

// Upload document for patient (Lab Staff + Admin only)
router.post('/patients/:studyId/documents', 
  authorize('lab_staff', 'admin'),
  (req, res, next) => {
    console.log(`🔍 Upload middleware - User: ${req.user?.role}, Study: ${req.params.studyId}`);
    next();
  },
  upload.array('files', 10), // Allow up to 10 files at once 
  uploadDocument
);

// Get presigned download URL (for web apps)
router.get('/patients/:studyId/documents/:docIndex/url',
  authorize('lab_staff', 'admin', 'doctor_account'),
  getDocumentDownloadUrl
);

// Direct download endpoint
router.get('/patients/:studyId/documents/:docIndex/download', 
  authorize('lab_staff', 'admin', 'doctor_account'),
  downloadDocument
);

// Delete patient document (Lab Staff + Admin only)
router.delete('/patients/:studyId/documents/:docIndex', 
  authorize('lab_staff', 'admin'),
  deleteDocument
);

// 🔧 PATIENT MANAGEMENT (Lab Staff + Admin)

// Get detailed patient view
router.get('/patients/:studyId', 
  authorize('lab_staff', 'admin', 'doctor_account'),
  getPatientDetailedView
);

// Update patient details
router.put('/patients/:studyId', 
  authorize('lab_staff', 'admin'),
  updatePatientDetails
);

// Get all patients (lab view)
router.get('/patients', 
  authorize('lab_staff', 'admin'),
  getAllPatients
);

// 🔧 STUDY WORKFLOW MANAGEMENT (Lab Staff + Admin)

// Update study workflow status
router.put('/studies/:studyId/status', 
  authorize('lab_staff', 'admin', 'doctor_account'),
  updateStudyStatus
);

// Bulk update studies
router.put('/studies/bulk-update', 
  authorize('lab_staff', 'admin'),
  bulkUpdateStudies
);


export default router;