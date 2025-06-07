import mongoose from 'mongoose';

// 🔧 OPTIMIZED: Define embedded schemas for better performance
const EmbeddedAttachmentSchema = new mongoose.Schema({
    fileName: { 
        type: String, 
        required: true,
        trim: true 
    },
    fileSize: { type: Number },
    fileType: { 
        type: String,
        trim: true 
    },
    fileTypeOrCategory: { 
        type: String,
        enum: ['medical_report', 'lab_result', 'prescription', 'imaging', 'other'],
        default: 'other'
    },
    storageIdentifier: { 
        type: String, 
        required: true // File path or cloud storage identifier
    },
    uploadedAt: { 
        type: Date, 
        default: Date.now,
        index: true 
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, { _id: true });

// 🔧 PERFORMANCE: Medical history subdocument
const MedicalHistorySchema = new mongoose.Schema({
    clinicalHistory: { type: String, default: '' },
    previousInjury: { type: String, default: '' },
    previousSurgery: { type: String, default: '' },
    allergies: { type: String, default: '' },
    medications: { type: String, default: '' },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastModifiedAt: { 
        type: Date, 
        default: Date.now,
        index: true 
    }
}, { _id: false });

// 🔧 OPTIMIZED: Contact information subdocument
const ContactInformationSchema = new mongoose.Schema({
    phone: { type: String, default: '', trim: true },
    email: { 
        type: String, 
        default: '', 
        trim: true,
        lowercase: true,
        index: 'text'
    },
    address: {
        street: { type: String, default: '', trim: true },
        city: { type: String, default: '', trim: true },
        state: { type: String, default: '', trim: true },
        zipCode: { type: String, default: '', trim: true },
        country: { type: String, default: '', trim: true }
    },
    emergencyContact: {
        name: { type: String, default: '', trim: true },
        phone: { type: String, default: '', trim: true },
        relationship: { type: String, default: '', trim: true }
    }
}, { _id: false });

// 🔧 PERFORMANCE: Status tracking subdocument
const StatusInfoSchema = new mongoose.Schema({
    assignedDoctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        index: true
    },
    priority: {
        type: String,
        enum: ['URGENT', 'HIGH', 'NORMAL', 'LOW'],
        default: 'NORMAL',
        index: true
    },
    lastStatusChange: {
        type: Date,
        default: Date.now,
        index: true
    },
    statusChangedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { _id: false });

// 🔧 OPTIMIZED: Main Patient Schema
const PatientSchema = new mongoose.Schema({
    // --- Core Identifiers ---
    patientID: { 
        type: String,
        required: [true, 'Application Patient ID is required'],
        trim: true,
        index: true,
        unique: true,
    },
    mrn: { 
        type: String,
        trim: true,
        index: true,
        sparse: true
    },
    issuerOfPatientID: { 
        type: String,
        trim: true,
    },

    // --- Demographics ---
    salutation: {
        type: String,
        trim: true,
        enum: ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Master', 'Miss', ''],
        default: ''
    },
    firstName: {
        type: String,
        trim: true,
        index: 'text'
    },
    lastName: {
        type: String,
        trim: true,
        index: 'text'
    },
    patientNameRaw: { 
        type: String,
        trim: true,
        index: 'text'
    },
    dateOfBirth: { 
        type: String,
        trim: true,
        index: true
    },
    gender: {
        type: String,
        trim: true,
        uppercase: true,
        enum: ['M', 'F', 'O', ''],
        default: '',
        index: true
    },
    ageString: { 
        type: String,
        trim: true,
    },

    // 🔧 PERFORMANCE: Additional demographic fields
    patientWeightKg: { type: Number },
    patientHeightM: { type: Number },
    ethnicGroup: { type: String, trim: true },
    patientComments: { type: String, trim: true },

    // --- Embedded Attachments ---
    attachments: [EmbeddedAttachmentSchema],

    // --- Workflow Status ---
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
        index: true
    },
    
    // Reference to active study
    activeDicomStudyRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DicomStudy',
        index: true
    },
    
    // 🔧 PERFORMANCE: Denormalized data for faster queries
    studyCount: { 
        type: Number, 
        default: 0,
        index: true
    },
    lastStudyDate: { 
        type: Date, 
        index: true 
    },
    
    // --- Embedded Documents ---
    contactInformation: ContactInformationSchema,
    medicalHistory: MedicalHistorySchema,
    statusInfo: StatusInfoSchema,
    
    // 🔧 OPTIMIZED: Computed fields for performance
    computed: {
        fullName: { type: String, index: 'text' },
        displayAge: String,
        lastActivity: { type: Date, index: true },
        searchableText: { type: String, index: 'text' }
    },

    // 🔧 PERFORMANCE: Search optimization field
    searchName: { 
        type: String, 
        index: 'text' 
    }
    
}, { 
    timestamps: true,
    // 🔧 PERFORMANCE: Optimize for read-heavy operations
    read: 'secondaryPreferred',
    writeConcern: { w: 1, j: false }
});

