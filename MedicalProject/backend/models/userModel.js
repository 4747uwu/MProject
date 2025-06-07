// models/User.model.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv'; // Import if process.env is used directly here

dotenv.config(); // If BCRYPT_SALT_ROUNDS is used from .env here

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        lowercase: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/\S+@\S+\.\S+/, 'Please use a valid email address.'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'],
        select: false,
    },
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
    },
    role: {
        type: String,
        enum: ['lab_staff', 'admin', 'doctor_account'],
        required: [true, 'User role is required'],
    },
    isLoggedIn: {
        type: Boolean,
        default: false,
    },
   
  
    isActive: {
        type: Boolean,
        default: true,
    },
    lab: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
    },
     // Password reset fields
     resetPasswordOTP: {
        type: String,
        select: false // Don't include in queries by default for security
    },
    resetPasswordOTPExpires: {
        type: Date,
        select: false
    },
    resetPasswordAttempts: {
        type: Number,
        default: 0,
        select: false
    },
    resetPasswordLockedUntil: {
        type: Date,
        select: false
    }
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

UserSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', UserSchema);
export default User; 