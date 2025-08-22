import Patient from '../models/patientModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import transporter from '../config/resend.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import NodeCache from 'node-cache';
import mongoose from 'mongoose';
import WasabiService from '../services/wasabi.service.js';
import multer from 'multer';
import sharp from 'sharp'; // For image optimization
import { calculateStudyTAT, getLegacyTATFields,updateStudyTAT } from '../utils/TATutility.js';


// import websocketService from '../config/webSocket.js'; // 🆕 ADD: Import WebSocket service
const storage = multer.memoryStorage();
const formatDicomDateTime = (studyDate, studyTime) => {
    if (!studyDate) return 'N/A';
    
    let dateTime = new Date(studyDate);
    
    if (studyTime && studyTime.length >= 6) {
      // Parse DICOM time format: "152054" = 15:20:54
      const hours = parseInt(studyTime.substring(0, 2));
      const minutes = parseInt(studyTime.substring(2, 4));
      const seconds = parseInt(studyTime.substring(4, 6));
      
      // Set the time components (this keeps it in the same date, just adds time)
      dateTime.setUTCHours(hours, minutes, seconds, 0);
    }
    
    return dateTime.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC' // Keep as UTC since DICOM times are typically in local hospital time
    }).replace(',', '');
  };

const signatureUpload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for signatures'), false);
        }
    }
});

const calculateTATForStudy = (study) => {
    if (!study) return getEmptyTAT();
  
    console.log(`[TAT Calc] Calculating TAT for study: ${study.studyInstanceUID}`);
  
    // 🔧 CRITICAL FIX: Handle study date in YYYYMMDD format
    let studyDate = null;
    if (study.studyDate) {
        if (typeof study.studyDate === 'string' && study.studyDate.length === 8) {
            // Handle YYYYMMDD format (like "19960308")
            const year = study.studyDate.substring(0, 4);
            const month = study.studyDate.substring(4, 6);
            const day = study.studyDate.substring(6, 8);
            studyDate = new Date(`${year}-${month}-${day}`);
        } else {
            studyDate = new Date(study.studyDate);
        }
        
        if (studyDate && isNaN(studyDate.getTime())) {
            console.log(`[TAT Calc] ⚠️ Invalid study date: ${study.studyDate}`);
            studyDate = null;
        }
    }
  
    const uploadDate = study.createdAt ? new Date(study.createdAt) : null;
    const assignedDate = study.assignment?.assignedAt ? new Date(study.assignment.assignedAt) : null;
    const reportDate = study.reportInfo?.finalizedAt ? new Date(study.reportInfo.finalizedAt) : null;
    const currentDate = new Date();
  
    const calculateMinutes = (start, end) => {
        if (!start || !end) return null;
        return Math.round((end - start) / (1000 * 60));
    };
  
    const calculateDays = (start, end) => {
        if (!start || !end) return null;
        return Math.round((end - start) / (1000 * 60 * 60 * 24));
    };
  
    // 🔧 CRITICAL: Calculate TAT based on what phase we're in
    const endDate = reportDate || currentDate;
    
    const result = {
        // Phase 1: Study to Upload
        studyToUploadTAT: studyDate && uploadDate ? calculateMinutes(studyDate, uploadDate) : null,
        
        // Phase 2: Upload to Assignment
        uploadToAssignmentTAT: uploadDate && assignedDate ? calculateMinutes(uploadDate, assignedDate) : null,
        
        // Phase 3: Assignment to Report
        assignmentToReportTAT: assignedDate && reportDate ? calculateMinutes(assignedDate, reportDate) : null,
        
        // End-to-End TAT calculations
        studyToReportTAT: studyDate && reportDate ? calculateMinutes(studyDate, reportDate) : null,
        uploadToReportTAT: uploadDate && reportDate ? calculateMinutes(uploadDate, reportDate) : null,
        
        // Total TAT (from upload baseline to current/report)
        totalTATDays: uploadDate ? calculateDays(uploadDate, endDate) : null,
        totalTATMinutes: uploadDate ? calculateMinutes(uploadDate, endDate) : null,
        
        // Reset-aware TAT (for studies that had TAT reset)
        resetAwareTATDays: uploadDate ? calculateDays(uploadDate, currentDate) : null,
        
        // Formatted versions for display
        studyToReportTATFormatted: null,
        uploadToReportTATFormatted: null,
        assignmentToReportTATFormatted: null,
        totalTATFormatted: null
    };
  
    // Apply formatting
    if (result.studyToReportTAT) {
        result.studyToReportTATFormatted = formatTAT(result.studyToReportTAT);
    }
    if (result.uploadToReportTAT) {
        result.uploadToReportTATFormatted = formatTAT(result.uploadToReportTAT);
    }
    if (result.assignmentToReportTAT) {
        result.assignmentToReportTATFormatted = formatTAT(result.assignmentToReportTAT);
    }
    if (result.totalTATDays !== null) {
        result.totalTATFormatted = `${result.totalTATDays} days`;
    }
  
    console.log(`[TAT Calc] Final TAT result:`, result);
    return result;
  };
  

// 🔧 PERFORMANCE: Advanced caching with different TTLs
const cache = new NodeCache({ 
    stdTTL: 300, // 5 minutes default
    checkperiod: 60,
    useClones: false // Better performance for large objects
});

export const getAllStudiesForAdmin = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 20;
        
        // 🔧 STEP 1: Build lean query filters with optimized date handling
        const queryFilters = {};
        let filterStartDate = null;
        let filterEndDate = null;
         const IST_OFFSET = 5.5 * 60 * 60 * 1000; 
        
        // Optimized date filtering with pre-calculated timestamps
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = Date.now(); // Use timestamp for better performance
            
           switch (preset) {
            case 'last24h':
                // Last 24 hours from current IST time
                const nowIST = new Date(Date.now() + IST_OFFSET);
                filterEndDate = new Date(Date.now()); // Current UTC time
                filterStartDate = new Date(Date.now() - 86400000); // 24 hours ago UTC
                break;

            case 'today':
                // ✅ FIX: Today in IST timezone
                const currentTimeIST = new Date(Date.now() + IST_OFFSET);
                
                // Create start of day in IST (00:00:00 IST)
                const todayStartIST = new Date(
                    currentTimeIST.getFullYear(),
                    currentTimeIST.getMonth(),
                    currentTimeIST.getDate(),
                    0, 0, 0, 0
                );
                
                // Create end of day in IST (23:59:59.999 IST)
                const todayEndIST = new Date(
                    currentTimeIST.getFullYear(),
                    currentTimeIST.getMonth(),
                    currentTimeIST.getDate(),
                    23, 59, 59, 999
                );
                
                // Convert IST times back to UTC for MongoDB query
                filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
                filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
                
                console.log(`🕐 Today IST: ${todayStartIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} to ${todayEndIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
                console.log(`🌍 Today UTC: ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
                break;

            case 'yesterday':
                // ✅ FIX: Yesterday in IST timezone
                const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
                const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000); // Subtract 1 day
                
                // Create start of yesterday in IST
                const yesterdayStartIST = new Date(
                    yesterdayIST.getFullYear(),
                    yesterdayIST.getMonth(),
                    yesterdayIST.getDate(),
                    0, 0, 0, 0
                );
                
                // Create end of yesterday in IST
                const yesterdayEndIST = new Date(
                    yesterdayIST.getFullYear(),
                    yesterdayIST.getMonth(),
                    yesterdayIST.getDate(),
                    23, 59, 59, 999
                );
                
                // Convert IST times back to UTC for MongoDB query
                filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
                filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
                
                console.log(`🕐 Yesterday IST: ${yesterdayStartIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})} to ${yesterdayEndIST.toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
                console.log(`🌍 Yesterday UTC: ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
                break;

            case 'thisWeek':
                // ✅ FIX: This week in IST timezone
                const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
                
                // Get start of week (Sunday) in IST
                const dayOfWeek = currentTimeISTWeek.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const weekStartIST = new Date(
                    currentTimeISTWeek.getFullYear(),
                    currentTimeISTWeek.getMonth(),
                    currentTimeISTWeek.getDate() - dayOfWeek,
                    0, 0, 0, 0
                );
                
                // End is current time in IST
                const weekEndIST = new Date(currentTimeISTWeek.getTime());
                
                // Convert IST times back to UTC for MongoDB query
                filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
                filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
                break;

            case 'thisMonth':
                // ✅ FIX: This month in IST timezone
                const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
                
                // Get start of month in IST
                const monthStartIST = new Date(
                    currentTimeISTMonth.getFullYear(),
                    currentTimeISTMonth.getMonth(),
                    1,
                    0, 0, 0, 0
                );
                
                // End is current time in IST
                const monthEndIST = new Date(currentTimeISTMonth.getTime());
                
                // Convert IST times back to UTC for MongoDB query
                filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
                filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
                break;

            case 'custom':
                if (req.query.customDateFrom || req.query.customDateTo) {
                    // ✅ FIX: Handle custom dates - assume they're entered in IST
                    if (req.query.customDateFrom) {
                        // Parse as IST date
                        const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                        filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                    }
                    
                    if (req.query.customDateTo) {
                        // Parse as IST date
                        const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                        filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                    }
                } else {
                    // Default to last 24 hours
                    filterEndDate = new Date();
                    filterStartDate = new Date(Date.now() - 86400000);
                }
                break;

            default:
                // Default to last 24 hours
                filterEndDate = new Date();
                filterStartDate = new Date(Date.now() - 86400000);
        }
        } else {
    // ✅ IST FIX: Default to today in IST when no filter specified
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
    const todayStartISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        0, 0, 0, 0
    );
    const todayEndISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        23, 59, 59, 999
    );
    filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
    filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
}

        // Apply date filter with proper indexing
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Optimized other filters with better type handling
        if (req.query.StudyInstanceUIDs && req.query.StudyInstanceUIDs !== 'undefined') {
            const studyUIDs = req.query.StudyInstanceUIDs.split(',').map(uid => uid.trim()).filter(Boolean);
            if (studyUIDs.length > 0) {
                queryFilters.studyInstanceUID = { $in: studyUIDs };
            }
        }

        if (req.query.search) {
            // Use text index if available, otherwise regex
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        // Optimized category filtering with pre-defined arrays
        if (req.query.category && req.query.category !== 'all') {
            const statusMap = {
                'pending': ['new_study_received', 'pending_assignment'],
                'inprogress': [
                    'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                    'report_finalized', 'report_drafted', 'report_uploaded', 
                    'report_downloaded_radiologist', 'report_downloaded'
                ],
                'completed': ['final_report_downloaded']
            };
            
            const statuses = statusMap[req.query.category];
            if (statuses) {
                queryFilters.workflowStatus = statuses.length === 1 ? statuses[0] : { $in: statuses };
            }
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: req.query.modality } // Use direct match instead of $in for single value
            ];
        }

        if (req.query.labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.query.labId);
        }

        if (req.query.priority) {
            queryFilters['assignment.priority'] = req.query.priority;
        }

        console.log(`🔍 Query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 2: Ultra-optimized aggregation pipeline
        const pipeline = [
            // 🔥 CRITICAL: Start with most selective match first
            { $match: queryFilters },
            
            // 🔥 PERFORMANCE: Sort before project to use index efficiently
            { $sort: { createdAt: -1 } },
            
            // 🔥 CRITICAL: Limit early to reduce pipeline processing
            { $limit: Math.min(limit, 1000) },
            
            // 🔥 PERFORMANCE: Project only after limiting
            {
                $project: {
                    _id: 1,
                    studyInstanceUID: 1,
                    orthancStudyID: 1,
                    accessionNumber: 1,
                    workflowStatus: 1,
                    modality: 1,
                    modalitiesInStudy: 1,
                    studyDescription: 1,
                    examDescription: 1,
                    seriesCount: 1,
                    instanceCount: 1,
                    seriesImages: 1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
                    'assignment.priority': 1,
                    'assignment.assignedAt': 1,
                    lastAssignedDoctor: 1,
                    doctorReports: 1,
                    reportInfo: 1,
                    reportFinalizedAt: 1,
                    // clinicalHistory: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1,
                    patientId: 1,
                    age:1,
                    gender:1,
                    
clinicalHistory: 1,
                    preProcessedDownload: 1
                }
            }
        ];

        // 🔥 STEP 3: Execute optimized parallel queries
        console.log(`🚀 Executing optimized query...`);
        const queryStart = Date.now();
        
        // Use Promise.allSettled for better error handling and parallel execution
        const [studiesResult, totalCountResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false), // Disable disk use for better performance on small datasets
            DicomStudy.countDocuments(queryFilters)
        ]);

        // Handle potential errors
        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }
        if (totalCountResult.status === 'rejected') {
            console.warn('Count query failed, using studies length:', totalCountResult.reason.message);
        }

        const studies = studiesResult.value;
        const totalStudies = totalCountResult.status === 'fulfilled' ? totalCountResult.value : studies.length;
        
        const queryTime = Date.now() - queryStart;
        console.log(`⚡ Core query completed in ${queryTime}ms - found ${studies.length} studies`);

        // 🔥 STEP 4: Optimized batch lookups with connection pooling awareness
        const lookupMaps = {
            patients: new Map(),
            labs: new Map(),
            doctors: new Map()
        };

        if (studies.length > 0) {
            const lookupStart = Date.now();
            
            // Extract unique IDs with Set for deduplication
            const uniqueIds = {
                patients: [...new Set(studies.map(s => s.patient?.toString()).filter(Boolean))],
                labs: [...new Set(studies.map(s => s.sourceLab?.toString()).filter(Boolean))],
                doctors: [...new Set(studies.flatMap(s => {
                    // Handle both legacy (object) and new (array) formats
                    let assignments = [];
                    
                    if (Array.isArray(s.lastAssignedDoctor)) {
                        // New format: array of objects
                        assignments = s.lastAssignedDoctor;
                    } else if (s.lastAssignedDoctor && typeof s.lastAssignedDoctor === 'object') {
                        // Legacy format: single object
                        assignments = [s.lastAssignedDoctor];
                    }
                    
                    return assignments.map(assignment => assignment?.doctorId?.toString()).filter(Boolean);
                }).filter(Boolean))]
            };

            // 🔥 PARALLEL: Optimized batch lookups with lean queries
            const lookupPromises = [];

            if (uniqueIds.patients.length > 0) {
                lookupPromises.push(
                    mongoose.model('Patient')
                        .find({ _id: { $in: uniqueIds.patients.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('patientID firstName lastName patientNameRaw gender ageString computed.fullName clinicalInfo.clinicalHistory')
                        .lean()
                        .then(results => ({ type: 'patients', data: results }))
                );
            }

            if (uniqueIds.labs.length > 0) {
                lookupPromises.push(
                    mongoose.model('Lab')
                        .find({ _id: { $in: uniqueIds.labs.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('name identifier')
                        .lean()
                        .then(results => ({ type: 'labs', data: results }))
                );
            }

            if (uniqueIds.doctors.length > 0) {
                lookupPromises.push(
                    mongoose.model('Doctor')
                        .find({ _id: { $in: uniqueIds.doctors.map(id => new mongoose.Types.ObjectId(id)) } })
                        // Populate userAccount within the Doctor model to get fullName, email, etc.
                        .populate('userAccount', 'fullName email isActive') 
                        .lean()
                        .then(results => ({ type: 'doctors', data: results }))
                );
            }

            // Execute all lookups in parallel
            const lookupResults = await Promise.allSettled(lookupPromises);
            
            // Process results and build maps
            lookupResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { type, data } = result.value;
                    data.forEach(item => {
                        lookupMaps[type].set(item._id.toString(), item);
                    });
                } else {
                    console.warn(`Lookup failed for ${result.reason}`);
                }
            });
            
            const lookupTime = Date.now() - lookupStart;
            console.log(`🔍 Batch lookups completed in ${lookupTime}ms`);
        }

        // 🔥 STEP 5: Optimized formatting with pre-compiled status maps
        const formatStart = Date.now();
        
        // Pre-compile category mapping for better performance
        const categoryMap = {
            'new_study_received': 'pending',
            'pending_assignment': 'pending',
            'assigned_to_doctor': 'inprogress',
            'doctor_opened_report': 'inprogress',
            'report_in_progress': 'inprogress',
            'report_finalized': 'inprogress',
            'report_drafted': 'inprogress',
            'report_uploaded': 'inprogress',
            'report_downloaded_radiologist': 'inprogress',
            'report_downloaded': 'inprogress',
            'final_report_downloaded': 'completed'
        };

        const formattedStudies = studies.map(study => {
            // Get related data from maps (faster than repeated lookups)
            const patient = lookupMaps.patients.get(study.patient?.toString());
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());

             const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                        study.preProcessedDownload?.zipUrl &&
                        (!study.preProcessedDownload?.zipExpiresAt || 
                         study.preProcessedDownload.zipExpiresAt > new Date());

            // 🔥 FIXED: Handle both legacy (object) and new (array) formats for lastAssignedDoctor
            let latestAssignedDoctor = null;
            let latestAssignmentEntry = null;
            let allDoctorAssignments = [];
            let isLegacyFormat = false;

            // Normalize lastAssignedDoctor to always be an array for consistent processing
            let assignmentArray = [];
            
            if (Array.isArray(study.lastAssignedDoctor)) {
                // New format: array of objects
                assignmentArray = study.lastAssignedDoctor;
                isLegacyFormat = false;
            } else if (study.lastAssignedDoctor && typeof study.lastAssignedDoctor === 'object') {
                // Legacy format: single object - convert to array
                assignmentArray = [study.lastAssignedDoctor];
                isLegacyFormat = true;
            } else {
                // No assignments or invalid data
                assignmentArray = [];
            }

            if (assignmentArray.length > 0) {
                // Sort the array by assignedAt in descending order to get the latest
                const sortedAssignments = [...assignmentArray].sort((a, b) => {
                    const dateA = a?.assignedAt ? new Date(a.assignedAt) : new Date(0);
                    const dateB = b?.assignedAt ? new Date(b.assignedAt) : new Date(0);
                    return dateB - dateA; // Latest date first
                });
                
                latestAssignmentEntry = sortedAssignments[0]; // Get the most recent entry
                
                if (latestAssignmentEntry?.doctorId) {
                    latestAssignedDoctor = lookupMaps.doctors.get(latestAssignmentEntry.doctorId.toString());
                }

                // Map all doctor assignments with their details
                allDoctorAssignments = assignmentArray.map(entry => {
                    if (!entry || !entry.doctorId) return null;
                    
                    const doctor = lookupMaps.doctors.get(entry.doctorId.toString());
                    return {
                        doctorId: entry.doctorId,
                        assignedAt: entry.assignedAt,
                        doctorDetails: doctor ? {
                            _id: doctor._id,
                            fullName: doctor.userAccount?.fullName || 'Unknown Doctor',
                            email: doctor.userAccount?.email || null,
                            specialization: doctor.specialization || null,
                            isActive: doctor.userAccount?.isActive || false
                        } : null
                    };
                }).filter(Boolean); // Remove null entries
            }
            
            // Optimized patient display building with fallback chain
            let patientDisplay = "N/A";
            let patientIdForDisplay = study.patientId || "N/A";
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                `${study.age}/${study.gender}` : 
                                study.age || study.gender || 'N/A';
            if (patient) {
                patientDisplay = patient.computed?.fullName || 
                                patient.patientNameRaw || 
                                `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
                patientIdForDisplay = patient.patientID || patientIdForDisplay;

                
            }

            // Fast category lookup using pre-compiled map
            const currentCategory = categoryMap[study.workflowStatus] || 'unknown';
            const tat = study.calculatedTAT || calculateStudyTAT(study);
            const legacyTATFields = getLegacyTATFields(tat);


            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                instanceID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                description: study.studyDescription || study.examDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                ? formatDicomDateTime(study.studyDate, study.studyTime)
                : study.studyDate 
                    ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                        year: 'numeric', month: 'short', day: '2-digit'
                    })
                    : 'N/A',
                
                studyDate: study.studyDate,
                uploadDateTime: study.createdAt
    ? new Date(study.createdAt).toLocaleString('en-GB', {
        timeZone: 'Asia/Kolkata', // <-- THIS IS THE FIX.
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).replace(',', '')
    : 'N/A',
                workflowStatus: study.workflowStatus,
                currentCategory: currentCategory,
                createdAt: study.createdAt,
                reportedBy: study.reportInfo?.reporterName 
                
                || 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    // Use the latest uploadedAt if multiple reports
                    const latestReport = study.doctorReports.reduce((latest, curr) =>
                        new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                        study.doctorReports[0]
                    );
                    const dt = new Date(latestReport.uploadedAt);
                    // Format: 15 Jun 2025 03:30
                    return dt.toLocaleString('en-in', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: 'Asia/Kolkata'
                    }).replace(',', '');
                })()
                : null,
                assignedDoctorName: latestAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || '',  
                // tat: tat,
                // ...legacyTATFields,
                // totalTATDays: tat.totalTATDays,
                // totalTATFormatted: tat.totalTATFormatted,
                // isOverdue: tat.isOverdue,
                // tatPhase: tat.phase,
                
                // 🔥 FIXED: Return properly formatted doctor assignments array
                doctorAssignments: allDoctorAssignments,

                downloadOptions: {
        hasWasabiZip: hasWasabiZip,
        hasR2Zip: hasWasabiZip,
        wasabiFileName: study.preProcessedDownload?.zipFileName || null,
        wasabiSizeMB: study.preProcessedDownload?.zipSizeMB || 0,
        wasabiDownloadCount: study.preProcessedDownload?.downloadCount || 0,
        wasabiCreatedAt: study.preProcessedDownload?.zipCreatedAt || null,
        wasabiExpiresAt: study.preProcessedDownload?.zipExpiresAt || null,
        zipStatus: study.preProcessedDownload?.zipStatus || 'not_started'
    },
                
                // 🔥 ADDED: Latest assigned doctor details for easy access
                latestAssignedDoctorDetails: latestAssignedDoctor ? {
                    _id: latestAssignedDoctor._id,
                    fullName: latestAssignedDoctor.userAccount?.fullName || 'Unknown Doctor',
                    email: latestAssignedDoctor.userAccount?.email || null,
                    specialization: latestAssignedDoctor.specialization || null,
                    isActive: latestAssignedDoctor.userAccount?.isActive || false,
                    assignedAt: latestAssignmentEntry?.assignedAt || null
                } : null,

                // 🔥 ADDED: Assignment history summary with legacy format indicator
                assignmentHistory: {
                    totalAssignments: allDoctorAssignments.length,
                    hasActiveAssignment: latestAssignedDoctor !== null,
                    lastAssignedAt: latestAssignmentEntry?.assignedAt || null,
                    isLegacyFormat: isLegacyFormat, // Indicates if this study uses old format
                    assignmentChain: allDoctorAssignments.map(assignment => ({
                        doctorName: assignment.doctorDetails?.fullName || 'Unknown Doctor',
                        assignedAt: assignment.assignedAt,
                        isActive: assignment.doctorDetails?.isActive || false
                    }))
                }
            };
        });

        const formatTime = Date.now() - formatStart;
        const processingTime = Date.now() - startTime;

        console.log(`✅ Formatting completed in ${formatTime}ms`);
        console.log(`🎯 Total processing time: ${processingTime}ms for ${formattedStudies.length} studies`);

        // Enhanced response format with better metadata
        const responseData = {
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
            recordsPerPage: limit,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: Math.ceil(totalStudies / limit),
                totalRecords: totalStudies,
                limit: limit,
                hasNextPage: totalStudies > limit,
                hasPrevPage: false,
                recordRange: {
                    start: 1,
                    end: formattedStudies.length
                },
                isSinglePage: totalStudies <= limit
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    lookups: studies.length > 0 ? `${Date.now() - formatStart}ms` : 0,
                    formatting: formatTime
                }
            },
            metadata: {
                dateRange: {
                    from: filterStartDate,
                    to: filterEndDate
                },
                filters: {
                    category: req.query.category || 'all',
                    modality: req.query.modality || 'all',
                    labId: req.query.labId || 'all',
                    priority: req.query.priority || 'all',
                    search: req.query.search || null
                }
            }
        };

        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ Error fetching studies for admin:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getValues = async (req, res) => {
    console.log(`🔍 Fetching dashboard values with filters: ${JSON.stringify(req.query)}`);
    try {
        const startTime = Date.now();
        delete req.query.category;
        
        // 🔧 STEP 1: Build lean query filters with optimized date handling (same as getAllStudiesForAdmin)
        const queryFilters = {};
        let filterStartDate = null;
        let filterEndDate = null;
        
        // Optimized date filtering with pre-calculated timestamps
        // Replace your existing date filtering logic with this:
if (req.query.quickDatePreset || req.query.dateFilter) {
    const preset = req.query.quickDatePreset || req.query.dateFilter;
    const now = Date.now();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
    
    switch (preset) {
        case 'last24h':
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
            break;

        case 'today':
            // ✅ IST FIX: Today in IST timezone
            const currentTimeIST = new Date(Date.now() + IST_OFFSET);
            const todayStartIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                0, 0, 0, 0
            );
            const todayEndIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
            break;

        case 'yesterday':
            // ✅ IST FIX: Yesterday in IST timezone
            const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
            const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000);
            const yesterdayStartIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                0, 0, 0, 0
            );
            const yesterdayEndIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisWeek':
            // ✅ IST FIX: This week in IST timezone
            const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
            const dayOfWeek = currentTimeISTWeek.getDay();
            const weekStartIST = new Date(
                currentTimeISTWeek.getFullYear(),
                currentTimeISTWeek.getMonth(),
                currentTimeISTWeek.getDate() - dayOfWeek,
                0, 0, 0, 0
            );
            const weekEndIST = new Date(currentTimeISTWeek.getTime());
            filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisMonth':
            // ✅ IST FIX: This month in IST timezone
            const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
            const monthStartIST = new Date(
                currentTimeISTMonth.getFullYear(),
                currentTimeISTMonth.getMonth(),
                1,
                0, 0, 0, 0
            );
            const monthEndIST = new Date(currentTimeISTMonth.getTime());
            filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
            break;

        case 'custom':
            if (req.query.customDateFrom || req.query.customDateTo) {
                // ✅ IST FIX: Custom dates in IST
                if (req.query.customDateFrom) {
                    const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                    filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                }
                if (req.query.customDateTo) {
                    const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                    filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                }
            } else {
                filterStartDate = new Date(now - 86400000);
                filterEndDate = new Date(now);
            }
            break;

        default:
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
    }
} else {
    // ✅ IST FIX: Default to today in IST when no filter specified
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
    const todayStartISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        0, 0, 0, 0
    );
    const todayEndISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        23, 59, 59, 999
    );
    filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
    filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
}
        // Apply date filter with proper indexing
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Apply same filters as getAllStudiesForAdmin
        if (req.query.StudyInstanceUIDs && req.query.StudyInstanceUIDs !== 'undefined') {
            const studyUIDs = req.query.StudyInstanceUIDs.split(',').map(uid => uid.trim()).filter(Boolean);
            if (studyUIDs.length > 0) {
                queryFilters.studyInstanceUID = { $in: studyUIDs };
            }
        }

        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: req.query.modality }
            ];
        }

        if (req.query.labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.query.labId);
        }

        if (req.query.priority) {
            queryFilters['assignment.priority'] = req.query.priority;
        }

        console.log(`🔍 Dashboard query filters:`, JSON.stringify(queryFilters, null, 2));

        // Status mapping
        const statusCategories = {
            pending: ['new_study_received', 'pending_assignment','assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                    'report_downloaded_radiologist', 'report_downloaded'
                ],
            inprogress: [
                    
                    'report_finalized', 'report_drafted', 'report_uploaded'
                    
                ],
            completed: ['final_report_downloaded']
        };

        // 🔥 STEP 2: Optimized aggregation pipeline with filters
        const pipeline = [
            {
                $match: queryFilters
            },
            {
                $group: {
                    _id: '$workflowStatus',
                    count: { $sum: 1 }
                }
            }
        ];

        // Execute queries with same filters
        const [statusCountsResult, totalFilteredResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            DicomStudy.countDocuments(queryFilters)
        ]);

        if (statusCountsResult.status === 'rejected') {
            throw new Error(`Status counts query failed: ${statusCountsResult.reason.message}`);
        }

        const statusCounts = statusCountsResult.value;
        const totalFiltered = totalFilteredResult.status === 'fulfilled' ? totalFilteredResult.value : 0;

        // Calculate category totals with filtered data
        let pending = 0;
        let inprogress = 0;
        let completed = 0;

        statusCounts.forEach(({ _id: status, count }) => {
            if (statusCategories.pending.includes(status)) {
                pending += count;
            } else if (statusCategories.inprogress.includes(status)) {
                inprogress += count;
            } else if (statusCategories.completed.includes(status)) {
                completed += count;
            }
        });

        // 🔥 STEP 3: If category filter is applied, adjust the totals accordingly
        // if (req.query.category && req.query.category !== 'all') {
        //     const categoryFilter = req.query.category;
            
        //     // Reset all counts to 0 first
        //     let filteredPending = 0;
        //     let filteredInprogress = 0;
        //     let filteredCompleted = 0;
            
        //     // Set only the filtered category to the total count
        //     switch (categoryFilter) {
        //         case 'pending':
        //             filteredPending = totalFiltered;
        //             break;
        //         case 'inprogress':
        //             filteredInprogress = totalFiltered;
        //             break;
        //         case 'completed':
        //             filteredCompleted = totalFiltered;
        //             break;
        //     }
            
        //     // Override the calculated values with filtered values
        //     pending = filteredPending;
        //     inprogress = filteredInprogress;
        //     completed = filteredCompleted;
        // }

        const processingTime = Date.now() - startTime;
        console.log(`🎯 Dashboard values fetched in ${processingTime}ms with filters applied`);

        // Enhanced response with filter information
        const response = {
            success: true,
            total: totalFiltered, // Total matching the applied filters
            pending: pending,
            inprogress: inprogress,
            completed: completed,
            performance: {
                queryTime: processingTime,
                fromCache: false,
                filtersApplied: Object.keys(queryFilters).length > 0
            }
        };

        // Add filter summary for debugging/transparency
        if (process.env.NODE_ENV === 'development') {
            response.debug = {
                filtersApplied: queryFilters,
                dateRange: {
                    start: filterStartDate?.toISOString(),
                    end: filterEndDate?.toISOString()
                },
                rawStatusCounts: statusCounts
            };
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ Error fetching dashboard values:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching dashboard statistics.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};





