// models/DicomStudy.model.js
import mongoose from 'mongoose';

const DicomStudySchema = new mongoose.Schema({
    studyInstanceUID: {
        type: String,
        required: true,
        unique: true,
        index: { unique: true, background: true } // 🔥 Background index creation
    },
    
    // 🔧 CRITICAL: Optimized patient reference
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
        required: true,
        index: { background: true } // 🔥 Background indexing
    },
    patientId: { 
        type: String, 
        required: true,
        index: { background: true } // 🔥 Background indexing
    },
    
    // 🔧 PERFORMANCE: Denormalized patient data for faster queries
    patientInfo: {
        patientID: { type: String, index: { sparse: true, background: true } }, // 🔥 Sparse index
        patientName: { type: String, index: { sparse: true, background: true } }, // 🔥 Sparse index
        age: String,
        gender: { type: String, index: { sparse: true, background: true } } // 🔥 Gender filtering
    },
    
    // 🔧 OPTIMIZED: Study metadata with indexes
    studyDate: { 
        type: Date, 
        index: { background: true },
        // 🔥 ADD: Default to current date for faster inserts
        default: Date.now
    },
    modality: { 
        type: String, 
        index: { background: true },
        enum: ['CT', 'MRI', 'XR', 'US', 'DX', 'CR', 'MG', 'NM', 'PT'],
        // 🔥 ADD: Default value to avoid null checks
        default: 'CT'
    },
    accessionNumber: { 
        type: String, 
        index: { sparse: true, background: true } // 🔥 Sparse index for optional fields
    },
    
    // 🔧 CRITICAL: Workflow management
    workflowStatus: {
        type: String,
        enum: [
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'doctor_opened_report',
            'report_in_progress',
            'report_drafted',
            'report_finalized',
            'report_uploaded',
            'report_downloaded_radiologist',
            'report_downloaded',
            'final_report_downloaded',
            'archived'
        ],
        default: 'new_study_received',
        index: { background: true } // 🔥 Most queried field
    },

    currentCategory: {
        type: String,
        enum: [
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'doctor_opened_report',
            'report_in_progress',
            'report_drafted',
            'report_finalized',
            'report_uploaded',
            'report_downloaded_radiologist',
            'report_downloaded',
            'final_report_downloaded',
            'archived'
        ],
        default: 'new_study_received',
        index: { background: true } // 🔥 Background indexing
    },
    
    generated: {
        type: String,
        enum: ['yes', 'no'],
        default: 'no',
        index: { sparse: true, background: true } // 🔥 Sparse index
    },

    technologist: {
        name: { type: String, trim: true },
        mobile: { type: String, trim: true },
        comments: { type: String, trim: true },
        reasonToSend: { type: String, trim: true }
    },
    
    // 🔧 PERFORMANCE: Assignment tracking
    assignment: [{
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: { sparse: true, background: true } // 🔥 Sparse - not all studies assigned
        },
        assignedAt: { 
            type: Date, 
            index: { sparse: true, background: true } // 🔥 Sparse index
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        dueDate: { 
            type: Date, 
            index: { sparse: true, background: true } // 🔥 Due date filtering
        },
        priority: {
            type: String,
            enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
            default: 'NORMAL',
            index: { background: true } // 🔥 Priority filtering
        }
    }],

    studyPriority: {
        type: String,
        enum: ['SELECT', 'Emergency Case', 'Meet referral doctor', 'MLC Case', 'Study Exception'],
        default: 'SELECT',
        index: { background: true } // 🔥 Priority queries
    },

    // 🆕 Legacy field for backward compatibility
    lastAssignedDoctor: [{
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor',
            index: { sparse: true, background: true } // 🔥 Sparse index for historical entries
        },
        assignedAt: {
            type: Date,
            index: { sparse: true, background: true } // 🔥 Sparse index for historical entries
        }
    }],
    
    // 🔧 OPTIMIZED: Status history with size limit
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String
    }],
    
    // 🔧 PERFORMANCE: Report tracking
    reportInfo: {
        startedAt: Date,
        finalizedAt: Date,
        downloadedAt: Date,
        reporterName: String,
        reportContent: String
    },
    
    // 🔧 OPTIMIZED: TAT tracking
    timingInfo: {
        uploadToAssignmentMinutes: { type: Number, index: { sparse: true, background: true } }, // 🔥 Performance metrics
        assignmentToReportMinutes: { type: Number, index: { sparse: true, background: true } },
        reportToDownloadMinutes: { type: Number, index: { sparse: true, background: true } },
        totalTATMinutes: { type: Number, index: { sparse: true, background: true } } // 🔥 TAT reporting
    },
    
    // 🔧 PERFORMANCE: Lab information
    sourceLab: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        index: { background: true } // 🔥 Lab filtering very common
    },
    ReportAvailable: {
        type: Boolean,
        default: false,
        index: { background: true }, // 🔥 Report availability filtering
        required: false
    },
    
    // 🔧 CRITICAL: Search optimization
    searchText: { 
        type: String, 
        index: { 
            name: 'searchTextIndex',
            background: true,
            // 🔥 SUPER FAST: Text search optimization
            weights: {
                searchText: 10,
                'patientInfo.patientName': 5,
                'patientInfo.patientID': 3,
                accessionNumber: 2
            }
        }
    },
    
    uploadedReports: [{
        filename: String,
        contentType: String,
        data: String, // base64 encoded
        size: Number,
        reportType: {
            type: String,
            enum: ['uploaded-report', 'generated-template'],
            default: 'uploaded-report'
        },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: String,
        reportStatus: {
            type: String,
            enum: ['draft', 'finalized'],
            default: 'finalized'
        },
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor'
        }
    }],

    doctorReports: [{
        filename: String,
        contentType: String,
        data: String, // base64 encoded
        size: Number,
        reportType: {
            type: String,
            enum: ['doctor-report', 'radiologist-report'],
            default: 'doctor-report'
        },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: String,
        reportStatus: {
            type: String,
            enum: ['draft', 'finalized'],
            default: 'finalized'
        },
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Doctor'
        }
    }],
    
    // 🆕 Series and Instance tracking
    seriesCount: {
        type: Number,
        default: 0,
        index: { sparse: true, background: true } // 🔥 For statistics
    },
    instanceCount: {
        type: Number,
        default: 0,
        index: { sparse: true, background: true } // 🔥 For statistics
    },
    seriesImages: {
        type: String,
        default: "0/0"
    },
    
    // Missing fields used in orthanc.routes.js:
    studyTime: { type: String },
    modalitiesInStudy: [{ type: String }],
    examDescription: { 
        type: String,
        index: { sparse: true, background: true } // 🔥 Exam description search
    },
    institutionName: { 
        type: String,
        index: { sparse: true, background: true } // 🔥 Institution filtering
    },
    orthancStudyID: { 
        type: String, 
        index: { sparse: true, background: true } // 🔥 Orthanc integration
    },
    
    // DICOM files storage
    dicomFiles: [{
        sopInstanceUID: String,
        seriesInstanceUID: String,
        orthancInstanceId: String,
        modality: String,
        storageType: { type: String, default: 'orthanc' },
        uploadedAt: { type: Date, default: Date.now }
    }],
    
    // Case type for priority
    caseType: {
        type: String,
        enum: [
            'routine', 'urgent', 'stat', 'emergency',
            'ROUTINE', 'URGENT', 'STAT', 'EMERGENCY',
            'Billed Study', 'New Study'
        ],
        default: 'routine',
        index: { background: true } // 🔥 Case type filtering
    },
    discussions: [{
        comment: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000 // Prevent extremely long comments
        },
        userName: {
            type: String,
            required: true,
            trim: true
        },
        userRole: {
            type: String,
            required: true,
            enum: ['admin', 'doctor_account', 'lab_staff', 'technician'],
            index: { background: true } // For filtering by role
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false, // Optional for backward compatibility
            index: { sparse: true, background: true }
        },
        dateTime: {
            type: Date,
            required: true,
            default: Date.now,
            index: { background: true } // For sorting discussions chronologically
        },


    }],
    
    // Referring physician information
    referringPhysician: {
        name: { type: String, trim: true },
        institution: { type: String, trim: true },
        contactInfo: { type: String, trim: true }
    },
    referringPhysicianName: { 
        type: String, 
        trim: true,
        index: { sparse: true, background: true } // 🔥 Physician search
    },

    physicians: {
        referring: {
            name: { type: String, trim: true },
            email: { type: String, trim: true },
            mobile: { type: String, trim: true },
            institution: { type: String, trim: true }
        },
        requesting: {
            name: { type: String, trim: true },
            email: { type: String, trim: true },
            mobile: { type: String, trim: true },
            institution: { type: String, trim: true }
        }
    },
    modifiedDate: { type: Date },
    modifiedTime: { type: String },
    reportDate: { 
        type: Date,
        index: { sparse: true, background: true } // 🔥 Report date filtering
    },
    reportTime: { type: String },
    
    // 🆕 NEW: Add calculatedTAT field to store TAT values
    calculatedTAT: {
        // Raw TAT values in minutes
        studyToUploadTAT: { type: Number, default: null, index: { sparse: true, background: true } },
        uploadToAssignmentTAT: { type: Number, default: null, index: { sparse: true, background: true } },
        assignmentToReportTAT: { type: Number, default: null, index: { sparse: true, background: true } },
        studyToReportTAT: { type: Number, default: null, index: { sparse: true, background: true } },
        uploadToReportTAT: { type: Number, default: null, index: { sparse: true, background: true } },
        totalTATMinutes: { type: Number, default: null, index: { sparse: true, background: true } },
        totalTATDays: { type: Number, default: null, index: { sparse: true, background: true } },
        
        // Reset-aware calculations
        resetAwareTATDays: { type: Number, default: null },
        resetAwareTATMinutes: { type: Number, default: null },
        
        // Formatted versions for quick access
        studyToUploadTATFormatted: { type: String, default: 'N/A' },
        uploadToAssignmentTATFormatted: { type: String, default: 'N/A' },
        assignmentToReportTATFormatted: { type: String, default: 'N/A' },
        studyToReportTATFormatted: { type: String, default: 'N/A' },
        uploadToReportTATFormatted: { type: String, default: 'N/A' },
        totalTATFormatted: { type: String, default: 'N/A' },
        
        // Status and metadata
        isCompleted: { type: Boolean, default: false },
        isOverdue: { type: Boolean, default: false, index: { background: true } },
        phase: { 
            type: String, 
            enum: ['not_started', 'uploaded', 'assigned', 'completed'],
            default: 'not_started',
            index: { background: true }
        },
        
        // Calculation metadata
        calculatedAt: { type: Date, default: Date.now },
        calculatedBy: { type: String, default: 'system' },
        lastUpdated: { type: Date, default: Date.now },
        
        // Reset information
        resetAt: { type: Date },
        resetReason: { type: String },
        resetCount: { type: Number, default: 0 },
        
        // Key dates snapshot
        keyDates: {
            studyDate: { type: Date },
            uploadDate: { type: Date },
            assignedDate: { type: Date },
            reportDate: { type: Date },
            calculationTime: { type: Date }
        }
    },

    // 🔧 UPDATE: Enhanced timingInfo for backward compatibility
    timingInfo: {
        uploadToAssignmentMinutes: { type: Number, index: { sparse: true, background: true } },
        assignmentToReportMinutes: { type: Number, index: { sparse: true, background: true } },
        reportToDownloadMinutes: { type: Number, index: { sparse: true, background: true } },
        totalTATMinutes: { type: Number, index: { sparse: true, background: true } },
        
        // Reset tracking
        tatResetAt: { type: Date },
        tatResetReason: { type: String },
        tatResetCount: { type: Number, default: 0 },
        
        // Calculation metadata
        lastCalculated: { type: Date },
        calculationMethod: { type: String, default: 'tatCalculator' }
    },

}, { 
    timestamps: true,
    // 🔧 SUPER FAST: Collection-level optimizations
    collection: 'dicomstudies', // 🔥 Explicit collection name
    // 🔥 PERFORMANCE: Optimize document structure
    minimize: false, // Don't remove empty objects
    versionKey: false, // Remove __v field for smaller documents
    // 🔥 CACHING: Enable query result caching
    read: 'primary', // Read from primary, fallback to secondary
    // 🔥 COMPRESSION: Enable document compression
    strict: true, // Strict schema validation for performance
    validateBeforeSave: true, // Validate before save for data integrity
    autoIndex: false, // 🔥 CRITICAL: Disable auto-indexing in production
    bufferCommands: false, // 🔥 Disable command buffering for immediate execution
});

