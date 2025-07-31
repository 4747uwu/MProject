import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js';
import Doctor from '../models/doctorModel.js';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';
import { calculateStudyTAT } from '../utils/TATutility.js';
import patient from '../models/patientModel.js';

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

            switch (dateType) {
                case 'studyDate':
                    // ✅ FIXED: Handle both YYYYMMDD string and Date object formats
                    if (typeof fromDate === 'string' && fromDate.includes('-')) {
                        // ISO date format (YYYY-MM-DD) - convert to YYYYMMDD for comparison
                        const fromDateStr = fromDate.replace(/-/g, '');
                        const toDateStr = toDate.replace(/-/g, '');
                        
                        dateFilter.$or = [
                            // Handle string studyDate (YYYYMMDD format)
                            { 
                                studyDate: { 
                                    $type: "string",
                                    $gte: fromDateStr, 
                                    $lte: toDateStr 
                                }
                            },
                            // Handle Date studyDate
                            { 
                                studyDate: { 
                                    $type: "date",
                                    $gte: startDate, 
                                    $lte: endDate 
                                }
                            }
                        ];
                    } else {
                        // Direct date comparison
                        dateFilter.studyDate = { $gte: startDate, $lte: endDate };
                    }
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

        // 🔧 OPTIMIZED: Lookup related data efficiently in a single pass
        pipeline.push(
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientData',
                    pipeline: [{ $project: { patientID: 1, firstName: 1, lastName: 1, patientNameRaw: 1, gender: 1, 'computed.fullName': 1 } }]
                }
            },
            {
                $lookup: {
                    from: 'labs',
                    localField: 'sourceLab',
                    foreignField: '_id',
                    as: 'labData',
                    pipeline: [{ $project: { name: 1, identifier: 1 } }]
                }
            },
            {
                $lookup: {
                    from: 'doctors',
                    localField: 'assignment.assignedTo',
                    foreignField: '_id',
                    as: 'doctorData',
                    pipeline: [
                        { $lookup: { from: 'users', localField: 'userAccount', foreignField: '_id', as: 'userAccount' } },
                        { $project: { 'userAccount.fullName': 1, specialization: 1 } }
                    ]
                }
            }
        );

        // 🔧 CRITICAL: Project only needed fields and explicitly include calculatedTAT
        pipeline.push({
            $project: {
                // Basic study info
                workflowStatus: 1, studyDate: 1, createdAt: 1, accessionNumber: 1,
                examDescription: 1, modality: 1, modalitiesInStudy: 1, referredBy: 1,
                seriesCount: 1, instanceCount: 1,
                // Assignment & Report Info
                assignment: 1, reportInfo: 1,
                // THE GOAL: Include the pre-calculated TAT object from the database
                calculatedTAT: 1,
                // Flattened lookups for easier access
                patient: { $arrayElemAt: ['$patientData', 0] },
                lab: { $arrayElemAt: ['$labData', 0] },
                doctor: { $arrayElemAt: ['$doctorData', 0] }
            }
        });

        // 🔧 PERFORMANCE: Add faceting for data and total count in one query
        const facetStage = {
            $facet: {
                paginatedResults: [
                    { $sort: { createdAt: -1 } },
                    { $skip: (parseInt(page) - 1) * parseInt(limit) },
                    { $limit: parseInt(limit) }
                ],
                totalCount: [
                    { $count: 'count' }
                ]
            }
        };
        pipeline.push(facetStage);

        // 🔧 CRITICAL: Execute aggregation with allowDiskUse for large datasets
        console.log('🔍 Executing TAT aggregation pipeline...');
        const result = await DicomStudy.aggregate(pipeline).allowDiskUse(true);

        const studies = result[0].paginatedResults;
        const totalCount = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
        
        console.log(`✅ Retrieved ${studies.length} studies out of ${totalCount} total`);

        // 🔧 OPTIMIZED: Process studies efficiently, using the fetched calculatedTAT
        const processedStudies = studies.map(study => {
            // 🔧 CRITICAL: Prioritize using calculatedTAT from the database.
            // If it's not present (e.g., for older records), calculate it on-the-fly as a fallback.
            const tat = study.calculatedTAT || calculateStudyTAT(study);

            const patient = study.patient || {};
            const patientName = patient.computed?.fullName ||
                (patient.firstName && patient.lastName ? `${patient.lastName}, ${patient.firstName}` : patient.patientNameRaw) || '-';

            const modality = study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A');
            const reportedBy = study.reportInfo?.reporterName || study.doctor?.userAccount?.[0]?.fullName || '-';
            const formatDate = (date) => (date ? new Date(date).toLocaleString() : '');

            // ✅ FIXED: Handle study date formatting consistently
            const formatStudyDate = (studyDate) => {
                if (!studyDate) return '-';
                
                // Handle YYYYMMDD string format
                if (typeof studyDate === 'string' && studyDate.length === 8) {
                    const year = studyDate.substring(0, 4);
                    const month = studyDate.substring(4, 6);
                    const day = studyDate.substring(6, 8);
                    return `${day}/${month}/${year}`;
                }
                
                // Handle Date object
                if (studyDate instanceof Date) {
                    return studyDate.toLocaleDateString('en-GB');
                }
                
                // Fallback: try to parse as date
                try {
                    const date = new Date(studyDate);
                    if (!isNaN(date.getTime())) {
                        return date.toLocaleDateString('en-GB');
                    }
                } catch (error) {
                    console.warn('Invalid study date format:', studyDate);
                }
                
                return studyDate.toString();
            };

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
                series_Images: `${study.seriesCount || 0}/${study.instanceCount || 0}`,
                institutionName: study.lab?.name || '-',
                billedOnStudyDate: formatStudyDate(study.studyDate),
                uploadDate: formatDate(study.createdAt),
                // Handle both old and new assignment structures
                assignedDate: formatDate(study.assignment?.[0]?.assignedAt || study.assignment?.assignedAt),
                reportDate: formatDate(study.reportInfo?.finalizedAt),
                reportedBy: study.reportInfo?.reporterName 
                
                || 'N/A',
                reportedDate: study.reportInfo?.finalizedAt
                ? new Date(study.reportInfo.finalizedAt).toLocaleString('en-GB', {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).replace(',', '')
                : null,
                
                // 🔧 GOAL ACHIEVED: Use fields from the `tat` object for the response
                diffStudyAndReportTAT: tat.studyToReportTATFormatted || '-',
                diffUploadAndReportTAT: tat.uploadToReportTATFormatted || '-',
                diffAssignAndReportTAT: tat.assignmentToReportTATFormatted || '-',
                uploadToAssignmentTAT: tat.uploadToAssignmentTATFormatted || '-',

                // 🔧 ADD: Send the full, structured TAT object for detailed frontend use
                fullTatDetails: tat 
            };
        });

        // 🔧 PERFORMANCE: Calculate summary statistics using the already fetched `calculatedTAT`
        const reportedStudies = studies.filter(s => s.reportInfo?.finalizedAt);
        const summary = {
            totalStudies: totalCount,
            reportedStudies: reportedStudies.length,
            averageUploadToReport: reportedStudies.length > 0
                ? Math.round(reportedStudies.reduce((sum, s) => sum + (s.calculatedTAT?.uploadToReportTAT || 0), 0) / reportedStudies.length)
                : 0,
            averageAssignToReport: reportedStudies.length > 0
                ? Math.round(reportedStudies.reduce((sum, s) => sum + (s.calculatedTAT?.assignmentToReportTAT || 0), 0) / reportedStudies.length)
                : 0
        };

        const responseData = {
            studies: processedStudies,
            summary,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalRecords: totalCount,
                limit: parseInt(limit)
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
            return res.status(400).json({ success: false, message: 'Location is required' });
        }

        // 🔧 CONSISTENCY: Use the same base pipeline as getTATReport
        const pipeline = [
             { $match: { sourceLab: new mongoose.Types.ObjectId(location) } }
        ];

        // Add date filtering
        if (fromDate && toDate) {
            const startDate = new Date(fromDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);
            let dateFilter = {};
            switch(dateType) { /* ... same date logic as getTATReport ... */ 
                case 'studyDate': dateFilter.studyDate = { $gte: fromDate.replace(/-/g, ''), $lte: toDate.replace(/-/g, '') }; break;
                case 'uploadDate': dateFilter.createdAt = { $gte: startDate, $lte: endDate }; break;
                case 'assignedDate': dateFilter['assignment.assignedAt'] = { $gte: startDate, $lte: endDate }; break;
                case 'reportDate': dateFilter['reportInfo.finalizedAt'] = { $gte: startDate, $lte: endDate }; break;
                default: dateFilter.createdAt = { $gte: startDate, $lte: endDate };
            }
            pipeline.push({ $match: dateFilter });
        }

        if (status) {
            pipeline.push({ $match: { workflowStatus: status } });
        }
        
        // Add same lookups and projection as getTATReport to include calculatedTAT
        pipeline.push( /* ... same lookup stages ... */
            { $lookup: { from: 'patients', localField: 'patient', foreignField: '_id', as: 'patientData' } },
            { $lookup: { from: 'labs', localField: 'sourceLab', foreignField: '_id', as: 'labData' } },
            { $lookup: { from: 'doctors', localField: 'assignment.assignedTo', foreignField: '_id', as: 'doctorData', pipeline: [{ $lookup: { from: 'users', localField: 'userAccount', foreignField: '_id', as: 'userAccount' }}]}}
        );

        pipeline.push({
            $project: { /* ... same projection as getTATReport to fetch calculatedTAT ... */
                workflowStatus: 1, studyDate: 1, createdAt: 1, accessionNumber: 1,
                examDescription: 1, modality: 1, modalitiesInStudy: 1, referredBy: 1,
                seriesCount: 1, instanceCount: 1, assignment: 1, reportInfo: 1,
                calculatedTAT: 1, // Include calculatedTAT
                patientData: { $arrayElemAt: ['$patientData', 0] },
                labData: { $arrayElemAt: ['$labData', 0] },
                doctorData: { $arrayElemAt: ['$doctorData', 0] }
            }
        });

        // 🔧 PERFORMANCE: Create Excel workbook with streaming
        const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
        const worksheet = workbook.addWorksheet('TAT Report');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="TAT_Report_${location}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        
        worksheet.columns = [
            { header: 'Study Status', key: 'studyStatus', width: 20 },
            { header: 'Patient ID', key: 'patientId', width: 15 },
            { header: 'Patient Name', key: 'patientName', width: 25 },
            { header: 'Accession No', key: 'accessionNumber', width: 20 },
            { header: 'Modality', key: 'modality', width: 10 },
            { header: 'Study Date', key: 'studyDate', width: 20 },
            { header: 'Upload Date', key: 'uploadDate', width: 20 },
            { header: 'Assigned Date', key: 'assignedDate', width: 20 },
            { header: 'Report Date', key: 'reportDate', width: 20 },
            { header: 'Upload-to-Assign TAT', key: 'uploadToAssignment', width: 25 },
            { header: 'Assign-to-Report TAT', key: 'assignToReport', width: 25 },
            { header: 'Upload-to-Report TAT', key: 'uploadToReport', width: 25 },
            { header: 'Reported By', key: 'reportedBy', width: 20 }
        ];
        worksheet.getRow(1).font = { bold: true };

        // 🔧 PERFORMANCE: Stream data processing using a cursor
        const cursor = DicomStudy.aggregate(pipeline).cursor({ batchSize: 200 }).allowDiskUse(true);
        let processedCount = 0;

        for (let study = await cursor.next(); study != null; study = await cursor.next()) {
            // 🔧 CONSISTENCY: Use calculatedTAT, with fallback, same as getTATReport
            const tat = study.calculatedTAT || calculateStudyTAT(study);

            const patient = study.patientData || {};
            const lab = study.labData || {};
            const doctor = study.doctorData || {};
            
            const formatDate = (date) => date ? new Date(date) : null;

            worksheet.addRow({
                studyStatus: study.workflowStatus || '',
                patientId: patient.patientID || '',
                patientName: patient.computed?.fullName || (patient.firstName && patient.lastName ? `${patient.lastName}, ${patient.firstName}` : patient.patientNameRaw) || '',
                accessionNumber: study.accessionNumber || '',
                modality: study.modality || study.modalitiesInStudy?.join(', ') || '',
                studyDate: study.studyDate || '',
                uploadDate: formatDate(study.createdAt),
                assignedDate: formatDate(study.assignment?.[0]?.assignedAt || study.assignment?.assignedAt),
                reportDate: formatDate(study.reportInfo?.finalizedAt),
                uploadToAssignment: tat.uploadToAssignmentTATFormatted || 'N/A',
                assignToReport: tat.assignmentToReportTATFormatted || 'N/A',
                uploadToReport: tat.uploadToReportTATFormatted || 'N/A',
                reportedBy: study.reportInfo?.reporterName || doctor.userAccount?.[0]?.fullName || ''
            }).commit();
            processedCount++;
        }

        await workbook.commit();
        const processingTime = Date.now() - startTime;
        console.log(`✅ TAT Excel export completed in ${processingTime}ms - ${processedCount} records`);

    } catch (error) {
        console.error('❌ Error exporting TAT report:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Failed to export TAT report', error: error.message });
        }
    }
};

