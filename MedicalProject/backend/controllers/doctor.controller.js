import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';
import NodeCache from 'node-cache';
import mongoose from 'mongoose'
import { calculateStudyTAT, getLegacyTATFields } from '../utils/TATutility.js';

const cache = new NodeCache({ stdTTL: 300 });

// 🔧 STANDARDIZED: Status categories used across ALL doctor functions
const DOCTOR_STATUS_CATEGORIES = {
    pending: [
        'new_study_received', 
        'pending_assignment',
        'assigned_to_doctor',           // ✅ SAME AS ADMIN
        'doctor_opened_report',         // ✅ SAME AS ADMIN  
        'report_in_progress',          // ✅ SAME AS ADMIN
        'report_downloaded_radiologist', // ✅ SAME AS ADMIN
        'report_downloaded'            // ✅ SAME AS ADMIN
    ],
    inprogress: [
        'report_finalized', 
        'report_drafted', 
        'report_uploaded'
    ],
    completed: ['final_report_downloaded']
};
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

// 🔧 HELPER: Get all statuses for a category
const getAllStatusesForCategory = (category) => {
    if (category === 'all') {
        return [
            ...DOCTOR_STATUS_CATEGORIES.pending,
            ...DOCTOR_STATUS_CATEGORIES.inprogress,
            ...DOCTOR_STATUS_CATEGORIES.completed
        ];
    }
    return DOCTOR_STATUS_CATEGORIES[category] || [];
};

// 🔧 HELPER: Get category for a status
const getCategoryForStatus = (status) => {
    for (const [category, statuses] of Object.entries(DOCTOR_STATUS_CATEGORIES)) {
        if (statuses.includes(status)) {
            return category;
        }
    }
    return 'unknown';
};


