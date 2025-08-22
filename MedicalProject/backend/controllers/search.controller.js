import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';
import mongoose from 'mongoose';

// Helper function for DICOM date/time formatting
const formatDicomDateTime = (studyDate, studyTime) => {
    if (!studyDate) return 'N/A';
    
    let dateTime = new Date(studyDate);
    
    if (studyTime && studyTime.length >= 6) {
        const hours = parseInt(studyTime.substring(0, 2));
        const minutes = parseInt(studyTime.substring(2, 4));
        const seconds = parseInt(studyTime.substring(4, 6));
        dateTime.setUTCHours(hours, minutes, seconds, 0);
    }
    
    return dateTime.toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC'
    }).replace(',', '');
};

// Add this helper function at the top of the file, after imports:
const safeString = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

// 🔥 HYBRID SEARCH: Quick search + Lab selection only (Advanced filters stay frontend)
export const searchStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        
        console.log('🔍 BACKEND HYBRID SEARCH: Received request with params:', req.query);
        
        // Extract ONLY quick search and lab selection parameters
        const {
            // ✅ BACKEND: Quick search parameters
            searchType = 'all',
            searchTerm = '',
            
            // ✅ BACKEND: Lab selection
            selectedLocation = 'ALL',
            location = '',
            
            // ✅ BACKEND: Date filters (keep these in backend)
            dateFilter = 'all',
            customDateFrom,
            customDateTo,
            dateType = 'UploadDate',
            quickDatePreset = 'all',
            
            // Pagination
            page = 1,
            limit = 5000
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const matchConditions = {};

        // 🔍 BACKEND SEARCH LOGIC: Only quick search
        if (searchTerm && searchTerm.trim()) {
            const trimmedSearchTerm = searchTerm.trim();
            console.log(`🔍 BACKEND SEARCH: Quick search "${trimmedSearchTerm}" (type: ${searchType})`);
            
            switch (searchType) {
                case 'patientName':
                    matchConditions.$or = [
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
                    break;
                    
                case 'patientId':
                    matchConditions.$or = [
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
                    break;
                    
                case 'accession':
                    matchConditions.accessionNumber = { $regex: trimmedSearchTerm, $options: 'i' };
                    break;
                    
                default: // Search all fields
                    matchConditions.$or = [
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } },
                        { accessionNumber: { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
            }
        }

        // 📍 BACKEND LAB FILTER: Lab selection
        const locationFilter = selectedLocation !== 'ALL' ? selectedLocation : location;
        if (locationFilter && locationFilter !== 'ALL') {
            console.log(`📍 BACKEND SEARCH: Lab filter: ${locationFilter}`);
            
            // ✅ FIX: Check if locationFilter is a valid ObjectId first
            if (mongoose.Types.ObjectId.isValid(locationFilter)) {
                // Direct ObjectId match - this is the most accurate
                matchConditions.sourceLab = new mongoose.Types.ObjectId(locationFilter);
                console.log(`📍 BACKEND SEARCH: Using direct ObjectId match for lab: ${locationFilter}`);
            } else {
                // Try to find the lab by identifier or name for non-ObjectId values
                const lab = await Lab.findOne({
                    $or: [
                        { identifier: locationFilter },
                        { name: { $regex: locationFilter, $options: 'i' } }
                    ]
                }).lean();
                
                if (lab) {
                    // Filter by lab ObjectId for exact matching
                    matchConditions.sourceLab = lab._id;
                    console.log(`📍 BACKEND SEARCH: Found lab ${lab.name}, filtering by ObjectId: ${lab._id}`);
                } else {
                    // Fallback to string matching for legacy data
                    matchConditions.$or = [
                        ...(matchConditions.$or || []),
                        { location: { $regex: locationFilter, $options: 'i' } },
                        { institutionName: { $regex: locationFilter, $options: 'i' } }
                    ];
                    console.log(`📍 BACKEND SEARCH: Using string fallback for: ${locationFilter}`);
                }
            }
        }

        // 📅 BACKEND DATE FILTER: Keep date filtering in backend
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        const activeDateFilter = quickDatePreset !== 'all' ? quickDatePreset : dateFilter;
        
        if (activeDateFilter && activeDateFilter !== 'all') {
            const IST_OFFSET = 5.5 * 60 * 60 * 1000;
            const now = new Date();
            const today = new Date(now.getTime() + IST_OFFSET);
            today.setUTCHours(18, 30, 0, 0); // IST midnight
            
            if (activeDateFilter === 'custom' && (customDateFrom || customDateTo)) {
                const dateQuery = {};
                
                if (customDateFrom) {
                    dateQuery.$gte = new Date(customDateFrom);
                }
                
                if (customDateTo) {
                    const toDate = new Date(customDateTo);
                    toDate.setHours(23, 59, 59, 999);
                    dateQuery.$lte = toDate;
                }
                
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
                console.log(`📅 BACKEND SEARCH: Custom date filter: ${customDateFrom} to ${customDateTo}`);
            } else {
                const dateQuery = {};
                
                switch (activeDateFilter) {
                    case 'today':
                        const todayStart = new Date(today);
                        const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
                        dateQuery.$gte = todayStart;
                        dateQuery.$lt = todayEnd;
                        break;
                    case 'yesterday':
                        const yesterdayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                        dateQuery.$gte = yesterdayStart;
                        dateQuery.$lt = today;
                        break;
                    case 'thisWeek':
                        const startOfWeek = new Date(today);
                        startOfWeek.setDate(today.getDate() - today.getDay());
                        dateQuery.$gte = startOfWeek;
                        break;
                    case 'thisMonth':
                        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                        dateQuery.$gte = startOfMonth;
                        break;
                    case 'last24h':
                        dateQuery.$gte = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        break;
                }
                
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
                console.log(`📅 BACKEND SEARCH: Date filter: ${activeDateFilter}`);
            }
        }

        console.log('🔍 BACKEND HYBRID SEARCH: Applied match conditions:', JSON.stringify(matchConditions, null, 2));

        // 🚀 EXECUTE: Aggregation pipeline
        const pipeline = [];
        
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }

        // Add lookups for related data
        pipeline.push(
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'sourceLab',
                    pipeline: [
                        { $project: { name: 1, identifier: 1, contactEmail: 1 } }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientDetails',
                    pipeline: [
                        { $project: { 
                            patientNameRaw: 1, 
                            firstName: 1, 
                            lastName: 1,
                            medicalHistory: 1,
                            clinicalInfo: 1
                        }}
                    ]
                }
            }
        );

        // Add sorting and pagination
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) }
        );

        console.log('🚀 BACKEND HYBRID SEARCH: Executing aggregation pipeline...');
        const queryStart = Date.now();
        
        // Execute main query and count query in parallel
        const [studiesResult, countResult] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(matchConditions)
        ]);
        
        const queryTime = Date.now() - queryStart;
        const studies = studiesResult;
        const totalRecords = countResult;

        console.log(`⚡ BACKEND HYBRID SEARCH: Query executed in ${queryTime}ms`);
        console.log(`✅ BACKEND HYBRID SEARCH: Found ${totalRecords} studies (returning ${studies.length} for processing)`);

        // 🔧 FORMAT: Studies to match admin controller format exactly
        const formattedStudies = studies.map(study => {
            const patient = study.patientDetails?.[0];
            const sourceLab = study.sourceLab?.[0];

            // Build patient display with proper fallback chain
            let patientDisplay = "N/A";
            let patientIdForDisplay = study.patientId || "N/A";
            
            if (study.patientInfo?.patientName) {
                patientDisplay = study.patientInfo.patientName;
            } else if (patient?.patientNameRaw) {
                patientDisplay = patient.patientNameRaw;
            } else if (patient?.firstName || patient?.lastName) {
                patientDisplay = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
            }

            if (study.patientInfo?.patientID) {
                patientIdForDisplay = study.patientInfo.patientID;
            }

            const patientAgeGenderDisplay = study.age && study.gender ? 
                                          `${study.age}/${study.gender}` : 
                                          study.age || study.gender || 'N/A';

            // Handle modality properly
            let displayModality = 'N/A';
            if (study.modalitiesInStudy && Array.isArray(study.modalitiesInStudy) && study.modalitiesInStudy.length > 0) {
                displayModality = study.modalitiesInStudy.join(', ');
            } else if (study.modality) {
                displayModality = study.modality;
            }

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                instanceID: study.studyInstanceUID,
                accessionNumber: safeString(study.accessionNumber),
                patientId: safeString(patientIdForDisplay),
                patientName: safeString(patientDisplay),
                ageGender: safeString(patientAgeGenderDisplay),
                description: safeString(study.studyDescription || study.examDescription),
                modality: safeString(displayModality),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: safeString(sourceLab?.name),
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
                workflowStatus: study.workflowStatus,
                currentCategory: study.workflowStatus,
                createdAt: study.createdAt,
                reportedBy: safeString(study.reportInfo?.reporterName),
                ReportAvailable: study.ReportAvailable || false,
                priority: study.assignment?.priority || 'NORMAL',
                caseType: study.caseType || 'routine',
                // ✅ FIX: Ensure all fields used in frontend filtering are safe strings
                referredBy: safeString(study.referringPhysicianName || study.referringPhysician?.name),
                mlcCase: study.mlcCase || false,
                studyType: study.studyType || 'routine',
                // Include all original study fields
                sourceLab: sourceLab,
                patientDetails: patient,
                // ✅ CRITICAL FIX: Ensure all fields used in frontend filtering are strings
                patientInfo: study.patientInfo,
                modalitiesInStudy: study.modalitiesInStudy,
                clinicalHistory: safeString(study.clinicalHistory), // ✅ This was causing the error
                // Add other fields that might be used in filtering
                referringPhysicianName: safeString(study.referringPhysicianName),
                studyDescription: safeString(study.studyDescription),
                examDescription: safeString(study.examDescription)
            };
        });

        const processingTime = Date.now() - startTime;

        console.log(`📊 BACKEND HYBRID SEARCH: Returning ${formattedStudies.length} studies for frontend filtering`);

        // Return response in same format as admin controller
        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalRecords,
            recordsPerPage: parseInt(limit),
            data: formattedStudies,
            searchPerformed: true,
            backendFiltering: 'hybrid', // ✅ Indicate hybrid mode
            globalSearch: activeDateFilter === 'all' && !searchTerm && !locationFilter,
            hybridMode: true, // ✅ New flag for frontend
            backendFilters: {
                searchTerm: searchTerm || null,
                searchType: searchTerm ? searchType : null,
                selectedLocation: locationFilter !== 'ALL' ? locationFilter : null,
                dateFilter: activeDateFilter
            },
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalRecords / parseInt(limit)),
                totalRecords: totalRecords,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalRecords / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            },
            performance: {
                totalTime: processingTime,
                queryTime,
                recordsProcessed: totalRecords,
                backend: 'hybrid-search-lab-date'
            },
            meta: {
                executionTime: processingTime,
                searchPerformed: true,
                backend: 'mongodb-aggregation',
                cacheUsed: false,
                fieldsSearched: searchTerm ? [searchType || 'all'] : (locationFilter ? ['location'] : ['date']),
                hybridMode: true
            }
        });

    } catch (error) {
        console.error('❌ BACKEND HYBRID SEARCH: Error executing search:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute hybrid search',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            searchPerformed: false
        });
    }
};

