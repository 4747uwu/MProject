import express from 'express';
import axios from 'axios';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import DicomStudy from '../models/dicomStudyModel.js';

const router = express.Router();

// Orthanc configuration
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://64.227.187.164:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// Download complete study as ZIP
router.get('/study/:orthancStudyId/download', protect, authorize('admin', 'lab_staff', 'doctor_account'), async (req, res) => {
  try {
    const { orthancStudyId } = req.params;
    
    console.log(`Downloading study: ${orthancStudyId} by user role: ${req.user.role}`);
    
    // Get study metadata for filename
    const metadataResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}`, {
      headers: { 'Authorization': orthancAuth }
    });
    
    const studyMetadata = metadataResponse.data;
    const patientName = studyMetadata.PatientMainDicomTags?.PatientName || 'Unknown';
    const patientId = studyMetadata.PatientMainDicomTags?.PatientID || 'Unknown';
    const studyDate = studyMetadata.MainDicomTags?.StudyDate || '';
    
    // Download the study archive
    const downloadResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}/archive`, {
      headers: { 'Authorization': orthancAuth },
      responseType: 'stream'
    });
    
    // Set headers for file download
    const filename = `Study_${patientName.replace(/[^a-zA-Z0-9]/g, '_')}_${patientId}_${studyDate}_${orthancStudyId}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    
    // 🔧 FIX: Only set Content-Length if it exists and is valid
    const contentLength = downloadResponse.headers['content-length'];
    if (contentLength && contentLength !== 'undefined') {
      res.setHeader('Content-Length', contentLength);
    }
    
    // Log response headers for debugging
    console.log('Download response headers:', downloadResponse.headers);
    console.log('Content-Length value:', contentLength);
    
    // Update workflow status based on user role after successful download initiation
    try {
      // Find the study in our database
      const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId });
      
      if (study) {
        let newStatus;
        let statusNote;
        
        // Determine workflow status based on user role
        if (req.user.role === 'doctor_account') {
          newStatus = 'report_downloaded_radiologist';
          statusNote = `Study downloaded by radiologist: ${req.user.fullName || req.user.email}`;
        } else if (req.user.role === 'lab_staff' || req.user.role === 'admin') {
          newStatus = 'report_downloaded';
          statusNote = `Study downloaded by ${req.user.role}: ${req.user.fullName || req.user.email}`;
        }
        
        // Update workflow status if we determined a new status
        if (newStatus) {
          await updateWorkflowStatus({
            studyId: study._id,
            status: newStatus,
            note: statusNote,
            user: req.user
          });
          
          console.log(`Workflow status updated to ${newStatus} for study ${orthancStudyId}`);
        }
      } else {
        console.warn(`Study not found in database: ${orthancStudyId}`);
      }
    } catch (statusError) {
      // Log the error but don't fail the download
      console.error('Error updating workflow status:', statusError);
    }
    
    // Pipe the stream directly to response
    downloadResponse.data.pipe(res);
    
    // Handle stream events
    downloadResponse.data.on('end', () => {
      console.log(`Study download completed: ${orthancStudyId}`);
    });
    
    downloadResponse.data.on('error', (error) => {
      console.error('Stream error during download:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error during study download',
          error: error.message
        });
      }
    });
    
  } catch (error) {
    console.error('Error downloading study:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to download study',
        error: error.message
      });
    }
  }
});

// Download individual study report
router.get('/study/:studyId/report/:reportIndex', protect, authorize('admin', 'lab_staff', 'doctor_account'), async (req, res) => {
  try {
    const { studyId, reportIndex } = req.params;
    
    console.log(`Downloading report for study: ${studyId}, reportIndex: ${reportIndex} by user role: ${req.user.role}`);
    
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
      let newStatus;
      let statusNote;
      
      // Determine workflow status based on user role
      if (req.user.role === 'doctor_account') {
        newStatus = 'report_downloaded_radiologist';
        statusNote = `Report "${report.filename}" downloaded by radiologist: ${req.user.fullName || req.user.email}`;
      } else if (req.user.role === 'lab_staff' || req.user.role === 'admin') {
        newStatus = 'report_downloaded';
        statusNote = `Report "${report.filename}" downloaded by ${req.user.role}: ${req.user.fullName || req.user.email}`;
      }
      
      // Update workflow status if we determined a new status
      if (newStatus) {
        await updateWorkflowStatus({
          studyId: study._id,
          status: newStatus,
          note: statusNote,
          user: req.user
        });
        
        console.log(`Workflow status updated to ${newStatus} for study ${studyId}`);
      }
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
});

export default router;