export const getAssignedStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = Math.min(parseInt(req.query.limit) || 20, 1000);

        // 🔥 STEP 1: Get doctor with lean query for better performance
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        console.log(`🔍 DOCTOR: Searching for studies assigned to doctor: ${doctor._id}`);

        const { 
            search, status, category, modality, priority, patientName, 
            customDateFrom, customDateTo, quickDatePreset
        } = req.query;

        // 🔥 STEP 2: Optimized date filtering with pre-calculated timestamps
        let filterStartDate = null;
        let filterEndDate = null;
        
        if (quickDatePreset) {
            const now = Date.now(); // Use timestamp for better performance
            
            switch (quickDatePreset) {
                case '24h':
                case 'last24h':
                    filterStartDate = new Date(now - 86400000); // 24 * 60 * 60 * 1000
                    filterEndDate = new Date(now);
                    break;
                case 'today':
                case 'assignedToday':
                    const dayStart = new Date();
                    dayStart.setHours(0, 0, 0, 0);
                    filterStartDate = dayStart;
                    filterEndDate = new Date(dayStart.getTime() + 86399999); // 23:59:59.999
                    break;
                case 'yesterday':
                    const yesterdayStart = now - 86400000;
                    const dayStartYesterday = new Date(yesterdayStart);
                    dayStartYesterday.setHours(0, 0, 0, 0);
                    filterStartDate = dayStartYesterday;
                    filterEndDate = new Date(dayStartYesterday.getTime() + 86399999);
                    break;
                case 'week':
                case 'thisWeek':
                    filterStartDate = new Date(now - 604800000); // 7 * 24 * 60 * 60 * 1000
                    filterEndDate = new Date(now);
                    break;
                case 'month':
                case 'thisMonth':
                    filterStartDate = new Date(now - 2592000000); // 30 * 24 * 60 * 60 * 1000
                    filterEndDate = new Date(now);
                    break;
                case 'custom':
                    filterStartDate = customDateFrom ? new Date(customDateFrom + 'T00:00:00Z') : null;
                    filterEndDate = customDateTo ? new Date(customDateTo + 'T23:59:59Z') : null;
                    break;
            }
        }

        // 🔥 STEP 3: Build optimized core query with better structure
        let baseQuery;
        if (filterStartDate && filterEndDate) {
            console.log(`📅 DOCTOR: Applying ASSIGNMENT DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
            // Use $elemMatch to find a study where a SINGLE assignment element matches BOTH the doctor AND the date range.
            baseQuery = {
                $or: [
                    { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
                    { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
                ]
            };
        } else {
            // If NO date filter, use the simpler (but still correct) query.
            baseQuery = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctor._id },
                    { 'assignment.assignedTo': doctor._id }
                ]
            };
        }

        // 🔥 STEP 4: Optimized category filtering with pre-defined status arrays
        let queryFilters = { ...baseQuery };

        if (category && category !== 'all') {
            const statusesForCategory = getAllStatusesForCategory(category);
            queryFilters.workflowStatus = statusesForCategory.length === 1 ? 
                statusesForCategory[0] : { $in: statusesForCategory };
        } else if (status) {
            queryFilters.workflowStatus = status;
        } else {
            const allStatuses = getAllStatusesForCategory('all');
            queryFilters.workflowStatus = { $in: allStatuses };
        }

        // 🔥 STEP 5: Apply other filters with optimizations
        if (search) {
            // Use the high-performance text index
            queryFilters.$text = { $search: search };
        }
        if (modality) {
            queryFilters.modality = modality;
        }
        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        console.log(`🔍 DOCTOR: Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 6: Ultra-optimized aggregation pipeline
        const pipeline = [
            // Start with most selective match first
            { $match: queryFilters },
            
            // Add category computation early for better filtering
            {
                $addFields: {
                    currentCategory: {
                        $switch: {
                            branches: [
                                { case: { $in: ["$workflowStatus", DOCTOR_STATUS_CATEGORIES.pending] }, then: 'pending' },
                                { case: { $in: ["$workflowStatus", DOCTOR_STATUS_CATEGORIES.inprogress] }, then: 'inprogress' },
                                { case: { $in: ["$workflowStatus", DOCTOR_STATUS_CATEGORIES.completed] }, then: 'completed' }
                            ],
                            default: 'unknown'
                        }
                    }
                }
            },
            
            // Sort early for index efficiency
            { $sort: { 'assignment.assignedAt': -1, createdAt: -1 } },
            
            // Limit early to reduce pipeline processing
            { $limit: limit },
            
            // Project only necessary fields after limiting
            {
                $project: {
                    _id: 1,
                    studyInstanceUID: 1,
                    orthancStudyID: 1,
                                        modalitiesInStudy: 1,

                    accessionNumber: 1,
                    workflowStatus: 1,
                    currentCategory: 1,
                    modality: 1,
                    examDescription: 1,
                    studyDescription: 1,
                    seriesImages: 1,
                    seriesCount: 1,
                    instanceCount: 1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
                    clinicalHistory: 1,
                    doctorReports: 1,
                    caseType: 1,
                    assignment: 1,
                    lastAssignedDoctor: 1,
                    patient: 1,
                    sourceLab: 1,
                    age:1,
                    gender:1,
                    clinicalHistory: 1,
                    preProcessedDownload: 1
                }
            },

                { 
        $lookup: { 
            from: 'labs', 
            localField: 'sourceLab', 
            foreignField: '_id', 
            as: 'sourceLab',
            pipeline: [{ 
                $project: { 
                    name: 1, 
                    identifier: 1 
                } 
            }] 
        } 
    },
            
            // Lookup patient data with optimized projection
            { 
                $lookup: { 
                    from: 'patients', 
                    localField: 'patient', 
                    foreignField: '_id', 
                    as: 'patientData',
                    pipeline: [{ 
                        $project: { 
                            patientID: 1, 
                            firstName: 1, 
                            lastName: 1, 
                            patientNameRaw: 1, 
                            ageString: 1, 
                            gender: 1, 
                            'computed.fullName': 1, 
                            'clinicalInfo.clinicalHistory': 1 
                        } 
                    }] 
                } 
            },

             {
        $addFields: {
            sourceLab: { $arrayElemAt: ['$sourceLab', 0] }
        }
    },
            
            // Apply patientName filter after lookup if needed
            ...(patientName ? [{
                $match: { 
                    $or: [ 
                        { 'patientData.patientNameRaw': { $regex: patientName, $options: 'i' } }, 
                        { 'patientData.patientID': { $regex: patientName, $options: 'i' } } 
                    ] 
                }
            }] : [])
        ];

        // 🔥 STEP 7: Execute optimized parallel queries with better error handling
        console.log(`🚀 Executing optimized doctor studies query...`);
        const queryStart = Date.now();

        // Build count pipeline efficiently
        const countPipeline = patientName ? 
            [...pipeline.slice(0, -1), { $count: "total" }] : // Include patient filter for count
            [{ $match: queryFilters }, { $count: "total" }]; // Simple count without lookups

        const [studiesResult, totalResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false), // Disable disk use for better performance
            patientName ? 
                DicomStudy.aggregate(countPipeline).allowDiskUse(false) : 
                DicomStudy.countDocuments(queryFilters)
        ]);

        // Handle potential errors
        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }
        if (totalResult.status === 'rejected') {
            console.warn('Count query failed, using studies length:', totalResult.reason.message);
        }

        const studies = studiesResult.value;
        const totalStudies = totalResult.status === 'fulfilled' ? 
            (patientName ? (totalResult.value[0]?.total || 0) : totalResult.value) : 
            studies.length;

        const queryTime = Date.now() - queryStart;
        console.log(`📊 DOCTOR: Query results: Found ${studies.length} studies, total matching: ${totalStudies} (${queryTime}ms)`);

        // 🔥 STEP 8: Optimized formatting with minimal processing
        const formatStart = Date.now();
        
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patientData) && study.patientData.length > 0 ? 
                study.patientData[0] : null;

                const sourceLab = study.sourceLab;

                const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                        study.preProcessedDownload?.zipUrl &&
                        (!study.preProcessedDownload?.zipExpiresAt || 
                         study.preProcessedDownload.zipExpiresAt > new Date());
            
            // Get the most recent assignment for display purposes - optimized
            let assignmentData = null;
            if (study.assignment && study.assignment.length > 0) {
                assignmentData = study.assignment[study.assignment.length - 1];
            } else if (study.lastAssignedDoctor && study.lastAssignedDoctor.length > 0) {
                assignmentData = study.lastAssignedDoctor[study.lastAssignedDoctor.length - 1];
            }

            // Optimized patient display building
            let patientDisplay = 'N/A';
            let patientIdDisplay = 'N/A';
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                `${study.age}/${study.gender}` : 
                                study.age || study.gender || 'N/A';

            if (patient) {
                patientDisplay = patient.computed?.fullName || patient.patientNameRaw || 'N/A';
                patientIdDisplay = patient.patientID || 'N/A';
                
                // if (patient.ageString && patient.gender) {
                //     ageGenderDisplay = `${patient.ageString} / ${patient.gender}`;
                // } else if (patient.ageString) {
                //     ageGenderDisplay = patient.ageString;
                // } else if (patient.gender) {
                //     ageGenderDisplay = patient.gender;
                // }
            }

            const tat = study.calculatedTAT || calculateStudyTAT(study);

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientIdDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                description: study.examDescription || study.studyDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: 'N/A', // Note: sourceLab lookup removed for performance - add back if needed
                // studyDate: study.studyDate,
                studyDateTime: study.studyDate && study.studyTime 
                ? formatDicomDateTime(study.studyDate, study.studyTime)
                : study.studyDate 
                    ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                        year: 'numeric', month: 'short', day: '2-digit'
                    })
                    : 'N/A',
                
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
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    // Use the latest uploadedAt if multiple reports
                    const latestReport = study.doctorReports.reduce((latest, curr) =>
                        new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                        study.doctorReports[0]
                    );
                    const dt = new Date(latestReport.uploadedAt);
                    // Format: 15 Jun 2025 03:30
                    return dt.toLocaleString('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).replace(',', '');
                })()
                : null,

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
                workflowStatus: study.workflowStatus,
                caseType: study.caseType || 'routine',
                currentCategory: study.currentCategory,
                tat: tat,
                totalTATDays: tat.totalTATDays,
                isOverdue: tat.isOverdue,
                tatPhase: tat.phase,
                priority: assignmentData?.priority || study.caseType?.toUpperCase() || 'NORMAL',
                assignedDate: assignmentData?.assignedAt,
                ReportAvailable: study.ReportAvailable || false,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || '',
            };
        });

        // 🔥 STEP 9: Optimized category counting (using returned data for performance)
        const categoryCounts = { all: totalStudies, pending: 0, inprogress: 0, completed: 0 };
        formattedStudies.forEach(study => {
            if (study.currentCategory && categoryCounts.hasOwnProperty(study.currentCategory)) {
                categoryCounts[study.currentCategory]++;
            }
        });

        const formatTime = Date.now() - formatStart;
        const totalProcessingTime = Date.now() - startTime;

        console.log(`✅ DOCTOR: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 DOCTOR: Total processing time: ${totalProcessingTime}ms for ${formattedStudies.length} studies`);
        
        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
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
                }
            },
            summary: {
                byCategory: categoryCounts,
                urgentStudies: formattedStudies.filter(s => ['URGENT', 'EMERGENCY', 'STAT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: totalProcessingTime,
                recordsReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    formatting: formatTime,
                    totalProcessing: totalProcessingTime
                }
            }
        });

    } catch (error) {
        console.error('❌ DOCTOR: Error fetching assigned studies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching assigned studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getPatientDetailedViewForDoctor = async (req, res) => {
    try {
        const { id: patientId } = req.params;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Parallel queries for better performance
        const [patient, studies] = await Promise.all([
            Patient.findOne({ patientID: patientId }).lean(),
            DicomStudy.find({
                patient: { $exists: true },
                lastAssignedDoctor: doctor._id
            })
            .populate('sourceLab', 'name identifier')
            .sort({ studyDate: -1 })
            .lean()
        ]);

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 OPTIMIZED: Format studies efficiently
        const formattedStudies = studies.map(study => ({
            _id: study._id,
            studyDateTime: study.studyDate,
            modality: study.modalitiesInStudy ? study.modalitiesInStudy.join(', ') : 'N/A',
            description: study.examDescription || study.examType || 'N/A',
            workflowStatus: study.workflowStatus,
            location: study.sourceLab?.name || 'N/A',
            priority: study.caseType || 'ROUTINE',
            assignedAt: study.lastAssignmentAt,
            reportContent: study.reportContent,
            reportFinalizedAt: study.reportFinalizedAt
        }));

        const responseData = {
            patientInfo: {
                patientID: patient.patientID,
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                age: patient.ageString || '',
                gender: patient.gender || '',
                dateOfBirth: patient.dateOfBirth || '',
                contactNumber: patient.contactInformation?.phone || '',
                address: patient.address || ''
            },
            clinicalInfo: patient.clinicalInfo || {},
            referralInfo: patient.referralInfo || '',
            studies: formattedStudies,
            documents: patient.documents || []
        };

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error fetching patient details for doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient details'
        });
    }
};