// 🔧 CRITICAL: High-performance compound indexes
PatientSchema.index({ currentWorkflowStatus: 1, createdAt: -1 });
PatientSchema.index({ 'statusInfo.assignedDoctor': 1, currentWorkflowStatus: 1 });
PatientSchema.index({ patientID: 1, currentWorkflowStatus: 1 });
PatientSchema.index({ lastStudyDate: -1, currentWorkflowStatus: 1 });
PatientSchema.index({ 'statusInfo.priority': 1, currentWorkflowStatus: 1 });
PatientSchema.index({ 'computed.searchableText': 'text', patientID: 'text' });

// 🔧 PERFORMANCE: Optimized text search index
PatientSchema.index({
    'computed.fullName': 'text',
    patientID: 'text',
    'contactInformation.email': 'text',
    'contactInformation.phone': 'text'
}, {
    name: 'patient_search_index',
    weights: {
        'computed.fullName': 10,
        patientID: 8,
        'contactInformation.email': 5,
        'contactInformation.phone': 3
    }
});

// 🔧 PERFORMANCE: Pre-save optimization hooks
PatientSchema.pre('save', function(next) {
    // Update computed fields for faster queries
    const firstName = this.firstName || '';
    const lastName = this.lastName || '';
    
    this.computed.fullName = `${firstName} ${lastName}`.trim();
    this.computed.lastActivity = new Date();
    
    // Create searchable text for full-text search
    this.computed.searchableText = [
        this.patientID,
        this.mrn,
        firstName,
        lastName,
        this.patientNameRaw,
        this.contactInformation?.email,
        this.contactInformation?.phone
    ].filter(Boolean).join(' ').toLowerCase();
    
    // Update search name
    this.searchName = `${firstName} ${lastName} ${this.patientID}`.trim().toLowerCase();
    
    // Update patientNameRaw if names changed
    if (this.isModified('firstName') || this.isModified('lastName')) {
        this.patientNameRaw = this.computed.fullName;
    }
    
    // Auto-calculate age if DOB exists
    if (this.dateOfBirth) {
        try {
            const dob = new Date(this.dateOfBirth);
            const today = new Date();
            const age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                this.ageString = `${String(age - 1).padStart(3, '0')}Y`;
                this.computed.displayAge = `${age - 1} years`;
            } else {
                this.ageString = `${String(age).padStart(3, '0')}Y`;
                this.computed.displayAge = `${age} years`;
            }
        } catch (error) {
            console.warn('Error calculating age:', error);
        }
    }
    
    next();
});

// 🔧 PERFORMANCE: Post-save hook for study count maintenance
PatientSchema.post('save', async function(doc) {
    try {
        // Update study count if needed (run async to not block save)
        if (this.isModified('activeDicomStudyRef')) {
            setImmediate(async () => {
                const DicomStudy = mongoose.model('DicomStudy');
                const studyCount = await DicomStudy.countDocuments({ patient: doc._id });
                
                if (studyCount !== doc.studyCount) {
                    await this.constructor.findByIdAndUpdate(doc._id, { 
                        studyCount,
                        'computed.lastActivity': new Date()
                    });
                }
            });
        }
    } catch (error) {
        console.warn('Error updating patient study count:', error);
    }
});

// 🔧 PERFORMANCE: Instance methods for common operations
PatientSchema.methods.getFullName = function() {
    return this.computed.fullName || `${this.firstName || ''} ${this.lastName || ''}`.trim();
};

PatientSchema.methods.addAttachment = function(attachmentData) {
    this.attachments.push(attachmentData);
    this.computed.lastActivity = new Date();
    return this.save();
};

PatientSchema.methods.updateWorkflowStatus = function(status, assignedBy = null) {
    this.currentWorkflowStatus = status;
    this.statusInfo.lastStatusChange = new Date();
    if (assignedBy) {
        this.statusInfo.statusChangedBy = assignedBy;
    }
    this.computed.lastActivity = new Date();
    return this.save();
};

// 🔧 PERFORMANCE: Static methods for optimized queries
PatientSchema.statics.findByPatientID = function(patientID) {
    return this.findOne({ patientID }).lean();
};

PatientSchema.statics.searchPatients = function(searchTerm, options = {}) {
    const { limit = 20, skip = 0, status } = options;
    
    const query = {
        $or: [
            { patientID: { $regex: searchTerm, $options: 'i' } },
            { 'computed.fullName': { $regex: searchTerm, $options: 'i' } },
            { 'contactInformation.email': { $regex: searchTerm, $options: 'i' } },
            { 'contactInformation.phone': { $regex: searchTerm, $options: 'i' } }
        ]
    };
    
    if (status) {
        query.currentWorkflowStatus = status;
    }
    
    return this.find(query)
        .select('patientID computed.fullName currentWorkflowStatus contactInformation lastStudyDate')
        .sort({ 'computed.lastActivity': -1 })
        .limit(limit)
        .skip(skip)
        .lean();
};

PatientSchema.statics.getPatientStats = function() {
    return this.aggregate([
        {
            $group: {
                _id: '$currentWorkflowStatus',
                count: { $sum: 1 }
            }
        }
    ]);
};

export default mongoose.model('Patient', PatientSchema);