export const getStudyDiscussions = async (req, res) => {
    try {
        const { studyId } = req.params;
        const startTime = Date.now();
        
        console.log(`🔍 Fetching discussions for study: ${studyId}`);

        // Check cache first
        const cacheKey = `study_discussions_${studyId}`;
        let cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            return res.json({
                success: true,
                discussions: cachedData,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        const study = await DicomStudy.findById(studyId)
            .select('discussions')
            .lean();
            
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }

        const discussions = study.discussions || [];

        // Cache the result
        cache.set(cacheKey, discussions, 120); // 2 minutes

        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            discussions: discussions,
            performance: {
                queryTime: processingTime,
                fromCache: false
            }
        });

    } catch (error) {
        console.error('❌ Error fetching study discussions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching study discussions',
            error: error.message
        });
    }
};

// 🔧 FIXED: Get patient detailed view
// 🔧 FIXED: Get patient detailed view - Following labEdit pattern for consistency
export const getPatientDetailedView = async (req, res) => {
    try {
        const { patientId } = req.params;
        const startTime = Date.now();

        console.log(`🔍 Admin fetching detailed view for patient: ${patientId}`);

        // 🔧 PERFORMANCE: Check cache first
        const cacheKey = `admin_patient_detail_${patientId}`;
        let cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        // 🔧 OPTIMIZED: Parallel queries for better performance
        const [patient, studies] = await Promise.all([
            Patient.findOne({ patientID: patientId })
                .populate('clinicalInfo.lastModifiedBy', 'fullName email')
                .lean(),
            DicomStudy.find({ patientId: patientId })
                .populate('sourceLab', 'name identifier')
                .populate({
                    path: 'assignment.assignedTo',
                    select: 'specialization',
                    populate: {
                        path: 'userAccount',
                        select: 'fullName email'
                    }
                })
                .sort({ createdAt: -1 })
                .lean()
        ]);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 OPTIMIZED: Get latest study efficiently
        const latestStudy = studies.length > 0 ? studies[0] : null;

        // 🔧 PERFORMANCE: Build response efficiently
        const fullName = patient.computed?.fullName || 
                         `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown';

        const clinicalInfo = {
            clinicalHistory: patient.medicalHistory?.clinicalHistory || patient.clinicalInfo?.clinicalHistory || '',
            previousInjury: patient.medicalHistory?.previousInjury || patient.clinicalInfo?.previousInjury || '',
            previousSurgery: patient.medicalHistory?.previousSurgery || patient.clinicalInfo?.previousSurgery || ''
        };

        // 🆕 NEW: Extract referring physician information from latest study
        const referringPhysicianInfo = latestStudy ? {
            name: latestStudy.referringPhysician?.name || latestStudy.referringPhysicianName || 'N/A',
            institution: latestStudy.referringPhysician?.institution || 'N/A',
            contactInfo: latestStudy.referringPhysician?.contactInfo || 'N/A',
            // 🔧 FALLBACK: Use legacy field if new structure not available
            displayName: latestStudy.referringPhysicianName || latestStudy.referringPhysician?.name || 'N/A'
        } : {
            name: 'N/A',
            institution: 'N/A',
            contactInfo: 'N/A',
            displayName: 'N/A'
        };

        const visitInfo = latestStudy ? {
            examType: latestStudy.examType || latestStudy.modality || 'N/A',
            examDescription: latestStudy.examDescription || 'N/A',
            caseType: latestStudy.caseType || 'ROUTINE',
            studyStatus: latestStudy.workflowStatus || 'pending',
            // 🔧 UPDATED: Use the new referring physician structure
            referringPhysician: referringPhysicianInfo.displayName,
            referringPhysicianDetails: referringPhysicianInfo, // 🆕 NEW: Full details
            center: latestStudy.sourceLab?.name || 'N/A',
            orderDate: latestStudy.createdAt,
            studyDate: latestStudy.studyDate,
            reportDate: latestStudy.reportFinalizedAt
        } : null;

        const responseData = {
            patientInfo: {
                patientId: patient.patientID,
                fullName: fullName,
                gender: patient.gender || 'N/A',
                age: patient.ageString || 'N/A',
                dateOfBirth: patient.dateOfBirth || 'N/A',
                contactPhone: patient.contactInformation?.phone || 'N/A',
                contactEmail: patient.contactInformation?.email || 'N/A'
            },
            studyInfo: latestStudy ? {
                studyId: latestStudy.studyInstanceUID,
                accessionNumber: latestStudy.accessionNumber || 'N/A',
                studyDate: latestStudy.studyDate,
                modality: latestStudy.modality || 'N/A',
                status: latestStudy.workflowStatus || 'pending',
                assignedDoctor: latestStudy.assignment?.assignedTo?.userAccount?.fullName || 'Not Assigned',
                priority: latestStudy.assignment?.priority || 'NORMAL',
                reportAvailable: latestStudy.ReportAvailable || false,
                // 🆕 NEW: Add referring physician to study info
                referringPhysician: referringPhysicianInfo
            } : null,
            clinicalInfo,
            visitInfo,
            // 🆕 NEW: Add referring physician as separate section
            referringPhysicianInfo,
            documents: patient.documents || [],
            allStudies: studies.map(study => ({
                studyId: study.studyInstanceUID,
                studyDate: study.studyDate,
                modality: study.modality || 'N/A',
                status: study.workflowStatus,
                accessionNumber: study.accessionNumber || 'N/A',
                // 🆕 NEW: Include referring physician in all studies
                referringPhysician: study.referringPhysicianName || study.referringPhysician?.name || 'N/A'
            }))
        };

        // 🔧 PERFORMANCE: Cache the result
        cache.set(cacheKey, responseData, 300); // 5 minutes

        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            data: responseData,
            performance: {
                queryTime: processingTime,
                fromCache: false
            }
        });

    } catch (error) {
        console.error('❌ Error in getPatientDetailedView:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching patient details',
            error: error.message
        });
    }
};

// 🔧 FIXED: Assign doctor to study
// export const assignDoctorToStudy = async (req, res) => {
//     const session = await mongoose.startSession();
    
//     try {
//         const result = await session.withTransaction(async () => {
//             const { studyId } = req.params;
//             const { doctorId, assignmentNote, priority = 'NORMAL' } = req.body;
//             const assignedBy = req.user.id;

//             console.log(`🔄 Assigning doctor ${doctorId} to study ${studyId}`);

//             if (!studyId || !doctorId) {
//                 throw new Error('Both study ID and doctor ID are required');
//             }

//             // Validate doctor
//             // const doctor = await Doctor.findById(doctorId)
//             //     .populate('userAccount', 'fullName isActive')
//             //     .session(session);

//             const [doctor, study] = await Promise.all([
//                 Doctor.findById(doctorId)
//                     .populate({
//                         path: 'userAccount',
//                         select: 'fullName isActive',
//                         options: { session, readPreference: 'primary' }
//                     })
//                     .session(session)
//                     .setOptions({ readPreference: 'primary' }),
//                 DicomStudy.findById(studyId)
//                     .populate({
//                         path: 'patient',
//                         select: '_id patientID',
//                         options: { session, readPreference: 'primary' }
//                     })
//                     .session(session)
//                     .setOptions({ readPreference: 'primary' })
//             ]);

//             if (!doctor || !doctor.userAccount?.isActive) {
//                 throw new Error('Doctor not found or inactive');
//             }

//             // Update study
//             const currentTime = new Date();
//             const assignmentData = {
//                 'assignment.assignedTo': doctorId,
//                 'assignment.assignedAt': currentTime,
//                 'assignment.assignedBy': assignedBy,
//                 'assignment.priority': priority,
//                 'assignment.dueDate': new Date(Date.now() + 24 * 60 * 60 * 1000),
//                 workflowStatus: 'assigned_to_doctor',
//                 lastAssignedDoctor: doctorId,
//                 lastAssignmentAt: currentTime,
//                 $push: {
//                     statusHistory: {
//                         status: 'assigned_to_doctor',
//                         changedAt: currentTime,
//                         changedBy: assignedBy,
//                         note: assignmentNote || `Assigned to Dr. ${doctor.userAccount.fullName}`
//                     }
//                 }
//             };

//             const updatedStudy = await DicomStudy.findByIdAndUpdate(
//                 studyId,
//                 assignmentData,
//                 { 
//                     session, 
//                     new: true,
//                     runValidators: false
//                 }
//             );

//             if (!updatedStudy) {
//                 throw new Error('Study not found');
//             }

//             console.log(`📋 Adding study ${studyId} to doctor ${doctorId} assignedStudies array`);
            
//             // Check if study is already in assignedStudies (to avoid duplicates)
//             const existingAssignment = doctor.assignedStudies.find(
//                 assigned => assigned.study.toString() === studyId.toString()
//             );

//             if (!existingAssignment) {
//                 // 🔧 SIMPLIFIED: Add only the essential fields you specified
//                 const assignedStudyEntry = {
//                     study: studyId,
//                     patient: study.patient._id,
//                     assignedDate: currentTime,
//                     status: 'assigned'
//                 };

//                 await Doctor.findByIdAndUpdate(
//                     doctorId,
//                     {
//                         $push: { assignedStudies: assignedStudyEntry },
//                         assigned: true // Set doctor as having assignments
//                     },
//                     { session, runValidators: false }
//                 );

//                 console.log(`✅ Added study to doctor assignedStudies array with essential fields only`);
//             } else {
//                 console.log(`ℹ️ Study already exists in doctor assignedStudies, updating status`);
                
//                 // Update existing assignment status if it was previously completed
//                 await Doctor.findOneAndUpdate(
//                     { 
//                         _id: doctorId,
//                         'assignedStudies.study': studyId
//                     },
//                     {
//                         $set: {
//                             'assignedStudies.$.status': 'assigned',
//                             'assignedStudies.$.assignedDate': currentTime
//                         }
//                     },
//                     { session, runValidators: false }
//                 );
//             }

//             // Calculate timing info
//             if (updatedStudy.createdAt) {
//                 const uploadToAssignmentMinutes = Math.floor(
//                     (currentTime.getTime() - updatedStudy.createdAt.getTime()) / (1000 * 60)
//                 );
                
//                 await DicomStudy.findByIdAndUpdate(
//                     studyId,
//                     {
//                         'timingInfo.uploadToAssignmentMinutes': uploadToAssignmentMinutes
//                     },
//                     { session, runValidators: false }
//                 );
//             }

//             // Update patient status
//             if (updatedStudy.patient) {
//                 await Patient.findByIdAndUpdate(
//                     updatedStudy.patient,
//                     {
//                         currentWorkflowStatus: 'assigned_to_doctor',
//                         'statusInfo.assignedDoctor': doctorId,
//                         'statusInfo.lastStatusChange': currentTime
//                     },
//                     { session }
//                 );
//             }

//             // Clear caches
//             cache.del(`admin_patient_detail_${updatedStudy.patientId}`);
//             cache.del(`doctor_workload_${doctorId}`);

//             console.log('✅ Doctor assigned successfully');

//             return {
//                 studyId: updatedStudy.studyInstanceUID,
//                 doctorName: doctor.userAccount.fullName,
//                 assignedAt: currentTime,
//                 priority: priority
//             };
//         });

//         res.json({
//             success: true,
//             message: 'Doctor assigned successfully',
//             data: result
//         });

//     } catch (error) {
//         console.error('❌ Error in assignDoctorToStudy:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message || 'Failed to assign doctor',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     } finally {
//         await session.endSession();
//     }
// };


// import DicomStudy from '../models/DicomStudy.model.js';
// import Doctor from '../models/Doctor.model.js';
// import Patient from '../models/Patient.model.js';
// import cache from '../services/cache.js'; // Assuming your cache service is set up
export const assignDoctorToStudy = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const result = await session.withTransaction(async (currentSession) => {
            const { studyId } = req.params;
            // Assuming doctorId from req.body is the Doctor._id
            const doctorObjectId = req.body.doctorId; // Renamed for clarity
            const { assignmentNote, priority = 'NORMAL' } = req.body;
            const assignedBy = req.user.id; // Assuming req.user.id is the User._id of the assigner

            console.log(`🔄 Processing assignment for doctor (ID: ${doctorObjectId}) to study (ID: ${studyId})`);

            if (!studyId || !doctorObjectId) {
                throw new Error('Both study ID and doctor ID are required');
            }

            // Fetch study first
            let study = await DicomStudy.findById(studyId)
                .populate({
                    path: 'patient',
                    select: '_id patientID', // Assuming patientID is a string field for cache key
                    options: { session: currentSession }
                })
                .session(currentSession)
                .read('primary') // Essential for transactions
                .exec();

            if (!study) {
                throw new Error('Study not found');
            }

            // Fetch doctor and the associated user account
            const doctor = await Doctor.findById(doctorObjectId)
                .populate({
                    path: 'userAccount', // This should be the User document
                    select: '_id fullName isActive', // Ensure _id is selected from userAccount
                    options: { session: currentSession }
                })
                .session(currentSession)
                .read('primary') // Essential for transactions
                .exec();

            if (!doctor || !doctor.userAccount || !doctor.userAccount.isActive) {
                throw new Error('Doctor not found, user account missing, or inactive');
            }

            // The ID to be stored in DicomStudy.assignment[N].assignedTo (which refs 'User')
            const userAccountIdForAssignment = doctor.userAccount._id;

            // --- Ensure study.assignment and lastAssignedDoctor are arrays ---
            const needsArrayInitialization = 
                (study.assignment === null || typeof study.assignment === 'undefined' || !Array.isArray(study.assignment)) ||
                (study.lastAssignedDoctor === null || typeof study.lastAssignedDoctor === 'undefined' || !Array.isArray(study.lastAssignedDoctor));

            if (needsArrayInitialization) {
                const assignmentValue = Array.isArray(study.assignment) ? study.assignment : [];
                const lastAssignedDoctorValue = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor : [];
                
                console.log(`🔧 Initializing/Correcting array fields for study ${studyId}:`);
                console.log(`  - assignment was: ${JSON.stringify(study.assignment)}`);
                console.log(`  - lastAssignedDoctor was: ${JSON.stringify(study.lastAssignedDoctor)}`);

                const updateFields = {};
                if (!Array.isArray(study.assignment)) {
                    updateFields.assignment = assignmentValue;
                }
                if (!Array.isArray(study.lastAssignedDoctor)) {
                    updateFields.lastAssignedDoctor = lastAssignedDoctorValue;
                }

                await DicomStudy.findByIdAndUpdate(
                    studyId,
                    { $set: updateFields },
                    { session: currentSession, new: false } // We'll re-fetch
                );
                
                // Re-fetch the study to get the updated document with arrays
                study = await DicomStudy.findById(studyId)
                    .populate({
                        path: 'patient',
                        select: '_id patientID',
                        options: { session: currentSession }
                    })
                    .session(currentSession)
                    .read('primary')
                    .exec();

                if (!study) {
                    throw new Error('Study not found after attempting to initialize/correct array fields.');
                }
                console.log(`✅ Array fields for study ${studyId} are now initialized:`);
                console.log(`  - assignment: ${JSON.stringify(study.assignment)}`);
                console.log(`  - lastAssignedDoctor: ${JSON.stringify(study.lastAssignedDoctor)}`);
            }
            // --- End of ensuring arrays are initialized ---

            const currentTime = new Date();
            let updatedStudyDoc; // Renamed to avoid confusion with the 'study' variable

            const existingAssignmentIndex = study.assignment.findIndex(
                (asm) => asm.assignedTo && asm.assignedTo.toString() === userAccountIdForAssignment.toString()
            );

            // Prepare the lastAssignedDoctor entry for the array
            const lastAssignedDoctorEntry = {
                doctorId: doctorObjectId, // Store Doctor._id
                assignedAt: currentTime
            };

            if (existingAssignmentIndex > -1) {
                console.log(`ℹ️ User (ID: ${userAccountIdForAssignment}) already assigned to study ${studyId}. Updating existing assignment.`);
                const updatePath = `assignment.${existingAssignmentIndex}`;
                updatedStudyDoc = await DicomStudy.findByIdAndUpdate(
                    studyId,
                    {
                        $set: {
                            [`${updatePath}.assignedAt`]: currentTime,
                            [`${updatePath}.assignedBy`]: assignedBy,
                            [`${updatePath}.priority`]: priority,
                            [`${updatePath}.dueDate`]: new Date(Date.now() + 24 * 60 * 60 * 1000),
                            workflowStatus: 'assigned_to_doctor',
                            lastAssignmentAt: currentTime,
                        },
                        $push: {
                            lastAssignedDoctor: lastAssignedDoctorEntry, // Add to the array
                            statusHistory: {
                                status: 'assignment_updated',
                                changedAt: currentTime,
                                changedBy: assignedBy,
                                note: assignmentNote || `Assignment for Dr. ${doctor.userAccount.fullName} updated.`
                            }
                        }
                    },
                    { session: currentSession, new: true, runValidators: false }
                );
            } else {
                console.log(`➕ Adding new assignment for User (ID: ${userAccountIdForAssignment}) to study ${studyId}.`);
                const newAssignmentObject = {
                    assignedTo: userAccountIdForAssignment, // Store User._id
                    assignedAt: currentTime,
                    assignedBy: assignedBy, // User._id of assigner
                    priority: priority,
                    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                };
                updatedStudyDoc = await DicomStudy.findByIdAndUpdate(
                    studyId,
                    {
                        $push: {
                            assignment: newAssignmentObject,
                            lastAssignedDoctor: lastAssignedDoctorEntry, // Add to the array
                            statusHistory: {
                                status: 'assigned_to_doctor',
                                changedAt: currentTime,
                                changedBy: assignedBy,
                                note: assignmentNote || `Assigned to Dr. ${doctor.userAccount.fullName}`
                            }
                        },
                        $set: {
                            workflowStatus: 'assigned_to_doctor',
                            lastAssignmentAt: currentTime,
                        }
                    },
                    { session: currentSession, new: true, runValidators: false }
                );
            }

            if (!updatedStudyDoc) {
                throw new Error('Study not found or failed to update during assignment operation.');
            }

            // Update Doctor's personal assignedStudies array
            const existingAssignmentInDoctorList = doctor.assignedStudies.find(
                (assigned) => assigned.study.toString() === studyId.toString()
            );
            if (!existingAssignmentInDoctorList) {
                await Doctor.findByIdAndUpdate(
                    doctorObjectId, // Use Doctor._id
                    {
                        $push: { assignedStudies: { study: studyId, patient: study.patient?._id, assignedDate: currentTime, status: 'assigned' } },
                        assigned: true
                    },
                    { session: currentSession, runValidators: false }
                );
            } else {
                await Doctor.findOneAndUpdate(
                    { _id: doctorObjectId, 'assignedStudies.study': studyId }, // Use Doctor._id
                    { $set: { 'assignedStudies.$.status': 'assigned', 'assignedStudies.$.assignedDate': currentTime } },
                    { session: currentSession, runValidators: false }
                );
            }

            // Calculate timing info
            if (updatedStudyDoc.createdAt) {
                const isFirstOverallAssignmentToStudy = updatedStudyDoc.assignment?.length === 1;
                if (isFirstOverallAssignmentToStudy || !updatedStudyDoc.timingInfo?.uploadToAssignmentMinutes) {
                    const uploadToAssignmentMinutes = Math.floor(
                        (currentTime.getTime() - updatedStudyDoc.createdAt.getTime()) / (1000 * 60)
                    );
                    await DicomStudy.findByIdAndUpdate( // This update is on the same study, it's fine
                        studyId,
                        { 'timingInfo.uploadToAssignmentMinutes': uploadToAssignmentMinutes },
                        { session: currentSession, runValidators: false }
                    );
                }
            }

            // Update patient status
            if (updatedStudyDoc.patient && updatedStudyDoc.patient._id) {
                // Ensure 'activeStudyAssignedDoctors' in Patient model stores User._id or Doctor._id consistently
                // Here, we're adding the User._id to match DicomStudy.assignment.assignedTo
                await Patient.findByIdAndUpdate(
                    updatedStudyDoc.patient._id,
                    {
                        currentWorkflowStatus: 'assigned_to_doctor',
                        $addToSet: { 'activeStudyAssignedDoctors': userAccountIdForAssignment },
                        'computed.lastActivity': currentTime, // Example path
                    },
                    { session: currentSession }
                );
            }

            const freshTAT = calculateStudyTAT(updatedStudyDoc.toObject());
            await updateStudyTAT(studyId, freshTAT, currentSession);

            console.log(`✅ TAT recalculated after assignment - Upload to Assignment: ${freshTAT.uploadToAssignmentTATFormatted}`);
    
            

            // Clear caches
            const patientIdForCache = updatedStudyDoc.patient?.patientID || updatedStudyDoc.patientId;
            if (patientIdForCache) {
                cache.del(`admin_patient_detail_${patientIdForCache}`);
            }
            cache.del(`doctor_workload_${doctorObjectId}`); // Use Doctor._id

            console.log(`✅ Assignment processed for User (ID: ${userAccountIdForAssignment}) / Doctor (ID: ${doctorObjectId}) to study ${studyId}`);
            return {
                studyId: updatedStudyDoc.studyInstanceUID,
                doctorName: doctor.userAccount.fullName,
                assignedAt: currentTime,
                priority: priority,
                message: `Doctor ${doctor.userAccount.fullName} processed for assignment to study.`
            };
        }); // End of session.withTransaction

        res.json({
            success: true,
            message: 'Doctor assignment processed successfully.',
            data: result
        });

    } catch (error) {
        console.error('❌ Error in assignDoctorToStudy:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to assign doctor',
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (session.inTransaction()) { // Check if session is still active before trying to end
            console.warn('Transaction was not explicitly committed or aborted before finally block. Ending session.');
        }
        await session.endSession();
    }
};
// import websocketService from '../config/webSocket.js'; // 🆕 ADD: Import WebSocket service

// // 🔧 ENHANCED: Assign doctor to study with WebSocket notification
// export const assignDoctorToStudy = async (req, res) => {
//     const session = await mongoose.startSession();
    
//     try {
//         const result = await session.withTransaction(async () => {
//             const { studyId } = req.params;
//             const { doctorId, assignmentNote, priority = 'NORMAL' } = req.body;
//             const assignedBy = req.user.id;

//             console.log(`🔄 Assigning doctor ${doctorId} to study ${studyId}`);

//             if (!studyId || !doctorId) {
//                 throw new Error('Study ID and Doctor ID are required');
//             }

//             // 🔧 ENHANCED: Validate doctor and get full details
//             const doctor = await Doctor.findById(doctorId)
//                 .populate('userAccount', 'fullName email isActive')
//                 .session(session);

//             if (!doctor || !doctor.userAccount?.isActive) {
//                 throw new Error('Doctor not found or inactive');
//             }

//             // 🔧 ENHANCED: Get study with full details for notification
//             const study = await DicomStudy.findById(studyId)
//                 .populate('patient', 'patientID patientNameRaw firstName lastName')
//                 .populate('sourceLab', 'name identifier')
//                 .session(session);

//             if (!study) {
//                 throw new Error('Study not found');
//             }

//             // Update study
//             const currentTime = new Date();
//             const assignmentData = {
//                 'assignment.assignedTo': doctorId,
//                 'assignment.assignedAt': currentTime,
//                 'assignment.assignedBy': assignedBy,
//                 'assignment.priority': priority,
//                 'assignment.dueDate': new Date(Date.now() + 24 * 60 * 60 * 1000),
//                 workflowStatus: 'assigned_to_doctor',
//                 lastAssignedDoctor: doctorId,
//                 lastAssignmentAt: currentTime,
//                 $push: {
//                     statusHistory: {
//                         status: 'assigned_to_doctor',
//                         changedAt: currentTime,
//                         changedBy: assignedBy,
//                         note: assignmentNote || `Assigned to Dr. ${doctor.userAccount.fullName}`
//                     }
//                 }
//             };

//             const updatedStudy = await DicomStudy.findByIdAndUpdate(
//                 studyId,
//                 assignmentData,
//                 { 
//                     session, 
//                     new: true,
//                     runValidators: false
//                 }
//             );

//             if (!updatedStudy) {
//                 throw new Error('Study not found');
//             }

//             // Calculate timing info
//             if (updatedStudy.createdAt) {
//                 const uploadToAssignmentMinutes = Math.floor(
//                     (currentTime.getTime() - updatedStudy.createdAt.getTime()) / (1000 * 60)
//                 );
                
//                 await DicomStudy.findByIdAndUpdate(
//                     studyId,
//                     {
//                         'timingInfo.uploadToAssignmentMinutes': uploadToAssignmentMinutes
//                     },
//                     { session, runValidators: false }
//                 );
//             }

//             // Update patient status
//             if (updatedStudy.patient) {
//                 await Patient.findByIdAndUpdate(
//                     updatedStudy.patient,
//                     {
//                         currentWorkflowStatus: 'assigned_to_doctor',
//                         'statusInfo.assignedDoctor': doctorId,
//                         'statusInfo.lastStatusChange': currentTime
//                     },
//                     { session }
//                 );
//             }

//             // Clear caches
//             cache.del(`admin_patient_detail_${updatedStudy.patientId}`);
//             cache.del(`doctor_workload_${doctorId}`);

//             console.log('✅ Doctor assigned successfully');

//             return {
//                 studyId: updatedStudy.studyInstanceUID,
//                 doctorName: doctor.userAccount.fullName,
//                 assignedAt: currentTime,
//                 priority: priority,
//                 // 🆕 NEW: Add data for WebSocket notification
//                 studyData: {
//                     _id: study._id,
//                     studyInstanceUID: study.studyInstanceUID,
//                     patientName: study.patient?.patientNameRaw || 
//                                `${study.patient?.firstName || ''} ${study.patient?.lastName || ''}`.trim() || 
//                                'Unknown Patient',
//                     patientId: study.patientId || study.patient?.patientID,
//                     modality: study.modality,
//                     studyDate: study.studyDate,
//                     accessionNumber: study.accessionNumber,
//                     seriesImages: study.seriesImages || '1/1',
//                     sourceLab: study.sourceLab
//                 },
//                 doctorInfo: {
//                     _id: doctor._id,
//                     fullName: doctor.userAccount.fullName,
//                     email: doctor.userAccount.email,
//                     specialization: doctor.specialization
//                 },
//                 assignmentInfo: {
//                     assignedBy: req.user, // Full user object for assignedBy
//                     assignmentNote,
//                     priority
//                 }
//             };
//         });

//         // 🆕 NEW: Send WebSocket notification to doctor AFTER successful transaction
//         try {
//             console.log('📢 Sending WebSocket notification to doctor...');
            
//             const notificationSent = await websocketService.notifyDoctorAssignment({
//                 doctorId: result.doctorInfo._id,
//                 studyData: result.studyData,
//                 assignedBy: result.assignmentInfo.assignedBy,
//                 priority: result.assignmentInfo.priority,
//                 assignmentNote: result.assignmentInfo.assignmentNote
//             });

//             console.log(`📢 WebSocket notification ${notificationSent ? 'sent' : 'not sent'} to Dr. ${result.doctorInfo.fullName}`);
            
//         } catch (notificationError) {
//             console.error('❌ Error sending WebSocket notification:', notificationError);
//             // Don't fail the request if notification fails - assignment still succeeded
//         }

//         res.json({
//             success: true,
//             message: 'Doctor assigned successfully',
//             data: {
//                 studyId: result.studyId,
//                 doctorName: result.doctorName,
//                 assignedAt: result.assignedAt,
//                 priority: result.priority,
//                 notificationSent: true // Assume sent for response
//             }
//         });

//     } catch (error) {
//         console.error('❌ Error in assignDoctorToStudy:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message || 'Failed to assign doctor',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// 🔧 FIXED: Get all doctors
export const getAllDoctors = async (req, res) => {

    try {
        const startTime = Date.now();
        const page = parseInt(req.query.page) || 1;
        const limit = 100;
        const skip = (page - 1) * limit;
        const { search = '', specialization = '', status = '' } = req.query;

        // Check cache
        const cacheKey = `doctors_list_${page}_${limit}_${search}_${specialization}_${status}`;
        let cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            return res.json({
                success: true,
                ...cachedData,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        // Build aggregation pipeline
        const pipeline = [
            {
                $match: {
                    ...(specialization && { specialization }),
                    ...(status !== '' && { isActiveProfile: status === 'active' })
                }
            },
            
            {
                $lookup: {
                    from: 'users',
                    localField: 'userAccount',
                    foreignField: '_id',
                    as: 'userAccount',
                    pipeline: [
                        {
                            $project: {
                                fullName: 1,
                                email: 1,
                                username: 1,
                                isActive: 1,
                                isLoggedIn: 1
                            }
                        }
                    ]
                }
            },
            
            ...(search ? [{
                $match: {
                    $or: [
                        { 'userAccount.fullName': { $regex: search, $options: 'i' } },
                        { 'userAccount.email': { $regex: search, $options: 'i' } },
                        { specialization: { $regex: search, $options: 'i' } }
                    ]
                }
            }] : []),
            
            {
                $lookup: {
                    from: 'dicomstudies',
                    let: { doctorId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$assignment.assignedTo', '$$doctorId'] },
                                workflowStatus: { 
                                    $in: ['assigned_to_doctor', 'report_in_progress'] 
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                activeCount: { $sum: 1 },
                                urgentCount: {
                                    $sum: {
                                        $cond: [
                                            { $eq: ['$assignment.priority', 'URGENT'] },
                                            1,
                                            0
                                        ]
                                    }
                                }
                            }
                        }
                    ],
                    as: 'workload'
                }
            },
            
            {
                $project: {
                    _id: 1,
                    specialization: 1,
                    licenseNumber: 1,
                    department: 1,
                    qualifications: 1,
                    yearsOfExperience: 1,
                    contactPhoneOffice: 1,
                    isActiveProfile: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    userAccount: { $arrayElemAt: ['$userAccount', 0] },
                    currentWorkload: {
                        $ifNull: [{ $arrayElemAt: ['$workload.activeCount', 0] }, 0]
                    },
                    urgentWorkload: {
                        $ifNull: [{ $arrayElemAt: ['$workload.urgentCount', 0] }, 0]
                    }
                }
            },
            
            {
                $sort: {
                    currentWorkload: 1,
                    'userAccount.fullName': 1
                }
            },
            
            { $skip: skip },
            { $limit: limit }
        ];

        // Execute queries
        const [doctors, totalCount, specializations] = await Promise.all([
            Doctor.aggregate(pipeline),
            Doctor.countDocuments({
                ...(specialization && { specialization }),
                ...(status !== '' && { isActiveProfile: status === 'active' })
            }),
            Doctor.distinct('specialization')
        ]);

        // Format response
        const formattedDoctors = doctors.map(doctor => ({
            _id: doctor._id,
            userId: doctor.userAccount?._id,
            fullName: doctor.userAccount?.fullName || 'N/A',
            email: doctor.userAccount?.email || 'N/A',
            username: doctor.userAccount?.username || 'N/A',
            specialization: doctor.specialization,
            licenseNumber: doctor.licenseNumber,
            department: doctor.department || 'N/A',
            experience: doctor.yearsOfExperience ? `${doctor.yearsOfExperience} years` : 'N/A',
            qualifications: doctor.qualifications?.join(', ') || 'N/A',
            contactPhone: doctor.contactPhoneOffice || 'N/A',
            isActive: doctor.isActiveProfile && doctor.userAccount?.isActive,
            isLoggedIn: doctor.userAccount?.isLoggedIn || false,
            currentWorkload: doctor.currentWorkload,
            urgentWorkload: doctor.urgentWorkload,
            workloadStatus: doctor.currentWorkload > 10 ? 'HIGH' : 
                           doctor.currentWorkload > 5 ? 'MEDIUM' : 'LOW',
            createdAt: doctor.createdAt,
            updatedAt: doctor.updatedAt
        }));

        const responseData = {
            count: formattedDoctors.length,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            totalRecords: totalCount,
            specializations,
            doctors: formattedDoctors
        };

        // Cache the result
        // cache.set(cacheKey, responseData, 180);

        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            ...responseData,
            performance: {
                queryTime: processingTime,
                fromCache: false
            }
        });

    } catch (error) {
        console.error('❌ Error in getAllDoctors:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctors',
            error: error.message
        });
    }
};

// 🔧 FIXED: Get doctor statistics
export const getDoctorStats = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const startTime = Date.now();

        // Check cache first
        const cacheKey = `doctor_stats_${doctorId}`;
        let cachedStats = cache.get(cacheKey);
        
        if (cachedStats) {
            return res.json({
                success: true,
                data: cachedStats,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        // Get stats with aggregation
        const statsAggregation = await DicomStudy.aggregate([
            {
                $match: {
                    'assignment.assignedTo': new mongoose.Types.ObjectId(doctorId)
                }
            },
            {
                $group: {
                    _id: null,
                    totalAssigned: { $sum: 1 },
                    completed: {
                        $sum: {
                            $cond: [
                                { $in: ['$workflowStatus', ['report_finalized', 'report_downloaded']] },
                                1,
                                0
                            ]
                        }
                    },
                    pending: {
                        $sum: {
                            $cond: [
                                { $in: ['$workflowStatus', ['assigned_to_doctor', 'report_in_progress']] },
                                1,
                                0
                            ]
                        }
                    },
                    avgTAT: { $avg: '$timingInfo.totalTATMinutes' },
                    urgentCases: {
                        $sum: {
                            $cond: [
                                { $eq: ['$assignment.priority', 'URGENT'] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        const stats = statsAggregation[0] || {
            totalAssigned: 0,
            completed: 0,
            pending: 0,
            avgTAT: 0,
            urgentCases: 0
        };

        // Cache the result
        cache.set(cacheKey, stats, 300);

        res.json({
            success: true,
            data: {
                ...stats,
                completionRate: stats.totalAssigned > 0 ? 
                               ((stats.completed / stats.totalAssigned) * 100).toFixed(1) : '0',
                avgTATFormatted: stats.avgTAT ? 
                                `${Math.floor(stats.avgTAT / 60)}h ${Math.round(stats.avgTAT % 60)}m` : 'N/A'
            },
            performance: {
                queryTime: Date.now() - startTime,
                fromCache: false
            }
        });

    } catch (error) {
        console.error('❌ Error in getDoctorStats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctor statistics',
            error: error.message
        });
    }
};

// 🔧 UTILITY: Generate random password
const generateRandomPassword = () => {
    const min = 100000;
    const max = 999999;
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    return randomNumber.toString();
};

// 🔧 UTILITY: Send welcome email
// const sendWelcomeEmail = async (email, fullName, username, password, role) => {
//     try {
//         let subject, text, html;
        
//         if (role === 'lab_staff') {
//             subject = 'Welcome to Medical Platform - Lab Staff Account Created';
//             text = `Hello ${fullName},\n\nYour lab staff account has been created successfully.\n\nUsername: ${username}\nTemporary Password: ${password}\n\nPlease login and change your password as soon as possible.\n\nRegards,\nMedical Platform Team`;
//             html = `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                     <h2 style="color: #2563eb;">Welcome to Medical Platform</h2>
//                     <p>Hello ${fullName},</p>
//                     <p>Your lab staff account has been created successfully.</p>
//                     <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                         <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
//                         <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
//                     </div>
//                     <p>Please login and change your password as soon as possible.</p>
//                     <p>Regards,<br>Medical Platform Team</p>
//                 </div>
//             `;
//         } else if (role === 'doctor_account') {
//             subject = 'Welcome to Medical Platform - Doctor Account Created';
//             text = `Hello Dr. ${fullName},\n\nYour doctor account has been created successfully.\n\nUsername: ${username}\nTemporary Password: ${password}\n\nPlease login and change your password as soon as possible.\n\nRegards,\nMedical Platform Team`;
//             html = `
//                 <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//                     <h2 style="color: #10b981;">Welcome to Medical Platform</h2>
//                     <p>Hello Dr. ${fullName},</p>
//                     <p>Your doctor account has been created successfully.</p>
//                     <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
//                         <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
//                         <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
//                     </div>
//                     <p>Please login and change your password as soon as possible.</p>
//                     <p>Regards,<br>Medical Platform Team</p>
//                 </div>
//             `;
//         }

//         await transporter.sendMail({
//             from: '"Medical Platform" <no-reply@medicalplatform.com>',
//             to: email,
//             subject,
//             text,
//             html
//         });
        
//         console.log(`✅ Welcome email sent to ${email} successfully`);
//         return true;
//     } catch (error) {
//         console.error('❌ Error sending welcome email:', error);
//         return false;
//     }
// };

// 🔧 FIXED: Register lab and staff
// export const registerLabAndStaff = async (req, res) => {
//     const session = await mongoose.startSession();
    
//     try {
//         await session.withTransaction(async () => {
//             const {
//                 labName, labIdentifier, contactPerson, contactEmail, contactPhone, 
//                 address, labNotes, labIsActive, staffUsername, staffEmail, staffFullName
//             } = req.body;

//             // Validation
//             if (!labName || !labIdentifier) {
//                 throw new Error('Laboratory name and identifier are required.');
//             }
//             if (!staffUsername || !staffEmail || !staffFullName) {
//                 throw new Error('Staff username, email, and full name are required.');
//             }

//             const staffPassword = generateRandomPassword();

//             // Check for existing records
//             const [labExists, staffUserExists] = await Promise.all([
//                 Lab.findOne({ $or: [{ name: labName }, { identifier: labIdentifier }] }).session(session),
//                 User.findOne({ $or: [{ email: staffEmail }, { username: staffUsername }] }).session(session)
//             ]);

//             if (labExists) {
//                 throw new Error('Laboratory with this name or identifier already exists.');
//             }
//             if (staffUserExists) {
//                 throw new Error('A user with the provided staff email or username already exists.');
//             }

//             // Create lab and staff user
//             const labData = {
//                 name: labName, 
//                 identifier: labIdentifier, 
//                 contactPerson, 
//                 contactEmail,
//                 contactPhone, 
//                 address, 
//                 notes: labNotes,
//                 isActive: labIsActive !== undefined ? labIsActive : true,
//             };

//             const [newLabDocument, staffUser] = await Promise.all([
//                 Lab.create([labData], { session }),
//                 User.create([{
//                     username: staffUsername, 
//                     email: staffEmail, 
//                     password: staffPassword,
//                     fullName: staffFullName, 
//                     role: 'lab_staff'
//                 }], { session })
//             ]);

//             // Update lab reference in staff user
//             staffUser[0].lab = newLabDocument[0]._id;
//             await staffUser[0].save({ session });

//             const staffUserResponse = staffUser[0].toObject();
//             delete staffUserResponse.password;

//             // Send email asynchronously
//             setImmediate(async () => {
//                 await sendWelcomeEmail(staffEmail, staffFullName, staffUsername, staffPassword, 'lab_staff');
//             });

//             return {
//                 lab: newLabDocument[0].toObject(),
//                 staffUser: staffUserResponse
//             };
//         });

//         res.status(201).json({
//             success: true,
//             message: 'Laboratory and initial lab staff user registered successfully. A welcome email with login credentials has been sent.'
//         });

//     } catch (error) {
//         console.error('❌ Error registering lab and staff:', error);
        
//         if (error.name === 'ValidationError') {
//             const messages = Object.values(error.errors).map(val => val.message);
//             return res.status(400).json({ success: false, message: messages.join(', ') });
//         }
        
//         res.status(500).json({ 
//             success: false, 
//             message: error.message || 'Server error during lab and staff registration.' 
//         });
//     } finally {
//         await session.endSession();
//     }
// };

export const deleteDoctor = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            const { forceDelete = false } = req.body;

            const doctor = await Doctor.findById(doctorId)
                .populate('userAccount')
                .session(session);
                
            if (!doctor) {
                throw new Error('Doctor not found');
            }

            // 🔧 OPTIMIZED: Check assigned studies efficiently
            const assignedStudiesCount = await DicomStudy.countDocuments({
                'assignment.assignedTo': doctorId,
                workflowStatus: { $in: ['assigned_to_doctor', 'report_in_progress'] }
            }).session(session);
            
            if (assignedStudiesCount > 0 && !forceDelete) {
                throw new Error(`Cannot delete doctor with ${assignedStudiesCount} assigned studies. Please reassign studies first or use force delete.`);
            }

            if (forceDelete) {
                // Hard delete - remove doctor and user account
                await Promise.all([
                    User.findByIdAndDelete(doctor.userAccount._id).session(session),
                    Doctor.findByIdAndDelete(doctorId).session(session)
                ]);
                
                return { 
                    message: `Dr. ${doctor.userAccount.fullName} has been permanently deleted`,
                    type: 'hard_delete'
                };
            } else {
                // Soft delete - deactivate doctor and user account
                await Promise.all([
                    User.findByIdAndUpdate(doctor.userAccount._id, { isActive: false }).session(session),
                    Doctor.findByIdAndUpdate(doctorId, { isActiveProfile: false }).session(session)
                ]);
                
                return { 
                    message: `Dr. ${doctor.userAccount.fullName} has been deactivated`,
                    type: 'soft_delete'
                };
            }
        });

        // 🔧 PERFORMANCE: Clear related caches
        cache.del(`doctor_profile_${req.params.doctorId}`);
        cache.del('doctors_list_*');

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error deleting doctor:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting doctor'
        });
    } finally {
        await session.endSession();
    }
};

