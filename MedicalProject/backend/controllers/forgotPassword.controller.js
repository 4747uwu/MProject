import User from '../models/userModel.js';
import transporter from '../config/resend.js';
import bcrypt from 'bcryptjs';

/**
 * Send OTP to user's email for password reset
 */
export const sendResetPasswordOTP = async (req, res) => {
    try {
        const { email } = req.body;

        // Validation
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required'
            });
        }

        // Find user by email
        const user = await User.findOne({ 
            email: email.toLowerCase().trim(),
            isActive: true 
        }).select('+resetPasswordOTPExpires +resetPasswordLockedUntil');

        if (!user) {
            // Don't reveal if user exists for security
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, an OTP has been sent to your email address'
            });
        }

        // Check if user is temporarily locked
        if (user.resetPasswordLockedUntil && user.resetPasswordLockedUntil > Date.now()) {
            const lockTimeRemaining = Math.ceil((user.resetPasswordLockedUntil - Date.now()) / (1000 * 60));
            return res.status(429).json({
                success: false,
                message: `Account is temporarily locked. Please try again in ${lockTimeRemaining} minutes.`
            });
        }

        // Generate 6-digit OTP directly in controller
        const plainOTP = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Hash the OTP before storing
        const saltRounds = 10;
        const hashedOTP = await bcrypt.hash(plainOTP, saltRounds);
        
        // Store OTP data in user model
        user.resetPasswordOTP = hashedOTP;
        user.resetPasswordOTPExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
        user.resetPasswordAttempts = 0; // Reset attempts when generating new OTP
        user.resetPasswordLockedUntil = undefined; // Clear any existing lock
        
        await user.save();

        // 🔧 UPDATED: Prepare email content with modern Resend styling
        const emailSubject = '🔐 Password Reset OTP - Medical Platform';
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Password Reset OTP</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f8fafc; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
                    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px 20px; text-align: center; }
                    .content { padding: 30px 20px; }
                    .otp-box { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; }
                    .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 15px 0; font-family: 'Courier New', monospace; }
                    .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0; }
                    .footer { margin-top: 30px; padding: 20px; background-color: #f8fafc; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center; }
                    .button { display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Password Reset Request</h1>
                        <p>Medical Platform - Secure Access</p>
                    </div>
                    
                    <div class="content">
                        <p>Hello <strong>${user.fullName}</strong>,</p>
                        
                        <p>You have requested to reset your password for your Medical Platform account. Please use the following One-Time Password (OTP) to proceed with your password reset:</p>
                        
                        <div class="otp-box">
                            <p style="margin: 0; font-size: 16px;">Your OTP Code:</p>
                            <div class="otp-code">${plainOTP}</div>
                            <p style="margin: 0; font-size: 14px; opacity: 0.9;"><strong>Valid for 10 minutes only</strong></p>
                        </div>
                        
                        <div class="warning">
                            <strong>⚠️ Security Notice:</strong>
                            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                <li>This OTP is valid for only <strong>10 minutes</strong></li>
                                <li>Do not share this code with anyone</li>
                                <li>If you didn't request this reset, please ignore this email</li>
                                <li>After 5 failed attempts, your account will be locked for 30 minutes</li>
                            </ul>
                        </div>
                        
                        <p>If you didn't request this password reset, please contact your system administrator immediately.</p>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password" class="button">Continue Password Reset</a>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p><strong>Account Details:</strong> ${user.username} (${user.role})</p>
                        <p>This is an automated message from the Medical Platform.</p>
                        <p>Please do not reply to this email.</p>
                        <p>© 2025 Medical Platform. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 🔧 UPDATED: Send email using Brevo transporter with proper name handling
        const mailOptions = {
            to: user.email,
            name: user.fullName || user.username || 'User', // 🔧 ADDED: Pass user's name
            subject: emailSubject,
            html: emailHtml
        };

        console.log('📤 Attempting to send OTP email via Brevo...');
        console.log('📧 To:', user.email);
        console.log('📧 Name:', mailOptions.name);
        console.log('📋 Subject:', emailSubject);

        try {
            const result = await transporter.sendMail(mailOptions);
            
            console.log('✅ Email operation completed');
            console.log('📧 Result:', JSON.stringify(result, null, 2));
            
            res.status(200).json({
                success: true,
                message: 'If an account with that email exists, an OTP has been sent to your email address via Brevo',
                data: {
                    email: user.email,
                    expiresIn: '10 minutes',
                    emailId: result?.id || result?.messageId
                }
            });

        } catch (emailError) {
            console.error('❌ Error sending email via Brevo:', emailError);
            console.error('❌ Error details:', {
                message: emailError.message,
                stack: emailError.stack
            });
            
            res.status(200).json({
                success: true,
                message: 'If an account with that email exists, an OTP has been sent to your email address',
                data: {
                    email: user.email,
                    expiresIn: '10 minutes',
                    emailId: null,
                    error: 'Email delivery failed'
                }
            });
        }

    } catch (error) {
        console.error('❌ Error sending reset password OTP via Resend:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while sending OTP. Please try again later.'
        });
    }
};

