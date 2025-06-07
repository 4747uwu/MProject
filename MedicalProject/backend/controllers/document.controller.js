import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import DicomStudy from '../models/dicomStudyModel.js';
import User from '../models/userModel.js';
import Lab from '../models/labModel.js';
import Patient from '../models/patientModel.js';
import Doctor from '../models/doctorModel.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentController {
  // Generate and download patient report (NO STORAGE)
static async generatePatientReport(req, res) {
    try {
        const { studyId } = req.params;
        
        // 🔧 FIXED: Use correct schema fields based on your DicomStudy model
        const study = await DicomStudy.findById(studyId)
            .populate({
                path: 'assignment.assignedTo',  // Correct field from your schema
                populate: {
                    path: 'userAccount',
                    select: 'fullName'
                }
            })
            .populate('sourceLab', 'name')
            .populate('patient', 'firstName lastName patientNameRaw patientID computed');
        
        if (!study) {
            return res.status(404).json({ 
                success: false, 
                message: 'Study not found' 
            });
        }

        // 🔧 FIXED: Get patient name - handle different name formats with computed field
        let patientName = 'N/A';
        if (study.patient) {
            // First try computed.fullName (if available)
            if (study.patient.computed?.fullName) {
                patientName = study.patient.computed.fullName;
            }
            // Then try firstName + lastName
            else if (study.patient.firstName && study.patient.lastName) {
                patientName = `${study.patient.firstName} ${study.patient.lastName}`;
            }
            // Finally try patientNameRaw (DICOM format)
            else if (study.patient.patientNameRaw) {
                // Parse DICOM name format (LastName^FirstName^^^)
                const nameParts = study.patient.patientNameRaw.split('^');
                const lastName = nameParts[0] || '';
                const firstName = nameParts[1] || '';
                patientName = `${firstName} ${lastName}`.trim() || 'N/A';
            }
            // Fallback to patientID
            else if (study.patient.patientID) {
                patientName = `Patient ${study.patient.patientID}`;
            }
        }

        // 🔧 FIXED: Get doctor name from correct assignment structure
        let doctorName = 'Not Assigned';
        if (study.assignment?.assignedTo?.userAccount?.fullName) {
            doctorName = study.assignment.assignedTo.userAccount.fullName;
        } else if (study.reportInfo?.reporterName) {
            // Fallback to reporter name if available
            doctorName = study.reportInfo.reporterName;
        }

        // Prepare template data - only the requested fields
        const templateData = {
            PatientName: patientName,
            DoctorName: doctorName,
            LabName: study.sourceLab?.name || 'N/A',
            ReportDate: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
        };

        // Generate document (but don't store it)
        const documentBuffer = await DocumentController.generateDocument('Patient Report.docx', templateData);
        
        // Create filename using patient name
        const safePatientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `Patient_Report_${safePatientName}_${Date.now()}.docx`;
        
        // 🔧 FIXED: UPDATE WORKFLOW STATUS with correct doctor ID
        try {
            await updateWorkflowStatus({
                studyId: studyId,
                status: 'report_in_progress',
                doctorId: study.assignment?.assignedTo?._id || null, // Use correct assignment structure
                note: 'Report template generated for doctor',
                user: req.user || null
            });
        } catch (workflowError) {
            console.warn('Workflow status update failed (continuing with document generation):', workflowError.message);
            // Don't fail the entire request if workflow update fails
        }
        
        // Set response headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        
        // Send the document (direct download, no storage)
        res.send(documentBuffer);
        
    } catch (error) {
        console.error('Error generating patient report:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error generating report',
            error: error.message 
        });
    }
}

  // Generic document generator function (unchanged)
  static async generateDocument(templateName, data) {
    try {
      // Load the template file
      const templatePath = path.join(__dirname, '../templates', templateName);
      
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templateName}`);
      }

      const content = fs.readFileSync(templatePath, 'binary');
      
      // Create a new zip instance
      const zip = new PizZip(content);
      
      // Create docxtemplater instance
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // REPLACE the deprecated .setData() method:
      // doc.setData(data);

      // WITH the new .render() method that takes data:
      doc.render(data);

      // Generate the document buffer
      const buffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      return buffer;
      
    } catch (error) {
      console.error('Error in generateDocument:', error);
      throw error;
    }
  }

  // REMOVE saveDocumentToStudy method since we're not storing generated reports

  // Get report from study (only uploaded reports)
static async getStudyReport(req, res) {
  try {
    const { studyId, reportIndex } = req.params;
    
    const study = await DicomStudy.findById(studyId);
    
    if (!study) {
      return res.status(404).json({ 
        success: false, 
        message: 'Study not found' 
      });
    }

    if (!study.uploadedReports || study.uploadedReports.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No uploaded reports found for this study' 
      });
    }

    const reportIdx = parseInt(reportIndex);
    if (reportIdx >= study.uploadedReports.length || reportIdx < 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report not found' 
      });
    }

    const report = study.uploadedReports[reportIdx];
    
    // Convert base64 back to buffer
    const documentBuffer = Buffer.from(report.data, 'base64');
    
    // Update workflow status based on user role
    try {
      const { updateWorkflowStatus } = await import('../utils/workflowStatusManger.js');
      
      let newStatus;
      let statusNote;
      
      // Determine workflow status based on user role
      if (req.user.role === 'doctor_account') {
        newStatus = 'report_downloaded_radiologist';
        statusNote = `Report "${report.filename}" downloaded by radiologist: ${req.user.fullName || req.user.email}`;
      } else if (req.user.role === 'admin' || req.user.role === 'lab_staff') {
        newStatus = 'final_report_downloaded';
        statusNote = `Final report "${report.filename}" downloaded by ${req.user.role}: ${req.user.fullName || req.user.email}`;
      } else {
        // Fallback for other roles
        newStatus = 'report_downloaded';
        statusNote = `Report "${report.filename}" downloaded by ${req.user.role || 'unknown'}: ${req.user.fullName || req.user.email}`;
      }
      
      await updateWorkflowStatus({
        studyId: study._id,
        status: newStatus,
        note: statusNote,
        user: req.user
      });
      
      console.log(`Workflow status updated to ${newStatus} for study ${studyId} by ${req.user.role}`);
    } catch (statusError) {
      // Log the error but don't fail the download
      console.error('Error updating workflow status:', statusError);
    }
    
    // Set response headers
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.setHeader('Content-Type', report.contentType);
    
    // Send the document
    res.send(documentBuffer);
    
  } catch (error) {
    console.error('Error retrieving study report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving report',
      error: error.message 
    });
  }
}


 

  // Delete a specific uploaded report
  static async deleteStudyReport(req, res) {
    try {
      const { studyId, reportIndex } = req.params;
      
      const study = await DicomStudy.findById(studyId);
      
      if (!study) {
        return res.status(404).json({ 
          success: false, 
          message: 'Study not found' 
        });
      }

      const reportIdx = parseInt(reportIndex);
      if (!study.uploadedReports || reportIdx >= study.uploadedReports.length || reportIdx < 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Report not found' 
        });
      }

      // Remove the report
      study.uploadedReports.splice(reportIdx, 1);
      
      // Update workflow status if no reports left
      if (study.uploadedReports.length === 0) {
        await updateWorkflowStatus({
          studyId: studyId,
          status: 'report_in_progress',
          note: 'All uploaded reports deleted',
          user: req.user
        });
      }
      
      await study.save();

      res.json({ 
        success: true, 
        message: 'Report deleted successfully',
        remainingReports: study.uploadedReports.length
      });
      
    } catch (error) {
      console.error('Error deleting study report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error deleting report',
        error: error.message 
      });
    }
  }
  // List reports for a study (only uploaded reports)
// 🔧 FIXED: Upload study report function
static async uploadStudyReport(req, res) {
  console.log('🔧 Uploading study report with Wasabi integration...'); 
  try {
      const { studyId } = req.params;
      const { doctorId, reportStatus } = req.body;
      
      // Check if file exists in the request
      if (!req.file) {
          return res.status(400).json({ 
              success: false, 
              message: 'No file uploaded' 
          });
      }
      
      const study = await DicomStudy.findById(studyId)
          .populate('patient', 'patientID firstName lastName')
          .populate('assignment.assignedTo');
      
      if (!study) {
          return res.status(404).json({ 
              success: false, 
              message: 'Study not found' 
          });
      }
      
      // 🔧 FIXED: Use assigned doctor from study if no doctorId provided
      let doctor = null;
      let effectiveDoctorId = doctorId;
      
      if (doctorId) {
          doctor = await Doctor.findById(doctorId).populate('userAccount', 'fullName');
          if (!doctor) {
              return res.status(404).json({
                  success: false,
                  message: 'Doctor not found'
              });
          }
      } else if (study.assignment?.assignedTo) {
          // Use the already assigned doctor
          effectiveDoctorId = study.assignment.assignedTo;
          doctor = await Doctor.findById(effectiveDoctorId).populate('userAccount', 'fullName');
      }
      
      // Get the file from multer
      const file = req.file;
      const uploaderName = doctor?.userAccount?.fullName || req.user?.fullName || 'Unknown';
      
      console.log(`📤 Uploading ${file.originalname} to Wasabi...`);
      
      // 🔧 NEW: Upload to Wasabi first
      const wasabiResult = await WasabiService.uploadDocument(
          file.buffer,
          file.originalname,
          'clinical', // documentType
          {
              patientId: study.patientId,
              studyId: study.studyInstanceUID,
              uploadedBy: uploaderName,
              doctorId: effectiveDoctorId,
              reportStatus: reportStatus || 'finalized'  // 🆕 NEW: Include report status
          }
      );
      
      if (!wasabiResult.success) {
          console.error('❌ Wasabi upload failed:', wasabiResult.error);
          return res.status(500).json({
              success: false,
              message: 'Failed to upload file to storage',
              error: wasabiResult.error
          });
      }
      
      console.log('✅ File uploaded to Wasabi:', wasabiResult.key);
      
      // 🔧 NEW: Create Document record
      const documentRecord = new Document({
          fileName: file.originalname,
          fileSize: file.size,
          contentType: file.mimetype,
          documentType: 'clinical',
          wasabiKey: wasabiResult.key,
          wasabiBucket: wasabiResult.bucket,
          patientId: study.patientId,
          studyId: study._id,
          uploadedBy: req.user.id
      });
      
      await documentRecord.save();
      console.log('✅ Document record created:', documentRecord._id);
      
      // 🔧 ENHANCED: Create doctor report object for DicomStudy.doctorReports
      const doctorReportDocument = {
          _id: documentRecord._id, // Link to Document collection
          filename: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          reportType: doctor ? 'doctor-report' : 'radiologist-report',
          uploadedAt: new Date(),
          uploadedBy: uploaderName,
          reportStatus: reportStatus || 'finalized',
          doctorId: effectiveDoctorId,
          // 🔧 NEW: Wasabi storage info (for quick access)
          wasabiKey: wasabiResult.key,
          wasabiBucket: wasabiResult.bucket,
          storageType: 'wasabi'
      };
      
      // 🔧 FIXED: Initialize doctorReports array if it doesn't exist
      if (!study.doctorReports) {
          study.doctorReports = [];
      }
      
      // Add to doctorReports array
      study.doctorReports.push(doctorReportDocument);
      
      // 🔧 CRITICAL: Set ReportAvailable to true
      study.ReportAvailable = true;
      
      // 🔧 FIXED: Update report-related fields
      study.reportInfo = study.reportInfo || {};
      
      // 🆕 NEW: Handle different report statuses
      if (reportStatus === 'draft') {
          study.reportInfo.draftedAt = new Date();
          console.log('📝 Report uploaded as draft');
      } else {
          study.reportInfo.finalizedAt = new Date();
          console.log('✅ Report uploaded as finalized');
      }
      
      study.reportInfo.reporterName = uploaderName;
      
      // 🔧 FIXED: Update timing info
      if (study.assignment?.assignedAt) {
          const assignmentToReport = (new Date() - new Date(study.assignment.assignedAt)) / (1000 * 60);
          study.timingInfo = study.timingInfo || {};
          study.timingInfo.assignmentToReportMinutes = Math.round(assignmentToReport);
      }
      
      // 🆕 NEW: Determine workflow status based on report status
      const newWorkflowStatus = reportStatus === 'draft' ? 'report_drafted' : 'report_finalized';
      const statusNote = reportStatus === 'draft' 
          ? `Draft report uploaded by ${uploaderName} (Wasabi: ${wasabiResult.key})`
          : `Finalized report uploaded by ${uploaderName} (Wasabi: ${wasabiResult.key})`;
      
      // 🔧 FIXED: UPDATE WORKFLOW STATUS with proper error handling
      try {
          await updateWorkflowStatus({
              studyId: studyId,
              status: newWorkflowStatus,
              doctorId: effectiveDoctorId,
              note: statusNote,
              user: req.user
          });
          
          console.log(`✅ Workflow status updated to: ${newWorkflowStatus}`);
      } catch (workflowError) {
          console.warn('Workflow status update failed:', workflowError.message);
          // Continue with save even if workflow update fails
      }
      
      await study.save();
      
      console.log('✅ Study updated with doctor report');
      
      res.json({
          success: true,
          message: `Report uploaded successfully to Wasabi storage as ${reportStatus || 'finalized'}`,
          report: {
              _id: documentRecord._id,
              filename: doctorReportDocument.filename,
              size: doctorReportDocument.size,
              reportType: doctorReportDocument.reportType,
              reportStatus: doctorReportDocument.reportStatus,
              uploadedBy: doctorReportDocument.uploadedBy,
              uploadedAt: doctorReportDocument.uploadedAt,
              wasabiKey: wasabiResult.key,
              storageType: 'wasabi'
          },
          workflowStatus: newWorkflowStatus,
          totalReports: study.doctorReports.length,
          reportAvailable: study.ReportAvailable,
          study: {
              _id: study._id,
              patientName: study.patientInfo?.patientName || `${study.patient?.firstName || ''} ${study.patient?.lastName || ''}`.trim(),
              patientId: study.patientInfo?.patientID || study.patient?.patientID
          }
      });
      
  } catch (error) {
      console.error('❌ Error uploading study report:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Error uploading report',
          error: error.message 
      });
  }
}

// 🔧 FIXED: Get study reports function
static async getStudyReports(req, res) {
  console.log('Fetching study reports...');
  try {
      const { studyId } = req.params;
      
      // 🔧 FIXED: Select uploadedReports and other necessary fields
      const study = await DicomStudy.findById(studyId)
          .select('uploadedReports workflowStatus reportInfo assignment')
          .populate('assignment.assignedTo', 'userAccount')
          .populate({
              path: 'assignment.assignedTo',
              populate: {
                  path: 'userAccount',
                  select: 'fullName'
              }
          });
      
      if (!study) {
          return res.status(404).json({ 
              success: false, 
              message: 'Study not found' 
          });
      }

      // 🔧 FIXED: Return metadata with enhanced information
      const reportsMetadata = study.uploadedReports?.map((report, index) => ({
          index: index,
          filename: report.filename,
          contentType: report.contentType,
          size: report.size,
          reportType: report.reportType,
          uploadedAt: report.uploadedAt,
          uploadedBy: report.uploadedBy,
          reportStatus: report.reportStatus,
          // 🔧 ADDED: Additional metadata for UI
          formattedSize: (report.size / 1024 / 1024).toFixed(2) + ' MB',
          formattedDate: new Date(report.uploadedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          })
      })) || [];

      // 🔧 ADDED: Additional study information for UI
      const assignedDoctor = study.assignment?.assignedTo;
      
      res.json({ 
          success: true, 
          reports: reportsMetadata,
          totalReports: reportsMetadata.length,
          workflowStatus: study.workflowStatus,
          // 🔧 ADDED: Enhanced response data
          studyInfo: {
              _id: study._id,
              hasReports: reportsMetadata.length > 0,
              latestReportDate: reportsMetadata.length > 0 ? 
                  reportsMetadata[reportsMetadata.length - 1].uploadedAt : null,
              assignedDoctor: assignedDoctor ? {
                  _id: assignedDoctor._id,
                  fullName: assignedDoctor.userAccount?.fullName || 'Unknown',
              } : null,
              reportInfo: study.reportInfo
          }
      });
      
  } catch (error) {
      console.error('Error fetching study reports:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Error fetching reports',
          error: error.message 
      });
  }
}

  // Generate lab report (unchanged)
  static async generateLabReport(req, res) {
    try {
      const { labId } = req.params;
      
      // Fetch lab data using your Lab model
      const lab = await Lab.findById(labId);
      
      if (!lab) {
        return res.status(404).json({ 
          success: false, 
          message: 'Lab not found' 
        });
      }

      // Get recent studies for this lab
      const recentStudies = await DicomStudy.find({ sourceLab: labId })
        .populate('patient', 'firstName lastName patientNameRaw')
        .populate({
          path: 'lastAssignedDoctor',
          populate: {
            path: 'userAccount',
            select: 'fullName'
          }
        })
        .sort({ createdAt: -1 })
        .limit(10);

      const templateData = {
        LabName: lab.name,
        LabIdentifier: lab.identifier,
        ContactPerson: lab.contactPerson || 'N/A',
        ContactEmail: lab.contactEmail || 'N/A',
        ContactPhone: lab.contactPhone || 'N/A',
        ReportDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        TotalStudies: recentStudies.length,
        Studies: recentStudies.map(study => {
          // Handle patient name
          let patientName = 'N/A';
          if (study.patient) {
            if (study.patient.firstName && study.patient.lastName) {
              patientName = `${study.patient.firstName} ${study.patient.lastName}`;
            } else if (study.patient.patientNameRaw) {
              const nameParts = study.patient.patientNameRaw.split('^');
              const lastName = nameParts[0] || '';
              const firstName = nameParts[1] || '';
              patientName = `${firstName} ${lastName}`.trim() || 'N/A';
            }
          }

          return {
            PatientName: patientName,
            DoctorName: study.lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
            StudyDate: study.studyDate || 'N/A',
            Modality: study.modalitiesInStudy?.join(', ') || 'N/A'
          };
        })
      };

      const document = await DocumentController.generateDocument('lab-report-template.docx', templateData);
      
      const filename = `Lab_Report_${lab.name.replace(/\s+/g, '_')}_${Date.now()}.docx`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      
      res.send(document);
      
    } catch (error) {
      console.error('Error generating lab report:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error generating lab report',
        error: error.message 
      });
    }
  }

  // List available templates (unchanged)
  static async getAvailableTemplates(req, res) {
    try {
      const templatesDir = path.join(__dirname, '../templates');
      
      if (!fs.existsSync(templatesDir)) {
        return res.json({ 
          success: true, 
          templates: [],
          message: 'Templates directory not found'
        });
      }

      const files = fs.readdirSync(templatesDir)
        .filter(file => file.endsWith('.docx'))
        .map(file => ({
          name: file,
          displayName: file.replace('.docx', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }));

      res.json({ 
        success: true, 
        templates: files 
      });
      
    } catch (error) {
      console.error('Error fetching templates:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching templates',
        error: error.message 
      });
    }
  }
}

export default DocumentController;