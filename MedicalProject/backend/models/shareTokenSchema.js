// 🆕 NEW: models/shareTokenModel.js
import mongoose from 'mongoose';

const shareTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  studyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DicomStudy',
    required: true
  },
  studyInstanceUID: {
    type: String,
    required: true
  },
  orthancStudyID: {
    type: String
  },
  viewerType: {
    type: String,
    enum: ['ohif-local', 'ohif-cloud', 'stone-viewer'],
    required: true
  },
  patientName: String,
  studyDescription: String,
  modality: String,
  studyDate: Date,
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL index
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: String,
    default: 'system'
  },
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: Date,
  accessHistory: [{
    accessedAt: Date,
    userAgent: String,
    ip: String
  }],
  metadata: {
    userAgent: String,
    ip: String,
    createdAt: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
shareTokenSchema.index({ expiresAt: 1 });
shareTokenSchema.index({ studyId: 1 });
shareTokenSchema.index({ studyInstanceUID: 1 });

const ShareToken = mongoose.model('ShareToken', shareTokenSchema);

export default ShareToken;