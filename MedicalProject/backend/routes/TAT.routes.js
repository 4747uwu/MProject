import express from 'express';
import { 
  getLocations, 
  getStatuses, 
  getTATReport, 
  exportTATReport 
} from '../controllers/TAT.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all routes with authentication
router.use(protect);

// Master data routes
router.get('/locations', getLocations);
router.get('/statuses', getStatuses);

// TAT Report routes
router.get('/tat', getTATReport);
router.get('/tat/export', exportTATReport);

export default router;