import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
    // File identification
    fileName: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    contentType: {
        type: String,
        required: true
    },
    
    // Document classification
    documentType: {
        type: String,
        enum: ['clinical', 'report', 'image', 'other'],
        default: 'other'
    },
    
    // Wasabi storage information
    wasabiKey: {
        type: String,
        required: true,
        unique: true
    },
    wasabiBucket: {
        type: String,
        required: true
    },
    
    // Medical references
    patientId: {
        type: String,
        index: true
    },
    studyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DicomStudy',
        index: true
    },
    
    // Audit trail
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    // Status
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Simple indexes for performance
documentSchema.index({ patientId: 1, documentType: 1 });
documentSchema.index({ studyId: 1, uploadedAt: -1 });
documentSchema.index({ wasabiKey: 1 });

export default mongoose.model('Document', documentSchema);