// Keep existing functions...
export const getSearchSuggestions = async (req, res) => {
    try {
        const { searchType = 'all', searchTerm = '', limit = 10 } = req.query;
        
        if (!searchTerm || searchTerm.trim().length < 2) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        const trimmedSearchTerm = searchTerm.trim();
        let aggregationPipeline = [];

        switch (searchType) {
            case 'patientName':
                aggregationPipeline = [
                    {
                        $match: {
                            'patientInfo.patientName': {
                                $regex: trimmedSearchTerm,
                                $options: 'i'
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$patientInfo.patientName',
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            suggestion: '$_id',
                            count: 1,
                            _id: 0
                        }
                    }
                ];
                break;

            case 'patientId':
                aggregationPipeline = [
                    {
                        $match: {
                            $or: [
                                {
                                    'patientInfo.patientID': {
                                        $regex: trimmedSearchTerm,
                                        $options: 'i'
                                    }
                                },
                                {
                                    patientId: {
                                        $regex: trimmedSearchTerm,
                                        $options: 'i'
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: {
                                $ifNull: ['$patientInfo.patientID', '$patientId']
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            suggestion: '$_id',
                            count: 1,
                            _id: 0
                        }
                    }
                ];
                break;

            case 'accession':
                aggregationPipeline = [
                    {
                        $match: {
                            accessionNumber: {
                                $regex: trimmedSearchTerm,
                                $options: 'i'
                            }
                        }
                    },
                    {
                        $group: {
                            _id: '$accessionNumber',
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: parseInt(limit) },
                    {
                        $project: {
                            suggestion: '$_id',
                            count: 1,
                            _id: 0
                        }
                    }
                ];
                break;

            default:
                return res.json({
                    success: true,
                    suggestions: []
                });
        }

        const suggestions = await DicomStudy.aggregate(aggregationPipeline);

        res.json({
            success: true,
            searchType,
            searchTerm: trimmedSearchTerm,
            suggestions: suggestions.map(s => ({
                text: s.suggestion,
                count: s.count
            }))
        });

    } catch (error) {
        console.error('❌ Error getting search suggestions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get search suggestions',
            suggestions: []
        });
    }
};

// 🆕 NEW: Get filtered values based on search criteria
export const getSearchValues = async (req, res) => {
    try {
        const startTime = Date.now();
        console.log(`🔍 BACKEND SEARCH VALUES: Fetching filtered dashboard values with params:`, req.query);
        
        // ✅ COPY EXACT SAME FILTERING LOGIC AS searchStudies
        const {
            searchType = 'all',
            searchTerm = '',
            patientName = '',
            patientId = '',
            accessionNumber = '',
            description = '',
            refName = '',
            workflowStatus = 'all',
            selectedLocation = 'ALL',
            location = '',
            modality = '',
            emergencyCase = 'false',
            mlcCase = 'false',
            studyType = 'all',
            dateFilter = 'all',
            customDateFrom,
            customDateTo,
            dateType = 'UploadDate',
            quickDatePreset = 'all'
        } = req.query;

        const matchConditions = {};

        // 🔍 EXACT SAME SEARCH LOGIC
        if (searchTerm && searchTerm.trim()) {
            const trimmedSearchTerm = searchTerm.trim();
            console.log(`🔍 SEARCH VALUES: Quick search "${trimmedSearchTerm}" (type: ${searchType})`);
            
            switch (searchType) {
                case 'patientName':
                    matchConditions.$or = [
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
                    break;
                    
                case 'patientId':
                    matchConditions.$or = [
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
                    break;
                    
                case 'accession':
                    matchConditions.accessionNumber = { $regex: trimmedSearchTerm, $options: 'i' };
                    break;
                    
                default:
                    matchConditions.$or = [
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } },
                        { accessionNumber: { $regex: trimmedSearchTerm, $options: 'i' } }
                    ];
            }
        }

        // Advanced search fields
        if (patientName && patientName.trim()) {
            console.log(`🔍 SEARCH VALUES: Patient name search: "${patientName}"`);
            delete matchConditions.$or;
            matchConditions['patientInfo.patientName'] = { $regex: patientName.trim(), $options: 'i' };
        }

        if (patientId && patientId.trim()) {
            console.log(`🔍 SEARCH VALUES: Patient ID search: "${patientId}"`);
            delete matchConditions.$or;
            matchConditions.$or = [
                { 'patientInfo.patientID': { $regex: patientId.trim(), $options: 'i' } },
                { patientId: { $regex: patientId.trim(), $options: 'i' } }
            ];
        }

        if (accessionNumber && accessionNumber.trim()) {
            console.log(`🔍 SEARCH VALUES: Accession search: "${accessionNumber}"`);
            delete matchConditions.$or;
            matchConditions.accessionNumber = { $regex: accessionNumber.trim(), $options: 'i' };
        }

        // Status filter
        if (workflowStatus && workflowStatus !== 'all') {
            const statusMap = {
                'pending': ['new_study_received', 'pending_assignment', 'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress', 'report_downloaded_radiologist', 'report_downloaded'],
                'inprogress': ['report_finalized', 'report_drafted', 'report_uploaded'],
                'completed': ['final_report_downloaded']
            };
            
            if (statusMap[workflowStatus]) {
                matchConditions.workflowStatus = { $in: statusMap[workflowStatus] };
            }
            console.log(`🏷️ SEARCH VALUES: Status filter: ${workflowStatus}`);
        }

        // Lab filter
        const locationFilter = selectedLocation !== 'ALL' ? selectedLocation : location;
        if (locationFilter && locationFilter !== 'ALL') {
            console.log(`📍 SEARCH VALUES: Lab filter: ${locationFilter}`);
            
            // ✅ FIX: Check if locationFilter is a valid ObjectId first
            if (mongoose.Types.ObjectId.isValid(locationFilter)) {
                // Direct ObjectId match
                matchConditions.sourceLab = new mongoose.Types.ObjectId(locationFilter);
                console.log(`📍 SEARCH VALUES: Using direct ObjectId match for lab: ${locationFilter}`);
            } else {
                // Try to find the lab by identifier or name
                const lab = await Lab.findOne({
                    $or: [
                        { identifier: locationFilter },
                        { name: { $regex: locationFilter, $options: 'i' } }
                    ]
                }).lean();
                
                if (lab) {
                    matchConditions.sourceLab = lab._id;
                    console.log(`📍 SEARCH VALUES: Found lab ${lab.name}, filtering by ObjectId: ${lab._id}`);
                } else {
                    // Fallback to string matching
                    matchConditions.$or = [
                        ...(matchConditions.$or || []),
                        { location: { $regex: locationFilter, $options: 'i' } },
                        { institutionName: { $regex: locationFilter, $options: 'i' } }
                    ];
                    console.log(`📍 SEARCH VALUES: Using string fallback for: ${locationFilter}`);
                }
            }
        }

        // Modality filter
        if (modality && modality.trim()) {
            const modalities = modality.split(',').map(m => m.trim()).filter(m => m);
            if (modalities.length > 0) {
                matchConditions.$or = [
                    ...(matchConditions.$or || []),
                    { modality: { $in: modalities } },
                    { modalitiesInStudy: { $in: modalities } }
                ];
                console.log(`🏥 SEARCH VALUES: Modality filter: ${modalities.join(', ')}`);
            }
        }

        if (emergencyCase === 'true') {
            matchConditions.$or = [
                ...(matchConditions.$or || []),
                { caseType: { $in: ['urgent', 'emergency'] } },
                { priority: 'URGENT' }
            ];
            console.log('🚨 SEARCH VALUES: Emergency cases only');
        }

        // ✅ COPY EXACT DATE FILTERING LOGIC
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        const activeDateFilter = quickDatePreset !== 'all' ? quickDatePreset : dateFilter;
        
        if (activeDateFilter && activeDateFilter !== 'all') {
            const IST_OFFSET = 5.5 * 60 * 60 * 1000;
            const now = new Date();
            const today = new Date(now.getTime() + IST_OFFSET);
            today.setUTCHours(18, 30, 0, 0); // IST midnight
            
            if (activeDateFilter === 'custom' && (customDateFrom || customDateTo)) {
                const dateQuery = {};
                
                if (customDateFrom) {
                    dateQuery.$gte = new Date(customDateFrom);
                }
                
                if (customDateTo) {
                    const toDate = new Date(customDateTo);
                    toDate.setHours(23, 59, 59, 999);
                    dateQuery.$lte = toDate;
                }
                
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
                console.log(`📅 SEARCH VALUES: Custom date filter: ${customDateFrom} to ${customDateTo}`);
            } else {
                const dateQuery = {};
                
                switch (activeDateFilter) {
                    case 'today':
                        const todayStart = new Date(today);
                        const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
                        dateQuery.$gte = todayStart;
                        dateQuery.$lt = todayEnd;
                        break;
                    case 'yesterday':
                        const yesterdayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                        dateQuery.$gte = yesterdayStart;
                        dateQuery.$lt = today;
                        break;
                    case 'thisWeek':
                        const startOfWeek = new Date(today);
                        startOfWeek.setDate(today.getDate() - today.getDay());
                        dateQuery.$gte = startOfWeek;
                        break;
                    case 'thisMonth':
                        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                        dateQuery.$gte = startOfMonth;
                        break;
                    case 'last24h':
                        dateQuery.$gte = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                        break;
                }
                
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
                console.log(`📅 SEARCH VALUES: Date filter: ${activeDateFilter}`);
            }
        }

        console.log(`🔍 SEARCH VALUES: Applied filters:`, JSON.stringify(matchConditions, null, 2));

        // Status mapping
        const statusCategories = {
            pending: ['new_study_received', 'pending_assignment', 'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress', 'report_downloaded_radiologist', 'report_downloaded'],
            inprogress: ['report_finalized', 'report_drafted', 'report_uploaded'],
            completed: ['final_report_downloaded']
        };

        // Execute aggregation with filters
        const pipeline = [];
        
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }
        
        pipeline.push({
            $group: {
                _id: '$workflowStatus',
                count: { $sum: 1 }
            }
        });

        const [statusCountsResult, totalFilteredResult] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            DicomStudy.countDocuments(matchConditions)
        ]);

        const statusCounts = statusCountsResult;
        const totalFiltered = totalFilteredResult;

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

        const processingTime = Date.now() - startTime;
        console.log(`🎯 SEARCH VALUES: Fetched in ${processingTime}ms with filters applied`);
        console.log(`📊 SEARCH VALUES: Results - Total: ${totalFiltered}, Pending: ${pending}, InProgress: ${inprogress}, Completed: ${completed}`);

        res.status(200).json({
            success: true,
            total: totalFiltered,
            pending: pending,
            inprogress: inprogress,
            completed: completed,
            filtersApplied: Object.keys(matchConditions).length > 0,
            performance: {
                queryTime: processingTime,
                fromCache: false,
                filtersApplied: Object.keys(matchConditions).length > 0
            }
        });

    } catch (error) {
        console.error('❌ Error fetching search values:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching search statistics.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};