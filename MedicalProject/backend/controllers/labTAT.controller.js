// backend/controllers/labTAT.controller.js
import NodeCache from 'node-cache';
import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';
import ExcelJS from 'exceljs';
import User from '../models/userModel.js';
import mongoose from 'mongoose';

// Cache configuration
const cache = new NodeCache({
    stdTTL: 600, // 10 minutes
    checkperiod: 120,
    useClones: false
});

// Timezone utility functions
const getISTDate = (date = new Date()) => {
    const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istTime = new Date(utcTime + (5.5 * 60 * 60 * 1000));
    return istTime;
};

const getISTStartOfDay = (date) => {
    const istDate = getISTDate(date);
    const startOfDay = new Date(istDate.getFullYear(), istDate.getMonth(), istDate.getDate());
    return new Date(startOfDay.getTime() - (5.5 * 60 * 60 * 1000));
};

const getISTEndOfDay = (date) => {
    const istDate = getISTDate(date);
    const endOfDay = new Date(istDate.getFullYear(), istDate.getMonth(), istDate.getDate(), 23, 59, 59, 999);
    return new Date(endOfDay.getTime() - (5.5 * 60 * 60 * 1000));
};

const formatDateIST = (date, includeTime = true) => {
    if (!date) return '-';
    try {
        const istDate = getISTDate(new Date(date));
        if (includeTime) {
            return istDate.toLocaleString('en-IN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false, timeZone: 'Asia/Kolkata'
            });
        } else {
            return istDate.toLocaleDateString('en-IN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                timeZone: 'Asia/Kolkata'
            });
        }
    } catch (error) {
        console.warn('Invalid date format:', date);
        return date?.toString() || '-';
    }
};

/**
 * Format DICOM studyTime (HHMMSS format) to HH:MM:SS
 * @param {string} studyTime - Time in HHMMSS format (e.g., "164227")
 * @returns {string} Formatted time as HH:MM:SS (e.g., "16:42:27")
 */