// 🔧 SUPER FAST: High-performance compound indexes (ORDER MATTERS!)
// 🔥 MOST CRITICAL: Primary dashboard query (status + date)
DicomStudySchema.index({ 
    workflowStatus: 1, 
    createdAt: -1 
}, { 
    name: 'workflowStatus_createdAt',
    background: true 
});

// 🔥 DOCTOR WORKLOAD: Most frequent doctor queries
DicomStudySchema.index({ 
    'assignment.assignedTo': 1, 
    workflowStatus: 1, 
    createdAt: -1 
}, { 
    name: 'doctor_workload',
    background: true,
    sparse: true 
});

// 🔥 LAB DASHBOARD: Lab-specific queries
DicomStudySchema.index({ 
    sourceLab: 1, 
    workflowStatus: 1, 
    createdAt: -1 
}, { 
    name: 'lab_dashboard',
    background: true 
});

// 🔥 PATIENT HISTORY: Patient timeline
DicomStudySchema.index({ 
    patient: 1, 
    studyDate: -1, 
    createdAt: -1 
}, { 
    name: 'patient_history',
    background: true 
});

// 🔥 MODALITY REPORTS: Modality-based filtering
DicomStudySchema.index({ 
    modality: 1, 
    studyDate: -1, 
    workflowStatus: 1 
}, { 
    name: 'modality_reports',
    background: true 
});