/**
 * 🔧 ADDITIONAL: Get TAT analytics dashboard (Now using calculatedTAT)
 */
export const getTATAnalytics = async (req, res) => {
    try {
        const startTime = Date.now();
        const { location, period = '30d' } = req.query;

        if (!location) {
            return res.status(400).json({ success: false, message: 'Location is required' });
        }

        const cacheKey = `tat_analytics_v2_${location}_${period}`;
        let cachedAnalytics = cache.get(cacheKey);

        if (cachedAnalytics) {
            return res.status(200).json({ success: true, data: cachedAnalytics, performance: { queryTime: Date.now() - startTime, fromCache: true } });
        }

        const endDate = new Date();
        const startDate = new Date();
        const days = period === '7d' ? 7 : (period === '90d' ? 90 : 30);
        startDate.setDate(startDate.getDate() - days);

        // 🔧 CONSISTENCY: Analytics now based on the accurate `calculatedTAT` object
        const analyticsData = await DicomStudy.aggregate([
            { $match: { sourceLab: new mongoose.Types.ObjectId(location), createdAt: { $gte: startDate, $lte: endDate } } },
            {
                $group: {
                    _id: null,
                    totalStudies: { $sum: 1 },
                    completedStudies: { $sum: { $cond: ['$calculatedTAT.isCompleted', 1, 0] } },
                    avgUploadToReport: { $avg: '$calculatedTAT.uploadToReportTAT' },
                    avgAssignmentToReport: { $avg: '$calculatedTAT.assignmentToReportTAT' },
                    overdueStudies: { $sum: { $cond: ['$calculatedTAT.isOverdue', 1, 0] } }
                }
            }
        ]);

        const raw = analyticsData[0] || {};
        const formatMinutes = (mins) => {
            if (!mins || mins <= 0) return 'N/A';
            const hours = Math.floor(mins / 60);
            const minutes = Math.round(mins % 60);
            return `${hours}h ${minutes}m`;
        };

        const analytics = {
            totalStudies: raw.totalStudies || 0,
            completedStudies: raw.completedStudies || 0,
            overdueStudies: raw.overdueStudies || 0,
            completionRate: raw.totalStudies > 0 ? ((raw.completedStudies / raw.totalStudies) * 100).toFixed(1) : '0.0',
            avgUploadToReport: formatMinutes(raw.avgUploadToReport),
            avgAssignmentToReport: formatMinutes(raw.avgAssignmentToReport),
        };
        
        cache.set(cacheKey, analytics, 900); // Cache for 15 minutes

        return res.status(200).json({
            success: true,
            data: analytics,
            performance: { queryTime: Date.now() - startTime, fromCache: false }
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