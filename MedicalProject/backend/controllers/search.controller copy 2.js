import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';
import Doctor from '../models/doctorModel.js';  // ✅ ADD: Import Doctor model
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

const safeString = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

// 🔥 SIMPLE SEARCH: With doctor filter check
export const searchStudies = async (req, res) => {
    try {
        const startTime = Date.now();
        
        console.log('🔍 BACKEND SEARCH: Received request with params:', req.query);
        
        const {
            searchType = 'all',
            searchTerm = '',
            selectedLocation = 'ALL',
            location = '',
            dateFilter = 'all',
            customDateFrom,
            customDateTo,
            dateType = 'UploadDate',
            quickDatePreset = 'all',
            page = 1,
            limit = 5000
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const matchConditions = {};

        // ✅ SIMPLE: Check if user is a doctor and add restriction
        if (req.user.role === 'doctor_account') {
            const doctorProfile = await Doctor.findOne({ userAccount: req.user._id })
                .select('_id userAccount')
                .lean();
            
            if (doctorProfile) {
                console.log(`🏥 DOCTOR SEARCH: Restricting to doctor ${doctorProfile._id}`);
                
                // ✅ SIMPLE: Just add doctor filter to match conditions
                matchConditions.$or = [
                    { 'lastAssignedDoctor.doctorId': doctorProfile._id },
                    { 'assignment.assignedTo': doctorProfile.userAccount }  // Use userAccount for assignment
                ];
                
                console.log(`🔒 DOCTOR SEARCH: Applied simple doctor restriction`);
            }
        }

        // Search logic
        if (searchTerm && searchTerm.trim()) {
            const trimmedSearchTerm = searchTerm.trim();
            console.log(`🔍 BACKEND SEARCH: Quick search "${trimmedSearchTerm}" (type: ${searchType})`);
            
            const searchConditions = [];
            
            switch (searchType) {
                case 'patientName':
                    searchConditions.push(
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } }
                    );
                    break;
                    
                case 'patientId':
                    searchConditions.push(
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } }
                    );
                    break;
                    
                case 'accession':
                    matchConditions.accessionNumber = { $regex: trimmedSearchTerm, $options: 'i' };
                    break;
                    
                default:
                    searchConditions.push(
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } },
                        { accessionNumber: { $regex: trimmedSearchTerm, $options: 'i' } }
                    );
            }
            
            // ✅ SIMPLE: Combine doctor restriction with search conditions
            if (searchConditions.length > 0) {
                if (matchConditions.$or) {
                    // If doctor restriction exists, combine with AND
                    matchConditions.$and = [
                        { $or: matchConditions.$or },  // Doctor restriction
                        { $or: searchConditions }      // Search conditions
                    ];
                    delete matchConditions.$or;
                } else {
                    // No doctor restriction, just search
                    matchConditions.$or = searchConditions;
                }
            }
        }

        // Lab filter
        const locationFilter = selectedLocation !== 'ALL' ? selectedLocation : location;
        if (locationFilter && locationFilter !== 'ALL') {
            console.log(`📍 BACKEND SEARCH: Lab filter: ${locationFilter}`);
            
            if (mongoose.Types.ObjectId.isValid(locationFilter)) {
                matchConditions.sourceLab = new mongoose.Types.ObjectId(locationFilter);
            } else {
                const lab = await Lab.findOne({
                    $or: [
                        { identifier: locationFilter },
                        { name: { $regex: locationFilter, $options: 'i' } }
                    ]
                }).lean();
                
                if (lab) {
                    matchConditions.sourceLab = lab._id;
                } else {
                    // Fallback - combine with existing $or if it exists
                    if (matchConditions.$or && !matchConditions.$and) {
                        matchConditions.$or.push(
                            { location: { $regex: locationFilter, $options: 'i' } },
                            { institutionName: { $regex: locationFilter, $options: 'i' } }
                        );
                    } else {
                        const locationConditions = [
                            { location: { $regex: locationFilter, $options: 'i' } },
                            { institutionName: { $regex: locationFilter, $options: 'i' } }
                        ];
                        
                        if (matchConditions.$and) {
                            matchConditions.$and.push({ $or: locationConditions });
                        } else {
                            matchConditions.$or = [...(matchConditions.$or || []), ...locationConditions];
                        }
                    }
                }
            }
        }

        // Date filtering
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        const activeDateFilter = quickDatePreset !== 'all' ? quickDatePreset : dateFilter;
        
        if (activeDateFilter && activeDateFilter !== 'all') {
            const IST_OFFSET = 5.5 * 60 * 60 * 1000;
            const now = new Date();
            const today = new Date(now.getTime() + IST_OFFSET);
            today.setUTCHours(18, 30, 0, 0);
            
            if (activeDateFilter === 'custom' && (customDateFrom || customDateTo)) {
                const dateQuery = {};
                if (customDateFrom) dateQuery.$gte = new Date(customDateFrom);
                if (customDateTo) {
                    const toDate = new Date(customDateTo);
                    toDate.setHours(23, 59, 59, 999);
                    dateQuery.$lte = toDate;
                }
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
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
            }
        }

        console.log('🔍 BACKEND SEARCH: Applied match conditions:', JSON.stringify(matchConditions, null, 2));

        // Execute query
        const pipeline = [];
        
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }

        // Add lookups
        pipeline.push(
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'sourceLab',
                    pipeline: [{ $project: { name: 1, identifier: 1, contactEmail: 1 } }]
                }
            },
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientDetails',
                    pipeline: [{ $project: { patientNameRaw: 1, firstName: 1, lastName: 1, medicalHistory: 1, clinicalInfo: 1 } }]
                }
            }
        );

        // Sort and paginate
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) }
        );

        console.log('🚀 BACKEND SEARCH: Executing pipeline...');
        const queryStart = Date.now();
        
        const [studiesResult, countResult] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments(matchConditions)
        ]);
        
        const queryTime = Date.now() - queryStart;
        const studies = studiesResult;
        const totalRecords = countResult;

        console.log(`⚡ BACKEND SEARCH: Query executed in ${queryTime}ms`);
        console.log(`✅ BACKEND SEARCH: Found ${totalRecords} studies (returning ${studies.length})`);

        // Format studies (keep your existing formatting logic)
        const formattedStudies = studies.map(study => {
            const patient = study.patientDetails?.[0];
            const sourceLab = study.sourceLab?.[0];

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
                referredBy: safeString(study.referringPhysicianName || study.referringPhysician?.name),
                mlcCase: study.mlcCase || false,
                studyType: study.studyType || 'routine',
                sourceLab: sourceLab,
                patientDetails: patient,
                patientInfo: study.patientInfo,
                modalitiesInStudy: study.modalitiesInStudy,
                clinicalHistory: safeString(study.clinicalHistory),
                referringPhysicianName: safeString(study.referringPhysicianName),
                studyDescription: safeString(study.studyDescription),
                examDescription: safeString(study.examDescription)
            };
        });

        const processingTime = Date.now() - startTime;

        res.status(200).json({
            success: true,
            count: formattedStudies.length,
            totalRecords: totalRecords,
            recordsPerPage: parseInt(limit),
            data: formattedStudies,
            searchPerformed: true,
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
                recordsProcessed: totalRecords
            }
        });

    } catch (error) {
        console.error('❌ BACKEND SEARCH: Error executing search:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute search',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ SIMPLE: Apply same doctor filter to getSearchValues
// ✅ FIXED: Apply same doctor filter AND all other filters to getSearchValues
export const getSearchValues = async (req, res) => {
    try {
        const startTime = Date.now();
        console.log(`🔍 SEARCH VALUES: Fetching with params:`, req.query);
        
        const {
            searchType = 'all',
            searchTerm = '',
            selectedLocation = 'ALL',
            location = '',
            dateFilter = 'all',
            customDateFrom,
            customDateTo,
            dateType = 'UploadDate',
            quickDatePreset = 'all'
        } = req.query;

        const matchConditions = {};

        // ✅ CRITICAL: Same doctor filter as searchStudies
        if (req.user.role === 'doctor_account') {
            const doctorProfile = await Doctor.findOne({ userAccount: req.user._id })
                .select('_id userAccount')
                .lean();
            
            if (doctorProfile) {
                matchConditions.$or = [
                    { 'lastAssignedDoctor.doctorId': doctorProfile._id },
                    { 'assignment.assignedTo': doctorProfile.userAccount }
                ];
                console.log(`🏥 SEARCH VALUES: Applied doctor restriction for ${doctorProfile._id}`);
            }
        }

        // ✅ CRITICAL: Apply EXACT same search logic as searchStudies
        if (searchTerm && searchTerm.trim()) {
            const trimmedSearchTerm = searchTerm.trim();
            console.log(`🔍 SEARCH VALUES: Quick search "${trimmedSearchTerm}" (type: ${searchType})`);
            
            const searchConditions = [];
            
            switch (searchType) {
                case 'patientName':
                    searchConditions.push(
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } }
                    );
                    break;
                    
                case 'patientId':
                    searchConditions.push(
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } }
                    );
                    break;
                    
                case 'accession':
                    matchConditions.accessionNumber = { $regex: trimmedSearchTerm, $options: 'i' };
                    break;
                    
                default:
                    searchConditions.push(
                        { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                        { patientId: { $regex: trimmedSearchTerm, $options: 'i' } },
                        { accessionNumber: { $regex: trimmedSearchTerm, $options: 'i' } }
                    );
            }
            
            // ✅ CRITICAL: Same combining logic as searchStudies
            if (searchConditions.length > 0) {
                if (matchConditions.$or) {
                    // If doctor restriction exists, combine with AND
                    matchConditions.$and = [
                        { $or: matchConditions.$or },  // Doctor restriction
                        { $or: searchConditions }      // Search conditions
                    ];
                    delete matchConditions.$or;
                } else {
                    // No doctor restriction, just search
                    matchConditions.$or = searchConditions;
                }
            }
        }

        // ✅ CRITICAL: Apply EXACT same lab filter as searchStudies
        const locationFilter = selectedLocation !== 'ALL' ? selectedLocation : location;
        if (locationFilter && locationFilter !== 'ALL') {
            console.log(`📍 SEARCH VALUES: Lab filter: ${locationFilter}`);
            
            if (mongoose.Types.ObjectId.isValid(locationFilter)) {
                matchConditions.sourceLab = new mongoose.Types.ObjectId(locationFilter);
            } else {
                const lab = await Lab.findOne({
                    $or: [
                        { identifier: locationFilter },
                        { name: { $regex: locationFilter, $options: 'i' } }
                    ]
                }).lean();
                
                if (lab) {
                    matchConditions.sourceLab = lab._id;
                } else {
                    // Fallback - combine with existing $or if it exists
                    if (matchConditions.$or && !matchConditions.$and) {
                        matchConditions.$or.push(
                            { location: { $regex: locationFilter, $options: 'i' } },
                            { institutionName: { $regex: locationFilter, $options: 'i' } }
                        );
                    } else {
                        const locationConditions = [
                            { location: { $regex: locationFilter, $options: 'i' } },
                            { institutionName: { $regex: locationFilter, $options: 'i' } }
                        ];
                        
                        if (matchConditions.$and) {
                            matchConditions.$and.push({ $or: locationConditions });
                        } else {
                            matchConditions.$or = [...(matchConditions.$or || []), ...locationConditions];
                        }
                    }
                }
            }
        }

        // ✅ CRITICAL: Apply EXACT same date filtering as searchStudies
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        const activeDateFilter = quickDatePreset !== 'all' ? quickDatePreset : dateFilter;
        
        if (activeDateFilter && activeDateFilter !== 'all') {
            const IST_OFFSET = 5.5 * 60 * 60 * 1000;
            const now = new Date();
            const today = new Date(now.getTime() + IST_OFFSET);
            today.setUTCHours(18, 30, 0, 0);
            
            if (activeDateFilter === 'custom' && (customDateFrom || customDateTo)) {
                const dateQuery = {};
                if (customDateFrom) dateQuery.$gte = new Date(customDateFrom);
                if (customDateTo) {
                    const toDate = new Date(customDateTo);
                    toDate.setHours(23, 59, 59, 999);
                    dateQuery.$lte = toDate;
                }
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                }
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
            }
        }

        console.log(`🔍 SEARCH VALUES: Applied EXACT match conditions:`, JSON.stringify(matchConditions, null, 2));

        // Execute and return counts with SAME filters
        const [statusCountsResult, totalFilteredResult] = await Promise.all([
            DicomStudy.aggregate([
                ...(Object.keys(matchConditions).length > 0 ? [{ $match: matchConditions }] : []),
                { $group: { _id: '$workflowStatus', count: { $sum: 1 } } }
            ]),
            DicomStudy.countDocuments(matchConditions)
        ]);

        // Calculate status totals
        const statusCategories = {
            pending: ['new_study_received', 'pending_assignment', 'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress', 'report_downloaded_radiologist', 'report_downloaded'],
            inprogress: ['report_finalized', 'report_drafted', 'report_uploaded'],
            completed: ['final_report_downloaded']
        };

        let pending = 0, inprogress = 0, completed = 0;
        statusCountsResult.forEach(({ _id: status, count }) => {
            if (statusCategories.pending.includes(status)) pending += count;
            else if (statusCategories.inprogress.includes(status)) inprogress += count;
            else if (statusCategories.completed.includes(status)) completed += count;
        });

        const processingTime = Date.now() - startTime;
        console.log(`📊 SEARCH VALUES: FILTERED Results - Total: ${totalFilteredResult}, Pending: ${pending}, InProgress: ${inprogress}, Completed: ${completed}`);
        console.log(`🔒 SEARCH VALUES: Doctor restricted: ${req.user.role === 'doctor_account'}`);

        res.status(200).json({
            success: true,
            total: totalFilteredResult,
            pending,
            inprogress,
            completed,
            filtersApplied: Object.keys(matchConditions).length > 0,
            doctorRestricted: req.user.role === 'doctor_account',
            performance: { 
                queryTime: processingTime,
                filtersApplied: Object.keys(matchConditions).length > 0,
                matchConditionsCount: Object.keys(matchConditions).length
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

// Keep your existing getSearchSuggestions function as-is
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

        // ✅ ADD: Doctor restriction for suggestions too
        let doctorProfile = null;
        if (req.user.role === 'doctor_account') {
            doctorProfile = await Doctor.findOne({ userAccount: req.user._id }).lean();
            if (!doctorProfile) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor profile not found'
                });
            }
        }

        // Base match condition with doctor restriction if applicable
        let baseMatch = {};
        if (doctorProfile) {
            baseMatch = {
                $or: [
                    { 'lastAssignedDoctor.doctorId': doctorProfile._id },
                    { 'assignment.assignedTo': doctorProfile.userAccount }       // ✅ User account ID
                ]
            };
        }

        switch (searchType) {
            case 'patientName':
                aggregationPipeline = [
                    {
                        $match: {
                            ...baseMatch,
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
                            ...baseMatch,
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
                            ...baseMatch,
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
            doctorRestricted: !!doctorProfile,
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