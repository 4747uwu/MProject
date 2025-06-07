// middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/userModel.js'; // Adjust path if your models are elsewhere

dotenv.config();

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'jwtAuthToken';

export const protect = async (req, res, next) => {
    let token;

    if (req.cookies && req.cookies[COOKIE_NAME]) {
        token = req.cookies[COOKIE_NAME];
    }
    // Fallback to Authorization header if you might use it for other clients (e.g., mobile)
    // else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    //     token = req.headers.authorization.split(' ')[1];
    // }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
    }

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured on the server.');
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach user to request object, excluding password
        // Populate lab info if user is lab_staff
        req.user = await User.findById(decoded.id)
                             .select('-password')
                             .populate({
                                path: 'lab', // Field in User model
                                select: 'name identifier isActive' // Fields to select from Lab model
                             });

        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
        }
        if (!req.user.isActive) {
            return res.status(403).json({ success: false, message: 'User account is deactivated' });
        }

        next();
    } catch (error) {
        console.error('Token verification error:', error.message);
        // Clear cookie if token is invalid or expired
        res.cookie(COOKIE_NAME, '', { httpOnly: true, expires: new Date(0) });

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Not authorized, token expired' });
        }
        if (error.message === 'JWT_SECRET is not configured on the server.') {
             return res.status(500).json({ success: false, message: 'Authentication configuration error.' });
        }
        return res.status(401).json({ success: false, message: 'Not authorized, token invalid' });
    }
};

export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `User role '${req.user ? req.user.role : 'unknown'}' is not authorized to access this route. Required roles: ${roles.join(', ')}.`,
            });
        }
        next();
    };
};