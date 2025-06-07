import RadiantBridgeService from '../services/RadientBridgeService.js';
import DicomStudy from '../models/dicomStudyModel.js';
import axios from 'axios';

const radiantService = new RadiantBridgeService();

// 🔧 SIMPLIFIED: Use rich frontend study data
export const launchStudyInRadiant = async (req, res) => {
  try {
    const { orthancStudyId } = req.params;
    const studyData = req.body; // Get complete study data from frontend
    
    console.log('🖥️ Radiant launch request for:', orthancStudyId);
    console.log('📋 Received study data keys:', Object.keys(studyData));
    
    // 🔧 SIMPLIFIED: Use frontend data directly with fallbacks
    const studyInfo = {
      // Required fields
      orthancStudyId: orthancStudyId,
      studyInstanceUID: studyData.studyInstanceUID || studyData.instanceID || `FALLBACK_${orthancStudyId}`,
      
      // Patient information
      patientName: studyData.patientName || 'Unknown Patient',
      patientId: studyData.patientId || 'Unknown',
      patientGender: studyData.patientGender || 'Unknown',
      patientDateOfBirth: studyData.patientDateOfBirth || 'Unknown',
      
      // Study details
      modality: studyData.modality || studyData.modalitiesInStudy?.[0] || 'Unknown',
      modalitiesInStudy: studyData.modalitiesInStudy || [studyData.modality || 'Unknown'],
      studyDate: studyData.studyDate || studyData.studyDateTime || 'Unknown',
      studyDateTime: studyData.studyDateTime || studyData.studyDate || 'Unknown',
      studyTime: studyData.studyTime || '',
      description: studyData.description || 'DICOM Study',
      accessionNumber: studyData.accessionNumber || '',
      
      // Study metadata
      seriesCount: studyData.seriesCount || studyData.numberOfSeries || 1,
      instanceCount: studyData.instanceCount || studyData.numberOfImages || 1,
      seriesImages: studyData.seriesImages || `${studyData.seriesCount || 1}/${studyData.instanceCount || 1}`,
      
      // Institution info
      institutionName: studyData.institutionName || studyData.labName || 'Unknown Institution',
      location: studyData.location || studyData.labName || 'Unknown Location',
      
      // Additional context for RadiAnt metadata
      caseType: studyData.caseType || 'routine',
      currentCategory: studyData.currentCategory || 'unknown',
      workflowStatus: studyData.workflowStatus || 'unknown',
      assignmentPriority: studyData.assignmentPriority || 'NORMAL',
      
      // Doctor information (if assigned)
      assignedDoctorName: studyData.assignedDoctorName || null,
      assignedDoctorSpecialization: studyData.assignedDoctorSpecialization || null,
      
      // Clinical details
      clinicalHistory: studyData.clinicalHistory || '',
      referralOrUrgencyNotes: studyData.referralOrUrgencyNotes || '',
      
      // Timestamps
      uploadDate: studyData.uploadDate || studyData.uploadDateTime || studyData.createdAt,
      createdAt: studyData.createdAt,
      
      // Database reference
      studyDbId: studyData.studyDbId || null
    };
    
    console.log('🎯 Processed study info for RadiAnt:', {
      orthancStudyId: studyInfo.orthancStudyId,
      studyInstanceUID: studyInfo.studyInstanceUID,
      patientName: studyInfo.patientName,
      modality: studyInfo.modality,
      seriesCount: studyInfo.seriesCount,
      instanceCount: studyInfo.instanceCount
    });
    
    // Validate minimum required fields
    if (!studyInfo.orthancStudyId) {
      return res.status(400).json({
        success: false,
        message: 'Orthanc Study ID is required for Radiant launch'
      });
    }
    
    // Launch Radiant Viewer
    console.log('🚀 Launching Radiant Viewer...');
    const result = await radiantService.launchStudyInRadiant(studyInfo);
    
    // Log successful launch
    console.log(`✅ Radiant launched successfully for ${studyInfo.patientName} (${studyInfo.modality})`);
    
    res.json({
      success: true,
      message: 'Radiant Viewer launched successfully',
      data: {
        ...result,
        studyInfo: {
          patientName: studyInfo.patientName,
          patientId: studyInfo.patientId,
          modality: studyInfo.modality,
          studyDate: studyInfo.studyDate,
          studyInstanceUID: studyInfo.studyInstanceUID,
          orthancStudyId: studyInfo.orthancStudyId,
          seriesCount: studyInfo.seriesCount,
          instanceCount: studyInfo.instanceCount,
          institutionName: studyInfo.institutionName
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error launching Radiant Viewer:', error);
    
    // Enhanced error response with context
    let errorResponse = {
      success: false,
      message: 'Failed to launch Radiant Viewer',
      error: error.message
    };
    
    // Add specific error context
    if (error.message.includes('not found')) {
      const status = radiantService.getStatus();
      errorResponse.installationGuide = status.installationGuide;
      errorResponse.detectedPaths = status.radiantViewer.paths;
      errorResponse.checkedPaths = status.radiantViewer.totalPathsChecked;
    }
    
    // Add debugging info for development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.debugInfo = {
        receivedOrthancStudyId: req.params.orthancStudyId,
        receivedDataKeys: Object.keys(req.body),
        studyDataSample: {
          studyInstanceUID: req.body.studyInstanceUID,
          patientName: req.body.patientName,
          modality: req.body.modality
        }
      };
    }
    
    res.status(500).json(errorResponse);
  }
};

// 🔧 GET RADIANT BRIDGE STATUS
export const getRadiantStatus = async (req, res) => {
  try {
    const status = radiantService.getStatus();
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    console.error('Error getting Radiant status:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to get Radiant status',
      error: error.message
    });
  }
};

// 🔧 CLEANUP TEMPORARY FILES
export const cleanupTempFiles = async (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.query;
    
    // This would need to be implemented to scan and clean temp directories
    await radiantService.cleanupTempFiles(null, parseInt(maxAgeHours));
    
    res.json({
      success: true,
      message: `Cleaned up temporary files older than ${maxAgeHours} hours`
    });
    
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup temp files',
      error: error.message
    });
  }
};

