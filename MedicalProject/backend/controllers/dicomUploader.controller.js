import axios from 'axios';
import sharp from 'sharp';
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';
import CloudflareR2ZipService from '../services/wasabi.zip.service.js';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { Buffer } from 'buffer';
import FormData from 'form-data';

// 🐍 PYTHON DICOM SERVER URL
const PYTHON_DICOM_SERVER = process.env.PYTHON_DICOM_SERVER || 'http://206.189.139.34:8765';

// 🔧 NEW: Convert images using Python DICOM server
const convertImagesToDicomViaPython = async (files, metadata) => {
    try {
        console.log(`🐍 Calling Python DICOM server at: ${PYTHON_DICOM_SERVER}`);
        
        // Create form data for Python server
        const formData = new FormData();
        
        // Add metadata
        Object.keys(metadata).forEach(key => {
            formData.append(key, metadata[key] || '');
        });
        
        // Add image files
        files.forEach((file, index) => {
            formData.append('images', file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype
            });
        });
        
        console.log(`📤 Sending ${files.length} files to Python server...`);
        
        // Call Python server
        const response = await axios.post(`${PYTHON_DICOM_SERVER}/convert-to-dicom`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Type': 'multipart/form-data'
            },
            timeout: 300000, // 5 minutes timeout
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        if (!response.data.success) {
            throw new Error(`Python server error: ${response.data.error}`);
        }
        
        console.log(`✅ Python server converted ${response.data.total_files} files`);
        
        // Convert base64 buffers back to Buffer objects
        const dicomResults = response.data.files.map((file, index) => ({
            dicomFile: Buffer.from(file.buffer, 'base64'),
            sopInstanceUID: file.sop_instance_uid,
            originalFilename: file.original_filename,
            imageInfo: {
                width: 'unknown', // Python server doesn't return this
                height: 'unknown',
                size: file.size
            },
            status: 'success'
        }));
        
        return dicomResults;
        
    } catch (error) {
        console.error('❌ Error calling Python DICOM server:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            throw new Error('Python DICOM server is not running. Please start the Python server on port 8765.');
        }
        
        throw new Error(`Python DICOM conversion failed: ${error.message}`);
    }
};

