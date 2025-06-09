import OrthancService from '../services/orthancServices.js';

class OrthancProxyController {
  constructor() {
    this.orthancService = new OrthancService();
  }

  // 🔧 GET STUDY DETAILS
  async getStudyDetails(req, res) {
    try {
      const { studyId } = req.params;
      
      console.log(`📡 Getting Orthanc study details: ${studyId}`);
      
      const studyData = await this.orthancService.getStudy(studyId);
      
      res.json({
        success: true,
        data: studyData,
        message: 'Study details retrieved successfully'
      });
      
    } catch (error) {
      console.error('Orthanc study details failed:', error);
      res.status(error.status || 500).json({
        success: false,
        message: 'Failed to get study details from Orthanc',
        error: error.message
      });
    }
  }

  // 🔧 DOWNLOAD STUDY ARCHIVE
  async downloadStudyArchive(req, res) {
    try {
      const { studyId } = req.params;
      
      console.log(`📥 Downloading Orthanc study archive: ${studyId}`);
      
      await this.orthancService.downloadStudyArchive(studyId, res);
      
    } catch (error) {
      console.error('Orthanc download failed:', error);
      
      if (!res.headersSent) {
        res.status(error.status || 500).json({
          success: false,
          message: 'Failed to download study archive',
          error: error.message
        });
      }
    }
  }

  // 🔧 GET STUDY METADATA
  async getStudyMetadata(req, res) {
    try {
      const { studyId } = req.params;
      
      const metadata = await this.orthancService.getStudyMetadata(studyId);
      
      res.json({
        success: true,
        data: metadata,
        message: 'Study metadata retrieved successfully'
      });
      
    } catch (error) {
      console.error('Orthanc metadata failed:', error);
      res.status(error.status || 500).json({
        success: false,
        message: 'Failed to get study metadata',
        error: error.message
      });
    }
  }

  // 🔧 SEARCH STUDIES
  async searchStudies(req, res) {
    try {
      const searchParams = req.query;
      
      const results = await this.orthancService.searchStudies(searchParams);
      
      res.json({
        success: true,
        data: results,
        message: 'Study search completed'
      });
      
    } catch (error) {
      console.error('Orthanc search failed:', error);
      res.status(error.status || 500).json({
        success: false,
        message: 'Failed to search studies',
        error: error.message
      });
    }
  }

  // 🔧 GET ORTHANC STATUS
  async getOrthancStatus(req, res) {
    try {
      const status = await this.orthancService.getStatus();
      
      res.json({
        success: true,
        data: status,
        message: 'Orthanc status retrieved'
      });
      
    } catch (error) {
      console.error('Orthanc status check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Orthanc status',
        error: error.message
      });
    }
  }
}

const orthancProxyController = new OrthancProxyController();

export const {
  getStudyDetails,
  downloadStudyArchive,
  getStudyMetadata,
  searchStudies,
  getOrthancStatus
} = orthancProxyController;