import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import extractZip from 'extract-zip'; // Add this import

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RadiantBridgeService {
  constructor() {
    // 🔧 CONFIGURATION: Set up paths and settings
    this.tempDownloadPath = path.join(os.tmpdir(), 'radiant-bridge-downloads');
    this.orthancConfig = {
      baseUrl: process.env.ORTHANC_URL || 'http://localhost:8042',
      username: process.env.ORTHANC_USERNAME || 'alice',
      password: process.env.ORTHANC_PASSWORD || 'alicePassword'
    };
    
    this.orthancAuth = 'Basic ' + Buffer.from(
      `${this.orthancConfig.username}:${this.orthancConfig.password}`
    ).toString('base64');
    
    // 🔧 RADIANT VIEWER PATHS: Configure for different OS
    this.radiantPaths = this.detectRadiantPaths();
    
    // Ensure temp directory exists
    this.ensureTempDirectory();
    
    console.log('🖥️ Radiant Bridge Service initialized');
    console.log('📁 Temp download path:', this.tempDownloadPath);
    console.log('🔍 Detected Radiant paths:', this.radiantPaths);
  }

  // 🔧 DETECT RADIANT VIEWER INSTALLATION PATHS
  detectRadiantPaths() {
    const platform = os.platform();
    const possiblePaths = [];
    
    switch (platform) {
      case 'win32':
        possiblePaths.push(
          // 🔧 UPDATED: Correct RadiAnt Viewer paths for Windows
          'C:\\Program Files\\RadiAntViewer64bit\\RadiAntViewer.exe',
          'C:\\Program Files (x86)\\RadiAntViewer\\RadiAntViewer.exe',
          'C:\\Program Files\\RadiAntViewer\\RadiAntViewer.exe',
          
          // 🔧 ADDITIONAL: Check user-specific installations
          path.join(os.homedir(), 'AppData\\Local\\RadiAntViewer\\RadiAntViewer.exe'),
          path.join(os.homedir(), 'AppData\\Local\\RadiAntViewer64bit\\RadiAntViewer.exe'),
          
          // 🔧 ADDITIONAL: Check for portable installations
          'D:\\Program Files\\RadiAntViewer\\RadiAntViewer.exe',
          'D:\\Program Files\\RadiAntViewer64bit\\RadiAntViewer.exe',
          'E:\\Program Files\\RadiAntViewer\\RadiAntViewer.exe',
          
          // 🔧 ADDITIONAL: Check common custom installation paths
          'C:\\RadiAnt\\RadiAntViewer.exe',
          'C:\\RadiAntViewer\\RadiAntViewer.exe',
          
          // 🔧 LEGACY: Old path structure (keeping for compatibility)
          'C:\\Program Files\\RadiAnt DICOM Viewer\\RadiAntViewer.exe',
          'C:\\Program Files (x86)\\RadiAnt DICOM Viewer\\RadiAntViewer.exe'
        );
        break;
        
      case 'darwin': // macOS
        possiblePaths.push(
          '/Applications/RadiAnt DICOM Viewer.app/Contents/MacOS/RadiAnt DICOM Viewer',
          '/Applications/RadiAntViewer.app/Contents/MacOS/RadiAntViewer',
          path.join(os.homedir(), 'Applications/RadiAnt DICOM Viewer.app/Contents/MacOS/RadiAnt DICOM Viewer'),
          path.join(os.homedir(), 'Applications/RadiAntViewer.app/Contents/MacOS/RadiAntViewer')
        );
        break;
        
      case 'linux':
        possiblePaths.push(
          '/usr/bin/radiant-viewer',
          '/usr/local/bin/radiant-viewer',
          '/usr/bin/RadiAntViewer',
          '/usr/local/bin/RadiAntViewer',
          path.join(os.homedir(), '.local/bin/radiant-viewer'),
          path.join(os.homedir(), '.local/bin/RadiAntViewer'),
          '/opt/radiant-viewer/bin/radiant-viewer',
          '/opt/RadiAntViewer/RadiAntViewer'
        );
        break;
    }
    
    console.log(`🔍 Scanning for RadiAnt Viewer installations on ${platform}...`);
    console.log(`📋 Checking ${possiblePaths.length} possible paths`);
    
    // Check which paths actually exist
    const validPaths = possiblePaths.filter(p => {
      try {
        const exists = fs.existsSync(p);
        if (exists) {
          console.log(`✅ Found RadiAnt Viewer: ${p}`);
        }
        return exists;
      } catch (error) {
        console.warn(`⚠️ Error checking path ${p}:`, error.message);
        return false;
      }
    });
    
    if (validPaths.length === 0) {
      console.warn('❌ No RadiAnt Viewer installations found!');
      console.log('💡 Expected paths:');
      possiblePaths.slice(0, 5).forEach(p => console.log(`   - ${p}`));
    } else {
      console.log(`🎉 Found ${validPaths.length} RadiAnt Viewer installation(s)`);
    }
    
    return {
      platform,
      available: validPaths,
      primary: validPaths[0] || null,
      totalChecked: possiblePaths.length,
      allPaths: possiblePaths // For debugging
    };
  }

  // 🔧 ENSURE TEMP DIRECTORY EXISTS
  ensureTempDirectory() {
    try {
      if (!fs.existsSync(this.tempDownloadPath)) {
        fs.mkdirSync(this.tempDownloadPath, { recursive: true });
        console.log('📁 Created temp directory:', this.tempDownloadPath);
      }
    } catch (error) {
      console.error('❌ Error creating temp directory:', error);
      throw new Error(`Failed to create temp directory: ${error.message}`);
    }
  }

  // 🔧 MAIN METHOD: Download study and launch Radiant
  async launchStudyInRadiant(studyInfo) {
    const startTime = Date.now();
    console.log(`🚀 Starting Radiant launch for study: ${studyInfo.studyInstanceUID}`);
    
    try {
      // Step 1: Validate inputs
      this.validateStudyInfo(studyInfo);
      
      // Step 2: Create unique download folder
      const downloadFolder = await this.createStudyFolder(studyInfo);
      
      // Step 3: Download study from Orthanc (or future: Wasabi)
      const downloadedFiles = await this.downloadStudyFiles(studyInfo, downloadFolder);
      
      // Step 4: Launch Radiant Viewer
      const launchResult = await this.launchRadiantViewer(downloadFolder, studyInfo);
      
      const totalTime = Date.now() - startTime;
      console.log(`✅ Radiant launch completed in ${totalTime}ms`);
      
      return {
        success: true,
        downloadFolder,
        filesDownloaded: downloadedFiles.length,
        launchMethod: launchResult.method,
        totalTime,
        studyInfo,
        tempCleanup: downloadFolder // For cleanup later
      };
      
    } catch (error) {
      console.error('❌ Error launching Radiant:', error);
      throw error;
    }
  }

  // 🔧 VALIDATE STUDY INFORMATION
  // 🔧 ENHANCED: Updated validation to be more flexible
  validateStudyInfo(studyInfo) {
    const required = ['orthancStudyId']; // Only truly essential field
    const missing = required.filter(field => !studyInfo[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required study information: ${missing.join(', ')}`);
    }
    
    // Auto-fix missing studyInstanceUID
    if (!studyInfo.studyInstanceUID || studyInfo.studyInstanceUID.startsWith('FALLBACK_')) {
      console.warn('⚠️ Missing or fallback studyInstanceUID - this is OK for RadiAnt launch');
    }
    
    // Log study summary for verification
    console.log('✅ Study validation passed:', {
      orthancStudyId: studyInfo.orthancStudyId,
      studyInstanceUID: studyInfo.studyInstanceUID,
      patientName: studyInfo.patientName,
      modality: studyInfo.modality,
      seriesCount: studyInfo.seriesCount,
      instanceCount: studyInfo.instanceCount,
      institutionName: studyInfo.institutionName
    });
  }

  // 🔧 CREATE UNIQUE STUDY FOLDER
  // 🔧 ENHANCED: Create study folder with better naming
  async createStudyFolder(studyInfo) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const patientName = (studyInfo.patientName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const modality = (studyInfo.modality || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '');
    const studyDate = (studyInfo.studyDate || '').replace(/[^0-9]/g, '').slice(0, 8); // YYYYMMDD format
    
    // Create descriptive folder name
    const folderName = [
      patientName,
      modality,
      studyDate || 'NoDate',
      studyInfo.orthancStudyId.slice(0, 8),
      timestamp.slice(0, 16) // YYYY-MM-DDTHH-MM
    ].join('_');
    
    const fullPath = path.join(this.tempDownloadPath, folderName);
    
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      
      // 🆕 Create study info file for RadiAnt reference
      const studyInfoFile = path.join(fullPath, 'study_info.json');
      const studyMetadata = {
        patientName: studyInfo.patientName,
        patientId: studyInfo.patientId,
        modality: studyInfo.modality,
        studyDate: studyInfo.studyDate,
        studyInstanceUID: studyInfo.studyInstanceUID,
        orthancStudyId: studyInfo.orthancStudyId,
        seriesCount: studyInfo.seriesCount,
        instanceCount: studyInfo.instanceCount,
        institutionName: studyInfo.institutionName,
        accessionNumber: studyInfo.accessionNumber,
        clinicalHistory: studyInfo.clinicalHistory,
        assignedDoctorName: studyInfo.assignedDoctorName,
        launchedAt: new Date().toISOString(),
        launchedBy: 'Medical Platform Bridge Service'
      };
      
      fs.writeFileSync(studyInfoFile, JSON.stringify(studyMetadata, null, 2));
      
      console.log('📁 Created study folder with metadata:', fullPath);
      return fullPath;
    } catch (error) {
      throw new Error(`Failed to create study folder: ${error.message}`);
    }
  }

  // 🔧 DOWNLOAD STUDY FILES FROM ORTHANC
  async downloadStudyFiles(studyInfo, downloadFolder) {
    console.log(`📥 Downloading study ${studyInfo.orthancStudyId} from Orthanc...`);
    
    try {
      // Get study metadata
      const metadataResponse = await axios.get(
        `${this.orthancConfig.baseUrl}/studies/${studyInfo.orthancStudyId}`,
        { headers: { 'Authorization': this.orthancAuth } }
      );
      
      console.log('📊 Study metadata retrieved:', {
        patientName: metadataResponse.data.PatientMainDicomTags?.PatientName,
        studyDate: metadataResponse.data.MainDicomTags?.StudyDate,
        modality: metadataResponse.data.MainDicomTags?.Modality,
        seriesCount: metadataResponse.data.Series?.length || 0
      });
      
      // Download study as ZIP
      const zipResponse = await axios.get(
        `${this.orthancConfig.baseUrl}/studies/${studyInfo.orthancStudyId}/archive`,
        {
          headers: { 'Authorization': this.orthancAuth },
          responseType: 'stream'
        }
      );
      
      // Save ZIP file
      const zipPath = path.join(downloadFolder, 'study.zip');
      const writer = fs.createWriteStream(zipPath);
      zipResponse.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      console.log('💾 Study ZIP downloaded:', zipPath);
      
      // Extract ZIP (for Radiant compatibility)
      await this.extractZipFile(zipPath, downloadFolder);
      
      // Return list of DICOM files
      const dicomFiles = this.findDicomFiles(downloadFolder);
      console.log(`📋 Found ${dicomFiles.length} DICOM files`);
      
      return dicomFiles;
      
    } catch (error) {
      throw new Error(`Failed to download study: ${error.message}`);
    }
  }

  // 🔧 SIMPLIFIED: Use the imported function directly
  async extractZipFile(zipPath, extractTo) {
    try {
      await extractZip(zipPath, { dir: extractTo });
      console.log('📂 ZIP file extracted successfully');
      
      // Remove the ZIP file to save space
      fs.unlinkSync(zipPath);
    } catch (error) {
      throw new Error(`Failed to extract ZIP: ${error.message}`);
    }
  }

  // 🔧 FIND DICOM FILES IN FOLDER
  findDicomFiles(folder) {
    const dicomFiles = [];
    
    const scanDirectory = (dir) => {
      const items = fs.readdirSync(dir);
      
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.toLowerCase().endsWith('.dcm') || this.isDicomFile(fullPath)) {
          dicomFiles.push(fullPath);
        }
      });
    };
    
    scanDirectory(folder);
    return dicomFiles;
  }

  // 🔧 CHECK IF FILE IS DICOM
  isDicomFile(filePath) {
    try {
      const buffer = fs.readFileSync(filePath, { start: 128, end: 132 });
      return buffer.toString() === 'DICM';
    } catch (error) {
      return false;
    }
  }

  // 🔧 LAUNCH RADIANT VIEWER
  async launchRadiantViewer(studyFolder, studyInfo) {
    console.log('🖥️ Launching Radiant Viewer...');
    
    if (!this.radiantPaths.primary) {
      throw new Error('Radiant Viewer not found. Please install Radiant DICOM Viewer.');
    }
    
    const radiantPath = this.radiantPaths.primary;
    const args = [studyFolder]; // Pass the folder containing DICOM files
    
    try {
      // Launch Radiant Viewer as detached process
      const radiantProcess = spawn(radiantPath, args, {
        detached: true,
        stdio: 'ignore'
      });
      
      radiantProcess.unref(); // Allow Node.js to exit even if Radiant is still running
      
      console.log(`✅ Radiant Viewer launched (PID: ${radiantProcess.pid})`);
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        success: true,
        method: 'native_executable',
        processId: radiantProcess.pid,
        path: radiantPath,
        arguments: args
      };
      
    } catch (error) {
      throw new Error(`Failed to launch Radiant Viewer: ${error.message}`);
    }
  }

  // 🔧 CLEANUP TEMPORARY FILES
  async cleanupTempFiles(downloadFolder, maxAgeHours = 24) {
    try {
      if (fs.existsSync(downloadFolder)) {
        const stats = fs.statSync(downloadFolder);
        const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        
        if (ageHours > maxAgeHours) {
          fs.rmSync(downloadFolder, { recursive: true, force: true });
          console.log(`🗑️ Cleaned up old temp folder: ${downloadFolder}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Error cleaning up temp files:', error);
    }
  }

  // 🔧 GET SERVICE STATUS
  getStatus() {
    return {
      service: 'Radiant Bridge Service',
      platform: os.platform(),
      tempPath: this.tempDownloadPath,
      radiantViewer: {
        detected: this.radiantPaths.available.length > 0,
        paths: this.radiantPaths.available,
        primary: this.radiantPaths.primary
      },
      orthanc: {
        configured: true,
        baseUrl: this.orthancConfig.baseUrl
      },
      ready: this.radiantPaths.primary !== null
    };
  }
}

export default RadiantBridgeService;