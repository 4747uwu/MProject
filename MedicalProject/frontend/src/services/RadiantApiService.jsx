import api from './api';

class RadiantApiService {
  constructor() {
    // 🔧 DIGITAL OCEAN: Use environment variables with Digital Ocean defaults
    this.radiantHelperHost = import.meta.env.VITE_RADIANT_HELPER_HOST || 'localhost';
    this.radiantHelperPort = import.meta.env.VITE_RADIANT_HELPER_PORT || '8765';
    this.radiantHelperUrl = import.meta.env.VITE_RADIANT_HELPER_URL || `http://${this.radiantHelperHost}:${this.radiantHelperPort}`;
    this.backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://64.227.187.164:3000';
    
    console.log('🌐 [DIGITAL OCEAN] RadiantApiService initialized with:', {
      radiantHelperHost: this.radiantHelperHost,
      radiantHelperPort: this.radiantHelperPort,
      radiantHelperUrl: this.radiantHelperUrl,
      backendUrl: this.backendUrl
    });
  }

  // 🔧 CHECK HELPER STATUS THROUGH BACKEND (Digital Ocean compatible)
  async checkHelperStatus(clientIp = null) {
    try {
      console.log(`🔍 [DIGITAL OCEAN] Checking RadiAnt Helper status via backend for client: ${clientIp || 'localhost'}`);
      
      // Use backend API to check helper status (goes through Digital Ocean server)
      const response = await api.post('/radiant-bridge/helper/status', {
        clientIp: clientIp
      });
      
      console.log('✅ [DIGITAL OCEAN] Helper status response:', response.data);
      
      return {
        success: true,
        data: {
          isRunning: response.data.data?.isRunning || false,
          status: response.data.data?.status || 'unknown',
          url: response.data.data?.url,
          clientIp: response.data.data?.clientIp,
          serverIp: response.data.data?.serverIp
        }
      };
      
    } catch (error) {
      console.error('❌ [DIGITAL OCEAN] Helper status check failed:', error);
      return {
        success: false,
        error: error.message,
        data: {
          isRunning: false,
          clientIp: clientIp || 'localhost'
        }
      };
    }
  }

  // 🔧 LAUNCH STUDY VIA BACKEND (Digital Ocean compatible)
  async launchStudyByOrthancId(orthancStudyId, studyData, clientIp = null) {
    try {
      console.log(`🚀 [DIGITAL OCEAN] Launching study via backend: ${orthancStudyId}`);
      console.log('📋 Study data:', studyData);
      console.log('🖥️ Target client IP:', clientIp || 'localhost');
      
      // 🔧 STEP 1: Check if helper is running first
      const statusCheck = await this.checkHelperStatus(clientIp);
      if (!statusCheck.success || !statusCheck.data?.isRunning) {
        throw new Error(`RadiAnt Helper not running on ${clientIp || 'localhost'}. Please ensure RadiAnt Helper is installed and running.`);
      }
      
      // 🔧 STEP 2: Format study data for Digital Ocean backend
      const formattedStudyData = {
        ...this.formatStudyDataForLaunch(studyData),
        clientIp: clientIp,
        orthancStudyId: orthancStudyId
      };
      
      console.log('📤 [DIGITAL OCEAN] Sending launch request via backend...');
      
      // Use backend API to launch study (goes through Digital Ocean server to client)
      const response = await api.post(`/radiant-bridge/launch/orthanc/${orthancStudyId}`, formattedStudyData);
      
      console.log('✅ [DIGITAL OCEAN] Launch successful:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [DIGITAL OCEAN] Study launch failed:', error);
      throw this.handleError(error, 'Failed to launch study in RadiAnt');
    }
  }

  // 🔧 LAUNCH STUDY BY UID VIA BACKEND (Digital Ocean compatible)
  async launchStudyByUID(studyInstanceUID, studyData, clientIp = null) {
    try {
      console.log(`🚀 [DIGITAL OCEAN] Launching study by UID via backend: ${studyInstanceUID}`);
      
      // Format study data for Digital Ocean backend
      const formattedStudyData = {
        ...this.formatStudyDataForLaunch(studyData),
        clientIp: clientIp,
        studyInstanceUID: studyInstanceUID
      };
      
      console.log('📤 [DIGITAL OCEAN] Sending UID launch request via backend...');
      
      // Use backend API to launch study by UID
      const response = await api.post(`/radiant-bridge/launch/uid/${studyInstanceUID}`, formattedStudyData);
      
      console.log('✅ [DIGITAL OCEAN] UID launch successful:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [DIGITAL OCEAN] Study UID launch failed:', error);
      throw this.handleError(error, 'Failed to launch study by UID in RadiAnt');
    }
  }

