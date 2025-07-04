import Patient from '../models/patientModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';


// 🔧 PERFORMANCE: Add caching for frequent queries
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

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


// 🔧 OPTIMIZED: getPatientDetailedViewForLab (same name, enhanced performance)
export const getPatientDetailedViewForLab = async (req, res) => {
    try {
        const { id: patientId } = req.params;
        const cacheKey = `patient_detail_lab_${patientId}`;
        
        // 🔧 PERFORMANCE: Check cache first
        let cachedData = cache.get(cacheKey);
        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                fromCache: true
            });
        }

        // 🔧 OPTIMIZED: Use lean queries for better performance
        const patient = await Patient.findOne({ patientID: patientId })
            .populate('clinicalInfo.lastModifiedBy', 'fullName')
            .lean();

        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 PERFORMANCE: Parallel study queries
        const [allStudies, activeStudy] = await Promise.all([
            DicomStudy.find({ patientId: patientId })
                .populate('sourceLab', 'name identifier')
                .populate('lastAssignedDoctor', 'specialization userAccount')
                .populate('lastAssignedDoctor.userAccount', 'fullName')
                .sort({ studyDate: -1 })
                .lean(),
            DicomStudy.findById(patient.activeDicomStudyRef)
                .populate('sourceLab', 'name')
                .lean()
        ]);

        // 🔧 OPTIMIZED: Format studies efficiently
        const formattedStudies = allStudies.map(study => ({
            _id: study._id,
            studyInstanceUID: study.studyInstanceUID,
            accessionNumber: study.accessionNumber || 'N/A',
            studyDateTime: study.studyDate
                ? new Date(study.studyDate).toLocaleString('en-GB', {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).replace(',', '')
                : 'N/A',
                studyDate: study.studyDate,
            modality: study.modality || 'N/A',
            description: study.examDescription || study.studyDescription || 'N/A',
            workflowStatus: study.workflowStatus,
            priority: study.caseType || 'ROUTINE',
            location: study.sourceLab?.name || 'N/A',
            assignedDoctor: study.lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
            reportFinalizedAt: study.reportFinalizedAt
        }));

        const responseData = {
            patientInfo: {
                patientID: patient.patientID,
                patientId: patient.patientID,
                firstName: patient.firstName || '',
                lastName: patient.lastName || '',
                fullName: patient.computed?.fullName || 
                         `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
                age: patient.ageString || '',
                gender: patient.gender || '',
                dateOfBirth: patient.dateOfBirth || '',
                contactNumber: patient.contactInformation?.phone || '',
                email: patient.contactInformation?.email || '',
                address: patient.address || '',
                salutation: patient.salutation || '',
                mrn: patient.mrn || ''
            },
            
            clinicalInfo: {
                clinicalHistory: patient.clinicalInfo?.clinicalHistory || '',
                previousInjury: patient.clinicalInfo?.previousInjury || '',
                previousSurgery: patient.clinicalInfo?.previousSurgery || '',
                lastModifiedBy: patient.clinicalInfo?.lastModifiedBy?.fullName || '',
                lastModifiedAt: patient.clinicalInfo?.lastModifiedAt || ''
            },
            
            medicalHistory: patient.medicalHistory || {
                clinicalHistory: '',
                previousInjury: '',
                previousSurgery: ''
            },
            
            referralInfo: patient.referralInfo || '',
            studies: formattedStudies,
            
            studyInfo: activeStudy ? {
                accessionNumber: activeStudy.accessionNumber,
                workflowStatus: activeStudy.workflowStatus,
                caseType: activeStudy.caseType,
                images: []
            } : {},
            
            visitInfo: activeStudy ? {
                examDescription: activeStudy.examDescription,
                center: activeStudy.sourceLab?.name || 'Default Lab',
                studyDate: activeStudy.studyDate,
                caseType: activeStudy.caseType,
                examType: activeStudy.examType
            } : {},
            
            documents: [...(patient.attachments || []), ...(patient.documents || [])]
        };

        // 🔧 PERFORMANCE: Cache the result
        cache.set(cacheKey, responseData, 180); // 3 minutes

        res.json({
            success: true,
            data: responseData,
            fromCache: false
        });

    } catch (error) {
        console.error('Error fetching patient details for lab:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🔧 OPTIMIZED: updatePatientInfo (same name, enhanced performance)
export const updatePatientInfo = async (req, res) => {
    try {
        const { id: patientId } = req.params;
        const updateData = req.body;
        const startTime = Date.now();

        // 🔧 PERFORMANCE: Use lean query for initial lookup
        const patient = await Patient.findOne({ patientID: patientId }).lean();
        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }

        // 🔧 OPTIMIZED: Build update object efficiently
        const patientUpdateData = {};

        // Handle patient info updates
        if (updateData.patientInfo) {
            const allowedFields = ['firstName', 'lastName', 'age', 'gender', 'dateOfBirth', 'salutation'];
            allowedFields.forEach(field => {
                if (updateData.patientInfo[field] !== undefined) {
                    if (field === 'age') {
                        patientUpdateData.ageString = updateData.patientInfo[field];
                    } else {
                        patientUpdateData[field] = updateData.patientInfo[field];
                    }
                }
            });

            // Handle contact information
            if (updateData.patientInfo.contactNumber || updateData.patientInfo.email) {
                patientUpdateData.contactInformation = {
                    phone: updateData.patientInfo.contactNumber || patient.contactInformation?.phone || '',
                    email: updateData.patientInfo.email || patient.contactInformation?.email || ''
                };
            }

            if (updateData.patientInfo.address !== undefined) {
                patientUpdateData.address = updateData.patientInfo.address;
            }
        }

        // Handle clinical information with optimized structure
        if (updateData.clinicalInfo) {
            patientUpdateData.clinicalInfo = {
                ...patient.clinicalInfo,
                clinicalHistory: updateData.clinicalInfo.clinicalHistory || '',
                previousInjury: updateData.clinicalInfo.previousInjury || '',
                previousSurgery: updateData.clinicalInfo.previousSurgery || '',
                lastModifiedBy: req.user._id,
                lastModifiedAt: new Date()
            };

            // Update denormalized medical history
            patientUpdateData.medicalHistory = {
                clinicalHistory: patientUpdateData.clinicalInfo.clinicalHistory,
                previousInjury: patientUpdateData.clinicalInfo.previousInjury,
                previousSurgery: patientUpdateData.clinicalInfo.previousSurgery
            };
        }

        if (updateData.referralInfo !== undefined) {
            patientUpdateData.referralInfo = updateData.referralInfo;
        }

        // 🔧 PERFORMANCE: Single atomic update
        const updatedPatient = await Patient.findOneAndUpdate(
            { patientID: patientId },
            { $set: patientUpdateData },
            { new: true, lean: true }
        );

        // 🔧 PERFORMANCE: Update related studies only if necessary
        if (updateData.clinicalInfo || updateData.studyInfo) {
            const studyUpdateData = {};
            
            if (updateData.clinicalInfo?.clinicalHistory) {
                studyUpdateData.clinicalHistory = updateData.clinicalInfo.clinicalHistory;
            }
            if (updateData.studyInfo?.workflowStatus) {
                studyUpdateData.workflowStatus = updateData.studyInfo.workflowStatus;
            }
            if (updateData.studyInfo?.caseType) {
                studyUpdateData.caseType = updateData.studyInfo.caseType;
            }

            if (Object.keys(studyUpdateData).length > 0) {
                await DicomStudy.updateMany(
                    { patient: patient._id },
                    { $set: studyUpdateData }
                );
            }
        }

        // 🔧 PERFORMANCE: Clear cache
        cache.del(`patient_detail_lab_${patientId}`);

        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            message: 'Patient information updated successfully',
            data: {
                patientId: updatedPatient.patientID,
                updatedFields: Object.keys(patientUpdateData)
            },
            performance: {
                processingTimeMs: processingTime
            }
        });

    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update patient',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// export {
//     getAllStudiesForLab,
//     getPatientDetailedViewForLab,
//     updatePatientInfo
// };


// 🔧 PERFORMANCE: Add caching for frequent queries

// 🔧 ENHANCED: getAllStudiesForLab - Single page mode with date filtering (matching admin/doctor)
export const getAllStudiesForLab = async (req, res) => {
    console.log(`🔍 LAB: Fetching studies with query: ${JSON.stringify(req.query)}`);
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 20;
        
        console.log(`📊 LAB: Fetching ${limit} studies in single page mode`);

        // 🆕 ENHANCED: Extract all filter parameters including date filters (matching admin/doctor)
        const { 
            search, status, category, modality, labId, 
            startDate, endDate, priority, patientName, 
            dateRange, dateType = 'createdAt',
            // 🆕 NEW: Additional date filter parameters
            dateFilter, // 'today', 'yesterday', 'thisWeek', 'thisMonth', 'thisYear', 'custom'
            customDateFrom,
            customDateTo,
            quickDatePreset
        } = req.query;

        // Build filters
        const queryFilters = {};
        
        // 🔧 LAB SPECIFIC: Lab filtering with optimized lookup
        if (req.user.role === 'lab_staff' && req.user.lab) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.user.lab._id);
            console.log(`🏢 LAB: Filtering by lab: ${req.user.lab._id}`);
        }

        // 🔧 FIXED: Smart date filtering logic with proper date handling (matching admin/doctor)
        let shouldApplyDateFilter = true;
        let filterStartDate = null;
        let filterEndDate = null;
        
        // Handle quick date presets first
        if (quickDatePreset || dateFilter) {
            const preset = quickDatePreset || dateFilter;
            const now = new Date();
            
            console.log(`📅 LAB: Processing date preset: ${preset}`);
            
            switch (preset) {
                case 'last24h':
                    // Last 24 hours from now
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    console.log(`📅 LAB: Applying LAST 24H filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'today':
                    // Today from midnight to now
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    console.log(`📅 LAB: Applying TODAY filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'yesterday':
                    // Yesterday full day
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    filterStartDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    console.log(`📅 LAB: Applying YESTERDAY filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'thisWeek':
                    // This week from Sunday to now
                    const weekStart = new Date(now);
                    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    weekStart.setDate(now.getDate() - dayOfWeek);
                    weekStart.setHours(0, 0, 0, 0);
                    filterStartDate = weekStart;
                    filterEndDate = now;
                    console.log(`📅 LAB: Applying THIS WEEK filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'thisMonth':
                    // This month from 1st to now
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    console.log(`📅 LAB: Applying THIS MONTH filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'thisYear':
                    // This year from January 1st to now
                    filterStartDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    console.log(`📅 LAB: Applying THIS YEAR filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'custom':
                    if (customDateFrom || customDateTo) {
                        filterStartDate = customDateFrom ? new Date(customDateFrom + 'T00:00:00') : null;
                        filterEndDate = customDateTo ? new Date(customDateTo + 'T23:59:59') : null;
                        console.log(`📅 LAB: Applying CUSTOM filter: ${filterStartDate} to ${filterEndDate}`);
                    } else {
                        shouldApplyDateFilter = false;
                        console.log(`📅 LAB: Custom date preset selected but no dates provided`);
                    }
                    break;
                    
                default:
                    shouldApplyDateFilter = false;
                    console.log(`📅 LAB: Unknown preset: ${preset}, no date filter applied`);
            }
        }
        // Handle legacy startDate/endDate parameters
        else if (startDate || endDate) {
            filterStartDate = startDate ? new Date(startDate + 'T00:00:00') : null;
            filterEndDate = endDate ? new Date(endDate + 'T23:59:59') : null;
            console.log(`📅 LAB: Applied legacy date filter: ${filterStartDate} to ${filterEndDate}`);
        }
        // 🔧 FIXED: Default 24-hour filter logic for lab studies
        else {
            const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
            filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
            filterEndDate = now;
            console.log(`📅 LAB: Applying default ${hoursBack}-hour filter: ${filterStartDate} to ${filterEndDate}`);
        }

        // 🔧 FIXED: Apply the date filter with proper field mapping
        if (shouldApplyDateFilter && (filterStartDate || filterEndDate)) {
            // Map dateType to the correct database field
            let dateField;
            switch (dateType) {
                case 'StudyDate':
                    dateField = 'studyDate';
                    break;
                case 'UploadDate':
                    dateField = 'createdAt';
                    break;
                case 'DOB':
                    // This would need to be applied to patient data, not study data
                    dateField = 'createdAt'; // Fallback to upload date
                    break;
                default:
                    dateField = 'createdAt';
            }
            
            queryFilters[dateField] = {};
            if (filterStartDate) {
                queryFilters[dateField].$gte = filterStartDate;
            }
            if (filterEndDate) {
                queryFilters[dateField].$lte = filterEndDate;
            }
            
            console.log(`📅 LAB: Applied date filter on field '${dateField}':`, {
                gte: filterStartDate?.toISOString(),
                lte: filterEndDate?.toISOString()
            });
        } else {
            console.log(`📅 LAB: No date filter applied`);
        }

        // Apply search filters
        if (search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: search, $options: 'i' } },
                { studyInstanceUID: { $regex: search, $options: 'i' } }
            ];
            console.log(`🔍 LAB: Applied search filter: ${search}`);
        }

        // Apply category filters with FIXED status arrays
        if (status) {
            queryFilters.workflowStatus = status;
            console.log(`📋 LAB: Applied status filter: ${status}`);
        } else if (category && category !== 'all') {
            switch(category) {
                case 'pending':
                    queryFilters.workflowStatus = { $in: ['new_study_received', 'pending_assignment'] };
                    break;
                
                case 'inprogress': // Handle both variations
                    queryFilters.workflowStatus = { 
                        $in: [
                            'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                            'report_finalized', 'report_drafted', 'report_uploaded', 
                            'report_downloaded_radiologist', 'report_downloaded' // 🔧 FIX: Added missing status
                        ] 
                    };
                    break;
                case 'completed':
                    queryFilters.workflowStatus = 'final_report_downloaded';
                    break;
            }
            console.log(`🏷️ LAB: Applied category filter: ${category}`);
        }

        // Continue with existing aggregation pipeline...
        const pipeline = [
            { $match: queryFilters },
            
            // Add currentCategory calculation with FIXED status handling
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
                                        'report_finalized', 'report_drafted', 'report_uploaded', 
                                        'report_downloaded_radiologist', 'report_downloaded' // 🔧 FIX: Added missing status
                                    ]] },
                                    then: 'inprogress'
                                },
                                {
                                    case: { $in: ["$workflowStatus", ['final_report_downloaded']] },
                                    then: 'completed'
                                }
                            ],
                            default: 'unknown'
                        }
                    }
                }
            },
            
            // Essential lookups (keep existing but optimized)...
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
                    doctorReports:1,
                    ReportAvailable: 1,
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
        console.log(`🔍 LAB: Executing aggregation pipeline with ${pipeline.length} stages`);
        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        console.log(`📊 LAB: Query results: Found ${studies.length} studies, total matching: ${totalStudies}`);

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
                workflowStatus: study.workflowStatus,
                currentCategory: study.currentCategory,
                createdAt: study.createdAt,
                reportedBy: study.reportInfo?.reporterName ,
                assignedDoctorName: lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.caseType || 'ROUTINE',
                caseType: study.caseType || 'routine',
                // Add all other necessary fields for table display
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || ''
            };
        });

        // Calculate summary statistics with optimized aggregation that includes category
        const summaryStats = await DicomStudy.aggregate([
            { $match: queryFilters },
            {
                $facet: {
                    byStatus: [
                        {
                            $group: {
                                _id: '$workflowStatus',
                                count: { $sum: 1 }
                            }
                        }
                    ],
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
                                                    'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress'
                                                ]] },
                                                then: "inprogress"
                                            },
                                            {
                                                case: { $in: ["$workflowStatus", [
                                                    'report_finalized', 'report_uploaded', 
                                                    'report_downloaded_radiologist', 'report_downloaded',
                                                    'final_report_downloaded'
                                                ]] },
                                                then: "completed"
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
                    ],
                    urgentStudies: [
                        {
                            $match: {
                                $or: [
                                    { caseType: { $in: ['emergency', 'urgent', 'stat'] } }
                                ]
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    uploadedToday: [
                        {
                            $match: {
                                $expr: {
                                    $eq: [
                                        { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                                        { $dateToString: { format: "%Y-%m-%d", date: new Date() } }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                count: { $sum: 1 }
                            }
                        }
                    ]
                }
            }
        ]);

        // Convert to usable format and populate categoryCounts
        const categoryCounts = {
            all: totalStudies,
            pending: 0,
            inprogress: 0,
            completed: 0
        };

        if (summaryStats[0]?.byCategory) {
            summaryStats[0].byCategory.forEach(cat => {
                if (categoryCounts.hasOwnProperty(cat._id)) {
                    categoryCounts[cat._id] = cat.count;
                }
            });
        }

        // Add lab-specific stats
        const urgentStudies = summaryStats[0]?.urgentStudies?.[0]?.count || 0;
        const uploadedToday = summaryStats[0]?.uploadedToday?.[0]?.count || 0;

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
            summary: {
                byStatus: summaryStats[0]?.byStatus.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                byCategory: categoryCounts,
                urgentStudies,
                uploadedToday,
                total: totalStudies
            },
            // 🔧 ADD: Debug information
            debug: process.env.NODE_ENV === 'development' ? {
                appliedFilters: queryFilters,
                dateFilter: {
                    preset: quickDatePreset || dateFilter,
                    dateType: dateType,
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

        console.log(`✅ LAB: Single page query completed in ${processingTime}ms, returned ${formattedStudies.length} studies`);

        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ LAB: Error fetching studies for lab:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 NEW: Get pending studies specifically for lab
export const getPendingStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 50;
        
        console.log('🟡 LAB: Fetching PENDING studies specifically');
        
        // 🔧 STEP 1: Build lean query filters with PENDING status priority
        const queryFilters = {
            workflowStatus: { 
                $in: ['new_study_received', 'pending_assignment'] 
            }
        };
        
        // 🔧 LAB SPECIFIC: Lab filtering with optimized lookup
        if (req.user.role === 'lab_staff' && req.user.lab) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.user.lab._id);
            console.log(`🏢 LAB: Filtering pending by lab: ${req.user.lab._id}`);
        }
        
        // Apply date filtering (same logic as getAllStudiesForLab)
        let filterStartDate = null;
        let filterEndDate = null;
        
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = new Date();
            
            switch (preset) {
                case 'last24h':
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    break;
                case 'today':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    break;
                case 'yesterday':
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    filterStartDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    break;
                case 'thisWeek':
                    const weekStart = new Date(now);
                    const dayOfWeek = now.getDay();
                    weekStart.setDate(now.getDate() - dayOfWeek);
                    weekStart.setHours(0, 0, 0, 0);
                    filterStartDate = weekStart;
                    filterEndDate = now;
                    break;
                case 'thisMonth':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    break;
                case 'custom':
                    if (req.query.customDateFrom || req.query.customDateTo) {
                        filterStartDate = req.query.customDateFrom ? new Date(req.query.customDateFrom + 'T00:00:00') : null;
                        filterEndDate = req.query.customDateTo ? new Date(req.query.customDateTo + 'T23:59:59') : null;
                    }
                    break;
                default:
                    const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
                    filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
                    filterEndDate = now;
            }
        } else {
            const now = new Date();
            const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
            filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
            filterEndDate = now;
        }

        // Apply date filter
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Apply other filters
        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: { $in: [req.query.modality] } }
            ];
        }

        if (req.query.priority) {
            queryFilters.caseType = req.query.priority;
        }

        console.log(`🔍 LAB PENDING query filters:`, JSON.stringify(queryFilters, null, 2));

        // Execute the same pipeline structure as getAllStudiesForLab
        const pipeline = [
            { $match: queryFilters },
            {
                $addFields: {
                    currentCategory: 'pending'
                }
            },
            // Same lookups as getAllStudiesForLab
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
                    doctorReports:1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
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

        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        console.log(`📊 LAB PENDING: Query results: Found ${studies.length} studies, total matching: ${totalStudies}`);

        // Format studies (same as getAllStudiesForLab)
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
            const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
            const lastAssignedDoctor = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor[0] : study.lastAssignedDoctor;
            
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

                workflowStatus: study.workflowStatus,
                currentCategory: study.currentCategory,
                createdAt: study.createdAt,
                reportedBy: study.reportedBy || lastAssignedDoctor?.userAccount?.fullName || 'N/A',
                assignedDoctorName: lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.caseType || 'ROUTINE',
                caseType: study.caseType || 'routine',
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || ''
            };
        });

        const processingTime = Date.now() - startTime;

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
                total: totalStudies
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length
            },
            metadata: {
                dateRange: {
                    from: filterStartDate,
                    to: filterEndDate
                },
                filters: {
                    modality: req.query.modality || 'all',
                    priority: req.query.priority || 'all',
                    search: req.query.search || null,
                    dateType: req.query.dateType || 'createdAt'
                },
                labSpecific: {
                    labId: req.user.lab?._id,
                    labName: req.user.lab?.name,
                    statusesIncluded: ['new_study_received', 'pending_assignment'],
                    category: 'pending'
                }
            }
        };

        console.log(`✅ LAB PENDING: Query completed in ${processingTime}ms, returned ${formattedStudies.length} studies`);
        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ LAB PENDING: Error fetching pending studies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching pending studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 NEW: Get processing studies specifically for lab
export const getProcessingStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 50;
        
        console.log('🟠 LAB: Fetching PROCESSING studies specifically');
        
        // 🔧 STEP 1: Build lean query filters with PROCESSING status priority
        const queryFilters = {
            workflowStatus: { 
                $in: [
                    'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                    'report_finalized', 'report_drafted', 'report_uploaded', 
                    'report_downloaded_radiologist', 'report_downloaded'
                ] 
            }
        };
        
        // 🔧 LAB SPECIFIC: Lab filtering
        if (req.user.role === 'lab_staff' && req.user.lab) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.user.lab._id);
            console.log(`🏢 LAB: Filtering processing by lab: ${req.user.lab._id}`);
        }
        
        // Apply same date filtering logic as pending studies
        let filterStartDate = null;
        let filterEndDate = null;
        
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = new Date();
            
            switch (preset) {
                case 'last24h':
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    break;
                case 'today':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    break;
                case 'yesterday':
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    filterStartDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    break;
                case 'thisWeek':
                    const weekStart = new Date(now);
                    const dayOfWeek = now.getDay();
                    weekStart.setDate(now.getDate() - dayOfWeek);
                    weekStart.setHours(0, 0, 0, 0);
                    filterStartDate = weekStart;
                    filterEndDate = now;
                    break;
                case 'thisMonth':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    break;
                case 'custom':
                    if (req.query.customDateFrom || req.query.customDateTo) {
                        filterStartDate = req.query.customDateFrom ? new Date(req.query.customDateFrom + 'T00:00:00') : null;
                        filterEndDate = req.query.customDateTo ? new Date(req.query.customDateTo + 'T23:59:59') : null;
                    }
                    break;
                default:
                    const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
                    filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
                    filterEndDate = now;
            }
        } else {
            const now = new Date();
            const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
            filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
            filterEndDate = now;
        }

        // Apply date filter
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Apply other filters
        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: { $in: [req.query.modality] } }
            ];
        }

        if (req.query.priority) {
            queryFilters.caseType = req.query.priority;
        }

        console.log(`🔍 LAB PROCESSING query filters:`, JSON.stringify(queryFilters, null, 2));

        // Same pipeline structure as pending
        const pipeline = [
            { $match: queryFilters },
            {
                $addFields: {
                    currentCategory: 'inprogress'
                }
            },
            // Same lookups as getAllStudiesForLab...
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
                    doctorReports:1,
                    ReportAvailable: 1,
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

        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // Format studies (same as getAllStudiesForLab)
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
            const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
            const lastAssignedDoctor = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor[0] : study.lastAssignedDoctor;
            
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
                workflowStatus: study.workflowStatus,
                currentCategory: study.currentCategory,
                createdAt: study.createdAt,
                reportedBy: study.reportedBy || lastAssignedDoctor?.userAccount?.fullName || 'N/A',
                assignedDoctorName: lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.caseType || 'ROUTINE',
                caseType: study.caseType || 'routine',
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || ''
            };
        });

        const processingTime = Date.now() - startTime;

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
            summary: {
                byStatus: {
                    assigned_to_doctor: formattedStudies.filter(s => s.workflowStatus === 'assigned_to_doctor').length,
                    doctor_opened_report: formattedStudies.filter(s => s.workflowStatus === 'doctor_opened_report').length,
                    report_in_progress: formattedStudies.filter(s => s.workflowStatus === 'report_in_progress').length
                },
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
                actualReturned: formattedStudies.length
            },
            metadata: {
                dateRange: {
                    from: filterStartDate,
                    to: filterEndDate
                },
                filters: {
                    modality: req.query.modality || 'all',
                    priority: req.query.priority || 'all',
                    search: req.query.search || null,
                    dateType: req.query.dateType || 'createdAt'
                },
                labSpecific: {
                    labId: req.user.lab?._id,
                    labName: req.user.lab?.name,
                    statusesIncluded: ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress'],
                    category: 'inprogress'
                }
            }
        };

        console.log(`✅ LAB PROCESSING: Query completed in ${processingTime}ms, returned ${formattedStudies.length} studies`);
        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ LAB PROCESSING: Error fetching processing studies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching processing studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 NEW: Get completed studies specifically for lab
export const getCompletedStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = parseInt(req.query.limit) || 50;
        
        console.log('🟢 LAB: Fetching COMPLETED studies specifically');
        
        // 🔧 STEP 1: Build lean query filters with COMPLETED status priority
        const queryFilters = {
            workflowStatus: 'final_report_downloaded'
        };
        
        // 🔧 LAB SPECIFIC: Lab filtering
        if (req.user.role === 'lab_staff' && req.user.lab) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.user.lab._id);
            console.log(`🏢 LAB: Filtering completed by lab: ${req.user.lab._id}`);
        }
        
        // Apply same date filtering logic as other functions
        let filterStartDate = null;
        let filterEndDate = null;
        
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = new Date();
            
            switch (preset) {
                case 'last24h':
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    break;
                case 'today':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    break;
                case 'yesterday':
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    filterStartDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    break;
                case 'thisWeek':
                    const weekStart = new Date(now);
                    const dayOfWeek = now.getDay();
                    weekStart.setDate(now.getDate() - dayOfWeek);
                    weekStart.setHours(0, 0, 0, 0);
                    filterStartDate = weekStart;
                    filterEndDate = now;
                    break;
                case 'thisMonth':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    break;
                case 'custom':
                    if (req.query.customDateFrom || req.query.customDateTo) {
                        filterStartDate = req.query.customDateFrom ? new Date(req.query.customDateFrom + 'T00:00:00') : null;
                        filterEndDate = req.query.customDateTo ? new Date(req.query.customDateTo + 'T23:59:59') : null;
                    }
                    break;
                default:
                    const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
                    filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
                    filterEndDate = now;
            }
        } else {
            const now = new Date();
            const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
            filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
            filterEndDate = now;
        }

        // Apply date filter
        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        // Apply other filters
        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.modality) {
            queryFilters.$or = [
                { modality: req.query.modality },
                { modalitiesInStudy: { $in: [req.query.modality] } }
            ];
        }

        if (req.query.priority) {
            queryFilters.caseType = req.query.priority;
        }

        console.log(`🔍 LAB COMPLETED query filters:`, JSON.stringify(queryFilters, null, 2));

        // Same pipeline structure
        const pipeline = [
            { $match: queryFilters },
            {
                $addFields: {
                    currentCategory: 'completed'
                }
            },
            // Same lookups as other functions...
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
                    doctorReports: 1,
                    instanceCount: 1,
                    studyDate: 1,
                    studyTime: 1,
                    createdAt: 1,
                    ReportAvailable: 1,
                    lastAssignedDoctor: 1,
                    reportedBy: 1,
                    reportFinalizedAt: 1,
                    clinicalHistory: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1
                }
            },
            { $sort: { reportFinalizedAt: -1, createdAt: -1 } }, // Sort by completion date first
            { $limit: Math.min(limit, 10000) }
        ];

        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        // Format studies (same as getAllStudiesForLab)
        const formattedStudies = studies.map(study => {
            const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
            const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
            const lastAssignedDoctor = Array.isArray(study.lastAssignedDoctor) ? study.lastAssignedDoctor[0] : study.lastAssignedDoctor;
            
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

                workflowStatus: study.workflowStatus,
                currentCategory: study.currentCategory,
                createdAt: study.createdAt,
                reportedBy: study.reportedBy || lastAssignedDoctor?.userAccount?.fullName || 'N/A',
                assignedDoctorName: lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
                priority: study.caseType || 'ROUTINE',
                caseType: study.caseType || 'routine',
                ReportAvailable: study.ReportAvailable || false,
                reportFinalizedAt: study.reportFinalizedAt,
                clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || ''
            };
        });

        const processingTime = Date.now() - startTime;

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
            summary: {
                byStatus: {
                    report_finalized: formattedStudies.filter(s => s.workflowStatus === 'report_finalized').length,
                    report_uploaded: formattedStudies.filter(s => s.workflowStatus === 'report_uploaded').length,
                    report_downloaded_radiologist: formattedStudies.filter(s => s.workflowStatus === 'report_downloaded_radiologist').length,
                    report_downloaded: formattedStudies.filter(s => s.workflowStatus === 'report_downloaded').length,
                    final_report_downloaded: formattedStudies.filter(s => s.workflowStatus === 'final_report_downloaded').length
                },
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
                actualReturned: formattedStudies.length
            },
            metadata: {
                dateRange: {
                    from: filterStartDate,
                    to: filterEndDate
                },
                filters: {
                    modality: req.query.modality || 'all',
                    priority: req.query.priority || 'all',
                    search: req.query.search || null,
                    dateType: req.query.dateType || 'createdAt'
                },
                labSpecific: {
                    labId: req.user.lab?._id,
                    labName: req.user.lab?.name,
                    statusesIncluded: ['report_finalized', 'report_uploaded', 'report_downloaded_radiologist', 'report_downloaded', 'final_report_downloaded'],
                    category: 'completed'
                }
            }
        };

        console.log(`✅ LAB COMPLETED: Query completed in ${processingTime}ms, returned ${formattedStudies.length} studies`);
        res.status(200).json(responseData);

    } catch (error) {
        console.error('❌ LAB COMPLETED: Error fetching completed studies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching completed studies.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// // 🆕 NEW: Get values specifically for lab (synchronized with filters)
// export const getValues = async (req, res) => {
//     console.log(`🔍 LAB: Fetching dashboard values with filters: ${JSON.stringify(req.query)}`);
//     try {
//         const startTime = Date.now();
        
//         // 🔧 STEP 1: Build lean query filters with optimized date handling (same as getAllStudiesForLab)
//         const queryFilters = {};
        
//         // 🔧 LAB SPECIFIC: Lab filtering
//         if (req.user.role === 'lab_staff' && req.user.lab) {
//             queryFilters.sourceLab = new mongoose.Types.ObjectId(req.user.lab._id);
//             console.log(`🏢 LAB VALUES: Filtering by lab: ${req.user.lab._id}`);
//         }
        
//         let filterStartDate = null;
//         let filterEndDate = null;
        
//         // Optimized date filtering with pre-calculated timestamps
//         if (req.query.quickDatePreset || req.query.dateFilter) {
//             const preset = req.query.quickDatePreset || req.query.dateFilter;
//             const now = new Date();
            
//             switch (preset) {
//                 case 'last24h':
//                     filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//                     filterEndDate = now;
//                     break;
//                 case 'today':
//                     filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
//                     filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
//                     break;
//                 case 'yesterday':
//                     const yesterday = new Date(now);
//                     yesterday.setDate(yesterday.getDate() - 1);
//                     filterStartDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
//                     filterEndDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
//                     break;
//                 case 'thisWeek':
//                     const weekStart = new Date(now);
//                     const dayOfWeek = now.getDay();
//                     weekStart.setDate(now.getDate() - dayOfWeek);
//                     weekStart.setHours(0, 0, 0, 0);
//                     filterStartDate = weekStart;
//                     filterEndDate = now;
//                     break;
//                 case 'thisMonth':
//                     filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
//                     filterEndDate = now;
//                     break;
//                 case 'custom':
//                     if (req.query.customDateFrom || req.query.customDateTo) {
//                         filterStartDate = req.query.customDateFrom ? new Date(req.query.customDateFrom + 'T00:00:00') : null;
//                         filterEndDate = req.query.customDateTo ? new Date(req.query.customDateTo + 'T23:59:59') : null;
//                     } else {
//                         const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
//                         filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
//                         filterEndDate = now;
//                     }
//                     break;
//                 default:
//                     const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
//                     filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
//                     filterEndDate = now;
//             }
//         } else {
//             // Default to today if no date filter specified
//             const now = new Date();
//             const todayStart = new Date(now);
//             todayStart.setHours(0, 0, 0, 0);
//             const todayEnd = new Date(now);
//             todayEnd.setHours(23, 59, 59, 999);
//             filterStartDate = todayStart;
//             filterEndDate = todayEnd;
//         }

//         // Apply date filter with proper indexing
//         if (filterStartDate || filterEndDate) {
//             const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
//             queryFilters[dateField] = {};
//             if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
//             if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
//         }

//         // Apply same filters as getAllStudiesForLab
//         if (req.query.search) {
//             queryFilters.$or = [
//                 { accessionNumber: { $regex: req.query.search, $options: 'i' } },
//                 { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
//             ];
//         }

//         if (req.query.modality) {
//             queryFilters.$or = [
//                 { modality: req.query.modality },
//                 { modalitiesInStudy: req.query.modality }
//             ];
//         }

//         if (req.query.priority) {
//             queryFilters.caseType = req.query.priority;
//         }

//         console.log(`🔍 LAB VALUES: Dashboard query filters:`, JSON.stringify(queryFilters, null, 2));

//         // 🔧 FIXED: Status mapping for lab with ALL possible statuses
//         const statusCategories = {
//             pending: ['new_study_received', 'pending_assignment'],
//             inprogress: [
//                 'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
//                 'report_finalized', 'report_drafted', 'report_uploaded', 
//                 'report_downloaded_radiologist', 'report_downloaded' // 🔧 FIX: Added missing status
//             ],
//             completed: ['final_report_downloaded']
//         };

//         // 🔧 ENHANCED: Aggregation pipeline with null/undefined handling
//         const pipeline = [
//             {
//                 $match: queryFilters
//             },
//             {
//                 $addFields: {
//                     // 🔧 CRITICAL: Handle null/undefined workflowStatus
//                     safeWorkflowStatus: {
//                         $ifNull: ['$workflowStatus', 'unknown']
//                     }
//                 }
//             },
//             {
//                 $group: {
//                     _id: '$safeWorkflowStatus',
//                     count: { $sum: 1 }
//                 }
//             }
//         ];

//         // Execute queries with same filters
//         const [statusCountsResult, totalFilteredResult] = await Promise.allSettled([
//             DicomStudy.aggregate(pipeline).allowDiskUse(false),
//             DicomStudy.countDocuments(queryFilters)
//         ]);

//         if (statusCountsResult.status === 'rejected') {
//             throw new Error(`Status counts query failed: ${statusCountsResult.reason.message}`);
//         }

//         const statusCounts = statusCountsResult.value;
//         const totalFiltered = totalFilteredResult.status === 'fulfilled' ? totalFilteredResult.value : 0;

//         console.log(`📊 LAB VALUES: Raw status counts:`, statusCounts);
//         console.log(`📊 LAB VALUES: Total filtered:`, totalFiltered);

//         // 🔧 FIXED: Calculate category totals with proper null/undefined protection
//         let pending = 0;
//         let inprogress = 0;
//         let completed = 0;
//         let unknown = 0;

//         statusCounts.forEach(({ _id: status, count }) => {
//             // 🔧 CRITICAL: Null/undefined protection
//             if (!status || status === 'unknown' || status === null || status === undefined) {
//                 unknown += count;
//                 console.log(`⚠️ LAB VALUES: Found ${count} studies with unknown/null status`);
//                 return;
//             }

//             // 🔧 FIXED: Safe array checking with status validation
//             if (statusCategories.pending && statusCategories.pending.includes(status)) {
//                 pending += count;
//                 console.log(`✅ LAB VALUES: Added ${count} studies to PENDING (status: ${status})`);
//             } else if (statusCategories.inprogress && statusCategories.inprogress.includes(status)) {
//                 inprogress += count;
//                 console.log(`✅ LAB VALUES: Added ${count} studies to INPROGRESS (status: ${status})`);
//             } else if (statusCategories.completed && statusCategories.completed.includes(status)) {
//                 completed += count;
//                 console.log(`✅ LAB VALUES: Added ${count} studies to COMPLETED (status: ${status})`);
//             } else {
//                 unknown += count;
//                 console.log(`⚠️ LAB VALUES: Unrecognized status: ${status} with ${count} studies`);
//             }
//         });

//         // 🔧 STEP 3: If category filter is applied, adjust the totals accordingly
//         if (req.query.category && req.query.category !== 'all') {
//             const categoryFilter = req.query.category;
            
//             // Reset all counts to 0 first
//             let filteredPending = 0;
//             let filteredProcessing = 0;
//             let filteredCompleted = 0;
            
//             // Set only the filtered category to the total count
//             switch (categoryFilter) {
//                 case 'pending':
//                     filteredPending = totalFiltered;
//                     break;
//                 case 'inprogress':
//                     filteredProcessing = totalFiltered;
//                     break;
//                 case 'completed':
//                     filteredCompleted = totalFiltered;
//                     break;
//             }
            
//             // Override the calculated values with filtered values
//             pending = filteredPending;
//             inprogress = filteredProcessing;
//             completed = filteredCompleted;
//         }

//         const processingTime = Date.now() - startTime;
//         console.log(`🎯 LAB VALUES: Dashboard values fetched in ${processingTime}ms with filters applied`);

//         // Enhanced response with filter information
//         const response = {
//             success: true,
//             total: totalFiltered, // Total matching the applied filters
//             pending: pending,
//             inprogress: inprogress, // Keep same naming as admin for consistency
//             completed: completed,
//             performance: {
//                 queryTime: processingTime,
//                 fromCache: false,
//                 filtersApplied: Object.keys(queryFilters).length > 0
//             }
//         };

//         // Add filter summary for debugging/transparency
//         if (process.env.NODE_ENV === 'development') {
//             response.debug = {
//                 filtersApplied: queryFilters,
//                 dateRange: {
//                     start: filterStartDate?.toISOString(),
//                     end: filterEndDate?.toISOString()
//                 },
//                 rawStatusCounts: statusCounts,
//                 labSpecific: {
//                     labId: req.user.lab?._id,
//                     labName: req.user.lab?.name
//                 }
//             };
//         }

//         res.status(200).json(response);

//     } catch (error) {
//         console.error('❌ LAB VALUES: Error fetching dashboard values:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Server error fetching dashboard statistics.',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     }
// };


// 🆕 NEW: Get values specifically for lab (synchronized with filters)
export const getValues = async (req, res) => {
    console.log(`🔍 LAB: Fetching dashboard values with filters: ${JSON.stringify(req.query)}`);
    try {
        const startTime = Date.now();
        
        // --- The logic for building queryFilters remains the same ---
        const queryFilters = {};
        
        if (req.user.role === 'lab_staff' && req.user.lab) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(req.user.lab._id);
            console.log(`🏢 LAB VALUES: Filtering by lab: ${req.user.lab._id}`);
        }
        
        let filterStartDate = null;
        let filterEndDate = null;
        
        if (req.query.quickDatePreset || req.query.dateFilter) {
            const preset = req.query.quickDatePreset || req.query.dateFilter;
            const now = new Date();
            
            switch (preset) {
                case 'last24h':
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    break;
                case 'today':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    break;
                case 'yesterday':
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    filterStartDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    break;
                case 'thisWeek':
                    const weekStart = new Date(now);
                    const dayOfWeek = now.getDay();
                    weekStart.setDate(now.getDate() - dayOfWeek);
                    weekStart.setHours(0, 0, 0, 0);
                    filterStartDate = weekStart;
                    filterEndDate = now;
                    break;
                case 'thisMonth':
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    break;
                case 'custom':
                    if (req.query.customDateFrom || req.query.customDateTo) {
                        filterStartDate = req.query.customDateFrom ? new Date(req.query.customDateFrom + 'T00:00:00') : null;
                        filterEndDate = req.query.customDateTo ? new Date(req.query.customDateTo + 'T23:59:59') : null;
                    } else {
                        const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
                        filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
                        filterEndDate = now;
                    }
                    break;
                default:
                    const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
                    filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
                    filterEndDate = now;
            }
        } else {
            const now = new Date();
            filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        }

        if (filterStartDate || filterEndDate) {
            const dateField = req.query.dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
            queryFilters[dateField] = {};
            if (filterStartDate) queryFilters[dateField].$gte = filterStartDate;
            if (filterEndDate) queryFilters[dateField].$lte = filterEndDate;
        }

        if (req.query.search) {
            queryFilters.$or = [
                { accessionNumber: { $regex: req.query.search, $options: 'i' } },
                { studyInstanceUID: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        if (req.query.modality) {
            queryFilters.$or = [{ modality: req.query.modality }, { modalitiesInStudy: req.query.modality }];
        }
        if (req.query.priority) {
            queryFilters.caseType = req.query.priority;
        }

        console.log(`🔍 LAB VALUES: Dashboard query filters:`, JSON.stringify(queryFilters, null, 2));

        const statusCategories = {
            pending: ['new_study_received', 'pending_assignment'],
            inprogress: [
                'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress',
                'report_finalized', 'report_drafted', 'report_uploaded', 
                'report_downloaded_radiologist', 'report_downloaded'
            ],
            completed: ['final_report_downloaded']
        };

        const pipeline = [
            { $match: queryFilters },
            { $addFields: { safeWorkflowStatus: { $ifNull: ['$workflowStatus', 'unknown'] } } },
            { $group: { _id: '$safeWorkflowStatus', count: { $sum: 1 } } }
        ];

        const [statusCountsResult, totalFilteredResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            DicomStudy.countDocuments(queryFilters)
        ]);

        if (statusCountsResult.status === 'rejected') {
            throw new Error(`Status counts query failed: ${statusCountsResult.reason.message}`);
        }

        const statusCounts = statusCountsResult.value;
        const totalFiltered = totalFilteredResult.status === 'fulfilled' ? totalFilteredResult.value : 0;

        console.log(`📊 LAB VALUES: Raw status counts:`, statusCounts);

        // ✨ RENAMED: 'processing' variable is now correctly named 'inprogress'
        let pending = 0;
        let inprogress = 0;
        let completed = 0;
        let unknown = 0;

        statusCounts.forEach(({ _id: status, count }) => {
            if (!status || status === 'unknown') {
                unknown += count;
                return;
            }
            
            if (statusCategories.completed && statusCategories.completed.includes(status)) {
                completed += count;
            } else if (statusCategories.inprogress && statusCategories.inprogress.includes(status)) {
                // ✨ RENAMED: Incrementing the correct variable
                inprogress += count;
            } else if (statusCategories.pending && statusCategories.pending.includes(status)) {
                pending += count;
            } else {
                unknown += count;
            }
        });

        if (req.query.category && req.query.category !== 'all') {
            const categoryFilter = req.query.category;
            
            pending = 0;
            inprogress = 0; // ✨ RENAMED: Resetting the correct variable
            completed = 0;
            
            switch (categoryFilter) {
                case 'pending':
                    pending = totalFiltered;
                    break;
                case 'inprogress':
                     // ✨ RENAMED: Updating the correct variable
                    inprogress = totalFiltered;
                    break;
                case 'completed':
                    completed = totalFiltered;
                    break;
            }
        }

        const processingTime = Date.now() - startTime;
        console.log(`🎯 LAB VALUES: Dashboard values fetched in ${processingTime}ms`);

        const response = {
            success: true,
            total: totalFiltered,
            pending: pending,
            inprogress: inprogress, // ✨ RENAMED: Using the correct variable for the response key
            completed: completed,
            performance: {
                queryTime: processingTime,
                fromCache: false,
                filtersApplied: Object.keys(queryFilters).length > 0
            },
            debug: process.env.NODE_ENV === 'development' ? {
                filtersApplied: queryFilters,
                rawStatusCounts: statusCounts,
            } : undefined
        };

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ LAB VALUES: Error fetching dashboard values:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching dashboard statistics.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};




