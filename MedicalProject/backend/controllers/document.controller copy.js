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

import WasabiService from '../services/wasabi.service.js';

import Document from '../models/documentModal.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentController {
  // static async generatePatientReport(req, res) {
  //   try {
  //       const { studyId } = req.params;
        
  //       // 🔧 FIXED: Use correct schema fields based on your DicomStudy model
  //       const study = await DicomStudy.findById(studyId)
  //           .populate({
  //               path: 'assignment.assignedTo',  // Correct field from your schema
  //               populate: {
  //                   path: 'userAccount',
  //                   select: 'fullName'
  //               }
  //           })
  //           .populate('sourceLab', 'name')
  //           .populate('patient', 'firstName lastName patientNameRaw patientID computed');
        
  //       if (!study) {
  //           return res.status(404).json({ 
  //               success: false, 
  //               message: 'Study not found' 
  //           });
  //       }

  //       // 🔧 FIXED: Get patient name - handle different name formats with computed field
  //       let patientName = 'N/A';
  //       if (study.patient) {
  //           // First try computed.fullName (if available)
  //           if (study.patient.computed?.fullName) {
  //               patientName = study.patient.computed.fullName;
  //           }
  //           // Then try firstName + lastName
  //           else if (study.patient.firstName && study.patient.lastName) {
  //               patientName = `${study.patient.firstName} ${study.patient.lastName}`;
  //           }
  //           // Finally try patientNameRaw (DICOM format)
  //           else if (study.patient.patientNameRaw) {
  //               // Parse DICOM name format (LastName^FirstName^^^)
  //               const nameParts = study.patient.patientNameRaw.split('^');
  //               const lastName = nameParts[0] || '';
  //               const firstName = nameParts[1] || '';
  //               patientName = `${firstName} ${lastName}`.trim() || 'N/A';
  //           }
  //           // Fallback to patientID
  //           else if (study.patient.patientID) {
  //               patientName = `Patient ${study.patient.patientID}`;
  //           }
  //       }

  //       // 🔧 FIXED: Get doctor name from correct assignment structure
  //       let doctorName = 'Not Assigned';
  //       if (study.assignment?.assignedTo?.userAccount?.fullName) {
  //           doctorName = study.assignment.assignedTo.userAccount.fullName;
  //       } else if (study.reportInfo?.reporterName) {
  //           // Fallback to reporter name if available
  //           doctorName = study.reportInfo.reporterName;
  //       }

  //       // Prepare template data - only the requested fields
  //       const templateData = {
  //           PatientName: patientName,
  //           DoctorName: doctorName,
  //           LabName: study.sourceLab?.name || 'N/A',
  //           ReportDate: new Date().toLocaleDateString('en-US', {
  //               year: 'numeric',
  //               month: 'long',
  //               day: 'numeric'
  //           })
  //       };

  //       // Generate document (but don't store it)
  //       const documentBuffer = await DocumentController.generateDocument('Patient Report.docx', templateData);
        
  //       // Create filename using patient name
  //       const safePatientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
  //       const filename = `Patient_Report_${safePatientName}_${Date.now()}.docx`;
        
  //       // 🔧 FIXED: UPDATE WORKFLOW STATUS with correct doctor ID
  //       try {
  //           await updateWorkflowStatus({
  //               studyId: studyId,
  //               status: 'report_in_progress',
  //               doctorId: study.assignment?.assignedTo?._id || null, // Use correct assignment structure
  //               note: 'Report template generated for doctor',
  //               user: req.user || null
  //           });
  //       } catch (workflowError) {
  //           console.warn('Workflow status update failed (continuing with document generation):', workflowError.message);
  //           // Don't fail the entire request if workflow update fails
  //       }
        
  //       // Set response headers for download
  //       res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  //       res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        
  //       // Send the document (direct download, no storage)
  //       res.send(documentBuffer);
        
  //   } catch (error) {
  //       console.error('Error generating patient report:', error);
  //       res.status(500).json({ 
  //           success: false, 
  //           message: 'Error generating report',
  //           error: error.message 
  //       });
  //   }
  // }

  // 🔧 ENHANCED: generatePatientReport with all template fields