// 🔧 UNIVERSAL LAUNCH ENDPOINT (for any client)
export const universalRadiantLaunch = async (req, res) => {
  try {
    const {
      studyInstanceUID,
      orthancStudyId,
      patientName,
      patientId,
      modality,
      studyDate,
      accessionNumber
    } = req.body;
    
    console.log('🌍 Universal Radiant launch request:', req.body);
    
    // Validate minimum required data
    if (!studyInstanceUID && !orthancStudyId) {
      return res.status(400).json({
        success: false,
        message: 'Either studyInstanceUID or orthancStudyId is required'
      });
    }
    
    // If we have studyInstanceUID but no orthancStudyId, try to find it
    let finalOrthancStudyId = orthancStudyId;
    if (!finalOrthancStudyId && studyInstanceUID) {
      const study = await DicomStudy.findOne({ studyInstanceUID });
      finalOrthancStudyId = study?.orthancStudyID;
    }
    
    if (!finalOrthancStudyId) {
      return res.status(404).json({
        success: false,
        message: 'Could not find Orthanc Study ID for the provided study'
      });
    }
    
    const studyInfo = {
      studyInstanceUID: studyInstanceUID || `UNKNOWN_${Date.now()}`,
      orthancStudyId: finalOrthancStudyId,
      patientName: patientName || 'Unknown Patient',
      patientId: patientId || 'Unknown',
      modality: modality || 'Unknown',
      studyDate: studyDate || 'Unknown',
      accessionNumber: accessionNumber || '',
      description: `Universal launch for ${patientName || 'Unknown Patient'}`
    };
    
    const result = await radiantService.launchStudyInRadiant(studyInfo);
    
    res.json({
      success: true,
      message: 'Radiant Viewer launched via universal endpoint',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Error in universal Radiant launch:', error);
    
    res.status(500).json({
      success: false,
      message: 'Universal Radiant launch failed',
      error: error.message
    });
  }
};