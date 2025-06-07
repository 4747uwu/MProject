// utils/generateToken.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config(); // Ensure .env variables are loaded

const generateToken = (userId, userRole) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not defined in .env file');
    }
    if (!process.env.JWT_EXPIRES_IN) {
        console.warn('JWT_EXPIRES_IN is not defined in .env file, defaulting to 1h');
    }

    return jwt.sign(
        { id: userId, role: userRole }, // Payload
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );
};

export default generateToken;