static async generatePatientReport(req, res) {
  try {
      const { studyId } = req.params;
      
      // 🔧 ENHANCED: Include more patient and study data
      const study = await DicomStudy.findById(studyId)
          .populate({
              path: 'assignment.assignedTo',  // Doctor assignment
              populate: [
                  {
                      path: 'userAccount',
                      select: 'fullName'
                  },
                  {
                      path: 'signature signatureWasabiKey', // Include signature info
                      select: 'signature signatureWasabiKey signatureMetadata'
                  }
              ]
          })
          .populate('sourceLab', 'name')
          .populate('patient', 'firstName lastName patientNameRaw patientID computed age gender dateOfBirth');
      
      if (!study) {
          return res.status(404).json({ 
              success: false, 
              message: 'Study not found' 
          });
      }

      // 🔧 ENHANCED: Get patient name with better handling
      let patientName = 'N/A';
      if (study.patient) {
          if (study.patient.computed?.fullName) {
              patientName = study.patient.computed.fullName;
          } else if (study.patient.firstName && study.patient.lastName) {
              patientName = `${study.patient.firstName} ${study.patient.lastName}`;
          } else if (study.patient.patientNameRaw) {
              const nameParts = study.patient.patientNameRaw.split('^');
              const lastName = nameParts[0] || '';
              const firstName = nameParts[1] || '';
              patientName = `${firstName} ${lastName}`.trim() || 'N/A';
          } else if (study.patient.patientID) {
              patientName = `Patient ${study.patient.patientID}`;
          }
      }

      // 🆕 NEW: Calculate age from patient data
      let patientAge = 'N/A';
      if (study.patient?.age) {
          patientAge = study.patient.age;
      } else if (study.patient?.dateOfBirth) {
          const birthDate = new Date(study.patient.dateOfBirth);
          const today = new Date();
          const age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
          }
          patientAge = `${age} years`;
      } else if (study.patientInfo?.age) {
          patientAge = study.patientInfo.age;
      }

      // 🆕 NEW: Get patient gender
      let patientSex = 'N/A';
      if (study.patient?.gender) {
          // Standardize gender display
          switch(study.patient.gender.toUpperCase()) {
              case 'M':
              case 'MALE':
                  patientSex = 'Male';
                  break;
              case 'F':
              case 'FEMALE':
                  patientSex = 'Female';
                  break;
              case 'O':
              case 'OTHER':
                  patientSex = 'Other';
                  break;
              default:
                  patientSex = study.patient.gender;
          }
      } else if (study.patientInfo?.gender) {
          patientSex = study.patientInfo.gender;
      }

      // 🆕 NEW: Get modality information
      let modality = 'N/A';
      if (study.modality) {
          modality = study.modality;
      } else if (study.modalitiesInStudy && study.modalitiesInStudy.length > 0) {
          modality = study.modalitiesInStudy.join(', ');
      }

      // 🆕 NEW: Get study description
      let description = 'N/A';
      if (study.examDescription) {
          description = study.examDescription;
      } else if (study.studyDescription) {
          description = study.studyDescription;
      }

      // 🔧 ENHANCED: Get doctor name from assignment
      let doctorName = 'Not Assigned';
      let assignedDoctor = null;
      
      if (study.assignment?.assignedTo?.userAccount?.fullName) {
          doctorName = study.assignment.assignedTo.userAccount.fullName;
          assignedDoctor = study.assignment.assignedTo;
      } else if (study.reportInfo?.reporterName) {
          doctorName = study.reportInfo.reporterName;
      }

      // 🆕 NEW: Handle doctor signature
      let signatureImage = '[Signature Image]'; // Default placeholder
      let hasSignature = false;
      
      if (assignedDoctor) {
          try {
              // Check if doctor has a Wasabi signature
              if (assignedDoctor.signatureWasabiKey) {
                  // For document templates, we'll include a placeholder
                  // The actual signature handling would need to be done differently
                  // depending on your document generation library capabilities
                  signatureImage = '[Doctor Digital Signature]';
                  hasSignature = true;
              } else if (assignedDoctor.signature) {
                  // Legacy signature handling
                  signatureImage = '[Doctor Signature Available]';
                  hasSignature = true;
              }
          } catch (signatureError) {
              console.warn('Error processing doctor signature:', signatureError.message);
              signatureImage = '[Signature Image]';
          }
      }

      // 🔧 ENHANCED: Prepare template data with all required fields
      const templateData = {
          PatientName: patientName,
          Age: patientAge,
          Sex: patientSex,
          Modality: modality,
          Description: description,
          DoctorName: doctorName,
          LabName: study.sourceLab?.name || 'N/A',
          ReportDate: new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
          }),
          // 🆕 NEW: Additional fields for extended template
          PatientID: study.patientInfo?.patientID || study.patient?.patientID || 'N/A',
          StudyDate: study.studyDate ? new Date(study.studyDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
          }) : 'N/A',
          AccessionNumber: study.accessionNumber || 'N/A',
          InstitutionName: study.institutionName || study.sourceLab?.name || 'N/A',
          SignatureImage: signatureImage,
          HasSignature: hasSignature
      };

      console.log('🔧 Template data prepared:', {
          patientName: templateData.PatientName,
          age: templateData.Age,
          sex: templateData.Sex,
          modality: templateData.Modality,
          description: templateData.Description,
          doctorName: templateData.DoctorName,
          labName: templateData.LabName,
          hasSignature: templateData.HasSignature
      });

      // Generate document
      const documentBuffer = await DocumentController.generateDocument('Patient Report.docx', templateData);
      
      // Create filename using patient name and study info
      const safePatientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
      const studyDateStr = study.studyDate ? 
          new Date(study.studyDate).toISOString().split('T')[0] : 
          new Date().toISOString().split('T')[0];
      const filename = `Patient_Report_${safePatientName}_${studyDateStr}_${Date.now()}.docx`;
      
      // 🔧 ENHANCED: Update workflow status with better error handling
      try {
          await updateWorkflowStatus({
              studyId: studyId,
              status: 'report_in_progress',
              doctorId: study.assignment?.assignedTo?._id || null,
              note: `Report template generated for ${doctorName} with patient data: ${patientName} (${patientAge}, ${patientSex})`,
              user: req.user || null
          });
          console.log('✅ Workflow status updated successfully');
      } catch (workflowError) {
          console.warn('⚠️ Workflow status update failed (continuing with document generation):', workflowError.message);
      }
      
      // Set response headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Length', documentBuffer.length);
      
      // Send the document
      res.send(documentBuffer);
      
      console.log(`✅ Patient report generated successfully: ${filename}`);
      
  } catch (error) {
      console.error('❌ Error generating patient report:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Error generating report',
          error: error.message 
      });
  }
}

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
      
      // 🔧 FIX: Check if WasabiService is properly loaded
      if (!WasabiService) {
          console.error('❌ WasabiService is not properly imported');
          return res.status(500).json({
              success: false,
              message: 'Storage service not available',
              error: 'WasabiService not loaded'
          });
      }
      
      // 🔧 FIX: Check if WasabiService has required methods
      if (typeof WasabiService.uploadDocument !== 'function') {
          console.error('❌ WasabiService.uploadDocument method not found');
          console.log('Available WasabiService methods:', Object.getOwnPropertyNames(WasabiService));
          return res.status(500).json({
              success: false,
              message: 'Storage service method not available',
              error: 'uploadDocument method not found'
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
      
      // 🔧 ENHANCED: Upload to Wasabi with better error handling
      let wasabiResult;
      try {
          wasabiResult = await WasabiService.uploadDocument(
              file.buffer,
              file.originalname,
              'clinical', // documentType
              {
                  patientId: study.patientId,
                  studyId: study.studyInstanceUID,
                  uploadedBy: uploaderName,
                  doctorId: effectiveDoctorId
              }
          );
      } catch (wasabiError) {
          console.error('❌ WasabiService.uploadDocument threw error:', wasabiError);
          return res.status(500).json({
              success: false,
              message: 'Failed to upload to storage service',
              error: wasabiError.message
          });
      }
      
      if (!wasabiResult || !wasabiResult.success) {
          console.error('❌ Wasabi upload failed:', wasabiResult?.error);
          return res.status(500).json({
              success: false,
              message: 'Failed to upload file to storage',
              error: wasabiResult?.error || 'Unknown storage error'
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
      study.reportInfo.finalizedAt = new Date();
      study.reportInfo.reporterName = uploaderName;
      
      // 🔧 FIXED: Update timing info
      if (study.assignment?.assignedAt) {
          const assignmentToReport = (new Date() - new Date(study.assignment.assignedAt)) / (1000 * 60);
          study.timingInfo = study.timingInfo || {};
          study.timingInfo.assignmentToReportMinutes = Math.round(assignmentToReport);
      }
      
      // 🔧 FIXED: UPDATE WORKFLOW STATUS with proper error handling
      try {
          await updateWorkflowStatus({
              studyId: studyId,
              status: 'report_finalized',
              doctorId: effectiveDoctorId,
              note: `Report uploaded by ${uploaderName} (Wasabi: ${wasabiResult.key})`,
              user: req.user
          });
      } catch (workflowError) {
          console.warn('Workflow status update failed:', workflowError.message);
          // Continue with save even if workflow update fails
      }
      
      await study.save();
      
      console.log('✅ Study updated with doctor report');
      
      res.json({
          success: true,
          message: 'Report uploaded successfully to Wasabi storage',
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
          workflowStatus: 'report_finalized',
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

// 🔧 ENHANCED: Get study reports from doctorReports array with Wasabi support
// 🔧 SIMPLIFIED: Get study reports from doctorReports array only
static async getStudyReports(req, res) {
  console.log('🔧 Fetching study reports from doctorReports array...');
  try {
      const { studyId } = req.params;
      
      // 🔧 ENHANCED: Select doctorReports and other necessary fields
      const study = await DicomStudy.findById(studyId)
          .select('doctorReports workflowStatus reportInfo assignment ReportAvailable')
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

      // 🔧 SIMPLIFIED: Process only doctorReports
      const doctorReportsMetadata = study.doctorReports?.map((report, index) => ({
          index: index,
          _id: report._id,
          filename: report.filename,
          contentType: report.contentType,
          size: report.size,
          reportType: report.reportType,
          uploadedAt: report.uploadedAt,
          uploadedBy: report.uploadedBy,
          reportStatus: report.reportStatus,
          storageType: report.storageType || 'wasabi',
          wasabiKey: report.wasabiKey,
          source: 'doctor',
          // 🔧 ENHANCED: Additional metadata for UI
          formattedSize: (report.size / 1024 / 1024).toFixed(2) + ' MB',
          formattedDate: new Date(report.uploadedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          })
      })) || [];

      // 🔧 ENHANCED: Additional study information for UI
      const assignedDoctor = study.assignment?.assignedTo;
      
      console.log(`📋 Found ${doctorReportsMetadata.length} doctor reports`);
      
      res.json({ 
          success: true, 
          reports: doctorReportsMetadata,
          totalReports: doctorReportsMetadata.length,
          workflowStatus: study.workflowStatus,
          reportAvailable: study.ReportAvailable,
          // 🔧 ENHANCED: Enhanced response data
          studyInfo: {
              _id: study._id,
              hasReports: doctorReportsMetadata.length > 0,
              latestReportDate: doctorReportsMetadata.length > 0 ? 
                  doctorReportsMetadata[doctorReportsMetadata.length - 1].uploadedAt : null,
              assignedDoctor: assignedDoctor ? {
                  _id: assignedDoctor._id,
                  fullName: assignedDoctor.userAccount?.fullName || 'Unknown',
              } : null,
              reportInfo: study.reportInfo
          }
      });
      
  } catch (error) {
      console.error('❌ Error fetching study reports:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Error fetching reports',
          error: error.message 
      });
  }
}

// 🔧 ENHANCED: Download report with Wasabi support for doctorReports
// 🔧 FIXED: Download report with proper Document collection lookup
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

    const reportIdx = parseInt(reportIndex);
    
    // 🔧 ENHANCED: Check doctorReports first (primary), then uploadedReports (legacy)
    let report = null;
    let reportSource = null;
    let isLegacy = false;
    
    if (study.doctorReports && reportIdx < study.doctorReports.length) {
        // Doctor report (Wasabi storage)
        report = study.doctorReports[reportIdx];
        reportSource = 'doctor';
        console.log(`📋 Downloading doctor report: ${report.filename}`);
    } else if (study.uploadedReports) {
        // Legacy report (MongoDB storage)
        const legacyIndex = reportIdx - (study.doctorReports?.length || 0);
        if (legacyIndex >= 0 && legacyIndex < study.uploadedReports.length) {
            report = study.uploadedReports[legacyIndex];
            reportSource = 'legacy';
            isLegacy = true;
            console.log(`📋 Downloading legacy report: ${report.filename}`);
        }
    }
    
    if (!report) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report not found',
        details: {
            requestedIndex: reportIdx,
            doctorReports: study.doctorReports?.length || 0,
            uploadedReports: study.uploadedReports?.length || 0
        }
      });
    }

    console.log(`📁 Report details from ${reportSource}:`, {
      filename: report.filename,
      reportId: report._id?.toString(),
      hasWasabiKey: !!report.wasabiKey,
      hasLegacyData: !!report.data
    });

    let documentBuffer = null;
    
    if (!isLegacy) {
        // 🔧 CRITICAL FIX: Get complete document info from Document collection
        console.log(`🔍 Fetching complete document info from Document collection for ID: ${report._id}`);
        
        try {
            const documentRecord = await Document.findById(report._id);
            
            if (!documentRecord) {
                console.log(`❌ Document record not found in Document collection: ${report._id}`);
                return res.status(404).json({
                    success: false,
                    message: 'Document record not found in storage'
                });
            }

            console.log(`✅ Document record found:`, {
                fileName: documentRecord.fileName,
                fileSize: documentRecord.fileSize,
                contentType: documentRecord.contentType,
                wasabiKey: documentRecord.wasabiKey,
                wasabiBucket: documentRecord.wasabiBucket,
                hasWasabiInfo: !!(documentRecord.wasabiKey && documentRecord.wasabiBucket)
            });

            // 🔧 Download from Wasabi using Document collection info
            if (documentRecord.wasabiKey && documentRecord.wasabiBucket) {
                console.log('☁️ Downloading doctor report from Wasabi...');
                console.log(`📂 Bucket: ${documentRecord.wasabiBucket}, Key: ${documentRecord.wasabiKey}`);
                
                const wasabiResult = await WasabiService.downloadFile(
                    documentRecord.wasabiBucket,
                    documentRecord.wasabiKey
                );

                console.log(`📥 Wasabi download result:`, {
                    success: wasabiResult.success,
                    dataLength: wasabiResult.data?.length || 0,
                    error: wasabiResult.error
                });

                if (!wasabiResult.success) {
                    console.log(`❌ Wasabi download failed: ${wasabiResult.error}`);
                    throw new Error('Failed to download from Wasabi storage: ' + wasabiResult.error);
                }

                documentBuffer = wasabiResult.data;
                console.log('✅ Downloaded from Wasabi successfully');

            } else if (documentRecord.fileData) {
                // 🔧 FALLBACK: Legacy storage in Document collection
                console.log('📁 Found legacy file data in Document collection, downloading...');
                documentBuffer = Buffer.from(documentRecord.fileData, 'base64');
                console.log('✅ Downloaded from Document collection legacy storage');

            } else {
                console.log('❌ No file data found in Document collection');
                return res.status(404).json({
                    success: false,
                    message: 'Document file not found in storage',
                    details: {
                        documentId: report._id,
                        hasWasabiKey: !!documentRecord.wasabiKey,
                        hasWasabiBucket: !!documentRecord.wasabiBucket,
                        hasFileData: !!documentRecord.fileData,
                        isActive: documentRecord.isActive
                    }
                });
            }

        } catch (documentError) {
            console.error('❌ Error fetching document record:', documentError);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch document from storage',
                error: documentError.message
            });
        }
        
    } else if (isLegacy && report.data) {
        // 🔧 LEGACY: Download from MongoDB for old uploadedReports
        console.log('🗄️ Downloading from MongoDB (legacy uploadedReports)...');
        documentBuffer = Buffer.from(report.data, 'base64');
        console.log('✅ Downloaded from MongoDB successfully');
        
    } else {
        return res.status(404).json({
            success: false,
            message: 'Report file not found in any storage system',
            details: {
                reportSource,
                hasWasabiKey: !!report.wasabiKey,
                hasLegacyData: !!report.data,
                storageType: report.storageType,
                reportId: report._id?.toString()
            }
        });
    }
    
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
      
      console.log(`✅ Workflow status updated to ${newStatus} for study ${studyId} by ${req.user.role}`);
    } catch (statusError) {
      // Log the error but don't fail the download
      console.error('❌ Error updating workflow status:', statusError);
    }
    
    // Set response headers
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Length', documentBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Send the document
    res.send(documentBuffer);
    
    console.log(`✅ Report download completed: ${report.filename} (${reportSource})`);
    
  } catch (error) {
    console.error('❌ Error retrieving study report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving report',
      error: error.message 
    });
  }
}