// 🔥 PRIORITY QUEUE: Urgent cases
DicomStudySchema.index({ 
    'assignment.priority': 1, 
    workflowStatus: 1, 
    createdAt: -1 
}, { 
    name: 'priority_queue',
    background: true,
    sparse: true 
});

// 🔥 TIME-BASED QUERIES: Date range filtering
DicomStudySchema.index({ 
    studyDate: -1, 
    createdAt: -1, 
    workflowStatus: 1 
}, { 
    name: 'time_based_queries',
    background: true 
});

// 🔥 SEARCH OPTIMIZATION: Text search with relevance
DicomStudySchema.index({ 
    searchText: 'text',
    'patientInfo.patientName': 'text',
    'patientInfo.patientID': 'text',
    accessionNumber: 'text'
}, { 
    name: 'comprehensive_search',
    background: true,
    weights: {
        searchText: 10,
        'patientInfo.patientName': 8,
        'patientInfo.patientID': 6,
        accessionNumber: 4
    }
});

// 🔥 PERFORMANCE ANALYTICS: TAT reporting
DicomStudySchema.index({ 
    'timingInfo.totalTATMinutes': 1, 
    studyDate: -1 
}, { 
    name: 'tat_analytics',
    background: true,
    sparse: true 
});

// 🔥 REPORT STATUS: Report availability
DicomStudySchema.index({ 
    ReportAvailable: 1, 
    workflowStatus: 1, 
    createdAt: -1 
}, { 
    name: 'report_status',
    background: true 
});