  // 🔧 GET BRIDGE STATUS VIA BACKEND (Digital Ocean compatible)
  async getBridgeStatus() {
    try {
      console.log('📊 [DIGITAL OCEAN] Getting bridge status via backend...');
      
      const response = await api.get('/radiant-bridge/status');
      
      console.log('✅ [DIGITAL OCEAN] Bridge status:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [DIGITAL OCEAN] Bridge status failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 🔧 GET DEFAULT CONNECTION INFO (Digital Ocean compatible)
  getDefaultConnectionInfo() {
    return {
      method: 'backend_proxy',
      description: 'RadiAnt launches are routed through Digital Ocean backend server',
      backendUrl: this.backendUrl,
      serverIp: '64.227.187.164',
      helperPort: this.radiantHelperPort,
      note: 'Client RadiAnt Helper must be running on port 8765'
    };
  }

  // 🔧 TEST CLIENT CONNECTION VIA BACKEND (Digital Ocean compatible)
  async testClientConnection(clientIp = null) {
    try {
      console.log(`🧪 [DIGITAL OCEAN] Testing client connection via backend: ${clientIp || 'localhost'}`);
      
      const response = await api.post('/radiant-bridge/test-connection', {
        clientIp: clientIp
      });
      
      console.log('✅ [DIGITAL OCEAN] Connection test result:', response.data);
      
      return {
        success: response.data.success,
        message: response.data.success ? 
          `Successfully connected to RadiAnt Helper on ${clientIp || 'localhost'} via Digital Ocean server` :
          `Failed to connect to RadiAnt Helper on ${clientIp || 'localhost'}`,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [DIGITAL OCEAN] Connection test failed:', error);
      return {
        success: false,
        message: `Failed to test connection to ${clientIp || 'localhost'} via Digital Ocean server`,
        error: error.message
      };
    }
  }

  // 🔧 GET NETWORK DIAGNOSTICS VIA BACKEND (Digital Ocean specific)
  async getNetworkDiagnostics() {
    try {
      console.log('🔧 [DIGITAL OCEAN] Getting network diagnostics...');
      
      const response = await api.get('/radiant-bridge/diagnostics');
      
      console.log('✅ [DIGITAL OCEAN] Network diagnostics:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [DIGITAL OCEAN] Network diagnostics failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 🔧 PING HELPER VIA BACKEND (Digital Ocean compatible)
  async pingHelper(clientIp = null) {
    try {
      // Use the same connection test but simpler response
      const result = await this.testClientConnection(clientIp);
      
      return {
        success: result.success,
        status: result.success ? 200 : 500,
        method: 'backend_proxy',
        serverIp: '64.227.187.164',
        clientIp: clientIp || 'localhost',
        port: this.radiantHelperPort
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        method: 'backend_proxy',
        serverIp: '64.227.187.164',
        clientIp: clientIp || 'localhost',
        port: this.radiantHelperPort
      };
    }
  }

  // 🔧 DETECT CLIENT IP (Digital Ocean compatible)
  detectClientIp() {
    try {
      // For Digital Ocean deployment, we typically want localhost for the client
      // since RadiAnt Helper runs on the user's local machine
      if (this.radiantHelperHost && this.radiantHelperHost !== 'localhost') {
        return this.radiantHelperHost;
      }
      
      // In production, assume localhost for RadiAnt Helper
      return 'localhost';
    } catch (error) {
      console.warn('[DIGITAL OCEAN] Could not detect client IP, using localhost');
      return 'localhost';
    }
  }

  // 🔧 UTILITY: Error handler (unchanged)
  handleError(error, defaultMessage) {
    if (error.response) {
      const serverMessage = error.response.data?.message || error.response.data?.error;
      return new Error(serverMessage || defaultMessage);
    } else if (error.request) {
      return new Error('Network error: Please check your connection to Digital Ocean server');
    } else {
      return new Error(error.message || defaultMessage);
    }
  }

  // 🔧 UTILITY: Format study data for launch (enhanced for Digital Ocean)
  formatStudyDataForLaunch(study) {
    return {
      // Essential IDs
      studyInstanceUID: study.studyInstanceUID || study.instanceID,
      orthancStudyID: study.orthancStudyID,
      
      // Patient information
      patientName: study.patientName,
      patientId: study.patientId,
      patientGender: study.patientGender,
      patientDateOfBirth: study.patientDateOfBirth,
      ageGender: study.ageGender,
      
      // Study details
      modality: study.modality,
      modalitiesInStudy: study.modalitiesInStudy,
      studyDate: study.studyDate,
      studyDateTime: study.studyDateTime,
      studyTime: study.studyTime,
      description: study.description,
      accessionNumber: study.accessionNumber,
      
      // Study metadata
      seriesCount: study.seriesCount,
      numberOfSeries: study.numberOfSeries,
      instanceCount: study.instanceCount,
      numberOfImages: study.numberOfImages,
      seriesImages: study.seriesImages,
      
      // Institution info
      institutionName: study.institutionName || 'Digital Ocean Medical Platform',
      location: study.location,
      
      // Lab information
      labName: study.labName,
      labIdentifier: study.labIdentifier,
      
      // Additional context
      caseType: study.caseType,
      currentCategory: study.currentCategory,
      workflowStatus: study.workflowStatus,
      priority: study.priority,
      assignmentPriority: study.assignmentPriority,
      
      // Doctor information
      assignedDoctorName: study.assignedDoctorName,
      assignedDoctorEmail: study.assignedDoctorEmail,
      assignedDoctorSpecialization: study.assignedDoctorSpecialization,
      lastAssignedDoctor: study.lastAssignedDoctor,
      
      // Clinical details
      clinicalHistory: study.clinicalHistory,
      referralOrUrgencyNotes: study.referralOrUrgencyNotes,
      previousInjuryInfo: study.previousInjuryInfo,
      previousSurgeryInfo: study.previousSurgeryInfo,
      
      // Timestamps
      uploadDate: study.uploadDate,
      uploadDateTime: study.uploadDateTime,
      createdAt: study.createdAt,
      updatedAt: study.updatedAt,
      
      // 🔧 DIGITAL OCEAN: Add server context
      serverContext: {
        deploymentType: 'digital_ocean',
        serverIp: '64.227.187.164',
        backendUrl: this.backendUrl,
        launchMethod: 'backend_proxy'
      },
      
      // Database ID for reference
      studyDbId: study._id
    };
  }
}

// Export singleton instance
const radiantApi = new RadiantApiService();
export default radiantApi;