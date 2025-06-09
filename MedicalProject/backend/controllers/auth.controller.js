// controllers/auth.controller.js
import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';

import generateToken from '../utils/generateToken.js';
import ms from 'ms'; 
import dotenv from 'dotenv';

dotenv.config();

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'jwtAuthToken';


export const loginUser = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }

    try {
        const user = await User.findOne({ email })
            .select('+password') 
            .populate('lab', 'name identifier isActive'); 

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        if (!user.isActive) {
            return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
        }
        user.isLoggedIn = true;
        await user.save();
        const token = generateToken(user._id, user.role);

        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: ms(process.env.JWT_EXPIRES_IN || '1h'),
        });

        const userResponseData = {
            _id: user._id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            isActive: user.isActive,
            isLoggedIn: true, // Default to true if not set
        };
        console.log('User response data:', userResponseData);

        if (user.role === 'lab_staff' && user.lab) {
            userResponseData.lab = user.lab; 
        } else if (user.role === 'doctor_account') {
            const doctorProfile = await Doctor.findOne({ userAccount: user._id })
                                        .select('-userAccount -createdAt -updatedAt -__v'); 
            if (doctorProfile) {
                userResponseData.doctorProfile = doctorProfile.toObject();
            }
        }

        res.json({
            success: true,
            message: 'Login successful.',
            user: userResponseData,
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

// @desc    Get current logged-in user profile
// @route   GET /api/auth/me
// @access  Private (Protected by 'protect' middleware)
export const getMe = async (req, res) => {
    // req.user is populated by the 'protect' middleware (with lab info if applicable)
    const userPayload = req.user.toObject(); // Convert Mongoose doc to plain object

    if (userPayload.role === 'doctor_account') {
        const doctorProfile = await Doctor.findOne({ userAccount: userPayload._id })
                                    .select('-userAccount -createdAt -updatedAt -__v'); // Exclude fields
        if (doctorProfile) {
            userPayload.doctorProfile = doctorProfile.toObject();
        }
    }

    res.status(200).json({
        success: true,
        data: userPayload,
    });
};

// @desc    Log user out / clear cookie
// @route   POST /api/auth/logout
// @access  Private (user must be logged in to log out)
export const logoutUser = async (req, res) => {
    try {
        // 🔧 FIX: Update isLoggedIn to false when user logs out
        if (req.user && req.user._id) {
            await User.findByIdAndUpdate(req.user._id, { isLoggedIn: false });
        }

        res.cookie(COOKIE_NAME, '', { // Set cookie to empty
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: new Date(0), // Expire immediately
        });
        
        res.status(200).json({ success: true, message: 'Logged out successfully.' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(200).json({ success: true, message: 'Logged out successfully.' }); // Still clear cookie even if DB update fails
    }
};