// 🔧 HIGH-PERFORMANCE: Toggle doctor status (optimized)
export const toggleDoctorStatus = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            const { isActive } = req.body;

            const doctor = await Doctor.findById(doctorId)
                .populate('userAccount')
                .session(session);
                
            if (!doctor) {
                throw new Error('Doctor not found');
            }

            // 🔧 OPTIMIZED: Parallel updates
            await Promise.all([
                Doctor.findByIdAndUpdate(doctorId, { isActiveProfile: isActive }).session(session),
                User.findByIdAndUpdate(doctor.userAccount._id, { isActive: isActive }).session(session)
            ]);

            // 🔧 PERFORMANCE: Clear related caches
            cache.del(`doctor_profile_${doctorId}`);
            cache.del('doctors_list_*');

            return {
                doctorName: doctor.userAccount.fullName,
                isActive
            };
        });

        res.json({
            success: true,
            message: `Doctor has been ${req.body.isActive ? 'activated' : 'deactivated'}`
        });

    } catch (error) {
        console.error('❌ Error toggling doctor status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating doctor status'
        });
    } finally {
        await session.endSession();
    }
};

// 🔧 HIGH-PERFORMANCE: Send doctor email (optimized with templates)
export const sendDoctorEmail = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { subject, message, emailType = 'custom' } = req.body;
        const startTime = Date.now();

        if (!subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Subject and message are required'
            });
        }

        const doctor = await Doctor.findById(doctorId)
            .populate('userAccount', 'fullName email')
            .lean();
            
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }

        // 🔧 OPTIMIZED: Email template generation
        const emailTemplates = {
            reminder: {
                color: '#667eea',
                icon: '🔔',
                title: 'Reminder - Medical Platform',
                bgColor: '#f8f9fa'
            },
            notification: {
                color: '#28a745',
                icon: '📢',
                title: 'Notification - Medical Platform',
                bgColor: '#d4edda'
            },
            warning: {
                color: '#ffc107',
                icon: '⚠️',
                title: 'Important Notice - Medical Platform',
                bgColor: '#fff3cd'
            },
            custom: {
                color: '#6f42c1',
                icon: '📧',
                title: 'Message from Administration',
                bgColor: '#f8f9fa'
            }
        };

        const template = emailTemplates[emailType] || emailTemplates.custom;
        
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, ${template.color} 0%, ${template.color}aa 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                    <h2 style="margin: 0;">${template.icon} ${template.title}</h2>
                </div>
                <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e1e5e9; border-top: none; border-radius: 0 0 10px 10px;">
                    <p>Hello Dr. ${doctor.userAccount.fullName},</p>
                    <div style="background-color: ${template.bgColor}; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                    <p>Best regards,<br>Medical Platform Administration</p>
                    <hr style="border: none; border-top: 1px solid #e1e5e9; margin: 20px 0;">
                    <p style="font-size: 12px; color: #6c757d;">
                        This is an automated message from the Medical Platform.
                    </p>
                </div>
            </div>
        `;

        // 🔧 PERFORMANCE: Send email asynchronously
        await transporter.sendMail({
            from: {
                name: 'Medical Platform Administration',
                address: process.env.SMTP_USER
            },
            to: doctor.userAccount.email,
            subject: subject,
            html: emailHtml
        });

        const processingTime = Date.now() - startTime;
        console.log(`✅ Email sent to Dr. ${doctor.userAccount.fullName} in ${processingTime}ms`);

        res.json({
            success: true,
            message: `Email sent successfully to Dr. ${doctor.userAccount.fullName}`,
            data: {
                recipient: {
                    name: doctor.userAccount.fullName,
                    email: doctor.userAccount.email
                },
                email: {
                    subject: subject,
                    type: emailType,
                    sentAt: new Date()
                }
            },
            performance: {
                processingTime
            }
        });

    } catch (error) {
        console.error('❌ Error sending email to doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending email',
            error: error.message
        });
    }
};

// 🔧 HIGH-PERFORMANCE: Reset doctor password (optimized)
export const resetDoctorPassword = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            const { sendEmail = true } = req.body;

            const doctor = await Doctor.findById(doctorId)
                .populate('userAccount', 'fullName email username')
                .session(session);
                
            if (!doctor) {
                throw new Error('Doctor not found');
            }

            const newPassword = generateRandomPassword();

            // 🔧 OPTIMIZED: Update user password
            await User.findByIdAndUpdate(doctor.userAccount._id, {
                password: newPassword,
                isLoggedIn: false
            }).session(session);

            // 🔧 PERFORMANCE: Send email asynchronously if requested
            if (sendEmail) {
                setImmediate(async () => {
                    const emailHtml = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                                <h2 style="margin: 0;">🔑 Password Reset - Medical Platform</h2>
                            </div>
                            <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e1e5e9; border-top: none; border-radius: 0 0 10px 10px;">
                                <p>Hello Dr. ${doctor.userAccount.fullName},</p>
                                <p>Your password has been reset by the administrator.</p>
                                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc3545;">
                                    <p style="margin: 5px 0;"><strong>Username:</strong> ${doctor.userAccount.username}</p>
                                    <p style="margin: 5px 0;"><strong>New Password:</strong> ${newPassword}</p>
                                </div>
                                <p><strong>Important:</strong> Please login and change your password immediately for security reasons.</p>
                                <p>Best regards,<br>Medical Platform Administration</p>
                            </div>
                        </div>
                    `;

                    await transporter.sendMail({
                        from: {
                            name: 'Medical Platform Administration',
                            address: process.env.SMTP_USER
                        },
                        to: doctor.userAccount.email,
                        subject: 'Password Reset - Medical Platform',
                        html: emailHtml
                    });
                });
            }

            // 🔧 PERFORMANCE: Clear related caches
            cache.del(`doctor_profile_${doctorId}`);

            return {
                doctorName: doctor.userAccount.fullName,
                email: doctor.userAccount.email,
                newPassword: sendEmail ? 'Sent via email' : newPassword
            };
        });

        res.json({
            success: true,
            message: `Password reset successfully for doctor`,
            data: {
                resetAt: new Date()
            }
        });

    } catch (error) {
        console.error('❌ Error resetting doctor password:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error resetting password'
        });
    } finally {
        await session.endSession();
    }
};