const formatStudyTime = (studyTime) => {
    if (!studyTime || studyTime === '-') return '-';
    
    try {
        const timeStr = String(studyTime).padStart(6, '0');
        const hours = timeStr.substring(0, 2);
        const minutes = timeStr.substring(2, 4);
        const seconds = timeStr.substring(4, 6);
        
        return `${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.warn('Invalid studyTime format:', studyTime);
        return studyTime?.toString() || '-';
    }
};

/**
 * Get TAT report for Lab - filtered by their own lab
 */
export const getLabTATReport = async (req, res) => {
    try {
        const startTime = Date.now();
        const { dateType, fromDate, toDate, modality } = req.query;
        
        // Get lab ID from authenticated user
        let labId = req.user.lab?._id || req.user.lab;
        
        if (!labId) {
            return res.status(403).json({
                success: false,
                message: 'Lab staff must be associated with a lab'
            });
        }

        // ✅ FIX: Ensure labId is a proper ObjectId
        if (typeof labId === 'string') {
            labId = new mongoose.Types.ObjectId(labId);
        }

        console.log(`🔍 Lab TAT Report - Lab: ${labId}, DateType: ${dateType}, From: ${fromDate}, To: ${toDate}, Modality: ${modality || 'ALL'}`);

        // ✅ DEBUG: Check if there are ANY studies for this lab
        const totalStudiesForLab = await DicomStudy.countDocuments({ sourceLab: labId });
        console.log(`📊 Total studies for lab ${labId}: ${totalStudiesForLab}`);

        // ✅ DEBUG: Check date range with CORRECT field (createdAt instead of uploadedAt)
        if (fromDate && toDate) {
            const startDate = getISTStartOfDay(new Date(fromDate));
            const endDate = getISTEndOfDay(new Date(toDate));
            console.log(`📅 Date range (UTC): ${startDate} to ${endDate}`);
            
            const studiesInDateRange = await DicomStudy.countDocuments({
                sourceLab: labId,
                createdAt: { $gte: startDate, $lte: endDate } // ✅ FIXED: Use createdAt
            });
            console.log(`📊 Studies in date range: ${studiesInDateRange}`);
        }

        const cacheKey = `lab_tat_${labId}_${dateType}_${fromDate}_${toDate}_${modality}`;
        let cachedReport = cache.get(cacheKey);

        if (cachedReport) {
            return res.status(200).json({
                success: true,
                data: cachedReport,
                count: cachedReport.length,
                performance: { queryTime: 0, fromCache: true, cached: true }
            });
        }

        const pipeline = [];

        // ✅ FIX: Use ObjectId in match
        pipeline.push({
            $match: { sourceLab: labId }
        });

        // Date filtering
        if (fromDate && toDate) {
            const startDate = getISTStartOfDay(new Date(fromDate));
            const endDate = getISTEndOfDay(new Date(toDate));

            if (dateType === 'studyDate') {
                pipeline.push({
                    $match: {
                        $expr: {
                            $and: [
                                {
                                    $gte: [
                                        { $dateFromString: { dateString: { $substr: ['$studyDate', 0, 8] }, format: '%Y%m%d', onError: '$studyDate' } },
                                        startDate
                                    ]
                                },
                                {
                                    $lte: [
                                        { $dateFromString: { dateString: { $substr: ['$studyDate', 0, 8] }, format: '%Y%m%d', onError: '$studyDate' } },
                                        endDate
                                    ]
                                }
                            ]
                        }
                    }
                });
            } else {
                // ✅ FIXED: Use createdAt instead of uploadedAt
                pipeline.push({
                    $match: {
                        createdAt: {
                            $gte: startDate,
                            $lte: endDate
                        }
                    }
                });
            }
        }

        // Modality filter
        if (modality && modality !== 'all') {
            const modalityList = modality.split(',').map(m => m.trim());
            pipeline.push({
                $match: { modality: { $in: modalityList } }
            });
        }

        // ✅ DEBUG: Log pipeline before lookups
        console.log('🔍 Pipeline before lookups:', JSON.stringify(pipeline, null, 2));

        // Lookups
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
                        { $project: { 'userAccount.fullName': 1, specialization: 1, _id: 1 } }
                    ]
                }
            },
            {
                $lookup: {
                    from: 'documents',
                    localField: '_id',
                    foreignField: 'studyId',
                    as: 'documentData',
                    pipeline: [
                        { $match: { documentType: 'clinical' } },
                        { $sort: { uploadedAt: -1 } },
                        { $limit: 1 },
                        { 
                            $lookup: {
                                from: 'users',
                                localField: 'uploadedBy',
                                foreignField: '_id',
                                as: 'uploaderInfo',
                                pipeline: [{ $project: { fullName: 1, _id: 1 } }]
                            }
                        },
                        { $project: { uploadedBy: 1, uploadedAt: 1, uploaderInfo: { $arrayElemAt: ['$uploaderInfo', 0] } } }
                    ]
                }
            }
        );

        // Project fields
        pipeline.push({
            $project: {
                studyInstanceUID: 1,
                studyDate: 1,
                studyTime: 1,
                modality: 1,
                modalitiesInStudy: 1,

                studyDescription: 1,
                examDescription: 1,
                createdAt: 1, // ✅ FIXED: Use createdAt as uploadedAt
                calculatedTAT: 1,
                workflowStatus: 1,
                patientID: { $arrayElemAt: ['$patientData.patientID', 0] },
                patientName: {
                    $ifNull: [
                        { $arrayElemAt: ['$patientData.computed.fullName', 0] },
                        {
                            $concat: [
                                { $ifNull: [{ $arrayElemAt: ['$patientData.firstName', 0] }, ''] },
                                ' ',
                                { $ifNull: [{ $arrayElemAt: ['$patientData.lastName', 0] }, ''] }
                            ]
                        }
                    ]
                },
                gender: { $arrayElemAt: ['$patientData.gender', 0] },
                labName: { $arrayElemAt: ['$labData.name', 0] },
                labCode: { $arrayElemAt: ['$labData.identifier', 0] },
                doctorName: { 
                    $arrayElemAt: [
                        { $arrayElemAt: ['$doctorData.userAccount.fullName', 0] }, 
                        0
                    ] 
                },
                doctorSpecialization: { $arrayElemAt: ['$doctorData.specialization', 0] },
                reportUploadedAt: { $arrayElemAt: ['$documentData.uploadedAt', 0] },
                reportUploadedBy: { $arrayElemAt: ['$documentData.uploaderInfo.fullName', 0] }
            }
    });

        pipeline.push({ $sort: { createdAt: -1 } }); // ✅ FIXED: Sort by createdAt

        const studies = await DicomStudy.aggregate(pipeline);

        console.log(`✅ Found ${studies.length} studies after aggregation`);

        // Format the data
        const formattedStudies = studies.map(study => ({
            ...study,
            studyDate: study.studyDate ? formatDateIST(study.studyDate, false) : '-',
            studyTime: formatStudyTime(study.studyTime),
            uploadedAt: formatDateIST(study.createdAt),
            reportUploadedAt: formatDateIST(study.reportUploadedAt),
            // ✅ FIX: Extract TAT values from nested object
            uploadToReportTAT: study.calculatedTAT?.uploadToReportTATFormatted || '-',
            studyToReportTAT: study.calculatedTAT?.studyToReportTATFormatted || '-',
            assignmentToReportTAT: study.calculatedTAT?.assignmentToReportTATFormatted || '-',
            totalTATFormatted: study.calculatedTAT?.totalTATFormatted || '-',
            studyDescription: study.studyDescription || study.examDescription || '-'
        }));

        cache.set(cacheKey, formattedStudies, 300); // Cache for 5 minutes

        const processingTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            data: formattedStudies,
            count: formattedStudies.length,
            performance: {
                queryTime: processingTime,
                fromCache: false
            }
        });

    } catch (error) {
        console.error('❌ Error generating lab TAT report:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate TAT report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Export TAT report for Lab
 */
export const exportLabTATReport = async (req, res) => {
    try {
        const { dateType, fromDate, toDate, modality } = req.query;
        
        let labId = req.user.lab?._id || req.user.lab;
        
        if (!labId) {
            return res.status(403).json({
                success: false,
                message: 'Lab staff must be associated with a lab'
            });
        }

        // ✅ FIX: Ensure labId is a proper ObjectId
        if (typeof labId === 'string') {
            labId = new mongoose.Types.ObjectId(labId);
        }

        console.log(`📥 Lab TAT Export - Lab: ${labId}`);

        // Build pipeline (same as getTATReport)
        const pipeline = [];
        
        pipeline.push({
            $match: { sourceLab: labId }
        });

        if (fromDate && toDate) {
            const startDate = getISTStartOfDay(new Date(fromDate));
            const endDate = getISTEndOfDay(new Date(toDate));

            if (dateType === 'studyDate') {
                pipeline.push({
                    $match: {
                        $expr: {
                            $and: [
                                {
                                    $gte: [
                                        { $dateFromString: { dateString: { $substr: ['$studyDate', 0, 8] }, format: '%Y%m%d', onError: '$studyDate' } },
                                        startDate
                                    ]
                                },
                                {
                                    $lte: [
                                        { $dateFromString: { dateString: { $substr: ['$studyDate', 0, 8] }, format: '%Y%m%d', onError: '$studyDate' } },
                                        endDate
                                    ]
                                }
                            ]
                        }
                    }
                });
            } else {
                // ✅ FIXED: Use createdAt instead of uploadedAt
                pipeline.push({
                    $match: {
                        createdAt: {
                            $gte: startDate,
                            $lte: endDate
                        }
                    }
                });
            }
        }

        if (modality && modality !== 'all') {
            const modalityList = modality.split(',').map(m => m.trim());
            pipeline.push({
                $match: { modality: { $in: modalityList } }
            });
        }

        // Add lookups
        pipeline.push(
            {
                $lookup: {
                    from: 'patients',
                    localField: 'patient',
                    foreignField: '_id',
                    as: 'patientData',
                    pipeline: [{ $project: { patientID: 1, firstName: 1, lastName: 1, gender: 1, 'computed.fullName': 1 } }]
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
            },
            {
                $lookup: {
                    from: 'documents',
                    localField: '_id',
                    foreignField: 'studyId',
                    as: 'documentData',
                    pipeline: [
                        { $match: { documentType: 'clinical' } },
                        { $sort: { uploadedAt: -1 } },
                        { $limit: 1 },
                        { 
                            $lookup: {
                                from: 'users',
                                localField: 'uploadedBy',
                                foreignField: '_id',
                                as: 'uploaderInfo',
                                pipeline: [{ $project: { fullName: 1 } }]
                            }
                        },
                        { $project: { uploadedAt: 1, uploaderInfo: { $arrayElemAt: ['$uploaderInfo', 0] } } }
                    ]
                }
            }
        );

        pipeline.push({
            $project: {
                studyInstanceUID: 1,
                studyDate: 1,
                studyTime: 1,
                // modality: 1,
                modalitiesInStudy: 1,
                studyDescription: 1,
                examDescription: 1,
                createdAt: 1, // ✅ FIXED
                calculatedTAT: 1,
                workflowStatus: 1,
                patientID: { $arrayElemAt: ['$patientData.patientID', 0] },
                patientName: {
                    $ifNull: [
                        { $arrayElemAt: ['$patientData.computed.fullName', 0] },
                        {
                            $concat: [
                                { $ifNull: [{ $arrayElemAt: ['$patientData.firstName', 0] }, ''] },
                                ' ',
                                { $ifNull: [{ $arrayElemAt: ['$patientData.lastName', 0] }, ''] }
                            ]
                        }
                    ]
                },
                gender: { $arrayElemAt: ['$patientData.gender', 0] },
                labName: { $arrayElemAt: ['$labData.name', 0] },
                labCode: { $arrayElemAt: ['$labData.identifier', 0] },
                doctorName: { 
                    $arrayElemAt: [
                        { $arrayElemAt: ['$doctorData.userAccount.fullName', 0] }, 
                        0
                    ] 
                },
                reportUploadedAt: { $arrayElemAt: ['$documentData.uploadedAt', 0] },
                reportUploadedBy: { $arrayElemAt: ['$documentData.uploaderInfo.fullName', 0] }
            }
        });

        pipeline.push({ $sort: { createdAt: -1 } }); // ✅ FIXED

        const studies = await DicomStudy.aggregate(pipeline);

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('TAT Report');

        // Define columns
        worksheet.columns = [
            { header: 'Patient ID', key: 'patientID', width: 15 },
            { header: 'Patient Name', key: 'patientName', width: 25 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Study Date', key: 'studyDate', width: 15 },
            { header: 'Study Time', key: 'studyTime', width: 12 },
            { header: 'Modality', key: 'modality', width: 12 },
            { header: 'Study Description', key: 'studyDescription', width: 30 },
            { header: 'Lab Name', key: 'labName', width: 20 },
            { header: 'Uploaded At', key: 'uploadedAt', width: 20 },
            { header: 'Doctor', key: 'doctorName', width: 20 },
            { header: 'Report Uploaded At', key: 'reportUploadedAt', width: 20 },
            { header: 'Upload to Report TAT', key: 'uploadToReportTAT', width: 18 },
            { header: 'Study to Report TAT', key: 'studyToReportTAT', width: 18 },
            { header: 'Assignment to Report TAT', key: 'assignmentToReportTAT', width: 20 },
            { header: 'Total TAT', key: 'totalTATFormatted', width: 15 },
            { header: 'Status', key: 'workflowStatus', width: 20 }
        ];

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data
        studies.forEach(study => {
            worksheet.addRow({
                patientID: study.patientID || '-',
                patientName: study.patientName || '-',
                gender: study.gender || '-',
                studyDate: study.studyDate ? formatDateIST(study.studyDate, false) : '-',
                studyTime: formatStudyTime(study.studyTime),
                modality: study.modalitiesInStudy?.length > 0 ? 
                         study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
                studyDescription: study.studyDescription || study.examDescription || '-',
                labName: study.labName || '-',
                uploadedAt: formatDateIST(study.createdAt),
                doctorName: study.doctorName || '-',
                reportUploadedAt: formatDateIST(study.reportUploadedAt),
                uploadToReportTAT: study.calculatedTAT?.uploadToReportTATFormatted || '-',
                studyToReportTAT: study.calculatedTAT?.studyToReportTATFormatted || '-',
                assignmentToReportTAT: study.calculatedTAT?.assignmentToReportTATFormatted || '-',
                totalTATFormatted: study.calculatedTAT?.totalTATFormatted || '-',
                workflowStatus: study.workflowStatus || '-'
            });
        });

        console.log(studies.modalitiesInStudy);

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Lab_TAT_Report_${Date.now()}.xlsx`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('❌ Error exporting lab TAT report:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to export TAT report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export default {
    getLabTATReport,
    exportLabTATReport
};