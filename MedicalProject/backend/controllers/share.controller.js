// 🆕 NEW: sharing.controller.js
import crypto from 'crypto';
import DicomStudy from '../models/dicomStudyModel.js';
import ShareToken from '../models/shareTokenSchema.js';
import QRCode from 'qrcode';
import Document from '../models/documentModal.js';
import WasabiService from '../services/wasabi.service.js';

const ORTHANC_BASE_URL = 'http://64.227.187.164:8042';
const OHIF_LOCAL_URL = 'http://64.227.187.164:4000';

function buildOhifUrl(studyInstanceUID) {
  const ohifUrl = new URL(`${OHIF_LOCAL_URL}/viewer`);
  ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
  const dataSourceConfig = {
    namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    sourceName: 'dicomweb',
    configuration: {
      friendlyName: 'Star Radiology Viewer',
      name: 'orthanc',
      wadoUriRoot: `${ORTHANC_BASE_URL}/wado`,
      qidoRoot: `${ORTHANC_BASE_URL}/dicom-web`,
      wadoRoot: `${ORTHANC_BASE_URL}/dicom-web`,
      qidoSupportsIncludeField: true,
      supportsReject: false,
      imageRendering: 'wadors',
      thumbnailRendering: 'wadors',
      enableStudyLazyLoad: true,
      supportsFuzzyMatching: false,
      supportsWildcard: true
    }
  };
  ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
  return ohifUrl.toString();
}

// Public: fetch study info for share decision page
export const getStudyForShare = async (req, res) => {
  try {
    const { id } = req.params;
    const study = await DicomStudy.findById(id).select(
      'patientInfo patientId studyInstanceUID orthancStudyID modality studyDate workflowStatus doctorReports ReportAvailable'
    );
    if (!study) {
      return res.status(404).json({ success: false, message: 'Study not found' });
    }
    res.json({
      success: true,
      study: {
        _id: study._id,
        patientName: study.patientInfo?.patientName || 'Unknown Patient',
        patientId: study.patientInfo?.patientID || study.patientId,
        modality: study.modality,
        studyDate: study.studyDate,
        studyInstanceUID: study.studyInstanceUID,
        workflowStatus: study.workflowStatus,
        hasReport: (study.doctorReports?.length > 0) || study.ReportAvailable,
        reportCount: study.doctorReports?.length || 0
      },
      viewerUrl: buildOhifUrl(study.studyInstanceUID)
    });
  } catch (error) {
    console.error('❌ Error fetching study for share:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch study' });
  }
};

