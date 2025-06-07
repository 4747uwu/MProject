import express from 'express';
import {
    changePassword,
    adminResetUserPassword,
    getUserProfile,
    validateCurrentPassword,
    getAllUsersForAdmin
} from '../controllers/changePassword.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Change own password (available to all authenticated users)
router.post('/change-password', changePassword);

// Get own profile information
router.get('/profile', getUserProfile);

// Validate current password
router.post('/validate-password', validateCurrentPassword);

// Admin only routes
router.post('/admin/reset-user-password', adminResetUserPassword);
router.get('/admin/users', getAllUsersForAdmin);

export default router;