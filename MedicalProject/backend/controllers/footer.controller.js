import DicomStudy from '../models/dicomStudyModel.js';
import Doctor from '../models/doctorModel.js';
import Patient from '../models/patientModel.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import axios from 'axios';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Orthanc configuration
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

/**
 * Bulk assign studies to a doctor
 * @route POST /api/worklist/assign
 */
export const assignStudies = async (req, res) => {
  try {
    const { studyIds, doctorId, priority = 'routine', assignmentNote = '' } = req.body;
    
    if (!studyIds || !Array.isArray(studyIds) || studyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one study ID'
      });
    }
    
    // If doctorId is provided, validate doctor
    let doctor = null;
    if (doctorId) {
      doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }
    }
    
    // Process each study
    const results = [];
    for (const studyId of studyIds) {
      try {
        // Find the study
        const study = await DicomStudy.findById(studyId);
        if (!study) {
          results.push({
            studyId,
            success: false,
            message: 'Study not found'
          });
          continue;
        }
        
        // Update workflow status
        await updateWorkflowStatus({
          studyId: study._id,
          status: 'assigned_to_doctor',
          doctorId: doctorId,
          note: assignmentNote || `Study assigned to doctor by ${req.user.fullName || req.user.email}`,
          user: req.user
        });
        
        // Update study with assignment information
        study.lastAssignedDoctor = doctorId;
        study.lastAssignmentAt = new Date();
        study.caseType = priority;
        await study.save();
        
        results.push({
          studyId,
          success: true,
          message: 'Study assigned successfully'
        });
      } catch (error) {
        console.error(`Error assigning study ${studyId}:`, error);
        results.push({
          studyId,
          success: false,
          message: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    res.json({
      success: true,
      message: `${successCount} studies assigned successfully, ${failCount} failed`,
      results
    });
    
  } catch (error) {
    console.error('Error in bulk assign studies:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing study assignments',
      error: error.message
    });
  }
};

/**
 * Mark studies as unauthorized
 * @route POST /api/worklist/unauthorized
 */
export const markStudiesUnauthorized = async (req, res) => {
  try {
    const { studyIds, reason = 'Study marked as unauthorized' } = req.body;
    
    if (!studyIds || !Array.isArray(studyIds) || studyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one study ID'
      });
    }
    
    // Process each study
    const results = [];
    for (const studyId of studyIds) {
      try {
        // Find the study
        const study = await DicomStudy.findById(studyId);
        if (!study) {
          results.push({
            studyId,
            success: false,
            message: 'Study not found'
          });
          continue;
        }
        
        // Update study status
        study.studyStatusChangeReason = reason;
        study.studyStatus = 'unauthorized';
        study.workflowStatus = 'archived';
        study.archivedAt = new Date();
        
        // Add to status history
        study.statusHistory = study.statusHistory || [];
        study.statusHistory.push({
          status: 'archived',
          changedAt: new Date(),
          changedBy: req.user._id,
          note: `Study marked unauthorized: ${reason}`
        });
        
        await study.save();
        
        // Also update patient status if this was the active study
        if (study.patient) {
          const patient = await Patient.findById(study.patient);
          if (patient && patient.activeDicomStudyRef && patient.activeDicomStudyRef.toString() === studyId) {
            patient.currentWorkflowStatus = 'no_active_study';
            await patient.save();
          }
        }
        
        results.push({
          studyId,
          success: true,
          message: 'Study marked as unauthorized'
        });
      } catch (error) {
        console.error(`Error marking study ${studyId} as unauthorized:`, error);
        results.push({
          studyId,
          success: false,
          message: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    res.json({
      success: true,
      message: `${successCount} studies marked as unauthorized, ${failCount} failed`,
      results
    });
    
  } catch (error) {
    console.error('Error in mark studies unauthorized:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing unauthorized request',
      error: error.message
    });
  }
};

/**
 * Export worklist to Excel
 * @route GET /api/worklist/export
 */
export const exportWorklist = async (req, res) => {
  try {
    // Parse query parameters for filtering
    const { 
      search, 
      startDate, 
      endDate, 
      modality, 
      location,
      status,
      doctor,
      studyIds
    } = req.query;
    
    console.log('📊 Export request received:', {
      search, startDate, endDate, modality, location, status, doctor, studyIds,
      queryString: req.url
    });
    
    // Build filter query
    let filter = {};
    
    // Filter by specific study IDs if provided (comma-separated string)
    if (studyIds) {
      const ids = studyIds.split(',').map(id => id.trim());
      filter._id = { $in: ids };
      console.log('🎯 Filtering by specific study IDs:', ids.length);
    }
    
    // Handle status filter
    if (status) {
      filter.workflowStatus = status;
      console.log('📝 Filtering by status:', status);
    }
    
    // Handle date range
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set to end of day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }
    
    // Handle other filters
    if (modality) {
      filter.modalitiesInStudy = { $regex: modality, $options: 'i' };
    }
    
    if (location) {
      filter['sourceLab.name'] = { $regex: location, $options: 'i' };
    }
    
    if (doctor) {
      filter.lastAssignedDoctor = doctor;
    }
    
    // Handle search
    if (search) {
      filter.$or = [
        { 'patient.firstName': { $regex: search, $options: 'i' } },
        { 'patient.lastName': { $regex: search, $options: 'i' } },
        { 'patient.patientID': { $regex: search, $options: 'i' } },
        { accessionNumber: { $regex: search, $options: 'i' } },
        { examDescription: { $regex: search, $options: 'i' } }
      ];
    }
    
    console.log('🔍 Final MongoDB filter:', JSON.stringify(filter, null, 2));
    
    // Fetch studies with populated references
    const studies = await DicomStudy.find(filter)
      .populate('patient', 'firstName lastName patientID age gender dateOfBirth')
      .populate({
        path: 'lastAssignedDoctor',
        populate: {
          path: 'userAccount',
          select: 'fullName'
        }
      })
      .populate('sourceLab', 'name')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log('📊 Found studies for export:', studies.length);
    
    if (studies.length === 0) {
      console.warn('⚠️ No studies found matching filter criteria');
      return res.status(404).json({
        success: false,
        message: 'No studies found matching the filter criteria',
        filter: filter
      });
    }
    
    // Create a new Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Medical Platform';
    workbook.created = new Date();
    
    // Add a worksheet
    const worksheet = workbook.addWorksheet('Worklist');
    
    // Define columns
    worksheet.columns = [
      { header: 'Patient ID', key: 'patientId', width: 15 },
      { header: 'Patient Name', key: 'patientName', width: 30 },
      { header: 'Age/Gender', key: 'ageGender', width: 12 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Modality', key: 'modality', width: 10 },
      { header: 'Series/Images', key: 'seriesImages', width: 15 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Study Date', key: 'studyDate', width: 15 },
      { header: 'Upload Date', key: 'uploadDate', width: 15 },
      { header: 'Report Date', key: 'reportDate', width: 15 },
      { header: 'Reported By', key: 'reportedBy', width: 20 },
      { header: 'Accession', key: 'accession', width: 20 },
      { header: 'Status', key: 'status', width: 20 }
    ];
    
    // Format headers with bold
    worksheet.getRow(1).font = { bold: true };
    
    // Add rows with data
    studies.forEach(study => {
      const patientName = study.patient ? 
        `${study.patient.firstName || ''} ${study.patient.lastName || ''}`.trim() : 
        'N/A';
        
      const ageGender = study.patient ? 
        `${study.patient.age || 'N/A'}/${study.patient.gender || 'N/A'}` : 
        'N/A';
        
      worksheet.addRow({
        patientId: study.patient?.patientID || 'N/A',
        patientName,
        ageGender,
        description: study.examDescription || study.studyDescription || 'N/A',
        modality: study.modalitiesInStudy ? study.modalitiesInStudy.join(', ') : 'N/A',
seriesImages: study.seriesImages || `${study.seriesCount || 0}/${study.instanceCount || 0}`,
        location: study.sourceLab?.name || 'N/A',
        studyDate: study.studyDate ? new Date(study.studyDate).toLocaleDateString() : 'N/A',
        uploadDate: study.createdAt ? new Date(study.createdAt).toLocaleDateString() : 'N/A',
        reportedBy: study.reportInfo?.reporterName 
                
                || 'N/A',
                reportedDate: Array.isArray(study.doctorReports) && study.doctorReports.length > 0
                ? (() => {
                    // Use the latest uploadedAt if multiple reports
                    const latestReport = study.doctorReports.reduce((latest, curr) =>
                        new Date(curr.uploadedAt) > new Date(latest.uploadedAt) ? curr : latest,
                        study.doctorReports[0]
                    );
                    const dt = new Date(latestReport.uploadedAt);
                    // Format: 15 Jun 2025 03:30
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
        accession: study.accessionNumber || 'N/A',
        status: study.workflowStatus || 'N/A'
      });
    });
    
    // Apply alternating row colors
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const fill = rowNumber % 2 === 0 
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } 
          : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          
        row.eachCell({ includeEmpty: false }, cell => {
          cell.fill = fill;
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };
        });
      }
    });
    
    // Create buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Worklist_${new Date().toISOString().slice(0, 10)}.xlsx`);
    
    // Send the Excel file
    res.send(buffer);
    
    console.log('✅ Export completed successfully:', studies.length, 'studies');
    
  } catch (error) {
    console.error('❌ Error exporting worklist:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting worklist',
      error: error.message
    });
  }
};


