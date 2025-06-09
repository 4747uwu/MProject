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

// import websocketService from '../config/webSocket.js'; // 🆕 ADD: Import WebSocket service
const storage = multer.memoryStorage();

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

// 🔧 PERFORMANCE: Advanced caching with different TTLs
const cache = new NodeCache({ 
    stdTTL: 300, // 5 minutes default
    checkperiod: 60,
    useClones: false // Better performance for large objects
});

// 🔧 FIXED: admin.controller.js - Single page implementation with all essential fields
// 🔧 CRITICAL FIX: Always apply time filter for progressive data
export const getAllStudiesForAdmin = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 20;
        
        const queryFilters = {};
        
        // 🔧 FORCE TIME FILTERING for progressive data buildup
        let shouldApplyDateFilter = true;
        let filterStartDate = null;
        let filterEndDate = null;
        
        // Handle quick date presets first
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = new Date();
            
            switch (preset) {
                case 'last24h':
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    console.log(`📅 Applied 24h filter - scanning ~1000 studies`);
                    break;
                case 'today':
                    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    filterStartDate = startOfDay;
                    filterEndDate = endOfDay;
                    console.log(`📅 Applied today filter - scanning ~1000 studies`);
                    break;
                
                case 'yesterday':
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    filterStartDate = yesterdayStart;
                    filterEndDate = yesterdayEnd;
                    console.log(`📅 Applied yesterday filter: ${yesterdayStart.toISOString()} to ${yesterdayEnd.toISOString()}`);
                    break;

                case 'thisWeek':
                    filterStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    console.log(`📅 Applied week filter - scanning ~7000 studies`);
                    break;
                case 'thisMonth':
                    filterStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    console.log(`📅 Applied month filter - scanning ~30000 studies`);
                    break;
                case 'custom':
                    if (req.query.customDateFrom || req.query.customDateTo) {
                        filterStartDate = req.query.customDateFrom ? new Date(req.query.customDateFrom + 'T00:00:00') : null;
                        filterEndDate = req.query.customDateTo ? new Date(req.query.customDateTo + 'T23:59:59') : null;
                        console.log(`📅 Applied custom filter`);
                    } else {
                        // Force 24h default if no custom dates provided
                        filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        filterEndDate = now;
                        console.log(`📅 Custom selected but no dates - forced 24h filter`);
                    }
                    break;
                default:
                    // Force 24h default for any unknown preset
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    console.log(`📅 Unknown preset - forced 24h filter`);
            }
        }
        // 🔧 CRITICAL: Default to 24h filter even for StudyInstanceUIDs
        else {
            const now = new Date();
            const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
            filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
            filterEndDate = now;
            console.log(`📅 No date filter specified - applying default ${hoursBack}h filter`);
        }

        // Apply date filter (always applied now)
        if (shouldApplyDateFilter && (filterStartDate || filterEndDate)) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
            
            console.log(`📅 Applied date filter on field '${dateField}':`, {
                gte: filterStartDate?.toISOString(),
                lte: filterEndDate?.toISOString()
            });
        }

        // 🔧 OVERRIDE: Handle StudyInstanceUIDs but keep time filter
        if (req.query.StudyInstanceUIDs && req.query.StudyInstanceUIDs !== 'undefined') {
            const studyUIDs = req.query.StudyInstanceUIDs.split(',').map(uid => uid.trim()).filter(uid => uid);
            if (studyUIDs.length > 0) {
                queryFilters.studyInstanceUID = { $in: studyUIDs };
                console.log(`🎯 Added StudyInstanceUIDs filter but keeping time filter for performance`);
                // DON'T remove time filter anymore - keep it for performance
            }
        }

        // Apply search filters
        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
            console.log(`🔍 Applied search filter: ${req.query.search}`);
        }

        // Apply category filters
        if (req.query.status) {
            queryFilters.workflowStatus = req.query.status;
            console.log(`📋 Applied status filter: ${req.query.status}`);
        } else if (req.query.category && req.query.category !== 'all') {
            switch(req.query.category) {
                case 'pending':
                    queryFilters.workflowStatus = { $in: ['new_study_received', 'pending_assignment'] };
                    break;
                case 'inprogress':
                    queryFilters.workflowStatus = { 
                        $in: [
                            'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                            'report_finalized','report_drafted', 'report_uploaded', 'report_downloaded_radiologist', 'report_downloaded'
                        ] 
                    };
                    break;
                case 'completed':
                    queryFilters.workflowStatus = 'final_report_downloaded';
                    break;
            }
            console.log(`🏷️ Applied category filter: ${req.query.category}`);
        }

        // Apply modality filter
        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: { $in: [req.query.modality] } }
            ];
            console.log(`🏥 Applied modality filter: ${req.query.modality}`);
        }

        // Apply lab filter
        if (req.query.labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.query.labId);
            console.log(`🏢 Applied lab filter: ${req.query.labId}`);
        }

        // Apply priority filter
        if (req.query.priority) {
            queryFilters['assignment.priority'] = req.query.priority;
            console.log(`⚡ Applied priority filter: ${req.query.priority}`);
        }

        // 🔧 DEBUG: Log final query filters
        console.log(`🔍 Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // Continue with existing aggregation pipeline...
        const pipeline = [
            { $match: queryFilters },
            
            // Add currentCategory calculation
            {
                $addFields: {
                    currentCategory: {
                        $switch: {
                            branches: [
                                {
                                    case: { $in: ["$workflowStatus", ['new_study_received', 'pending_assignment']] },
                                    then: 'pending'
                                },
                                {
                                    case: { $in: ["$workflowStatus", [
                                        'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                                        'report_finalized', 'report_uploaded', 'report_drafted', 'report_downloaded_radiologist', 'report_downloaded'
                                    ]] },
                                    then: 'inprogress'
                                },
                                {
                                    case: { $eq: ["$workflowStatus", 'final_report_downloaded'] },
                                    then: 'completed'
                                }
                            ],
                            default: 'unknown'
                        }
                    }
                }
            },
            
            // Essential lookups (keep existing)...
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patient',
                    pipeline: [
                        {
                            $project: {
                                patientID: 1,
                                firstName: 1,
                                lastName: 1,
                                patientNameRaw: 1,
                                gender: 1,
                                ageString: 1,
                                dateOfBirth: 1,
                                salutation: 1,
                                currentWorkflowStatus: 1,
                                'contactInformation.phone': 1,
                                'contactInformation.email': 1,
                                'medicalHistory.clinicalHistory': 1,
                                'computed.fullName': 1
                            }
                        }
                    ]
                }
            },
            
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'sourceLab',
                    pipeline: [
                        {
                            $project: {
                                name: 1,
                                identifier: 1,
                                contactPerson: 1,
                                contactEmail: 1,
                                contactPhone: 1,
                                address: 1
                            }
                        }
                    ]
                }
            },
            
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'lastAssignedDoctor',
                    foreignField: '_id',
                    as: 'lastAssignedDoctor',
                    pipeline: [
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
                                            isActive: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                specialization: 1,
                                userAccount: { $arrayElemAt: ['$userAccount', 0] }
                            }
                        }
                    ]
                }
            },
            
            // Patient name filter after lookup
            ...(req.query.patientName ? [{
                $match: {
                    $or: [
                        { 'patient.patientNameRaw': { $regex: req.query.patientName, $options: 'i' } },
                        { 'patient.firstName': { $regex: req.query.patientName, $options: 'i' } },
                        { 'patient.lastName': { $regex: req.query.patientName, $options: 'i' } },
                        { 'patient.patientID': { $regex: req.query.patientName, $options: 'i' } }
                    ]
                }
            }] : []),
            
            // Project essential fields
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
                    reportedBy: 1,
                    reportFinalizedAt: 1,
                    clinicalHistory: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1
                }
            },
            
            { $sort: { createdAt: -1 } },
            { $limit: Math.min(limit, 10000) }
        ];

        // Execute query
        console.log(`🔍 Executing aggregation pipeline with ${pipeline.length} stages`);
        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        console.log(`📊 Query results: Found ${studies.length} studies, total matching: ${totalStudies}`);

        // Continue with existing formatting logic...
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
            const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
            const lastAssignedDoctor = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor[0] : study.lastAssignedDoctor;
            
            // Build patient display
            let patientDisplay = "N/A";
            let patientIdForDisplay = "N/A";
            let patientAgeGenderDisplay = "N/A";

            if (patient) {
                patientDisplay = patient.computed?.fullName || 
                                patient.patientNameRaw || 
                                `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
                patientIdForDisplay = patient.patientID || 'N/A';

                let agePart = patient.ageString || "";
                let genderPart = patient.gender || "";
                if (agePart && genderPart) {
                    patientAgeGenderDisplay = `${agePart} / ${genderPart}`;
                } else if (agePart) {
                    patientAgeGenderDisplay = agePart;
                } else if (genderPart) {
                    patientAgeGenderDisplay = `/ ${genderPart}`;
                }
            }

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
                modality: study.modalitiesInStudy && study.modalitiesInStudy.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: sourceLab?.name || 'N/A',
                studyDateTime: study.studyDate && study.studyTime ? 
                              `${study.studyDate} ${study.studyTime.substring(0,6)}` : 
                              (study.studyDate || 'N/A'),
                studyDate: study.studyDate || null,
                uploadDateTime: study.createdAt,
                workflowStatus: study.workflowStatus,
                currentCategory: study.currentCategory,
                createdAt: study.createdAt,
                reportedBy: study.reportedBy || lastAssignedDoctor?.userAccount?.fullName || 'N/A',
                assignedDoctorName: lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                location: sourceLab?.name || 'N/A',
                // Add all other necessary fields for table display
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || '',

                lastAssignedDoctor: lastAssignedDoctor?._id || null,
                lastAssignedDoctorDetails: lastAssignedDoctor ? {
                _id: lastAssignedDoctor._id,
                fullName: lastAssignedDoctor.userAccount?.fullName || 'Unknown Doctor',
                email: lastAssignedDoctor.userAccount?.email || null,
                specialization: lastAssignedDoctor.specialization || null,
                 isActive: lastAssignedDoctor.userAccount?.isActive || false
                 } : null
            };
        });

        const processingTime = Date.now() - startTime;

        const responseData = {
            success: true,
            count: formattedStudies.length,
            totalRecords: formattedStudies.length,
            recordsPerPage: limit,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalRecords: formattedStudies.length,
                limit: limit,
                hasNextPage: false,
                hasPrevPage: false,
                recordRange: {
                    start: 1,
                    end: formattedStudies.length
                },
                isSinglePage: true
            },
            // 🔧 ADD: Debug information
            debug: process.env.NODE_ENV === 'development' ? {
                appliedFilters: queryFilters,
                dateFilter: {
                    preset: req.query.quickDatePreset || req.query.dateFilter,
                    dateType: req.query.dateType,
                    startDate: filterStartDate?.toISOString(),
                    endDate: filterEndDate?.toISOString(),
                    shouldApplyDateFilter
                },
                totalMatching: totalStudies
            } : undefined,
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length
            }
        };

        console.log(`✅ Single page query completed in ${processingTime}ms, returned ${formattedStudies.length} studies`);

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
// 🔧 FIXED: Get study discussions
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
export const assignDoctorToStudy = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        const result = await session.withTransaction(async () => {
            const { studyId } = req.params;
            const { doctorId, assignmentNote, priority = 'NORMAL' } = req.body;
            const assignedBy = req.user.id;

            console.log(`🔄 Assigning doctor ${doctorId} to study ${studyId}`);

            if (!studyId || !doctorId) {
                throw new Error('Both study ID and doctor ID are required');
            }

            // Validate doctor
            // const doctor = await Doctor.findById(doctorId)
            //     .populate('userAccount', 'fullName isActive')
            //     .session(session);

            const [doctor, study] = await Promise.all([
                Doctor.findById(doctorId)
                    .populate({
                        path: 'userAccount',
                        select: 'fullName isActive',
                        options: { session, readPreference: 'primary' }
                    })
                    .session(session)
                    .setOptions({ readPreference: 'primary' }),
                DicomStudy.findById(studyId)
                    .populate({
                        path: 'patient',
                        select: '_id patientID',
                        options: { session, readPreference: 'primary' }
                    })
                    .session(session)
                    .setOptions({ readPreference: 'primary' })
            ]);

            if (!doctor || !doctor.userAccount?.isActive) {
                throw new Error('Doctor not found or inactive');
            }

            // Update study
            const currentTime = new Date();
            const assignmentData = {
                'assignment.assignedTo': doctorId,
                'assignment.assignedAt': currentTime,
                'assignment.assignedBy': assignedBy,
                'assignment.priority': priority,
                'assignment.dueDate': new Date(Date.now() + 24 * 60 * 60 * 1000),
                workflowStatus: 'assigned_to_doctor',
                lastAssignedDoctor: doctorId,
                lastAssignmentAt: currentTime,
                $push: {
                    statusHistory: {
                        status: 'assigned_to_doctor',
                        changedAt: currentTime,
                        changedBy: assignedBy,
                        note: assignmentNote || `Assigned to Dr. ${doctor.userAccount.fullName}`
                    }
                }
            };

            const updatedStudy = await DicomStudy.findByIdAndUpdate(
                studyId,
                assignmentData,
                { 
                    session, 
                    new: true,
                    runValidators: false
                }
            );

            if (!updatedStudy) {
                throw new Error('Study not found');
            }

            console.log(`📋 Adding study ${studyId} to doctor ${doctorId} assignedStudies array`);
            
            // Check if study is already in assignedStudies (to avoid duplicates)
            const existingAssignment = doctor.assignedStudies.find(
                assigned => assigned.study.toString() === studyId.toString()
            );

            if (!existingAssignment) {
                // 🔧 SIMPLIFIED: Add only the essential fields you specified
                const assignedStudyEntry = {
                    study: studyId,
                    patient: study.patient._id,
                    assignedDate: currentTime,
                    status: 'assigned'
                };

                await Doctor.findByIdAndUpdate(
                    doctorId,
                    {
                        $push: { assignedStudies: assignedStudyEntry },
                        assigned: true // Set doctor as having assignments
                    },
                    { session, runValidators: false }
                );

                console.log(`✅ Added study to doctor assignedStudies array with essential fields only`);
            } else {
                console.log(`ℹ️ Study already exists in doctor assignedStudies, updating status`);
                
                // Update existing assignment status if it was previously completed
                await Doctor.findOneAndUpdate(
                    { 
                        _id: doctorId,
                        'assignedStudies.study': studyId
                    },
                    {
                        $set: {
                            'assignedStudies.$.status': 'assigned',
                            'assignedStudies.$.assignedDate': currentTime
                        }
                    },
                    { session, runValidators: false }
                );
            }

            // Calculate timing info
            if (updatedStudy.createdAt) {
                const uploadToAssignmentMinutes = Math.floor(
                    (currentTime.getTime() - updatedStudy.createdAt.getTime()) / (1000 * 60)
                );
                
                await DicomStudy.findByIdAndUpdate(
                    studyId,
                    {
                        'timingInfo.uploadToAssignmentMinutes': uploadToAssignmentMinutes
                    },
                    { session, runValidators: false }
                );
            }

            // Update patient status
            if (updatedStudy.patient) {
                await Patient.findByIdAndUpdate(
                    updatedStudy.patient,
                    {
                        currentWorkflowStatus: 'assigned_to_doctor',
                        'statusInfo.assignedDoctor': doctorId,
                        'statusInfo.lastStatusChange': currentTime
                    },
                    { session }
                );
            }

            // Clear caches
            cache.del(`admin_patient_detail_${updatedStudy.patientId}`);
            cache.del(`doctor_workload_${doctorId}`);

            console.log('✅ Doctor assigned successfully');

            return {
                studyId: updatedStudy.studyInstanceUID,
                doctorName: doctor.userAccount.fullName,
                assignedAt: currentTime,
                priority: priority
            };
        });

        res.json({
            success: true,
            message: 'Doctor assigned successfully',
            data: result
        });

    } catch (error) {
        console.error('❌ Error in assignDoctorToStudy:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to assign doctor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
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
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
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
        cache.set(cacheKey, responseData, 180);

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



// export const registerDoctor = async (req, res) => {
//     console.log('🔍 ===== REGISTER DOCTOR CALLED =====');
//     console.log('📝 req.body:', req.body);
//     console.log('📁 req.file:', req.file);
    
//     const session = await mongoose.startSession();
    
//     try {
//         const result = await session.withTransaction(async () => {
//             const {
//                 username, email, fullName,
//                 specialization, licenseNumber, department, qualifications, 
//                 yearsOfExperience, contactPhoneOffice, isActiveProfile
//             } = req.body;

//             if (!username || !email || !fullName || !specialization || !licenseNumber) {
//                 throw new Error('Username, email, fullName, specialization, and licenseNumber are required.');
//             }

//             const password = generateRandomPassword();

//             // Validation queries
//             const [userExists, doctorWithLicenseExists] = await Promise.all([
//                 User.findOne({ $or: [{ email }, { username }] }).session(session),
//                 Doctor.findOne({ licenseNumber }).session(session)
//             ]);

//             if (userExists) {
//                 throw new Error('User with this email or username already exists.');
//             }
//             if (doctorWithLicenseExists) {
//                 throw new Error('A doctor with this license number already exists.');
//             }

//             // Create user
//             const userDocument = await User.create([{
//                 username, email, password, fullName, role: 'doctor_account'
//             }], { session });

//             console.log('✅ User created:', userDocument[0]._id);

//             // 🔧 FIXED: Declare variables outside the try block
//             let signatureUrl = '';
//             let signatureKey = '';
//             let signatureUploadSuccess = false;
//             let optimizedSignature = null; // 🔧 CRITICAL FIX: Declare here
//             let signatureFileSize = 0;
//             let signatureOriginalName = '';
            
//             if (req.file) {
//                 try {
//                     console.log('📝 Processing doctor signature upload...');
//                     console.log('📁 File details:', {
//                         originalname: req.file.originalname,
//                         mimetype: req.file.mimetype,
//                         size: req.file.size
//                     });
                    
//                     // 🔧 OPTIMIZE: Process signature image
//                     optimizedSignature = await sharp(req.file.buffer)
//                         .resize(400, 200, {
//                             fit: 'contain',
//                             background: { r: 255, g: 255, b: 255, alpha: 1 }
//                         })
//                         .png({ quality: 90, compressionLevel: 6 })
//                         .toBuffer();

//                     console.log('✅ Image optimized, size:', optimizedSignature.length);

//                     // 🔧 STORE: File metadata for later use
//                     signatureFileSize = req.file.size;
//                     signatureOriginalName = req.file.originalname;

//                     // 🔧 CLEAN METADATA: Ensure all values are strings
//                     const signatureMetadata = {
//                         doctorId: String(userDocument[0]._id),
//                         licenseNumber: String(licenseNumber),
//                         uploadedBy: String(req.user?._id || 'admin'),
//                         doctorName: String(fullName),
//                         signatureType: 'medical_signature',
//                         originalFilename: String(req.file.originalname || 'signature.png'),
//                         originalSize: String(req.file.size || 0),
//                         optimizedSize: String(optimizedSignature.length),
//                         mimeType: String(req.file.mimetype || 'image/png'),
//                         uploadTimestamp: String(Date.now())
//                     };

//                     const signatureFileName = `signature_${licenseNumber}_${Date.now()}.png`;
                    
//                     console.log('📤 Uploading to Wasabi with metadata:', signatureMetadata);
                    
//                     const uploadResult = await WasabiService.uploadDocument(
//                         optimizedSignature,
//                         signatureFileName,
//                         'signature',
//                         signatureMetadata
//                     );

//                     console.log('📤 Upload result:', uploadResult);

//                     if (uploadResult.success) {
//                         signatureUrl = uploadResult.location;
//                         signatureKey = uploadResult.key;
//                         signatureUploadSuccess = true;
//                         console.log(`✅ Signature uploaded successfully: ${signatureKey}`);
//                     } else {
//                         console.error('❌ Signature upload failed:', uploadResult.error);
//                         throw new Error(`Signature upload failed: ${uploadResult.error}`);
//                     }
                    
//                 } catch (signatureError) {
//                     console.error('❌ Error uploading signature:', signatureError);
//                     console.warn('⚠️ Continuing registration without signature');
//                     signatureUploadSuccess = false;
//                     // Reset variables on error
//                     optimizedSignature = null;
//                     signatureFileSize = 0;
//                     signatureOriginalName = '';
//                 }
//             } else {
//                 console.log('ℹ️ No signature file provided');
//             }

//             // 🔧 BUILD: Doctor profile data
//             const doctorProfileData = {
//                 userAccount: userDocument[0]._id, 
//                 specialization, 
//                 licenseNumber, 
//                 department: department || '',
//                 qualifications: qualifications ? 
//                     qualifications.split(',').map(q => q.trim()).filter(q => q) : [],
//                 yearsOfExperience: yearsOfExperience ? parseInt(yearsOfExperience) : null,
//                 contactPhoneOffice: contactPhoneOffice || '',
//                 isActiveProfile: isActiveProfile !== undefined ? isActiveProfile === 'true' : true
//             };

//             // 🔧 FIXED: Add signature fields with proper null checks
//             if (signatureUploadSuccess && optimizedSignature) {
//                 doctorProfileData.signature = signatureUrl;
//                 doctorProfileData.signatureWasabiKey = signatureKey;
//                 doctorProfileData.signatureMetadata = {
//                     uploadedAt: new Date(),
//                     fileSize: signatureFileSize || 0,
//                     originalName: signatureOriginalName || '',
//                     mimeType: 'image/png',
//                     optimizedSize: optimizedSignature ? optimizedSignature.length : 0
//                 };
//                 console.log('✅ Added signature fields to doctor profile');
//             } else {
//                 // 🔧 SAFE: Set default signature fields
//                 doctorProfileData.signature = '';
//                 doctorProfileData.signatureWasabiKey = '';
//                 doctorProfileData.signatureMetadata = null;
//                 console.log('ℹ️ No signature added to doctor profile');
//             }

//             console.log('📋 Doctor profile data:', JSON.stringify(doctorProfileData, null, 2));

//             const doctorProfile = await Doctor.create([doctorProfileData], { session });
//             console.log('✅ Doctor profile created:', doctorProfile[0]._id);

//             // Send welcome email
//             setImmediate(async () => {
//                 await sendWelcomeEmail(email, fullName, username, password, 'doctor_account');
//             });

//             // Clear caches
//             cache.del('doctors_list_*');

//             return {
//                 user: userDocument[0].toObject(),
//                 doctorProfile: doctorProfile[0].toObject(),
//                 signatureUploaded: signatureUploadSuccess,
//                 signatureDetails: signatureUploadSuccess ? {
//                     key: signatureKey,
//                     url: signatureUrl,
//                     originalSize: signatureFileSize,
//                     optimizedSize: optimizedSignature ? optimizedSignature.length : 0
//                 } : null
//             };
//         });

//         console.log('✅ Transaction completed successfully');

//         const baseMessage = 'Doctor registered successfully. A welcome email with login credentials has been sent.';
//         const signatureMessage = req.file ? 
//             (result.signatureUploaded ? ' Signature uploaded successfully.' : ' Signature upload failed but registration completed.') : 
//             '';

//         res.status(201).json({
//             success: true,
//             message: baseMessage + signatureMessage,
//             signatureUploaded: result.signatureUploaded,
//             data: {
//                 doctorId: result.doctorProfile._id,
//                 doctorRegistered: true,
//                 signatureProcessed: !!req.file,
//                 signatureSuccess: result.signatureUploaded,
//                 signatureDetails: result.signatureDetails
//             }
//         });

//     } catch (error) {
//         console.error('❌ Error registering doctor:', error);
        
//         if (error.name === 'ValidationError') {
//             const messages = Object.values(error.errors).map(val => val.message);
//             return res.status(400).json({ success: false, message: messages.join(', ') });
//         }
        
//         res.status(500).json({ 
//             success: false, 
//             message: error.message || 'Server error during doctor registration.' 
//         });
//     } finally {
//         await session.endSession();
//     }
// };

// 🔧 OPTIONAL MIDDLEWARE: Apply multer middleware for signature upload (optional)
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

// 🆕 NEW: Optional signature-specific registration function (for new routes)
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

            const password = generateRandomPassword();

            // Validation queries
            const [userExists, doctorWithLicenseExists] = await Promise.all([
                User.findOne({ $or: [{ email }, { username }] }).session(session),
                Doctor.findOne({ licenseNumber }).session(session)
            ]);

            if (userExists) {
                throw new Error('User with this email or username already exists.');
            }
            if (doctorWithLicenseExists) {
                throw new Error('A doctor with this license number already exists.');
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

// 🔧 UPDATED: Register lab and staff with Resend (aligned with registerDoctor pattern)
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

            const staffPassword = generateRandomPassword();

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
                staffUser: staffUserResponse,
                emailData: {
                    email: staffEmail,
                    fullName: staffFullName,
                    username: staffUsername,
                    password: staffPassword
                }
            };
        });

        console.log('✅ Lab and staff transaction completed successfully');

        // 🔧 UPDATED: Send welcome email asynchronously using Resend (matching registerDoctor pattern)
        setImmediate(async () => {
            console.log('📧 Sending lab staff welcome email via Resend...');
            const emailSent = await sendWelcomeEmail(
                result.emailData.email, 
                result.emailData.fullName, 
                result.emailData.username, 
                result.emailData.password, 
                'lab_staff'
            );
            
            if (emailSent) {
                console.log('✅ Lab staff welcome email sent successfully via Resend');
            } else {
                console.error('❌ Failed to send lab staff welcome email via Resend');
            }
        });

        res.status(201).json({
            success: true,
            message: 'Laboratory and initial lab staff user registered successfully. A welcome email with login credentials is being sent via Resend.',
            data: {
                labId: result.lab._id,
                labName: result.lab.name,
                labIdentifier: result.lab.identifier,
                staffUserId: result.staffUser._id,
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