// 🔧 SUPER FAST: Pre-save middleware optimizations
DicomStudySchema.pre('save', function(next) {
    // 🔥 PERFORMANCE: Limit status history to prevent document bloat
    if (this.statusHistory && this.statusHistory.length > 50) {
        this.statusHistory = this.statusHistory.slice(-50);
    }
    
    // 🔥 PERFORMANCE: Limit uploaded reports to prevent huge documents
    if (this.uploadedReports && this.uploadedReports.length > 20) {
        this.uploadedReports = this.uploadedReports.slice(-20);
    }
    
    if (this.doctorReports && this.doctorReports.length > 20) {
        this.doctorReports = this.doctorReports.slice(-20);
    }
    
    // 🔥 NORMALIZATION: Normalize caseType to lowercase for consistency
    if (this.caseType) {
        this.caseType = this.caseType.toLowerCase();
    }
    
    // 🔥 SEARCH OPTIMIZATION: Build comprehensive search text
    const searchTerms = [
        this.patientInfo?.patientName || '',
        this.patientInfo?.patientID || '',
        this.accessionNumber || '',
        this.modality || '',
        this.referringPhysicianName || '',
        this.examDescription || '',
        this.studyInstanceUID || ''
    ].filter(term => term.trim().length > 0);
    
    this.searchText = searchTerms.join(' ').toLowerCase();
    
    // 🔥 PERFORMANCE: Auto-calculate series images string
    if (this.seriesCount >= 0 && this.instanceCount >= 0) {
        this.seriesImages = `${this.seriesCount}/${this.instanceCount}`;
    }
    
    next();
});

// 🔥 PERFORMANCE: Post-save middleware for cleanup
DicomStudySchema.post('save', function(doc) {
    // 🔥 ANALYTICS: Could trigger background analytics updates here
    // Don't put heavy operations here - use background jobs instead
});

// 🔥 QUERY OPTIMIZATION: Static methods for common queries
DicomStudySchema.statics.findByWorkflowStatus = function(status, limit = 50) {
    return this.find({ workflowStatus: status })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(); // 🔥 Use lean() for faster queries when you don't need full mongoose documents
};

DicomStudySchema.statics.findByDoctor = function(doctorId, status = null, limit = 50) {
    const query = { 'assignment.assignedTo': doctorId };
    if (status) query.workflowStatus = status;
    
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};

DicomStudySchema.statics.findByLab = function(labId, status = null, limit = 50) {
    const query = { sourceLab: labId };
    if (status) query.workflowStatus = status;
    
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};

