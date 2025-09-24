import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { 
    createBulkR2Zip, 
    getBulkR2Info, 
    createMissingR2Zips 
} from '../controllers/bulkzip.controller.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// ✅ NEW: Bulk R2 ZIP download routes
router.post('/r2-zip', 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    createBulkR2Zip
);

router.get('/r2-info', 
    authorize('admin', 'lab_staff', 'doctor_account'), 
    getBulkR2Info
);

router.post('/create-missing-zips', 
    authorize('admin', 'lab_staff'), 
    createMissingR2Zips
);

export default router;