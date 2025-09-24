import express from 'express';
import {
    sendResetPasswordOTP,
    verifyResetPasswordOTP,
    resetPassword,
    resendResetPasswordOTP
} from '../controllers/forgotPassword.controller.js';

const router = express.Router();

// Send OTP to email
router.post('/send-otp', sendResetPasswordOTP);

// Verify OTP
router.post('/verify-otp', verifyResetPasswordOTP);

// Reset password with verified token
router.post('/reset-password', resetPassword);

// Resend OTP
router.post('/resend-otp', resendResetPasswordOTP);

export default router;