/**
 * Verify OTP for password reset
 */
export const verifyResetPasswordOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validation
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({
                success: false,
                message: 'OTP must be a 6-digit number'
            });
        }

        // Find user
        const user = await User.findOne({ 
            email: email.toLowerCase().trim(),
            isActive: true 
        }).select('+resetPasswordOTP +resetPasswordOTPExpires +resetPasswordAttempts +resetPasswordLockedUntil');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if account is locked
        if (user.resetPasswordLockedUntil && user.resetPasswordLockedUntil > Date.now()) {
            const lockTimeRemaining = Math.ceil((user.resetPasswordLockedUntil - Date.now()) / (1000 * 60));
            return res.status(429).json({
                success: false,
                message: `Account temporarily locked due to too many failed attempts. Please try again in ${lockTimeRemaining} minutes.`
            });
        }

        // Check if OTP exists and hasn't expired
        if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
            return res.status(400).json({
                success: false,
                message: 'No valid OTP found. Please request a new one.'
            });
        }

        if (user.resetPasswordOTPExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        // Verify OTP
        const isValidOTP = await bcrypt.compare(otp, user.resetPasswordOTP);

        if (!isValidOTP) {
            // Increment failed attempts
            user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
            
            // Lock account after 5 failed attempts for 30 minutes
            if (user.resetPasswordAttempts >= 5) {
                user.resetPasswordLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
                await user.save();
                return res.status(429).json({
                    success: false,
                    message: 'Too many failed attempts. Account locked for 30 minutes.'
                });
            }
            
            await user.save();
            return res.status(400).json({
                success: false,
                message: `Invalid OTP. ${5 - user.resetPasswordAttempts} attempts remaining.`
            });
        }

        // OTP is valid, generate a temporary reset token
        const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        // Store the reset token (reuse the OTP field)
        user.resetPasswordOTP = await bcrypt.hash(resetToken, 10);
        user.resetPasswordOTPExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes for password reset
        user.resetPasswordAttempts = 0; // Reset attempts
        
        await user.save();

        console.log(`✅ OTP verified successfully for user ${user.username}`);

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully. You can now reset your password.',
            data: {
                resetToken: resetToken,
                email: user.email,
                expiresIn: '15 minutes'
            }
        });

    } catch (error) {
        console.error('❌ Error verifying reset password OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while verifying OTP'
        });
    }
};

/**
 * Reset password using the verified token
 */
