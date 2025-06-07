// routes/auth.routes.js
import express from 'express';
import { loginUser, getMe, logoutUser } from '../controllers/auth.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.get('/me', protect, getMe); // Get current logged-in user
router.post('/logout', protect, logoutUser); // Logout current user

export default router;