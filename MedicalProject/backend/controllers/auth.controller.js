// controllers/auth.controller.js
import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import generateToken from '../utils/generateToken.js';
import ms from 'ms'; 
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs'; // Ensure bcrypt is imported for password hashing

dotenv.config();

export const loginUser = async (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt with email:', email);

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }

    try {
        const user = await User.findOne({ email })
            .select('+password') 
            .populate('lab', 'name identifier isActive'); 

            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({ success: false, message: 'Invalid email or password.' });
            }

        if (!user.isActive) {
            return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
        }

        if (!user.isLoggedIn) {
            user.isLoggedIn = true;
            await user.save();
        }
        // ✅ UPDATE: Track login but don't set global isLoggedIn to true
        // Instead, we'll track active sessions separately
        const token = generateToken(user._id, user.role);

        // ✅ REMOVE: Don't set cookies anymore
        // res.cookie(COOKIE_NAME, token, { ... });

        const userResponseData = {
            _id: user._id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            isActive: user.isActive,
            isLoggedIn: true,
        };

        if (user.role === 'lab_staff' && user.lab) {
            userResponseData.lab = user.lab; 
        } else if (user.role === 'doctor_account') {
            const doctorProfile = await Doctor.findOne({ userAccount: user._id })
                                        .select('-userAccount -createdAt -updatedAt -__v'); 
            if (doctorProfile) {
                userResponseData.doctorProfile = doctorProfile.toObject();
            }
        }

        // ✅ NEW: Return token in response body instead of cookie
        res.json({
            success: true,
            message: 'Login successful.',
            user: userResponseData,
            token: token, // ✅ Send token in response
            expiresIn: process.env.JWT_EXPIRES_IN || '1h'
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

export const getMe = async (req, res) => {
    const userPayload = req.user.toObject();

    if (userPayload.role === 'doctor_account') {
        const doctorProfile = await Doctor.findOne({ userAccount: userPayload._id })
                                    .select('-userAccount -createdAt -updatedAt -__v');
        if (doctorProfile) {
            userPayload.doctorProfile = doctorProfile.toObject();
        }
    }

    res.status(200).json({
        success: true,
        data: userPayload,
    });
};

// ✅ UPDATE: Simplified logout (no cookie clearing needed)
export const logoutUser = async (req, res) => {
    try {
        // Optional: Track logout in database if needed
        // Note: We don't set isLoggedIn to false globally since other tabs might be active
        await User.findByIdAndUpdate(req.user._id, { isLoggedIn: false });

        
        res.status(200).json({ 
            success: true, 
            message: 'Logged out successfully. Please clear your session data.' 
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(200).json({ success: true, message: 'Logged out successfully.' });
    }
};

// ✅ NEW: Refresh token endpoint for extending sessions
export const refreshToken = async (req, res) => {
    try {
        // Token is already validated by protect middleware
        const newToken = generateToken(req.user._id, req.user.role);
        
        res.json({
            success: true,
            token: newToken,
            expiresIn: process.env.JWT_EXPIRES_IN || '1h'
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ success: false, message: 'Failed to refresh token.' });
    }
};