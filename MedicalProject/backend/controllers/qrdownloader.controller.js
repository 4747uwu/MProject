// Controllers/qrdownloader.controller.js
import mongoose from 'mongoose';
import DicomStudy from '../models/dicomStudyModel.js';
import Document from '../models/documentModal.js';
import WasabiService from '../services/wasabi.service.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';

class QRDownloaderController {
  /**
   * 🔧 QR CODE SCAN ENDPOINT
   * Receives Study ID from QR code, fetches report from Wasabi, and streams to user
   * Route: GET /api/scan/:studyId
   */
  static async handleQRScan(req, res) {
    console.log('🔧 Retrieving QR scan report with Wasabi integration...');
    try {
      const { studyId } = req.params;
      const reportIndex = 0; // Always use first report
      
      console.log(`📄 Requesting report index ${reportIndex} for study ID: ${studyId}`);

      // 1️⃣ VALIDATE STUDY ID
      if (!studyId || !mongoose.Types.ObjectId.isValid(studyId)) {
        console.warn(`⚠️ Invalid study ID format: ${studyId}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid study ID format'
        });
      }

      // 2️⃣ FETCH STUDY FROM DATABASE
      const study = await DicomStudy.findById(studyId);

      if (!study) {
        console.warn(`❌ Study not found: ${studyId}`);
        return res.status(404).json({
          success: false,
          message: 'Study not found'
        });
      }

      console.log(`✅ Study found: ${study._id} - Patient: ${study.patientInfo?.patientName || 'Unknown'}`);

      // 3️⃣ CHECK IF REPORTS EXIST
      if (!study.doctorReports || study.doctorReports.length === 0) {
        console.warn(`❌ No doctor reports found for study: ${studyId}`);
        return res.status(404).json({
          success: false,
          message: 'No reports available for this study',
          study: {
            _id: study._id,
            patientName: study.patientInfo?.patientName,
            patientId: study.patientInfo?.patientID
          }
        });
      }

      // 4️⃣ GET REPORT AT INDEX 0
      const reportReference = study.doctorReports[reportIndex];

      if (!reportReference) {
        console.warn(`❌ Report at index ${reportIndex} not found for study: ${studyId}`);
        return res.status(404).json({
          success: false,
          message: 'Report not found at expected index',
          study: {
            _id: study._id,
            patientName: study.patientInfo?.patientName,
            patientId: study.patientInfo?.patientID
          }
        });
      }

      console.log(`📄 Report found: ${reportReference.filename}`);

      // 5️⃣ FETCH THE DOCUMENT RECORD USING THE _id FROM doctorReports
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

      // 6️⃣ FETCH FILE FROM WASABI OR FALLBACK
      let documentBuffer;

      try {
        if (documentRecord.wasabiKey && documentRecord.wasabiBucket) {
          // Download from Wasabi using Document record details
          console.log(`📥 Downloading report from Wasabi: ${documentRecord.wasabiKey}`);

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

        console.log(`✅ Report downloaded successfully. Size: ${documentBuffer.length} bytes`);

      } catch (wasabiError) {
        console.error('❌ Wasabi download error:', wasabiError);
        return res.status(500).json({
          success: false,
          message: 'Error downloading report from storage',
          error: wasabiError.message
        });
      }

      // 7️⃣ SET RESPONSE HEADERS FOR FILE DOWNLOAD
      res.setHeader('Content-Disposition', `attachment; filename="${documentRecord.fileName}"`);
      res.setHeader('Content-Type', documentRecord.contentType);
      res.setHeader('Content-Length', documentBuffer.length);

      // 8️⃣ SEND THE DOCUMENT
      res.send(documentBuffer);

      // 9️⃣ LOG SUCCESS
      console.log(`✅ Report "${documentRecord.fileName}" sent successfully for study: ${studyId}`);

    } catch (error) {
      console.error('❌ Error retrieving study report:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving report',
        error: error.message
      });
    }
  }

  /**
   * 🔧 GET REPORT INFO ENDPOINT
   * Returns report metadata without downloading the file
   * Route: GET /api/scan/:studyId/info
   */
  static async getReportInfo(req, res) {
    try {
      const { studyId } = req.params;

      console.log(`ℹ️ Fetching report info for study: ${studyId}`);

      // Validate study ID
      if (!studyId || !mongoose.Types.ObjectId.isValid(studyId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid study ID format'
        });
      }

      // Fetch study
      const study = await DicomStudy.findById(studyId)
        .select('_id patientInfo doctorReports createdAt')
        .lean();

      if (!study) {
        return res.status(404).json({
          success: false,
          message: 'Study not found'
        });
      }

      // Always get report at index 0
      const reportAtIndex0 = study.doctorReports?.[0];

      res.json({
        success: true,
        data: {
          studyId: study._id,
          patientName: study.patientInfo?.patientName,
          patientId: study.patientInfo?.patientID,
          hasReport: !!reportAtIndex0,
          report: reportAtIndex0 ? {
            filename: reportAtIndex0.filename,
            uploadedAt: reportAtIndex0.uploadedAt,
            uploadedBy: reportAtIndex0.uploadedBy,
            reportStatus: reportAtIndex0.reportStatus,
            size: reportAtIndex0.size
          } : null,
          createdAt: study.createdAt
        }
      });

    } catch (error) {
      console.error(`❌ Error in getReportInfo:`, error);

      res.status(500).json({
        success: false,
        message: 'Error fetching report info',
        error: error.message
      });
    }
  }
}

export default QRDownloaderController;