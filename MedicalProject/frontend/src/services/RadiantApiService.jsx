import api from './api';

class RadiantApiService {
  constructor() {
    // 🔧 BACKEND PROXY: All requests go through Digital Ocean backend
    this.backendUrl = 'http://64.227.187.164:3000';
    
    console.log('🌐 [DIGITAL OCEAN] RadiantApiService using backend proxy method:', {
      backendUrl: this.backendUrl,
      method: 'backend_proxy'
    });
  }

  // 🔧 BACKEND PROXY: Check helper via backend
  async checkHelperStatus(clientIp = null) {
    try {
      console.log('🔍 [BACKEND PROXY] Checking RadiAnt Helper via backend proxy...');
      
      const response = await api.post('/radiant-bridge/helper/status', {
        clientIp: clientIp || 'localhost'
      });
      
      console.log('✅ [BACKEND PROXY] Helper status via backend:', response.data);
      
      return {
        success: true,
        data: {
          isRunning: response.data.data?.isRunning || false,
          status: response.data.data?.status || 'unknown',
          version: response.data.data?.version,
          computerName: response.data.data?.computerName,
          url: response.data.data?.url,
          method: 'backend_proxy',
          serverIp: response.data.data?.serverIp
        }
      };
      
    } catch (error) {
      console.error('❌ [BACKEND PROXY] Helper status check failed:', error);
      return {
        success: false,
        error: error.message,
        data: {
          isRunning: false,
          method: 'backend_proxy'
        }
      };
    }
  }

  // 🔧 BACKEND PROXY: Launch via backend
  async launchStudyByOrthancId(orthancStudyId, studyData, clientIp = null) {
    try {
      console.log(`🚀 [BACKEND PROXY] Launching study via backend proxy: ${orthancStudyId}`);
      console.log('📋 Study data:', studyData);
      
      // 🔧 STEP 1: Check if helper is running via backend
      const statusCheck = await this.checkHelperStatus(clientIp);
      if (!statusCheck.success || !statusCheck.data?.isRunning) {
        throw new Error(`RadiAnt Helper not running on ${clientIp || 'localhost'}. Please ensure RadiAnt Helper is installed and running on your computer.`);
      }
      
      // 🔧 STEP 2: Launch via backend API
      const response = await api.post(`/radiant-bridge/launch/orthanc/${orthancStudyId}`, {
        ...this.formatStudyDataForLaunch(studyData),
        clientIp: clientIp || 'localhost',
        orthancStudyId: orthancStudyId
      });
      
      console.log('✅ [BACKEND PROXY] Launch successful:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [BACKEND PROXY] Study launch failed:', error);
      throw this.handleError(error, 'Failed to launch study in RadiAnt');
    }
  }

  // 🔧 BACKEND PROXY: Launch by UID via backend
  async launchStudyByUID(studyInstanceUID, studyData, clientIp = null) {
    try {
      console.log(`🚀 [BACKEND PROXY] Launching study by UID via backend: ${studyInstanceUID}`);
      
      const response = await api.post(`/radiant-bridge/launch/uid/${studyInstanceUID}`, {
        ...this.formatStudyDataForLaunch(studyData),
        clientIp: clientIp || 'localhost',
        studyInstanceUID: studyInstanceUID
      });
      
      console.log('✅ [BACKEND PROXY] UID launch successful:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [BACKEND PROXY] Study UID launch failed:', error);
      throw this.handleError(error, 'Failed to launch study by UID in RadiAnt');
    }
  }