export const resetPassword = async (req, res) => {
    try {
        const { email, resetToken, newPassword, confirmPassword } = req.body;

        // Validation
        if (!email || !resetToken || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password and confirm password do not match'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Find user and verify reset token
        const user = await User.findOne({ 
            email: email.toLowerCase().trim(),
            isActive: true 
        }).select('+resetPasswordOTP +resetPasswordOTPExpires +password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Invalid reset request'
            });
        }

        // Verify reset token and expiration
        if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reset token'
            });
        }

        if (user.resetPasswordOTPExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Reset token has expired. Please request a new OTP.'
            });
        }

        // Verify reset token
        const isValidToken = await bcrypt.compare(resetToken, user.resetPasswordOTP);
        if (!isValidToken) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reset token'
            });
        }

        // Check if new password is different from current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from your current password'
            });
        }

        // Update password and clear reset fields
        user.password = newPassword;
        user.resetPasswordOTP = undefined;
        user.resetPasswordOTPExpires = undefined;
        user.resetPasswordAttempts = 0;
        user.resetPasswordLockedUntil = undefined;
        user.isLoggedIn = false; // Force re-login
        
        await user.save();

        // 🔧 UPDATED: Send confirmation email with modern Resend styling
        const confirmationEmailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Password Reset Confirmation</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f8fafc; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
                    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center; }
                    .content { padding: 30px 20px; }
                    .success-box { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; }
                    .info-box { background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin: 20px 0; }
                    .footer { margin-top: 30px; padding: 20px; background-color: #f8fafc; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center; }
                    .button { display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Password Reset Successful</h1>
                        <p>Medical Platform - Secure Access</p>
                    </div>
                    
                    <div class="content">
                        <p>Hello <strong>${user.fullName}</strong>,</p>
                        
                        <div class="success-box">
                            <h2 style="margin: 0 0 10px 0;">🔒 Password Successfully Updated!</h2>
                            <p style="margin: 0; font-size: 16px;">You can now login with your new password.</p>
                        </div>
                        
                        <div class="info-box">
                            <p><strong>🛡️ Security Information:</strong></p>
                            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                <li>Password reset completed at: ${new Date().toLocaleString()}</li>
                                <li>Your account has been automatically logged out from all devices</li>
                                <li>Please login with your new password to continue</li>
                                <li>If you didn't make this change, contact your administrator immediately</li>
                            </ul>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="button">Login to Medical Platform</a>
                        </div>
                        
                        <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
                            For your security, this email confirms that your password was successfully changed. 
                            If you experience any issues logging in, please contact technical support.
                        </p>
                    </div>
                    
                    <div class="footer">
                        <p><strong>Account:</strong> ${user.username} (${user.role})</p>
                        <p>This is an automated message from the Medical Platform.</p>
                        <p>© 2025 Medical Platform. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 🔧 UPDATED: Send confirmation email using Resend
        const confirmationMailOptions = {
            to: user.email,
            subject: '✅ Password Reset Confirmation - Medical Platform',
            html: confirmationEmailHtml
        };

        // Send confirmation email (don't wait for it)
        transporter.sendMail(confirmationMailOptions).catch(err => {
            console.error('❌ Error sending password reset confirmation email via Resend:', err);
        });

        console.log(`✅ Password successfully reset for user ${user.username} (${user.email})`);

        res.status(200).json({
            success: true,
            message: 'Password reset successfully. Please login with your new password.',
            data: {
                email: user.email,
                username: user.username,
                resetAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while resetting password'
        });
    }
};

/**
 * Resend OTP (with rate limiting)
 */
export const resendResetPasswordOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required'
            });
        }

        // Find user
        const user = await User.findOne({ 
            email: email.toLowerCase().trim(),
            isActive: true 
        }).select('+resetPasswordOTPExpires +resetPasswordLockedUntil');

        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a new OTP has been sent'
            });
        }

        // Check if user is locked
        if (user.resetPasswordLockedUntil && user.resetPasswordLockedUntil > Date.now()) {
            const lockTimeRemaining = Math.ceil((user.resetPasswordLockedUntil - Date.now()) / (1000 * 60));
            return res.status(429).json({
                success: false,
                message: `Account is temporarily locked. Please try again in ${lockTimeRemaining} minutes.`
            });
        }

        // Rate limiting: prevent resending too frequently (2 minutes)
        if (user.resetPasswordOTPExpires && user.resetPasswordOTPExpires > Date.now() - (8 * 60 * 1000)) {
            return res.status(429).json({
                success: false,
                message: 'Please wait at least 2 minutes before requesting a new OTP'
            });
        }

        // Generate new OTP directly in controller
        const plainOTP = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Hash the OTP before storing
        const saltRounds = 10;
        const hashedOTP = await bcrypt.hash(plainOTP, saltRounds);
        
        // Store new OTP data
        user.resetPasswordOTP = hashedOTP;
        user.resetPasswordOTPExpires = new Date(Date.now() + 10 * 60 * 1000);
        user.resetPasswordAttempts = 0;
        user.resetPasswordLockedUntil = undefined;
        
        await user.save();

        // 🔧 UPDATED: Send email with new OTP using modern styling
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>New Password Reset OTP</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f8fafc; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
                    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px 20px; text-align: center; }
                    .content { padding: 30px 20px; }
                    .otp-box { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; }
                    .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 15px 0; font-family: 'Courier New', monospace; }
                    .resent-notice { background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; margin: 20px 0; }
                    .footer { margin-top: 30px; padding: 20px; background-color: #f8fafc; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 New Password Reset OTP</h1>
                        <p>Medical Platform - Secure Access</p>
                    </div>
                    
                    <div class="content">
                        <p>Hello <strong>${user.fullName}</strong>,</p>
                        
                        <div class="resent-notice">
                            <strong>📧 New OTP Generated</strong><br>
                            This is a new OTP code. Your previous OTP has been invalidated for security.
                        </div>
                        
                        <div class="otp-box">
                            <p style="margin: 0; font-size: 16px;">Your New OTP Code:</p>
                            <div class="otp-code">${plainOTP}</div>
                            <p style="margin: 0; font-size: 14px; opacity: 0.9;"><strong>Valid for 10 minutes only</strong></p>
                        </div>
                        
                        <p>Please use this new OTP to complete your password reset. The code will expire in 10 minutes for your security.</p>
                    </div>
                    
                    <div class="footer">
                        <p>This is an automated message from the Medical Platform.</p>
                        <p>© 2025 Medical Platform. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 🔧 UPDATED: Send using Resend transporter
        const mailOptions = {
            to: user.email,
            subject: '🔐 New Password Reset OTP - Medical Platform',
            html: emailHtml
        };

        await transporter.sendMail(mailOptions);

        console.log(`📧 New OTP sent via Resend to ${user.email} for user ${user.username}`);

        res.status(200).json({
            success: true,
            message: 'A new OTP has been sent to your email address via Resend',
            data: {
                email: user.email,
                expiresIn: '10 minutes'
            }
        });

    } catch (error) {
        console.error('❌ Error resending OTP via Resend:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while resending OTP'
        });
    }
};