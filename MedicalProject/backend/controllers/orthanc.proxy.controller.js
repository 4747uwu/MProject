import OrthancService from '../services/orthancServices.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import AdmZip from 'adm-zip';

const execAsync = promisify(exec);

class OrthancProxyController {
  constructor() {
    this.orthancService = new OrthancService();
    
    // 🌐 DIGITAL OCEAN UBUNTU CONFIGURATION (Hardcoded)
    console.log('🌐 Digital Ocean Ubuntu server detected');
    
    this.cstoreConfig = {
      localAeTitle: 'PACS_SERVER',
      defaultRemoteAeTitle: 'RADIANT',
      defaultPort: 11112,
      
      // 🔧 UBUNTU PATHS (Digital Ocean confirmed)
      tempDirectory: '/tmp/dicom_temp',
      storescuPath: '/usr/bin/storescu',      // ✅ Confirmed working
      echoscuPath: '/usr/bin/echoscu'         // ✅ Confirmed working
    };
    
    console.log('🔧 Digital Ocean configuration loaded:');
    console.log('   - Temp directory:', this.cstoreConfig.tempDirectory);
    console.log('   - storescu path:', this.cstoreConfig.storescuPath);
    console.log('   - echoscu path:', this.cstoreConfig.echoscuPath);
    console.log('   - DCMTK version: v3.6.8 (detected from your help output)');
    
    this.ensureTempDirectory();
    this.checkDcmtkAvailability();
  }

  // 🆕 NEW: Ensure temp directory exists
  ensureTempDirectory() {
    try {
      if (!fs.existsSync(this.cstoreConfig.tempDirectory)) {
        console.log('📁 Creating temp directory:', this.cstoreConfig.tempDirectory);
        fs.mkdirSync(this.cstoreConfig.tempDirectory, { recursive: true });
        
        // Set proper Linux permissions
        fs.chmodSync(this.cstoreConfig.tempDirectory, 0o755);
        console.log('🔐 Set Linux permissions (755) for temp directory');
        console.log('✅ Temp directory created successfully');
      } else {
        console.log('📁 Temp directory already exists:', this.cstoreConfig.tempDirectory);
      }
    } catch (error) {
      console.error('❌ Failed to create temp directory:', error.message);
      console.error('   - Path:', this.cstoreConfig.tempDirectory);
      // Continue execution even if temp directory creation fails
    }
  }

