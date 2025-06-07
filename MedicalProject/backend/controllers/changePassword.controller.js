import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import bcrypt from 'bcryptjs';

/**
 * Change password for any user (admin, doctor, lab_staff)
 * Requires: oldPassword, newPassword, confirmPassword
 */
export const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const userId = req.user.id; // From auth middleware

        // Validation
        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Old password, new password, and confirm password are required'
            });
        }

        // Check if new password and confirm password match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password and confirm password do not match'
            });
        }

        // Password strength validation
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        // Find user with password field included
        const user = await User.findById(userId).select('+password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify old password
        const isOldPasswordCorrect = await user.comparePassword(oldPassword);
        
        if (!isOldPasswordCorrect) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Check if new password is different from old password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password'
            });
        }

        // Update password (pre-save hook will hash it)
        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while changing password'
        });
    }
};

/**
 * Admin function to reset any user's password
 * Only accessible by admin users
 */
export const adminResetUserPassword = async (req, res) => {
    try {
        const { targetUserId, newPassword, confirmPassword } = req.body;
        const adminUser = req.user;

        // Check if current user is admin
        if (adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required'
            });
        }

        // Validation
        if (!targetUserId || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Target user ID, new password, and confirm password are required'
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
                message: 'New password must be at least 6 characters long'
            });
        }

        // Find target user
        const targetUser = await User.findById(targetUserId);
        
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'Target user not found'
            });
        }

        // Update password
        targetUser.password = newPassword;
        await targetUser.save();

        res.status(200).json({
            success: true,
            message: `Password reset successfully for user: ${targetUser.fullName}`,
            data: {
                userId: targetUser._id,
                username: targetUser.username,
                fullName: targetUser.fullName,
                role: targetUser.role
            }
        });

    } catch (error) {
        console.error('Error in admin password reset:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while resetting password'
        });
    }
};

/**
 * Get user profile information for password change form
 */
export const getUserProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let profileData = {
            _id: user._id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };

        // If user is a doctor, get additional doctor information
        if (user.role === 'doctor_account') {
            const doctorProfile = await Doctor.findOne({ userAccount: userId })
                .populate('userAccount', 'fullName email username');
            
            if (doctorProfile) {
                profileData.doctorInfo = {
                    specialization: doctorProfile.specialization,
                    licenseNumber: doctorProfile.licenseNumber,
                    department: doctorProfile.department,
                    qualifications: doctorProfile.qualifications,
                    yearsOfExperience: doctorProfile.yearsOfExperience,
                    contactPhoneOffice: doctorProfile.contactPhoneOffice,
                    isActiveProfile: doctorProfile.isActiveProfile
                };
            }
        }

        res.status(200).json({
            success: true,
            data: profileData
        });

    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile'
        });
    }
};

/**
 * Validate current password (useful for sensitive operations)
 */
export const validateCurrentPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user.id;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required'
            });
        }

        const user = await User.findById(userId).select('+password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const isPasswordCorrect = await user.comparePassword(password);

        res.status(200).json({
            success: true,
            isValid: isPasswordCorrect,
            message: isPasswordCorrect ? 'Password is correct' : 'Password is incorrect'
        });

    } catch (error) {
        console.error('Error validating password:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while validating password'
        });
    }
};

/**
 * Get all users (for admin to manage password resets)
 */
export const getAllUsersForAdmin = async (req, res) => {
    try {
        const adminUser = req.user;

        // Check if current user is admin
        if (adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required'
            });
        }

        const users = await User.find({ isActive: true })
            .select('-password')
            .populate('lab', 'name identifier')
            .sort({ createdAt: -1 });

        // Get doctor information for doctor accounts
        const usersWithDoctorInfo = await Promise.all(
            users.map(async (user) => {
                const userObj = user.toObject();
                
                if (user.role === 'doctor_account') {
                    const doctorProfile = await Doctor.findOne({ userAccount: user._id })
                        .select('specialization licenseNumber department');
                    
                    if (doctorProfile) {
                        userObj.doctorInfo = doctorProfile;
                    }
                }
                
                return userObj;
            })
        );

        res.status(200).json({
            success: true,
            count: usersWithDoctorInfo.length,
            data: usersWithDoctorInfo
        });

    } catch (error) {
        console.error('Error fetching users for admin:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching users'
        });
    }
};