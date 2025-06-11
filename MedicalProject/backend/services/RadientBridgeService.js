import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import OrthancService from './orthancServices.js';

class RadiantBridgeService {
  constructor() {
    // 🔧 DIGITAL OCEAN: Server configuration
    this.serverIp = '64.227.187.164';  // ← Fix: Use Digital Ocean IP
    this.orthancUrl = `http://${this.serverIp}:8042`;
    this.backendUrl = `http://${this.serverIp}:3000`;
    
    this.defaultHelperUrl = 'http://localhost:8765';
    this.orthancService = new OrthancService();
    this.tempDir = path.join(os.tmpdir(), 'radiant-bridge');
    this.isInitialized = false;
    
    this.initializeTempDirectory();
    
    console.log('🌐 RadiantBridge initialized for Digital Ocean:', {
      serverIp: this.serverIp,
      orthancUrl: this.orthancUrl,
      tempDir: this.tempDir
    });
    
    // Add to RadientBridgeService.js constructor:
    if (!this.orthancService.orthancUsername || !this.orthancService.orthancPassword) {
      console.warn('⚠️ Orthanc credentials not configured properly');
    }
  }

  async initializeTempDirectory() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`📁 RadiantBridge temp directory: ${this.tempDir}`);
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  // 🔧 FIXED: CHECK RADIANT HELPER STATUS ON CLIENT
  async checkRadiantHelperStatus(clientIp = null) {
    // 🔧 FIX: Don't default to localhost, use the actual IP provided
    const targetIp = clientIp;  // Remove: || 'localhost'
    
    if (!targetIp) {
      console.error('❌ No client IP provided to checkRadiantHelperStatus');
      return {
        isRunning: false,
        error: 'No client IP provided',
        suggestion: 'Client IP must be detected or provided'
      };
    }
    
    const helperUrl = `http://${targetIp}:8765`;
    
    try {
      console.log(`🔍 [IP VERIFICATION] Checking RadiAnt Helper from server ${this.serverIp} to client: ${helperUrl}`);
      console.log(`📊 [IP VERIFICATION] clientIp parameter: ${clientIp}`);
      console.log(`📊 [IP VERIFICATION] targetIp final: ${targetIp}`);
      
      const response = await axios.get(`${helperUrl}/status`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'MedicalPlatform-IPVerification/1.0',
          'Accept': 'application/json'
        }
      });
      
      console.log(`✅ [IP VERIFICATION] RadiAnt Helper responded from ${targetIp}:`, response.data);
      return {
        isRunning: true,
        status: response.data.status || 'running',
        version: response.data.version,
        computerName: response.data.computerName || response.data.computer,
        url: helperUrl,
        clientIp: targetIp,
        serverIp: this.serverIp,
        connectionType: this.getConnectionType(targetIp),
        verification: {
          provided: clientIp,
          used: targetIp,
          successful: true
        }
      };
      
    } catch (error) {
      console.error(`❌ [IP VERIFICATION] RadiAnt Helper check failed for ${helperUrl}:`, error.message);
      return {
        isRunning: false,
        error: error.message,
        url: helperUrl,
        clientIp: targetIp,
        serverIp: this.serverIp,
        connectionType: this.getConnectionType(targetIp),
        verification: {
          provided: clientIp,
          used: targetIp,
          successful: false,
          errorType: error.code || 'unknown'
        }
      };
    }
  }

  // 🔧 LAUNCH STUDY IN RADIANT ON CLIENT (Enhanced for Digital Ocean)
  async launchStudyInRadiant(studyInfo, clientIp = null) {
    const helperUrl = clientIp ? `http://${clientIp}:8765` : this.defaultHelperUrl;
    const startTime = Date.now();
    
    try {
      console.log('🚀 [DIGITAL OCEAN] Starting RadiAnt launch process...');
      console.log('📋 Server context:', {
        serverIp: this.serverIp,
        orthancUrl: this.orthancUrl,
        targetClient: clientIp || 'localhost',
        studyId: studyInfo.orthancStudyId
      });

      // 1. Check RadiAnt Helper status on client
      const helperStatus = await this.checkRadiantHelperStatus(clientIp);
      if (!helperStatus.isRunning) {
        throw new Error(`RadiAnt Helper not running on ${clientIp || 'localhost'}: ${helperStatus.error}`);
      }

      // 2. Get study data from Orthanc
      const orthancData = await this.orthancService.getStudy(studyInfo.orthancStudyId);

      // 🔧 DIGITAL OCEAN: Create download URL pointing to our server
      const downloadUrl = `${this.backendUrl}/api/orthanc/studies/${studyInfo.orthancStudyId}/download`;
      
      // 🔧 DIGITAL OCEAN: Enhanced launch payload with server context
      const launchPayload = {
        downloadUrl: downloadUrl,
        fileName: `${studyInfo.patientName || 'Study'}_${studyInfo.orthancStudyId}.zip`,
        
        // 🔧 DIGITAL OCEAN: Authentication for Orthanc download from our server
        downloadOptions: {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.orthancService.orthancUsername}:${this.orthancService.orthancPassword}`).toString('base64')}`,
            'User-Agent': 'MedicalPlatform-RadiAnt-Bridge/1.0'
          },
          timeout: 120000 // 2 minutes for large studies
        },
        
        // Complete study information with server context
        studyInfo: {
          // Patient information
          patientName: studyInfo.patientName || 'Unknown Patient',
          patientId: studyInfo.patientId || 'Unknown',
          patientGender: studyInfo.patientGender || 'Unknown',
          patientDateOfBirth: studyInfo.patientDateOfBirth || 'Unknown',
          
          // Study details
          studyInstanceUID: studyInfo.studyInstanceUID,
          orthancStudyId: studyInfo.orthancStudyId,
          modality: studyInfo.modality || orthancData.MainDicomTags?.Modality || 'Unknown',
          modalitiesInStudy: studyInfo.modalitiesInStudy || [studyInfo.modality],
          studyDate: studyInfo.studyDate || orthancData.MainDicomTags?.StudyDate || 'Unknown',
          studyTime: studyInfo.studyTime || orthancData.MainDicomTags?.StudyTime || '',
          description: studyInfo.description || orthancData.MainDicomTags?.StudyDescription || 'DICOM Study',
          accessionNumber: studyInfo.accessionNumber || orthancData.MainDicomTags?.AccessionNumber || '',
          
          // Study metadata
          seriesCount: studyInfo.seriesCount || orthancData.Series?.length || 0,
          instanceCount: studyInfo.instanceCount || orthancData.Instances?.length || 0,
          
          // Institution info
          institutionName: studyInfo.institutionName || orthancData.MainDicomTags?.InstitutionName || 'Digital Ocean Medical Platform',
          
          // 🔧 DIGITAL OCEAN: Server information
          serverContext: {
            serverIp: this.serverIp,
            orthancUrl: this.orthancUrl,
            downloadUrl: downloadUrl,
            launchTime: new Date().toISOString(),
            launchedFrom: `Digital Ocean Server ${this.serverIp}`,
            clientIp: clientIp || 'localhost'
          },
          
          // Workflow context
          assignedDoctorName: studyInfo.assignedDoctorName || null,
          caseType: studyInfo.caseType || 'routine',
          workflowStatus: studyInfo.workflowStatus || 'viewing'
        }
      };

      console.log('📤 [DIGITAL OCEAN] Sending launch request to RadiAnt Helper...');
      console.log('🔗 Helper URL:', helperUrl);
      console.log('📥 Download URL:', downloadUrl);

      // 5. Send launch request to RadiAnt Helper on client
      const launchResponse = await axios.post(
        `${helperUrl}/launch`,
        launchPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MedicalPlatform-DigitalOcean/1.0'
          },
          timeout: 120000 // 2 minutes for download + launch
        }
      );

      const totalTime = Date.now() - startTime;

      console.log('✅ [DIGITAL OCEAN] RadiAnt launch successful!');
      console.log('📊 Launch response:', launchResponse.data);

      return {
        success: true,
        launchTime: totalTime,
        serverIp: this.serverIp,
        clientIp: clientIp || 'localhost',
        helperUrl: helperUrl,
        
        // Study summary
        studySummary: {
          patientName: studyInfo.patientName,
          patientId: studyInfo.patientId,
          modality: studyInfo.modality,
          seriesCount: orthancData.Series?.length || 0
        },
        
        // Technical details
        orthancStudyId: studyInfo.orthancStudyId,
        downloadUrl: downloadUrl,
        fileName: launchPayload.fileName,
        
        // Digital Ocean specific info
        digitalOceanContext: {
          serverIp: this.serverIp,
          orthancUrl: this.orthancUrl,
          launchMethod: 'digital_ocean_bridge'
        },
        
        // Response from helper
        launchResponse: launchResponse.data
      };

    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      console.error('❌ [DIGITAL OCEAN] RadiAnt launch failed:', error.message);
      console.error('⏱️ Failed after:', `${totalTime}ms`);

      // Enhanced error handling for Digital Ocean context
      let errorMessage = error.message;
      let errorType = 'UNKNOWN_ERROR';

      if (error.response) {
        errorMessage = error.response.data?.message || error.response.data || error.message;
        errorType = 'RADIANT_HELPER_ERROR';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = `RadiAnt Helper not accessible on ${clientIp || 'localhost'}:8765 from Digital Ocean server ${this.serverIp}`;
        errorType = 'CONNECTION_REFUSED';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `Network timeout between Digital Ocean server and ${clientIp || 'localhost'}`;
        errorType = 'TIMEOUT';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = `Cannot resolve ${clientIp || 'localhost'} from Digital Ocean server`;
        errorType = 'DNS_ERROR';
      }

      throw new Error(`${errorType}: ${errorMessage} [Server: ${this.serverIp}]`);
    }
  }

  // 🔧 FIND ORTHANC STUDY BY UID
  async findOrthancStudyByUID(studyInstanceUID) {
    try {
      return await this.orthancService.findStudyByUID(studyInstanceUID);
    } catch (error) {
      throw new Error(`Failed to find study by UID: ${error.message}`);
    }
  }

  // 🔧 TEST CLIENT CONNECTION (Enhanced for Digital Ocean)
  async testClientConnection(clientIp) {
    const helperUrl = `http://${clientIp}:8765`;
    const startTime = Date.now();
    
    try {
      console.log(`🧪 [DIGITAL OCEAN] Testing connection from ${this.serverIp} to client: ${clientIp}`);
      
      const response = await axios.get(`${helperUrl}/health`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'MedicalPlatform-DigitalOcean-Test/1.0'
        }
      });
      
      const latency = Date.now() - startTime;
      
      return {
        success: true,
        serverIp: this.serverIp,
        clientIp: clientIp,
        helperUrl: helperUrl,
        response: response.data,
        latency: `${latency}ms`,
        orthancAccessible: `${this.orthancUrl}/app/explorer.html`
      };
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      return {
        success: false,
        serverIp: this.serverIp,
        clientIp: clientIp,
        helperUrl: helperUrl,
        error: error.message,
        latency: `${latency}ms (failed)`,
        suggestion: `Ensure RadiAnt Helper is installed and running on ${clientIp}, accessible from Digital Ocean server ${this.serverIp}`
      };
    }
  }

  // 🔧 GET SERVICE STATUS (Enhanced for Digital Ocean)
  getStatus() {
    return {
      service: 'RadiantBridgeService',
      version: '1.0.0',
      initialized: this.isInitialized,
      tempDirectory: this.tempDir,
      
      // 🔧 DIGITAL OCEAN: Server context
      digitalOceanServer: {
        serverIp: this.serverIp,
        orthancUrl: this.orthancUrl,
        backendUrl: this.backendUrl,
        environment: process.env.NODE_ENV || 'development'
      },
      
      defaultHelperUrl: this.defaultHelperUrl,
      orthancService: this.orthancService.getStatus(),
      
      deployment: {
        platform: 'Digital Ocean Droplet',
        serverSide: `Backend service running on ${this.serverIp}:3000`,
        clientSide: 'RadiAnt Helper must be installed on each client computer',
        clientInstaller: 'Use RadientHelper/deployment/ package for client installation'
      },
      
      supportedFeatures: [
        'Multi-client RadiAnt launching from Digital Ocean',
        'Cross-internet DICOM viewing',
        'Orthanc study proxy',
        'Authentication with Orthanc',
        'Study metadata injection'
      ]
    };
  }

  // 🔧 CLEANUP TEMPORARY FILES
  async cleanupTempFiles(studyId = null, maxAgeHours = 24) {
    try {
      if (!this.isInitialized) {
        await this.initializeTempDirectory();
      }

      console.log(`🧹 [DIGITAL OCEAN] Cleaning up temp files on server ${this.serverIp} older than ${maxAgeHours} hours...`);
      
      const files = await fs.readdir(this.tempDir);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
          console.log(`🗑️ Deleted old temp file: ${file}`);
        }
      }

      console.log(`✅ [DIGITAL OCEAN] Cleanup complete on ${this.serverIp}. Deleted ${deletedCount} files.`);
      return {
        success: true,
        deletedFiles: deletedCount,
        cutoffTime: new Date(cutoffTime).toISOString(),
        serverIp: this.serverIp
      };

    } catch (error) {
      console.error('❌ [DIGITAL OCEAN] Cleanup failed:', error);
      throw new Error(`Temp file cleanup failed on ${this.serverIp}: ${error.message}`);
    }
  }

  // 🔧 ADD: Connection type detection
  getConnectionType(ip) {
    if (!ip) return 'unknown';
    if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') return 'localhost';
    
    // Local network IP ranges
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return 'local_network';
    }
    
    // Public IP
    return 'internet';
  }
}

export default RadiantBridgeService;