// 🔥 CACHING: Virtual for computed fields
DicomStudySchema.virtual('isUrgent').get(function() {
    return this.assignment?.priority === 'URGENT' || 
           this.studyPriority === 'Emergency Case' ||
           this.caseType === 'emergency';
});

// 🔥 PERFORMANCE: Transform output to remove heavy fields when not needed
DicomStudySchema.methods.toSummary = function() {
    return {
        _id: this._id,
        studyInstanceUID: this.studyInstanceUID,
        patientInfo: this.patientInfo,
        studyDate: this.studyDate,
        modality: this.modality,
        workflowStatus: this.workflowStatus,
        assignment: this.assignment,
        seriesImages: this.seriesImages,
        createdAt: this.createdAt,
        ReportAvailable: this.ReportAvailable
    };
};

// 🔧 MIDDLEWARE: Auto-calculate TAT on save
DicomStudySchema.pre('save', async function(next) {
    // Import TAT calculator (use dynamic import to avoid circular dependency)
    try {
        const { calculateStudyTAT } = await import('../utils/TATutility.js');
        
        // 🔧 CALCULATE: TAT whenever study is saved
        if (this.isModified(['createdAt', 'assignment', 'reportInfo', 'workflowStatus']) || this.isNew) {
            console.log(`[Schema Middleware] 🔄 Auto-calculating TAT for study: ${this.studyInstanceUID}`);
            
            const tat = calculateStudyTAT(this.toObject());
            
            // Update calculatedTAT field
            this.calculatedTAT = tat;
            
            // Update timingInfo for backward compatibility
            this.timingInfo = this.timingInfo || {};
            this.timingInfo.uploadToAssignmentMinutes = tat.uploadToAssignmentTAT;
            this.timingInfo.assignmentToReportMinutes = tat.assignmentToReportTAT;
            this.timingInfo.totalTATMinutes = tat.totalTATMinutes;
            this.timingInfo.lastCalculated = new Date();
            this.timingInfo.calculationMethod = 'tatCalculator';
            
            console.log(`[Schema Middleware] ✅ TAT auto-calculated - Total: ${tat.totalTATFormatted}`);
        }
    } catch (error) {
        console.error('[Schema Middleware] ❌ Error auto-calculating TAT:', error);
        // Don't fail the save operation
    }
    
    // Continue with existing pre-save logic
    // ... rest of your existing pre-save middleware
    
    next();
});

// 🔧 METHODS: Instance method to get current TAT
DicomStudySchema.methods.getCurrentTAT = function(forceRecalculate = false) {
    if (forceRecalculate || !this.calculatedTAT?.calculatedAt) {
        // Dynamically import and calculate
        return import('../utils/tatCalculator.js').then(({ calculateStudyTAT }) => {
            return calculateStudyTAT(this.toObject());
        });
    }
    return Promise.resolve(this.calculatedTAT);
};

// 🔧 METHODS: Instance method to reset TAT
DicomStudySchema.methods.resetTAT = function(reason = 'manual_reset') {
    return import('../utils/tatCalculator.js').then(({ resetStudyTAT }) => {
        return resetStudyTAT(this._id, reason);
    });
};

// 🔧 STATICS: Static method to bulk update TAT
DicomStudySchema.statics.bulkUpdateTAT = async function(query = {}) {
    const { calculateBatchTAT } = await import('../utils/tatCalculator.js');
    
    const studies = await this.find(query).lean();
    const tatResults = calculateBatchTAT(studies);
    
    const bulkOps = studies.map((study, index) => ({
        updateOne: {
            filter: { _id: study._id },
            update: { 
                $set: { 
                    calculatedTAT: tatResults[index],
                    'timingInfo.totalTATMinutes': tatResults[index].totalTATMinutes,
                    'timingInfo.lastCalculated': new Date()
                }
            }
        }
    }));

    if (bulkOps.length > 0) {
        await this.bulkWrite(bulkOps);
        console.log(`✅ Bulk updated TAT for ${bulkOps.length} studies`);
    }
    
    return { updated: bulkOps.length };
};

// 🔧 INDEXES: Add TAT-specific indexes
DicomStudySchema.index({ 'calculatedTAT.totalTATMinutes': 1, workflowStatus: 1 }, { 
    name: 'tat_performance_index',
    background: true 
});

DicomStudySchema.index({ 'calculatedTAT.isOverdue': 1, workflowStatus: 1 }, { 
    name: 'overdue_studies_index',
    background: true 
});

DicomStudySchema.index({ 'calculatedTAT.phase': 1, createdAt: -1 }, { 
    name: 'tat_phase_index',
    background: true 
});

export default mongoose.model('DicomStudy', DicomStudySchema);