export const getDoctorById = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const startTime = Date.now();

        // 🔧 PERFORMANCE: Check cache first
        const cacheKey = `doctor_profile_${doctorId}`;
        let cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            return res.json({
                success: true,
                doctor: cachedData,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        const doctor = await Doctor.findById(doctorId)
            .populate({
                path: 'userAccount',
                select: 'fullName email username isActive isLoggedIn'
            })
            .lean();

        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }

        if (!doctor.userAccount) {
            return res.status(404).json({
                success: false,
                message: 'Doctor user account not found'
            });
        }

        const doctorResponse = {
            _id: doctor._id,
            userId: doctor.userAccount._id,
            fullName: doctor.userAccount.fullName,
            email: doctor.userAccount.email,
            username: doctor.userAccount.username,
            specialization: doctor.specialization,
            licenseNumber: doctor.licenseNumber,
            department: doctor.department || 'N/A',
            experience: doctor.yearsOfExperience || 'N/A',
            yearsOfExperience: doctor.yearsOfExperience || 0,
            qualifications: doctor.qualifications?.join(', ') || 'N/A',
            contactPhone: doctor.contactPhoneOffice || 'N/A',
            isActive: doctor.isActiveProfile && doctor.userAccount.isActive,
            isLoggedIn: doctor.userAccount.isLoggedIn, 
            createdAt: doctor.createdAt,
            updatedAt: doctor.updatedAt
        };

        // 🔧 PERFORMANCE: Cache the result
        cache.set(cacheKey, doctorResponse, 300); // 5 minutes

        res.json({
            success: true,
            doctor: doctorResponse,
            performance: {
                queryTime: Date.now() - startTime,
                fromCache: false
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching doctor by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching doctor details',
            error: error.message
        });
    }
};

