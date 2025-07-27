import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { 
    downloadPreProcessedStudy, 
    getDownloadInfo, 
    createZipManually,
    downloadFromR2  // ✅ CHANGED: Import R2 function instead of Wasabi
} from '../controllers/zip.download.controller.js';

const router = express.Router();

// ✅ UPDATED: R2 + CDN download routes
router.get('/study/:orthancStudyId/pre-processed', 
    protect, 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    downloadPreProcessedStudy
);

// ✅ NEW: Direct R2 CDN download
router.get('/study/:orthancStudyId/r2-direct', 
    protect, 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    downloadFromR2
);

// ✅ UPDATED: Download info
router.get('/study/:orthancStudyId/info', 
    protect, 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    getDownloadInfo
);

// ✅ UPDATED: Manual ZIP creation in R2
router.post('/study/:orthancStudyId/create', 
    protect, 
    authorize('admin', 'lab_staff'), 
    createZipManually
);

export default router;