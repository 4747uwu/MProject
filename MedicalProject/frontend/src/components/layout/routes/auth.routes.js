// routes/auth.routes.js
import express from 'express';
import { loginUser, getMe, logoutUser, refreshToken } from '../controllers/auth.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.get('/me', protect, getMe); // Get current logged-in user
router.post('/logout', protect, logoutUser); // Logout current user
router.post('/refresh-token', protect, refreshToken); // ✅ NEW

export default router;