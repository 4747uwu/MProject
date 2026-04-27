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
import { calculateStudyTAT, getLegacyTATFields, updateStudyTAT } from '../utils/TATutility.js';
import axios from 'axios';




// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCX_SERVICE_URL = 'http://64.227.187.164:8777/api/document/generate';

// 🔧 FIX: Define TEMPLATES_DIR constant
const TEMPLATES_DIR = path.join(__dirname, '../templates');

class DocumentController {
  // Generate and download patient report (NO STORAGE)
  static async generatePatientReport(req, res) {
    try {
        const { studyId } = req.params;
        
        // 🔧 ENHANCED: Populate all necessary fields INCLUDING doctor signatures
        const study = await DicomStudy.findById(studyId)
            .populate({
                path: 'assignment.assignedTo',
                populate: {
                    path: 'userAccount',
                    select: 'fullName email'
                }
            })
            .populate({
                path: 'lastAssignedDoctor', // Your legacy field
                populate: {
                    path: 'userAccount',
                    select: 'fullName email'
                }
            })
            .populate('sourceLab', 'name identifier')
            .populate('patient', 'firstName lastName patientNameRaw patientID computed ageString gender dateOfBirth');
        
        if (!study) {
            return res.status(404).json({ 
                success: false, 
                message: 'Study not found' 
            });
        }

        console.log('🔍 Study data for report generation:', {
            studyId: study._id,
            assignment: study.assignment,
            lastAssignedDoctor: study.lastAssignedDoctor,
            patient: study.patient,
            examDescription: study.examDescription,
            studyDescription: study.studyDescription
        });

        // 🔧 GET PATIENT INFORMATION with proper age and gender handling
        let patientName = 'Unknown Patient';
        let patientAge = 'Unknown';
        let patientGender = 'Unknown';
        
        // 🔧 UPDATED: Handle ageGender field format "046Y / F"
        if (study.ageGender) {
            const ageGenderParts = study.ageGender.split(' / ');
            if (ageGenderParts.length >= 2) {
                patientAge = ageGenderParts[0]; // "046Y"
                patientGender = ageGenderParts[1] === 'M' ? 'Male' : 
                               ageGenderParts[1] === 'F' ? 'Female' : 
                               ageGenderParts[1];
            }
        }
        
        // Use patientName directly from study
        if (study.patientName) {
            patientName = study.patientName;
        }
        
        // Fallback to patient population if available
        if (study.patient) {
            // Handle patient name from populated data
            if (study.patient.computed?.fullName) {
                patientName = study.patient.computed.fullName;
            } else if (study.patient.firstName || study.patient.lastName) {
                const firstName = study.patient.firstName || '';
                const lastName = study.patient.lastName || '';
                patientName = `${firstName} ${lastName}`.trim();
            } else if (study.patient.patientNameRaw) {
                const nameParts = study.patient.patientNameRaw.split('^');
                const lastName = nameParts[0] || '';
                const firstName = nameParts[1] || '';
                patientName = `${firstName} ${lastName}`.trim();
            }
            
            // 🔧 UPDATED: Handle age from patient model if ageGender not available
            if (!study.ageGender && study.patient.ageString) {
                const ageString = study.patient.ageString;
                const ageNumber = parseInt(ageString.substring(0, 3));
                const ageUnit = ageString.substring(3);
                
                switch(ageUnit) {
                    case 'Y':
                        patientAge = `${ageNumber} years`;
                        break;
                    case 'M':
                        patientAge = `${ageNumber} months`;
                        break;
                    case 'D':
                        patientAge = `${ageNumber} days`;
                        break;
                    default:
                        patientAge = ageString;
                }
            }
            
            // Handle gender from patient if not in ageGender
            if (!study.ageGender && study.patient.gender) {
                patientGender = study.patient.gender === 'M' ? 'Male' : 
                               study.patient.gender === 'F' ? 'Female' : 
                               study.patient.gender;
            }
        }

        // 🔧 UPDATED: Get doctor information from new assignment structure
        let doctorInfo = {
            name: 'Not Assigned',
            specialization: 'Unknown',
            licenseNumber: 'Unknown',
            signature: null,
            doctorId: null
        };
        
        let assignedDoctor = null;
        
        // 🔧 NEW: Use latestAssignedDoctorDetails if available
        if (study.latestAssignedDoctorDetails) {
            doctorInfo.name = study.latestAssignedDoctorDetails.fullName;
            assignedDoctor = { _id: study.latestAssignedDoctorDetails._id };
        }
        // Fallback to assignedDoctorName
        else if (study.assignedDoctorName) {
            doctorInfo.name = study.assignedDoctorName;
            // Try to find doctor ID from doctorAssignments
            if (study.doctorAssignments && study.doctorAssignments.length > 0) {
                const latestAssignment = study.doctorAssignments[study.doctorAssignments.length - 1];
                assignedDoctor = { _id: latestAssignment.doctorId };
            }
        }
        // Try assignment.assignedTo (legacy)
        else if (study.assignment?.assignedTo) {
            assignedDoctor = study.assignment.assignedTo;
            if (assignedDoctor.userAccount?.fullName) {
                doctorInfo.name = assignedDoctor.userAccount.fullName;
            }
        }
        // Try lastAssignedDoctor (legacy)
        else if (study.lastAssignedDoctor) {
            assignedDoctor = study.lastAssignedDoctor;
            if (assignedDoctor.userAccount?.fullName) {
                doctorInfo.name = assignedDoctor.userAccount.fullName;
            }
        }

        // 🔧 FETCH FULL DOCTOR DETAILS INCLUDING MONGODB SIGNATURE
        let signatureBuffer = null;
        if (assignedDoctor && assignedDoctor._id) {
            try {
                console.log('🔍 Fetching doctor details for:', assignedDoctor._id);
                
                const doctorDetails = await Doctor.findById(assignedDoctor._id)
                    .populate('userAccount', 'fullName email')
                    .select('specialization licenseNumber signature signatureMetadata userAccount')
                    .lean();
                
                if (doctorDetails) {
                    console.log('✅ Doctor details found:', {
                        id: doctorDetails._id,
                        name: doctorDetails.userAccount?.fullName,
                        specialization: doctorDetails.specialization,
                        licenseNumber: doctorDetails.licenseNumber,
                        hasSignature: !!doctorDetails.signature
                    });
                    
                    doctorInfo = {
                        name: doctorDetails.userAccount?.fullName || doctorInfo.name,
                        specialization: doctorDetails.specialization || 'Unknown',
                        licenseNumber: doctorDetails.licenseNumber || 'Unknown',
                        doctorId: doctorDetails._id
                    };
                    
                    // 🔧 CONVERT MONGODB BASE64 SIGNATURE TO BUFFER
                    if (doctorDetails.signature) {
                        try {
                            signatureBuffer = Buffer.from(doctorDetails.signature, 'base64');
                            console.log('✅ Signature converted from MongoDB base64, size:', signatureBuffer.length, 'bytes');
                        } catch (signatureError) {
                            console.error('❌ Error converting signature from base64:', signatureError);
                            signatureBuffer = null;
                        }
                    } else {
                        console.log('ℹ️ No signature found in MongoDB for doctor');
                    }
                } else {
                    console.warn('⚠️ Doctor details not found for ID:', assignedDoctor._id);
                }
            } catch (doctorError) {
                console.error('❌ Error fetching doctor details:', doctorError);
            }
        }

        // 🔧 GET MODALITY AND DESCRIPTION from new structure
        let modality = study.modality || 'Unknown';
        let studyDescription = study.description || 'No description available';

        let studyDate = 'Unknown';
        if (study.studyDate) {
            studyDate = new Date(study.studyDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }

        let accessionNumber = study.accessionNumber || 'Not available';
        let labName = study.location || 'Unknown Laboratory';
        let referringPhysician = study.referringPhysicianName || 'Not specified';

        // 🔧 ENHANCED: Prepare template data matching actual study structure
        const templateData = {
            // 🔧 FIXED: Map to exact template field names using actual data
            PatientName: patientName,
            Age: patientAge,
            Sex: patientGender,
            Modality: modality,
            Description: studyDescription,
            DoctorName: doctorInfo.name,
            LabName: labName,
            ReportDate: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            
            // Additional fields using actual study data
            PatientID: study.patientId || 'Unknown',
            DoctorSpecialization: doctorInfo.specialization,
            DoctorLicenseNumber: doctorInfo.licenseNumber,
            StudyDate: studyDate,
            AccessionNumber: accessionNumber,
            ReferringPhysician: referringPhysician,
            StudyTime: study.studyTime || 'Unknown',
            InstitutionName: study.location || 'Unknown',
            CaseType: study.caseType?.toUpperCase() || 'ROUTINE',
            Priority: study.priority || 'NORMAL',
            WorkflowStatus: study.workflowStatus || 'Unknown',
            SeriesCount: study.series ? study.series.split('/')[0] : '0',
            InstanceCount: study.series ? study.series.split('/')[1] : '0',
            OrthancStudyID: study.orthancStudyID || 'Unknown',
            
            // 🔧 CRITICAL FIX: Use SignatureImage to match your template
            SignatureImage: signatureBuffer ? 'SIGNATURE_IMAGE' : 'No signature available',
            HasSignature: !!signatureBuffer
        };

        console.log('📋 Template data prepared from actual study:', {
            ...templateData,
            SignatureImage: signatureBuffer ? `Buffer(${signatureBuffer.length} bytes)` : 'No signature'
        });

        // 🔧 ENHANCED: Generate document WITH SIGNATURE from MongoDB
        const documentBuffer = await DocumentController.generateDocumentWithSignature(
            'Patient Report.docx', 
            templateData,
            signatureBuffer
        );
        
        // Create filename using patient name and study info
        const safePatientName = patientName.replace(/[^a-zA-Z0-9]/g, '_');
        const safeModality = modality.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = Date.now();
        const filename = `Patient_Report_${safePatientName}_${safeModality}_${timestamp}.docx`;
        
        // 🔧 UPDATE WORKFLOW STATUS
        try {
            await updateWorkflowStatus({
                studyId: studyId,
                status: 'report_in_progress',
                doctorId: doctorInfo.doctorId,
                note: `Report template generated for ${doctorInfo.name} - Patient: ${patientName}`,
                user: req.user || null
            });
            
            console.log('✅ Workflow status updated successfully');
        } catch (workflowError) {
            console.warn('⚠️ Workflow status update failed:', workflowError.message);
        }
        
        // Set response headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        
        // Send the document
        res.send(documentBuffer);
        
        console.log(`✅ Patient report generated successfully with ${signatureBuffer ? 'MongoDB signature' : 'no signature'}: ${filename}`);
        
    } catch (error) {
        console.error('❌ Error generating patient report:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error generating report',
            error: error.message 
        });
    }
}

// Add this new method to your DocumentController class

// In your controller file (e.g., documentController.js)

static async getInitialReportData(req, res) {
  console.log("getInitialReportData hit by user:", req.user.id);
  
  try {
      const { studyId } = req.params;
      const doctorId = req.user.id;
    
      // Find the doctor whose userAccount is the current user's id
      const requestingDoctor = await Doctor.findOne({ userAccount: doctorId })
          .populate('userAccount', 'fullName');
      console.log('🔍 Requesting doctor:', requestingDoctor);

      if (!requestingDoctor) {
           return res.status(403).json({ 
               success: false, 
               message: 'No valid doctor profile associated with this user.' 
           });
      }

      // 🔧 ENHANCED: Get more study data including fields needed for the Word document
      const study = await DicomStudy.findById(studyId)
          .select('patientInfo patient studyDate studyTime accessionNumber examDescription studyDescription modality referringPhysicianName institutionName')
          .populate('patient', 'firstName lastName patientNameRaw patientID computed ageString gender dateOfBirth');

      if (!study) {
          return res.status(404).json({ 
              success: false, 
              message: 'Study not found' 
          });
      }

      console.log('🔍 Study data:', {
          patientInfo: study.patientInfo,
          patient: study.patient,
          studyDate: study.studyDate,
          accessionNumber: study.accessionNumber,
          examDescription: study.examDescription,
          referringPhysicianName: study.referringPhysicianName
      });

      // 🔧 EXTRACT PATIENT DATA WITH PROPER LOGIC
      let patientName = 'Unknown Patient';
      let patientAge = 'Unknown';
      let patientGender = 'Unknown';
      let patientID = 'N/A';
      
      if (study.patient) {
          // Handle patient ID
          patientID = study.patient.patientID || study.patientInfo?.patientID || 'N/A';
          
          // Handle patient name
          if (study.patient.computed?.fullName) {
              patientName = study.patient.computed.fullName;
          } else if (study.patient.firstName || study.patient.lastName) {
              const firstName = study.patient.firstName || '';
              const lastName = study.patient.lastName || '';
              patientName = `${firstName} ${lastName}`.trim();
          } else if (study.patient.patientNameRaw) {
              const nameParts = study.patient.patientNameRaw.split('^');
              const lastName = nameParts[0] || '';
              const firstName = nameParts[1] || '';
              patientName = `${firstName} ${lastName}`.trim();
          } else if (study.patient.patientID) {
              patientName = `Patient ${study.patient.patientID}`;
          }
          
          // 🔧 HANDLE AGE FROM PATIENT MODEL
          if (study.patient.ageString) {
              // Parse DICOM age format like "065Y", "045M", "021D"
              const ageString = study.patient.ageString;
              const ageNumber = parseInt(ageString.substring(0, 3));
              const ageUnit = ageString.substring(3);
              
              switch(ageUnit) {
                  case 'Y':
                      patientAge = `${ageNumber} years`;
                      break;
                  case 'M':
                      patientAge = `${ageNumber} months`;
                      break;
                  case 'D':
                      patientAge = `${ageNumber} days`;
                      break;
                  default:
                      patientAge = ageString;
              }
          } else if (study.patient.dateOfBirth) {
              // Calculate age from date of birth
              const birthDate = new Date(study.patient.dateOfBirth);
              const today = new Date();
              const age = today.getFullYear() - birthDate.getFullYear();
              const monthDiff = today.getMonth() - birthDate.getMonth();
              
              if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                  patientAge = `${age - 1} years`;
              } else {
                  patientAge = `${age} years`;
              }
          } else if (study.patientInfo?.age) {
              patientAge = study.patientInfo.age;
          }
          
          // Handle gender
          if (study.patient.gender) {
              patientGender = study.patient.gender === 'M' ? 'Male' : 
                            study.patient.gender === 'F' ? 'Female' : 
                            study.patient.gender;
          } else if (study.patientInfo?.gender) {
              patientGender = study.patientInfo.gender === 'M' ? 'Male' : 
                             study.patientInfo.gender === 'F' ? 'Female' : 
                             study.patientInfo.gender;
          }
      }
      
      // Fallback to patientInfo if patient data is incomplete
      if (patientName === 'Unknown Patient' && study.patientInfo?.patientName) {
          patientName = study.patientInfo.patientName;
      }
      
      if (patientID === 'N/A' && study.patientInfo?.patientID) {
          patientID = study.patientInfo.patientID;
      }

      // 🔧 EXTRACT DOCTOR NAME AND INFO PROPERLY
      let doctorName = 'Unknown Doctor';
      let doctorSpecialization = '';
      let doctorLicenseNumber = '';
      
      // Try from the requesting doctor's user account first
      if (requestingDoctor.userAccount?.fullName) {
          doctorName = requestingDoctor.userAccount.fullName;
      } else if (req.user?.fullName) {
          doctorName = req.user.fullName;
      } else if (req.user?.username) {
          doctorName = req.user.username;
      }
      
      // Get doctor's professional info
      if (requestingDoctor.specialization) {
          doctorSpecialization = requestingDoctor.specialization;
      }
      
      if (requestingDoctor.licenseNumber) {
          doctorLicenseNumber = requestingDoctor.licenseNumber;
      }

      // 🔧 FORMAT EXAM DATE
      let examDate = 'N/A';
      if (study.studyDate) {
          try {
              const date = new Date(study.studyDate);
              examDate = date.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
              });
          } catch (error) {
              console.warn('Error formatting study date:', error);
              examDate = study.studyDate.toString();
          }
      }

      // 🔧 GET EXAM DESCRIPTION
      let examDescription = study.examDescription || study.studyDescription || '';
      if (!examDescription && study.modality) {
          examDescription = `${study.modality} Examination`;
      }

      // 🔧 GET REFERRING PHYSICIAN
      let referredBy = study.referringPhysicianName || 'Dr. -';
      if (referredBy && !referredBy.startsWith('Dr.') && !referredBy.startsWith('DR.')) {
          referredBy = `Dr. ${referredBy}`;
      }

      console.log('📋 Extracted patient data:', {
          patientName,
          patientAge,
          patientGender,
          patientID,
          examDate,
          examDescription,
          referredBy
      });

      console.log('👨‍⚕️ Doctor info:', {
          doctorName,
          doctorSpecialization,
          doctorLicenseNumber,
          hasSignature: !!requestingDoctor.signature,
          signatureLength: requestingDoctor.signature ? requestingDoctor.signature.length : 0,
          signatureMimeType: requestingDoctor.signatureMetadata?.mimeType
      });
      
      // 🔧 COMPLETE: Prepare the complete object for the C# launcher
      const initialData = {
          studyId: study._id.toString(),
          patientName: patientName,
          age: study.age,
          sex: study.gender,
          patientID: patientID,
          
          // 🔧 NEW: Additional required fields for C# application
          accessionNumber: study.accessionNumber || 'N/A',
          referredBy: referredBy,
          examDate: examDate,
          examDescription: examDescription,
          
          // 🔧 DOCTOR INFO AND BASE64 SIGNATURE
          doctorName: doctorName,
          doctorDegree: '', // Add if you have this field in your doctor model
          doctorSpecialization: doctorSpecialization,
          doctorLicenseNumber: doctorLicenseNumber,
          doctorSignatureBase64: requestingDoctor.signature || null, // Base64 string from MongoDB
          doctorSignatureMimeType: requestingDoctor.signatureMetadata?.mimeType || 'image/jpeg',
          
          // 🔧 OPTIONAL: Add disclaimer if needed
          // disclaimer: 'This is a computer-generated report. Please verify all information before use.'
          disclaimer: " an online interpretation of medical imaging based on clinical data. All modern machines/procedures have their own limitation. If there is any clinical discrepancy, this investigation may be repeated or reassessed by other tests. Patients identification in online reporting is not established, so in no way can this report be utilized for any medico legal purpose. In case of any discrepancy due to typing error or machinery error please get it rectified immediately",
      };

      console.log("✅ Sending complete initial data (signature redacted):", { 
          ...initialData, 
          doctorSignatureBase64: initialData.doctorSignatureBase64 ? 
              `[BASE64_DATA_${initialData.doctorSignatureBase64.length}_CHARS]` : null 
      });
      
      res.json(initialData);

  } catch (error) {
      console.error('❌ Error fetching initial report data:', error);
      res.status(500).json({ 
          success: false, 
          message: 'Server error',
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
  console.log('🔧 Retrieving study report with Wasabi integration...');
  try {
    const { studyId, reportIndex } = req.params;
    
    const study = await DicomStudy.findById(studyId);
    
    if (!study) {
      return res.status(404).json({ 
        success: false, 
        message: 'Study not found' 
      });
    }

    // 🔧 FIXED: Check doctorReports instead of uploadedReports
    if (!study.doctorReports || study.doctorReports.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No doctor reports found for this study' 
      });
    }

    const reportIdx = parseInt(reportIndex);
    if (reportIdx >= study.doctorReports.length || reportIdx < 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Report not found' 
      });
    }

    const reportReference = study.doctorReports[reportIdx];
    
    // 🔧 NEW: Fetch the actual Document record using the _id from doctorReports
    console.log(`📋 Looking up Document record with ID: ${reportReference._id}`);
    
    const documentRecord = await Document.findById(reportReference._id);
    
    if (!documentRecord) {
      console.error(`❌ Document record not found for ID: ${reportReference._id}`);
      return res.status(404).json({
        success: false,
        message: 'Document record not found in database'
      });
    }
    
    console.log(`✅ Document record found: ${documentRecord.fileName}`);
    console.log(`📥 Wasabi Key: ${documentRecord.wasabiKey}`);
    console.log(`🪣 Wasabi Bucket: ${documentRecord.wasabiBucket}`);
    
    // 🔧 FIXED: Use Document record for Wasabi download
    let documentBuffer;
    
    if (documentRecord.wasabiKey && documentRecord.wasabiBucket) {
      // Download from Wasabi using Document record details
      console.log(`📥 Downloading report from Wasabi: ${documentRecord.wasabiKey}`);
      
      try {
        const wasabiResult = await WasabiService.downloadFile(
          documentRecord.wasabiBucket, 
          documentRecord.wasabiKey
        );
        
        if (!wasabiResult.success) {
          console.error('❌ Failed to download from Wasabi:', wasabiResult.error);
          return res.status(500).json({
            success: false,
            message: 'Failed to retrieve report from storage',
            error: wasabiResult.error
          });
        }
        
        documentBuffer = wasabiResult.data;
        console.log('✅ Report downloaded from Wasabi successfully');
        
      } catch (wasabiError) {
        console.error('❌ Wasabi download error:', wasabiError);
        return res.status(500).json({
          success: false,
          message: 'Error downloading report from storage',
          error: wasabiError.message
        });
      }
      
    } else {
      // 🔧 FALLBACK: Check if doctorReports has embedded data (legacy)
      if (reportReference.data) {
        documentBuffer = Buffer.from(reportReference.data, 'base64');
        console.log('📥 Using base64 stored report (legacy)');
      } else {
        console.error('❌ No valid storage method found');
        return res.status(404).json({
          success: false,
          message: 'Report data not found - no valid storage method available'
        });
      }
    }
    
    // Update workflow status - ONLY for lab_staff
    // 🔧 DISABLED: Admin and radiologist downloads do NOT change status
    try {
      // ✅ ONLY update status when lab_staff downloads
      if (req.user.role === 'lab_staff') {
        const newStatus = 'final_report_downloaded';
        const statusNote = `Final report "${documentRecord.fileName}" downloaded by lab_staff: ${req.user.fullName || req.user.email}`;
        
        await updateWorkflowStatus({
          studyId: study._id,
          status: newStatus,
          note: statusNote,
          user: req.user
        });
        
        console.log(`✅ Workflow status updated to ${newStatus} for study ${studyId} by lab_staff`);
      } else if (req.user.role === 'doctor_account') {
        console.log(`⏭️ Report downloaded by radiologist - Status change DISABLED for doctor_account`);
      } else if (req.user.role === 'admin') {
        console.log(`⏭️ Report downloaded by admin - Status change DISABLED for admin`);
      } else {
        console.log(`⏭️ Report downloaded by ${req.user.role} - Status change DISABLED`);
      }
    } catch (statusError) {
      // Log the error but don't fail the download
      console.error('⚠️ Error updating workflow status:', statusError);
    }
    
    // 🔧 FIXED: Use Document record for response headers
    res.setHeader('Content-Disposition', `attachment; filename="${documentRecord.fileName}"`);
    res.setHeader('Content-Type', documentRecord.contentType);
    res.setHeader('Content-Length', documentBuffer.length);
    
    // Send the document
    res.send(documentBuffer);
    
    console.log(`✅ Report "${documentRecord.fileName}" sent successfully to ${req.user.role}`);
    
  } catch (error) {
    console.error('❌ Error retrieving study report:', error);
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
      if (!study.doctorReports || reportIdx >= study.doctorReports.length || reportIdx < 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Report not found' 
        });
      }

      const reportReference = study.doctorReports[reportIdx];
      
      // 🔧 NEW: Delete from Wasabi and Document collection
      try {
        // Get the Document record first
        const documentRecord = await Document.findById(reportReference._id);
        
        if (documentRecord) {
          // Delete from Wasabi if it exists there
          if (documentRecord.wasabiKey && documentRecord.wasabiBucket) {
            console.log(`🗑️ Deleting from Wasabi: ${documentRecord.wasabiKey}`);
            try {
              await WasabiService.deleteFile(documentRecord.wasabiBucket, documentRecord.wasabiKey);
              console.log('✅ File deleted from Wasabi');
            } catch (wasabiError) {
              console.warn('⚠️ Failed to delete from Wasabi (continuing):', wasabiError.message);
            }
          }
          
          // Delete the Document record
          await Document.findByIdAndDelete(reportReference._id);
          console.log('✅ Document record deleted');
        }
      } catch (deleteError) {
        console.warn('⚠️ Error during cleanup (continuing with report removal):', deleteError.message);
      }

      // Remove from doctorReports array
      study.doctorReports.splice(reportIdx, 1);
      
      // Update ReportAvailable flag
      study.ReportAvailable = study.doctorReports.length > 0;
      
      // Update workflow status if no reports left
      if (study.doctorReports.length === 0) {
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
        message: 'Report deleted successfully from all storage locations',
        remainingReports: study.doctorReports.length,
        reportAvailable: study.ReportAvailable
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
  console.log(req.body)
  console.log('🔧 Uploading study report with Wasabi integration...'); 
  try {
      const { studyId } = req.params;
      const { doctorId, reportStatus } = req.body;
      
      
      if (!req.file) {
        console.log("nofile")
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
      const freshTAT = calculateStudyTAT(study.toObject());
        await updateStudyTAT(studyId, freshTAT);

        console.log(`✅ TAT recalculated after report upload - Assignment to Report: ${freshTAT.assignmentToReportTATFormatted}`);
      
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

// static async uploadStudyReport(req, res) {
//   console.log('🔧 Uploading study report with Wasabi integration...'); 
//   try {
//       const { studyId } = req.params;
//       const { doctorId, reportStatus } = req.body;
      
//       // Check if file exists in the request
//       if (!req.file) {
//           return res.status(400).json({ 
//               success: false, 
//               message: 'No file uploaded' 
//           });
//       }
      
//       // 🔧 FIX: Check if WasabiService is properly loaded
//       if (!WasabiService) {
//           console.error('❌ WasabiService is not properly imported');
//           return res.status(500).json({
//               success: false,
//               message: 'Storage service not available',
//               error: 'WasabiService not loaded'
//           });
//       }
      
//       // 🔧 FIX: Check if WasabiService has required methods
//       if (typeof WasabiService.uploadDocument !== 'function') {
//           console.error('❌ WasabiService.uploadDocument method not found');
//           console.log('Available WasabiService methods:', Object.getOwnPropertyNames(WasabiService));
//           return res.status(500).json({
//               success: false,
//               message: 'Storage service method not available',
//               error: 'uploadDocument method not found'
//           });
//       }
      
//       const study = await DicomStudy.findById(studyId)
//           .populate('patient', 'patientID firstName lastName')
//           .populate('assignment.assignedTo');
      
//       if (!study) {
//           return res.status(404).json({ 
//               success: false, 
//               message: 'Study not found' 
//           });
//       }
      
//       // 🔧 FIXED: Use assigned doctor from study if no doctorId provided
//       let doctor = null;
//       let effectiveDoctorId = doctorId;
      
//       if (doctorId) {
//           doctor = await Doctor.findById(doctorId).populate('userAccount', 'fullName');
//           if (!doctor) {
//               return res.status(404).json({
//                   success: false,
//                   message: 'Doctor not found'
//               });
//           }
//       } else if (study.assignment?.assignedTo) {
//           // Use the already assigned doctor
//           effectiveDoctorId = study.assignment.assignedTo;
//           doctor = await Doctor.findById(effectiveDoctorId).populate('userAccount', 'fullName');
//       }
      
//       // Get the file from multer
//       const file = req.file;
//       const uploaderName = doctor?.userAccount?.fullName || req.user?.fullName || 'Unknown';
      
//       console.log(`📤 Uploading ${file.originalname} to Wasabi...`);
      
//       // 🔧 ENHANCED: Upload to Wasabi with better error handling
//       let wasabiResult;
//       try {
//           wasabiResult = await WasabiService.uploadDocument(
//               file.buffer,
//               file.originalname,
//               'clinical', // documentType
//               {
//                   patientId: study.patientId,
//                   studyId: study.studyInstanceUID,
//                   uploadedBy: uploaderName,
//                   doctorId: effectiveDoctorId
//               }
//           );
//       } catch (wasabiError) {
//           console.error('❌ WasabiService.uploadDocument threw error:', wasabiError);
//           return res.status(500).json({
//               success: false,
//               message: 'Failed to upload to storage service',
//               error: wasabiError.message
//           });
//       }
      
//       if (!wasabiResult || !wasabiResult.success) {
//           console.error('❌ Wasabi upload failed:', wasabiResult?.error);
//           return res.status(500).json({
//               success: false,
//               message: 'Failed to upload file to storage',
//               error: wasabiResult?.error || 'Unknown storage error'
//           });
//       }
      
//       console.log('✅ File uploaded to Wasabi:', wasabiResult.key);
      
//       // 🔧 NEW: Create Document record
//       const documentRecord = new Document({
//           fileName: file.originalname,
//           fileSize: file.size,
//           contentType: file.mimetype,
//           documentType: 'clinical',
//           wasabiKey: wasabiResult.key,
//           wasabiBucket: wasabiResult.bucket,
//           patientId: study.patientId,
//           studyId: study._id,
//           uploadedBy: req.user.id
//       });
      
//       await documentRecord.save();
//       console.log('✅ Document record created:', documentRecord._id);
      
//       // 🔧 ENHANCED: Create doctor report object for DicomStudy.doctorReports
//       const doctorReportDocument = {
//           _id: documentRecord._id, // Link to Document collection
//           filename: file.originalname,
//           contentType: file.mimetype,
//           size: file.size,
//           reportType: doctor ? 'doctor-report' : 'radiologist-report',
//           uploadedAt: new Date(),
//           uploadedBy: uploaderName,
//           reportStatus: reportStatus || 'finalized',
//           doctorId: effectiveDoctorId,
//           // 🔧 NEW: Wasabi storage info (for quick access)
//           wasabiKey: wasabiResult.key,
//           wasabiBucket: wasabiResult.bucket,
//           storageType: 'wasabi'
//       };
      
//       // 🔧 FIXED: Initialize doctorReports array if it doesn't exist
//       if (!study.doctorReports) {
//           study.doctorReports = [];
//       }
      
//       // Add to doctorReports array
//       study.doctorReports.push(doctorReportDocument);
      
//       // 🔧 CRITICAL: Set ReportAvailable to true
//       study.ReportAvailable = true;
      
//       // 🔧 FIXED: Update report-related fields
//       study.reportInfo = study.reportInfo || {};
//       study.reportInfo.finalizedAt = new Date();
//       study.reportInfo.reporterName = uploaderName;
      
//       // 🔧 FIXED: Update timing info
//       if (study.assignment?.assignedAt) {
//           const assignmentToReport = (new Date() - new Date(study.assignment.assignedAt)) / (1000 * 60);
//           study.timingInfo = study.timingInfo || {};
//           study.timingInfo.assignmentToReportMinutes = Math.round(assignmentToReport);
//       }
      
//       // 🔧 FIXED: UPDATE WORKFLOW STATUS with proper error handling
//       try {
//           await updateWorkflowStatus({
//               studyId: studyId,
//               status: 'report_finalized',
//               doctorId: effectiveDoctorId,
//               note: `Report uploaded by ${uploaderName} (Wasabi: ${wasabiResult.key})`,
//               user: req.user
//           });
//       } catch (workflowError) {
//           console.warn('Workflow status update failed:', workflowError.message);
//           // Continue with save even if workflow update fails
//       }
      
//       await study.save();
      
//       console.log('✅ Study updated with doctor report');
      
//       res.json({
//           success: true,
//           message: 'Report uploaded successfully to Wasabi storage',
//           report: {
//               _id: documentRecord._id,
//               filename: doctorReportDocument.filename,
//               size: doctorReportDocument.size,
//               reportType: doctorReportDocument.reportType,
//               reportStatus: doctorReportDocument.reportStatus,
//               uploadedBy: doctorReportDocument.uploadedBy,
//               uploadedAt: doctorReportDocument.uploadedAt,
//               wasabiKey: wasabiResult.key,
//               storageType: 'wasabi'
//           },
//           workflowStatus: 'report_finalized',
//           totalReports: study.doctorReports.length,
//           reportAvailable: study.ReportAvailable,
//           study: {
//               _id: study._id,
//               patientName: study.patientInfo?.patientName || `${study.patient?.firstName || ''} ${study.patient?.lastName || ''}`.trim(),
//               patientId: study.patientInfo?.patientID || study.patient?.patientID
//           }
//       });
      
//   } catch (error) {
//       console.error('❌ Error uploading study report:', error);
//       res.status(500).json({ 
//           success: false, 
//           message: 'Error uploading report',
//           error: error.message 
//       });
//   }
// }


static async getStudyReports(req, res) {
  console.log('📋 Fetching study reports from doctorReports...');
  try {
      const { studyId } = req.params;
      
      // Corrected Population Strategy:
      // 1. Populate the 'assignment' array itself.
      // 2. Within each 'assignment' object, populate the 'assignedTo' field.
      // 3. Since 'assignedTo' directly references the 'User' model,
      //    directly select 'fullName' from the User document
      const study = await DicomStudy.findById(studyId)
          .select('doctorReports workflowStatus reportInfo ReportAvailable assignment') // Ensure 'assignment' is selected
          .populate({
              path: 'assignment', // Populates the 'assignment' array
              populate: {
                  path: 'assignedTo', // Populates the 'assignedTo' field within each assignment object
                  select: 'fullName' // Directly select 'fullName' from the User document
              }
          });
      
      if (!study) {
          return res.status(404).json({ 
              success: false, 
              message: 'Study not found' 
          });
      }

      const reportsMetadata = study.doctorReports?.map((report, index) => ({
          index: index,
          _id: report._id,
          filename: report.filename,
          contentType: report.contentType,
          size: report.size,
          reportType: report.reportType,
          reportStatus: report.reportStatus,
          uploadedAt: report.uploadedAt,
          uploadedBy: report.uploadedBy,
          doctorId: report.doctorId,
          storageType: report.storageType || 'wasabi',
          // Additional metadata for UI
          formattedSize: (report.size / 1024 / 1024).toFixed(2) + ' MB',
          formattedDate: new Date(report.uploadedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          }),
          // Status indicators
          isDraft: report.reportStatus === 'draft',
          isFinalized: report.reportStatus === 'finalized',
          canDownload: true // All Wasabi reports are downloadable
      })) || [];

      // Determine the assigned doctor from the 'assignment' array
      let assignedDoctor = null;
      if (study.assignment && study.assignment.length > 0) {
          // Sort by 'assignedAt' to get the latest assignment, assuming 'assignedAt' exists
          const sortedAssignments = [...study.assignment].sort((a, b) => {
              const dateA = a.assignedAt ? new Date(a.assignedAt) : 0;
              const dateB = b.assignedAt ? new Date(b.assignedAt) : 0;
              return dateA - dateB;
          });
          const latestAssignment = sortedAssignments[sortedAssignments.length - 1];
          
          // Now, `latestAssignment.assignedTo` is the populated User document
          if (latestAssignment && latestAssignment.assignedTo) {
              assignedDoctor = {
                  _id: latestAssignment.assignedTo._id,
                  fullName: latestAssignment.assignedTo.fullName || 'Unknown', // Directly access fullName from the User model
              };
          }
      }
      
      res.json({ 
          success: true, 
          reports: reportsMetadata,
          totalReports: reportsMetadata.length,
          workflowStatus: study.workflowStatus,
          reportAvailable: study.ReportAvailable,
          // Enhanced response data
          studyInfo: {
              _id: study._id,
              hasReports: reportsMetadata.length > 0,
              hasDraftReports: reportsMetadata.some(r => r.isDraft),
              hasFinalizedReports: reportsMetadata.some(r => r.isFinalized),
              latestReportDate: reportsMetadata.length > 0 ? 
                  reportsMetadata[reportsMetadata.length - 1].uploadedAt : null,
              assignedDoctor: assignedDoctor, // This now contains the latest assigned doctor's info
              reportInfo: study.reportInfo
          }
      });
      
      console.log(`✅ Found ${reportsMetadata.length} reports in doctorReports array`);
      
  } catch (error) {
      console.error('❌ Error fetching study reports:', error);
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

  // Add this new method to your DocumentController class

static async generateDocumentWithSignature(templateName, templateData, signatureBuffer = null) {
    try {
        console.log('📄 Generating document with signature support:', templateName);
        
        const templatePath = path.join(TEMPLATES_DIR, templateName);
        
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template not found: ${templateName}`);
        }

        // Read template
        const templateBuffer = fs.readFileSync(templatePath);
        
        // 🔧 ENHANCED: Check if image module is available
        let ImageModule;
        try {
            const imageModuleImport = await import('docxtemplater-image-module-free');
            ImageModule = imageModuleImport.default;
            console.log('✅ Using docxtemplater-image-module-free');
        } catch (importError) {
            console.warn('⚠️ No image module available for signatures');
            console.warn('Install with: npm install docxtemplater-image-module-free');
            
            // Fallback without image module
            return await DocumentController.generateDocument(templateName, {
                ...templateData,
                SignatureImage: signatureBuffer ? '[Digital Signature Available - Image Module Required]' : '[No Signature Available]',
                HasSignature: !!signatureBuffer
            });
        }
        
        // Create PizZip instance
        const zip = new PizZip(templateBuffer);
        
        // 🔧 FIXED: Configure image module for SignatureImage tag
        const modules = [];
        
        if (ImageModule && signatureBuffer) {
            console.log('🖼️ Adding image module for signature processing');
            console.log('🖼️ Signature buffer size:', signatureBuffer.length, 'bytes');
            
            modules.push(new ImageModule({
                centered: false,
                fileType: "docx",
                getImage: function(tagValue, tagName) {
                    console.log('🖼️ Image module getImage called:', {
                        tagName: tagName,
                        tagValue: tagValue,
                        signatureBufferExists: !!signatureBuffer,
                        signatureBufferSize: signatureBuffer ? signatureBuffer.length : 0
                    });
                    
                    // 🔧 CRITICAL FIX: Match your template's SignatureImage tag
                    if (tagName === 'SignatureImage') {
                        if (signatureBuffer && Buffer.isBuffer(signatureBuffer)) {
                            console.log('✅ Returning signature buffer for SignatureImage tag');
                            return signatureBuffer;
                        } else {
                            console.error('❌ Signature buffer is not valid:', typeof signatureBuffer);
                            return null;
                        }
                    }
                    
                    console.log('ℹ️ Tag not matched:', tagName, '- Expected: SignatureImage');
                    return null;
                },
                getSize: function(img, tagValue, tagName) {
                    console.log('📏 Image module getSize called for:', tagName);
                    
                    if (tagName === 'SignatureImage') {
                        console.log('📏 Setting signature size: 200x100');
                        return [200, 100]; // Width: 200px, Height: 100px
                    }
                    
                    return [150, 150];
                },
                getProps: function(img, tagValue, tagName) {
                    console.log('🔧 Image module getProps called for:', tagName);
                    
                    return {
                        centered: false,
                        fileType: "png"
                    };
                }
            }));
            
            console.log('✅ Image module configured successfully');
        }
        
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            modules: modules,
            delimiters: {
                start: '{',
                end: '}'
            }
        });

        // 🔧 CRITICAL FIX: Use SignatureImage to match your template
        const processedData = { ...templateData };
        
        if (signatureBuffer && ImageModule) {
            // 🔧 KEY CHANGE: Use empty string to trigger image replacement
            processedData.SignatureImage = '';
            processedData.HasSignatureImage = true;
            processedData.SignatureText = '';
            console.log('🖼️ Set SignatureImage to empty string for image processing');
        } else if (signatureBuffer) {
            processedData.SignatureImage = '[Digital Signature Available - Image Module Required]';
            processedData.HasSignatureImage = false;
            processedData.SignatureText = 'Digital signature captured but image module not available';
        } else {
            processedData.SignatureImage = '[No Digital Signature Available]';
            processedData.HasSignatureImage = false;
            processedData.SignatureText = 'No digital signature provided';
        }

        console.log('📋 Final template data for processing:', {
            ...processedData,
            SignatureImage: signatureBuffer && ImageModule ? '[EMPTY_STRING_FOR_IMAGE]' : processedData.SignatureImage
        });

        // 🔧 RENDER: Process the document
        try {
            doc.render(processedData);
            console.log('✅ Document template rendered successfully');
        } catch (renderError) {
            console.error('❌ Error rendering document template:', renderError);
            
            // Try fallback without signature
            console.log('🔄 Retrying without signature...');
            processedData.SignatureImage = signatureBuffer ? 
                '[Digital Signature Processing Error]' : 
                '[No Digital Signature]';
            processedData.HasSignatureImage = false;
            
            doc.render(processedData);
        }

        // Generate buffer
        const buffer = doc.getZip().generate({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 9
            }
        });

        console.log('✅ Document generated successfully with signature support');
        return buffer;

    } catch (error) {
        console.error('❌ Error generating document with signature:', error);
        
        // Fallback to basic document generation
        try {
            console.log('🔄 Generating fallback document without signature...');
            return await DocumentController.generateDocument(templateName, {
                ...templateData,
                SignatureImage: signatureBuffer ? 
                    '[Digital Signature Captured - Processing Error]' : 
                    '[No Digital Signature]',
                HasSignature: !!signatureBuffer
            });
        } catch (fallbackError) {
            console.error('❌ Fallback document generation also failed:', fallbackError);
            throw new Error(`Document generation failed: ${error.message}`);
        }
    }
}

  // 🔧 UTILITY: Check if image module is available
  static async ensureImageModuleInstalled() {
      try {
          await import('docxtemplater-image-module-free');
          return true;
      } catch (error) {
          console.error('❌ docxtemplater-image-module-free not installed. Install with:');
          console.error('npm install docxtemplater-image-module-free');
          return false;
      }
  }

  // Add this new method to DocumentController class
static async convertAndUploadReport(req, res) {
  console.log('🔄 Converting HTML report and uploading...');
  console.log('Request body:', req.body); // Debug: Log the entire request body
  
  try {
    const { studyId } = req.params;
    const { 
      htmlContent, 
      format, 
      reportData, 
      templateInfo, 
      reportStatus = 'finalized',
      reportType = 'final-medical-report' 
    } = req.body;

    // Validate inputs
    if (!htmlContent || !htmlContent.trim()) {
      return res.status(400).json({
        success: false,
        message: 'HTML content is required'
      });
    }

    if (!format || !['pdf', 'docx'].includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Format must be either "pdf" or "docx"'
      });
    }

    // Get study data
    const study = await DicomStudy.findById(studyId)
      .populate('patient', 'patientID firstName lastName')
      .populate('assignment.assignedTo');

    if (!study) {
      return res.status(404).json({
        success: false,
        message: 'Study not found'
      });
    }

    // Get doctor info
    let doctor = null;
    let effectiveDoctorId = null;
    
    if (study.assignment?.assignedTo) {
      effectiveDoctorId = study.assignment.assignedTo;
      doctor = await Doctor.findById(effectiveDoctorId).populate('userAccount', 'fullName');
    }

    const uploaderName = doctor?.userAccount?.fullName || req.user?.fullName || 'Online System';

    // Prepare enhanced HTML with proper styling
    const styledHtml = DocumentController.prepareStyledHTML(htmlContent, reportData);
    
    let convertedBuffer;
    let fileName;
    let contentType;

    if (format.toLowerCase() === 'pdf') {
      // Convert to PDF
      const pdfResult = await DocumentController.convertHTMLToPDF(styledHtml, reportData);
      convertedBuffer = pdfResult.buffer;
      fileName = `final_report_${reportData?.patientName?.replace(/[^a-zA-Z0-9]/g, '_') || 'patient'}_${new Date().toISOString().split('T')[0]}.pdf`;
      contentType = 'application/pdf';
      
    } else if (format.toLowerCase() === 'docx') {
      // For DOCX: Use the NEW method to inject inline styles into the raw HTML.
      console.log('Preparing HTML for DOCX conversion...');
      const styledHtmlForDocx = DocumentController.prepareDocxCompatibleHTML(htmlContent);
      const docxResult = await DocumentController.convertHTMLToDOCX(styledHtmlForDocx, reportData);
      
      convertedBuffer = docxResult.buffer;
      fileName = `final_report_${reportData?.patientName?.replace(/[^a-zA-Z0-9]/g, '_') || 'patient'}_${new Date().toISOString().split('T')[0]}.docx`;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    console.log(`✅ Report converted to ${format.toUpperCase()}, size: ${convertedBuffer.length} bytes`);

    // Upload to Wasabi
    const wasabiResult = await WasabiService.uploadDocument(
      convertedBuffer,
      fileName,
      'clinical',
      {
        patientId: study.patientId,
        studyId: study.studyInstanceUID,
        uploadedBy: uploaderName,
        doctorId: effectiveDoctorId,
        reportStatus: reportStatus,
        format: format.toUpperCase(),
        convertedFromHTML: true
      }
    );

    if (!wasabiResult.success) {
      console.error('❌ Wasabi upload failed:', wasabiResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload converted report to storage',
        error: wasabiResult.error
      });
    }

    console.log('✅ Converted report uploaded to Wasabi:', wasabiResult.key);

    // Create Document record
    const documentRecord = new Document({
      fileName: fileName,
      fileSize: convertedBuffer.length,
      contentType: contentType,
      documentType: 'clinical',
      wasabiKey: wasabiResult.key,
      wasabiBucket: wasabiResult.bucket,
      patientId: study.patientId,
      studyId: study._id,
      uploadedBy: req.user.id
    });

    await documentRecord.save();

    // Add to study's doctorReports
    const doctorReportDocument = {
      _id: documentRecord._id,
      filename: fileName,
      contentType: contentType,
      size: convertedBuffer.length,
      reportType: doctor ? 'doctor-report' : 'radiologist-report',
      uploadedAt: new Date(),
      uploadedBy: uploaderName,
      reportStatus: reportStatus,
      doctorId: effectiveDoctorId,
      // Add conversion metadata
      convertedFromHTML: true,
      originalFormat: 'html',
      convertedFormat: format.toUpperCase(),
      templateUsed: templateInfo?.templateName || 'Online Editor'
    };

    if (!study.doctorReports) {
      study.doctorReports = [];
    }

    study.doctorReports.push(doctorReportDocument);
    study.ReportAvailable = true;

    // Update report info
    study.reportInfo = study.reportInfo || {};
    study.reportInfo.finalizedAt = new Date();
    study.reportInfo.reporterName = uploaderName;

    // Update workflow status
    try {
      await updateWorkflowStatus({
        studyId: studyId,
        status: 'report_finalized',
        doctorId: effectiveDoctorId,
        note: `HTML report converted to ${format.toUpperCase()} and uploaded by ${uploaderName}`,
        user: req.user
      });
    } catch (workflowError) {
      console.warn('Workflow status update failed:', workflowError.message);
    }

    await study.save();

    // Generate download URL (optional)
    const downloadUrl = `/api/documents/study/${studyId}/reports/${study.doctorReports.length - 1}/download`;

    res.json({
      success: true,
      message: `Report successfully converted to ${format.toUpperCase()} and uploaded`,
      report: {
        _id: documentRecord._id,
        filename: fileName,
        size: convertedBuffer.length,
        format: format.toUpperCase(),
        reportType: doctorReportDocument.reportType,
        reportStatus: reportStatus,
        uploadedBy: uploaderName,
        uploadedAt: doctorReportDocument.uploadedAt,
        wasabiKey: wasabiResult.key,
        storageType: 'wasabi',
        convertedFromHTML: true
      },
      downloadUrl: downloadUrl,
      workflowStatus: 'report_finalized',
      study: {
        _id: study._id,
        patientName: reportData?.patientName || 'Unknown Patient'
      }
    });

  } catch (error) {
    console.error('❌ Error converting and uploading report:', error);
    res.status(500).json({
      success: false,
      message: 'Error converting and uploading report',
      error: error.message
    });
  }
}

static prepareStyledHTML(htmlContent, reportData) {
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {
                size: A4;
                margin: 1cm;
            }
            
            body {
                font-family: Arial, sans-serif;
                line-height: 1.4;
                margin: 0;
                color: #000;
                font-size: 11pt;
            }
            
            .multi-page-report {
                max-width: 100%;
                margin: 0;
                counter-reset: page;
            }
            
            .report-page {
                page-break-after: always;
                counter-increment: page;
                min-height: calc(100vh - 2cm);
                position: relative;
            }
            
            .report-page:last-child {
                page-break-after: auto;
            }
            
            .page-header-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
                font-size: 10pt;
            }
            
            .page-header-table td {
                padding: 6px 8px;
                border: 1px solid #000;
                vertical-align: top;
            }
            
            .page-header-table td:first-child, 
            .page-header-table td:nth-child(3) {
                background-color: #b2dfdb;
                font-weight: bold;
                width: 20%;
            }
            
            .page-header-table td:nth-child(2),
            .page-header-table td:nth-child(4) {
                background-color: #ffffff;
                width: 30%;
            }
            
            .content-flow-area {
                margin-bottom: 40px;
            }
            
            .floating-signature {
                margin-top: 40px;
                text-align: left;
                font-size: 10pt;
                line-height: 1.1;
                page-break-inside: avoid;
            }
            
            .doctor-name {
                font-weight: bold;
                margin-bottom: 1px;
                font-size: 11pt;
            }
            
            .doctor-specialization, .doctor-license {
                margin: 1px 0;
                font-size: 11pt;
            }
            
            .signature-image {
                width: 80px;
                height: 40px;
                margin: 5px 0;
            }
            
            .disclaimer {
                font-style: italic;
                color: #666;
                font-size: 8pt;
                margin-top: 10px;
                line-height: 1.0;
            }
            
            /* Section styling */
            .report-title, h1, h2, h3, .section-heading {
                font-weight: bold;
                text-decoration: underline;
                page-break-after: avoid;
            }
            
            .report-title, h1 {
                font-size: 14pt;
                text-align: center;
                margin: 20px 0 15px 0;
            }
            
            h2 {
                font-size: 12pt;
                text-align: center;
                margin: 15px 0 10px 0;
            }
            
            h3, .section-heading {
                font-size: 11pt;
                margin: 15px 0 8px 0;
            }
            
            p {
                margin: 4px 0;
                font-size: 11pt;
                line-height: 1.4;
                orphans: 2;
                widows: 2;
            }
            
            ul, ol {
                margin: 8px 0;
                padding-left: 25px;
            }
            
            li {
                margin: 3px 0;
                font-size: 11pt;
            }
            
            strong { font-weight: bold; }
            u { text-decoration: underline; }
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
  `;
  
  return styledHtml;
}

// Helper method to convert HTML to PDF using Puppeteer
static async convertHTMLToPDF(htmlContent, reportData) {
  let browser = null;
  
  try {
    console.log('🔄 Launching Puppeteer for PDF conversion...');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set content
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm'
      },
      printBackground: true
    });

    console.log('✅ PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    
    return {
      buffer: pdfBuffer,
      success: true
    };

  } catch (error) {
    console.error('❌ PDF conversion error:', error);
    throw new Error(`PDF conversion failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}


static prepareDocxCompatibleHTML(htmlContent) {
    console.log('✨ Applying final styles and layout container for DOCX...');
    
   
    
    const $ = cheerio.load(htmlContent);

    // --- Apply all the specific styles from before ---
    
    // Style the Patient Info Table
    const patientTable = $('table').first();
    patientTable.css({
        'width': '100%', // The table should be 100% of its NEW container
        'border-collapse': 'collapse',
        'font-family': 'Arial, sans-serif',
        'font-size': '10pt'
    });
    patientTable.find('td').css({
        'border': '0.5pt solid #a0a0a0',
        'padding': '4px 8px',
        'vertical-align': 'top'
    });
    patientTable.find('tr').each((i, row) => {
        $(row).find('td:nth-child(1), td:nth-child(3)').css({
            'background-color': '#e7f5fe', 
            'font-weight': 'bold',
        });
    });

    // Style Headings
    $('h2').css({ 'text-align': 'center', 'font-size': '14pt', 'font-weight': 'bold', 'text-decoration': 'underline' });
    $('p:has(strong):has(u)').css({ 'font-size': '11pt', 'font-weight': 'bold', 'text-decoration': 'underline' });

    // Style Paragraphs and Lists
    $('p, li').css({ 'font-family': 'Arial, sans-serif', 'font-size': '11pt', 'margin': '5px 0' });

    // Style Signature Block
    const signatureBlock = $('p:contains("Dr.")').nextAll().addBack();
    signatureBlock.each((i, el) => {
        const element = $(el);
        if (element.is('p')) {
            element.css({ 'margin': '1px 0', 'line-height': '1.1', 'font-size': '10pt' });
        }
        if (element.is('img')) {
            element.css({ 'width': '80px', 'height': 'auto', 'margin': '5px 0' });
        }
    });

    // --- FIX: Wrap ALL content in a master container div to control width ---
    // This is the most important change to fix the layout.
    const originalBodyContent = $('body').html();
    $('body').html(
        `<div style="max-width: 680px; margin: 0 auto;">${originalBodyContent}</div>`
    );

    return $.html();
}


static async convertHTMLToDOCX(htmlContent, reportData) {
  console
  try {
    console.log('🔄 Converting HTML to DOCX...');
    
    // For DOCX conversion, you'll need a library like 'html-docx-js' or 'html-to-docx'
    // Install: npm install html-to-docx
    
    const HTMLtoDOCX = await import('html-to-docx');
    
    const docxBuffer = await HTMLtoDOCX.default(htmlContent, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      font: 'Arial'
    });

    console.log('✅ DOCX generated successfully, size:', docxBuffer.length, 'bytes');
    
    return {
      buffer: docxBuffer,
      success: true
    };

  } catch (error) {
    console.error('❌ DOCX conversion error:', error);
    throw new Error(`DOCX conversion failed: ${error.message}`);
  }
}

static async generateReportWithDocxService(req, res) {
    console.log('🔄 Received request to generate report via C# DOCX Service...');
    console.log('Request body:', req.body); // Debug: Log the entire request body

    try {
        const { studyId } = req.params;
        const { templateName, placeholders } = req.body;

        if (!templateName || !placeholders) {
            return res.status(400).json({ success: false, message: 'templateName and placeholders are required.' });
        }
        
        const study = await DicomStudy.findById(studyId).populate('patient').populate('assignment.assignedTo');
        if (!study) {
            return res.status(404).json({ success: false, message: 'Study not found' });
        }

        // --- Step 1: Call the C# DOCX Generation Service ---
        console.log(`📞 Calling C# service with template: ${templateName}`);
        
        const docxResponse = await axios.post(DOCX_SERVICE_URL, {
            templateName: templateName,
            placeholders: placeholders
        }, {
            responseType: 'arraybuffer' 
        });

        const docxBuffer = Buffer.from(docxResponse.data);
        console.log(`✅ Received generated DOCX from C# service, size: ${docxBuffer.length} bytes`);

        // --- Step 2: Upload the generated DOCX to Wasabi ---
        const fileName = `${study.patientInfo?.patientName}.docx`;
        const wasabiResult = await WasabiService.uploadDocument(docxBuffer, fileName, 'final-reports', { studyId });
        
        if (!wasabiResult.success) {
            throw new Error(`Wasabi upload failed: ${wasabiResult.error}`);
        }
        console.log('✅ Report uploaded to Wasabi successfully.');

        // --- MERGED LOGIC: Get Doctor Info and Uploader Name ---
        let doctor = study.assignment?.assignedTo;
        const uploaderName = doctor?.fullName || req.user?.fullName || 'Online System';

        // --- MERGED LOGIC: Create the main Document record ---
        const documentRecord = new Document({
            studyId: study._id,
            patientId: study.patient?._id,
            fileName: fileName,
            fileSize: docxBuffer.length,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            wasabiKey: wasabiResult.key,
            wasabiBucket: wasabiResult.bucket,
            documentType: 'clinical', // Matching your old 'clinical' type
            uploadedBy: req.user._id
        });
        await documentRecord.save();

        // --- MERGED LOGIC: Create the detailed doctorReports sub-document ---
        const doctorReportDocument = {
            _id: documentRecord._id,
            filename: fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: docxBuffer.length,
            reportType: doctor ? 'doctor-report' : 'radiologist-report',
            uploadedAt: new Date(),
            uploadedBy: uploaderName,
            reportStatus: 'finalized',
            doctorId: doctor?._id,
            wasabiKey: wasabiResult.key,
            wasabiBucket: wasabiResult.bucket,
            storageType: 'wasabi',
            templateUsed: templateName // Use the templateName from the request
        };

        // --- MERGED LOGIC: Update the Study with the new report ---
        if (!study.doctorReports) {
            study.doctorReports = [];
        }
        study.doctorReports.push(doctorReportDocument);
        study.ReportAvailable = true;

        // Update other study fields as per your old logic
        study.reportInfo = study.reportInfo || {};
        study.reportInfo.finalizedAt = new Date();
        study.reportInfo.reporterName = uploaderName;
        study.workflowStatus = 'report_finalized'; // Or call your updateWorkflowStatus function
        
        await study.save();
        console.log('✅ Database updated successfully with detailed report info.');
        
        const downloadUrl = wasabiResult.url; // Assuming wasabi service returns the final URL

        res.status(201).json({
            success: true,
            message: 'Report generated and uploaded successfully',
            data: {
                documentId: documentRecord._id,
                filename: fileName,
                downloadUrl: downloadUrl
            }
        });

    } catch (error) {
        console.error('❌ Error in new DOCX service workflow:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to generate report',
            error: error.message
        });
    }
}

static async generateReportWithDocxServiceDraft(req, res) {
    console.log('🔄 Received request to generate report via C# DOCX Service...');
        console.log('Request body:', req.body); // Debug: Log the entire request body


    try {
        const { studyId } = req.params;
        const { templateName, placeholders } = req.body;

        if (!templateName || !placeholders) {
            return res.status(400).json({ success: false, message: 'templateName and placeholders are required.' });
        }
        
        const study = await DicomStudy.findById(studyId).populate('patient').populate('assignment.assignedTo');
        if (!study) {
            return res.status(404).json({ success: false, message: 'Study not found' });
        }

        // --- Step 1: Call the C# DOCX Generation Service ---
        console.log(`📞 Calling C# service with template: ${templateName}`);
        
        const docxResponse = await axios.post(DOCX_SERVICE_URL, {
            templateName: templateName,
            placeholders: placeholders
        }, {
            responseType: 'arraybuffer' 
        });

        const docxBuffer = Buffer.from(docxResponse.data);
        console.log(`✅ Received generated DOCX from C# service, size: ${docxBuffer.length} bytes`);

        // --- Step 2: Upload the generated DOCX to Wasabi ---
        const fileName = `${study.patientInfo?.patientName}.docx`;
        const wasabiResult = await WasabiService.uploadDocument(docxBuffer, fileName, 'final-reports', { studyId });
        
        if (!wasabiResult.success) {
            throw new Error(`Wasabi upload failed: ${wasabiResult.error}`);
        }
        console.log('✅ Report uploaded to Wasabi successfully.');

        // --- MERGED LOGIC: Get Doctor Info and Uploader Name ---
        let doctor = study.assignment?.assignedTo;
        const uploaderName = doctor?.fullName || req.user?.fullName || 'Online System';

        // --- MERGED LOGIC: Create the main Document record ---
        const documentRecord = new Document({
            studyId: study._id,
            patientId: study.patient?._id,
            fileName: fileName,
            fileSize: docxBuffer.length,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            wasabiKey: wasabiResult.key,
            wasabiBucket: wasabiResult.bucket,
            documentType: 'clinical', // Matching your old 'clinical' type
            uploadedBy: req.user._id
        });
        await documentRecord.save();

        // --- MERGED LOGIC: Create the detailed doctorReports sub-document ---
        const doctorReportDocument = {
            _id: documentRecord._id,
            filename: fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: docxBuffer.length,
            reportType: doctor ? 'doctor-report' : 'radiologist-report',
            uploadedAt: new Date(),
            uploadedBy: uploaderName,
            reportStatus: 'draft',
            doctorId: doctor?._id,
            wasabiKey: wasabiResult.key,
            wasabiBucket: wasabiResult.bucket,
            storageType: 'wasabi',
            templateUsed: templateName // Use the templateName from the request
        };

        // --- MERGED LOGIC: Update the Study with the new report ---
        if (!study.doctorReports) {
            study.doctorReports = [];
        }
        study.doctorReports.push(doctorReportDocument);
        study.ReportAvailable = true;

        // Update other study fields as per your old logic
        study.reportInfo = study.reportInfo || {};
        study.reportInfo.finalizedAt = new Date();
        study.reportInfo.reporterName = uploaderName;
        study.workflowStatus = 'report_drafted'; // Or call your updateWorkflowStatus function
        
        await study.save();
        console.log('✅ Database updated successfully with detailed report info.');
        
        const downloadUrl = wasabiResult.url; // Assuming wasabi service returns the final URL

        res.status(201).json({
            success: true,
            message: 'Report generated and uploaded successfully',
            data: {
                documentId: documentRecord._id,
                filename: fileName,
                downloadUrl: downloadUrl
            }
        });

    } catch (error) {
        console.error('❌ Error in new DOCX service workflow:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to generate report',
            error: error.message
        });
    }
}

static async getStudyDownloadInfo (req, res)  {
    try {
        const { studyId } = req.params;
        
        console.log('🔍 Getting download info for study:', studyId);
        
        // Find study with download information
        const study = await DicomStudy.findById(studyId)
            .populate('patient', 'patientID patientNameRaw firstName lastName clinicalHistory')
            .select('orthancStudyID studyInstanceUID preProcessedDownload seriesCount instanceCount patientId patient')
            .lean();
        
        if (!study) {
            console.log('❌ Study not found:', studyId);
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        console.log('📊 Found study with patient ObjectId:', study.patient?._id, '(patientId:', study.patientId + ')');
        
        // Extract study identifiers
        const orthancStudyID = study.orthancStudyID;
        const studyInstanceUID = study.studyInstanceUID;
        
        console.log('🔍 Extracted study identifiers:', {
            orthancStudyID,
            studyInstanceUID,
            originalStudyId: study._id
        });
        
        // Check R2 CDN availability
        const preProcessedDownload = study.preProcessedDownload || {};
        const hasR2CDN = preProcessedDownload.zipStatus === 'completed' && !!preProcessedDownload.zipUrl;
        const r2SizeMB = preProcessedDownload.zipSizeMB || 0;
        
        console.log('🌐 R2 CDN availability:', {
            hasR2Zip: hasR2CDN,
            zipStatus: preProcessedDownload.zipStatus || 'pending',
            downloadOptions: preProcessedDownload
        });
        
        // Prepare download endpoints
        const downloadEndpoints = {
            r2CDN: `/api/download/study/${orthancStudyID}/r2-direct`,
            orthancDirect: `/api/orthanc-download/study/${orthancStudyID}/download`,
            preProcessed: `/api/download/study/${orthancStudyID}/pre-processed`,
            createZip: `/api/download/study/${orthancStudyID}/create`
        };
        
        // 🔧 FIX: Safely access patient data with fallbacks
        const patientData = study.patient || {};
        const clinicalHistory = patientData.clinicalHistory || 
                              patientData.medicalHistory?.clinicalHistory || 
                              'No clinical history available';
        
        const response = {
            success: true,
            orthancStudyID: orthancStudyID,
            studyInstanceUID: studyInstanceUID,
            downloadOptions: {
                hasR2CDN: hasR2CDN,
                hasWasabiZip: hasR2CDN, // Legacy compatibility
                hasR2Zip: hasR2CDN,
                r2SizeMB: r2SizeMB,
                wasabiSizeMB: r2SizeMB, // Legacy compatibility
                zipStatus: preProcessedDownload.zipStatus || 'not_started',
                zipCreatedAt: preProcessedDownload.zipCreatedAt,
                zipExpiresAt: preProcessedDownload.zipExpiresAt,
                downloadCount: preProcessedDownload.downloadCount || 0,
                lastDownloaded: preProcessedDownload.lastDownloaded,
                endpoints: downloadEndpoints
            },
            studyInfo: {
                seriesCount: study.seriesCount || 0,
                instanceCount: study.instanceCount || 0,
                patientId: study.patientId || patientData.patientID,
                patientName: patientData.patientNameRaw || 
                           `${patientData.firstName || ''} ${patientData.lastName || ''}`.trim() ||
                           'Unknown Patient',
                clinicalHistory: clinicalHistory
            }
        };
        
        console.log('✅ Sending download info response:', {
            hasR2CDN: response.downloadOptions.hasR2CDN,
            zipStatus: response.downloadOptions.zipStatus,
            endpoints: Object.keys(response.downloadOptions.endpoints)
        });
        
        res.json(response);
        
    } catch (error) {
        console.error('❌ Error getting study download info:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get study download information',
            error: error.message
        });
    }
};

static async downloadStudyFromR2CDN(req, res) {
    try {
        const { studyId } = req.params;
        
        // Get study to extract orthancStudyID
        const study = await DicomStudy.findOne({
            $or: [
                { _id: studyId },
                { orthancStudyID: studyId },
                { studyInstanceUID: studyId }
            ]
        }).select('orthancStudyID');

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }

        // Redirect to the existing R2 download endpoint
        const orthancStudyId = study.orthancStudyID || studyId;
        return res.redirect(`/api/download/study/${orthancStudyId}/r2-direct`);

    } catch (error) {
        console.error('❌ Error redirecting to R2 CDN download:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to redirect to R2 CDN download',
            error: error.message
        });
    }
}