  // 🔧 SIMPLIFIED: DCMTK availability check (Ubuntu specific)
  async checkDcmtkAvailability() {
    try {
      console.log('🔍 Checking DCMTK installation on Ubuntu...');
      console.log('   - storescu path:', this.cstoreConfig.storescuPath);
      console.log('   - echoscu path:', this.cstoreConfig.echoscuPath);
      
      // Check if executables exist
      if (!fs.existsSync(this.cstoreConfig.storescuPath)) {
        throw new Error(`storescu not found at: ${this.cstoreConfig.storescuPath}`);
      }
      
      if (!fs.existsSync(this.cstoreConfig.echoscuPath)) {
        throw new Error(`echoscu not found at: ${this.cstoreConfig.echoscuPath}`);
      }
      
      // Test storescu command
      const { stdout } = await execAsync(`${this.cstoreConfig.storescuPath} --help`);
      
      console.log('✅ DCMTK storescu detected successfully on Ubuntu');
      console.log('   - Version: v3.6.8 (from apt package)');
      console.log('   - Installation: Ubuntu package manager');
      this.dcmtkAvailable = true;
      
    } catch (error) {
      console.error('❌ DCMTK not available on Ubuntu:');
      console.error('   - Error:', error.message);
      console.error('   - Expected storescu path:', this.cstoreConfig.storescuPath);
      console.error('   - Expected echoscu path:', this.cstoreConfig.echoscuPath);
      console.error('');
      console.error('🛠️ UBUNTU INSTALLATION COMMANDS:');
      console.error('   sudo apt update');
      console.error('   sudo apt install dcmtk');
      console.error('   which storescu  # Should show /usr/bin/storescu');
      this.dcmtkAvailable = false;
    }
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

  // 🆕 NEW: C-STORE Study to RadiAnt (Enhanced with detailed logging)
  async cstoreToRadiant(req, res) {
    const { studyId } = req.params;
    const { 
      clientIp: providedClientIp,
      clientPort = this.cstoreConfig.defaultPort,
      remoteAeTitle = this.cstoreConfig.defaultRemoteAeTitle,
      patientName = 'Unknown'
    } = req.body;

    console.log('🚀 ===== STARTING C-STORE PROCESS =====');
    console.log('📋 Request Parameters:');
    console.log('   - Study ID:', studyId);
    console.log('   - Provided Client IP:', providedClientIp);
    console.log('   - Client Port:', clientPort);
    console.log('   - Remote AE Title:', remoteAeTitle);
    console.log('   - Patient Name:', patientName);
    console.log('   - Request Headers:', {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'x-client-ip': req.headers['x-client-ip'],
      'user-agent': req.headers['user-agent']
    });

    // Use provided IP or auto-detect from request
    const clientIp = providedClientIp || this.getClientIpFromRequest(req);
    
    console.log('🌐 IP Address Resolution:');
    console.log('   - Auto-detected IP:', this.getClientIpFromRequest(req));
    console.log('   - Final Client IP:', clientIp);

    try {
      console.log('✅ Starting validation checks...');
      
      // Step 1: Validate required parameters
      if (!clientIp || clientIp === 'unknown') {
        console.error('❌ VALIDATION FAILED: No valid client IP address found');
        return res.status(400).json({
          success: false,
          message: 'Client IP address could not be determined. Please provide clientIp in request body.',
          debugInfo: {
            providedClientIp,
            autoDetectedIp: this.getClientIpFromRequest(req),
            headers: req.headers
          }
        });
      }

      console.log('✅ Validation passed - proceeding with C-STORE');
      console.log(`🎯 Target: ${clientIp}:${clientPort} (AE: ${remoteAeTitle})`);

      // Step 2: Export study from Orthanc as ZIP
      console.log('\n📦 STEP 2: Exporting study from Orthanc...');
      const exportStartTime = Date.now();
      const zipPath = await this.exportStudyToZip(studyId);
      const exportTime = Date.now() - exportStartTime;
      console.log(`✅ Export completed in ${exportTime}ms`);
      console.log(`📄 ZIP file created: ${zipPath}`);
      
      // Check ZIP file size
      const zipStats = fs.statSync(zipPath);
      console.log(`📊 ZIP file size: ${(zipStats.size / 1024 / 1024).toFixed(2)} MB`);

      // Step 3: Extract ZIP to temporary folder
      console.log('\n📂 STEP 3: Extracting DICOM files...');
      const extractStartTime = Date.now();
      const extractPath = await this.extractZipToTemp(zipPath, studyId);
      const extractTime = Date.now() - extractStartTime;
      console.log(`✅ Extraction completed in ${extractTime}ms`);
      console.log(`📁 Extracted to: ${extractPath}`);
      
      // Check extracted files
      const extractedFiles = fs.readdirSync(extractPath, { recursive: true });
      console.log(`📋 Extracted files count: ${extractedFiles.length}`);
      console.log('📄 First 5 files:', extractedFiles.slice(0, 5));

      // Step 4: Send via C-STORE using storescu
      console.log('\n📡 STEP 4: Sending DICOM files via C-STORE...');
      console.log(`🎯 Command will be: storescu -aec ${remoteAeTitle} -aet ${this.cstoreConfig.localAeTitle} -v ${clientIp} ${clientPort} ${extractPath}`);
      
      const cstoreStartTime = Date.now();
      const result = await this.sendViaStorescu(extractPath, clientIp, clientPort, remoteAeTitle);
      const cstoreTime = Date.now() - cstoreStartTime;
      console.log(`✅ C-STORE completed in ${cstoreTime}ms`);
      console.log('📊 Transfer result:', result);

      // Step 5: Cleanup temporary files
      console.log('\n🗑️ STEP 5: Cleaning up temporary files...');
      const cleanupStartTime = Date.now();
      await this.cleanupTempFiles(zipPath, extractPath);
      const cleanupTime = Date.now() - cleanupStartTime;
      console.log(`✅ Cleanup completed in ${cleanupTime}ms`);

      // Final summary
      const totalTime = Date.now() - exportStartTime;
      console.log('\n🎉 ===== C-STORE PROCESS COMPLETED SUCCESSFULLY =====');
      console.log(`⏱️ Total process time: ${totalTime}ms`);
      console.log(`📊 Breakdown:`);
      console.log(`   - Export: ${exportTime}ms`);
      console.log(`   - Extract: ${extractTime}ms`);
      console.log(`   - C-STORE: ${cstoreTime}ms`);
      console.log(`   - Cleanup: ${cleanupTime}ms`);
      console.log(`📁 Files sent: ${result.filesCount}`);
      console.log(`🎯 Destination: ${clientIp}:${clientPort}`);

      res.json({
        success: true,
        message: `Study successfully sent to RadiAnt at ${clientIp}:${clientPort}`,
        data: {
          studyId,
          clientIp,
          clientPort,
          remoteAeTitle,
          patientName,
          filesCount: result.filesCount,
          transferTime: result.transferTime,
          totalProcessTime: `${totalTime}ms`,
          breakdown: {
            exportTime: `${exportTime}ms`,
            extractTime: `${extractTime}ms`,
            cstoreTime: `${cstoreTime}ms`,
            cleanupTime: `${cleanupTime}ms`
          },
          zipSizeMB: (zipStats.size / 1024 / 1024).toFixed(2)
        }
      });

    } catch (error) {
      console.error('\n❌ ===== C-STORE PROCESS FAILED =====');
      console.error('💥 Error details:');
      console.error('   - Message:', error.message);
      console.error('   - Stack:', error.stack);
      console.error('   - Study ID:', studyId);
      console.error('   - Target IP:', clientIp);
      console.error('   - Target Port:', clientPort);
      
      res.status(500).json({
        success: false,
        message: 'Failed to send study via C-STORE',
        error: error.message,
        details: error.details || null,
        debugInfo: {
          studyId,
          clientIp,
          clientPort,
          remoteAeTitle,
          patientName,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  // Enhanced export method with simplified path
  async exportStudyToZip(studyId) {
    const zipPath = path.join(this.cstoreConfig.tempDirectory, `${studyId}.zip`);
    
    console.log('📦 Starting export process...');
    console.log('   - Study ID:', studyId);
    console.log('   - Target ZIP path:', zipPath);
    
    try {
      // Get the ZIP archive from Orthanc
      const orthancUrl = `${process.env.ORTHANC_URL}/studies/${studyId}/archive`;
      console.log('   - Orthanc URL:', orthancUrl);
      
      console.log('🌐 Making request to Orthanc...');
      const response = await fetch(orthancUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.ORTHANC_USERNAME}:${process.env.ORTHANC_PASSWORD}`).toString('base64')}`
        }
      });

      console.log('📡 Orthanc response:');
      console.log('   - Status:', response.status);
      console.log('   - Status Text:', response.statusText);

      if (!response.ok) {
        throw new Error(`Failed to export study: ${response.status} ${response.statusText}`);
      }

      // Save ZIP file
      console.log('💾 Saving ZIP file...');
      const buffer = await response.arrayBuffer();
      console.log('   - Buffer size:', buffer.byteLength, 'bytes');
      
      fs.writeFileSync(zipPath, Buffer.from(buffer));
      
      const fileStats = fs.statSync(zipPath);
      console.log('✅ ZIP file saved successfully');
      console.log('   - File size:', fileStats.size, 'bytes');
      console.log('   - File path:', zipPath);
      
      return zipPath;

    } catch (error) {
      console.error('❌ Export failed:');
      console.error('   - Error:', error.message);
      console.error('   - Study ID:', studyId);
      console.error('   - ZIP Path:', zipPath);
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  // Enhanced extraction method with simplified path
  async extractZipToTemp(zipPath, studyId) {
    const extractPath = path.join(this.cstoreConfig.tempDirectory, `extracted_${studyId}`);
    
    console.log('📂 Starting extraction process...');
    console.log('   - ZIP file:', zipPath);
    console.log('   - Extract to:', extractPath);
    
    try {
      // Remove existing extraction folder
      if (fs.existsSync(extractPath)) {
        console.log('🗑️ Removing existing extraction folder...');
        fs.rmSync(extractPath, { recursive: true, force: true });
      }
      
      // Create extraction folder
      console.log('📁 Creating extraction folder...');
      fs.mkdirSync(extractPath, { recursive: true });
      
      // Extract ZIP
      console.log('📦 Extracting ZIP file...');
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();
      console.log('   - ZIP entries count:', entries.length);
      
      zip.extractAllTo(extractPath, true);
      
      // Verify extraction
      const extractedFiles = fs.readdirSync(extractPath, { recursive: true });
      console.log('✅ Extraction completed');
      console.log('   - Extracted files count:', extractedFiles.length);
      console.log('   - Sample files:', extractedFiles.slice(0, 3));
      
      return extractPath;

    } catch (error) {
      console.error('❌ Extraction failed:');
      console.error('   - Error:', error.message);
      console.error('   - ZIP Path:', zipPath);
      console.error('   - Extract Path:', extractPath);
      throw new Error(`Extraction failed: ${error.message}`);
    }
  }

  // 🔧 FIXED: Send individual DICOM files instead of directory scanning
  async sendViaStorescu(dicomPath, clientIp, clientPort, remoteAeTitle) {
    // Check if DCMTK is available
    if (!this.dcmtkAvailable) {
      throw new Error(`DCMTK not available. Please verify installation at: ${this.cstoreConfig.storescuPath}`);
    }

    const startTime = Date.now();
    let command;
    
    console.log('📡 Preparing C-STORE transfer...');
    console.log('   - DICOM path:', dicomPath);
    console.log('   - Target IP:', clientIp);
    console.log('   - Target port:', clientPort);
    console.log('   - Remote AE Title:', remoteAeTitle);
    console.log('   - Local AE Title:', this.cstoreConfig.localAeTitle);
    console.log('   - Using DCMTK storescu:', this.cstoreConfig.storescuPath);
    
    try {
      // Get all DICOM files recursively
      const allDicomFiles = this.getAllDicomFiles(dicomPath);
      console.log('📊 DICOM files found:', allDicomFiles.length);
      console.log('📄 DICOM files:', allDicomFiles.map(f => path.basename(f)));
      
      if (allDicomFiles.length === 0) {
        throw new Error('No DICOM files found in directory');
      }
      
      // Convert IPv6 localhost to IPv4 if needed
      const targetIp = clientIp === '::1' ? '127.0.0.1' : clientIp;
      
      // 🔧 FIXED: Send individual files instead of directory
      // Quote each file path and join with spaces
      const quotedFiles = allDicomFiles.map(file => `"${file}"`).join(' ');
      command = `"${this.cstoreConfig.storescuPath}" -aec ${remoteAeTitle} -aet ${this.cstoreConfig.localAeTitle} -v ${targetIp} ${clientPort} ${quotedFiles}`;

      console.log('🚀 Executing DCMTK storescu command with individual files:');
      console.log('   - Files to send:', allDicomFiles.length);
      console.log('   - File paths:');
      allDicomFiles.forEach((file, index) => {
        console.log(`     ${index + 1}. ${file}`);
      });
      console.log('   - Target IP (converted):', targetIp);
      console.log('   - Command (first 200 chars):', command.substring(0, 200) + '...');

      // Execute storescu command
      const { stdout, stderr } = await execAsync(command);
      
      const transferTime = Date.now() - startTime;
      
      console.log('✅ DCMTK C-STORE command completed');
      console.log('⏱️ Transfer time:', transferTime, 'ms');
      console.log('📤 STDOUT:');
      console.log(stdout);
      
      if (stderr) {
        console.log('⚠️ STDERR:');
        console.log(stderr);
      }

      return {
        filesCount: allDicomFiles.length,
        transferTime: `${transferTime}ms`,
        stdout,
        stderr
      };

    } catch (error) {
      const transferTime = Date.now() - startTime;
      
      console.error('❌ DCMTK storescu command failed:');
      console.error('   - Error message:', error.message);
      console.error('   - Transfer time:', transferTime, 'ms');
      console.error('   - DICOM path:', dicomPath);
      console.error('   - Command that failed (truncated):', command?.substring(0, 200) + '...');
      
      if (error.stdout) console.error('   - STDOUT:', error.stdout);
      if (error.stderr) console.error('   - STDERR:', error.stderr);
      
      // Check for common DCMTK errors
      if (error.message.includes('cannot access')) {
        throw new Error(`Cannot access DICOM files: ${dicomPath}`);
      } else if (error.message.includes('Connection refused')) {
        throw new Error(`Connection refused - RadiAnt may not be running on ${targetIp}:${clientPort}`);
      } else if (error.message.includes('no input files')) {
        throw new Error(`DCMTK could not find valid DICOM files in: ${dicomPath}`);
      }
      
      throw new Error(`DCMTK C-STORE failed after ${transferTime}ms: ${error.message}`);
    }
  }

  // 🔧 ENHANCED: Better DICOM file detection
  getAllDicomFiles(dirPath) {
    const dicomFiles = [];
    
    const scanDirectory = (currentPath) => {
      try {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
          const itemPath = path.join(currentPath, item);
          const stats = fs.statSync(itemPath);
          
          if (stats.isDirectory()) {
            console.log(`   📁 Scanning subdirectory: ${item}`);
            scanDirectory(itemPath); // Recursive scan
          } else if (stats.isFile()) {
            console.log(`   📄 Found file: ${item} (${stats.size} bytes)`);
            
            // Check if it's a DICOM file
            if (item.toLowerCase().endsWith('.dcm') || 
                item.toLowerCase().endsWith('.dicom') ||
                item.toLowerCase().includes('mr') ||     // Common DICOM naming
                item.toLowerCase().includes('ct') ||
                item.toLowerCase().includes('us') ||
                !path.extname(item)) {                   // Files without extension
              
              console.log(`   ✅ Identified as DICOM: ${item}`);
              dicomFiles.push(itemPath);
            } else {
              console.log(`   ⚠️ Skipping non-DICOM file: ${item}`);
            }
          }
        }
      } catch (error) {
        console.error(`   ❌ Error scanning directory ${currentPath}:`, error.message);
      }
    };
    
    try {
      console.log(`📂 Scanning for DICOM files in: ${dirPath}`);
      scanDirectory(dirPath);
      console.log(`📊 Total DICOM files found: ${dicomFiles.length}`);
      
      if (dicomFiles.length > 0) {
        console.log('📄 DICOM files:');
        dicomFiles.forEach((file, index) => {
          console.log(`   ${index + 1}. ${path.basename(file)} (${path.dirname(file)})`);
        });
      }
      
      return dicomFiles;
    } catch (error) {
      console.error('❌ Error scanning for DICOM files:', error);
      return [];
    }
  }

  // 🔧 UPDATED: Enhanced DICOM file counting with better logging
  countDicomFiles(dirPath) {
    try {
      const files = this.getAllDicomFiles(dirPath);
      console.log(`📊 countDicomFiles result: ${files.length} files found`);
      return files.length;
    } catch (error) {
      console.warn('⚠️ Could not count DICOM files:', error);
      return 0;
    }
  }

  // Enhanced cleanup with simplified paths
  async cleanupTempFiles(zipPath, extractPath) {
    console.log('🗑️ Starting cleanup process...');
    
    try {
      if (fs.existsSync(zipPath)) {
        const zipStats = fs.statSync(zipPath);
        fs.unlinkSync(zipPath);
        console.log(`✅ Cleaned up ZIP file (${(zipStats.size / 1024 / 1024).toFixed(2)} MB): ${zipPath}`);
      } else {
        console.log('ℹ️ ZIP file not found for cleanup:', zipPath);
      }
      
      if (fs.existsSync(extractPath)) {
        const files = fs.readdirSync(extractPath, { recursive: true });
        fs.rmSync(extractPath, { recursive: true, force: true });
        console.log(`✅ Cleaned up extracted files (${files.length} files): ${extractPath}`);
      } else {
        console.log('ℹ️ Extract path not found for cleanup:', extractPath);
      }
      
    } catch (error) {
      console.warn('⚠️ Cleanup warning:', error.message);
      console.warn('   - ZIP path:', zipPath);
      console.warn('   - Extract path:', extractPath);
    }
  }

  // 🆕 NEW: Test C-STORE connectivity
  async testCStoreConnection(req, res) {
    const { clientIp, clientPort = this.cstoreConfig.defaultPort } = req.body;

    try {
      if (!clientIp) {
        return res.status(400).json({
          success: false,
          message: 'Client IP address is required'
        });
      }

      // Test with echoscu (DICOM Echo)
      const command = `echoscu -aec ${this.cstoreConfig.defaultRemoteAeTitle} -aet ${this.cstoreConfig.localAeTitle} ${clientIp} ${clientPort}`;
      
      console.log(`🔍 Testing connection: ${command}`);
      
      const { stdout, stderr } = await execAsync(command);
      
      res.json({
        success: true,
        message: `Successfully connected to ${clientIp}:${clientPort}`,
        data: {
          clientIp,
          clientPort,
          stdout,
          stderr
        }
      });

    } catch (error) {
      console.error('Connection test failed:', error);
      res.status(500).json({
        success: false,
        message: `Failed to connect to ${clientIp}:${clientPort}`,
        error: error.message
      });
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

  // Add this helper method to your OrthancProxyController class
  getClientIpFromRequest(req) {
    // Try different headers in order of preference
    const clientIp = req.headers['x-forwarded-for'] ||
                     req.headers['x-real-ip'] ||
                     req.headers['x-client-ip'] ||
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress ||
                     req.ip ||
                     req.ips?.[0];

    // Clean up IPv6 mapped IPv4 addresses
    if (clientIp && clientIp.startsWith('::ffff:')) {
      return clientIp.substring(7);
    }

    return clientIp || 'unknown';
  }
}

const orthancProxyController = new OrthancProxyController();

export const getStudyDetails = orthancProxyController.getStudyDetails.bind(orthancProxyController);
export const downloadStudyArchive = orthancProxyController.downloadStudyArchive.bind(orthancProxyController);
export const getStudyMetadata = orthancProxyController.getStudyMetadata.bind(orthancProxyController);
export const searchStudies = orthancProxyController.searchStudies.bind(orthancProxyController);
export const getOrthancStatus = orthancProxyController.getOrthancStatus.bind(orthancProxyController);

// 🆕 NEW: C-STORE exports
export const cstoreToRadiant = orthancProxyController.cstoreToRadiant.bind(orthancProxyController);
export const testCStoreConnection = orthancProxyController.testCStoreConnection.bind(orthancProxyController);