// Public: download latest finalized report for a study
export const downloadSharedReport = async (req, res) => {
  try {
    const { id } = req.params;
    const study = await DicomStudy.findById(id).select('doctorReports patientInfo');
    if (!study) {
      return res.status(404).json({ success: false, message: 'Study not found' });
    }
    if (!study.doctorReports || study.doctorReports.length === 0) {
      return res.status(404).json({ success: false, message: 'No report available for this study' });
    }

    // Use the last report (most recent)
    const reportReference = study.doctorReports[study.doctorReports.length - 1];

    // Fetch the Document record that holds the actual file
    const documentRecord = await Document.findById(reportReference._id);
    if (!documentRecord) {
      return res.status(404).json({ success: false, message: 'Report file not found in storage' });
    }

    let documentBuffer;

    if (documentRecord.wasabiKey && documentRecord.wasabiBucket) {
      const wasabiResult = await WasabiService.downloadFile(
        documentRecord.wasabiBucket,
        documentRecord.wasabiKey
      );
      if (!wasabiResult.success) {
        return res.status(500).json({ success: false, message: 'Failed to retrieve report from storage' });
      }
      documentBuffer = wasabiResult.data;
    } else if (reportReference.data) {
      documentBuffer = Buffer.from(reportReference.data, 'base64');
    } else {
      return res.status(404).json({ success: false, message: 'Report data not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${documentRecord.fileName || 'report.pdf'}"`);
    res.setHeader('Content-Type', documentRecord.contentType || 'application/pdf');
    res.setHeader('Content-Length', documentBuffer.length);
    res.send(documentBuffer);
  } catch (error) {
    console.error('❌ Error downloading shared report:', error);
    res.status(500).json({ success: false, message: 'Failed to download report' });
  }
};

// Generate shareable link
export const generateShareableLink = async (req, res) => {
  try {
    const { 
      studyId, 
      studyInstanceUID, 
      orthancStudyID, 
      viewerType, 
      patientName, 
      studyDescription, 
      modality, 
      studyDate,
      expiresIn = '7d'
    } = req.body;

    // Validate required fields
    if (!studyId || !studyInstanceUID || !viewerType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: studyId, studyInstanceUID, viewerType'
      });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiration date
    const expiresAt = new Date();
    if (expiresIn === '7d') {
      expiresAt.setDate(expiresAt.getDate() + 7);
    } else if (expiresIn === '1d') {
      expiresAt.setDate(expiresAt.getDate() + 1);
    } else if (expiresIn === '1h') {
      expiresAt.setHours(expiresAt.getHours() + 1);
    }

    // Save share token to database
    const shareToken = new ShareToken({
      token,
      studyId,
      studyInstanceUID,
      orthancStudyID,
      viewerType,
      patientName,
      studyDescription,
      modality,
      studyDate,
      expiresAt,
      createdBy: req.user?._id || null,
      accessCount: 0,
      metadata: {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        createdAt: new Date()
      }
    });

    await shareToken.save();

    const baseUrl = 'https://ai.starradiology.com';
    const shareableLink = `${baseUrl}/admin/share/${studyId}`;

    console.log(`🔗 Generated shareable link for study ${studyId}: ${shareableLink}`);

    res.json({
      success: true,
      shareableLink,
      token,
      expiresAt,
      viewerType,
      message: 'Shareable link generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating shareable link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate shareable link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Generate QR Code for shareable link
export const generateQRCode = async (req, res) => {
  try {
    const { url, studyInfo } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL is required'
      });
    }

    // Generate QR code
    const qrCodeDataURL = await QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      qrCodeDataURL,
      url,
      studyInfo
    });

  } catch (error) {
    console.error('❌ Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Access shared study (for when someone clicks the shared link)
export const accessSharedStudy = async (req, res) => {
  try {
    const { token } = req.params;

    // Find share token
    const shareToken = await ShareToken.findOne({ 
      token,
      expiresAt: { $gt: new Date() },
      isActive: true
    });

    if (!shareToken) {
      return res.status(404).json({
        success: false,
        message: 'Share link not found or expired'
      });
    }

    // Increment access count
    shareToken.accessCount += 1;
    shareToken.lastAccessedAt = new Date();
    shareToken.accessHistory.push({
      accessedAt: new Date(),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    await shareToken.save();

    // Generate viewer URL based on viewer type
    let viewerUrl;
    const orthancBaseURL = 'http://64.227.187.164:8042';
    const ohifLocalURL = 'http://64.227.187.164:4000';

    switch (shareToken.viewerType) {
      case 'ohif-local':
        const ohifUrl = new URL(`${ohifLocalURL}/viewer`);
        ohifUrl.searchParams.set('StudyInstanceUIDs', shareToken.studyInstanceUID);
        
        const dataSourceConfig = {
          namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
          sourceName: 'dicomweb',
          configuration: {
            friendlyName: 'Shared Study Viewer',
            name: 'orthanc',
            wadoUriRoot: `${orthancBaseURL}/wado`,
            qidoRoot: `${orthancBaseURL}/dicom-web`,
            wadoRoot: `${orthancBaseURL}/dicom-web`,
            qidoSupportsIncludeField: true,
            supportsReject: false,
            imageRendering: 'wadors',
            thumbnailRendering: 'wadors',
            enableStudyLazyLoad: true,
            supportsFuzzyMatching: false,
            supportsWildcard: true
          }
        };
        
        ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
        viewerUrl = ohifUrl.toString();
        break;

      case 'ohif-cloud':
        viewerUrl = `https://viewer.ohif.org/viewer?StudyInstanceUIDs=${shareToken.studyInstanceUID}&url=${encodeURIComponent(orthancBaseURL + '/dicom-web')}`;
        break;

      case 'stone-viewer':
        viewerUrl = `${orthancBaseURL}/stone-webviewer/index.html?study=${shareToken.studyInstanceUID}`;
        break;

      default:
        throw new Error('Unknown viewer type');
    }

    console.log(`🔗 Accessing shared study: ${shareToken.studyInstanceUID} via ${shareToken.viewerType}`);

    res.json({
      success: true,
      viewerUrl,
      studyInfo: {
        patientName: shareToken.patientName,
        studyDescription: shareToken.studyDescription,
        modality: shareToken.modality,
        studyDate: shareToken.studyDate,
        studyInstanceUID: shareToken.studyInstanceUID
      },
      viewerType: shareToken.viewerType,
      accessCount: shareToken.accessCount
    });

  } catch (error) {
    console.error('❌ Error accessing shared study:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to access shared study',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};