// 🔧 ENHANCED: Delete report with Wasabi cleanup
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
    
    // 🔧 ENHANCED: Determine which array to delete from
    let report = null;
    let reportSource = null;
    let deleteIndex = -1;
    
    if (study.doctorReports && reportIdx < study.doctorReports.length) {
        // Delete from doctorReports
        report = study.doctorReports[reportIdx];
        reportSource = 'doctor';
        deleteIndex = reportIdx;
    } else if (study.uploadedReports) {
        // Delete from uploadedReports (legacy)
        const legacyIndex = reportIdx - (study.doctorReports?.length || 0);
        if (legacyIndex >= 0 && legacyIndex < study.uploadedReports.length) {
            report = study.uploadedReports[legacyIndex];
            reportSource = 'legacy';
            deleteIndex = legacyIndex;
        }
    }
    
    if (!report || deleteIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report not found' 
      });
    }

    console.log(`🗑️ Deleting ${reportSource} report: ${report.filename}`);

    // 🔧 NEW: Clean up Wasabi storage for doctor reports
    if (reportSource === 'doctor' && report.wasabiKey) {
        try {
            console.log(`☁️ Deleting from Wasabi: ${report.wasabiKey}`);
            const wasabiDeleteResult = await WasabiService.deleteFile(
                report.wasabiBucket || 'medicaldocuments',
                report.wasabiKey
            );
            
            if (wasabiDeleteResult.success) {
                console.log('✅ File deleted from Wasabi successfully');
            } else {
                console.warn('⚠️ Failed to delete from Wasabi:', wasabiDeleteResult.error);
                // Continue with database cleanup even if Wasabi deletion fails
            }
        } catch (wasabiError) {
            console.warn('⚠️ Wasabi deletion error:', wasabiError.message);
            // Continue with database cleanup
        }

        // 🔧 NEW: Delete Document record
        try {
            if (report._id) {
                await Document.findByIdAndDelete(report._id);
                console.log('✅ Document record deleted from database');
            }
        } catch (docError) {
            console.warn('⚠️ Failed to delete Document record:', docError.message);
            // Continue with study update
        }
    }

    // Remove the report from the appropriate array
    if (reportSource === 'doctor') {
        study.doctorReports.splice(deleteIndex, 1);
    } else {
        study.uploadedReports.splice(deleteIndex, 1);
    }
    
    // 🔧 ENHANCED: Update ReportAvailable status
    const totalReports = (study.doctorReports?.length || 0) + (study.uploadedReports?.length || 0);
    study.ReportAvailable = totalReports > 0;
    
    // Update workflow status if no reports left
    if (totalReports === 0) {
      try {
        await updateWorkflowStatus({
          studyId: studyId,
          status: 'report_in_progress',
          note: `All reports deleted by ${req.user.role}: ${req.user.fullName || req.user.email}`,
          user: req.user
        });
        console.log('✅ Workflow status updated - no reports remaining');
      } catch (statusError) {
        console.warn('⚠️ Failed to update workflow status:', statusError.message);
      }
    }
    
    await study.save();

    console.log(`✅ Report deleted successfully from ${reportSource} reports`);

    res.json({ 
      success: true, 
      message: 'Report deleted successfully',
      remainingReports: totalReports,
      deletedFrom: reportSource,
      reportAvailable: study.ReportAvailable,
      storageCleanup: reportSource === 'doctor' && report.wasabiKey ? 'wasabi-cleaned' : 'no-cleanup-needed'
    });
    
  } catch (error) {
    console.error('❌ Error deleting study report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting report',
      error: error.message 
    });
  }
}

}

export default DocumentController;