// 🔧 HIGH-PERFORMANCE: Update doctor (optimized with validation)
export const updateDoctor = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            const {
                fullName, email, username,
                specialization, licenseNumber, department, qualifications, 
                yearsOfExperience, contactPhoneOffice, isActiveProfile
            } = req.body;

            const doctor = await Doctor.findById(doctorId)
                .populate('userAccount')
                .session(session);
                
            if (!doctor) {
                throw new Error('Doctor not found');
            }

            // 🔧 OPTIMIZED: Parallel validation queries
            const validationQueries = [];
            
            if (email !== doctor.userAccount.email) {
                validationQueries.push(
                    User.findOne({ email, _id: { $ne: doctor.userAccount._id } }).session(session)
                        .then(user => ({ type: 'email', exists: !!user }))
                );
            }

            if (username !== doctor.userAccount.username) {
                validationQueries.push(
                    User.findOne({ username, _id: { $ne: doctor.userAccount._id } }).session(session)
                        .then(user => ({ type: 'username', exists: !!user }))
                );
            }

            if (licenseNumber !== doctor.licenseNumber) {
                validationQueries.push(
                    Doctor.findOne({ licenseNumber, _id: { $ne: doctorId } }).session(session)
                        .then(doc => ({ type: 'license', exists: !!doc }))
                );
            }

            const validationResults = await Promise.all(validationQueries);
            
            for (const result of validationResults) {
                if (result.exists) {
                    const messages = {
                        email: 'Email is already in use by another user',
                        username: 'Username is already in use by another user',
                        license: 'License number is already in use by another doctor'
                    };
                    throw new Error(messages[result.type]);
                }
            }

            // 🔧 OPTIMIZED: Parallel updates
            const qualificationsArray = Array.isArray(qualifications) 
                ? qualifications 
                : (typeof qualifications === 'string' ? qualifications.split(',').map(q => q.trim()) : []);

            await Promise.all([
                User.findByIdAndUpdate(doctor.userAccount._id, {
                    fullName, email, username,
                    isActive: isActiveProfile !== undefined ? isActiveProfile : doctor.userAccount.isActive
                }, { session }),
                
                Doctor.findByIdAndUpdate(doctorId, {
                    specialization, licenseNumber, department,
                    qualifications: qualificationsArray,
                    yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : undefined,
                    contactPhoneOffice,
                    isActiveProfile: isActiveProfile !== undefined ? isActiveProfile : doctor.isActiveProfile
                }, { session })
            ]);

            // 🔧 PERFORMANCE: Clear related caches
            cache.del(`doctor_profile_${doctorId}`);
            cache.del('doctors_list_*');

            // 🔧 NEW: Return updated doctor data
            const updatedDoctor = await Doctor.findById(doctorId)
                .populate('userAccount', 'fullName email username isActive isLoggedIn')
                .lean();

            return {
                doctorId: updatedDoctor._id,
                fullName: updatedDoctor.userAccount.fullName,
                email: updatedDoctor.userAccount.email,
                username: updatedDoctor.userAccount.username,
                specialization: updatedDoctor.specialization,
                licenseNumber: updatedDoctor.licenseNumber,
                department: updatedDoctor.department || 'N/A',
                experience: updatedDoctor.yearsOfExperience ? `${updatedDoctor.yearsOfExperience} years` : 'N/A',
                yearsOfExperience: updatedDoctor.yearsOfExperience || 0,
                qualifications: updatedDoctor.qualifications?.join(', ') || 'N/A',
                contactPhone: updatedDoctor.contactPhoneOffice || 'N/A',
                isActive: updatedDoctor.isActiveProfile && updatedDoctor.userAccount.isActive,
                isLoggedIn: updatedDoctor.userAccount.isLoggedIn,
                createdAt: updatedDoctor.createdAt,
                updatedAt: updatedDoctor.updatedAt
            };
        });

        res.json({
            success: true,
            message: 'Doctor details updated successfully',
            doctor: {
                _id: updatedDoctor._id,
                userId: updatedDoctor.userAccount._id,
                fullName: updatedDoctor.userAccount.fullName,
                email: updatedDoctor.userAccount.email,
                username: updatedDoctor.userAccount.username,
                specialization: updatedDoctor.specialization,
                licenseNumber: updatedDoctor.licenseNumber,
                department: updatedDoctor.department || 'N/A',
                experience: updatedDoctor.yearsOfExperience ? `${updatedDoctor.yearsOfExperience} years` : 'N/A',
                yearsOfExperience: updatedDoctor.yearsOfExperience || 0,
                qualifications: updatedDoctor.qualifications?.join(', ') || 'N/A',
                contactPhone: updatedDoctor.contactPhoneOffice || 'N/A',
                isActive: updatedDoctor.isActiveProfile && updatedDoctor.userAccount.isActive,
                isLoggedIn: updatedDoctor.userAccount.isLoggedIn,
                createdAt: updatedDoctor.createdAt,
                updatedAt: updatedDoctor.updatedAt
            }
        });

    } catch (error) {
        console.error('❌ Error updating doctor:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating doctor details'
        });
    } finally {
        await session.endSession();
    }
};





export const uploadDoctorSignature = (req, res, next) => {
    const upload = signatureUpload.single('signature');
    
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                console.warn('⚠️ Signature file too large, proceeding without signature');
                // Don't fail the request, just proceed without signature
                return next();
            }
            console.warn('⚠️ Multer error:', err.message, 'proceeding without signature');
            return next();
        } else if (err) {
            console.warn('⚠️ Upload error:', err.message, 'proceeding without signature');
            return next();
        }
        
        // Continue to next middleware/controller
        next();
    });
};


export const registerDoctorWithSignature = async (req, res) => {
    // Apply signature upload middleware inline
    uploadDoctorSignature(req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: 'Signature upload failed: ' + err.message
            });
        }
        
        // Call the main registration function
        await registerDoctor(req, res);
    });
};

// 🔧 UPDATED: Send welcome email using Resend (replace the existing sendWelcomeEmail function)
const sendWelcomeEmail = async (email, fullName, username, password, role) => {
    try {
        console.log(`📧 Sending welcome email to ${email} for role: ${role} via Resend`);
        
        if (role === 'doctor_account') {
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Welcome - Doctor Account</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
                        .credentials { background-color: #d1fae5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981; }
                        .button { display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🏥 Medical Platform</h1>
                            <h2>Welcome Dr. ${fullName}!</h2>
                        </div>
                        <div class="content">
                            <h3>Hello Dr. ${fullName}!</h3>
                            <p>Your doctor account has been created successfully. You now have access to the Medical Platform's advanced diagnostic and reporting tools.</p>
                            
                            <div class="credentials">
                                <p style="margin: 5px 0;"><strong>🔑 Username:</strong> ${username}</p>
                                <p style="margin: 5px 0;"><strong>🔒 Temporary Password:</strong> ${password}</p>
                            </div>
                            
                            <p><strong>⚠️ Important Security Notice:</strong></p>
                            <ul>
                                <li>Please login and change your password immediately</li>
                                <li>This temporary password will expire in 24 hours</li>
                                <li>Your account provides access to sensitive medical data</li>
                                <li>Follow HIPAA compliance guidelines at all times</li>
                            </ul>
                            
                            <div style="text-align: center;">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="button">🚀 Access Doctor Portal</a>
                            </div>
                            
                            <hr style="margin: 30px 0; border: none; border-top: 1px solid #d1d5db;">
                            
                            <p style="font-size: 14px; color: #6b7280;">
                                <strong>Doctor Platform Features:</strong><br>
                                • Review assigned DICOM studies<br>
                                • Create and finalize medical reports<br>
                                • Access RadiAnt DICOM Viewer integration<br>
                                • Manage patient workflow status<br>
                                • Secure communication with lab staff
                            </p>
                        </div>
                        <div class="footer">
                            <p>© 2025 Medical Platform. All rights reserved.</p>
                            <p>For technical support, please contact system administrator.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            // 🔧 UPDATED: Use Resend transporter
            const mailOptions = {
                to: email,
                name: fullName || username || 'User', // 🔧 ADDED: Proper name for Brevo
                subject: `🎉 Welcome to Medical Platform - Your ${role} Account`,
                html: emailHtml
            };
    
            const result = await transporter.sendMail(mailOptions);
            console.log(`✅ Welcome email sent via Brevo to ${email}`);
            return true;
            
        } else if (role === 'lab_staff') {
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Welcome - Lab Staff Account</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
                        .credentials { background-color: #dbeafe; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2563eb; }
                        .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🏥 Medical Platform</h1>
                            <h2>Welcome Lab Staff!</h2>
                        </div>
                        <div class="content">
                            <h3>Hello ${fullName}!</h3>
                            <p>Your lab staff account has been created successfully. You can now access the Medical Platform to manage DICOM studies and collaborate with medical professionals.</p>
                            
                            <div class="credentials">
                                <p style="margin: 5px 0;"><strong>🔑 Username:</strong> ${username}</p>
                                <p style="margin: 5px 0;"><strong>🔒 Temporary Password:</strong> ${password}</p>
                            </div>
                            
                            <p><strong>⚠️ Important Security Notice:</strong></p>
                            <ul>
                                <li>Please login and change your password immediately</li>
                                <li>This temporary password will expire in 24 hours</li>
                                <li>Keep your login credentials secure</li>
                            </ul>
                            
                            <div style="text-align: center;">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="button">🚀 Login to Platform</a>
                            </div>
                            
                            <hr style="margin: 30px 0; border: none; border-top: 1px solid #d1d5db;">
                            
                            <p style="font-size: 14px; color: #6b7280;">
                                <strong>Lab Staff Features:</strong><br>
                                • Upload and manage DICOM studies<br>
                                • Track study workflow status<br>
                                • Collaborate with radiologists<br>
                                • Generate reports and analytics
                            </p>
                        </div>
                        <div class="footer">
                            <p>© 2025 Medical Platform. All rights reserved.</p>
                            <p>If you need assistance, please contact system administrator.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;

            const mailOptions = {
                to: email,
                name: fullName || username || 'User', // 🔧 ADDED: Proper name for Brevo
                subject: `🎉 Welcome to Medical Platform - Your ${role} Account`,
                html: emailHtml
            };

            const result = await transporter.sendMail(mailOptions);
            console.log(`✅ Welcome email sent via Brevo to ${email}`);
            return true;

           
        }
        
    } catch (error) {
        console.error('❌ Error sending welcome email via Resend:', error);
        return false;
    }
};

// 🔧 UPDATED: Register doctor function (replace your existing registerDoctor function)
export const registerDoctor = async (req, res) => {
    console.log('🔍 ===== REGISTER DOCTOR CALLED =====');
    console.log('📝 req.body:', req.body);
    console.log('📁 req.file:', req.file);
    
    const session = await mongoose.startSession();
    
    try {
        const result = await session.withTransaction(async () => {
            const {
                username, email, fullName,
                specialization, licenseNumber, department, qualifications, 
                yearsOfExperience, contactPhoneOffice, isActiveProfile
            } = req.body;

            if (!username || !email || !fullName || !specialization || !licenseNumber) {
                throw new Error('Username, email, fullName, specialization, and licenseNumber are required.');
            }

            const password = "star@star";

            // Validation queries
            // const [userExists, doctorWithLicenseExists] = await Promise.all([
            //     User.findOne({ $or: [{ email }, { username }] }).session(session),
            //     Doctor.findOne({ licenseNumber }).session(session)
            // ]);

            // if (userExists) {
            //     throw new Error('User with this email or username already exists.');
            // }
            // if (doctorWithLicenseExists) {
            //     throw new Error('A doctor with this license number already exists.');
            // }

            
            const userWithUsername = await User.findOne({ username }).session(session);
            
            if (userWithUsername) {
                throw new Error('User with this username already exists.');
            }

            // Create user
            const userDocument = await User.create([{
                username, email, password, fullName, role: 'doctor_account'
            }], { session });

            console.log('✅ User created:', userDocument[0]._id);

            // 🔧 PROCESS SIGNATURE: Store in MongoDB instead of Wasabi
            let signatureProcessed = false;
            let optimizedSignature = null;
            let signatureFileSize = 0;
            let signatureOriginalName = '';
            let signatureMimeType = '';
            
            if (req.file) {
                try {
                    console.log('📝 Processing doctor signature for MongoDB storage...');
                    console.log('📁 File details:', {
                        originalname: req.file.originalname,
                        mimetype: req.file.mimetype,
                        size: req.file.size
                    });
                    
                    // 🔧 OPTIMIZE: Process signature image for MongoDB storage
                    optimizedSignature = await sharp(req.file.buffer)
                        .resize(400, 200, {
                            fit: 'contain',
                            background: { r: 255, g: 255, b: 255, alpha: 1 }
                        })
                        .png({ quality: 90, compressionLevel: 6 })
                        .toBuffer();

                    console.log('✅ Image optimized for MongoDB, size:', optimizedSignature.length);

                    // 🔧 STORE: File metadata for MongoDB
                    signatureFileSize = req.file.size;
                    signatureOriginalName = req.file.originalname;
                    signatureMimeType = req.file.mimetype;
                    signatureProcessed = true;
                    
                } catch (signatureError) {
                    console.error('❌ Error processing signature:', signatureError);
                    console.warn('⚠️ Continuing registration without signature');
                    signatureProcessed = false;
                    optimizedSignature = null;
                    signatureFileSize = 0;
                    signatureOriginalName = '';
                    signatureMimeType = '';
                }
            } else {
                console.log('ℹ️ No signature file provided');
            }

            // 🔧 BUILD: Doctor profile data with MongoDB signature storage
            const doctorProfileData = {
                userAccount: userDocument[0]._id, 
                specialization, 
                licenseNumber, 
                department: department || '',
                qualifications: qualifications ? 
                    qualifications.split(',').map(q => q.trim()).filter(q => q) : [],
                yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : null,
                contactPhoneOffice: contactPhoneOffice || '',
                isActiveProfile: isActiveProfile !== undefined ? isActiveProfile === 'true' : true
            };

            // 🔧 STORE SIGNATURE IN MONGODB: Add signature fields with processed image
            if (signatureProcessed && optimizedSignature) {
                // Convert buffer to base64 for MongoDB storage
                const signatureBase64 = optimizedSignature.toString('base64');
                
                doctorProfileData.signature = signatureBase64;
                doctorProfileData.signatureMetadata = {
                    uploadedAt: new Date(),
                    originalSize: signatureFileSize,
                    optimizedSize: optimizedSignature.length,
                    originalName: signatureOriginalName,
                    mimeType: signatureMimeType || 'image/png',
                    lastUpdated: new Date(),
                    format: 'base64',
                    width: 400,
                    height: 200
                };
                console.log('✅ Added signature to doctor profile for MongoDB storage');
            } else {
                // 🔧 SAFE: Set default signature fields
                doctorProfileData.signature = '';
                doctorProfileData.signatureMetadata = null;
                console.log('ℹ️ No signature added to doctor profile');
            }

            console.log('📋 Doctor profile data (excluding signature base64):', {
                ...doctorProfileData,
                signature: signatureProcessed ? '[Base64 Image Data]' : '',
                signatureMetadata: doctorProfileData.signatureMetadata
            });

            const doctorProfile = await Doctor.create([doctorProfileData], { session });
            console.log('✅ Doctor profile created with signature stored in MongoDB:', doctorProfile[0]._id);

            // Clear caches
            cache.del('doctors_list_*');

            return {
                user: userDocument[0].toObject(),
                doctorProfile: doctorProfile[0].toObject(),
                signatureProcessed: signatureProcessed,
                signatureDetails: signatureProcessed ? {
                    originalSize: signatureFileSize,
                    optimizedSize: optimizedSignature ? optimizedSignature.length : 0,
                    originalName: signatureOriginalName,
                    mimeType: signatureMimeType,
                    storageType: 'mongodb'
                } : null,
                emailData: {
                    email,
                    fullName,
                    username,
                    password
                }
            };
        });

        console.log('✅ Transaction completed successfully');

        // 🔧 SEND EMAIL: Welcome email asynchronously
        setImmediate(async () => {
            console.log('📧 Sending doctor welcome email...');
            const emailSent = await sendWelcomeEmail(
                result.emailData.email, 
                result.emailData.fullName, 
                result.emailData.username, 
                result.emailData.password, 
                'doctor_account'
            );
            
            if (emailSent) {
                console.log('✅ Doctor welcome email sent successfully');
            } else {
                console.error('❌ Failed to send doctor welcome email');
            }
        });

        const baseMessage = 'Doctor registered successfully. A welcome email with login credentials is being sent.';
        const signatureMessage = req.file ? 
            (result.signatureProcessed ? ' Signature stored successfully in database.' : ' Signature processing failed but registration completed.') : 
            '';

        res.status(201).json({
            success: true,
            message: baseMessage + signatureMessage,
            signatureProcessed: result.signatureProcessed,
            data: {
                doctorId: result.doctorProfile._id,
                doctorRegistered: true,
                signatureProvided: !!req.file,
                signatureStored: result.signatureProcessed,
                signatureDetails: result.signatureDetails,
                emailQueued: true,
                storageType: 'mongodb'
            }
        });

    } catch (error) {
        console.error('❌ Error registering doctor:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Server error during doctor registration.' 
        });
    } finally {
        await session.endSession();
    }
};


export const registerLabAndStaff = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        const result = await session.withTransaction(async () => {
            const {
                labName, labIdentifier, contactPerson, contactEmail, contactPhone, 
                address, labNotes, labIsActive, staffUsername, staffEmail, staffFullName
            } = req.body;

            // Validation
            if (!labName || !labIdentifier) {
                throw new Error('Laboratory name and identifier are required.');
            }
            if (!staffUsername || !staffEmail || !staffFullName) {
                throw new Error('Staff username, email, and full name are required.');
            }

            const staffPassword = "star@star";

            // Check for existing records
            const [labExists, staffUserExists] = await Promise.all([
                Lab.findOne({ $or: [{ name: labName }, { identifier: labIdentifier }] }).session(session),
                User.findOne({ $or: [{ email: staffEmail }, { username: staffUsername }] }).session(session)
            ]);

            if (labExists) {
                throw new Error('Laboratory with this name or identifier already exists.');
            }
            if (staffUserExists) {
                throw new Error('A user with the provided staff email or username already exists.');
            }

            // Create lab and staff user
            const labData = {
                name: labName, 
                identifier: labIdentifier, 
                contactPerson, 
                contactEmail,
                contactPhone, 
                address, 
                notes: labNotes,
                isActive: labIsActive !== undefined ? labIsActive : true,
            };

            const [newLabDocument, staffUser] = await Promise.all([
                Lab.create([labData], { session }),
                User.create([{
                    username: staffUsername, 
                    email: staffEmail, 
                    password: staffPassword,
                    fullName: staffFullName, 
                    role: 'lab_staff'
                }], { session })
            ]);

            // Update lab reference in staff user
            staffUser[0].lab = newLabDocument[0]._id;
            await staffUser[0].save({ session });

            const staffUserResponse = staffUser[0].toObject();
            delete staffUserResponse.password;

            return {
                lab: newLabDocument[0].toObject(),
                staffUser: staffUserResponse
            };
        });

        console.log('✅ Lab and staff transaction completed successfully');

        // Send welcome email asynchronously using Resend
        setImmediate(async () => {
            try {
                const emailSent = await sendWelcomeEmail(
                    result.staffUser.email, 
                    result.staffUser.fullName, 
                    result.staffUser.username, 
                    staffPassword, 
                    'lab_staff'
                );
                console.log(`📧 Welcome email ${emailSent ? 'sent' : 'failed'} to ${result.staffUser.email}`);
            } catch (emailError) {
                console.error('❌ Error sending welcome email:', emailError);
            }
        });

        res.status(201).json({
            success: true,
            message: 'Laboratory and initial lab staff user registered successfully. A welcome email with login credentials is being sent via Resend.',
            data: {
                labId: result.lab._id,
                labEntityId: result.lab._id.toString(), // 🆕 ADD: MongoDB ObjectId as string
                labName: result.lab.name,
                labIdentifier: result.lab.identifier,
                staffUserId: result.staffUser._id,
                staffEntityId: result.staffUser._id.toString(), // 🆕 ADD: Staff ObjectId as string
                staffName: result.staffUser.fullName,
                staffUsername: result.staffUser.username,
                emailQueued: true
            }
        });

    } catch (error) {
        console.error('❌ Error registering lab and staff:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Server error during lab and staff registration.' 
        });
    } finally {
        await session.endSession();
    }
};