// 🔧 SIMPLIFIED: Create ZIP with DICOM files from Python
const createZipFromDicomFiles = async (dicomResults, metadata) => {
    try {
        console.log('📦 Creating ZIP file from Python DICOM files...');
        
        return new Promise((resolve, reject) => {
            const archive = archiver('zip', {
                zlib: { level: 6 }
            });
            
            const chunks = [];
            
            archive.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            archive.on('end', () => {
                const zipBuffer = Buffer.concat(chunks);
                console.log(`✅ ZIP created successfully, size: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                resolve(zipBuffer);
            });
            
            archive.on('error', (err) => {
                console.error('❌ ZIP creation error:', err);
                reject(err);
            });
            
            let filesAdded = 0;
            
            // Add each DICOM file to the ZIP
            dicomResults.forEach((result, index) => {
                if (result.status === 'success') {
                    try {
                        console.log(`📄 Adding DICOM file ${index + 1} to ZIP (${result.imageInfo.size} bytes)...`);
                        
                        // Verify the file buffer is valid
                        if (!result.dicomFile || result.dicomFile.length === 0) {
                            throw new Error(`DICOM file ${index + 1} is empty or invalid`);
                        }
                        
                        // Use the DICOM file from Python server
                        archive.append(result.dicomFile, { 
                            name: `image_${index + 1}_${result.sopInstanceUID}.dcm` 
                        });
                        
                        filesAdded++;
                        console.log(`✅ Added DICOM file ${index + 1} to ZIP successfully`);
                        
                    } catch (err) {
                        console.error(`❌ Failed to add DICOM file ${index + 1} to ZIP:`, err.message);
                    }
                }
            });
            
            if (filesAdded === 0) {
                return reject(new Error('No valid DICOM files to add to ZIP'));
            }
            
            console.log(`📋 Finalizing ZIP with ${filesAdded} DICOM files...`);
            archive.finalize();
        });
        
    } catch (error) {
        console.error('❌ Error creating ZIP:', error);
        throw new Error(`Failed to create ZIP: ${error.message}`);
    }
};

// 🔧 UPDATED: uploadImages function in dicomUploader.controller.js
export const uploadImages = async (req, res) => {
    console.log('🔍 ===== DICOM UPLOADER CALLED (PYTHON VERSION) =====');
    
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No images provided'
            });
        }
        
        const {
            patientName, patientId, patientBirthDate, patientSex,
            studyDescription, seriesDescription, modality, bodyPartExamined,
            referringPhysician, accessionNumber, institutionName, institutionAddress,
            labId, clinicalHistory
        } = req.body;
        
        console.log(`📊 Processing ${req.files.length} image(s) for patient: ${patientName}`);
        
        // 🔧 STEP 1: Always create new patient record (no lookup)
        console.log(`👤 Creating new patient record (no lookup): ${patientName}`);
        const patient = await Patient.create({
            mrn: patientId || `MRN_${Date.now()}`,
            patientID: patientId || `PID_${Date.now()}`,
            patientNameRaw: patientName || 'UNKNOWN PATIENT',
            firstName: patientName?.split(' ')[0] || '',
            lastName: patientName?.split(' ').slice(1).join(' ') || '',
            gender: patientSex || 'O',
            dateOfBirth: patientBirthDate || null,
            computed: {
                fullName: patientName || ''
            }
        });
        
        // 🔧 STEP 2: Find or create lab
        let lab;
        if (labId && labId !== 'select_lab') {
            lab = await Lab.findById(labId);
        }
        
        if (!lab) {
            lab = await Lab.findOne({ identifier: 'XCENTIC_LAB' });
            if (!lab) {
                lab = await Lab.create({
                    name: 'XCENTIC Upload Lab',
                    identifier: 'XCENTIC_LAB',
                    isActive: true,
                    notes: 'Auto-created for image uploads'
                });
            }
        }
        
        console.log(`🏥 Using lab: ${lab.name}`);
        
        // 🔧 STEP 3: Generate study metadata
        const orthancStudyId = uuidv4();
        const studyInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
        const seriesInstanceUID = `1.2.826.0.1.3680043.8.498.${Date.now()}.series.${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`🔑 Generated Orthanc Study ID: ${orthancStudyId}`);
        console.log(`🔑 Generated Study Instance UID: ${studyInstanceUID}`);
        
        // 🔧 FIXED: Generate proper study date and time in DICOM format
        const now = new Date();
        const studyDate = new Date(now.toDateString()); // Start of day for consistent date handling
        const studyTime = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS format like Orthanc
        
        console.log(`📅 Study Date: ${studyDate.toISOString()}`);
        console.log(`⏰ Study Time: ${studyTime}`);
        
        const metadata = {
            patientName: patientName || 'UNKNOWN^PATIENT',
            patientId: patientId || 'UNKNOWN',
            patientBirthDate: patientBirthDate || '',
            patientSex: patientSex || 'O',
            studyInstanceUID: studyInstanceUID,
            seriesInstanceUID: seriesInstanceUID,
            studyDescription: studyDescription || 'N/A',  // 🔧 SIMPLIFIED: Remove "Uploaded" prefix
            seriesDescription: seriesDescription || 'n/a',
            modality: modality || 'CT',
            bodyPartExamined: bodyPartExamined || '',
            referringPhysician: referringPhysician || '',
            accessionNumber: accessionNumber || `ACCNO${Date.now()}`, // 🔧 FIXED: Use ACCNO prefix like Orthanc
            institutionName: institutionName || 'XCENTIC Medical Center',
            institutionAddress: institutionAddress || '',
            manufacturer: 'XCENTIC',
            labIdentifier: lab.identifier,
            orthancStudyId,
            // 🆕 NEW: Add proper date formatting for DICOM
            studyDate: studyDate.toISOString().slice(0, 10).replace(/-/g, ''), // YYYYMMDD format
            studyTime: studyTime // HHMMSS format
        };
        
        // 🔧 STEP 4: Convert images using Python DICOM server
        console.log('🐍 Converting images to DICOM using Python server...');
        const dicomResults = await convertImagesToDicomViaPython(req.files, metadata);
        
        const uploadResults = dicomResults.map((result, index) => ({
            filename: result.originalFilename,
            sopInstanceUID: result.sopInstanceUID,
            imageInfo: result.imageInfo,
            status: result.status
        }));
        
        console.log(`✅ Successfully converted ${dicomResults.length} images to DICOM`);
        
        // 🔧 STEP 5: Create ZIP file
        const successfulResults = dicomResults.filter(r => r.status === 'success');
        let zipBuffer = null;
        let zipFileName = null;
        
        if (successfulResults.length > 0) {
            console.log(`📦 Creating ZIP file for ${successfulResults.length} DICOM files...`);
            zipBuffer = await createZipFromDicomFiles(successfulResults, metadata);
            zipFileName = `study_${orthancStudyId}_${Date.now()}.zip`;
        }
        
        // 🔧 STEP 6: Create study in database
        const studyData = {
            studyInstanceUID,
            orthancStudyID: orthancStudyId,
            patient: patient._id,
            patientId: patient.patientID,
            sourceLab: lab._id,
            
            // 🔧 CRITICAL: Use proper date format that matches Orthanc studies
            studyDate: studyDate, // This should be a proper Date object, not string
            studyTime: studyTime, // HHMMSS format string like "134913"
            
            modalitiesInStudy: [metadata.modality],
            examDescription: metadata.studyDescription,
            institutionName: metadata.institutionName,
            workflowStatus: 'new_study_received',
            seriesCount: 1,
            instanceCount: uploadResults.filter(r => r.status === 'success').length,
            seriesImages: `1/${uploadResults.filter(r => r.status === 'success').length}`,
            accessionNumber: metadata.accessionNumber,
            
            patientInfo: {
                patientID: patient.patientID,
                patientName: patient.patientNameRaw,
                gender: patient.gender,
                // 🔧 FIXED: Proper date format for patient birth date
                age: patientBirthDate ? calculateAge(new Date(patientBirthDate)) : undefined
            },
            
            referringPhysicianName: metadata.referringPhysician,
            caseType: 'routine',
            
            clinicalHistory: {
                clinicalHistory: clinicalHistory || '',
                dataSource: 'user_input',
                lastModifiedAt: new Date(),
                
            },
            
            storageInfo: {
                type: 'direct_upload',
                orthancStudyId: orthancStudyId,
                receivedAt: new Date(),
                isUploadedStudy: true,
                uploadMethod: 'image_to_dicom_python_pydicom',
                originalFiles: uploadResults.map(r => ({
                    filename: r.filename,
                    status: r.status,
                    sopInstanceUID: r.sopInstanceUID
                }))
            },
            
            equipment: {
                manufacturer: 'XCENTIC',
                model: 'Image Uploader v2.0', // 🔧 UPDATED: Version bump
                stationName: 'XCENTIC_UPLOAD_STATION',
                softwareVersion: 'v2.0'
            },
            
            statusHistory: [{
                status: 'new_study_received',
                changedAt: new Date(),
                note: `Study created from ${uploadResults.filter(r => r.status === 'success').length} uploaded image(s). Lab: ${lab.name}. Method: Python pydicom server.`
            }]
        };
        
        const dicomStudy = await DicomStudy.create(studyData);
        console.log(`✅ Study saved with ID: ${dicomStudy._id}`);
        
        // 🔧 STEP 7: Upload ZIP to Cloudflare R2
        const successfulUploads = uploadResults.filter(r => r.status === 'success').length;
        let zipUploadResult = null;
        
        if (successfulUploads > 0 && zipBuffer) {
            try {
                console.log(`📦 Uploading ZIP to Cloudflare R2...`);
                
                zipUploadResult = await CloudflareR2ZipService.uploadZipBuffer({
                    buffer: zipBuffer,
                    fileName: zipFileName,
                    studyDatabaseId: dicomStudy._id,
                    studyInstanceUID: studyInstanceUID,
                    instanceCount: successfulUploads,
                    seriesCount: 1
                });
                
                console.log(`📦 ZIP uploaded successfully to R2:`, zipUploadResult);
                
                // Update study with ZIP info
                await DicomStudy.findByIdAndUpdate(dicomStudy._id, {
                    'preProcessedDownload.zipStatus': 'completed',
                    'preProcessedDownload.zipUrl': zipUploadResult.zipUrl,
                    'preProcessedDownload.zipFileName': zipFileName,
                    'preProcessedDownload.zipSizeMB': (zipBuffer.length / 1024 / 1024),
                    'preProcessedDownload.zipCreatedAt': new Date(),
                    'preProcessedDownload.zipKey': zipUploadResult.zipKey
                });
                
            } catch (zipError) {
                console.error(`❌ Failed to upload ZIP to R2:`, zipError.message);
            }
        }
        
        const successCount = uploadResults.filter(r => r.status === 'success').length;
        const failureCount = uploadResults.filter(r => r.status === 'failed').length;
        
        res.status(201).json({
            success: true,
            message: `Images uploaded successfully using Python DICOM server. ${successCount} succeeded, ${failureCount} failed.`,
            data: {
                studyId: dicomStudy._id,
                studyInstanceUID: studyInstanceUID,
                orthancStudyId: orthancStudyId,
                patientId: patient.patientID,
                patientName: patient.patientNameRaw,
                accessionNumber: metadata.accessionNumber,
                uploadResults: uploadResults,
                successCount: successCount,
                failureCount: failureCount,
                totalProcessed: req.files.length,
                zipUploaded: !!zipUploadResult,
                zipInfo: zipUploadResult ? {
                    fileName: zipFileName,
                    sizeMB: (zipBuffer.length / 1024 / 1024).toFixed(2),
                    url: zipUploadResult.zipUrl
                } : null,
                pythonServerUsed: true
            }
        });
        
    } catch (error) {
        console.error('❌ Error in image upload:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload images',
            error: error.message
        });
    }
};

// 🔧 HELPER: Calculate age from birth date
function calculateAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    return `${age}Y`;
}

// Keep existing functions unchanged...
export const getAvailableLabs = async (req, res) => {
    try {
        const labs = await Lab.find({ isActive: true })
            .select('_id name identifier')
            .sort({ name: 1 });
        
        res.json({
            success: true,
            data: labs
        });
        
    } catch (error) {
        console.error('❌ Error fetching labs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch labs',
            error: error.message
        });
    }
};

export const getUploadStatus = async (req, res) => {
    try {
        const recentUploads = await DicomStudy.find({
            'storageInfo.isUploadedStudy': true
        })
        .populate('patient', 'patientNameRaw patientID')
        .populate('sourceLab', 'name identifier')
        .sort({ createdAt: -1 })
        .limit(10)
        .select('_id studyInstanceUID patientInfo workflowStatus createdAt storageInfo preProcessedDownload');
        
        res.json({
            success: true,
            data: {
                recentUploads: recentUploads,
                totalUploaded: await DicomStudy.countDocuments({
                    'storageInfo.isUploadedStudy': true
                })
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching upload status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch upload status',
            error: error.message
        });
    }
};