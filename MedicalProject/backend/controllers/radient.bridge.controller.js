import RadiantBridgeService from '../services/RadientBridgeService.js';

class RadiantBridgeController {
  constructor() {
    this.bridgeService = new RadiantBridgeService();
    // 🔧 DIGITAL OCEAN: Your server IP
    this.serverIp = '64.227.187.164';
    this.orthancUrl = `http://${this.serverIp}:8042`;
  }

  // 🔧 FIXED: CHECK RADIANT HELPER STATUS
  async checkHelperStatus(req, res) {
    try {
      // 🔧 AUTO-DETECT CLIENT'S REAL IP FROM REQUEST HEADERS
      let clientIp = req.body.clientIp;
      
      // If no IP provided or localhost, auto-detect real client IP
      if (!clientIp || clientIp === 'localhost') {
        clientIp = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   req.ip;
        
        // Clean up IPv6 format
        if (clientIp && clientIp.includes('::ffff:')) {
          clientIp = clientIp.replace('::ffff:', '');
        }
        
        // Clean up multiple IPs (take first one)
        if (clientIp && clientIp.includes(',')) {
          clientIp = clientIp.split(',')[0].trim();
        }
      }
      
      console.log(`📋 [IP VERIFICATION] === REQUEST ANALYSIS ===`);
      console.log(`📋 [IP VERIFICATION] x-forwarded-for: ${req.headers['x-forwarded-for']}`);
      console.log(`📋 [IP VERIFICATION] x-real-ip: ${req.headers['x-real-ip']}`);
      console.log(`📋 [IP VERIFICATION] connection.remoteAddress: ${req.connection.remoteAddress}`);
      console.log(`📋 [IP VERIFICATION] req.ip: ${req.ip}`);
      console.log(`🎯 [IP VERIFICATION] Final clientIp: ${clientIp}`);
      console.log(`🎯 [IP VERIFICATION] Will target: http://${clientIp}:8765`);
      
      const status = await this.bridgeService.checkRadiantHelperStatus(clientIp);
      
      res.json({
        success: true,
        data: {
          ...status,
          serverInfo: {
            serverIp: '64.227.187.164',
            orthancUrl: 'http://64.227.187.164:8042',
            clientIp: clientIp
          }
        },
        message: status.isRunning ? 'RadiAnt Helper is running' : 'RadiAnt Helper not accessible'
      });
      
    } catch (error) {
      console.error('Helper status check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check RadiAnt Helper status',
        error: error.message,
        data: {
          isRunning: false,
          clientIp: req.body.clientIp || 'localhost'
        },
        serverInfo: {
          serverIp: '64.227.187.164',
          orthancUrl: 'http://64.227.187.164:8042'
        }
      });
    }
  }

  // 🔧 LAUNCH STUDY BY ORTHANC ID
  async launchStudyByOrthancId(req, res) {
    try {
      const { orthancStudyId } = req.params;
      const studyInfo = req.body;
      const { clientIp } = req.body;
      
      console.log(`🚀 Launching study ${orthancStudyId} for client ${clientIp || 'localhost'}`);
      console.log(`🌐 Server: ${this.serverIp}, Orthanc: ${this.orthancUrl}`);
      
      // 🔧 DIGITAL OCEAN: Add server context to study info
      studyInfo.orthancStudyId = orthancStudyId;
      studyInfo.serverContext = {
        serverIp: this.serverIp,
        orthancUrl: this.orthancUrl,
        downloadBaseUrl: `http://${this.serverIp}:8042`,
        clientIp: clientIp || 'localhost'
      };
      
      const result = await this.bridgeService.launchStudyInRadiant(studyInfo, clientIp);
      
      res.json({
        success: true,
        data: {
          ...result,
          serverContext: studyInfo.serverContext
        },
        message: 'Study launched successfully in RadiAnt'
      });
      
    } catch (error) {
      console.error('Study launch failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to launch study in RadiAnt',
        error: error.message,
        details: error.stack,
        serverInfo: {
          serverIp: this.serverIp,
          orthancUrl: this.orthancUrl
        }
      });
    }
  }

  // 🔧 LAUNCH STUDY BY STUDY UID
  async launchStudyByUid(req, res) {
    try {
      const { studyInstanceUID } = req.params;
      const studyInfo = req.body;
      const { clientIp } = req.body;
      
      console.log(`🚀 Launching study UID ${studyInstanceUID} for client ${clientIp || 'localhost'}`);
      console.log(`🌐 Server: ${this.serverIp}, Orthanc: ${this.orthancUrl}`);
      
      // Find Orthanc study ID by Study Instance UID
      const orthancStudyId = await this.bridgeService.findOrthancStudyByUID(studyInstanceUID);
      
      if (!orthancStudyId) {
        return res.status(404).json({
          success: false,
          message: 'Study not found in Orthanc',
          studyInstanceUID,
          serverInfo: {
            serverIp: this.serverIp,
            orthancUrl: this.orthancUrl
          }
        });
      }
      
      // 🔧 DIGITAL OCEAN: Add server context
      studyInfo.orthancStudyId = orthancStudyId;
      studyInfo.studyInstanceUID = studyInstanceUID;
      studyInfo.serverContext = {
        serverIp: this.serverIp,
        orthancUrl: this.orthancUrl,
        downloadBaseUrl: `http://${this.serverIp}:8042`,
        clientIp: clientIp || 'localhost'
      };
      
      const result = await this.bridgeService.launchStudyInRadiant(studyInfo, clientIp);
      
      res.json({
        success: true,
        data: {
          ...result,
          serverContext: studyInfo.serverContext
        },
        message: 'Study launched successfully in RadiAnt'
      });
      
    } catch (error) {
      console.error('Study launch by UID failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to launch study by UID',
        error: error.message,
        serverInfo: {
          serverIp: this.serverIp,
          orthancUrl: this.orthancUrl
        }
      });
    }
  }

  // 🔧 GET BRIDGE SERVICE STATUS
  async getBridgeStatus(req, res) {
    try {
      const status = this.bridgeService.getStatus();
      
      // 🔧 DIGITAL OCEAN: Add server information
      const enhancedStatus = {
        ...status,
        digitalOceanServer: {
          serverIp: this.serverIp,
          orthancUrl: this.orthancUrl,
          backendUrl: `http://${this.serverIp}:3000`,
          frontendUrl: `http://${this.serverIp}`,
          environment: process.env.NODE_ENV || 'development'
        },
        networkInfo: {
          clientHelperPort: 8765,
          orthancPort: 8042,
          backendPort: 3000,
          frontendPort: 80
        }
      };
      
      res.json({
        success: true,
        data: enhancedStatus,
        message: 'Bridge service status retrieved'
      });
      
    } catch (error) {
      console.error('Bridge status check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bridge service status',
        error: error.message,
        serverInfo: {
          serverIp: this.serverIp,
          orthancUrl: this.orthancUrl
        }
      });
    }
  }

  // 🔧 CLEANUP TEMP FILES
  async cleanupTempFiles(req, res) {
    try {
      const { maxAgeHours = 24 } = req.body;
      
      console.log(`🧹 Cleaning up temp files on Digital Ocean server: ${this.serverIp}`);
      
      const result = await this.bridgeService.cleanupTempFiles(null, maxAgeHours);
      
      res.json({
        success: true,
        data: {
          ...result,
          serverInfo: {
            serverIp: this.serverIp,
            cleanupTime: new Date().toISOString()
          }
        },
        message: 'Temp file cleanup completed on Digital Ocean server'
      });
      
    } catch (error) {
      console.error('Temp cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup temp files',
        error: error.message,
        serverInfo: {
          serverIp: this.serverIp
        }
      });
    }
  }

  // 🔧 TEST CONNECTION TO CLIENT (Enhanced for Digital Ocean)
  async testClientConnection(req, res) {
    try {
      const { clientIp } = req.body;
      
      if (!clientIp) {
        return res.status(400).json({
          success: false,
          message: 'Client IP address required',
          serverInfo: {
            serverIp: this.serverIp,
            orthancUrl: this.orthancUrl,
            exampleClientIp: '192.168.1.100'
          }
        });
      }
      
      console.log(`🧪 Testing connection from Digital Ocean server (${this.serverIp}) to client (${clientIp})`);
      
      const result = await this.bridgeService.testClientConnection(clientIp);
      
      // 🔧 DIGITAL OCEAN: Enhanced result with network context
      const enhancedResult = {
        ...result,
        networkContext: {
          serverIp: this.serverIp,
          clientIp: clientIp,
          connectionType: this.isLocalNetwork(clientIp) ? 'local_network' : 'internet',
          orthancAccessible: `${this.orthancUrl}/app/explorer.html`,
          recommendedFirewallPorts: [8765, 8042, 3000, 80]
        }
      };
      
      res.json({
        success: true,
        data: enhancedResult,
        message: `Connection test from Digital Ocean server to ${clientIp} completed`
      });
      
    } catch (error) {
      console.error('Client connection test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test client connection',
        error: error.message,
        serverInfo: {
          serverIp: this.serverIp,
          clientIp: req.body.clientIp
        }
      });
    }
  }

  // 🔧 NEW: Network diagnostics for Digital Ocean
  async getNetworkDiagnostics(req, res) {
    try {
      const diagnostics = {
        server: {
          ip: this.serverIp,
          orthancUrl: this.orthancUrl,
          backendPort: 3000,
          frontendPort: 80,
          environment: process.env.NODE_ENV || 'development'
        },
        orthanc: {
          url: this.orthancUrl,
          explorerUrl: `${this.orthancUrl}/app/explorer.html`,
          apiUrl: `${this.orthancUrl}/studies`,
          authRequired: true
        },
        radiantHelper: {
          defaultPort: 8765,
          expectedEndpoints: [
            'http://localhost:8765/status',
            'http://localhost:8765/health',
            'http://localhost:8765/launch'
          ],
          installationGuide: 'RadientHelper/deployment/'
        },
        networking: {
          requiredPorts: {
            'RadiAnt Helper': 8765,
            'Orthanc DICOM': 8042,
            'Backend API': 3000,
            'Frontend Web': 80
          },
          firewallNotes: 'Ensure client can access server ports 8042 and 3000',
          commonIssues: [
            'Client firewall blocking port 8765',
            'RadiAnt Helper not installed on client',
            'Network connectivity between client and server',
            'Orthanc authentication credentials'
          ]
        }
      };

      res.json({
        success: true,
        data: diagnostics,
        message: 'Network diagnostics for Digital Ocean deployment'
      });

    } catch (error) {
      console.error('Network diagnostics failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get network diagnostics',
        error: error.message
      });
    }
  }

  // 🔧 UTILITY: Check if IP is local network
  isLocalNetwork(ip) {
    const localPatterns = [
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^127\./,
      /^localhost$/
    ];
    
    return localPatterns.some(pattern => pattern.test(ip));
  }
}

const radiantBridgeController = new RadiantBridgeController();

// 🔧 FIXED: Properly bind methods to preserve 'this' context
export const checkHelperStatus = radiantBridgeController.checkHelperStatus.bind(radiantBridgeController);
export const launchStudyByOrthancId = radiantBridgeController.launchStudyByOrthancId.bind(radiantBridgeController);
export const launchStudyByUid = radiantBridgeController.launchStudyByUid.bind(radiantBridgeController);
export const getBridgeStatus = radiantBridgeController.getBridgeStatus.bind(radiantBridgeController);
export const cleanupTempFiles = radiantBridgeController.cleanupTempFiles.bind(radiantBridgeController);
export const testClientConnection = radiantBridgeController.testClientConnection.bind(radiantBridgeController);
export const getNetworkDiagnostics = radiantBridgeController.getNetworkDiagnostics.bind(radiantBridgeController);

// Export controller instance for debugging
export { radiantBridgeController };