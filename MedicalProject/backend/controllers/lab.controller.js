import Patient from '../models/patientModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';


// 🔧 PERFORMANCE: Add caching for frequent queries
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });


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
            studyDateTime: study.studyDate,
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

        // Apply category filters
        if (status) {
            queryFilters.workflowStatus = status;
            console.log(`📋 LAB: Applied status filter: ${status}`);
        } else if (category && category !== 'all') {
            switch(category) {
                case 'pending':
                    queryFilters.workflowStatus = { $in: ['new_study_received', 'pending_assignment'] };
                    break;
                case 'processing':
                    queryFilters.workflowStatus = { 
                        $in: [
                            'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress'
                        ] 
                    };
                    break;
                case 'completed':
                    queryFilters.workflowStatus = { 
                        $in: [
                            'report_finalized', 'report_uploaded', 
                            'report_downloaded_radiologist', 'report_downloaded',
                            'final_report_downloaded'
                        ] 
                    };
                    break;
            }
            console.log(`🏷️ LAB: Applied category filter: ${category}`);
        }

        // Apply modality filter
        if (modality) {
            queryFilters.$or = [
                { modality: modality },
                { modalitiesInStudy: { $in: [modality] } }
            ];
            console.log(`🏥 LAB: Applied modality filter: ${modality}`);
        }

        // Apply priority filter
        if (priority) {
            queryFilters.caseType = priority;
            console.log(`⚡ LAB: Applied priority filter: ${priority}`);
        }

        // 🔧 DEBUG: Log final query filters
        console.log(`🔍 LAB: Final query filters:`, JSON.stringify(queryFilters, null, 2));

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
                                        'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress'
                                    ]] },
                                    then: 'processing'
                                },
                                {
                                    case: { $in: ["$workflowStatus", [
                                        'report_finalized', 'report_uploaded', 
                                        'report_downloaded_radiologist', 'report_downloaded',
                                        'final_report_downloaded'
                                    ]] },
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
                                                then: "processing"
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
            processing: 0,
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