/**
 * Dispatch reports to referring physicians
 * @route POST /api/worklist/reports/dispatch
 */
export const dispatchReports = async (req, res) => {
  try {
    const { studyIds, emailTemplate = 'standard' } = req.body;
    
    if (!studyIds || !Array.isArray(studyIds) || studyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one study ID'
      });
    }
    
    // Process each study
    const results = [];
    for (const studyId of studyIds) {
      try {
        // Find the study with patient info
        const study = await DicomStudy.findById(studyId)
          .populate('patient')
          .populate({
            path: 'lastAssignedDoctor',
            populate: {
              path: 'userAccount',
              select: 'fullName email'
            }
          });
          
        if (!study) {
          results.push({
            studyId,
            success: false,
            message: 'Study not found'
          });
          continue;
        }
        
        // Check if report is available
        if (!study.ReportAvailable) {
          results.push({
            studyId,
            success: false,
            message: 'No report available for dispatch'
          });
          continue;
        }
        
        // Check if we have a recipient email
        const referredBy = study.patient?.referringPhysician || study.referredBy;
        const recipientEmail = study.patient?.referringPhysicianEmail;
        
        if (!recipientEmail) {
          results.push({
            studyId,
            success: false,
            message: 'No referring physician email available'
          });
          continue;
        }
        
        // TODO: Send email with report - this would connect to a mail sending service
        // For now, we'll just simulate a successful send
        
        // Mark as dispatched in status history
        study.statusHistory = study.statusHistory || [];
        study.statusHistory.push({
          status: study.workflowStatus,
          changedAt: new Date(),
          changedBy: req.user._id,
          note: `Report dispatched to ${referredBy} (${recipientEmail}) by ${req.user.fullName || req.user.email}`
        });
        
        // Save dispatch information
        study.reportDispatched = true;
        study.reportDispatchedAt = new Date();
        study.reportDispatchedBy = req.user._id;
        study.reportDispatchedTo = recipientEmail;
        
        await study.save();
        
        results.push({
          studyId,
          success: true,
          message: `Report dispatched to ${recipientEmail}`
        });
      } catch (error) {
        console.error(`Error dispatching report for study ${studyId}:`, error);
        results.push({
          studyId,
          success: false,
          message: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    res.json({
      success: true,
      message: `${successCount} reports dispatched successfully, ${failCount} failed`,
      results
    });
    
  } catch (error) {
    console.error('Error in dispatch reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing report dispatch',
      error: error.message
    });
  }
};

/**
 * Download multiple studies as a single ZIP
 * @route GET /api/worklist/download-zip
 */
export const bulkZipDownload = async (req, res) => {
  try {
    const { studyIds } = req.query;
    
    if (!studyIds) {
      return res.status(400).json({
        success: false,
        message: 'Please provide study IDs'
      });
    }
    
    const studyIdArray = studyIds.split(',').map(id => id.trim());
    
    // Get studies with Orthanc IDs
    const studies = await DicomStudy.find({ _id: { $in: studyIdArray } })
      .select('orthancStudyID patient patientName accessionNumber studyDate')
      .populate('patient', 'firstName lastName patientID')
      .lean();
    
    if (studies.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid studies found'
      });
    }
    
    // Set response headers for ZIP file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=Studies_${new Date().toISOString().slice(0, 10)}.zip`);
    
    // Create archiver instance
    const archive = archiver('zip', {
      zlib: { level: 5 } // Compression level
    });
    
    // Pipe archive to response
    archive.pipe(res);
    
    // Process each study
    for (const study of studies) {
      const orthancStudyId = study.orthancStudyID;
      
      if (!orthancStudyId) {
        console.warn(`Study ${study._id} has no Orthanc ID, skipping...`);
        continue;
      }
      
      // Get patient name for filename
      let patientName = 'Unknown';
      if (study.patientName) {
        patientName = study.patientName;
      } else if (study.patient) {
        patientName = `${study.patient.firstName || ''}_${study.patient.lastName || ''}`.trim();
        if (patientName === '') patientName = study.patient.patientID || 'Unknown';
      }
      
      // Clean the name for use in the filename
      patientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
      
      try {
        // Download the study from Orthanc
        const response = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}/archive`, {
          headers: { 'Authorization': orthancAuth },
          responseType: 'arraybuffer'
        });
        
        // Add to zip with descriptive filename
        const studyDate = study.studyDate ? study.studyDate.replace(/[^0-9]/g, '') : '';
        const accessionNumber = study.accessionNumber || '';
        const filename = `${patientName}_${studyDate}_${accessionNumber}_${orthancStudyId}.zip`;
        
        archive.append(response.data, { name: filename });
        
      } catch (error) {
        console.error(`Error downloading study ${orthancStudyId}:`, error);
        // Continue with other studies even if one fails
      }
    }
    
    // Finalize the archive
    await archive.finalize();
    
  } catch (error) {
    console.error('Error in bulk download:', error);
    // If headers haven't been sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error creating study archive',
        error: error.message
      });
    } else {
      // Otherwise we need to end the response
      res.end();
    }
  }
};