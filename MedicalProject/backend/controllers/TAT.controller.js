import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js';
import Doctor from '../models/doctorModel.js';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';

// 🔧 PERFORMANCE: Advanced caching for TAT reports
const cache = new NodeCache({ 
    stdTTL: 600, // 10 minutes for reports
    checkperiod: 120,
    useClones: false
});

/**
 * 🔧 OPTIMIZED: Get all available locations (enhanced performance)
 */
export const getLocations = async (req, res) => {
    try {
        const startTime = Date.now();
        
        // 🔧 PERFORMANCE: Check cache first
        const cacheKey = 'tat_locations';
        let cachedLocations = cache.get(cacheKey);
        
        if (cachedLocations) {
            return res.status(200).json({
                success: true,
                locations: cachedLocations,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        // 🔧 OPTIMIZED: Lean query with minimal fields
        const labs = await Lab.find({ isActive: true })
            .select('name identifier')
            .lean();
        
        const locations = labs.map(lab => ({
            value: lab._id.toString(),
            label: lab.name,
            code: lab.identifier
        }));

        // 🔧 PERFORMANCE: Cache for 1 hour (locations don't change often)
        cache.set(cacheKey, locations, 3600);
        
        const processingTime = Date.now() - startTime;
        
        return res.status(200).json({
            success: true,
            locations,
            performance: {
                queryTime: processingTime,
                fromCache: false
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching locations:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch locations',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * 🔧 OPTIMIZED: Get all available statuses (enhanced performance)
 */
export const getStatuses = async (req, res) => {
    try {
        const startTime = Date.now();
        
        // 🔧 PERFORMANCE: Static data with caching
        const cacheKey = 'tat_statuses';
        let cachedStatuses = cache.get(cacheKey);
        
        if (cachedStatuses) {
            return res.status(200).json({
                success: true,
                statuses: cachedStatuses,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        // 🔧 OPTIMIZED: Based on actual enum values from dicomStudyModel
        const statuses = [
            { value: 'new_study_received', label: 'New Study' },
            { value: 'pending_assignment', label: 'Pending Assignment' },
            { value: 'assigned_to_doctor', label: 'Assigned to Doctor' },
            { value: 'doctor_opened_report', label: 'Doctor Opened Report' },
            { value: 'report_in_progress', label: 'Report In Progress' },
            { value: 'report_finalized', label: 'Report Finalized' },
            { value: 'report_uploaded', label: 'Report Uploaded' },
            { value: 'report_downloaded_radiologist', label: 'Downloaded by Radiologist' },
            { value: 'report_downloaded', label: 'Report Downloaded' },
            { value: 'final_report_downloaded', label: 'Final Report Downloaded' },
            { value: 'archived', label: 'Archived' }
        ];

        // 🔧 PERFORMANCE: Cache for 24 hours (statuses rarely change)
        cache.set(cacheKey, statuses, 86400);
        
        const processingTime = Date.now() - startTime;
        
        return res.status(200).json({
            success: true,
            statuses,
            performance: {
                queryTime: processingTime,
                fromCache: false
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching statuses:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch statuses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * 🔧 HIGH-PERFORMANCE: Generate TAT report with advanced optimizations
 */
export const getTATReport = async (req, res) => {
    try {
        const startTime = Date.now();
        const { location, dateType, fromDate, toDate, status, page = 1, limit = 100 } = req.query;
        
        console.log(`🔍 Generating TAT report - Location: ${location}, DateType: ${dateType}, From: ${fromDate}, To: ${toDate}`);
        
        if (!location) {
            return res.status(400).json({
                success: false,
                message: 'Location is required'
            });
        }

        // 🔧 PERFORMANCE: Check cache for this specific query
        const cacheKey = `tat_report_${location}_${dateType}_${fromDate}_${toDate}_${status}_${page}_${limit}`;
        let cachedReport = cache.get(cacheKey);
        
        if (cachedReport) {
            return res.status(200).json({
                success: true,
                ...cachedReport,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        // 🔧 OPTIMIZED: Build aggregation pipeline for maximum performance
        const pipeline = [
            // Stage 1: Match by location
            {
                $match: {
                    sourceLab: new mongoose.Types.ObjectId(location)
                }
            }
        ];

        // 🔧 PERFORMANCE: Add date filtering based on type
        if (fromDate && toDate) {
            const startDate = new Date(fromDate);
            startDate.setHours(0, 0, 0, 0);
            
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);

            let dateFilter = {};
            
            switch(dateType) {
                case 'studyDate':
                    // Handle YYYYMMDD string format
                    const fromDateStr = fromDate.replace(/-/g, '');
                    const toDateStr = toDate.replace(/-/g, '');
                    dateFilter.studyDate = { $gte: fromDateStr, $lte: toDateStr };
                    break;
                    
                case 'uploadDate':
                    dateFilter.createdAt = { $gte: startDate, $lte: endDate };
                    break;
                    
                case 'assignedDate':
                    dateFilter['assignment.assignedAt'] = { $gte: startDate, $lte: endDate };
                    break;
                    
                case 'reportDate':
                    dateFilter['reportInfo.finalizedAt'] = { $gte: startDate, $lte: endDate };
                    break;
                    
                default:
                    dateFilter.createdAt = { $gte: startDate, $lte: endDate };
            }
            
            pipeline.push({ $match: dateFilter });
        }

        // 🔧 PERFORMANCE: Add status filter
        if (status) {
            pipeline.push({ $match: { workflowStatus: status } });
        }

        // 🔧 OPTIMIZED: Lookup patient data efficiently
        pipeline.push({
            $lookup: {
                from: 'patients',
                localField: 'patient',
                foreignField: '_id',
                as: 'patientData',
                pipeline: [
                    {
                        $project: {
                            patientID: 1,
                            firstName: 1,
                            lastName: 1,
                            patientNameRaw: 1,
                            gender: 1,
                            'computed.fullName': 1
                        }
                    }
                ]
            }
        });

        // 🔧 OPTIMIZED: Lookup lab data efficiently
        pipeline.push({
            $lookup: {
                from: 'labs',
                localField: 'sourceLab',
                foreignField: '_id',
                as: 'labData',
                pipeline: [
                    {
                        $project: {
                            name: 1,
                            identifier: 1
                        }
                    }
                ]
            }
        });

        // 🔧 OPTIMIZED: Lookup doctor data efficiently
        pipeline.push({
            $lookup: {
                from: 'doctors',
                localField: 'assignment.assignedTo',
                foreignField: '_id',
                as: 'doctorData',
                pipeline: [
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'userAccount',
                            foreignField: '_id',
                            as: 'userAccount'
                        }
                    },
                    {
                        $project: {
                            'userAccount.fullName': 1,
                            specialization: 1
                        }
                    }
                ]
            }
        });

        // 🔧 FIXED: Project only needed fields and calculate TAT with corrected $type syntax
        pipeline.push({
            $project: {
                // Basic study info
                studyInstanceUID: 1,
                accessionNumber: 1,
                modality: 1,
                modalitiesInStudy: 1,
                examDescription: 1,
                numberOfSeries: 1,
                numberOfImages: 1,
                workflowStatus: 1,
                studyDate: 1,
                createdAt: 1,
                
                // Assignment info
                'assignment.assignedAt': 1,
                'assignment.priority': 1,
                
                // Report info
                'reportInfo.startedAt': 1,
                'reportInfo.finalizedAt': 1,
                
                // Timing info
                'timingInfo.uploadToAssignmentMinutes': 1,
                'timingInfo.assignmentToReportMinutes': 1,
                'timingInfo.reportToDownloadMinutes': 1,
                'timingInfo.totalTATMinutes': 1,
                
                // Flattened lookups
                patient: { $arrayElemAt: ['$patientData', 0] },
                lab: { $arrayElemAt: ['$labData', 0] },
                doctor: { $arrayElemAt: ['$doctorData', 0] },
                
                // 🔧 FIXED: Calculate TAT fields with proper $type syntax
                studyToReportTAT: {
                    $cond: [
                        { 
                            $and: [
                                { $ne: ['$studyDate', null] },
                                { $ne: ['$studyDate', ''] },
                                { $ne: ['$reportInfo.finalizedAt', null] },
                                { $eq: [{ $type: '$studyDate' }, 'string'] } // 🔧 FIXED: Correct $type syntax
                            ]
                        },
                        {
                            $divide: [
                                { 
                                    $subtract: [
                                        '$reportInfo.finalizedAt',
                                        { 
                                            $dateFromString: { 
                                                dateString: {
                                                    $cond: [
                                                        { $gte: [{ $strLenCP: '$studyDate' }, 8] },
                                                        {
                                                            $concat: [
                                                                { $substr: ['$studyDate', 0, 4] },
                                                                '-',
                                                                { $substr: ['$studyDate', 4, 2] },
                                                                '-',
                                                                { $substr: ['$studyDate', 6, 2] }
                                                            ]
                                                        },
                                                        '$studyDate'
                                                    ]
                                                },
                                                onError: null
                                            }
                                        }
                                    ]
                                },
                                60000 // Convert to minutes
                            ]
                        },
                        null
                    ]
                },
                
                uploadToReportTAT: {
                    $cond: [
                        { $and: [{ $ne: ['$createdAt', null] }, { $ne: ['$reportInfo.finalizedAt', null] }] },
                        {
                            $divide: [
                                { $subtract: ['$reportInfo.finalizedAt', '$createdAt'] },
                                60000 // Convert to minutes
                            ]
                        },
                        null
                    ]
                },
                
                assignToReportTAT: {
                    $cond: [
                        { $and: [{ $ne: ['$assignment.assignedAt', null] }, { $ne: ['$reportInfo.finalizedAt', null] }] },
                        {
                            $divide: [
                                { $subtract: ['$reportInfo.finalizedAt', '$assignment.assignedAt'] },
                                60000 // Convert to minutes
                            ]
                        },
                        null
                    ]
                }
            }
        });

        // 🔧 PERFORMANCE: Sort by most recent first
        pipeline.push({
            $sort: { createdAt: -1 }
        });

        // 🔧 PERFORMANCE: Add pagination
        const skipAmount = (parseInt(page) - 1) * parseInt(limit);
        pipeline.push({ $skip: skipAmount });
        pipeline.push({ $limit: parseInt(limit) });

        // 🔧 CRITICAL: Execute aggregation with allowDiskUse for large datasets
        console.log('🔍 Executing TAT aggregation pipeline...');
        const [studies, totalCount] = await Promise.all([
            DicomStudy.aggregate(pipeline).allowDiskUse(true),
            DicomStudy.countDocuments({
                sourceLab: new mongoose.Types.ObjectId(location),
                ...(status && { workflowStatus: status })
            })
        ]);

        console.log(`✅ Retrieved ${studies.length} studies out of ${totalCount} total`);

        // 🔧 FIXED: Helper function to safely format study date
        const formatStudyDate = (studyDate) => {
            if (!studyDate) return null;
            
            try {
                // Convert to string if it's not already
                const dateStr = String(studyDate);
                
                // Check if it's in YYYYMMDD format (8 digits)
                if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    return new Date(`${year}-${month}-${day}`).toISOString();
                }
                
                // If it's already a valid date string, parse it
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                    return parsedDate.toISOString();
                }
                
                return null;
            } catch (error) {
                console.warn('⚠️ Error formatting study date:', studyDate, error.message);
                return null;
            }
        };

        // 🔧 OPTIMIZED: Process studies efficiently with proper error handling
        const processedStudies = studies.map(study => {
            // Patient info
            const patient = study.patient || {};
            const patientName = patient.computed?.fullName || 
                              (patient.firstName && patient.lastName ? 
                               `${patient.lastName}, ${patient.firstName}` : 
                               patient.patientNameRaw) || '-';

            // Doctor info
            const doctor = study.doctor || {};
            const reportedBy = doctor.userAccount?.[0]?.fullName || '-';

            // Modality formatting
            const modality = study.modalitiesInStudy?.length > 0 ? 
                           study.modalitiesInStudy.join(', ') : 
                           study.modality || '-';

            // Date formatting helper
            const formatDate = (date) => {
                if (!date) return null;
                try {
                    return new Date(date).toISOString();
                } catch (e) {
                    return null;
                }
            };

            // 🔧 FIXED: Study date formatting with proper error handling
            const studyDateFormatted = formatStudyDate(study.studyDate);

            return {
                _id: study._id,
                studyStatus: study.workflowStatus || '-',
                patientId: patient.patientID || '-',
                patientName,
                gender: patient.gender || '-',
                referredBy: study.referredBy || '-',
                accessionNumber: study.accessionNumber || '-',
                studyDescription: study.examDescription || '-',
                modality,
                series_Images: `${study.numberOfSeries || 0}/${study.numberOfImages || 0}`,
                institutionName: study.lab?.name || '-',
                billedOnStudyDate: studyDateFormatted,
                uploadDate: formatDate(study.createdAt),
                assignedDate: formatDate(study.assignment?.assignedAt),
                reportDate: formatDate(study.reportInfo?.finalizedAt),
                diffStudyAndReportTAT: study.studyToReportTAT && study.studyToReportTAT > 0 ? 
                                     `${Math.round(study.studyToReportTAT)} Minutes` : '-',
                diffUploadAndReportTAT: study.uploadToReportTAT && study.uploadToReportTAT > 0 ? 
                                      `${Math.round(study.uploadToReportTAT)} Minutes` : '-',
                diffAssignAndReportTAT: study.assignToReportTAT && study.assignToReportTAT > 0 ? 
                                      `${Math.round(study.assignToReportTAT)} Minutes` : '-',
                reportedBy
            };
        });

        // 🔧 PERFORMANCE: Calculate summary statistics with null checks
        const reportedStudies = studies.filter(s => s.reportInfo?.finalizedAt);
        const summary = {
            totalStudies: totalCount,
            reportedStudies: reportedStudies.length,
            averageStudyToReport: reportedStudies.length > 0 ? 
                Math.round(reportedStudies.reduce((sum, s) => sum + (s.studyToReportTAT || 0), 0) / reportedStudies.length) : 0,
            averageUploadToReport: reportedStudies.length > 0 ? 
                Math.round(reportedStudies.reduce((sum, s) => sum + (s.uploadToReportTAT || 0), 0) / reportedStudies.length) : 0,
            averageAssignToReport: reportedStudies.length > 0 ? 
                Math.round(reportedStudies.reduce((sum, s) => sum + (s.assignToReportTAT || 0), 0) / reportedStudies.length) : 0
        };

        const responseData = {
            studies: processedStudies,
            summary,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalRecords: totalCount,
                limit: parseInt(limit),
                hasNextPage: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
                hasPrevPage: parseInt(page) > 1
            }
        };

        // 🔧 PERFORMANCE: Cache the result for 5 minutes
        cache.set(cacheKey, responseData, 300);

        const processingTime = Date.now() - startTime;
        console.log(`✅ TAT report generated in ${processingTime}ms`);

        return res.status(200).json({
            success: true,
            ...responseData,
            performance: {
                queryTime: processingTime,
                fromCache: false,
                studiesProcessed: studies.length
            }
        });

    } catch (error) {
        console.error('❌ Error generating TAT report:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate TAT report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * 🔧 HIGH-PERFORMANCE: Export TAT report to Excel (optimized for large datasets)
 */
export const exportTATReport = async (req, res) => {
    try {
        const startTime = Date.now();
        const { location, dateType, fromDate, toDate, status } = req.query;
        
        console.log(`📊 Exporting TAT report - Location: ${location}`);
        
        if (!location) {
            return res.status(400).json({
                success: false,
                message: 'Location is required'
            });
        }

        // 🔧 PERFORMANCE: Stream processing for large datasets
        const pipeline = [
            {
                $match: {
                    sourceLab: new mongoose.Types.ObjectId(location)
                }
            }
        ];

        // Add date filtering
        if (fromDate && toDate) {
            const startDate = new Date(fromDate);
            startDate.setHours(0, 0, 0, 0);
            
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);

            let dateFilter = {};
            
            switch(dateType) {
                case 'studyDate':
                    const fromDateStr = fromDate.replace(/-/g, '');
                    const toDateStr = toDate.replace(/-/g, '');
                    dateFilter.studyDate = { $gte: fromDateStr, $lte: toDateStr };
                    break;
                case 'uploadDate':
                    dateFilter.createdAt = { $gte: startDate, $lte: endDate };
                    break;
                case 'assignedDate':
                    dateFilter['assignment.assignedAt'] = { $gte: startDate, $lte: endDate };
                    break;
                case 'reportDate':
                    dateFilter['reportInfo.finalizedAt'] = { $gte: startDate, $lte: endDate };
                    break;
                default:
                    dateFilter.createdAt = { $gte: startDate, $lte: endDate };
            }
            
            pipeline.push({ $match: dateFilter });
        }

        if (status) {
            pipeline.push({ $match: { workflowStatus: status } });
        }

        // Add lookups for complete data
        pipeline.push(
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientData'
                }
            },
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'labData'
                }
            },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'assignment.assignedTo',
                    foreignField: '_id',
                    as: 'doctorData',
                    pipeline: [
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'userAccount',
                                foreignField: '_id',
                                as: 'userAccount'
                            }
                        }
                    ]
                }
            }
        );

        // 🔧 PERFORMANCE: Create Excel workbook with streaming
        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
            stream: res,
            useStyles: false // Faster performance
        });

        const worksheet = workbook.addWorksheet('TAT Report');

        // Set response headers early
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="TAT_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);

        // 🔧 OPTIMIZED: Define columns efficiently
        worksheet.columns = [
            { header: 'StudyStatus', key: 'studyStatus', width: 20 },
            { header: 'PatientId', key: 'patientId', width: 15 },
            { header: 'PatientName', key: 'patientName', width: 25 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'ReferredBy', key: 'referredBy', width: 20 },
            { header: 'AccessionNumber', key: 'accessionNumber', width: 20 },
            { header: 'StudyDescription', key: 'studyDescription', width: 25 },
            { header: 'Modality', key: 'modality', width: 10 },
            { header: 'Series_Images', key: 'seriesImages', width: 15 },
            { header: 'InstitutionName', key: 'institutionName', width: 20 },
            { header: 'BilledOnStudyDate', key: 'billedOnStudyDate', width: 20 },
            { header: 'UploadDate', key: 'uploadDate', width: 20 },
            { header: 'AssignedDate', key: 'assignedDate', width: 20 },
            { header: 'ReportDate', key: 'reportDate', width: 20 },
            { header: 'DiffStudyandReportTAT', key: 'diffStudyAndReportTAT', width: 22 },
            { header: 'DiffUploadandReportTAT', key: 'diffUploadAndReportTAT', width: 22 },
            { header: 'DiffAssignandReportTAT', key: 'diffAssignAndReportTAT', width: 22 },
            { header: 'ReportedBy', key: 'reportedBy', width: 20 }
        ];

        // Style header
        worksheet.getRow(1).font = { bold: true };

        // 🔧 FIXED: Helper function to safely format study date
        const formatStudyDateSafe = (studyDate) => {
            if (!studyDate) return '';
            
            try {
                // Convert to string if it's not already
                const dateStr = String(studyDate);
                
                // Check if it's in YYYYMMDD format (8 digits)
                if (dateStr.length >= 8 && /^\d{8}/.test(dateStr)) {
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    return new Date(`${year}-${month}-${day}`).toLocaleString();
                }
                
                // If it's already a valid date string, parse it
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                    return parsedDate.toLocaleString();
                }
                
                return '';
            } catch (error) {
                console.warn('⚠️ Error formatting study date for Excel:', studyDate, error.message);
                return '';
            }
        };

        // 🔧 FIXED: Helper function to safely calculate study to report TAT
        const calculateStudyToReportTATSafe = (studyDate, reportDate) => {
            if (!studyDate || !reportDate) return '';
            
            try {
                const dateStr = String(studyDate);
                let studyDateObj;
                
                // Parse YYYYMMDD format
                if (dateStr.length >= 8 && /^\d{8}/.test(dateStr)) {
                    const year = dateStr.substring(0, 4);
                    const month = dateStr.substring(4, 6);
                    const day = dateStr.substring(6, 8);
                    studyDateObj = new Date(`${year}-${month}-${day}`);
                } else {
                    studyDateObj = new Date(dateStr);
                }
                
                if (isNaN(studyDateObj.getTime())) return '';
                
                const diff = (new Date(reportDate) - studyDateObj) / (1000 * 60); // minutes
                return diff > 0 ? `${Math.round(diff)} Minutes` : '';
            } catch (error) {
                console.warn('⚠️ Error calculating study to report TAT:', studyDate, reportDate, error.message);
                return '';
            }
        };

        // 🔧 PERFORMANCE: Stream data processing
        const cursor = DicomStudy.aggregate(pipeline).cursor({ batchSize: 100 });
        let processedCount = 0;

        for (let study = await cursor.next(); study != null; study = await cursor.next()) {
            const patient = study.patientData?.[0] || {};
            const lab = study.labData?.[0] || {};
            const doctor = study.doctorData?.[0] || {};

            const patientName = patient.computed?.fullName || 
                              (patient.firstName && patient.lastName ? 
                               `${patient.lastName}, ${patient.firstName}` : 
                               patient.patientNameRaw) || '';

            const reportedBy = doctor.userAccount?.[0]?.fullName || '';

            const formatDate = (date) => {
                if (!date) return '';
                try {
                    return new Date(date).toLocaleString();
                } catch (error) {
                    return '';
                }
            };

            // Calculate TAT values with safety checks
            const calculateTAT = (startDate, endDate) => {
                if (!startDate || !endDate) return '';
                try {
                    const diff = (new Date(endDate) - new Date(startDate)) / (1000 * 60); // minutes
                    return diff > 0 ? `${Math.round(diff)} Minutes` : '';
                } catch (error) {
                    return '';
                }
            };

            // 🔧 FIXED: Safe row data with proper error handling
            const rowData = {
                studyStatus: study.workflowStatus || '',
                patientId: patient.patientID || '',
                patientName,
                gender: patient.gender || '',
                referredBy: study.referredBy || '',
                accessionNumber: study.accessionNumber || '',
                studyDescription: study.examDescription || '',
                modality: study.modality || study.modalitiesInStudy?.join(', ') || '',
                seriesImages: `${study.numberOfSeries || '0'}/${study.numberOfImages || '0'}`,
                institutionName: lab.name || '',
                billedOnStudyDate: formatStudyDateSafe(study.studyDate),
                uploadDate: formatDate(study.createdAt),
                assignedDate: formatDate(study.assignment?.assignedAt),
                reportDate: formatDate(study.reportInfo?.finalizedAt),
                diffStudyAndReportTAT: calculateStudyToReportTATSafe(study.studyDate, study.reportInfo?.finalizedAt),
                diffUploadAndReportTAT: calculateTAT(study.createdAt, study.reportInfo?.finalizedAt),
                diffAssignAndReportTAT: calculateTAT(study.assignment?.assignedAt, study.reportInfo?.finalizedAt),
                reportedBy
            };

            try {
                worksheet.addRow(rowData);
                processedCount++;
                
                // 🔧 PERFORMANCE: Commit in batches for better memory management
                if (processedCount % 100 === 0) {
                    await worksheet.commit();
                    console.log(`📊 Processed ${processedCount} records...`);
                }
            } catch (rowError) {
                console.error('❌ Error adding row to Excel:', rowError.message);
                console.error('Row data:', JSON.stringify(rowData, null, 2));
                // Continue processing other rows
            }
        }

        // Final commit and close
        await worksheet.commit();
        await workbook.commit();

        const processingTime = Date.now() - startTime;
        console.log(`✅ TAT Excel export completed in ${processingTime}ms - ${processedCount} records`);

    } catch (error) {
        console.error('❌ Error exporting TAT report:', error);
        console.error('Error stack:', error.stack);
        
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to export TAT report',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
};

// 🔧 ADDITIONAL: Get TAT analytics dashboard
export const getTATAnalytics = async (req, res) => {
    try {
        const startTime = Date.now();
        const { location, period = '30d' } = req.query;

        if (!location) {
            return res.status(400).json({
                success: false,
                message: 'Location is required'
            });
        }

        // 🔧 PERFORMANCE: Check cache for analytics
        const cacheKey = `tat_analytics_${location}_${period}`;
        let cachedAnalytics = cache.get(cacheKey);

        if (cachedAnalytics) {
            return res.status(200).json({
                success: true,
                data: cachedAnalytics,
                performance: {
                    queryTime: Date.now() - startTime,
                    fromCache: true
                }
            });
        }

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
        startDate.setDate(startDate.getDate() - days);

        // 🔧 OPTIMIZED: Analytics aggregation pipeline
        const analyticsData = await DicomStudy.aggregate([
            {
                $match: {
                    sourceLab: new mongoose.Types.ObjectId(location),
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalStudies: { $sum: 1 },
                    completedStudies: {
                        $sum: {
                            $cond: [
                                { $in: ['$workflowStatus', ['report_finalized', 'report_downloaded', 'final_report_downloaded']] },
                                1,
                                0
                            ]
                        }
                    },
                    avgUploadToReport: {
                        $avg: {
                            $cond: [
                                { $and: ['$timingInfo.uploadToAssignmentMinutes', '$timingInfo.assignmentToReportMinutes'] },
                                { $add: ['$timingInfo.uploadToAssignmentMinutes', '$timingInfo.assignmentToReportMinutes'] },
                                null
                            ]
                        }
                    },
                    avgAssignmentToReport: { $avg: '$timingInfo.assignmentToReportMinutes' },
                    urgentStudies: {
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

        const analytics = analyticsData[0] || {
            totalStudies: 0,
            completedStudies: 0,
            avgUploadToReport: 0,
            avgAssignmentToReport: 0,
            urgentStudies: 0
        };

        // Calculate completion rate
        analytics.completionRate = analytics.totalStudies > 0 ? 
            ((analytics.completedStudies / analytics.totalStudies) * 100).toFixed(1) : '0.0';

        // Format TAT values
        analytics.avgUploadToReportFormatted = analytics.avgUploadToReport ? 
            `${Math.round(analytics.avgUploadToReport / 60)}h ${Math.round(analytics.avgUploadToReport % 60)}m` : 'N/A';
        
        analytics.avgAssignmentToReportFormatted = analytics.avgAssignmentToReport ? 
            `${Math.round(analytics.avgAssignmentToReport / 60)}h ${Math.round(analytics.avgAssignmentToReport % 60)}m` : 'N/A';

        // 🔧 PERFORMANCE: Cache for 15 minutes
        cache.set(cacheKey, analytics, 900);

        const processingTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            data: analytics,
            performance: {
                queryTime: processingTime,
                fromCache: false
            }
        });

    } catch (error) {
        console.error('❌ Error generating TAT analytics:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate TAT analytics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export default {
    getLocations,
    getStatuses,
    getTATReport,
    exportTATReport,
    getTATAnalytics
};