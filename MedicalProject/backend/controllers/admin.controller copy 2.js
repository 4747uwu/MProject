import Patient from '../models/patientModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import transporter from '../config/nodemailer.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import NodeCache from 'node-cache';
import mongoose from 'mongoose';

// 🔧 PERFORMANCE: Advanced caching with different TTLs
const cache = new NodeCache({ 
    stdTTL: 300, // 5 minutes default
    checkperiod: 60,
    useClones: false // Better performance for large objects
});







// 🔧 FIXED: admin.controller.js - Ensure all essential display fields are included
export const getAllStudiesForAdmin = async (req, res) => {
    console.log(`🔍 Admin fetching studies with query: ${JSON.stringify(req.query)}`);
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 20;
        
        // 🔧 REMOVED: All pagination logic - always show single page
        console.log(`📊 Fetching ${limit} studies in single page mode`);

        // Extract filters
        const { 
            StudyInstanceUIDs, 
            dataSources,
            search, status, category, modality, labId, 
            startDate, endDate, priority, patientName, 
            dateRange, dateType = 'createdAt'
        } = req.query;

        // Build cache key
        const cacheKey = `admin_studies_single_${limit}_${category || 'all'}_${search || ''}_${status || ''}_${modality || ''}_${dateRange || 'last24h'}_${dateType}_${startDate || ''}_${endDate || ''}_${StudyInstanceUIDs || ''}_${dataSources || ''}`;
        
        // Check cache
        let cachedData = cache.get(cacheKey);
        if (cachedData && limit <= 50) {
            console.log('📦 Returning cached studies data');
            return res.status(200).json({
                ...cachedData,
                performance: { queryTime: Date.now() - startTime, fromCache: true }
            });
        }

        // Build filters (same as before)
        const queryFilters = {};

        // Apply default 24-hour filter if no specific filters
        const applyDefaultDateFilter = !startDate && !endDate && !dateRange && !StudyInstanceUIDs;
        
        if (applyDefaultDateFilter) {
            const now = new Date();
            const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
            const defaultFilterDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
            queryFilters.createdAt = { $gte: defaultFilterDate };
            console.log(`📅 Applying default ${hoursBack}-hour filter`);
        }

        // 🆕 NEW: Handle StudyInstanceUIDs parameter (like OHIF)
        if (StudyInstanceUIDs && StudyInstanceUIDs !== 'undefined') {
            const studyUIDs = StudyInstanceUIDs.split(',').map(uid => uid.trim()).filter(uid => uid);
            if (studyUIDs.length > 0) {
                queryFilters.studyInstanceUID = { $in: studyUIDs };
                console.log(`🎯 Filtering by StudyInstanceUIDs: ${studyUIDs.join(', ')}`);
            }
        }

        // 🆕 NEW: Handle dataSources parameter (like OHIF)
        if (dataSources && dataSources !== 'undefined') {
            try {
                const dataSourcesArray = Array.isArray(dataSources) ? dataSources : JSON.parse(dataSources);
                // You can use this to filter by specific data sources/labs if needed
                if (dataSourcesArray.length > 0) {
                    console.log(`📊 Data sources specified: ${JSON.stringify(dataSourcesArray)}`);
                    // Example: Filter by sourceLab based on dataSources
                    // queryFilters.sourceLab = { $in: dataSourcesArray.map(ds => ds.id) };
                }
            } catch (e) {
                console.warn('⚠️ Invalid dataSources format:', dataSources);
            }
        }

        // 🔧 SIMPLIFIED: Single page aggregation pipeline
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
                                        'report_finalized', 'report_uploaded', 'report_downloaded_radiologist', 'report_downloaded'
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
            
            // 🔧 MINIMAL: Essential patient lookup only
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
                                'computed.fullName': 1
                            }
                        }
                    ]
                }
            },
            
            // 🔧 MINIMAL: Essential lab lookup only
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
                                identifier: 1
                            }
                        }
                    ]
                }
            },
            
            // 🔧 MINIMAL: Essential doctor lookup only
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
            
            // 🔧 PERFORMANCE: Additional patient name filter after lookup
            ...(patientName ? [{
                $match: {
                    $or: [
                        { 'patient.patientNameRaw': { $regex: patientName, $options: 'i' } },
                        { 'patient.firstName': { $regex: patientName, $options: 'i' } },
                        { 'patient.lastName': { $regex: patientName, $options: 'i' } },
                        { 'patient.patientID': { $regex: patientName, $options: 'i' } }
                    ]
                }
            }] : []),
            
            // 🔧 FIXED: Project ALL ESSENTIAL fields needed for table display
            {
                $project: {
                    // === Core identifiers (ESSENTIAL) ===
                    _id: 1,
                    studyInstanceUID: 1,
                    orthancStudyID: 1,
                    accessionNumber: 1,
                    
                    // === Workflow status (ESSENTIAL) ===
                    workflowStatus: 1,
                    currentCategory: 1,
                    
                    // === Basic study info (ESSENTIAL for table display) ===
                    modality: 1,                    // 🔧 FIXED: Include modality
                    modalitiesInStudy: 1,           // 🔧 FIXED: Include for fallback
                    studyDescription: 1,
                    examDescription: 1,
                    numberOfSeries: 1,              // 🔧 FIXED: Include series count
                    seriesCount: 1,                 // 🔧 FIXED: Alternative series field
                    numberOfImages: 1,              // 🔧 FIXED: Include for series display
                    instanceCount: 1,               // 🔧 FIXED: Alternative images field
                    studyDate: 1,                   // 🔧 FIXED: Include study date
                    studyTime: 1,                   // 🔧 FIXED: Include study time
                    createdAt: 1,                   // 🔧 FIXED: Include upload date
                    
                    // === Essential flags (ESSENTIAL) ===
                    ReportAvailable: 1,
                    
                    // === Assignment info (ESSENTIAL) ===
                    'assignment.priority': 1,
                    'assignment.assignedAt': 1,
                    lastAssignedDoctor: 1,
                    reportedBy: 1,
                    reportFinalizedAt: 1,
                    
                    // === Clinical (ESSENTIAL for some modals) ===
                    clinicalHistory: 1,
                    
                    // === Lookup results (ESSENTIAL) ===
                    patient: 1,
                    sourceLab: 1
                }
            },
            
            // 🔧 PERFORMANCE: Sort and limit only (no skip)
            { $sort: { createdAt: -1 } },
            { $limit: Math.min(limit, 10000) } // Cap at 10k for safety
        ];

        // Execute query
        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // Format studies (same as before)
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
            const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
            const lastAssignedDoctor = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor[0] : study.lastAssignedDoctor;
            const assignedDoctor = Array.isArray(study.assignedDoctor) ? study.assignedDoctor[0] : study.assignedDoctor;
            
            // Use either lastAssignedDoctor or assignedDoctor (fallback)
            const doctorData = lastAssignedDoctor || assignedDoctor;

            // 🔧 PERFORMANCE: Build patient display efficiently
            let patientDisplay = "N/A";
            let patientIdForDisplay = "N/A";
            let patientAgeGenderDisplay = "N/A";

            if (patient) {
                patientDisplay = patient.computed?.fullName || 
                                patient.patientNameRaw || 
                                `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
                patientIdForDisplay = patient.patientID || patient.mrn || 'N/A';

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

            // 🔧 PERFORMANCE: Build reported by display
            let reportedByDisplay = null;
            if (doctorData && doctorData.userAccount && study.workflowStatus === 'report_finalized') {
                reportedByDisplay = doctorData.userAccount.fullName;
            }

            return {
                // === Core Identifiers ===
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                instanceID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,

                // === Patient Information ===
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                patientGender: patient?.gender || 'N/A',
                patientDateOfBirth: patient?.dateOfBirth || 'N/A',
                patientContactPhone: patient?.contactInformation?.phone || 'N/A',
                patientContactEmail: patient?.contactInformation?.email || 'N/A',
                patientSalutation: patient?.salutation || 'N/A',

                // === Study Basic Information ===
                description: study.studyDescription || study.examDescription || 'N/A',
                modality: study.modalitiesInStudy && study.modalitiesInStudy.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                         seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                         seriesCount: study.seriesCount || 0,
                         instanceCount: study.instanceCount || 0,
                         numberOfSeries: study.seriesCount || study.numberOfSeries || 0,
                         numberOfImages: study.instanceCount || study.numberOfImages || 0,
                studyDateTime: study.studyDate && study.studyTime ? 
                              `${study.studyDate} ${study.studyTime.substring(0,6)}` : 
                              (study.studyDate || 'N/A'),
                studyDate: study.studyDate || null,
                studyTime: study.studyTime || null,
                uploadDateTime: study.createdAt,
                reportedDateTime: study.reportFinalizedAt,
                location: sourceLab?.name || 'N/A',
                institutionName: study.institutionName || sourceLab?.name || 'N/A',

                // === Clinical Information ===
                clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || '',
                previousInjuryInfo: study.previousInjuryInfo || patient?.medicalHistory?.previousInjury || '',
                previousSurgeryInfo: study.previousSurgeryInfo || patient?.medicalHistory?.previousSurgery || '',
                referredBy: study.referredBy || 'N/A',
                referralOrUrgencyNotes: study.referralOrUrgencyNotes || '',

                // === Study Details ===
                examType: study.examType || 'N/A',
                caseType: study.caseType || 'ROUTINE',
                procedureCode: study.procedureCode || 'N/A',
                studyAttributeType: study.studyAttributeType || 'N/A',
                studyStatusChangeReason: study.studyStatusChangeReason || '',

                // === Workflow Status ===
                workflowStatus: study.workflowStatus,
                currentCategory: study.currentCategory, // Include the computed category
                studyStatus: study.studyStatus || study.workflowStatus,
                patientWorkflowStatus: patient?.currentWorkflowStatus,

                // === Assignment Information ===
                lastAssignedDoctor: doctorData?._id || study.lastAssignedDoctor,
                lastAssignmentAt: study.lastAssignmentAt || study.assignment?.assignedAt,
                reportedBy: study.reportedBy || reportedByDisplay,
                assignedDoctorName: doctorData?.userAccount?.fullName || 'Not Assigned',
                assignedDoctorSpecialization: doctorData?.specialization || 'N/A',
                assignedDoctorEmail: doctorData?.userAccount?.email || 'N/A',

                // === Date Information ===
                billedOnStudyDate: study.billedOnStudyDate || null,
                uploadDate: study.uploadDate || study.createdAt,
                assignedDate: study.assignedDate || study.lastAssignmentAt || study.assignment?.assignedAt,
                reportDate: study.reportDate || study.reportFinalizedAt,
                reportStartedAt: study.reportStartedAt || null,
                reportFinalizedAt: study.reportFinalizedAt || null,
                recordModifiedDate: study.recordModifiedDate || null,
                recordModifiedTime: study.recordModifiedTime || null,
                reportTime: study.reportTime || null,

                // === TAT (Turnaround Time) Information ===
                studyToReportTAT: study.studyToReportTAT || study.timingInfo?.studyToReportMinutes || null,
                uploadToReportTAT: study.uploadToReportTAT || study.timingInfo?.uploadToReportMinutes || null,
                assignToReportTAT: study.assignToReportTAT || study.timingInfo?.assignToReportMinutes || null,
                diffStudyAndReportTAT: study.diffStudyAndReportTAT || 
                                      (study.studyToReportTAT ? `${study.studyToReportTAT} Minutes` : 
                                       study.timingInfo?.studyToReportMinutes ? `${study.timingInfo.studyToReportMinutes} Minutes` : 'N/A'),
                diffUploadAndReportTAT: study.diffUploadAndReportTAT || 
                                       (study.uploadToReportTAT ? `${study.uploadToReportTAT} Minutes` : 
                                        study.timingInfo?.uploadToReportMinutes ? `${study.timingInfo.uploadToReportMinutes} Minutes` : 'N/A'),
                diffAssignAndReportTAT: study.diffAssignAndReportTAT || 
                                       (study.assignToReportTAT ? `${study.assignToReportTAT} Minutes` : 
                                        study.timingInfo?.assignToReportMinutes ? `${study.timingInfo.assignToReportMinutes} Minutes` : 'N/A'),

                // === Report Information ===
                ReportAvailable: study.ReportAvailable || false,
                reportStatus: study.reportStatus || 'pending',
                lastReportGenerated: study.lastReportGenerated || null,
                report: study.report || '',
                reportsCount: study.reports?.length || 0,
                uploadedReportsCount: study.uploadedReports?.length || 0,

                // === Lab Information ===
                labName: sourceLab?.name || 'N/A',
                labIdentifier: sourceLab?.identifier || 'N/A',
                labContactPerson: sourceLab?.contactPerson || 'N/A',
                labContactEmail: sourceLab?.contactEmail || 'N/A',
                labContactPhone: sourceLab?.contactPhone || 'N/A',
                labAddress: sourceLab?.address || 'N/A',

                // === Status History ===
                statusHistory: study.statusHistory || [],
                statusHistoryCount: study.statusHistory?.length || 0,

                // === Images and Files ===
                images: study.images || [],
                imagesCount: study.images?.length || 0,
                hasPatientAttachments: patient?.attachments?.length > 0,
                patientAttachmentsCount: patient?.attachments?.length || 0,

                // === Timestamps ===
                createdAt: study.createdAt,
                updatedAt: study.updatedAt,
                archivedAt: study.archivedAt || null,

                // === Additional Data for Advanced Features ===
                modalitiesInStudy: study.modalitiesInStudy || [],
                
                // === Complete Patient Data (for modals/detailed views) ===
                patientData: patient ? {
//                     _id: patient._id,
//                     patientID: patient.patientID,
//                     mrn: patient.mrn,
//                     firstName: patient.firstName,
//                     lastName: patient.lastName,
//                     patientNameRaw: patient.patientNameRaw,
//                     dateOfBirth: patient.dateOfBirth,
//                     gender: patient.gender,
//                     ageString: patient.ageString,
//                     salutation: patient.salutation,
//                     currentWorkflowStatus: patient.currentWorkflowStatus,
//                     contactInformation: patient.contactInformation || {},
//                     medicalHistory: patient.medicalHistory || {},
//                     attachments: patient.attachments || [],
//                     computed: patient.computed || {}
                } : null,

                // === Complete Doctor Data (for modals/detailed views) ===
                doctorData: doctorData ? {
//                     _id: doctorData._id,
//                     specialization: doctorData.specialization,
//                     licenseNumber: doctorData.licenseNumber,
//                     department: doctorData.department,
//                     qualifications: doctorData.qualifications,
//                     yearsOfExperience: doctorData.yearsOfExperience,
//                     contactPhoneOffice: doctorData.contactPhoneOffice,
//                     isActiveProfile: doctorData.isActiveProfile,
//                     userAccount: doctorData.userAccount || {}
                } : null,

                // === Complete Lab Data (for modals/detailed views) ===
                labData: sourceLab ? {
//                     _id: sourceLab._id,
//                     name: sourceLab.name,
//                     identifier: sourceLab.identifier,
//                     contactPerson: sourceLab.contactPerson,
//                     contactEmail: sourceLab.contactEmail,
//                     contactPhone: sourceLab.contactPhone,
//                     address: sourceLab.address
                } : null,

                // === Reports Data ===
                reportsData: study.reports || [],
                uploadedReportsData: study.uploadedReports || [],

                // === Assignment Data (if using assignment structure) ===
                assignment: study.assignment || null,
                assignmentPriority: study.assignment?.priority || 'NORMAL',
                assignmentDueDate: study.assignment?.dueDate || null,
                
                // === Computed Fields for Performance ===
                daysSinceUpload: study.computed?.daysSinceUpload || 
                                Math.floor((Date.now() - new Date(study.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
                isOverdue: study.assignment?.dueDate ? new Date() > new Date(study.assignment.dueDate) : false,
                tatStatus: study.computed?.tatStatus || 'ON_TIME'
            };
        });

        // Pre-calculate category counts for the frontend
        const categoryCounts = {
            all: totalStudies,
            pending: 0,
            inprogress: 0,
            completed: 0,
            archived: 0
        };

        // Calculate summary statistics with optimized aggregation that includes category
        const summaryStats = await DicomStudy.aggregate([
            { $match: queryFilters },
            {
                $facet: {
                    // Group by workflow status
                    byStatus: [
                        {
                            $group: {
                                _id: '$workflowStatus',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    // Group by category
                    byCategory: [
                        {
                            $addFields: {
                                category: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: { $in: ["$workflowStatus", ['new_study_received', 'pending_assignment']] },
                                                then: "pending"
                                            },
                                            {
                                                case: { $in: ["$workflowStatus", [
                                                    'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                                                    'report_finalized', 'report_uploaded', 'report_downloaded_radiologist', 'report_downloaded'
                                                ]] },
                                                then: "inprogress"
                                            },
                                            {
                                                case: { $eq: ["$workflowStatus", 'final_report_downloaded'] },
                                                then: "completed"
                                            },
                                            {
                                                case: { $eq: ["$workflowStatus", 'archived'] },
                                                then: "archived"
                                            }
                                        ],
                                        default: "unknown"
                                    }
                                }
                            }
                        },
                        {
                            $group: {
                                _id: '$category',
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            }
        ]);

        // Convert to usable format and populate categoryCounts
        if (summaryStats[0]?.byCategory) {
            summaryStats[0].byCategory.forEach(item => {
                if (categoryCounts.hasOwnProperty(item._id)) {
                    categoryCounts[item._id] = item.count;
                }
            });
        }

        const processingTime = Date.now() - startTime;

        const responseData = {
            success: true,
            count: formattedStudies.length,
            totalRecords: Math.min(totalStudies, limit), // Show actual returned count
            recordsPerPage: limit,
            data: formattedStudies,
            
            // 🔧 SIMPLIFIED: Single page metadata
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
                isSinglePage: true // Flag for frontend
            },
            
            summary: {
                byCategory: categoryCounts
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length
            }
        };

        // Cache smaller requests
        if (limit <= 50) {
            cache.set(cacheKey, responseData, 60);
        }

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


export const getStudyDiscussions = async (req, res) => {
    try {
        const { studyId } = req.params;
        const startTime = Date.now();
        
        console.log(`🔍 Fetching discussions for study: ${studyId}`);

        // 🔧 PERFORMANCE: Check cache first
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

        // 🔧 PERFORMANCE: Cache the result (shorter TTL for dynamic data)
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


export const getPatientDetailedView = async (req, res) => {
    try {
        const { patientId } = req.params;
        const startTime = Date.now();

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

        const visitInfo = latestStudy ? {
            examType: latestStudy.examType || latestStudy.modality || 'N/A',
            examDescription: latestStudy.examDescription || 'N/A',
            caseType: latestStudy.caseType || 'ROUTINE',
            studyStatus: latestStudy.workflowStatus || 'pending',
            referringPhysician: latestStudy.referredBy || 'N/A',
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
                reportAvailable: latestStudy.ReportAvailable || false
            } : null,
            clinicalInfo,
            visitInfo,
            documents: patient.documents || [],
            allStudies: studies.map(study => ({
                studyId: study.studyInstanceUID,
                studyDate: study.studyDate,
                modality: study.modality || 'N/A',
                status: study.workflowStatus,
                accessionNumber: study.accessionNumber || 'N/A'
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

// 🔧 HIGH-PERFORMANCE: Doctor assignment with load balancing
// 🔧 ALTERNATIVE: Doctor assignment using findByIdAndUpdate
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

            // 🔧 PERFORMANCE: Validate doctor first
            const doctor = await Doctor.findById(doctorId)
                .populate('userAccount', 'fullName isActive')
                .session(session);

            if (!doctor || !doctor.userAccount?.isActive) {
                throw new Error('Doctor not found or inactive');
            }

            // 🔧 FIX: Update study using findByIdAndUpdate to avoid validation issues
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

            // Update the study
            const updatedStudy = await DicomStudy.findByIdAndUpdate(
                studyId,
                assignmentData,
                { 
                    session, 
                    new: true,
                    runValidators: false // Skip validation to avoid patientId issues
                }
            );

            if (!updatedStudy) {
                throw new Error('Study not found');
            }

            // Calculate and update timing info separately
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

            // 🔧 PERFORMANCE: Update patient status if patient exists
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

            // 🔧 PERFORMANCE: Clear related caches
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

// 🔧 HIGH-PERFORMANCE: Get all doctors with caching
export const getAllDoctors = async (req, res) => {
    try {
        const startTime = Date.now();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Cap at 50
        const skip = (page - 1) * limit;
        const { search = '', specialization = '', status = '' } = req.query;

        // 🔧 PERFORMANCE: Check cache for frequently accessed data
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

        // 🔧 OPTIMIZED: Build aggregation pipeline for better performance
        const pipeline = [
            // Match doctors based on filters
            {
                $match: {
                    ...(specialization && { specialization }),
                    ...(status !== '' && { isActiveProfile: status === 'active' })
                }
            },
            
            // Lookup user account data
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
            
            // Filter by search term
            ...(search ? [{
                $match: {
                    $or: [
                        { 'userAccount.fullName': { $regex: search, $options: 'i' } },
                        { 'userAccount.email': { $regex: search, $options: 'i' } },
                        { specialization: { $regex: search, $options: 'i' } }
                    ]
                }
            }] : []),
            
            // Get current workload for each doctor
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
            
            // Project final structure
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
            
            // Sort by workload and name
            {
                $sort: {
                    currentWorkload: 1, // Least loaded first
                    'userAccount.fullName': 1
                }
            },
            
            // Pagination
            { $skip: skip },
            { $limit: limit }
        ];

        // 🔧 PERFORMANCE: Execute aggregation
        const [doctors, totalCount, specializations] = await Promise.all([
            Doctor.aggregate(pipeline),
            Doctor.countDocuments({
                ...(specialization && { specialization }),
                ...(status !== '' && { isActiveProfile: status === 'active' })
            }),
            Doctor.distinct('specialization')
        ]);

        // 🔧 OPTIMIZED: Format response
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

        // 🔧 PERFORMANCE: Cache the result
        cache.set(cacheKey, responseData, 180); // 3 minutes

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

// 🔧 ADDITIONAL OPTIMIZED ADMIN FUNCTIONS
export const getDoctorStats = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const startTime = Date.now();

        // 🔧 PERFORMANCE: Check cache first
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

        // 🔧 OPTIMIZED: Get stats with aggregation
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

        // 🔧 PERFORMANCE: Cache the result
        cache.set(cacheKey, stats, 300); // 5 minutes

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



// 🔧 OPTIMIZED: Utility functions
const generateRandomPassword = () => {
    const min = 100000;
    const max = 999999;
    const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    return randomNumber.toString();
};

// 🔧 OPTIMIZED: Email service with caching and performance improvements
const sendWelcomeEmail = async (email, fullName, username, password, role) => {
    try {
        let subject, text, html;
        
        if (role === 'lab_staff') {
            subject = 'Welcome to Medical Platform - Lab Staff Account Created';
            text = `Hello ${fullName},\n\nYour lab staff account has been created successfully.\n\nUsername: ${username}\nTemporary Password: ${password}\n\nPlease login and change your password as soon as possible.\n\nRegards,\nMedical Platform Team`;
            html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Welcome to Medical Platform</h2>
                    <p>Hello ${fullName},</p>
                    <p>Your lab staff account has been created successfully.</p>
                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
                        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
                    </div>
                    <p>Please login and change your password as soon as possible.</p>
                    <p>Regards,<br>Medical Platform Team</p>
                </div>
            `;
        } else if (role === 'doctor_account') {
            subject = 'Welcome to Medical Platform - Doctor Account Created';
            text = `Hello Dr. ${fullName},\n\nYour doctor account has been created successfully.\n\nUsername: ${username}\nTemporary Password: ${password}\n\nPlease login and change your password as soon as possible.\n\nRegards,\nMedical Platform Team`;
            html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #10b981;">Welcome to Medical Platform</h2>
                    <p>Hello Dr. ${fullName},</p>
                    <p>Your doctor account has been created successfully.</p>
                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
                        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
                    </div>
                    <p>Please login and change your password as soon as possible.</p>
                    <p>Regards,<br>Medical Platform Team</p>
                </div>
            `;
        }

        await transporter.sendMail({
            from: '"Medical Platform" <no-reply@medicalplatform.com>',
            to: email,
            subject,
            text,
            html
        });
        
        console.log(`✅ Welcome email sent to ${email} successfully`);
        return true;
    } catch (error) {
        console.error('❌ Error sending welcome email:', error);
        return false;
    }
};

// 🔧 HIGH-PERFORMANCE: Register lab and staff (optimized with transactions)
export const registerLabAndStaff = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const {
                labName, labIdentifier, contactPerson, contactEmail, contactPhone, 
                address, labNotes, labIsActive, staffUsername, staffEmail, staffFullName
            } = req.body;

            // 🔧 PERFORMANCE: Validation
            if (!labName || !labIdentifier) {
                throw new Error('Laboratory name and identifier are required.');
            }
            if (!staffUsername || !staffEmail || !staffFullName) {
                throw new Error('Staff username, email, and full name are required.');
            }

            const staffPassword = generateRandomPassword();

            // 🔧 OPTIMIZED: Parallel validation queries
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

            // 🔧 PERFORMANCE: Create lab and staff user in parallel
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

            // 🔧 PERFORMANCE: Send email asynchronously after transaction
            setImmediate(async () => {
                await sendWelcomeEmail(staffEmail, staffFullName, staffUsername, staffPassword, 'lab_staff');
            });

            return {
                lab: newLabDocument[0].toObject(),
                staffUser: staffUserResponse
            };
        });

        res.status(201).json({
            success: true,
            message: 'Laboratory and initial lab staff user registered successfully. A welcome email with login credentials has been sent.'
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

// 🔧 HIGH-PERFORMANCE: Get doctor by ID (optimized with caching)
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

            return { doctorId, fullName };
        });

        // Fetch updated doctor for response
        const updatedDoctor = await Doctor.findById(req.params.doctorId)
            .populate({
                path: 'userAccount',
                select: 'fullName email username isActive isLoggedIn'
            })
            .lean();

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

// 🔧 HIGH-PERFORMANCE: Delete doctor (optimized with safety checks)
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



// export const getAllStudiesForAdmin = async (req, res) => {
//     console.log(`🔍 Admin fetching studies with query: ${JSON.stringify(req.query)}`);
//     try {
//         const startTime = Date.now();
//         const page = parseInt(req.query.page) || 1;
//         const limit = parseInt(req.query.limit) || 20;
        
//         // 🔧 NEW: For high limits, disable pagination
//         const usePagination = limit <= 100;
//         const skip = usePagination ? (page - 1) * limit : 0;
//         const actualLimit = usePagination ? limit : Math.min(limit, 10000); // Cap at 10k for safety

//         console.log(`📊 Fetching studies: page ${page}, limit ${limit}, usePagination: ${usePagination}, actualLimit: ${actualLimit}`);

//         // 🆕 ADD: Pagination calculation helpers
//         const calculatePaginationMeta = (totalRecords, currentPage, limit) => {
//             const totalPages = Math.ceil(totalRecords / limit);
//             const hasNextPage = currentPage < totalPages;
//             const hasPrevPage = currentPage > 1;
//             const nextPage = hasNextPage ? currentPage + 1 : null;
//             const prevPage = hasPrevPage ? currentPage - 1 : null;
            
//             // Generate page options for dropdown
//             const pageOptions = [];
//             const startPage = Math.max(1, currentPage - 5);
//             const endPage = Math.min(totalPages, startPage + 9);
            
//             for (let i = startPage; i <= endPage; i++) {
//                 pageOptions.push({
//                     value: i,
//                     label: `Page ${i}`,
//                     isCurrentPage: i === currentPage,
//                     recordRange: {
//                         start: (i - 1) * limit + 1,
//                         end: Math.min(i * limit, totalRecords)
//                     }
//                 });
//             }
            
//             return {
//                 currentPage,
//                 totalPages,
//                 totalRecords,
//                 limit,
//                 hasNextPage,
//                 hasPrevPage,
//                 nextPage,
//                 prevPage,
//                 pageOptions,
//                 recordRange: {
//                     start: (currentPage - 1) * limit + 1,
//                     end: Math.min(currentPage * limit, totalRecords)
//                 }
//             };
//         };

//         // 🔧 PERFORMANCE: Build advanced filters based on req.query
//         const queryFilters = {};
//         const { 
//             search, status, category, modality, labId, 
//             startDate, endDate, priority, patientName, dateRange 
//         } = req.query;

//         // Search filter for patient name, accession number, or patient ID
//         if (search) {
//             queryFilters.$or = [
//                 { accessionNumber: { $regex: search, $options: 'i' } },
//                 { studyInstanceUID: { $regex: search, $options: 'i' } }
//             ];  
//         }

//         // Status-based filtering with optimizations
//         // Allow filtering by specific workflow status
//         if (status) {
//             queryFilters.workflowStatus = status;
//         } 
//         // Allow filtering by category (pending, inprogress, completed)
//         else if (category) {
//             switch(category) {
//                 case 'pending':
//                     queryFilters.workflowStatus = { $in: ['new_study_received', 'pending_assignment'] };
//                     break;
//                 case 'inprogress':
//                     queryFilters.workflowStatus = { 
//                         $in: [
//                             'assigned_to_doctor',
//                             'doctor_opened_report',
//                             'report_in_progress',
//                             'report_finalized',
//                             'report_uploaded',
//                             'report_downloaded_radiologist',
//                             'report_downloaded'
//                         ] 
//                     };
//                     break;
//                 case 'completed':
//                     queryFilters.workflowStatus = 'final_report_downloaded';
//                     break;
//             }
//         }
        
//         // Add currentCategory field update logic in aggregation pipeline
//         const updateCategoryStage = {
//             $addFields: {
//                 currentCategory: {
//                     $cond: [
//                         { $in: ["$workflowStatus", ['new_study_received', 'pending_assignment']] },
//                         'pending',
//                         {
//                             $cond: [
//                                 { $in: ["$workflowStatus", [
//                                     'assigned_to_doctor',
//                                     'doctor_opened_report',
//                                     'report_in_progress',
//                                     'report_finalized',
//                                     'report_uploaded',
//                                     'report_downloaded_radiologist',
//                                     'report_downloaded'
//                                 ]] },
//                                 'inprogress',
//                                 {
//                                     $cond: [
//                                         { $eq: ["$workflowStatus", 'final_report_downloaded'] },
//                                         'completed',
//                                         {
//                                             $cond: [
//                                                 { $eq: ["$workflowStatus", 'archived'] },
//                                                 'archived',
//                                                 'unknown'
//                                             ]
//                                         }
//                                     ]
//                                 }
//                             ]
//                         }
//                     ]
//                 }
//             }
//         };

//         // Rest of your filtering code (modality, lab, priority, dates)
//         if (modality) {
//             queryFilters.$or = [
//                 { modality: modality },
//                 { modalitiesInStudy: { $in: [modality] } }
//             ];
//         }

//         if (labId) {
//             queryFilters.sourceLab = new mongoose.Types.ObjectId(labId);
//         }

//         if (priority) {
//             queryFilters['assignment.priority'] = priority;
//         }

//         // Date range filter
//         if (startDate || endDate) {
//             queryFilters.studyDate = {};
//             if (startDate) queryFilters.studyDate.$gte = startDate;
//             if (endDate) queryFilters.studyDate.$lte = endDate;
//         }

//         // Date range filter (alternative format)
//         if (dateRange) {
//             try {
//                 const range = JSON.parse(dateRange);
//                 if (range.start || range.end) {
//                     queryFilters.studyDate = {};
//                     if (range.start) queryFilters.studyDate.$gte = new Date(range.start);
//                     if (range.end) queryFilters.studyDate.$lte = new Date(range.end);
//                 }
//             } catch (e) {
//                 console.warn('Invalid dateRange format:', dateRange);
//             }
//         }

//         // Modified aggregation pipeline with category handling
//         const pipeline = [
//             { $match: queryFilters },
            
//             // Add the currentCategory field calculation
//             updateCategoryStage,
            
//             // Rest of your existing lookup stages
//             {
//                 $lookup: {
//                     from: 'patients',
//                     localField: 'patient',
//                     foreignField: '_id',
//                     as: 'patient',
//                     pipeline: [
//                         {
//                             $project: {
//                                 patientID: 1,
//                                 mrn: 1,
//                                 firstName: 1,
//                                 lastName: 1,
//                                 patientNameRaw: 1,
//                                 dateOfBirth: 1,
//                                 gender: 1,
//                                 ageString: 1,
//                                 salutation: 1,
//                                 currentWorkflowStatus: 1,
//                                 attachments: 1,
//                                 activeDicomStudyRef: 1,
//                                 'contactInformation.phone': 1,
//                                 'contactInformation.email': 1,
//                                 'medicalHistory.clinicalHistory': 1,
//                                 'medicalHistory.previousInjury': 1,
//                                 'medicalHistory.previousSurgery': 1,
//                                 'computed.fullName': 1
//                             }
//                         }
//                     ]
//                 }
//             },
            
//             {
//                 $lookup: {
//                     from: 'labs',
//                     localField: 'sourceLab',
//                     foreignField: '_id',
//                     as: 'sourceLab',
//                     pipeline: [
//                         {
//                             $project: {
//                                 name: 1,
//                                 identifier: 1,
//                                 contactPerson: 1,
//                                 contactEmail: 1,
//                                 contactPhone: 1,
//                                 address: 1
//                             }
//                         }
//                     ]
//                 }
//             },
            
//             {
//                 $lookup: {
//                     from: 'doctors',
//                     localField: 'lastAssignedDoctor',
//                     foreignField: '_id',
//                     as: 'lastAssignedDoctor',
//                     pipeline: [
//                         {
//                             $lookup: {
//                                 from: 'users',
//                                 localField: 'userAccount',
//                                 foreignField: '_id',
//                                 as: 'userAccount',
//                                 pipeline: [
//                                     {
//                                         $project: {
//                                             fullName: 1,
//                                             email: 1,
//                                             username: 1,
//                                             isActive: 1,
//                                             isLoggedIn: 1
//                                         }
//                                     }
//                                 ]
//                             }
//                         },
//                         {
//                             $project: {
//                                 specialization: 1,
//                                 licenseNumber: 1,
//                                 department: 1,
//                                 qualifications: 1,
//                                 yearsOfExperience: 1,
//                                 contactPhoneOffice: 1,
//                                 isActiveProfile: 1,
//                                 userAccount: { $arrayElemAt: ['$userAccount', 0] }
//                             }
//                         }
//                     ]
//                 }
//             },
            
//             // Alternative assignment lookup (if using assignment.assignedTo structure)
//             {
//                 $lookup: {
//                     from: 'doctors',
//                     localField: 'assignment.assignedTo',
//                     foreignField: '_id',
//                     as: 'assignedDoctor',
//                     pipeline: [
//                         {
//                             $lookup: {
//                                 from: 'users',
//                                 localField: 'userAccount',
//                                 foreignField: '_id',
//                                 as: 'userAccount',
//                                 pipeline: [
//                                     {
//                                         $project: {
//                                             fullName: 1,
//                                             email: 1,
//                                             username: 1,
//                                             isActive: 1,
//                                             isLoggedIn: 1
//                                         }
//                                     }
//                                 ]
//                             }
//                         },
//                         {
//                             $project: {
//                                 specialization: 1,
//                                 licenseNumber: 1,
//                                 department: 1,
//                                 qualifications: 1,
//                                 yearsOfExperience: 1,
//                                 contactPhoneOffice: 1,
//                                 isActiveProfile: 1,
//                                 userAccount: { $arrayElemAt: ['$userAccount', 0] }
//                             }
//                         }
//                     ]
//                 }
//             },
            
//             // Additional patient name search filter (applied after lookup)
//             ...(patientName ? [{
//                 $match: {
//                     $or: [
//                         { 'patient.patientNameRaw': { $regex: patientName, $options: 'i' } },
//                         { 'patient.firstName': { $regex: patientName, $options: 'i' } },
//                         { 'patient.lastName': { $regex: patientName, $options: 'i' } },
//                         { 'patient.patientID': { $regex: patientName, $options: 'i' } }
//                     ]
//                 }
//             }] : []),
            
//             // 🔧 PERFORMANCE: Sort by creation date (newest first)
//             { 
//                 $sort: { 
//                     createdAt: -1 
//                 } 
//             },
            
//             // Pagination
//             ...(usePagination ? [{ $skip: skip }, { $limit: actualLimit }] : [{ $limit: actualLimit }])
//         ];

//         // 🔧 PERFORMANCE: Execute queries in parallel
//         const [studies, totalStudies] = await Promise.all([
//             DicomStudy.aggregate(pipeline).allowDiskUse(true),
//             DicomStudy.countDocuments(queryFilters)
//         ]);

//         // Calculate pagination metadata
//         const totalPages = usePagination ? Math.ceil(totalStudies / limit) : 1;
//         const currentPage = usePagination ? page : 1;
//         const hasNextPage = usePagination ? page < totalPages : false;
//         const hasPrevPage = usePagination ? page > 1 : false;

//         // 🔧 OPTIMIZED: Format studies according to your exact specification
//         const formattedStudies = studies.map(study => {
//             // Get patient data (handle array from lookup)
//             const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
//             const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
//             const lastAssignedDoctor = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor[0] : study.lastAssignedDoctor;
//             const assignedDoctor = Array.isArray(study.assignedDoctor) ? study.assignedDoctor[0] : study.assignedDoctor;
            
//             // Use either lastAssignedDoctor or assignedDoctor (fallback)
//             const doctorData = lastAssignedDoctor || assignedDoctor;

//             // 🔧 PERFORMANCE: Build patient display efficiently
//             let patientDisplay = "N/A";
//             let patientIdForDisplay = "N/A";
//             let patientAgeGenderDisplay = "N/A";

//             if (patient) {
//                 patientDisplay = patient.computed?.fullName || 
//                                patient.patientNameRaw || 
//                                `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || "N/A";
//                 patientIdForDisplay = patient.patientID || patient.mrn || 'N/A';

//                 let agePart = patient.ageString || "";
//                 let genderPart = patient.gender || "";
//                 if (agePart && genderPart) {
//                     patientAgeGenderDisplay = `${agePart} / ${genderPart}`;
//                 } else if (agePart) {
//                     patientAgeGenderDisplay = agePart;
//                 } else if (genderPart) {
//                     patientAgeGenderDisplay = `/ ${genderPart}`;
//                 }
//             }

//             // 🔧 PERFORMANCE: Build reported by display
//             let reportedByDisplay = null;
//             if (doctorData && doctorData.userAccount && study.workflowStatus === 'report_finalized') {
//                 reportedByDisplay = doctorData.userAccount.fullName;
//             }

//             return {
//                 // === Core Identifiers ===
//                 _id: study._id,
//                 orthancStudyID: study.orthancStudyID,
//                 studyInstanceUID: study.studyInstanceUID,
//                 instanceID: study.studyInstanceUID,
//                 accessionNumber: study.accessionNumber,

//                 // === Patient Information ===
//                 patientId: patientIdForDisplay,
//                 patientName: patientDisplay,
//                 ageGender: patientAgeGenderDisplay,
//                 patientGender: patient?.gender || 'N/A',
//                 patientDateOfBirth: patient?.dateOfBirth || null,
//                 patientContactPhone: patient?.contactInformation?.phone || 'N/A',
//                 patientContactEmail: patient?.contactInformation?.email || 'N/A',
//                 patientSalutation: patient?.salutation || 'N/A',

//                 // === Study Basic Information ===
//                 description: study.studyDescription || study.examDescription || 'N/A',
//                 modality: study.modalitiesInStudy && study.modalitiesInStudy.length > 0 ? 
//                          study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
//                          seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
//                          seriesCount: study.seriesCount || 0,
//                          instanceCount: study.instanceCount || 0,
//                          numberOfSeries: study.seriesCount || study.numberOfSeries || 0,
//                          numberOfImages: study.instanceCount || study.numberOfImages || 0,
//                 studyDateTime: study.studyDate && study.studyTime ? 
//                               `${study.studyDate} ${study.studyTime.substring(0,6)}` : 
//                               (study.studyDate || 'N/A'),
//                 studyDate: study.studyDate || null,
//                 studyTime: study.studyTime || null,
//                 uploadDateTime: study.createdAt,
//                 reportedDateTime: study.reportFinalizedAt,
//                 location: sourceLab?.name || 'N/A',
//                 institutionName: study.institutionName || sourceLab?.name || 'N/A',

//                 // === Clinical Information ===
//                 clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || '',
//                 previousInjuryInfo: study.previousInjuryInfo || patient?.medicalHistory?.previousInjury || '',
//                 previousSurgeryInfo: study.previousSurgeryInfo || patient?.medicalHistory?.previousSurgery || '',
//                 referredBy: study.referredBy || 'N/A',
//                 referralOrUrgencyNotes: study.referralOrUrgencyNotes || '',

//                 // === Study Details ===
//                 examType: study.examType || 'N/A',
//                 caseType: study.caseType || 'ROUTINE',
//                 procedureCode: study.procedureCode || 'N/A',
//                 studyAttributeType: study.studyAttributeType || 'N/A',
//                 studyStatusChangeReason: study.studyStatusChangeReason || '',

//                 // === Workflow Status ===
//                 workflowStatus: study.workflowStatus,
//                 currentCategory: study.currentCategory, // Include the computed category
//                 studyStatus: study.studyStatus || study.workflowStatus,
//                 patientWorkflowStatus: patient?.currentWorkflowStatus,

//                 // === Assignment Information ===
//                 lastAssignedDoctor: doctorData?._id || study.lastAssignedDoctor,
//                 lastAssignmentAt: study.lastAssignmentAt || study.assignment?.assignedAt,
//                 reportedBy: study.reportedBy || reportedByDisplay,
//                 assignedDoctorName: doctorData?.userAccount?.fullName || 'Not Assigned',
//                 assignedDoctorSpecialization: doctorData?.specialization || 'N/A',
//                 assignedDoctorEmail: doctorData?.userAccount?.email || 'N/A',

//                 // === Date Information ===
//                 billedOnStudyDate: study.billedOnStudyDate || null,
//                 uploadDate: study.uploadDate || study.createdAt,
//                 assignedDate: study.assignedDate || study.lastAssignmentAt || study.assignment?.assignedAt,
//                 reportDate: study.reportDate || study.reportFinalizedAt,
//                 reportStartedAt: study.reportStartedAt || null,
//                 reportFinalizedAt: study.reportFinalizedAt || null,
//                 recordModifiedDate: study.recordModifiedDate || null,
//                 recordModifiedTime: study.recordModifiedTime || null,
//                 reportTime: study.reportTime || null,

//                 // === TAT (Turnaround Time) Information ===
//                 studyToReportTAT: study.studyToReportTAT || study.timingInfo?.studyToReportMinutes || null,
//                 uploadToReportTAT: study.uploadToReportTAT || study.timingInfo?.uploadToReportMinutes || null,
//                 assignToReportTAT: study.assignToReportTAT || study.timingInfo?.assignToReportMinutes || null,
//                 diffStudyAndReportTAT: study.diffStudyAndReportTAT || 
//                                       (study.studyToReportTAT ? `${study.studyToReportTAT} Minutes` : 
//                                        study.timingInfo?.studyToReportMinutes ? `${study.timingInfo.studyToReportMinutes} Minutes` : 'N/A'),
//                 diffUploadAndReportTAT: study.diffUploadAndReportTAT || 
//                                        (study.uploadToReportTAT ? `${study.uploadToReportTAT} Minutes` : 
//                                         study.timingInfo?.uploadToReportMinutes ? `${study.timingInfo.uploadToReportMinutes} Minutes` : 'N/A'),
//                 diffAssignAndReportTAT: study.diffAssignAndReportTAT || 
//                                        (study.assignToReportTAT ? `${study.assignToReportTAT} Minutes` : 
//                                         study.timingInfo?.assignToReportMinutes ? `${study.timingInfo.assignToReportMinutes} Minutes` : 'N/A'),

//                 // === Report Information ===
//                 ReportAvailable: study.ReportAvailable || false,
//                 reportStatus: study.reportStatus || 'pending',
//                 lastReportGenerated: study.lastReportGenerated || null,
//                 report: study.report || '',
//                 reportsCount: study.reports?.length || 0,
//                 uploadedReportsCount: study.uploadedReports?.length || 0,

//                 // === Lab Information ===
//                 labName: sourceLab?.name || 'N/A',
//                 labIdentifier: sourceLab?.identifier || 'N/A',
//                 labContactPerson: sourceLab?.contactPerson || 'N/A',
//                 labContactEmail: sourceLab?.contactEmail || 'N/A',
//                 labContactPhone: sourceLab?.contactPhone || 'N/A',
//                 labAddress: sourceLab?.address || 'N/A',

//                 // === Status History ===
//                 statusHistory: study.statusHistory || [],
//                 statusHistoryCount: study.statusHistory?.length || 0,

//                 // === Images and Files ===
//                 images: study.images || [],
//                 imagesCount: study.images?.length || 0,
//                 hasPatientAttachments: patient?.attachments?.length > 0,
//                 patientAttachmentsCount: patient?.attachments?.length || 0,

//                 // === Timestamps ===
//                 createdAt: study.createdAt,
//                 updatedAt: study.updatedAt,
//                 archivedAt: study.archivedAt || null,

//                 // === Additional Data for Advanced Features ===
//                 modalitiesInStudy: study.modalitiesInStudy || [],
                
//                 // === Complete Patient Data (for modals/detailed views) ===
//                 patientData: patient ? {
//                     _id: patient._id,
//                     patientID: patient.patientID,
//                     mrn: patient.mrn,
//                     firstName: patient.firstName,
//                     lastName: patient.lastName,
//                     patientNameRaw: patient.patientNameRaw,
//                     dateOfBirth: patient.dateOfBirth,
//                     gender: patient.gender,
//                     ageString: patient.ageString,
//                     salutation: patient.salutation,
//                     currentWorkflowStatus: patient.currentWorkflowStatus,
//                     contactInformation: patient.contactInformation || {},
//                     medicalHistory: patient.medicalHistory || {},
//                     attachments: patient.attachments || [],
//                     computed: patient.computed || {}
//                 } : null,

//                 // === Complete Doctor Data (for modals/detailed views) ===
//                 doctorData: doctorData ? {
//                     _id: doctorData._id,
//                     specialization: doctorData.specialization,
//                     licenseNumber: doctorData.licenseNumber,
//                     department: doctorData.department,
//                     qualifications: doctorData.qualifications,
//                     yearsOfExperience: doctorData.yearsOfExperience,
//                     contactPhoneOffice: doctorData.contactPhoneOffice,
//                     isActiveProfile: doctorData.isActiveProfile,
//                     userAccount: doctorData.userAccount || {}
//                 } : null,

//                 // === Complete Lab Data (for modals/detailed views) ===
//                 labData: sourceLab ? {
//                     _id: sourceLab._id,
//                     name: sourceLab.name,
//                     identifier: sourceLab.identifier,
//                     contactPerson: sourceLab.contactPerson,
//                     contactEmail: sourceLab.contactEmail,
//                     contactPhone: sourceLab.contactPhone,
//                     address: sourceLab.address
//                 } : null,

//                 // === Reports Data ===
//                 reportsData: study.reports || [],
//                 uploadedReportsData: study.uploadedReports || [],

//                 // === Assignment Data (if using assignment structure) ===
//                 assignment: study.assignment || null,
//                 assignmentPriority: study.assignment?.priority || 'NORMAL',
//                 assignmentDueDate: study.assignment?.dueDate || null,
                
//                 // === Computed Fields for Performance ===
//                 daysSinceUpload: study.computed?.daysSinceUpload || 
//                                 Math.floor((Date.now() - new Date(study.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
//                 isOverdue: study.assignment?.dueDate ? new Date() > new Date(study.assignment.dueDate) : false,
//                 tatStatus: study.computed?.tatStatus || 'ON_TIME'
//             };
//         });

//         // Pre-calculate category counts for the frontend
//         const categoryCounts = {
//             all: totalStudies,
//             pending: 0,
//             inprogress: 0,
//             completed: 0,
//             archived: 0
//         };

//         // Calculate summary statistics with optimized aggregation that includes category
//         const summaryStats = await DicomStudy.aggregate([
//             { $match: queryFilters },
//             {
//                 $facet: {
//                     // Group by workflow status
//                     byStatus: [
//                         {
//                             $group: {
//                                 _id: '$workflowStatus',
//                                 count: { $sum: 1 }
//                             }
//                         }
//                     ],
//                     // Group by category
//                     byCategory: [
//                         {
//                             $addFields: {
//                                 category: {
//                                     $switch: {
//                                         branches: [
//                                             {
//                                                 case: { $in: ["$workflowStatus", ['new_study_received', 'pending_assignment']] },
//                                                 then: "pending"
//                                             },
//                                             {
//                                                 case: { $in: ["$workflowStatus", [
//                                                     'assigned_to_doctor',
//                                                     'doctor_opened_report',
//                                                     'report_in_progress',
//                                                     'report_finalized',
//                                                     'report_uploaded',
//                                                     'report_downloaded_radiologist',
//                                                     'report_downloaded'
//                                                 ]] },
//                                                 then: "inprogress"
//                                             },
//                                             {
//                                                 case: { $eq: ["$workflowStatus", 'final_report_downloaded'] },
//                                                 then: "completed"
//                                             },
//                                             {
//                                                 case: { $eq: ["$workflowStatus", 'archived'] },
//                                                 then: "archived"
//                                             }
//                                         ],
//                                         default: "unknown"
//                                     }
//                                 }
//                             }
//                         },
//                         {
//                             $group: {
//                                 _id: '$category',
//                                 count: { $sum: 1 }
//                             }
//                         }
//                     ]
//                 }
//             }
//         ]);

//         // Convert to usable format and populate categoryCounts
//         if (summaryStats[0]?.byCategory) {
//             summaryStats[0].byCategory.forEach(item => {
//                 if (categoryCounts.hasOwnProperty(item._id)) {
//                     categoryCounts[item._id] = item.count;
//                 }
//             });
//         }

//         const processingTime = Date.now() - startTime;

//         res.status(200).json({
//             success: true,
//             count: formattedStudies.length,
//             totalPages: totalPages,
//             currentPage: currentPage,
//             totalRecords: totalStudies,
//             recordsPerPage: limit,
//             usePagination: usePagination,
//             data: formattedStudies,
//             pagination: {
//                 currentPage,
//                 totalPages,
//                 totalRecords: totalStudies,
//                 limit: actualLimit,
//                 hasNextPage,
//                 hasPrevPage,
//                 recordRange: {
//                     start: usePagination ? (currentPage - 1) * limit + 1 : 1,
//                     end: usePagination ? Math.min(currentPage * limit, totalStudies) : formattedStudies.length
//                 }
//             },
//             performance: {
//                 queryTime: processingTime,
//                 fromCache: false
//             }
//         });

//     } catch (error) {
//         console.error('❌ Error fetching all studies for admin:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Server error fetching studies.',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };

