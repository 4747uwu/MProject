import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 });


export const getAssignedStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);

        // 🔧 PERFORMANCE: Find doctor with lean query for better performance
        const doctor = await Doctor.findOne({ userAccount: req.user._id }).lean();
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor profile not found'
            });
        }

        console.log(`🔍 DOCTOR: Searching for studies assigned to doctor: ${doctor._id}`);

        // 🆕 ENHANCED: Extract all filter parameters including date filters
        const { 
            search, status, category, modality, labId, 
            startDate, endDate, priority, patientName, 
            dateRange, dateType = 'createdAt',
            dateFilter, 
            customDateFrom,
            customDateTo,
            quickDatePreset
        } = req.query;

        // 🆕 NEW: Special handling for "assignedToday" filter ONLY - ADD THIS BEFORE EVERYTHING ELSE
        if (quickDatePreset === 'assignedToday' || dateFilter === 'assignedToday') {
            console.log(`🎯 DOCTOR: Using assignedToday filter - querying doctor's assignedStudies array`);
            
            // Get today's date range
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            
            // Filter doctor's assignedStudies array for today's assignments
            const todayAssignedStudies = doctor.assignedStudies.filter(assigned => {
                const assignedDate = new Date(assigned.assignedDate);
                return assignedDate >= todayStart && assignedDate <= todayEnd;
            });
            
            console.log(`📋 DOCTOR: Found ${todayAssignedStudies.length} studies assigned today from doctor's assignedStudies array`);
            console.log(`📋 DOCTOR: Today's date range: ${todayStart} to ${todayEnd}`);
            console.log(`📋 DOCTOR: Doctor's assignedStudies:`, doctor.assignedStudies);
            
            if (todayAssignedStudies.length === 0) {
                // No studies assigned today - return empty result
                return res.status(200).json({
                    success: true,
                    count: 0,
                    totalRecords: 0,
                    recordsPerPage: limit,
                    data: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 1,
                        totalRecords: 0,
                        limit: limit,
                        hasNextPage: false,
                        hasPrevPage: false,
                        recordRange: { start: 0, end: 0 },
                        isSinglePage: true
                    },
                    summary: {
                        byStatus: {},
                        byCategory: { all: 0, pending: 0, inprogress: 0, completed: 0 },
                        urgentStudies: 0,
                        todayAssigned: 0,
                        total: 0
                    },
                    debug: process.env.NODE_ENV === 'development' ? {
                        filterType: 'assignedToday',
                        doctorId: doctor._id,
                        todayRange: { start: todayStart, end: todayEnd },
                        assignedTodayCount: 0,
                        doctorAssignedStudies: doctor.assignedStudies
                    } : undefined,
                    performance: {
                        queryTime: Date.now() - startTime,
                        fromCache: false,
                        recordsReturned: 0
                    }
                });
            }
            
            // Extract study IDs from today's assignments
            const todayStudyIds = todayAssignedStudies.map(assigned => assigned.study);
            
            console.log(`🔍 DOCTOR: Today's study IDs from assignedStudies:`, todayStudyIds);
            
            // Build query to get full study details for today's assigned studies
            const queryFilters = {
                _id: { $in: todayStudyIds }
            };
            
            // Apply other filters if provided
            if (search) {
                queryFilters.$and = queryFilters.$and || [];
                queryFilters.$and.push({
                    $or: [
                        { accessionNumber: { $regex: search, $options: 'i' } },
                        { studyInstanceUID: { $regex: search, $options: 'i' } }
                    ]
                });
            }
            
            if (status) {
                queryFilters.workflowStatus = status;
            } else if (category && category !== 'all') {
                switch(category) {
                    case 'pending':
                        queryFilters.workflowStatus = 'assigned_to_doctor';
                        break;
                    case 'inprogress':
                        queryFilters.workflowStatus = { 
                            $in: ['doctor_opened_report', 'report_in_progress'] 
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
            }
            
            if (modality) {
                queryFilters.$and = queryFilters.$and || [];
                queryFilters.$and.push({
                    $or: [
                        { modality: modality },
                        { modalitiesInStudy: { $in: [modality] } }
                    ]
                });
            }
            
            if (priority) {
                queryFilters['assignment.priority'] = priority;
            }
            
            console.log(`🔍 DOCTOR: AssignedToday query filters:`, JSON.stringify(queryFilters, null, 2));
            
            // Use aggregation pipeline to get study details
            const pipeline = [
                { $match: queryFilters },
                
                // Add currentCategory calculation
                {
                    $addFields: {
                        currentCategory: {
                            $switch: {
                                branches: [
                                    {
                                        case: { $eq: ["$workflowStatus", 'assigned_to_doctor'] },
                                        then: 'pending'
                                    },
                                    {
                                        case: { $in: ["$workflowStatus", [
                                            'doctor_opened_report',
                                            'report_in_progress'
                                        ]] },
                                        then: 'inprogress'
                                    },
                                    {
                                        case: { $in: ["$workflowStatus", [
                                            'report_finalized',
                                            'report_uploaded',
                                            'report_downloaded_radiologist',
                                            'report_downloaded',
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
                
                // Same lookups as original
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
                                    mrn: 1,
                                    firstName: 1,
                                    lastName: 1,
                                    patientNameRaw: 1,
                                    dateOfBirth: 1,
                                    gender: 1,
                                    ageString: 1,
                                    salutation: 1,
                                    currentWorkflowStatus: 1,
                                    attachments: 1,
                                    activeDicomStudyRef: 1,
                                    'contactInformation.phone': 1,
                                    'contactInformation.email': 1,
                                    'medicalHistory.clinicalHistory': 1,
                                    'medicalHistory.previousInjury': 1,
                                    'medicalHistory.previousSurgery': 1,
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
                
                // Additional patient name search filter (applied after lookup)
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
                        'assignment.priority': 1,
                        'assignment.assignedAt': 1,
                        lastAssignedDoctor: 1,
                        reportedBy: 1,
                        reportFinalizedAt: 1,
                        clinicalHistory: 1,
                        caseType: 1,
                        patient: 1,
                        sourceLab: 1,
                        lastAssignmentAt: 1
                    }
                },
                
                // Sort by assignment date (newest first)
                { 
                    $sort: { 
                        'assignment.assignedAt': -1,
                        lastAssignmentAt: -1,
                        createdAt: -1 
                    } 
                },
                
                { $limit: Math.min(limit, 10000) }
            ];
            
            // Execute the pipeline
            const [studies, totalStudies] = await Promise.all([
                DicomStudy.aggregate(pipeline).allowDiskUse(true),
                DicomStudy.countDocuments(queryFilters)
            ]);
            
            console.log(`📊 DOCTOR: AssignedToday results: Found ${studies.length} studies, total matching: ${totalStudies}`);
            
            // Same formatting logic as original
            const formattedStudies = studies.map(study => {
                const patient = Array.isArray(study.patient) ? study.patient[0] : study.patient;
                const sourceLab = Array.isArray(study.sourceLab) ? study.sourceLab[0] : study.sourceLab;
                
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
                    reportedBy: study.reportedBy || 'N/A',
                    assignedDoctorName: 'Assigned to Me',
                    priority: study.assignment?.priority || 'NORMAL',
                    caseType: study.caseType || 'routine',
                    assignedDate: study.lastAssignmentAt || study.assignment?.assignedAt,
                    ReportAvailable: study.ReportAvailable || false,
                    reportFinalizedAt: study.reportFinalizedAt,
                    clinicalHistory: study.clinicalHistory || patient?.medicalHistory?.clinicalHistory || ''
                };
            });
            
            // Calculate category stats for assignedToday filter
            const categoryCounts = {
                all: totalStudies,
                pending: 0,
                inprogress: 0,
                completed: 0
            };
            
            formattedStudies.forEach(study => {
                if (study.currentCategory && categoryCounts.hasOwnProperty(study.currentCategory)) {
                    categoryCounts[study.currentCategory]++;
                }
            });
            
            const processingTime = Date.now() - startTime;
            
            console.log(`✅ DOCTOR: AssignedToday filter completed - returning ${formattedStudies.length} studies`);
            
            return res.status(200).json({
                success: true,
                count: formattedStudies.length,
                totalRecords: totalStudies,
                recordsPerPage: limit,
                data: formattedStudies,
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    totalRecords: totalStudies,
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
                    byStatus: {},
                    byCategory: categoryCounts,
                    urgentStudies: formattedStudies.filter(s => ['EMERGENCY', 'STAT', 'URGENT'].includes(s.priority)).length,
                    todayAssigned: formattedStudies.length, // All results are assigned today
                    total: totalStudies
                },
                debug: process.env.NODE_ENV === 'development' ? {
                    filterType: 'assignedToday',
                    doctorId: doctor._id,
                    todayRange: { start: todayStart, end: todayEnd },
                    assignedTodayFromDoctor: todayAssignedStudies.length,
                    actualResults: formattedStudies.length,
                    usedDoctorAssignedStudies: true,
                    todayStudyIds: todayStudyIds,
                    doctorAssignedStudies: doctor.assignedStudies
                } : undefined,
                performance: {
                    queryTime: processingTime,
                    fromCache: false,
                    recordsReturned: formattedStudies.length,
                    requestedLimit: limit,
                    actualReturned: formattedStudies.length
                }
            });
        }

        // 🔧 ORIGINAL CODE: For ALL other filters, continue with existing logic
        const queryFilters = {
            // Base filter for doctor's assigned studies
            $or: [
                { lastAssignedDoctor: doctor._id },           // Legacy field
                { 'assignment.assignedTo': doctor._id }       // Modern assignment structure
            ]
        };

        // 🔧 FIXED: Smart date filtering logic with proper date handling
        let shouldApplyDateFilter = true;
        let filterStartDate = null;
        let filterEndDate = null;
        
        // Handle quick date presets first
        if (quickDatePreset || dateFilter) {
            const preset = quickDatePreset || dateFilter;
            const now = new Date();
            
            console.log(`📅 DOCTOR: Processing date preset: ${preset}`);
            
            switch (preset) {
                case 'last24h':
                    // Last 24 hours from now
                    filterStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filterEndDate = now;
                    console.log(`📅 DOCTOR: Applying LAST 24H filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'today':
                    // Today from midnight to now
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    console.log(`📅 DOCTOR: Applying TODAY filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'yesterday':
                    // Yesterday full day
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    filterStartDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    filterEndDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    console.log(`📅 DOCTOR: Applying YESTERDAY filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'thisWeek':
                    // This week from Sunday to now
                    const weekStart = new Date(now);
                    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    weekStart.setDate(now.getDate() - dayOfWeek);
                    weekStart.setHours(0, 0, 0, 0);
                    filterStartDate = weekStart;
                    filterEndDate = now;
                    console.log(`📅 DOCTOR: Applying THIS WEEK filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'thisMonth':
                    // This month from 1st to now
                    filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    console.log(`📅 DOCTOR: Applying THIS MONTH filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'thisYear':
                    // This year from January 1st to now
                    filterStartDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
                    filterEndDate = now;
                    console.log(`📅 DOCTOR: Applying THIS YEAR filter: ${filterStartDate} to ${filterEndDate}`);
                    break;
                    
                case 'custom':
                    if (customDateFrom || customDateTo) {
                        filterStartDate = customDateFrom ? new Date(customDateFrom + 'T00:00:00') : null;
                        filterEndDate = customDateTo ? new Date(customDateTo + 'T23:59:59') : null;
                        console.log(`📅 DOCTOR: Applying CUSTOM filter: ${filterStartDate} to ${filterEndDate}`);
                    } else {
                        shouldApplyDateFilter = false;
                        console.log(`📅 DOCTOR: Custom date preset selected but no dates provided`);
                    }
                    break;
                    
                default:
                    shouldApplyDateFilter = false;
                    console.log(`📅 DOCTOR: Unknown preset: ${preset}, no date filter applied`);
            }
        }
        // Handle legacy startDate/endDate parameters
        else if (startDate || endDate) {
            filterStartDate = startDate ? new Date(startDate + 'T00:00:00') : null;
            filterEndDate = endDate ? new Date(endDate + 'T23:59:59') : null;
            console.log(`📅 DOCTOR: Applied legacy date filter: ${filterStartDate} to ${filterEndDate}`);
        }
        // 🔧 FIXED: Default 24-hour filter logic for doctor assigned studies
        else {
            const hoursBack = parseInt(process.env.DEFAULT_DATE_RANGE_HOURS) || 24;
            filterStartDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
            filterEndDate = now;
            console.log(`📅 DOCTOR: Applying default ${hoursBack}-hour filter: ${filterStartDate} to ${filterEndDate}`);
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
                case 'AssignedDate':
                    dateField = 'lastAssignmentAt';
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
            
            console.log(`📅 DOCTOR: Applied date filter on field '${dateField}':`, {
                gte: filterStartDate?.toISOString(),
                lte: filterEndDate?.toISOString()
            });
        } else {
            console.log(`📅 DOCTOR: No date filter applied`);
        }

        // Search filter for patient name, accession number, or patient ID
        if (search) {
            queryFilters.$and = queryFilters.$and || [];
            queryFilters.$and.push({
                $or: [
                    { accessionNumber: { $regex: search, $options: 'i' } },
                    { studyInstanceUID: { $regex: search, $options: 'i' } }
                ]
            });
            console.log(`🔍 DOCTOR: Applied search filter: ${search}`);
        }

        // Status-based filtering with optimizations
        if (status) {
            queryFilters.workflowStatus = status;
            console.log(`📋 DOCTOR: Applied status filter: ${status}`);
        } 
        // Allow filtering by category (pending, inprogress, completed)
        else if (category && category !== 'all') {
            switch(category) {
                case 'pending':
                    queryFilters.workflowStatus = 'assigned_to_doctor';
                    break;
                case 'inprogress':
                    queryFilters.workflowStatus = { 
                        $in: ['doctor_opened_report', 'report_in_progress'] 
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
            console.log(`🏷️ DOCTOR: Applied category filter: ${category}`);
        }
        
        // Rest of filtering code (modality, lab, priority, dates)
        if (modality) {
            queryFilters.$and = queryFilters.$and || [];
            queryFilters.$and.push({
                $or: [
                    { modality: modality },
                    { modalitiesInStudy: { $in: [modality] } }
                ]
            });
            console.log(`🏥 DOCTOR: Applied modality filter: ${modality}`);
        }

        if (labId) {
            queryFilters.sourceLab = new mongoose.Types.ObjectId(labId);
            console.log(`🏢 DOCTOR: Applied lab filter: ${labId}`);
        }

        if (priority) {
            queryFilters['assignment.priority'] = priority;
            console.log(`⚡ DOCTOR: Applied priority filter: ${priority}`);
        }

        // 🔧 DEBUG: Log final query filters
        console.log(`🔍 DOCTOR: Final query filters:`, JSON.stringify(queryFilters, null, 2));

        // Add currentCategory field update logic in aggregation pipeline
        const updateCategoryStage = {
            $addFields: {
                currentCategory: {
                    $switch: {
                        branches: [
                            {
                                case: { $eq: ["$workflowStatus", 'assigned_to_doctor'] },
                                then: 'pending'
                            },
                            {
                                case: { $in: ["$workflowStatus", [
                                    'doctor_opened_report',
                                    'report_in_progress'
                                ]] },
                                then: 'inprogress'
                            },
                            {
                                case: { $in: ["$workflowStatus", [
                                    'report_finalized',
                                    'report_uploaded',
                                    'report_downloaded_radiologist',
                                    'report_downloaded',
                                    'final_report_downloaded'
                                ]] },
                                then: 'completed'
                            }
                        ],
                        default: 'unknown'
                    }
                }
            }
        };

        // 🔧 PERFORMANCE: Use aggregation pipeline for complex queries with better performance
        const pipeline = [
            { $match: queryFilters },
            
            // Add the currentCategory field calculation
            updateCategoryStage,
            
            // Continue with existing lookups...
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
                                mrn: 1,
                                firstName: 1,
                                lastName: 1,
                                patientNameRaw: 1,
                                dateOfBirth: 1,
                                gender: 1,
                                ageString: 1,
                                salutation: 1,
                                currentWorkflowStatus: 1,
                                attachments: 1,
                                activeDicomStudyRef: 1,
                                'contactInformation.phone': 1,
                                'contactInformation.email': 1,
                                'medicalHistory.clinicalHistory': 1,
                                'medicalHistory.previousInjury': 1,
                                'medicalHistory.previousSurgery': 1,
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
                                            username: 1,
                                            isActive: 1,
                                            isLoggedIn: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                specialization: 1,
                                licenseNumber: 1,
                                department: 1,
                                qualifications: 1,
                                yearsOfExperience: 1,
                                contactPhoneOffice: 1,
                                isActiveProfile: 1,
                                userAccount: { $arrayElemAt: ['$userAccount', 0] }
                            }
                        }
                    ]
                }
            },
            
            // Alternative assignment lookup (if using assignment.assignedTo structure)
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'assignment.assignedTo',
                    foreignField: '_id',
                    as: 'assignedDoctor',
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
                                            username: 1,
                                            isActive: 1,
                                            isLoggedIn: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $project: {
                                specialization: 1,
                                licenseNumber: 1,
                                department: 1,
                                qualifications: 1,
                                yearsOfExperience: 1,
                                contactPhoneOffice: 1,
                                isActiveProfile: 1,
                                userAccount: { $arrayElemAt: ['$userAccount', 0] }
                            }
                        }
                    ]
                }
            },
            
            // Additional patient name search filter (applied after lookup)
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
                    'assignment.priority': 1,
                    'assignment.assignedAt': 1,
                    lastAssignedDoctor: 1,
                    reportedBy: 1,
                    reportFinalizedAt: 1,
                    clinicalHistory: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1,
                    lastAssignmentAt: 1
                }
            },
            
            // 🔧 PERFORMANCE: Sort by assignment date (newest first) for doctor relevance
            { 
                $sort: { 
                    'assignment.assignedAt': -1,
                    lastAssignmentAt: -1,
                    createdAt: -1 
                } 
            },
            
            { $limit: Math.min(limit, 10000) }
        ];

        // 🔧 PERFORMANCE: Execute queries in parallel
        const [studies, totalStudies] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(queryFilters)
        ]);

        console.log(`📊 DOCTOR: Query results: Found ${studies.length} studies, total matching: ${totalStudies}`);

        // 🔧 OPTIMIZED: Format studies according to admin specification (same format)
        const formattedStudies = studies.map(study => {
            // Get patient data (handle array from lookup)
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

            // 🔧 PERFORMANCE: Build reported by display
            let reportedByDisplay = 'N/A';
            if (doctorData && doctorData.userAccount && study.workflowStatus === 'report_finalized') {
                reportedByDisplay = doctorData.userAccount.fullName || 'N/A';
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
                reportedBy: study.reportedBy || reportedByDisplay,
                assignedDoctorName: doctorData?.userAccount?.fullName || 'Not Assigned',
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                assignedDate: study.lastAssignmentAt || study.assignment?.assignedAt,
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
                                                case: { $eq: ["$workflowStatus", 'assigned_to_doctor'] },
                                                then: "pending"
                                            },
                                            {
                                                case: { $in: ["$workflowStatus", [
                                                    'doctor_opened_report',
                                                    'report_in_progress'
                                                ]] },
                                                then: "inprogress"
                                            },
                                            {
                                                case: { $in: ["$workflowStatus", [
                                                    'report_finalized',
                                                    'report_uploaded',
                                                    'report_downloaded_radiologist',
                                                    'report_downloaded',
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
                                    { 'assignment.priority': { $in: ['EMERGENCY', 'STAT', 'URGENT'] } },
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
                    todayAssigned: [
                        {
                            $match: {
                                $expr: {
                                    $eq: [
                                        { $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$assignment.assignedAt", "$lastAssignmentAt"] } } },
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

        // Add doctor-specific stats
        const urgentStudies = summaryStats[0]?.urgentStudies?.[0]?.count || 0;
        const todayAssigned = summaryStats[0]?.todayAssigned?.[0]?.count || 0;

        const processingTime = Date.now() - startTime;

        console.log(`✅ DOCTOR: Returning ${formattedStudies.length} formatted studies for doctor`);

        const responseData = {
            success: true,
            count: formattedStudies.length,
            totalRecords: totalStudies,
            recordsPerPage: limit,
            data: formattedStudies,
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalRecords: totalStudies,
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
                todayAssigned,
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
                totalMatching: totalStudies,
                doctorId: doctor._id
            } : undefined,
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: limit,
                actualReturned: formattedStudies.length
            }
        };

        console.log(`✅ DOCTOR: Single page query completed in ${processingTime}ms, returned ${formattedStudies.length} studies`);

        res.status(200).json(responseData);

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


// 🔧 OPTIMIZED: getPatientDetailedViewForDoctor (same name, enhanced performance)




//     getAssignedStudies,
//     getPatientDetailedViewForDoctor,
//     startReport,
//     submitReport,
//     getDoctorStats
// };