static async downloadStudyFromOrthanc(req, res) {
    try {
        const { studyId } = req.params;
        
        console.log(`📥 Direct Orthanc download for study: ${studyId}`);

        // Get study to extract proper Orthanc ID
        const study = await DicomStudy.findOne({
            $or: [
                { _id: studyId },
                { orthancStudyID: studyId },
                { studyInstanceUID: studyId }
            ]
        }).select('orthancStudyID studyInstanceUID');

        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }

        const orthancStudyId = study.orthancStudyID || study.studyInstanceUID || studyId;
        
        // Forward to Orthanc download endpoint
        const response = await api.get(`/orthanc-download/study/${orthancStudyId}/download`, {
            responseType: 'stream'
        });

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="study_${orthancStudyId}.zip"`);
        res.setHeader('Content-Type', 'application/zip');
        
        // Pipe the stream
        response.data.pipe(res);
        
        console.log(`✅ Orthanc download stream started for: ${orthancStudyId}`);

    } catch (error) {
        console.error('❌ Error with direct Orthanc download:', error);
        
        if (error.response?.status === 404) {
            res.status(404).json({
                success: false,
                message: 'Study not found on Orthanc server'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to download from Orthanc',
                error: error.message
            });
        }
    }
}


static async getStudyInfoForReporting  (req, res) {
    try {
        const { studyId } = req.params;
        
        console.log('🔍 Getting comprehensive study info for reporting:', studyId);
        
        // Find study with all necessary populated data
        const study = await DicomStudy.findById(studyId)
            .populate('patient', 'patientID patientNameRaw firstName lastName age gender dateOfBirth clinicalInfo medicalHistory')
            .populate('sourceLab', 'name identifier')
            .populate({
                path: 'lastAssignedDoctor',
                populate: {
                    path: 'userAccount',
                    select: 'fullName email'
                }
            })
            .select(`
                _id orthancStudyID studyInstanceUID accessionNumber workflowStatus 
                modality modalitiesInStudy studyDescription examDescription 
                seriesCount instanceCount studyDate studyTime createdAt 
                patientId preProcessedDownload clinicalHistory referringPhysician 
                referringPhysicianName caseType assignment priority
            `)
            .lean();
        
        if (!study) {
            console.log('❌ Study not found:', studyId);
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        console.log('📊 Found study with patient ObjectId:', study.patient?._id, '(patientId:', study.patientId + ')');
        
        // Extract patient information with multiple fallbacks
        const patient = study.patient || {};
        const patientName = patient.patientNameRaw || 
                           `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 
                           'Unknown Patient';
        
        // Extract clinical history from multiple possible locations
        const clinicalHistory = study.clinicalHistory || 
                              patient.clinicalInfo?.clinicalHistory || 
                              patient.medicalHistory?.clinicalHistory || 
                              'No clinical history available';
        
        // Extract study identifiers
        const orthancStudyID = study.orthancStudyID;
        const studyInstanceUID = study.studyInstanceUID;
        
        console.log('🔍 Extracted study identifiers:', {
            orthancStudyID,
            studyInstanceUID,
            originalStudyId: study._id
        });
        
        // Check R2 download availability
        const preProcessedDownload = study.preProcessedDownload || {};
        const hasR2CDN = preProcessedDownload.zipStatus === 'completed' && !!preProcessedDownload.zipUrl;
        const r2SizeMB = preProcessedDownload.zipSizeMB || 0;
        
        console.log('🌐 R2 CDN availability:', {
            hasR2Zip: hasR2CDN,
            zipStatus: preProcessedDownload.zipStatus || 'pending',
            downloadOptions: preProcessedDownload
        });
        
        // Prepare download options
        const downloadOptions = {
            hasR2CDN: hasR2CDN,
            hasWasabiZip: hasR2CDN, // Legacy compatibility
            hasR2Zip: hasR2CDN,
            r2SizeMB: r2SizeMB,
            wasabiSizeMB: r2SizeMB, // Legacy compatibility
            zipStatus: preProcessedDownload.zipStatus || 'not_started',
            zipCreatedAt: preProcessedDownload.zipCreatedAt,
            zipExpiresAt: preProcessedDownload.zipExpiresAt,
            downloadCount: preProcessedDownload.downloadCount || 0,
            lastDownloaded: preProcessedDownload.lastDownloaded,
            endpoints: {
                r2CDN: `/api/download/study/${orthancStudyID}/r2-direct`,
                preProcessed: `/api/download/study/${orthancStudyID}/pre-processed`,
                orthancDirect: `/api/orthanc-download/study/${orthancStudyID}/download`,
                createZip: `/api/download/study/${orthancStudyID}/create`
            }
        };
        
        // Format study information
        const studyInfo = {
            _id: study._id,
            orthancStudyID: orthancStudyID,
            studyInstanceUID: studyInstanceUID,
            accessionNumber: study.accessionNumber || 'N/A',
            workflowStatus: study.workflowStatus || 'pending_assignment',
            modality: study.modalitiesInStudy?.length > 0 ? 
                     study.modalitiesInStudy.join(', ') : (study.modality || 'N/A'),
            description: study.studyDescription || study.examDescription || 'N/A',
            studyDate: study.studyDate,
            studyTime: study.studyTime,
            createdAt: study.createdAt,
            seriesCount: study.seriesCount || 0,
            instanceCount: study.instanceCount || 0,
            priority: study.assignment?.priority || study.priority || 'NORMAL',
            caseType: study.caseType || 'routine',
            sourceLab: study.sourceLab?.name || 'N/A',
            assignedDoctor: study.lastAssignedDoctor?.userAccount?.fullName || 'Not Assigned',
            referringPhysician: study.referringPhysician || study.referringPhysicianName || 'N/A'
        };
        
        // Format patient information
        const patientInfo = {
            patientId: study.patientId || patient.patientID || 'N/A',
            patientName: patientName,
            fullName: patientName,
            age: patient.age || 'N/A',
            gender: patient.gender || 'N/A',
            dateOfBirth: patient.dateOfBirth || 'N/A',
            clinicalHistory: clinicalHistory
        };
        
        const response = {
            success: true,
            data: {
                studyInfo,
                patientInfo,
                downloadOptions,
                clinicalHistory: clinicalHistory,
                // Additional metadata for frontend
                metadata: {
                    hasR2Download: hasR2CDN,
                    downloadReady: hasR2CDN,
                    storageProvider: 'cloudflare-r2',
                    lastUpdated: new Date()
                }
            }
        };
        
        console.log('✅ Sending comprehensive study info response:', {
            studyId: studyInfo._id,
            patientName: patientInfo.patientName,
            hasR2CDN: downloadOptions.hasR2CDN,
            endpoints: Object.keys(downloadOptions.endpoints)
        });
        
        res.json(response);
        
    } catch (error) {
        console.error('❌ Error getting study info for reporting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get study information for reporting',
            error: error.message
        });
    }
};
}

export default DocumentController;