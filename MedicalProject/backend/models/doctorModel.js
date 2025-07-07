// models/Doctor.model.js
import mongoose from 'mongoose';

const DoctorSchema = new mongoose.Schema({
    // ...existing user account and personal info fields...
    userAccount: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true,
    },
    specialization: {
        type: String,
        required: [true, "Doctor's specialization is required"],
        trim: true,
    },
    licenseNumber: {
        type: String,
        trim: true,
        // unique: true,
        // index: true,
    },
    department: {
        type: String,
        trim: true,
    },
    qualifications: [{
        type: String,
        trim: true,
    }],
    yearsOfExperience: {
        type: Number,
        min: 0,
    },
    contactPhoneOffice: {
        type: String,
        trim: true,
    },

    assigned: {
        type: Boolean,
        default: false,
    },

    signature: {
        type: String,
        trim: true,
        default: '',
        // Store as base64 string for MongoDB storage
    },
    
    // 🔧 ENHANCED: Comprehensive signature metadata
    signatureMetadata: {
        uploadedAt: {
            type: Date,
            default: Date.now
        },
        originalSize: {
            type: Number,
            default: 0
        },
        optimizedSize: {
            type: Number,
            default: 0
        },
        originalName: {
            type: String,
            default: ''
        },
        mimeType: {
            type: String,
            default: 'image/png'
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        },
        format: {
            type: String,
            default: 'base64',
            enum: ['base64', 'buffer']
        },
        width: {
            type: Number,
            default: 400
        },
        height: {
            type: Number,
            default: 200
        }
    },
    
    signatureMetadata: {
        uploadedAt: Date,
        fileSize: Number,
        originalName: String,
        mimeType: String,
        lastUpdated: Date
    },
    
    // 🔧 HELPER: Virtual for signature URL generation
    signaturePresignedUrl: {
        type: String,
        default: ''
    },
    

    // Add tracking arrays for assigned and completed studies
    assignedStudies: [{
        study: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DicomStudy',
            required: true
        },
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient',
            required: true
        },
        assignedDate: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['assigned', 'in_progress'],
            default: 'assigned'
        }
    }],

    completedStudies: [{
        study: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DicomStudy'
        },
        patient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Patient'
        },
        completedDate: {
            type: Date,
            default: Date.now
        }
    }],

    isActiveProfile: {
        type: Boolean,
        default: true,
    }
}, { timestamps: true });

// Add indexes for better query performance
DoctorSchema.index({ 'assignedStudies.study': 1 });
DoctorSchema.index({ 'assignedStudies.patient': 1 });
DoctorSchema.index({ 'completedStudies.study': 1 });

const Doctor = mongoose.model('Doctor', DoctorSchema);
export default Doctor;