export const getValues = async (req, res) => {
    console.log(`🔍 DOCTOR VALUES: Fetching dashboard values with filters: ${JSON.stringify(req.query)}`);
    try {
        const startTime = Date.now();
        
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found' });
        }

        console.log(`🔍 DOCTOR VALUES: Doctor ID: ${doctor._id}`);

        // --- UNIFIED FILTERING LOGIC (SAME AS ADMIN) ---
        const { 
            search, category, modality, priority, 
            customDateFrom, customDateTo, quickDatePreset, dateFilter, dateType = 'UploadDate'
        } = req.query;

        // 🔥 STEP 1: Determine the date range for filtering (SAME AS ADMIN)
        let filterStartDate = null;
        let filterEndDate = null;
        const IST_OFFSET = 5.5 * 60 * 60 * 1000;
        
        if (quickDatePreset || dateFilter === 'custom') {
            const now = Date.now();
            
            if (dateFilter === 'custom' && (customDateFrom || customDateTo)) {
                console.log(`📅 DOCTOR VALUES: Applying CUSTOM DATE filter from ${customDateFrom} to ${customDateTo} for ${dateType}`);
                
                if (customDateFrom) {
                    filterStartDate = new Date(customDateFrom);
                    filterStartDate.setHours(0, 0, 0, 0);
                }
                if (customDateTo) {
                    filterEndDate = new Date(customDateTo);
                    filterEndDate.setHours(23, 59, 59, 999);
                }
            } else if (quickDatePreset) {
                switch (quickDatePreset) {
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
                    case 'assignedToday':
                        filterStartDate = new Date();
                        filterStartDate.setHours(0, 0, 0, 0);
                        filterEndDate = new Date();
                        filterEndDate.setHours(23, 59, 59, 999);
                        break;
                }
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

        // 🔥 STEP 2: Build the core query. The structure changes based on whether a date filter is active (SAME AS ADMIN)
        let baseQuery;
        if (filterStartDate && filterEndDate) {
            console.log(`📅 DOCTOR VALUES: Applying DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()} on field: ${dateType}`);
            
            if (quickDatePreset === 'assignedToday') {
                // Use assignment date for "assigned today" filter
                baseQuery = {
                    $or: [
                        { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
                        { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
                    ]
                };
            } else {
                // Use study date or upload date based on dateType
                const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
                baseQuery = {
                    $or: [
                        { 'lastAssignedDoctor.doctorId': doctor._id },
                        { 'assignment.assignedTo': doctor._id }
                    ],
                    [dateField]: { $gte: filterStartDate, $lte: filterEndDate }
                };
            }
        } else {
            baseQuery = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctor._id },
                    { 'assignment.assignedTo': doctor._id }
                ]
            };
        }

        // 🔧 STEP 3: Combine the base query with all other query parameters
        let queryFilters = { ...baseQuery };

        if (search) {
            queryFilters.$text = { $search: search };
        }
        if (modality) {
            queryFilters.modality = modality;
        }
        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        console.log(`🔍 DOCTOR VALUES: Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 4: This single aggregation pipeline gets ALL the data we need efficiently
        const pipeline = [
            { $match: queryFilters },
            {
                $group: {
                    _id: {
                        $switch: {
                            branches: [
                                { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.pending] }, then: 'pending' },
                                { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.inprogress] }, then: 'inprogress' },
                                { case: { $in: ['$workflowStatus', DOCTOR_STATUS_CATEGORIES.completed] }, then: 'completed' },
                            ],
                            default: 'unknown'
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ];

        const categoryCountsResult = await DicomStudy.aggregate(pipeline).allowDiskUse(true);

        const counts = { pending: 0, inprogress: 0, completed: 0, total: 0 };

        categoryCountsResult.forEach(group => {
            if (counts.hasOwnProperty(group._id)) {
                counts[group._id] = group.count;
                counts.total += group.count;
            }
        });

        // Get unfiltered total for the 'All' tab
        const allStudiesCount = await DicomStudy.countDocuments({
             $or: [
                { 'lastAssignedDoctor.doctorId': doctor._id },
                { 'assignment.assignedTo': doctor._id }
            ]
        });

        const processingTime = Date.now() - startTime;
        console.log(`🎯 DOCTOR VALUES: Dashboard values calculated - Total: ${counts.total}, Pending: ${counts.pending}, InProgress: ${counts.inprogress}, Completed: ${counts.completed}`);

        const response = {
            success: true,
            all: allStudiesCount, // This is the unfiltered total for the "All" button
            total: counts.total,  // This is the total for the currently active filter set
            pending: counts.pending,
            inprogress: counts.inprogress,
            completed: counts.completed,
            performance: { queryTime: processingTime }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ DOCTOR VALUES: Error fetching dashboard values:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching dashboard statistics.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🔧 OPTIMIZED: startReport (same name, enhanced performance)
export const startReport = async (req, res) => {
    try {
        const { studyId } = req.params;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Single query with update
        const study = await DicomStudy.findOneAndUpdate(
            {
                _id: studyId,
                lastAssignedDoctor: doctor._id
            },
            {
                $set: {
                    workflowStatus: 'report_in_progress',
                    reportStartedAt: new Date()
                },
                $push: {
                    statusHistory: {
                        status: 'report_in_progress',
                        changedAt: new Date(),
                        changedBy: req.user._id,
                        note: 'Doctor started working on report'
                    }
                }
            },
            { new: true }
        );

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found or not assigned to you'
            });
        }

        res.json({
            success: true,
            message: 'Report started successfully'
        });

    } catch (error) {
        console.error('Error starting report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start report'
        });
    }
};

// 🔧 OPTIMIZED: submitReport (same name, enhanced performance)
export const submitReport = async (req, res) => {
    try {
        const { studyId } = req.params;
        const { reportContent, findings, impression, recommendations } = req.body;

        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 OPTIMIZED: Single atomic update
        const study = await DicomStudy.findOneAndUpdate(
            {
                _id: studyId,
                lastAssignedDoctor: doctor._id
            },
            {
                $set: {
                    reportContent: {
                        content: reportContent,
                        findings: findings,
                        impression: impression,
                        recommendations: recommendations,
                        finalizedBy: doctor._id,
                        finalizedAt: new Date()
                    },
                    workflowStatus: 'report_finalized',
                    reportFinalizedAt: new Date()
                },
                $push: {
                    statusHistory: {
                        status: 'report_finalized',
                        changedAt: new Date(),
                        changedBy: req.user._id,
                        note: 'Report finalized by doctor'
                    }
                }
            },
            { new: true }
        );

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found or not assigned to you'
            });
        }

        res.json({
            success: true,
            message: 'Report submitted successfully'
        });

    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit report'
        });
    }
};

// 🔧 OPTIMIZED: getDoctorStats (same name, enhanced performance)
export const getDoctorStats = async (req, res) => {
    try {
        // 🔧 PERFORMANCE: Find doctor with lean query
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        // 🔧 CRITICAL: Parallel aggregation queries for performance
        const [
            totalAssigned,
            pending,
            inProgress,
            completed,
            urgentStudies
        ] = await Promise.all([
            DicomStudy.countDocuments({ lastAssignedDoctor: doctor._id }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'assigned_to_doctor'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'report_in_progress'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                workflowStatus: 'report_finalized'
            }),
            DicomStudy.countDocuments({
                lastAssignedDoctor: doctor._id,
                caseType: { $in: ['URGENT', 'EMERGENCY'] },
                workflowStatus: { $in: ['assigned_to_doctor', 'report_in_progress'] }
            })
        ]);

        res.json({
            success: true,
            data: {
                totalAssigned,
                pending,
                inProgress,
                completed,
                urgentStudies,
                assignmentStats: doctor.assignmentStats || {}
            }
        });

    } catch (error) {
        console.error('Error fetching doctor stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctor statistics'
        });
    }
};

export const getPendingStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found' });
        }

        console.log(`🔍 DOCTOR PENDING: Fetching pending studies for doctor: ${doctor._id}`);

        const { 
            search, modality, priority, patientName, 
            customDateFrom, customDateTo, quickDatePreset, dateFilter, dateType = 'UploadDate'
        } = req.query;

        // 🔥 STEP 1: Date filtering logic (SAME AS getAssignedStudies)
        let filterStartDate = null;
        let filterEndDate = null;
        const IST_OFFSET = 5.5 * 60 * 60 * 1000; 
        
        if (quickDatePreset || dateFilter === 'custom') {
            const now = Date.now();
            
            if (dateFilter === 'custom' && (customDateFrom || customDateTo)) {
                console.log(`📅 DOCTOR PENDING: Applying CUSTOM DATE filter from ${customDateFrom} to ${customDateTo} for ${dateType}`);
                
                if (customDateFrom) {
                    filterStartDate = new Date(customDateFrom);
                    filterStartDate.setHours(0, 0, 0, 0);
                }
                if (customDateTo) {
                    filterEndDate = new Date(customDateTo);
                    filterEndDate.setHours(23, 59, 59, 999);
                }
            } else if (quickDatePreset) {
                switch (quickDatePreset) {
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
                    case 'assignedToday':
                        // Special filter for doctors - studies assigned today
                        filterStartDate = new Date();
                        filterStartDate.setHours(0, 0, 0, 0);
                        filterEndDate = new Date();
                        filterEndDate.setHours(23, 59, 59, 999);
                        break;
                }
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

        // 🔥 STEP 2: Build optimized core query (SAME AS getAssignedStudies)
        let baseQuery;
        if (filterStartDate && filterEndDate) {
            console.log(`📅 DOCTOR PENDING: Applying DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()} on field: ${dateType}`);
            
            if (quickDatePreset === 'assignedToday') {
                baseQuery = {
                    $or: [
                        { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
                        { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
                    ]
                };
            } else {
                const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
                baseQuery = {
                    $or: [
                        { 'lastAssignedDoctor.doctorId': doctor._id },
                        { 'assignment.assignedTo': doctor._id }
                    ],
                    [dateField]: { $gte: filterStartDate, $lte: filterEndDate }
                };
            }
        } else {
            baseQuery = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctor._id },
                    { 'assignment.assignedTo': doctor._id }
                ]
            };
        }

        // 🔥 STEP 3: Combine with pending status filter
        let queryFilters = { 
            ...baseQuery,
            workflowStatus: { $in: DOCTOR_STATUS_CATEGORIES.pending }
        };

        // Apply other filters
        if (search) {
            queryFilters.$text = { $search: search };
        }
        if (modality) {
            queryFilters.modality = modality;
        }
        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        console.log(`🔍 DOCTOR PENDING: Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // Continue with existing pipeline...
        const pipeline = [
            { $match: queryFilters },
            { $sort: { 'assignment.assignedAt': -1, createdAt: -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 1, studyInstanceUID: 1, orthancStudyID: 1, modalitiesInStudy: 1,
                    accessionNumber: 1, workflowStatus: 1, modality: 1, examDescription: 1, 
                    studyDescription: 1, seriesImages: 1, seriesCount: 1, instanceCount: 1,
                    studyDate: 1, studyTime: 1, createdAt: 1, ReportAvailable: 1,
                    clinicalHistory: 1, doctorReports: 1, caseType: 1, assignment: 1,
                    lastAssignedDoctor: 1, patient: 1, sourceLab: 1, age: 1, gender: 1,
                    preProcessedDownload: 1
                }
            },
            { 
                $lookup: { 
                    from: 'labs', localField: 'sourceLab', foreignField: '_id', as: 'sourceLab',
                    pipeline: [{ $project: { name: 1, identifier: 1 } }] 
                } 
            },
            { 
                $lookup: { 
                    from: 'patients', localField: 'patient', foreignField: '_id', as: 'patientData',
                    pipeline: [{ $project: { 
                        patientID: 1, firstName: 1, lastName: 1, patientNameRaw: 1, 
                        ageString: 1, gender: 1, 'computed.fullName': 1, 'clinicalInfo.clinicalHistory': 1 
                    }}] 
                } 
            },
            { $addFields: { sourceLab: { $arrayElemAt: ['$sourceLab', 0] }, currentCategory: 'pending' } },
            ...(patientName ? [{
                $match: { 
                    $or: [ 
                        { 'patientData.patientNameRaw': { $regex: patientName, $options: 'i' } }, 
                        { 'patientData.patientID': { $regex: patientName, $options: 'i' } } 
                    ] 
                }
            }] : [])
        ];

        // Rest of the function stays the same...
        console.log(`🚀 Executing optimized doctor pending studies query...`);
        const queryStart = Date.now();

        const countPipeline = patientName ? 
            [...pipeline.slice(0, -1), { $count: "total" }] : 
            [{ $match: queryFilters }, { $count: "total" }];

        const [studiesResult, totalResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            patientName ? 
                DicomStudy.aggregate(countPipeline).allowDiskUse(false) : 
                DicomStudy.countDocuments(queryFilters)
        ]);

        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }

        const studies = studiesResult.value;
        const totalStudies = totalResult.status === 'fulfilled' ? 
            (patientName ? (totalResult.value[0]?.total || 0) : totalResult.value) : 
            studies.length;

        const queryTime = Date.now() - queryStart;
        console.log(`📊 DOCTOR PENDING: Query results: Found ${studies.length} studies, total matching: ${totalStudies} (${queryTime}ms)`);

        // Format studies (same as existing)
        const formatStart = Date.now();
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patientData) && study.patientData.length > 0 ? 
                study.patientData[0] : null;
            const sourceLab = study.sourceLab;
            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                    study.preProcessedDownload?.zipUrl &&
                    (!study.preProcessedDownload?.zipExpiresAt || 
                     study.preProcessedDownload.zipExpiresAt > new Date());

            const assignmentData = (study.assignment && study.assignment.length > 0) ? 
                                   study.assignment[study.assignment.length - 1] : 
                                   (study.lastAssignedDoctor && study.lastAssignedDoctor.length > 0) ? 
                                   study.lastAssignedDoctor[study.lastAssignedDoctor.length - 1] : null;

            let patientDisplay = 'N/A';
            let patientIdDisplay = 'N/A';
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                `${study.age}/${study.gender}` : 
                                study.age || study.gender || 'N/A';

            if (patient) {
                patientDisplay = patient.computed?.fullName || patient.patientNameRaw || 'N/A';
                patientIdDisplay = patient.patientID || 'N/A';
            }

            const tat = study.calculatedTAT || calculateStudyTAT(study);

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientIdDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                description: study.examDescription || study.studyDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
                    study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: 'N/A',
                studyDateTime: study.studyDate && study.studyTime 
                    ? formatDicomDateTime(study.studyDate, study.studyTime)
                    : study.studyDate 
                        ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                            year: 'numeric', month: 'short', day: '2-digit'
                        })
                        : 'N/A',
                uploadDateTime: study.createdAt
                    ? new Date(study.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).replace(',', '')
                    : 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                    ? (() => {
                        const latestReport = study.doctorReports[study.doctorReports.length - 1];
                        const reportDate = latestReport.finalizedAt || latestReport.createdAt;
                        return reportDate ? new Date(reportDate) : null;
                    })()
                    : null,
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
                workflowStatus: study.workflowStatus,
                caseType: study.caseType || 'routine',
                currentCategory: study.currentCategory,
                tat: tat,
                totalTATDays: tat.totalTATDays,
                isOverdue: tat.isOverdue,
                tatPhase: tat.phase,
                priority: assignmentData?.priority || study.caseType?.toUpperCase() || 'NORMAL',
                assignedDate: assignmentData?.assignedAt,
                ReportAvailable: study.ReportAvailable || false,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || '',
            };
        });

        const formatTime = Date.now() - formatStart;
        const totalProcessingTime = Date.now() - startTime;

        console.log(`✅ DOCTOR PENDING: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 DOCTOR PENDING: Total processing time: ${totalProcessingTime}ms for ${formattedStudies.length} studies`);

        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
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
                }
            },
            summary: {
                byCategory: { all: totalStudies, pending: totalStudies, inprogress: 0, completed: 0 },
                urgentStudies: formattedStudies.filter(s => ['URGENT', 'EMERGENCY', 'STAT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: totalProcessingTime,
                recordsReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    formatting: formatTime,
                    totalProcessing: totalProcessingTime
                }
            }
        });

    } catch (error) {
        console.error('❌ DOCTOR PENDING: Error fetching pending studies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching pending studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 NEW: Get in-progress studies for doctor (studies being worked on)


export const getInProgressStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor profile not found' });
        }

        console.log(`🔍 DOCTOR IN-PROGRESS: Fetching in-progress studies for doctor: ${doctor._id}`);

        const { 
            search, modality, priority, patientName, 
            customDateFrom, customDateTo, quickDatePreset, dateFilter, dateType = 'UploadDate'
        } = req.query;

        // 🔥 STEP 1: Date filtering logic (SAME AS getAssignedStudies)
        let filterStartDate = null;
        let filterEndDate = null;
        const IST_OFFSET = 5.5 * 60 * 60 * 1000; 
        
        if (quickDatePreset || dateFilter === 'custom') {
            const now = Date.now();
            
            if (dateFilter === 'custom' && (customDateFrom || customDateTo)) {
                console.log(`📅 DOCTOR IN-PROGRESS: Applying CUSTOM DATE filter from ${customDateFrom} to ${customDateTo} for ${dateType}`);
                
                if (customDateFrom) {
                    filterStartDate = new Date(customDateFrom);
                    filterStartDate.setHours(0, 0, 0, 0);
                }
                if (customDateTo) {
                    filterEndDate = new Date(customDateTo);
                    filterEndDate.setHours(23, 59, 59, 999);
                }
            } else if (quickDatePreset) {
                switch (quickDatePreset) {
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
                    case 'assignedToday':
                        // Special filter for doctors - studies assigned today
                        filterStartDate = new Date();
                        filterStartDate.setHours(0, 0, 0, 0);
                        filterEndDate = new Date();
                        filterEndDate.setHours(23, 59, 59, 999);
                        break;
                }
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

        // 🔥 STEP 2: Build optimized core query (SAME AS getAssignedStudies)
        let baseQuery;
        if (filterStartDate && filterEndDate) {
            console.log(`📅 DOCTOR IN-PROGRESS: Applying DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()} on field: ${dateType}`);
            
            if (quickDatePreset === 'assignedToday') {
                baseQuery = {
                    $or: [
                        { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
                        { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
                    ]
                };
            } else {
                const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
                baseQuery = {
                    $or: [
                        { 'lastAssignedDoctor.doctorId': doctor._id },
                        { 'assignment.assignedTo': doctor._id }
                    ],
                    [dateField]: { $gte: filterStartDate, $lte: filterEndDate }
                };
            }
        } else {
            baseQuery = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctor._id },
                    { 'assignment.assignedTo': doctor._id }
                ]
            };
        }

        // 🔥 STEP 3: Combine with in-progress status filter
        let queryFilters = { 
            ...baseQuery,
            workflowStatus: { $in: DOCTOR_STATUS_CATEGORIES.inprogress }
        };

        // Apply other filters
        if (search) {
            queryFilters.$text = { $search: search };
        }
        if (modality) {
            queryFilters.modality = modality;
        }
        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        console.log(`🔍 DOCTOR IN-PROGRESS: Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // Continue with existing pipeline logic...
        const pipeline = [
            { $match: queryFilters },
            { $sort: { 'reportInfo.startedAt': -1, createdAt: -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 1, orthancStudyID: 1, studyInstanceUID: 1, accessionNumber: 1,
                    workflowStatus: 1, modalitiesInStudy: 1, modality: 1, examDescription: 1, 
                    studyDescription: 1, seriesCount: 1, instanceCount: 1, seriesImages: 1, 
                    studyDate: 1, studyTime: 1, createdAt: 1, caseType: 1, 'assignment.priority': 1,
                    doctorReports: 1, ReportAvailable: 1, 'assignment.assignedAt': 1, 
                    lastAssignedDoctor: 1, 'reportInfo.startedAt': 1, patient: 1, sourceLab: 1, 
                    patientInfo: 1, age: 1, gender: 1, clinicalHistory: 1, preProcessedDownload: 1
                }
            },
            { 
                $lookup: { 
                    from: 'labs', localField: 'sourceLab', foreignField: '_id', as: 'sourceLab',
                    pipeline: [{ $project: { name: 1, identifier: 1 } }] 
                } 
            },
            { 
                $lookup: { 
                    from: 'patients', localField: 'patient', foreignField: '_id', as: 'patientData',
                    pipeline: [{ $project: { 
                        patientID: 1, firstName: 1, lastName: 1, patientNameRaw: 1, 
                        ageString: 1, gender: 1, 'computed.fullName': 1, 'clinicalInfo.clinicalHistory': 1 
                    }}] 
                } 
            },
            { $addFields: { sourceLab: { $arrayElemAt: ['$sourceLab', 0] }, currentCategory: 'inprogress' } },
            ...(patientName ? [{
                $match: { 
                    $or: [ 
                        { 'patientData.patientNameRaw': { $regex: patientName, $options: 'i' } }, 
                        { 'patientData.patientID': { $regex: patientName, $options: 'i' } } 
                    ] 
                }
            }] : [])
        ];

        // Execute query and format results (same as existing)...
        console.log(`🚀 Executing optimized doctor in-progress studies query...`);
        const queryStart = Date.now();

        const countPipeline = patientName ? 
            [...pipeline.slice(0, -1), { $count: "total" }] : 
            [{ $match: queryFilters }, { $count: "total" }];

        const [studiesResult, totalResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            patientName ? 
                DicomStudy.aggregate(countPipeline).allowDiskUse(false) : 
                DicomStudy.countDocuments(queryFilters)
        ]);

        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }

        const studies = studiesResult.value;
        const totalStudies = totalResult.status === 'fulfilled' ? 
            (patientName ? (totalResult.value[0]?.total || 0) : totalResult.value) : 
            studies.length;

        const queryTime = Date.now() - queryStart;
        console.log(`📊 DOCTOR IN-PROGRESS: Query results: Found ${studies.length} studies, total matching: ${totalStudies} (${queryTime}ms)`);

        // Format studies (same formatting as existing)
        const formatStart = Date.now();
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patientData) && study.patientData.length > 0 ? 
                study.patientData[0] : null;
            const sourceLab = study.sourceLab;
            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                    study.preProcessedDownload?.zipUrl &&
                    (!study.preProcessedDownload?.zipExpiresAt || 
                     study.preProcessedDownload.zipExpiresAt > new Date());

            const assignmentData = (study.assignment?.length > 0) ? 
                study.assignment[study.assignment.length - 1] : 
                (study.lastAssignedDoctor?.length > 0) ? 
                study.lastAssignedDoctor[study.lastAssignedDoctor.length - 1] : null;

            let patientDisplay = "N/A";
            let patientIdForDisplay = "N/A";
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                `${study.age}/${study.gender}` : 
                                study.age || study.gender || 'N/A';

            if (patient) {
                patientDisplay = patient.computed?.fullName || patient.patientNameRaw || "N/A";
                patientIdForDisplay = patient.patientID || "N/A";
            }

            const tat = study.calculatedTAT || calculateStudyTAT(study);

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientIdForDisplay,
                patientName: patientDisplay,
                ageGender: patientAgeGenderDisplay,
                description: study.examDescription || study.studyDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
                    study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: 'N/A', 
                studyDateTime: study.studyDate && study.studyTime 
                    ? formatDicomDateTime(study.studyDate, study.studyTime)
                    : study.studyDate 
                        ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                            year: 'numeric', month: 'short', day: '2-digit'
                        })
                        : 'N/A',
                uploadDateTime: study.createdAt
                    ? new Date(study.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).replace(',', '')
                    : 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                    ? (() => {
                        const latestReport = study.doctorReports.reduce((latest, curr) =>
                            new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                            study.doctorReports[0]
                        );
                        const dt = new Date(latestReport.uploadedAt);
                        return dt.toLocaleString('en-GB', {
                            year: 'numeric',
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        }).replace(',', '');
                    })()
                    : null,
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
                workflowStatus: study.workflowStatus,
                caseType: study.caseType || 'routine',
                currentCategory: study.currentCategory,
                tat: tat,
                totalTATDays: tat.totalTATDays,
                isOverdue: tat.isOverdue,
                tatPhase: tat.phase,
                priority: assignmentData?.priority || 'NORMAL',
                assignedDate: assignmentData?.assignedAt,
                reportStartedAt: study.reportInfo?.startedAt,
                reportFinalizedAt: study.reportInfo?.finalizedAt,
                ReportAvailable: study.ReportAvailable || false,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || ''
            };
        });

        const formatTime = Date.now() - formatStart;
        const totalProcessingTime = Date.now() - startTime;

        console.log(`✅ DOCTOR IN-PROGRESS: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 DOCTOR IN-PROGRESS: Total processing time: ${totalProcessingTime}ms for ${formattedStudies.length} studies`);

        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
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
                }
            },
            summary: {
                byCategory: { all: totalStudies, pending: 0, inprogress: totalStudies, completed: 0 },
                urgentStudies: formattedStudies.filter(s => ['URGENT', 'EMERGENCY', 'STAT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: totalProcessingTime,
                recordsReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    formatting: formatTime,
                    totalProcessing: totalProcessingTime
                }
            }
        });

    } catch (error) {
        console.error('❌ DOCTOR IN-PROGRESS: Error fetching in-progress studies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching in-progress studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
// 🆕 NEW: Get completed studies for doctor (reports finalized)
export const getCompletedStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        console.log(`🔍 DOCTOR COMPLETED: Fetching completed studies for doctor: ${doctor._id}`);

        const { 
            search, modality, labId, priority, patientName, 
            quickDatePreset, customDateFrom, customDateTo
        } = req.query;

        // --- OPTIMIZED FILTERING LOGIC ---

        // 🔥 STEP 1: Build the base query for the doctor's completed studies with optimized date handling
        let queryFilters = {
            $or: [
                { 'lastAssignedDoctor.doctorId': doctor._id },
                { 'assignment.assignedTo': doctor._id }
            ],
            workflowStatus: { $in: DOCTOR_STATUS_CATEGORIES.completed }
        };

        // 🔥 STEP 2: Optimized date filtering with pre-calculated timestamps
        let filterStartDate = null;
        let filterEndDate = null;
        const now = new Date();
if (quickDatePreset) {
    switch (quickDatePreset) {
        case '24h':
        case 'last24h':
            filterStartDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            filterEndDate = now;
            break;
        case 'today':
        case 'assignedToday':
            const today = new Date();
            filterStartDate = new Date(today.setHours(0, 0, 0, 0));
            filterEndDate = new Date(today.setHours(23, 59, 59, 999));
            break;
        case 'yesterday':
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            filterStartDate = new Date(yesterday.setHours(0, 0, 0, 0));
            filterEndDate = new Date(yesterday.setHours(23, 59, 59, 999));
            break;
        case 'week':
        case 'thisWeek':
            filterStartDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            filterEndDate = now;
            break;
        case 'month':
        case 'thisMonth':
            filterStartDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            filterEndDate = now;
            break;
        case 'custom':
            filterStartDate = customDateFrom ? new Date(customDateFrom + 'T00:00:00Z') : null;
            filterEndDate = customDateTo ? new Date(customDateTo + 'T23:59:59Z') : null;
            break;
    }
} else {
    // 🔧 FIX: Default to today when no date filter specified (SAME as admin)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    filterStartDate = todayStart;
    filterEndDate = new Date(todayStart.getTime() + 86399999);
}

if (filterStartDate || filterEndDate) {
    const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
    queryFilters[dateField] = {};
    if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
    if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
}

// 🔧 FIX: Build the core query with date filtering (SAME as getValues)
let baseQuery;
if (filterStartDate && filterEndDate) {
    console.log(`📅 DOCTOR COMPLETED: Applying ASSIGNMENT DATE filter from ${filterStartDate.toISOString()} to ${filterEndDate.toISOString()}`);
    baseQuery = {
        $or: [
            { lastAssignedDoctor: { $elemMatch: { doctorId: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } },
            { assignment: { $elemMatch: { assignedTo: doctor._id, assignedAt: { $gte: filterStartDate, $lte: filterEndDate } } } }
        ]
    };
} else {
    baseQuery = {
        $or: [
            { 'lastAssignedDoctor.doctorId': doctor._id },
            { 'assignment.assignedTo': doctor._id }
        ]
    };
}

// 🔧 FIX: Combine base query with status filter
queryFilters = { 
    ...baseQuery,
    workflowStatus: { $in: DOCTOR_STATUS_CATEGORIES.completed }
};



        // 🔧 STEP 3: Optimized other filters with better type handling
        if (search) {
            // Use optimized search with multiple fields
            queryFilters.$and = queryFilters.$and || [];
            queryFilters.$and.push({
                $or: [
                    { $text: { $search: search } },
                    { accessionNumber: { $regex: search, $options: 'i' } },
                    { studyInstanceUID: { $regex: search, $options: 'i' } }
                ]
            });
        }
        
        if (modality) {
            queryFilters.modality = modality;
        }
        
        if (labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(labId);
        }
        
        if (priority) {
            queryFilters['assignment.priority'] = priority;
        }

        console.log(`🔍 DOCTOR COMPLETED: Query filters:`, JSON.stringify(queryFilters, null, 2));

        // 🔥 STEP 4: Ultra-optimized aggregation pipeline
        const queryStart = Date.now();
        
        const pipeline = [
            // 🔥 CRITICAL: Start with most selective match first
            { $match: queryFilters },
            
            // 🔥 PERFORMANCE: Sort before project to use index efficiently
            { $sort: { 'reportInfo.finalizedAt': -1, createdAt: -1 } },
            
            // 🔥 CRITICAL: Limit early to reduce pipeline processing
            { $limit: Math.min(limit, 1000) },
            
            // 🔥 PERFORMANCE: Project only essential fields after limiting
            {
                $project: {
                    _id: 1,
                    orthancStudyID: 1,
                    studyInstanceUID: 1,
                    accessionNumber: 1,
                    examDescription: 1,
                    modalitiesInStudy: 1,
                    studyDescription: 1,
                    modality: 1,
                    seriesImages: 1,
                    seriesCount: 1,
                    instanceCount: 1,
                    studyDate: 1,
                    studyTime: 1,
                    workflowStatus: 1,
                    createdAt: 1,
                    caseType: 1,
                    ReportAvailable: 1,
                    doctorReports: 1,
                    'assignment.priority': 1,
                    'assignment.assignedAt': 1,
                    lastAssignedDoctor: 1,
                    'reportInfo.startedAt': 1,
                    'reportInfo.finalizedAt': 1,
                    'reportInfo.reporterName': 1,
                    patient: 1,
                    sourceLab: 1,
                    patientInfo: 1, // Keep for fallback
                    age: 1,
                    gender: 1,
                    clinicalHistory: 1,
                    preProcessedDownload: 1
                }
            },
            
            // 🔥 OPTIMIZATION: Add currentCategory field efficiently
            { $addFields: { currentCategory: 'completed' } }
        ];

        // 🔥 STEP 5: Execute optimized parallel queries with better error handling
        console.log(`🚀 Executing optimized query...`);
        
        // Build count pipeline efficiently
        const countPipeline = [
            { $match: queryFilters },
            { $count: "total" }
        ];

        // Use Promise.allSettled for better error handling
        const [studiesResult, totalCountResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false), // Disable disk use for better performance
            patientName ? 
                DicomStudy.aggregate([
                    ...countPipeline.slice(0, -1),
                    // Add patient name filtering to count pipeline if needed
                    { $lookup: { from: 'patients', localField: 'patient', foreignField: '_id', as: 'patientData' } },
                    { $match: { 
                        $or: [ 
                            { 'patientInfo.patientName': { $regex: patientName, $options: 'i' } }, 
                            { 'patientInfo.patientID': { $regex: patientName, $options: 'i' } },
                            { 'patientData.patientNameRaw': { $regex: patientName, $options: 'i' } },
                            { 'patientData.patientID': { $regex: patientName, $options: 'i' } }
                        ] 
                    }},
                    { $count: "total" }
                ]).allowDiskUse(false) :
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
        const totalCountValue = totalCountResult.status === 'fulfilled' ? totalCountResult.value : studies.length;
        const totalStudies = patientName ? (Array.isArray(totalCountValue) && totalCountValue[0]?.total || 0) : totalCountValue;

        const queryTime = Date.now() - queryStart;
        console.log(`⚡ Core query completed in ${queryTime}ms - found ${studies.length} studies`);

        // 🔥 STEP 6: Optimized batch lookups with connection pooling awareness
        const lookupMaps = {
            patients: new Map(),
            labs: new Map()
        };

        if (studies.length > 0) {
            const lookupStart = Date.now();
            
            // Extract unique IDs with Set for deduplication
            const uniqueIds = {
                patients: [...new Set(studies.map(s => s.patient?.toString()).filter(Boolean))],
                labs: [...new Set(studies.map(s => s.sourceLab?.toString()).filter(Boolean))]
            };

            // 🔥 PARALLEL: Optimized batch lookups with lean queries
            const lookupPromises = [];

            if (uniqueIds.patients.length > 0) {
                lookupPromises.push(
                    mongoose.model('Patient')
                        .find({ _id: { $in: uniqueIds.patients.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('patientID patientNameRaw gender ageString computed.fullName clinicalInfo.clinicalHistory')
                        .lean()
                        .then(results => ({ type: 'patients', data: results }))
                );
            }

            if (uniqueIds.labs.length > 0) {
                lookupPromises.push(
                    mongoose.model('Lab')
                        .find({ _id: { $in: uniqueIds.labs.map(id => new mongoose.Types.ObjectId(id)) } })
                        .select('name')
                        .lean()
                        .then(results => ({ type: 'labs', data: results }))
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

        // 🔥 STEP 7: Apply patient name filtering after lookups (if specified)
        let filteredStudies = studies;
        if (patientName) {
            filteredStudies = studies.filter(study => {
                const patient = lookupMaps.patients.get(study.patient?.toString());
                const patientInfo = study.patientInfo;
                
                const searchRegex = new RegExp(patientName, 'i');
                
                return (
                    // Check populated patient data
                    (patient && (
                        searchRegex.test(patient.computed?.fullName || '') ||
                        searchRegex.test(patient.patientNameRaw || '') ||
                        searchRegex.test(patient.patientID || '')
                    )) ||
                    // Check embedded patient info as fallback
                    (patientInfo && (
                        searchRegex.test(patientInfo.patientName || '') ||
                        searchRegex.test(patientInfo.patientID || '')
                    ))
                );
            });
        }

        // 🔥 STEP 8: Optimized formatting with pre-compiled maps
        const formatStart = Date.now();
        
        const formattedStudies = filteredStudies.map(study => {
            // Get related data from maps (faster than repeated lookups)
            const patient = lookupMaps.patients.get(study.patient?.toString()) || study.patientInfo;
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());
            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                        study.preProcessedDownload?.zipUrl &&
                        (!study.preProcessedDownload?.zipExpiresAt || 
                         study.preProcessedDownload.zipExpiresAt > new Date());
            
            // Handle assignment data efficiently
            const assignmentData = (study.assignment && study.assignment.length > 0) ? 
                                   study.assignment[study.assignment.length - 1] : 
                                   (study.lastAssignedDoctor && study.lastAssignedDoctor.length > 0) ? 
                                   study.lastAssignedDoctor[study.lastAssignedDoctor.length - 1] : null;

            // Optimized patient display building
            const patientName = patient?.computed?.fullName || patient?.patientNameRaw || 'N/A';
            const patientId = patient?.patientID || 'N/A';
            const patientAgeGenderDisplay = study.age && study.gender ? 
                                `${study.age}/${study.gender}` : 
                                study.age || study.gender || 'N/A';

            // Optimized date formatting
            const studyDateTime = study.studyDate && study.studyTime ? 
                                 `${new Date(study.studyDate).toLocaleDateString()} ${study.studyTime.substring(0, 6)}` : 
                                 (study.studyDate ? new Date(study.studyDate).toLocaleDateString() : 'N/A');

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                instanceID: study.studyInstanceUID,
                accessionNumber: study.accessionNumber,
                patientId: patientId,
                patientName: patientName,
                ageGender: patientAgeGenderDisplay,
                description: study.examDescription || study.studyDescription || 'N/A',
                modality: study.modalitiesInStudy?.length > 0 ? 
         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: 'N/A', 
                studyDateTime: study.studyDate && study.studyTime 
                ? formatDicomDateTime(study.studyDate, study.studyTime)
                : study.studyDate 
                    ? new Date(study.studyDate).toLocaleDateString('en-GB', {
                        year: 'numeric', month: 'short', day: '2-digit'
                    })
                    : 'N/A',
                
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
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    // Use the latest uploadedAt if multiple reports
                    const latestReport = study.doctorReports.reduce((latest, curr) =>
                        new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                        study.doctorReports[0]
                    );
                    const dt = new Date(latestReport.uploadedAt);
                    // Format: 15 Jun 2025 03:30
                    return dt.toLocaleString('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).replace(',', '');
                })()
                : null,

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
                workflowStatus: study.workflowStatus,
                clinicalHistory: study?.clinicalHistory?.clinicalHistory || patient?.clinicalInfo?.clinicalHistory || '',
                currentCategory: study.currentCategory,
                createdAt: study.createdAt,
                priority: assignmentData?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                assignedDate: assignmentData?.assignedAt,
                reportStartedAt: study.reportInfo?.startedAt,
                reportFinalizedAt: study.reportInfo?.finalizedAt,
                reportedBy: study.reportInfo?.reporterName || 'N/A',
                ReportAvailable: study.ReportAvailable || true // A completed report is available
            };
        });

        const formatTime = Date.now() - formatStart;
        const processingTime = Date.now() - startTime;

        console.log(`✅ DOCTOR COMPLETED: Formatting completed in ${formatTime}ms`);
        console.log(`🎯 DOCTOR COMPLETED: Total processing time: ${processingTime}ms for ${formattedStudies.length} studies`);

        // Enhanced response with performance metrics
        res.status(200).json({
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
                hasNextPage: (1 * limit) < totalStudies,
                hasPrevPage: false,
                recordRange: { start: 1, end: Math.min(formattedStudies.length, totalStudies) },
                isSinglePage: totalStudies <= limit
            },
            summary: {
                byCategory: { all: totalStudies, pending: 0, inprogress: 0, completed: totalStudies },
                urgentStudies: formattedStudies.filter(s => ['URGENT', 'EMERGENCY', 'STAT'].includes(s.priority)).length,
                total: totalStudies
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    lookups: studies.length > 0 ? `${Date.now() - formatStart}ms` : 0,
                    formatting: formatTime
                }
            }
        });

    } catch (error) {
        console.error('❌ DOCTOR COMPLETED: Error fetching completed studies:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching completed studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getCurrentDoctorProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('🔍 Fetching doctor profile for user:', userId);
    
    const doctor = await Doctor.findOne({ userAccount: userId })
      .populate('userAccount', 'fullName email username')
      .lean();
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }
    
    // Format response with signature
    const doctorProfile = {
      _id: doctor._id,
      fullName: doctor.userAccount.fullName,
      email: doctor.userAccount.email,
      username: doctor.userAccount.username,
      specialization: doctor.specialization,
      licenseNumber: doctor.licenseNumber,
      department: doctor.department,
      qualifications: doctor.qualifications,
      yearsOfExperience: doctor.yearsOfExperience,
      contactPhoneOffice: doctor.contactPhoneOffice,
      signature: doctor.signature, // Base64 signature
      signatureMetadata: doctor.signatureMetadata,
      isActive: doctor.isActiveProfile && doctor.userAccount.isActive
    };
    
    console.log('✅ Doctor profile found:', {
      name: doctorProfile.fullName,
      specialization: doctorProfile.specialization,
      hasSignature: !!doctorProfile.signature
    });
    
    res.json({
      success: true,
      doctor: doctorProfile
    });
    
  } catch (error) {
    console.error('❌ Error fetching doctor profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor profile',
      error: error.message
    });
  }
}






//     getAssignedStudies,
//     getPatientDetailedViewForDoctor,
//     startReport,
//     submitReport,
//     getDoctorStats
// };