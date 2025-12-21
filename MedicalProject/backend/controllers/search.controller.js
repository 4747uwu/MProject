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

        // ✅ Doctor filter logic (unchanged)
        if (req.user.role === 'doctor_account') {
            const doctorProfile = await Doctor.findOne({ userAccount: req.user._id })
                .select('_id userAccount')
                .lean();
            
            if (doctorProfile) {
                console.log(`🏥 DOCTOR SEARCH: Restricting to doctor ${doctorProfile._id}`);
                
                matchConditions.$or = [
                    { 'lastAssignedDoctor.doctorId': doctorProfile._id },
                    { 'assignment.assignedTo': doctorProfile.userAccount }
                ];
                
                console.log(`🔒 DOCTOR SEARCH: Applied simple doctor restriction`);
            }
        }

        // ✅ Search logic (unchanged)
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

                case 'description':
                    searchConditions.push(
                        { examDescription: { $regex: trimmedSearchTerm, $options: 'i' } },
                        { 'clinicalHistory.clinicalHistory': { $regex: trimmedSearchTerm, $options: 'i' } }
                    );
                    break;
                    
                default:
                    searchConditions.push(
                    { 'patientInfo.patientName': { $regex: trimmedSearchTerm, $options: 'i' } },
                    { 'patientInfo.patientID': { $regex: trimmedSearchTerm, $options: 'i' } },
                    { patientId: { $regex: trimmedSearchTerm, $options: 'i' } },
                    { accessionNumber: { $regex: trimmedSearchTerm, $options: 'i' } },
                    { examDescription: { $regex: trimmedSearchTerm, $options: 'i' } },
                    { 'clinicalHistory.clinicalHistory': { $regex: trimmedSearchTerm, $options: 'i' } }
                );
            }
            
            if (searchConditions.length > 0) {
                if (matchConditions.$or) {
                    matchConditions.$and = [
                        { $or: matchConditions.$or },
                        { $or: searchConditions }
                    ];
                    delete matchConditions.$or;
                } else {
                    matchConditions.$or = searchConditions;
                }
            }
        }

        // ✅ Lab filter logic (unchanged)
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

        // ✅ ENHANCED: Use EXACT same date filtering logic as getAllStudiesForAdmin
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        const activeDateFilter = quickDatePreset !== 'all' ? quickDatePreset : dateFilter;
        const IST_OFFSET = 5.5 * 60 * 60 * 1000;
        
        if (activeDateFilter && activeDateFilter !== 'all') {
            console.log(`📅 BACKEND SEARCH: Applying ${activeDateFilter} filter to ${dateField}`);
            
            let filterStartDate = null;
            let filterEndDate = null;
            
            if (activeDateFilter === 'custom' && (customDateFrom || customDateTo)) {
                if (customDateFrom) {
                    const customStartIST = new Date(customDateFrom + 'T00:00:00');
                    filterStartDate = new Date(customStartIST.getTime() - IST_OFFSET);
                }
                
                if (customDateTo) {
                    const customEndIST = new Date(customDateTo + 'T23:59:59');
                    filterEndDate = new Date(customEndIST.getTime() - IST_OFFSET);
                }
                console.log(`📅 CUSTOM: Applied custom date filter: ${filterStartDate?.toISOString()} to ${filterEndDate?.toISOString()}`);
            } else {
                const now = Date.now();
                
                switch (activeDateFilter) {
                    case 'last24h':
                        filterEndDate = new Date(now);
                        filterStartDate = new Date(now - 86400000);
                        break;

                    case 'today':
                        const currentTimeIST = new Date(now + IST_OFFSET);
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
                        const currentTimeISTYesterday = new Date(now + IST_OFFSET);
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
                        const currentTimeISTWeek = new Date(now + IST_OFFSET);
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
                        const currentTimeISTMonth = new Date(now + IST_OFFSET);
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

                    default:
                        filterEndDate = new Date();
                        filterStartDate = new Date(now - 86400000);
                }
            }
            
            if (filterStartDate || filterEndDate) {
                matchConditions[dateField] = {};
                if (filterStartDate) matchConditions[dateField].$gte = filterStartDate;
                if (filterEndDate) matchConditions[dateField].$lte = filterEndDate;
            }
        }

        console.log('🔍 BACKEND SEARCH: Applied match conditions:', JSON.stringify(matchConditions, null, 2));

        // 🔥 ENHANCED: Ultra-optimized aggregation pipeline matching getAllStudiesForAdmin
        const pipeline = [];
        
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }

        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $limit: Math.min(parseInt(limit), 1000) },
            // 🔥 CRITICAL: Project ALL fields like getAllStudiesForAdmin
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
                    lastAssignedDoctor: 1, // 🔥 CRITICAL
                    doctorReports: 1,
                    reportInfo: 1,
                    reportFinalizedAt: 1,
                    caseType: 1,
                    patient: 1,
                    sourceLab: 1,
                    patientId: 1,
                    age: 1,
                    gender: 1,
                    clinicalHistory: 1,
                    preProcessedDownload: 1, // 🔥 CRITICAL
                    patientInfo: 1,
                    referringPhysicianName: 1,
                    mlcCase: 1,
                    studyType: 1
                }
            }
        );

        console.log('🚀 BACKEND SEARCH: Executing enhanced pipeline...');
        const queryStart = Date.now();
        
        const [studiesResult, countResult] = await Promise.allSettled([
            DicomStudy.aggregate(pipeline).allowDiskUse(false),
            DicomStudy.countDocuments(matchConditions)
        ]);
        
        if (studiesResult.status === 'rejected') {
            throw new Error(`Studies query failed: ${studiesResult.reason.message}`);
        }
        
        const studies = studiesResult.value;
        const totalRecords = countResult.status === 'fulfilled' ? countResult.value : studies.length;
        const queryTime = Date.now() - queryStart;

        console.log(`⚡ BACKEND SEARCH: Query executed in ${queryTime}ms`);
        console.log(`✅ BACKEND SEARCH: Found ${totalRecords} studies (returning ${studies.length})`);

        // 🔥 ENHANCED: Batch lookups matching getAllStudiesForAdmin
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

            // 🔥 PARALLEL: Optimized batch lookups
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

        // 🔥 ENHANCED: Complete formatting matching getAllStudiesForAdmin
        const formatStart = Date.now();
        
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
            // Get related data from maps
            const patient = lookupMaps.patients.get(study.patient?.toString());
            const sourceLab = lookupMaps.labs.get(study.sourceLab?.toString());

            const hasWasabiZip = study.preProcessedDownload?.zipStatus === 'completed' && 
                        study.preProcessedDownload?.zipUrl &&
                        (!study.preProcessedDownload?.zipExpiresAt || 
                         study.preProcessedDownload.zipExpiresAt > new Date());

            // 🔥 ENHANCED: Handle doctor assignments exactly like getAllStudiesForAdmin
            let latestAssignedDoctor = null;
            let latestAssignmentEntry = null;
            let allDoctorAssignments = [];
            let isLegacyFormat = false;

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
                const sortedAssignments = [...assignmentArray].sort((a, b) => {
                    const dateA = a?.assignedAt ? new Date(a.assignedAt) : new Date(0);
                    const dateB = b?.assignedAt ? new Date(b.assignedAt) : new Date(0);
                    return dateB - dateA;
                });
                
                latestAssignmentEntry = sortedAssignments[0];
                
                if (latestAssignmentEntry?.doctorId) {
                    latestAssignedDoctor = lookupMaps.doctors.get(latestAssignmentEntry.doctorId.toString());
                }

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

            // 🔥 ENHANCED: Patient display logic
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

            const currentCategory = categoryMap[study.workflowStatus] || 'unknown';

            return {
                _id: study._id,
                orthancStudyID: study.orthancStudyID,
                studyInstanceUID: study.studyInstanceUID,
                instanceID: study.studyInstanceUID,
                accessionNumber: safeString(study.accessionNumber),
                patientId: safeString(patientIdForDisplay),
                patientName: safeString(patientDisplay),
                ageGender: safeString(patientAgeGenderDisplay),
                description: safeString(study.studyDescription || study.examDescription || 'N/A'),
                modality: study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                location: safeString(sourceLab?.name || 'N/A'),
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
                currentCategory: currentCategory,
                createdAt: study.createdAt,
                reportedBy: safeString(study.reportInfo?.reporterName || 'N/A'),
                
                // ✅ ENHANCED: Add reported date matching getAllStudiesForAdmin
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                    ? (() => {
                        const latestReport = study.doctorReports.reduce((latest, curr) =>
                            new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                            study.doctorReports[0]
                        );
                        const dt = new Date(latestReport.uploadedAt);
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
                
                // ✅ ENHANCED: Add download options matching getAllStudiesForAdmin
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
                
                // ✅ ENHANCED: Add doctor assignments
                doctorAssignments: allDoctorAssignments,
                
                // ✅ ENHANCED: Add latest assigned doctor details
                latestAssignedDoctorDetails: latestAssignedDoctor ? {
                    _id: latestAssignedDoctor._id,
                    fullName: latestAssignedDoctor.userAccount?.fullName || 'Unknown Doctor',
                    email: latestAssignedDoctor.userAccount?.email || null,
                    specialization: latestAssignedDoctor.specialization || null,
                    isActive: latestAssignedDoctor.userAccount?.isActive || false,
                    assignedAt: latestAssignmentEntry?.assignedAt || null
                } : null,

                // ✅ ENHANCED: Add assignment history
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
                },

                // Keep existing fields for compatibility
                sourceLab: sourceLab,
                patientDetails: patient,
                patientInfo: study.patientInfo,
                modalitiesInStudy: study.modalitiesInStudy,
                referredBy: safeString(study.referringPhysicianName || study.referringPhysician?.name),
                mlcCase: study.mlcCase || false,
                studyType: study.studyType || 'routine',
                referringPhysicianName: safeString(study.referringPhysicianName),
                examDescription: safeString(study.examDescription)
            };
        });

        const formatTime = Date.now() - formatStart;
        const processingTime = Date.now() - startTime;

        console.log(`✅ Formatting completed in ${formatTime}ms`);
        console.log(`🎯 Total processing time: ${processingTime}ms for ${formattedStudies.length} studies`);

        // ✅ ENHANCED: Response format matching getAllStudiesForAdmin structure
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
                hasPrevPage: parseInt(page) > 1,
                recordRange: {
                    start: skip + 1,
                    end: skip + formattedStudies.length
                },
                isSinglePage: totalRecords <= parseInt(limit)
            },
            performance: {
                queryTime: processingTime,
                fromCache: false,
                recordsReturned: formattedStudies.length,
                requestedLimit: parseInt(limit),
                actualReturned: formattedStudies.length,
                breakdown: {
                    coreQuery: queryTime,
                    lookups: studies.length > 0 ? `${Date.now() - formatStart}ms` : 0,
                    formatting: formatTime
                }
            },
            metadata: {
                dateRange: {
                    from: matchConditions[dateField]?.$gte || null,
                    to: matchConditions[dateField]?.$lte || null
                },
                filters: {
                    category: 'all',
                    modality: 'all',
                    labId: locationFilter || 'all',
                    priority: 'all',
                    search: searchTerm || null
                },
                searchFilters: {
                    searchType,
                    searchTerm,
                    selectedLocation,
                    dateFilter: activeDateFilter,
                    dateType
                },
                doctorRestricted: req.user.role === 'doctor_account'
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

// ✅ APPLY THE SAME FIX to getSearchValues function
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

        // Doctor filter logic (unchanged)
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

        // Search logic (unchanged)
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
            
            if (searchConditions.length > 0) {
                if (matchConditions.$or) {
                    matchConditions.$and = [
                        { $or: matchConditions.$or },
                        { $or: searchConditions }
                    ];
                    delete matchConditions.$or;
                } else {
                    matchConditions.$or = searchConditions;
                }
            }
        }

        // Lab filter logic (unchanged)
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

        // ✅ CRITICAL FIX: Apply same corrected date filtering
        const dateField = dateType === 'StudyDate' ? 'studyDate' : 'createdAt';
        const activeDateFilter = quickDatePreset !== 'all' ? quickDatePreset : dateFilter;
        
        if (activeDateFilter && activeDateFilter !== 'all') {
            console.log(`📅 SEARCH VALUES: Applying ${activeDateFilter} filter to ${dateField}`);
            
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
                console.log(`📅 CUSTOM VALUES: Applied custom date filter:`, dateQuery);
            } else {
                // ✅ CRITICAL FIX: Use same corrected IST logic as searchStudies
                const now = new Date();
                console.log(`📅 DEBUG VALUES: Current server time: ${now.toISOString()}`);
                
                const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
                console.log(`📅 DEBUG VALUES: IST time: ${istNow.toISOString()}`);
                
                const todayIST = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
                const todayStartUTC = new Date(todayIST.getTime() - (5.5 * 60 * 60 * 1000));
                const todayEndUTC = new Date(todayStartUTC.getTime() + (24 * 60 * 60 * 1000));
                
                console.log(`📅 DEBUG VALUES: Today start UTC: ${todayStartUTC.toISOString()}`);
                console.log(`📅 DEBUG VALUES: Today end UTC: ${todayEndUTC.toISOString()}`);
                
                const dateQuery = {};
                
                switch (activeDateFilter) {
                    case 'today':
                        dateQuery.$gte = todayStartUTC;
                        dateQuery.$lt = todayEndUTC;
                        console.log(`📅 TODAY VALUES: ${todayStartUTC.toISOString()} to ${todayEndUTC.toISOString()}`);
                        break;
                        
                    case 'yesterday':
                        const yesterdayStartUTC = new Date(todayStartUTC.getTime() - (24 * 60 * 60 * 1000));
                        dateQuery.$gte = yesterdayStartUTC;
                        dateQuery.$lt = todayStartUTC;
                        console.log(`📅 YESTERDAY VALUES: ${yesterdayStartUTC.toISOString()} to ${todayStartUTC.toISOString()}`);
                        break;
                        
                    case 'thisWeek':
                        const startOfWeekIST = new Date(todayIST);
                        startOfWeekIST.setDate(todayIST.getDate() - todayIST.getDay());
                        const startOfWeekUTC = new Date(startOfWeekIST.getTime() - (5.5 * 60 * 60 * 1000));
                        dateQuery.$gte = startOfWeekUTC;
                        console.log(`📅 THIS WEEK VALUES: From ${startOfWeekUTC.toISOString()}`);
                        break;
                        
                    case 'thisMonth':
                        const startOfMonthIST = new Date(todayIST.getFullYear(), todayIST.getMonth(), 1);
                        const startOfMonthUTC = new Date(startOfMonthIST.getTime() - (5.5 * 60 * 60 * 1000));
                        dateQuery.$gte = startOfMonthUTC;
                        console.log(`📅 THIS MONTH VALUES: From ${startOfMonthUTC.toISOString()}`);
                        break;
                        
                    case 'last24h':
                        const last24hUTC = new Date(now.getTime() - (24 * 60 * 60 * 1000));
                        dateQuery.$gte = last24hUTC;
                        console.log(`📅 LAST 24H VALUES: From ${last24hUTC.toISOString()}`);
                        break;
                }
                
                if (Object.keys(dateQuery).length > 0) {
                    matchConditions[dateField] = dateQuery;
                    console.log(`📅 APPLIED VALUES: Date filter for ${activeDateFilter}:`, dateQuery);
                }
            }
        }

        console.log(`🔍 SEARCH VALUES: Applied EXACT match conditions:`, JSON.stringify(matchConditions, null, 2));

        // ✅ Rest of the function remains the same...
        const [statusCountsResult, totalFilteredResult] = await Promise.all([
            DicomStudy.aggregate([
                ...(Object.keys(matchConditions).length > 0 ? [{ $match: matchConditions }] : []),
                { $group: { _id: '$workflowStatus', count: { $sum: 1 } } }
            ]),
            DicomStudy.countDocuments(matchConditions)
        ]);

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