// 🆕 NEW: Get pending studies specifically
export const getPendingStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 50; // Higher default for pending
        
        console.log('🟡 ADMIN: Fetching PENDING studies specifically');
        
        // 🔧 STEP 1: Build lean query filters with PENDING status priority
        const queryFilters = {
            workflowStatus: { 
                $in: ['new_study_received', 'pending_assignment','assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                    'report_downloaded_radiologist', 'report_downloaded'
                ] 
            }
        };
        
        // Optimized date filtering with pre-calculated timestamps
        let filterStartDate = null;
        let filterEndDate = null;
        
        // Replace your existing date filtering logic with this:
if (req.query.quickDatePreset || req.query.dateFilter) {
    const preset = req.query.quickDatePreset || req.query.dateFilter;
    const now = Date.now();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
    
    switch (preset) {
        case 'last24h':
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
            break;

        case 'today':
            // ✅ IST FIX: Today in IST timezone
            const currentTimeIST = new Date(Date.now() + IST_OFFSET);
            const todayStartIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                0, 0, 0, 0
            );
            const todayEndIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
            break;

        case 'yesterday':
            // ✅ IST FIX: Yesterday in IST timezone
            const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
            const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000);
            const yesterdayStartIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                0, 0, 0, 0
            );
            const yesterdayEndIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisWeek':
            // ✅ IST FIX: This week in IST timezone
            const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
            const dayOfWeek = currentTimeISTWeek.getDay();
            const weekStartIST = new Date(
                currentTimeISTWeek.getFullYear(),
                currentTimeISTWeek.getMonth(),
                currentTimeISTWeek.getDate() - dayOfWeek,
                0, 0, 0, 0
            );
            const weekEndIST = new Date(currentTimeISTWeek.getTime());
            filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisMonth':
            // ✅ IST FIX: This month in IST timezone
            const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
            const monthStartIST = new Date(
                currentTimeISTMonth.getFullYear(),
                currentTimeISTMonth.getMonth(),
                1,
                0, 0, 0, 0
            );
            const monthEndIST = new Date(currentTimeISTMonth.getTime());
            filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
            break;

        case 'custom':
            if (req.query.customDateFrom || req.query.customDateTo) {
                // ✅ IST FIX: Custom dates in IST
                if (req.query.customDateFrom) {
                    const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                    filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                }
                if (req.query.customDateTo) {
                    const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                    filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                }
            } else {
                filterStartDate = new Date(now - 86400000);
                filterEndDate = new Date(now);
            }
            break;

        default:
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
    }
} else {
    // ✅ IST FIX: Default to today in IST when no filter specified
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
    const todayStartISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        0, 0, 0, 0
    );
    const todayEndISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        23, 59, 59, 999
    );
    filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
    filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
}

        // Apply date filter with proper indexing
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Optimized other filters
        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: req.query.modality }
            ];
        }

        if (req.query.labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.query.labId);
        }

        console.log(`🔍 PENDING query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 2: Ultra-optimized aggregation pipeline
        const pipeline = [
            // 🔥 CRITICAL: Start with most selective match first
            { $match: queryFilters },
            
            // 🔥 PERFORMANCE: Sort before project to use index efficiently
            { $sort: { createdAt: -1 } },
            
            // 🔥 CRITICAL: Limit early to reduce pipeline processing
            { $limit: Math.min(limit, 1000) },
            
            // 🔥 PERFORMANCE: Project only after limiting
            {
                $project: {
                    _id: 1,
                    studyInstanceUID: 1,
                    orthancStudyID: 1,
                    accessionNumber: 1,
                    workflowStatus: 1,
                    modality: 1,
                    modalitiesInStudy: 1,
                    studyDescription: 1,
                    examDescription: 1,
                    numberOfSeries: 1,
                    seriesCount: 1,
                    numberOfImages: 1,
                    instanceCount: 1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
                    'assignment.priority': 1,
                    'assignment.assignedAt': 1,
                    doctorReports: 1,
                    lastAssignedDoctor: 1,
                    reportInfo: 1,
                    reportFinalizedAt: 1,
                    // clinicalHistory: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1,
                    lastAssignmentAt: 1,
                    patientId: 1,
                    age:1,
                    gender:1,
                    clinicalHistory: 1,
                                        preProcessedDownload: 1

                }
            }
        ];

        // 🔥 STEP 3: Execute optimized parallel queries
        console.log(`🚀 Executing optimized pending query...`);
        const queryStart = Date.now();
        
        const [studiesResult, totalCountResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // Handle potential errors
        if (studiesResult.status === 'rejected') {
            throw new Error(`Pending studies query failed: ${studiesResult.reason.message}`);
        }
        if (totalCountResult.status === 'rejected') {
            console.warn('Count query failed, using studies length:', totalCountResult.reason.message);
        }

        const studies = studiesResult.value;
        const totalStudies = totalCountResult.status === 'fulfilled' ? totalCountResult.value : studies.length;
        
        const queryTime = Date.now() - queryStart;
        console.log(`⚡ Pending core query completed in ${queryTime}ms - found ${studies.length} studies`);

        // 🔥 STEP 4: Optimized batch lookups with connection pooling awareness
        const lookupMaps = {
            patients: new Map(),
            labs: new Map(),
            doctors: new Map()
        };

        if (studies.length > 0) {
            const lookupStart = Date.now();
            
            // Extract unique IDs with Set for deduplication
            const uniqueIds = {
                patients: [...new Set(studies.map(s => s.patient?.toString()).filter(Boolean))],
                labs: [...new Set(studies.map(s => s.sourceLab?.toString()).filter(Boolean))],
                doctors: [...new Set(studies.flatMap(s => {
                    // Handle both legacy (object) and new (array) formats
                    let assignments = [];
                    
                    if (Array.isArray(s.lastAssignedDoctor)) {
                        assignments = s.lastAssignedDoctor;
                    } else if (s.lastAssignedDoctor && typeof s.lastAssignedDoctor === 'object') {
                        assignments = [s.lastAssignedDoctor];
                    }
                    
                    return assignments.map(assignment => assignment?.doctorId?.toString()).filter(Boolean);
                }).filter(Boolean))]
            };

            // 🔥 PARALLEL: Optimized batch lookups with lean queries
            const lookupPromises = [];

            if (uniqueIds.patients.length > 0) {
                lookupPromises.push(
                    mongoose.model('Patient')
                        .find({ _id: { $in: uniqueIds.patients.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('patientID firstName lastName patientNameRaw gender ageString computed.fullName clinicalInfo.clinicalHistory')
                        .lean()
                        .then(results => ({ type: 'patients', data: results }))
                );
            }

            if (uniqueIds.labs.length > 0) {
                lookupPromises.push(
                    mongoose.model('Lab')
                        .find({ _id: { $in: uniqueIds.labs.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('name identifier')
                        .lean()
                        .then(results => ({ type: 'labs', data: results }))
                );
            }

            if (uniqueIds.doctors.length > 0) {
                lookupPromises.push(
                    mongoose.model('Doctor')
                        .find({ _id: { $in: uniqueIds.doctors.map(id => new mongoose.Types.ObjectId(id)) } })
                        .populate('userAccount', 'fullName email isActive')
                        .lean()
                        .then(results => ({ type: 'doctors', data: results }))
                );
            }

            // Execute all lookups in parallel
            const lookupResults = await Promise.allSettled(lookupPromises);
            
            // Process results and build maps
            lookupResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { type, data } = result.value;
                    data.forEach(item => {
                        lookupMaps[type].set(item._id.toString(), item);
                    });
                } else {
                    console.warn(`Lookup failed for ${result.reason}`);
                }
            });
            
            const lookupTime = Date.now() - lookupStart;
            console.log(`🔍 Batch lookups completed in ${lookupTime}ms`);
        }

        // 🔥 STEP 5: Optimized formatting with pre-compiled status maps
        const formatStart = Date.now();
        
        const formattedStudies = studies.map(study => {
            // Get related data from maps (faster than repeated lookups)
            const patient = lookupMaps.patients.get(study.patient?.toString());
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());
            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                        study.preProcessedDownload?.zipUrl &&
                        (!study.preProcessedDownload?.zipExpiresAt || 
                         study.preProcessedDownload.zipExpiresAt > new Date());
    

            // 🔥 Handle both legacy (object) and new (array) formats for lastAssignedDoctor
            let latestAssignedDoctor = null;
            let latestAssignmentEntry = null;
            let allDoctorAssignments = [];
            let isLegacyFormat = false;

            // Normalize lastAssignedDoctor to always be an array for consistent processing
            let assignmentArray = [];
            
            if (Array.isArray(study.lastAssignedDoctor)) {
                assignmentArray = study.lastAssignedDoctor;
                isLegacyFormat = false;
            } else if (study.lastAssignedDoctor && typeof study.lastAssignedDoctor === 'object') {
                assignmentArray = [study.lastAssignedDoctor];
                isLegacyFormat = true;
            } else {
                assignmentArray = [];
            }

            if (assignmentArray.length > 0) {
                // Sort the array by assignedAt in descending order to get the latest
                const sortedAssignments = [...assignmentArray].sort((a, b) => {
                    const dateA = a?.assignedAt ? new Date(a.assignedAt) : new Date(0);
                    const dateB = b?.assignedAt ? new Date(b.assignedAt) : new Date(0);
                    return dateB - dateA; // Latest date first
                });
                
                latestAssignmentEntry = sortedAssignments[0];
                
                if (latestAssignmentEntry?.doctorId) {
                    latestAssignedDoctor = lookupMaps.doctors.get(latestAssignmentEntry.doctorId.toString());
                }

                // Map all doctor assignments with their details
                allDoctorAssignments = assignmentArray.map(entry => {
                    if (!entry || !entry.doctorId) return null;
                    
                    const doctor = lookupMaps.doctors.get(entry.doctorId.toString());
                    return {
                        doctorId: entry.doctorId,
                        assignedAt: entry.assignedAt,
                        doctorDetails: doctor ? {
                            _id: doctor._id,
                            fullName: doctor.userAccount?.fullName || 'Unknown Doctor',
                            email: doctor.userAccount?.email || null,
                            specialization: doctor.specialization || null,
                            isActive: doctor.userAccount?.isActive || false
                        } : null
                    };
                }).filter(Boolean);
            }
            
            // Optimized patient display with fallback chain
            let patientDisplay = "N/A";
            let patientIdForDisplay = study.patientId || "N/A";
const patientAgeGenderDisplay = study.age && study.gender ? 
                                   `${study.age}/${study.gender}` : 
                                   study.age || study.gender || 'N/A';
            if (patient) {
                patientDisplay = patient.computed?.fullName || 
                                patient.patientNameRaw || 
                                `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
                patientIdForDisplay = patient.patientID || patientIdForDisplay;

                // const agePart = patient.ageString || "";
                // const genderPart = patient.gender || "";
                // patientAgeGenderDisplay = agePart && genderPart ? `${agePart} / ${genderPart}` :
                //                        agePart || (genderPart ? `/ ${genderPart}` : "N/A");
            }

            // console.log("yes hostory",patient?.medicalHistory?.clinicalHistory)


            return {
                _id: study._id,
                studyInstanceUID: study.studyInstanceUID,
                orthancStudyID: study.orthancStudyID,
                accessionNumber: study.accessionNumber || 'N/A',
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                modality: study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                description: study.examDescription || study.studyDescription || 'N/A',
                seriesImages: `${study.numberOfSeries || study.seriesCount || 0}/${study.numberOfImages || study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                ? formatDicomDateTime(study.studyDate, study.studyTime)
                : study.studyDate 
                    ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                        year: 'numeric', month: 'short', day: '2-digit'
                    })
                    : 'N/A',
                
                workflowStatus: study.workflowStatus,
                currentCategory: 'pending', // All results will be pending
                createdAt: study.createdAt,
                reportedBy: study.reportInfo?.reporterName 
                
                || 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    // Use the latest uploadedAt if multiple reports
                    const latestReport = study.doctorReports.reduce((latest, curr) =>
                        new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                        study.doctorReports[0]
                    );
                    const dt = new Date(latestReport.uploadedAt);
                    // Format: 15 Jun 2025 03:30
                    return dt.toLocaleString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                                    timeZone: 'Asia/Kolkata'

                    }).replace(',', '');
                })()
                : null,
                uploadDateTime: study.createdAt
                ? new Date(study.createdAt).toLocaleString('en-GB', {
                    timeZone: 'Asia/Kolkata', // <-- THIS IS THE FIX.
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).replace(',', '')
                : 'N/A',
                assignedDoctorName: latestAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                assignedDate: study.lastAssignmentAt || study.assignment?.assignedAt,
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || '',                  
                // 🔥 NEW: Return properly formatted doctor assignments array
                doctorAssignments: allDoctorAssignments,

                 downloadOptions: {
        hasWasabiZip: hasWasabiZip,
        hasR2Zip: hasWasabiZip,
        wasabiFileName: study.preProcessedDownload?.zipFileName || null,
        wasabiSizeMB: study.preProcessedDownload?.zipSizeMB || 0,
        wasabiDownloadCount: study.preProcessedDownload?.downloadCount || 0,
        wasabiCreatedAt: study.preProcessedDownload?.zipCreatedAt || null,
        wasabiExpiresAt: study.preProcessedDownload?.zipExpiresAt || null,
        zipStatus: study.preProcessedDownload?.zipStatus || 'not_started'
    },
                
                // 🔥 NEW: Latest assigned doctor details for easy access
                latestAssignedDoctorDetails: latestAssignedDoctor ? {
                    _id: latestAssignedDoctor._id,
                    fullName: latestAssignedDoctor.userAccount?.fullName || 'Unknown Doctor',
                    email: latestAssignedDoctor.userAccount?.email || null,
                    specialization: latestAssignedDoctor.specialization || null,
                    isActive: latestAssignedDoctor.userAccount?.isActive || false,
                    assignedAt: latestAssignmentEntry?.assignedAt || null
                } : null,

                // 🔥 NEW: Assignment history summary
                assignmentHistory: {
                    totalAssignments: allDoctorAssignments.length,
                    hasActiveAssignment: latestAssignedDoctor !== null,
                    lastAssignedAt: latestAssignmentEntry?.assignedAt || null,
                    isLegacyFormat: isLegacyFormat,
                    assignmentChain: allDoctorAssignments.map(assignment => ({
                        doctorName: assignment.doctorDetails?.fullName || 'Unknown Doctor',
                        assignedAt: assignment.assignedAt,
                        isActive: assignment.doctorDetails?.isActive || false
                    }))
                }
            };
        });

        const formatTime = Date.now() - formatStart;
        const processingTime = Date.now() - startTime;
        
        console.log(`✅ PENDING: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 PENDING: Total processing time: ${processingTime}ms for ${formattedStudies.length} studies`);

        return res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
            recordsPerPage: limit,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: Math.ceil(totalStudies / limit),
                totalRecords: totalStudies,
                limit: limit,
                hasNextPage: totalStudies > limit,
                hasPrevPage: false,
                recordRange: {
                    start: 1,
                    end: formattedStudies.length
                },
                isSinglePage: totalStudies <= limit
            },
            summary: {
                byStatus: {
                    new_study_received: formattedStudies.filter(s => s.workflowStatus === 'new_study_received').length,
                    pending_assignment: formattedStudies.filter(s => s.workflowStatus === 'pending_assignment').length
                },
                byCategory: {
                    all: totalStudies,
                    pending: totalStudies,
                    inprogress: 0,
                    completed: 0
                },
                urgentStudies: formattedStudies.filter(s => ['EMERGENCY', 'STAT', 'URGENT'].includes(s.priority)).length,
                total: totalStudies,
                assignmentSummary: {
                    totalWithAssignments: formattedStudies.filter(s => s.assignmentHistory.hasActiveAssignment).length,
                    totalUnassigned: formattedStudies.filter(s => !s.assignmentHistory.hasActiveAssignment).length,
                    legacyFormat: formattedStudies.filter(s => s.assignmentHistory.isLegacyFormat).length
                }
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    lookups: studies.length > 0 ? `${Date.now() - formatStart}ms` : 0,
                    formatting: formatTime
                }
            },
            metadata: {
                dateRange: {
                    from: filterStartDate,
                    to: filterEndDate
                },
                filters: {
                    modality: req.query.modality || 'all',
                    labId: req.query.labId || 'all',
                    search: req.query.search || null,
                    dateType: req.query.dateType || 'createdAt'
                },
                pendingSpecific: {
                    statusesIncluded: ['new_study_received', 'pending_assignment'],
                    category: 'pending'
                }
            }
        });

    } catch (error) {
        console.error('❌ PENDING: Error fetching pending studies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching pending studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 NEW: Get in-progress studies specifically
export const getInProgressStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 50;
        
        console.log('🟠 ADMIN: Fetching IN-PROGRESS studies with optimization');
        
        // 🔧 STEP 1: Build lean query filters with optimized date handling
        const queryFilters = {
            workflowStatus: { 
                $in: [
                    
                    'report_finalized', 'report_drafted', 'report_uploaded'
                    
                ] 
            }
        };
        
        // Optimized date filtering with pre-calculated timestamps
        let filterStartDate = null;
        let filterEndDate = null;
        
       // Replace your existing date filtering logic with this:
if (req.query.quickDatePreset || req.query.dateFilter) {
    const preset = req.query.quickDatePreset || req.query.dateFilter;
    const now = Date.now();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
    
    switch (preset) {
        case 'last24h':
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
            break;

        case 'today':
            // ✅ IST FIX: Today in IST timezone
            const currentTimeIST = new Date(Date.now() + IST_OFFSET);
            const todayStartIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                0, 0, 0, 0
            );
            const todayEndIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
            break;

        case 'yesterday':
            // ✅ IST FIX: Yesterday in IST timezone
            const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
            const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000);
            const yesterdayStartIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                0, 0, 0, 0
            );
            const yesterdayEndIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisWeek':
            // ✅ IST FIX: This week in IST timezone
            const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
            const dayOfWeek = currentTimeISTWeek.getDay();
            const weekStartIST = new Date(
                currentTimeISTWeek.getFullYear(),
                currentTimeISTWeek.getMonth(),
                currentTimeISTWeek.getDate() - dayOfWeek,
                0, 0, 0, 0
            );
            const weekEndIST = new Date(currentTimeISTWeek.getTime());
            filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisMonth':
            // ✅ IST FIX: This month in IST timezone
            const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
            const monthStartIST = new Date(
                currentTimeISTMonth.getFullYear(),
                currentTimeISTMonth.getMonth(),
                1,
                0, 0, 0, 0
            );
            const monthEndIST = new Date(currentTimeISTMonth.getTime());
            filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
            break;

        case 'custom':
            if (req.query.customDateFrom || req.query.customDateTo) {
                // ✅ IST FIX: Custom dates in IST
                if (req.query.customDateFrom) {
                    const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                    filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                }
                if (req.query.customDateTo) {
                    const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                    filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                }
            } else {
                filterStartDate = new Date(now - 86400000);
                filterEndDate = new Date(now);
            }
            break;

        default:
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
    }
} else {
    // ✅ IST FIX: Default to today in IST when no filter specified
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
    const todayStartISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        0, 0, 0, 0
    );
    const todayEndISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        23, 59, 59, 999
    );
    filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
    filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
}
        // Apply date filter with proper indexing
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Optimized other filters
        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: req.query.modality }
            ];
        }

        if (req.query.labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.query.labId);
        }

        console.log(`🔍 IN-PROGRESS query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 2: Ultra-optimized aggregation pipeline
        const pipeline = [
            // 🔥 CRITICAL: Start with most selective match first
            { $match: queryFilters },
            
            // 🔥 Add category field early for consistency
            {
                $addFields: {
                    currentCategory: 'inprogress'
                }
            },
            
            // 🔥 PERFORMANCE: Sort before project to use index efficiently
            { $sort: { createdAt: -1 } },
            
            // 🔥 CRITICAL: Limit early to reduce pipeline processing
            { $limit: Math.min(limit, 1000) },
            
            // 🔥 PERFORMANCE: Project only essential fields after limiting
            {
                $project: {
                    _id: 1,
                    studyInstanceUID: 1,
                    orthancStudyID: 1,
                    accessionNumber: 1,
                    workflowStatus: 1,
                    currentCategory: 1,
                    modality: 1,
                    modalitiesInStudy: 1,
                    studyDescription: 1,
                    examDescription: 1,
                    numberOfSeries: 1,
                    seriesCount: 1,
                    numberOfImages: 1,
                    instanceCount: 1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
                    'assignment.priority': 1,
                    'assignment.assignedAt': 1,
                    lastAssignedDoctor: 1,
                    doctorReports: 1,
                    reportInfo: 1,
                    reportFinalizedAt: 1,
                    // clinicalHistory: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1,
                    lastAssignmentAt: 1,
                    age: 1,
                    gender: 1,
                    clinicalHistory: 1,
                    preProcessedDownload: 1
                }
            }
        ];

        // 🔥 STEP 3: Execute optimized parallel queries
        console.log(`🚀 Executing optimized IN-PROGRESS query...`);
        const queryStart = Date.now();
        
        const [studiesResult, totalCountResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // Handle potential errors
        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }
        if (totalCountResult.status === 'rejected') {
            console.warn('Count query failed, using studies length:', totalCountResult.reason.message);
        }

        const studies = studiesResult.value;
        const totalStudies = totalCountResult.status === 'fulfilled' ? totalCountResult.value : studies.length;
        
        const queryTime = Date.now() - queryStart;
        console.log(`⚡ IN-PROGRESS core query completed in ${queryTime}ms - found ${studies.length} studies`);

        // 🔥 STEP 4: Optimized batch lookups
        const lookupMaps = {
            patients: new Map(),
            labs: new Map(),
            doctors: new Map()
        };

        if (studies.length > 0) {
            const lookupStart = Date.now();
            
            // Extract unique IDs with Set for deduplication
            const uniqueIds = {
                patients: [...new Set(studies.map(s => s.patient?.toString()).filter(Boolean))],
                labs: [...new Set(studies.map(s => s.sourceLab?.toString()).filter(Boolean))],
                doctors: [...new Set(studies.flatMap(s => {
                    let assignments = [];
                    
                    if (Array.isArray(s.lastAssignedDoctor)) {
                        assignments = s.lastAssignedDoctor;
                    } else if (s.lastAssignedDoctor && typeof s.lastAssignedDoctor === 'object') {
                        assignments = [s.lastAssignedDoctor];
                    }
                    
                    return assignments.map(assignment => assignment?.doctorId?.toString()).filter(Boolean);
                }).filter(Boolean))]
            };

            // 🔥 PARALLEL: Optimized batch lookups with lean queries
            const lookupPromises = [];

            if (uniqueIds.patients.length > 0) {
                lookupPromises.push(
                    mongoose.model('Patient')
                        .find({ _id: { $in: uniqueIds.patients.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('patientID firstName lastName patientNameRaw gender ageString computed.fullName clinicalInfo.clinicalHistory')
                        .lean()
                        .then(results => ({ type: 'patients', data: results }))
                );
            }

            if (uniqueIds.labs.length > 0) {
                lookupPromises.push(
                    mongoose.model('Lab')
                        .find({ _id: { $in: uniqueIds.labs.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('name identifier')
                        .lean()
                        .then(results => ({ type: 'labs', data: results }))
                );
            }

            if (uniqueIds.doctors.length > 0) {
                lookupPromises.push(
                    mongoose.model('Doctor')
                        .find({ _id: { $in: uniqueIds.doctors.map(id => new mongoose.Types.ObjectId(id)) } })
                        .populate('userAccount', 'fullName email isActive')
                        .lean()
                        .then(results => ({ type: 'doctors', data: results }))
                );
            }

            // Execute all lookups in parallel
            const lookupResults = await Promise.allSettled(lookupPromises);
            
            // Process results and build maps
            lookupResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { type, data } = result.value;
                    data.forEach(item => {
                        lookupMaps[type].set(item._id.toString(), item);
                    });
                } else {
                    console.warn(`Lookup failed for ${result.reason}`);
                }
            });
            
            const lookupTime = Date.now() - lookupStart;
            console.log(`🔍 IN-PROGRESS batch lookups completed in ${lookupTime}ms`);
        }

        // 🔥 STEP 5: Optimized formatting with doctor assignments
        const formatStart = Date.now();
        
        const formattedStudies = studies.map(study => {
            // Get related data from maps
            const patient = lookupMaps.patients.get(study.patient?.toString());
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());
            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                        study.preProcessedDownload?.zipUrl &&
                        (!study.preProcessedDownload?.zipExpiresAt || 
                         study.preProcessedDownload.zipExpiresAt > new Date());

            // 🔥 Handle both legacy (object) and new (array) formats for lastAssignedDoctor
            let latestAssignedDoctor = null;
            let latestAssignmentEntry = null;
            let allDoctorAssignments = [];
            let isLegacyFormat = false;

            // Normalize lastAssignedDoctor to always be an array
            let assignmentArray = [];
            
            if (Array.isArray(study.lastAssignedDoctor)) {
                assignmentArray = study.lastAssignedDoctor;
                isLegacyFormat = false;
            } else if (study.lastAssignedDoctor && typeof study.lastAssignedDoctor === 'object') {
                assignmentArray = [study.lastAssignedDoctor];
                isLegacyFormat = true;
            }

            if (assignmentArray.length > 0) {
                // Sort by assignedAt in descending order to get the latest
                const sortedAssignments = [...assignmentArray].sort((a, b) => {
                    const dateA = a?.assignedAt ? new Date(a.assignedAt) : new Date(0);
                    const dateB = b?.assignedAt ? new Date(b.assignedAt) : new Date(0);
                    return dateB - dateA;
                });
                
                latestAssignmentEntry = sortedAssignments[0];
                
                if (latestAssignmentEntry?.doctorId) {
                    latestAssignedDoctor = lookupMaps.doctors.get(latestAssignmentEntry.doctorId.toString());
                }

                // Map all doctor assignments with their details
                allDoctorAssignments = assignmentArray.map(entry => {
                    if (!entry || !entry.doctorId) return null;
                    
                    const doctor = lookupMaps.doctors.get(entry.doctorId.toString());
                    return {
                        doctorId: entry.doctorId,
                        assignedAt: entry.assignedAt,
                        doctorDetails: doctor ? {
                            _id: doctor._id,
                            fullName: doctor.userAccount?.fullName || 'Unknown Doctor',
                            email: doctor.userAccount?.email || null,
                            specialization: doctor.specialization || null,
                            isActive: doctor.userAccount?.isActive || false
                        } : null
                    };
                }).filter(Boolean);
            }
            
            // Optimized patient display building
            let patientDisplay = "N/A";
            let patientIdForDisplay = "N/A";
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                   `${study.age}/${study.gender}` : 
                                   study.age || study.gender || 'N/A';

            if (patient) {
                patientDisplay = patient.computed?.fullName || 
                                patient.patientNameRaw || 
                                `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
                patientIdForDisplay = patient.patientID || "N/A";

                // const agePart = patient.ageString || "";
                // const genderPart = patient.gender || "";
                // patientAgeGenderDisplay = agePart && genderPart ? `${agePart} / ${genderPart}` :
                //                        agePart || (genderPart ? `/ ${genderPart}` : "N/A");
            }

            return {
                _id: study._id,
                studyInstanceUID: study.studyInstanceUID,
                orthancStudyID: study.orthancStudyID,
                accessionNumber: study.accessionNumber || 'N/A',
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                modality: study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                description: study.examDescription || study.studyDescription || 'N/A',
                seriesImages: `${study.numberOfSeries || study.seriesCount || 0}/${study.numberOfImages || study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                ? formatDicomDateTime(study.studyDate, study.studyTime)
                : study.studyDate 
                    ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                        year: 'numeric', month: 'short', day: '2-digit'
                    })
                    : 'N/A',
                
                workflowStatus: study.workflowStatus,
                currentCategory: 'inprogress',
                createdAt: study.createdAt,
                uploadDateTime: study.createdAt
                ? new Date(study.createdAt).toLocaleString('en-GB', {
                    timeZone: 'Asia/Kolkata', // <-- THIS IS THE FIX.
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).replace(',', '')
                : 'N/A',
                reportedBy: study.reportInfo?.reporterName 
                
                || 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    // Use the latest uploadedAt if multiple reports
                    const latestReport = study.doctorReports.reduce((latest, curr) =>
                        new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                        study.doctorReports[0]
                    );
                    const dt = new Date(latestReport.uploadedAt);
                    // Format: 15 Jun 2025 03:30
                    return dt.toLocaleString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                                    timeZone: 'Asia/Kolkata'

                    }).replace(',', '');
                })()
                : null,
                assignedDoctorName: latestAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                assignedDate: study.lastAssignmentAt || study.assignment?.assignedAt,
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || '',
                
                // 🔥 NEW: Doctor assignments array with full details
                doctorAssignments: allDoctorAssignments,

                 downloadOptions: {
        hasWasabiZip: hasWasabiZip,
        hasR2Zip: hasWasabiZip,
        wasabiFileName: study.preProcessedDownload?.zipFileName || null,
        wasabiSizeMB: study.preProcessedDownload?.zipSizeMB || 0,
        wasabiDownloadCount: study.preProcessedDownload?.downloadCount || 0,
        wasabiCreatedAt: study.preProcessedDownload?.zipCreatedAt || null,
        wasabiExpiresAt: study.preProcessedDownload?.zipExpiresAt || null,
        zipStatus: study.preProcessedDownload?.zipStatus || 'not_started'
    },
                
                // 🔥 NEW: Latest assigned doctor details for easy access
                latestAssignedDoctorDetails: latestAssignedDoctor ? {
                    _id: latestAssignedDoctor._id,
                    fullName: latestAssignedDoctor.userAccount?.fullName || 'Unknown Doctor',
                    email: latestAssignedDoctor.userAccount?.email || null,
                    specialization: latestAssignedDoctor.specialization || null,
                    isActive: latestAssignedDoctor.userAccount?.isActive || false,
                    assignedAt: latestAssignmentEntry?.assignedAt || null
                } : null,

                // 🔥 NEW: Assignment history summary
                assignmentHistory: {
                    totalAssignments: allDoctorAssignments.length,
                    hasActiveAssignment: latestAssignedDoctor !== null,
                    lastAssignedAt: latestAssignmentEntry?.assignedAt || null,
                    isLegacyFormat: isLegacyFormat,
                    assignmentChain: allDoctorAssignments.map(assignment => ({
                        doctorName: assignment.doctorDetails?.fullName || 'Unknown Doctor',
                        assignedAt: assignment.assignedAt,
                        isActive: assignment.doctorDetails?.isActive || false
                    }))
                }
            };
        });

        const formatTime = Date.now() - formatStart;
        const processingTime = Date.now() - startTime;
        
        console.log(`✅ IN-PROGRESS: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 IN-PROGRESS: Total processing time: ${processingTime}ms for ${formattedStudies.length} studies`);

        return res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
            recordsPerPage: limit,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: Math.ceil(totalStudies / limit),
                totalRecords: totalStudies,
                limit: limit,
                hasNextPage: totalStudies > limit,
                hasPrevPage: false,
                recordRange: {
                    start: 1,
                    end: formattedStudies.length
                },
                isSinglePage: totalStudies <= limit
            },
            summary: {
                byStatus: {},
                byCategory: {
                    all: totalStudies,
                    pending: 0,
                    inprogress: totalStudies,
                    completed: 0
                },
                urgentStudies: formattedStudies.filter(s => ['EMERGENCY', 'STAT', 'URGENT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    lookups: studies.length > 0 ? `${Date.now() - formatStart}ms` : 0,
                    formatting: formatTime
                }
            },
            metadata: {
                dateRange: {
                    from: filterStartDate,
                    to: filterEndDate
                },
                filters: {
                    category: 'inprogress',
                    modality: req.query.modality || 'all',
                    labId: req.query.labId || 'all',
                    search: req.query.search || null
                }
            }
        });

    } catch (error) {
        console.error('❌ IN-PROGRESS: Error fetching in-progress studies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching in-progress studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 NEW: Get completed studies specifically
export const getCompletedStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 50;
        
        console.log('🟢 ADMIN: Fetching COMPLETED studies specifically');
        
        // 🔧 STEP 1: Build lean query filters with optimized date handling
        const queryFilters = {
            workflowStatus: 'final_report_downloaded'
        };
        
        let filterStartDate = null;
        let filterEndDate = null;
        
        // Optimized date filtering with pre-calculated timestamps
       // Replace your existing date filtering logic with this:
if (req.query.quickDatePreset || req.query.dateFilter) {
    const preset = req.query.quickDatePreset || req.query.dateFilter;
    const now = Date.now();
    const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
    
    switch (preset) {
        case 'last24h':
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
            break;

        case 'today':
            // ✅ IST FIX: Today in IST timezone
            const currentTimeIST = new Date(Date.now() + IST_OFFSET);
            const todayStartIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                0, 0, 0, 0
            );
            const todayEndIST = new Date(
                currentTimeIST.getFullYear(),
                currentTimeIST.getMonth(),
                currentTimeIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(todayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(todayEndIST.getTime() - IST_OFFSET);
            break;

        case 'yesterday':
            // ✅ IST FIX: Yesterday in IST timezone
            const currentTimeISTYesterday = new Date(Date.now() + IST_OFFSET);
            const yesterdayIST = new Date(currentTimeISTYesterday.getTime() - 86400000);
            const yesterdayStartIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                0, 0, 0, 0
            );
            const yesterdayEndIST = new Date(
                yesterdayIST.getFullYear(),
                yesterdayIST.getMonth(),
                yesterdayIST.getDate(),
                23, 59, 59, 999
            );
            filterStartDate = new Date(yesterdayStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(yesterdayEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisWeek':
            // ✅ IST FIX: This week in IST timezone
            const currentTimeISTWeek = new Date(Date.now() + IST_OFFSET);
            const dayOfWeek = currentTimeISTWeek.getDay();
            const weekStartIST = new Date(
                currentTimeISTWeek.getFullYear(),
                currentTimeISTWeek.getMonth(),
                currentTimeISTWeek.getDate() - dayOfWeek,
                0, 0, 0, 0
            );
            const weekEndIST = new Date(currentTimeISTWeek.getTime());
            filterStartDate = new Date(weekStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(weekEndIST.getTime() - IST_OFFSET);
            break;

        case 'thisMonth':
            // ✅ IST FIX: This month in IST timezone
            const currentTimeISTMonth = new Date(Date.now() + IST_OFFSET);
            const monthStartIST = new Date(
                currentTimeISTMonth.getFullYear(),
                currentTimeISTMonth.getMonth(),
                1,
                0, 0, 0, 0
            );
            const monthEndIST = new Date(currentTimeISTMonth.getTime());
            filterStartDate = new Date(monthStartIST.getTime() - IST_OFFSET);
            filterEndDate = new Date(monthEndIST.getTime() - IST_OFFSET);
            break;

        case 'custom':
            if (req.query.customDateFrom || req.query.customDateTo) {
                // ✅ IST FIX: Custom dates in IST
                if (req.query.customDateFrom) {
                    const customStartIST = new Date(req.query.customDateFrom + 'T00:00:00');
                    filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                }
                if (req.query.customDateTo) {
                    const customEndIST = new Date(req.query.customDateTo + 'T23:59:59');
                    filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                }
            } else {
                filterStartDate = new Date(now - 86400000);
                filterEndDate = new Date(now);
            }
            break;

        default:
            filterStartDate = new Date(now - 86400000);
            filterEndDate = new Date(now);
    }
} else {
    // ✅ IST FIX: Default to today in IST when no filter specified
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const currentTimeISTDefault = new Date(Date.now() + IST_OFFSET);
    const todayStartISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        0, 0, 0, 0
    );
    const todayEndISTDefault = new Date(
        currentTimeISTDefault.getFullYear(),
        currentTimeISTDefault.getMonth(),
        currentTimeISTDefault.getDate(),
        23, 59, 59, 999
    );
    filterStartDate = new Date(todayStartISTDefault.getTime() - IST_OFFSET);
    filterEndDate = new Date(todayEndISTDefault.getTime() - IST_OFFSET);
}
        // Apply date filter with proper indexing
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Optimized other filters
        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: req.query.modality }
            ];
        }

        if (req.query.labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.query.labId);
        }

        console.log(`🔍 COMPLETED query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 2: Ultra-optimized aggregation pipeline
        const pipeline = [
            // 🔥 CRITICAL: Start with most selective match first
            { $match: queryFilters },
            
            // 🔥 PERFORMANCE: Sort by completion date for completed studies
            { $sort: { reportFinalizedAt: -1, createdAt: -1 } },
            
            // 🔥 CRITICAL: Limit early to reduce pipeline processing
            { $limit: Math.min(limit, 1000) },
            
            // 🔥 Add current category field
            {
                $addFields: {
                    currentCategory: 'completed'
                }
            },
            
            // 🔥 PERFORMANCE: Project only essential fields after limiting
            {
                $project: {
                    _id: 1,
                    studyInstanceUID: 1,
                    orthancStudyID: 1,
                    accessionNumber: 1,
                    workflowStatus: 1,
                    currentCategory: 1,
                    modality: 1,
                    modalitiesInStudy: 1,
                    studyDescription: 1,
                    examDescription: 1,
                    numberOfSeries: 1,
                    seriesCount: 1,
                    numberOfImages: 1,
                    instanceCount: 1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
                    'assignment.priority': 1,
                    'assignment.assignedAt': 1,
                    doctorReports: 1,
                    lastAssignedDoctor: 1,
                    reportInfo: 1,
                    reportFinalizedAt: 1,
                    // clinicalHistory: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1,
                    lastAssignmentAt: 1,
                    timingInfo: 1,
                    age: 1,
                    gender: 1,
                    clinicalHistory: 1,
                                        preProcessedDownload: 1

                }
            }
        ];

        // 🔥 STEP 3: Execute optimized parallel queries
        console.log(`🚀 Executing optimized completed studies query...`);
        const queryStart = Date.now();
        
        const [studiesResult, totalCountResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // Handle potential errors
        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }
        if (totalCountResult.status === 'rejected') {
            console.warn('Count query failed, using studies length:', totalCountResult.reason.message);
        }

        const studies = studiesResult.value;
        const totalStudies = totalCountResult.status === 'fulfilled' ? totalCountResult.value : studies.length;
        
        const queryTime = Date.now() - queryStart;
        console.log(`⚡ Core completed studies query completed in ${queryTime}ms - found ${studies.length} studies`);

        // 🔥 STEP 4: Optimized batch lookups with connection pooling awareness
        const lookupMaps = {
            patients: new Map(),
            labs: new Map(),
            doctors: new Map()
        };

        if (studies.length > 0) {
            const lookupStart = Date.now();
            
            // Extract unique IDs with Set for deduplication
            const uniqueIds = {
                patients: [...new Set(studies.map(s => s.patient?.toString()).filter(Boolean))],
                labs: [...new Set(studies.map(s => s.sourceLab?.toString()).filter(Boolean))],
                doctors: [...new Set(studies.flatMap(s => {
                    // Handle both legacy (object) and new (array) formats
                    let assignments = [];
                    
                    if (Array.isArray(s.lastAssignedDoctor)) {
                        // New format: array of objects
                        assignments = s.lastAssignedDoctor;
                    } else if (s.lastAssignedDoctor && typeof s.lastAssignedDoctor === 'object') {
                        // Legacy format: single object
                        assignments = [s.lastAssignedDoctor];
                    }
                    
                    return assignments.map(assignment => assignment?.doctorId?.toString()).filter(Boolean);
                }).filter(Boolean))]
            };

            // 🔥 PARALLEL: Optimized batch lookups with lean queries
            const lookupPromises = [];

            if (uniqueIds.patients.length > 0) {
                lookupPromises.push(
                    mongoose.model('Patient')
                        .find({ _id: { $in: uniqueIds.patients.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('patientID firstName lastName patientNameRaw gender ageString computed.fullName clinicalInfo.clinicalHistory')
                        .lean()
                        .then(results => ({ type: 'patients', data: results }))
                );
            }

            if (uniqueIds.labs.length > 0) {
                lookupPromises.push(
                    mongoose.model('Lab')
                        .find({ _id: { $in: uniqueIds.labs.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('name identifier')
                        .lean()
                        .then(results => ({ type: 'labs', data: results }))
                );
            }

            if (uniqueIds.doctors.length > 0) {
                lookupPromises.push(
                    mongoose.model('Doctor')
                        .find({ _id: { $in: uniqueIds.doctors.map(id => new mongoose.Types.ObjectId(id)) } })
                        .populate('userAccount', 'fullName email isActive')
                        .select('specialization userAccount')
                        .lean()
                        .then(results => ({ type: 'doctors', data: results }))
                );
            }

            // Execute all lookups in parallel
            const lookupResults = await Promise.allSettled(lookupPromises);
            
            // Process results and build maps
            lookupResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    const { type, data } = result.value;
                    data.forEach(item => {
                        lookupMaps[type].set(item._id.toString(), item);
                    });
                } else {
                    console.warn(`Lookup failed for ${result.reason}`);
                }
            });
            
            const lookupTime = Date.now() - lookupStart;
            console.log(`🔍 Batch lookups completed in ${lookupTime}ms`);
        }

        // 🔥 STEP 5: Optimized formatting with pre-compiled maps
        const formatStart = Date.now();
        
        const formattedStudies = studies.map(study => {
            // Get related data from maps (faster than repeated lookups)
            const patient = lookupMaps.patients.get(study.patient?.toString());
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());
            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                        study.preProcessedDownload?.zipUrl &&
                        (!study.preProcessedDownload?.zipExpiresAt || 
                         study.preProcessedDownload.zipExpiresAt > new Date());

            // 🔥 Handle both legacy (object) and new (array) formats for lastAssignedDoctor
            let latestAssignedDoctor = null;
            let latestAssignmentEntry = null;
            let allDoctorAssignments = [];
            let isLegacyFormat = false;

            // Normalize lastAssignedDoctor to always be an array for consistent processing
            let assignmentArray = [];
            
            if (Array.isArray(study.lastAssignedDoctor)) {
                // New format: array of objects
                assignmentArray = study.lastAssignedDoctor;
                isLegacyFormat = false;
            } else if (study.lastAssignedDoctor && typeof study.lastAssignedDoctor === 'object') {
                // Legacy format: single object - convert to array
                assignmentArray = [study.lastAssignedDoctor];
                isLegacyFormat = true;
            } else {
                // No assignments or invalid data
                assignmentArray = [];
            }

            if (assignmentArray.length > 0) {
                // Sort the array by assignedAt in descending order to get the latest
                const sortedAssignments = [...assignmentArray].sort((a, b) => {
                    const dateA = a?.assignedAt ? new Date(a.assignedAt) : new Date(0);
                    const dateB = b?.assignedAt ? new Date(b.assignedAt) : new Date(0);
                    return dateB - dateA; // Latest date first
                });
                
                latestAssignmentEntry = sortedAssignments[0]; // Get the most recent entry
                
                if (latestAssignmentEntry?.doctorId) {
                    latestAssignedDoctor = lookupMaps.doctors.get(latestAssignmentEntry.doctorId.toString());
                }

                // Map all doctor assignments with their details
                allDoctorAssignments = assignmentArray.map(entry => {
                    if (!entry || !entry.doctorId) return null;
                    
                    const doctor = lookupMaps.doctors.get(entry.doctorId.toString());
                    return {
                        doctorId: entry.doctorId,
                        assignedAt: entry.assignedAt,
                        doctorDetails: doctor ? {
                            _id: doctor._id,
                            fullName: doctor.userAccount?.fullName || 'Unknown Doctor',
                            email: doctor.userAccount?.email || null,
                            specialization: doctor.specialization || null,
                            isActive: doctor.userAccount?.isActive || false
                        } : null
                    };
                }).filter(Boolean); // Remove null entries
            }
            
            // Optimized patient display building with fallback chain
            let patientDisplay = "N/A";
            let patientIdForDisplay = "N/A";
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                   `${study.age}/${study.gender}` : 
                                   study.age || study.gender || 'N/A';

            if (patient) {
                patientDisplay = patient.computed?.fullName || 
                                patient.patientNameRaw || 
                                `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
                patientIdForDisplay = patient.patientID || "N/A";

                // Optimized age/gender display
                // const agePart = patient.ageString || "";
                // const genderPart = patient.gender || "";
                // patientAgeGenderDisplay = agePart && genderPart ? `${agePart} / ${genderPart}` :
                //                        agePart || (genderPart ? `/ ${genderPart}` : "N/A");
            }

            return {
                _id: study._id,
                studyInstanceUID: study.studyInstanceUID,
                orthancStudyID: study.orthancStudyID,
                accessionNumber: study.accessionNumber || 'N/A',
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                modality: study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                description: study.examDescription || study.studyDescription || 'N/A',
                seriesImages: `${study.numberOfSeries || study.seriesCount || 0}/${study.numberOfImages || study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                ? formatDicomDateTime(study.studyDate, study.studyTime)
                : study.studyDate 
                    ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                        year: 'numeric', month: 'short', day: '2-digit'
                    })
                    : 'N/A',
                
                workflowStatus: study.workflowStatus,
                currentCategory: 'completed',
                createdAt: study.createdAt,
                uploadDateTime: study.createdAt
                ? new Date(study.createdAt).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata', // <-- THIS IS THE FIX.
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                                timeZone: 'Asia/Kolkata'

                }).replace(',', '')
                : 'N/A',
                reportedBy: study.reportInfo?.reporterName 
                
                || 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    // Use the latest uploadedAt if multiple reports
                    const latestReport = study.doctorReports.reduce((latest, curr) =>
                        new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                        study.doctorReports[0]
                    );
                    const dt = new Date(latestReport.uploadedAt);
                    // Format: 15 Jun 2025 03:30
                    return dt.toLocaleString('en-in', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: 'Asia/Kolkata'
                    }).replace(',', '');
                })()
                : null,
                assignedDoctorName: latestAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                assignedDate: study.lastAssignmentAt || study.assignment?.assignedAt,
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || '',  
                
                // 🔥 NEW: Include TAT information for completed studies
                timingInfo: study.timingInfo || {},
                
                // 🔥 NEW: Return properly formatted doctor assignments array
                doctorAssignments: allDoctorAssignments,

                 downloadOptions: {
        hasWasabiZip: hasWasabiZip,
        hasR2Zip: hasWasabiZip,
        wasabiFileName: study.preProcessedDownload?.zipFileName || null,
        wasabiSizeMB: study.preProcessedDownload?.zipSizeMB || 0,
        wasabiDownloadCount: study.preProcessedDownload?.downloadCount || 0,
        wasabiCreatedAt: study.preProcessedDownload?.zipCreatedAt || null,
        wasabiExpiresAt: study.preProcessedDownload?.zipExpiresAt || null,
        zipStatus: study.preProcessedDownload?.zipStatus || 'not_started'
    },
       
                
                // 🔥 NEW: Latest assigned doctor details for easy access
                latestAssignedDoctorDetails: latestAssignedDoctor ? {
                    _id: latestAssignedDoctor._id,
                    fullName: latestAssignedDoctor.userAccount?.fullName || 'Unknown Doctor',
                    email: latestAssignedDoctor.userAccount?.email || null,
                    specialization: latestAssignedDoctor.specialization || null,
                    isActive: latestAssignedDoctor.userAccount?.isActive || false,
                    assignedAt: latestAssignmentEntry?.assignedAt || null
                } : null,

                // 🔥 NEW: Assignment history summary with legacy format indicator
                assignmentHistory: {
                    totalAssignments: allDoctorAssignments.length,
                    hasActiveAssignment: latestAssignedDoctor !== null,
                    lastAssignedAt: latestAssignmentEntry?.assignedAt || null,
                    isLegacyFormat: isLegacyFormat,
                    assignmentChain: allDoctorAssignments.map(assignment => ({
                        doctorName: assignment.doctorDetails?.fullName || 'Unknown Doctor',
                        assignedAt: assignment.assignedAt,
                        isActive: assignment.doctorDetails?.isActive || false
                    }))
                }
            };
        });

        const formatTime = Date.now() - formatStart;
        const processingTime = Date.now() - startTime;

        console.log(`✅ COMPLETED: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 COMPLETED: Total processing time: ${processingTime}ms for ${formattedStudies.length} completed studies`);

        return res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
            recordsPerPage: limit,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: Math.ceil(totalStudies / limit),
                totalRecords: totalStudies,
                limit: limit,
                hasNextPage: totalStudies > limit,
                hasPrevPage: false,
                recordRange: {
                    start: 1,
                    end: formattedStudies.length
                },
                isSinglePage: totalStudies <= limit
            },
            summary: {
                byStatus: {},
                byCategory: {
                    all: totalStudies,
                    pending: 0,
                    inprogress: 0,
                    completed: totalStudies
                },
                urgentStudies: formattedStudies.filter(s => ['EMERGENCY', 'STAT', 'URGENT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    lookups: studies.length > 0 ? `${Date.now() - formatStart}ms` : 0,
                    formatting: formatTime
                }
            },
            metadata: {
                dateRange: {
                    from: filterStartDate,
                    to: filterEndDate
                },
                filters: {
                    category: 'completed',
                    modality: req.query.modality || 'all',
                    labId: req.query.labId || 'all',
                    search: req.query.search || null
                }
            }
        });

    } catch (error) {
        console.error('❌ COMPLETED: Error fetching completed studies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching completed studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const registerAdmin = async (req, res) => {
    console.log('🔍 ===== REGISTER ADMIN CALLED =====');
    console.log('📝 req.body:', req.body);
    
    const session = await mongoose.startSession();
    
    try {
        const result = await session.withTransaction(async () => {
            const { fullName, email, password } = req.body;

            // Validation
            if (!fullName || !email || !password) {
                throw new Error('Full name, email, and password are required.');
            }

            // Email validation
            const emailRegex = /\S+@\S+\.\S+/;
            if (!emailRegex.test(email)) {
                throw new Error('Please provide a valid email address.');
            }

            // Password validation
            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters long.');
            }

            // Generate username from email (part before @)
            const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

            // Check if user already exists
            const existingUser = await User.findOne({
                $or: [{ email }, { username }]
            }).session(session);

            if (existingUser) {
                throw new Error('A user with this email or generated username already exists.');
            }

            // Create admin user
            const adminUser = await User.create([{
                username,
                email,
                password,
                fullName,
                role: 'admin',
                isActive: true
            }], { session });

            console.log('✅ Admin user created:', adminUser[0]._id);

            // Prepare response (exclude password)
            const adminUserResponse = adminUser[0].toObject();
            delete adminUserResponse.password;

            return {
                admin: adminUserResponse,
                generatedUsername: username
            };
        });

        res.status(201).json({
            success: true,
            message: 'Admin account created successfully.',
            data: {
                adminId: result.admin._id,
                username: result.generatedUsername,
                email: result.admin.email,
                fullName: result.admin.fullName
            }
        });

    } catch (error) {
        console.error('❌ Error registering admin:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ 
                success: false, 
                message: messages.join(', ') 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Server error during admin registration.' 
        });
    } finally {
        await session.endSession();
    }
};

export const updateStudyInteractionStatus = async (req, res) => {
    try {
        const { studyId } = req.params;
        const { action } = req.body; // 'ohif_opened', 'study_downloaded', 'radiant_opened'
        
        console.log(`🔄 Updating study interaction status: ${studyId}, action: ${action}, user: ${req.user.role}`);
        console.log(req.user);
        
        // Find the study
        const study = await DicomStudy.findOne({
            $or: [
                // { _id: studyId },
                { studyInstanceUID: studyId },
                { orthancStudyID: studyId }
            ]
        });
        console.log('🔄 Found study:', study ? study._id : 'Not found');
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        // Only doctors can trigger these status changes
        if (req.user.role !== 'doctor_account') {
            return res.status(403).json({
                success: false,
                message: 'Only doctors can trigger study interaction status updates'
            });
        }
        console.log(req.user.id);
        
        // Check if doctor is assigned to this study
        // const isAssigned = Array.isArray(study.lastAssignedDoctor)
        //     ? study.lastAssignedDoctor.some(
        //         entry => entry.doctorId?.toString() === req.user.id?.toString()
        //     )
        //     : study.lastAssignedDoctor?.doctorId?.toString() === req.user.id?.toString();

        // if (!isAssigned) {
        //     console.log(isAssigned)
        //     return res.status(403).json({
        //         success: false,
        //         message: 'You are not assigned to this study'
        //     });
        // }
        
        let newStatus;
        let statusNote;
        
        // Determine the new status based on action
        switch (action) {
            case 'ohif_opened':
                newStatus = 'doctor_opened_report';
                statusNote = `Study opened in OHIF viewer by Dr. ${req.user.fullName || req.user.email}`;
                break;
            case 'radiant_opened':
                newStatus = 'doctor_opened_report';
                statusNote = `Study opened in Radiant viewer by Dr. ${req.user.fullName || req.user.email}`;
                break;
            case 'study_downloaded':
                newStatus = 'doctor_opened_report';
                statusNote = `Study downloaded by Dr. ${req.user.fullName || req.user.email}`;
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid action specified'
                });
        }
        
        // Only update if current status allows it (don't go backwards)
        const statusHierarchy = [
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
                        'report_downloaded_radiologist',
                                    'report_downloaded',


            'doctor_opened_report',
            'report_in_progress',
            'report_uploaded',
            'report_finalized',
            'final_report_downloaded'
        ];
        
        const currentStatusIndex = statusHierarchy.indexOf(study.workflowStatus);
        const newStatusIndex = statusHierarchy.indexOf(newStatus);
        
        // Only update if we're moving forward or staying at the same level
        if (newStatusIndex >= currentStatusIndex) {
            await updateWorkflowStatus({
                studyId: study._id,
                status: newStatus,
                note: statusNote,
                user: req.user
            });
            
            console.log(`✅ Study status updated to ${newStatus} for study ${studyId}`);
        } else {
            console.log(`⚠️ Status not updated - would be moving backwards from ${study.workflowStatus} to ${newStatus}`);
        }
        
        res.json({
            success: true,
            message: 'Study interaction recorded successfully',
            currentStatus: newStatus,
            action: action
        });
        
    } catch (error) {
        console.error('❌ Error updating study interaction status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update study interaction status',
            error: error.message
        });
    }
};

export const unassignDoctorFromStudy = async (req, res) => {
  try {
    const { studyId } = req.params;
    const { doctorId } = req.body;

    console.log(`🔄 Unassigning doctor ${doctorId} from study ${studyId}`);

    // Find the study
    const study = await DicomStudy.findById(studyId);
    if (!study) {
      return res.status(404).json({
        success: false,
        message: 'Study not found'
      });
    }

    // 🔍 LOG: Initial workflow status
    const initialStatus = study.workflowStatus;
    console.log(`📊 INITIAL workflow status: ${initialStatus}`);

    // Remove doctor from lastAssignedDoctor array
    if (Array.isArray(study.lastAssignedDoctor)) {
      const beforeLength = study.lastAssignedDoctor.length;
      study.lastAssignedDoctor = study.lastAssignedDoctor.filter(
        assignment => assignment.doctorId.toString() !== doctorId
      );
      console.log(`📊 lastAssignedDoctor array: ${beforeLength} → ${study.lastAssignedDoctor.length}`);
    } else if (study.lastAssignedDoctor?.doctorId?.toString() === doctorId) {
      console.log(`📊 Removing single lastAssignedDoctor`);
      study.lastAssignedDoctor = null;
    }

    // 🔧 FIXED: Remove from assignment array - check both User._id and Doctor._id
    if (Array.isArray(study.assignment)) {
      const beforeLength = study.assignment.length;
      
      // 🔧 CRITICAL: Get the doctor's userAccount ID for proper filtering
      const doctor = await Doctor.findById(doctorId).populate('userAccount');
      const userAccountId = doctor?.userAccount?._id?.toString();
      
      console.log(`🔍 Doctor userAccount ID: ${userAccountId}`);
      console.log(`🔍 Current assignment entries:`, study.assignment.map(a => ({
        assignedTo: a.assignedTo?.toString(),
        assignedAt: a.assignedAt
      })));
      
      // Filter out assignments that match either the doctor ID or user account ID
      study.assignment = study.assignment.filter(assignment => {
        const assignedToId = assignment.assignedTo?.toString();
        const matchesDoctorId = assignedToId === doctorId;
        const matchesUserAccountId = assignedToId === userAccountId;
        
        console.log(`🔍 Assignment ${assignedToId}: doctorMatch=${matchesDoctorId}, userMatch=${matchesUserAccountId}`);
        
        return !matchesDoctorId && !matchesUserAccountId;
      });
      
      console.log(`📊 assignment array: ${beforeLength} → ${study.assignment.length}`);
    }

    // 🔧 NEW: Update workflow status based on remaining assignments
    const hasRemainingAssignments = (Array.isArray(study.lastAssignedDoctor) && study.lastAssignedDoctor.length > 0) ||
                                   (Array.isArray(study.assignment) && study.assignment.length > 0) ||
                                   study.lastAssignedDoctor;

    if (!hasRemainingAssignments) {
      console.log(`📊 No remaining assignments, setting status to pending_assignment`);
      study.workflowStatus = 'pending_assignment';
    } else {
      console.log(`📊 ${study.assignment?.length || 0} assignments remaining, keeping current status`);
    }

    // 🔍 LOG: Status BEFORE save
    console.log(`📊 Status BEFORE save: ${study.workflowStatus}`);
    console.log(`📊 Modified fields:`, study.modifiedPaths());

    // 🔍 CRITICAL: Save the changes
    const savedStudy = await study.save();

    // 🔍 LOG: Status AFTER save
    console.log(`📊 Status AFTER save: ${savedStudy.workflowStatus}`);
    
    // Check if status changed as expected
    if (savedStudy.workflowStatus !== initialStatus) {
      console.log(`✅ STATUS UPDATED: ${initialStatus} → ${savedStudy.workflowStatus}`);
    } else {
      console.log(`ℹ️ STATUS UNCHANGED: ${savedStudy.workflowStatus} (other assignments remain)`);
    }

    // Also remove from doctor's assignedStudies
    await Doctor.updateOne(
      { _id: doctorId },
      { 
        $pull: { 
          assignedStudies: { study: studyId } 
        },
        $set: { assigned: false }
      }
    );

    console.log(`✅ Doctor ${doctorId} unassigned from study ${studyId}`);

    res.json({
      success: true,
      message: 'Doctor unassigned successfully',
      study: {
        _id: savedStudy._id,
        workflowStatus: savedStudy.workflowStatus,
        assignedDoctors: savedStudy.lastAssignedDoctor || [],
        remainingAssignments: savedStudy.assignment?.length || 0
      }
    });

  } catch (error) {
    console.error('❌ Error unassigning doctor:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during doctor unassignment',
      error: error.message
    });
  }
};