  // 🔧 BACKEND PROXY: Get bridge status
  async getBridgeStatus() {
    try {
      console.log('📊 [BACKEND PROXY] Getting bridge status via backend...');
      
      const response = await api.get('/radiant-bridge/status');
      
      console.log('✅ [BACKEND PROXY] Bridge status:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [BACKEND PROXY] Bridge status failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 🔧 BACKEND PROXY: Get connection info
  getDefaultConnectionInfo() {
    return {
      method: 'backend_proxy',
      description: 'All RadiAnt requests go through Digital Ocean backend',
      backendUrl: this.backendUrl,
      serverIp: '64.227.187.164',
      note: 'Client RadiAnt Helper must be running on port 8765'
    };
  }

  // 🔧 BACKEND PROXY: Test connection
  async testClientConnection(clientIp = null) {
    try {
      console.log(`🧪 [BACKEND PROXY] Testing client connection via backend: ${clientIp || 'localhost'}`);
      
      const response = await api.post('/radiant-bridge/test-connection', {
        clientIp: clientIp || 'localhost'
      });
      
      console.log('✅ [BACKEND PROXY] Connection test result:', response.data);
      
      return {
        success: response.data.success,
        message: response.data.success ? 
          `Successfully connected to RadiAnt Helper on ${clientIp || 'localhost'} via Digital Ocean server` :
          `Failed to connect to RadiAnt Helper on ${clientIp || 'localhost'}`,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [BACKEND PROXY] Connection test failed:', error);
      return {
        success: false,
        message: `Failed to test connection to ${clientIp || 'localhost'} via Digital Ocean server`,
        error: error.message
      };
    }
  }

  // 🔧 BACKEND PROXY: Get network diagnostics
  async getNetworkDiagnostics() {
    try {
      console.log('🔧 [BACKEND PROXY] Getting network diagnostics...');
      
      const response = await api.get('/radiant-bridge/diagnostics');
      
      console.log('✅ [BACKEND PROXY] Network diagnostics:', response.data);
      
      return {
        success: true,
        data: response.data.data
      };
      
    } catch (error) {
      console.error('❌ [BACKEND PROXY] Network diagnostics failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 🔧 BACKEND PROXY: Ping helper
  async pingHelper(clientIp = null) {
    try {
      const result = await this.testClientConnection(clientIp);
      
      return {
        success: result.success,
        status: result.success ? 200 : 500,
        method: 'backend_proxy',
        serverIp: '64.227.187.164',
        clientIp: clientIp || 'localhost'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        method: 'backend_proxy',
        serverIp: '64.227.187.164',
        clientIp: clientIp || 'localhost'
      };
    }
  }

  // 🔧 Error handler
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

  // 🔧 Format study data
  formatStudyDataForLaunch(study) {
    return {
      studyInstanceUID: study.studyInstanceUID || study.instanceID,
      orthancStudyID: study.orthancStudyID,
      patientName: study.patientName,
      patientId: study.patientId,
      patientGender: study.patientGender,
      patientDateOfBirth: study.patientDateOfBirth,
      ageGender: study.ageGender,
      modality: study.modality,
      modalitiesInStudy: study.modalitiesInStudy,
      studyDate: study.studyDate,
      studyDateTime: study.studyDateTime,
      studyTime: study.studyTime,
      description: study.description,
      accessionNumber: study.accessionNumber,
      seriesCount: study.seriesCount,
      numberOfSeries: study.numberOfSeries,
      instanceCount: study.instanceCount,
      numberOfImages: study.numberOfImages,
      seriesImages: study.seriesImages,
      institutionName: study.institutionName,
      location: study.location,
      labName: study.labName,
      labIdentifier: study.labIdentifier,
      caseType: study.caseType,
      currentCategory: study.currentCategory,
      workflowStatus: study.workflowStatus,
      priority: study.priority,
      assignmentPriority: study.assignmentPriority,
      assignedDoctorName: study.assignedDoctorName,
      assignedDoctorEmail: study.assignedDoctorEmail,
      assignedDoctorSpecialization: study.assignedDoctorSpecialization,
      lastAssignedDoctor: study.lastAssignedDoctor,
      clinicalHistory: study.clinicalHistory,
      referralOrUrgencyNotes: study.referralOrUrgencyNotes,
      previousInjuryInfo: study.previousInjuryInfo,
      previousSurgeryInfo: study.previousSurgeryInfo,
      uploadDate: study.uploadDate,
      uploadDateTime: study.uploadDateTime,
      createdAt: study.createdAt,
      updatedAt: study.updatedAt,
      studyDbId: study._id
    };
  }
}

const radiantApi = new RadiantApiService();
export default radiantApi;