// models/Patient.model.js
import mongoose from 'mongoose';

const PatientSchema = new mongoose.Schema({
    // --- Identifiers ---
    patientID: { // Application's internal Patient ID (as seen in UI)
        type: String,
        required: [true, 'Application Patient ID is required'],
        trim: true,
        index: true, // Primary lookup index
        unique: true,
    },
    mrn: { // Medical Record Number from DICOM (0010,0020)
        type: String,
        trim: true,
        index: true, // Secondary lookup index
        sparse: true // Only index non-null values
    },
    issuerOfPatientID: { // (0010,0021) Issuer of Patient ID (for MRN)
        type: String,
        trim: true,
    },

    // --- Demographics ---
    salutation: {
        type: String,
        trim: true,
        enum: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Master', 'Miss', ''],
    },
    firstName: {
        type: String,
        trim: true,
    },
    lastName: {
        type: String,
        trim: true,
    },
    patientNameRaw: { // Raw DICOM Patient's Name string
        type: String,
        trim: true,
    },
    dateOfBirth: { // YYYY-MM-DD
        type: String,
        trim: true,
    },
    gender: {
        type: String,
        trim: true,
        uppercase: true,
        enum: ['M', 'F', 'O', ''],
        index: true // Filter index
    },
    ageString: { // e.g., "065Y"
        type: String,
        trim: true,
    },
    // patientWeightKg: { type: Number }, // Uncomment if needed
    // patientHeightM: { type: Number },  // Uncomment if needed
    // ethnicGroup: { type: String, trim: true }, // Uncomment if needed
    // patientComments: { type: String, trim: true }, // From DICOM (0010,4000) - usually study specific

    // --- Embedded Attachments (for development phase) ---
    // attachments: [EmbeddedAttachmentSchema],

    // --- Embedded Workflow Status (for development phase) ---
    // This status reflects the patient's most recent/active study's general state.
    // Requires careful logic to keep synchronized if you also have statuses on DicomStudy/Assignment.
    currentWorkflowStatus: {
        type: String,
        enum: [
            'no_active_study',
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'report_in_progress',
            'report_downloaded_radiologist',
            'report_finalized',
            'report_downloaded',
            'final_report_downloaded',
            'archived'
        ],
        default: 'no_active_study',
        index: true // Critical for status filtering
    },
    // Reference to the DicomStudy that currentWorkflowStatus is primarily tracking
    activeDicomStudyRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DicomStudy',
        index: true
    },
    
    // 🔧 PERFORMANCE: Denormalized frequently accessed data
    studyCount: { type: Number, default: 0 },
    lastStudyDate: { type: Date, index: true },
    
    // 🔧 OPTIMIZED: Lean document structure
    contactInformation: {
        phone: { type: String, default: '' },
        email: { type: String, default: '', index: 'text' }
    },
    
    // 🔧 PERFORMANCE: Separate large fields to subdocuments
    clinicalInfo: {
        clinicalHistory: String,
        previousInjury: String,
        previousSurgery: String,
        lastModifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        lastModifiedAt: { type: Date, index: true }
    },
    
    // 🔧 OPTIMIZED: Cache frequently computed values
    computed: {
        fullName: String,
        displayAge: String,
        lastActivity: Date
    }
    
}, { 
    timestamps: true,
    // 🔧 PERFORMANCE: Optimize for read-heavy operations
    read: 'secondaryPreferred',
    writeConcern: { w: 1, j: false } // Faster writes for non-critical data
});

// 🔧 CRITICAL: Compound indexes for high-performance queries
PatientSchema.index({ currentWorkflowStatus: 1, createdAt: -1 }); // Status + time queries
PatientSchema.index({ 'statusInfo.assignedDoctor': 1, currentWorkflowStatus: 1 }); // Doctor assignments
PatientSchema.index({ patientID: 1, currentWorkflowStatus: 1 }); // Primary lookup with status
PatientSchema.index({ searchName: 'text', patientID: 'text' }); // Full-text search
PatientSchema.index({ lastStudyDate: -1, currentWorkflowStatus: 1 }); // Recent studies
PatientSchema.index({ 'statusInfo.priority': 1, currentWorkflowStatus: 1 }); // Priority filtering

// 🔧 PERFORMANCE: Pre-save optimization hook
PatientSchema.pre('save', function(next) {
    // Update search-optimized fields
    this.searchName = `${this.firstName || ''} ${this.lastName || ''} ${this.patientID}`.trim().toLowerCase();
    this.computed.fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    this.computed.lastActivity = new Date();
    
    // Only update patientNameRaw if names changed
    if (this.isModified('firstName') || this.isModified('lastName')) {
        this.patientNameRaw = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    }
    
    next();
});

export default mongoose.model('Patient', PatientSchema);