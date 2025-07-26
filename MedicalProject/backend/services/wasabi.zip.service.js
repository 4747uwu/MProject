import axios from 'axios';
import { 
    HeadBucketCommand, 
    CreateBucketCommand, 
    PutObjectCommand, 
    ListObjectsV2Command 
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { wasabiS3 } from '../config/wasabi.js';
import DicomStudy from '../models/dicomStudyModel.js';
import crypto from 'crypto';

const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

class ZipCreationService {
    constructor() {
        this.s3 = wasabiS3; // Use the same S3 client from config
        this.zipJobs = new Map();
        this.processing = new Set();
        this.nextJobId = 1;
        this.isProcessing = false;
        this.concurrency = 3;
        this.zipBucket = 'studyzip' || 'medical-dicom-zips';
    }

    // Add ZIP creation job to queue
    async addZipJob(studyData) {
        const jobId = this.nextJobId++;
        const job = {
            id: jobId,
            type: 'create-study-zip',
            data: studyData,
            status: 'waiting',
            createdAt: new Date(),
            progress: 0,
            result: null,
            error: null
        };
        
        this.zipJobs.set(jobId, job);
        console.log(`📦 ZIP Creation Job ${jobId} queued for study: ${studyData.orthancStudyId}`);
        
        if (!this.isProcessing) {
            this.startZipProcessing();
        }
        
        return job;
    }

    // Start processing ZIP jobs
    async startZipProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        console.log('🚀 ZIP Creation Queue processor started');
        
        while (this.getWaitingZipJobs().length > 0 || this.processing.size > 0) {
            while (this.processing.size < this.concurrency && this.getWaitingZipJobs().length > 0) {
                const waitingJobs = this.getWaitingZipJobs();
                if (waitingJobs.length > 0) {
                    const job = waitingJobs[0];
                    this.processZipJob(job);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        this.isProcessing = false;
        console.log('⏹️ ZIP Creation Queue processor stopped');
    }

    // Process individual ZIP job
    async processZipJob(job) {
        this.processing.add(job.id);
        job.status = 'active';
        
        console.log(`🚀 Processing ZIP Job ${job.id} for study: ${job.data.orthancStudyId}`);
        
        try {
            job.result = await this.createAndUploadStudyZip(job);
            job.status = 'completed';
            console.log(`✅ ZIP Job ${job.id} completed successfully`);
            
        } catch (error) {
            job.error = error.message;
            job.status = 'failed';
            console.error(`❌ ZIP Job ${job.id} failed:`, error.message);
        } finally {
            this.processing.delete(job.id);
        }
    }

    // Create and upload study ZIP to Wasabi (AWS SDK v3)
    async createAndUploadStudyZip(job) {
        const { orthancStudyId, studyDatabaseId, studyInstanceUID } = job.data;
        const startTime = Date.now();
        
        try {
            console.log(`[ZIP] 📦 Creating ZIP for study: ${orthancStudyId}`);
            
            // Update study status to processing
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, {
                'preProcessedDownload.zipStatus': 'processing',
                'preProcessedDownload.zipJobId': job.id.toString(),
                'preProcessedDownload.zipMetadata.createdBy': 'system'
            });
            
            // Get study metadata for filename
            const metadataResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}`, {
                headers: { 'Authorization': orthancAuth },
                timeout: 10000
            });
            
            const studyMetadata = metadataResponse.data;
            const patientName = (studyMetadata.PatientMainDicomTags?.PatientName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
            const patientId = (studyMetadata.PatientMainDicomTags?.PatientID || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
            const studyDate = studyMetadata.MainDicomTags?.StudyDate || '';
            
            // Create ZIP filename
            const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const zipFileName = `Study_${patientName}_${patientId}_${studyDate}_${orthancStudyId}_${timestamp}.zip`;
            
            console.log(`[ZIP] 📂 Creating ZIP file: ${zipFileName}`);
            
            // Get study archive from Orthanc
            const archiveResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}/archive`, {
                headers: { 'Authorization': orthancAuth },
                responseType: 'stream',
                timeout: 300000 // 5 minutes for large studies
            });
            
            // Upload directly to Wasabi using AWS SDK v3
            const wasabiResult = await this.uploadZipToWasabi(archiveResponse.data, zipFileName, {
                studyInstanceUID,
                orthancStudyId,
                patientId,
                patientName
            });
            
            const processingTime = Date.now() - startTime;
            const zipSizeMB = Math.round((wasabiResult.size || 0) / 1024 / 1024 * 100) / 100;
            
            // Update study with ZIP URL
            const updateData = {
                'preProcessedDownload.zipUrl': wasabiResult.url,
                'preProcessedDownload.zipFileName': zipFileName,
                'preProcessedDownload.zipSizeMB': zipSizeMB,
                'preProcessedDownload.zipCreatedAt': new Date(),
                'preProcessedDownload.zipStatus': 'completed',
                'preProcessedDownload.zipExpiresAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                'preProcessedDownload.zipMetadata': {
                    orthancStudyId,
                    instanceCount: studyMetadata.Instances?.length || 0,
                    seriesCount: studyMetadata.Series?.length || 0,
                    compressionRatio: 0,
                    processingTimeMs: processingTime,
                    createdBy: 'system'
                }
            };
            
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, updateData);
            
            console.log(`[ZIP] ✅ ZIP created and uploaded: ${zipSizeMB}MB in ${processingTime}ms`);
            
            return {
                success: true,
                zipUrl: wasabiResult.url,
                zipFileName,
                zipSizeMB,
                processingTime,
                wasabiKey: wasabiResult.key
            };
            
        } catch (error) {
            console.error(`[ZIP] ❌ Failed to create ZIP:`, error);
            
            // Update study with failed status
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, {
                'preProcessedDownload.zipStatus': 'failed',
                'preProcessedDownload.zipMetadata.error': error.message
            });
            
            throw error;
        }
    }

    // 🔧 Upload ZIP stream to Wasabi (AWS SDK v3 with multipart upload)
    async uploadZipToWasabi(zipStream, fileName, metadata) {
        const key = `studies/${new Date().getFullYear()}/${fileName}`;
        
        console.log(`[Wasabi] 📤 Uploading to: ${this.zipBucket}/${key}`);
        
        try {
            // Use Upload class for multipart upload (better for large files)
            const upload = new Upload({
                client: this.s3,
                params: {
                    Bucket: this.zipBucket,
                    Key: key,
                    Body: zipStream,
                    ContentType: 'application/zip',
                    Metadata: {
                        'study-instance-uid': metadata.studyInstanceUID || '',
                        'orthanc-study-id': metadata.orthancStudyId || '',
                        'patient-id': metadata.patientId || '',
                        'patient-name': metadata.patientName || '',
                        'created-at': new Date().toISOString(),
                        'service-version': 'aws-sdk-v3'
                    },
                    ServerSideEncryption: 'AES256',
                    StorageClass: 'STANDARD'
                },
                // Configure multipart upload
                partSize: 5 * 1024 * 1024, // 5MB per part
                leavePartsOnError: false,
            });

            // Track upload progress
            upload.on('httpUploadProgress', (progress) => {
                if (progress.total) {
                    const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                    console.log(`[Wasabi] 📊 Upload progress: ${percentComplete}% (${this.formatBytes(progress.loaded)}/${this.formatBytes(progress.total)})`);
                }
            });

            const result = await upload.done();
            
            console.log(`[Wasabi] ✅ Upload completed: ${result.Location}`);
            
            return {
                url: result.Location,
                key: result.Key,
                bucket: result.Bucket,
                etag: result.ETag,
                size: 0 // Will be updated if needed
            };
            
        } catch (error) {
            console.error(`[Wasabi] ❌ Upload failed:`, error);
            throw new Error(`Wasabi upload failed: ${error.message}`);
        }
    }

    // 🔧 Create Wasabi bucket if it doesn't exist (AWS SDK v3)
    async ensureWasabiBucket() {
        try {
            // Check if bucket exists
            await this.s3.send(new HeadBucketCommand({ Bucket: this.zipBucket }));
            console.log(`✅ ZIP Bucket ${this.zipBucket} exists`);
        } catch (error) {
            if (error.$metadata?.httpStatusCode === 404) {
                console.log(`📦 Creating ZIP bucket: ${this.zipBucket}`);
                
                const createParams = {
                    Bucket: this.zipBucket
                };
                
                // Add region configuration for non-us-east-1 regions
                if (process.env.WASABI_REGION !== 'us-east-1') {
                    createParams.CreateBucketConfiguration = {
                        LocationConstraint: process.env.WASABI_REGION
                    };
                }
                
                await this.s3.send(new CreateBucketCommand(createParams));
                console.log(`✅ ZIP Bucket ${this.zipBucket} created`);
            } else {
                console.error(`❌ Error with ZIP bucket ${this.zipBucket}:`, error.message);
                throw error;
            }
        }
    }

    // 🔧 Get ZIP storage statistics (AWS SDK v3)
    async getZipStorageStats() {
        try {
            console.log('📊 Getting ZIP storage statistics...');
            
            const listParams = {
                Bucket: this.zipBucket,
                Prefix: 'studies/',
                MaxKeys: 1000
            };

            const result = await this.s3.send(new ListObjectsV2Command(listParams));
            
            const files = result.Contents || [];
            const totalSize = files.reduce((sum, file) => sum + (file.Size || 0), 0);
            const fileCount = files.length;

            // Group by year/month for statistics
            const groupedStats = {};
            files.forEach(file => {
                const pathParts = file.Key.split('/');
                if (pathParts.length >= 3) {
                    const year = pathParts[1];
                    const month = pathParts[2];
                    const yearMonth = `${year}-${month}`;
                    
                    if (!groupedStats[yearMonth]) {
                        groupedStats[yearMonth] = {
                            fileCount: 0,
                            totalSize: 0
                        };
                    }
                    
                    groupedStats[yearMonth].fileCount++;
                    groupedStats[yearMonth].totalSize += file.Size || 0;
                }
            });

            return {
                success: true,
                bucketName: this.zipBucket,
                summary: {
                    totalFiles: fileCount,
                    totalSize,
                    totalSizeFormatted: this.formatBytes(totalSize),
                    averageFileSize: fileCount > 0 ? Math.round(totalSize / fileCount) : 0,
                    averageFileSizeFormatted: fileCount > 0 ? this.formatBytes(Math.round(totalSize / fileCount)) : '0 Bytes'
                },
                monthlyStats: Object.keys(groupedStats).map(yearMonth => ({
                    period: yearMonth,
                    fileCount: groupedStats[yearMonth].fileCount,
                    totalSize: groupedStats[yearMonth].totalSize,
                    totalSizeFormatted: this.formatBytes(groupedStats[yearMonth].totalSize)
                })).sort((a, b) => b.period.localeCompare(a.period)),
                generatedAt: new Date()
            };

        } catch (error) {
            console.error('❌ Error getting ZIP storage statistics:', error);
            throw error;
        }
    }

    // 🔧 Cleanup expired ZIPs (AWS SDK v3)
    async cleanupExpiredZips() {
        try {
            console.log('🧹 Starting ZIP cleanup process...');
            
            // Find expired studies in database
            const expiredStudies = await DicomStudy.find({
                'preProcessedDownload.zipExpiresAt': { $lt: new Date() },
                'preProcessedDownload.zipStatus': 'completed',
                'preProcessedDownload.zipUrl': { $exists: true }
            }).select('preProcessedDownload orthancStudyID').lean();

            let cleanedCount = 0;
            let failedCount = 0;

            for (const study of expiredStudies) {
                try {
                    const zipInfo = study.preProcessedDownload;
                    
                    // Extract key from URL or use stored key
                    let key = zipInfo.zipFileName;
                    if (zipInfo.zipUrl) {
                        const urlParts = zipInfo.zipUrl.split('/');
                        key = urlParts.slice(-2).join('/'); // Get last two parts (year/filename)
                        key = `studies/${key}`;
                    }

                    // Delete from Wasabi
                    await this.s3.send(new DeleteObjectCommand({
                        Bucket: this.zipBucket,
                        Key: key
                    }));

                    // Update database
                    await DicomStudy.findByIdAndUpdate(study._id, {
                        $unset: {
                            'preProcessedDownload.zipUrl': 1,
                            'preProcessedDownload.zipFileName': 1,
                            'preProcessedDownload.zipSizeMB': 1
                        },
                        'preProcessedDownload.zipStatus': 'expired'
                    });

                    cleanedCount++;
                    console.log(`🗑️ Cleaned expired ZIP for study: ${study.orthancStudyID}`);

                } catch (error) {
                    failedCount++;
                    console.error(`❌ Failed to cleanup ZIP for study ${study.orthancStudyID}:`, error.message);
                }
            }

            console.log(`✅ ZIP cleanup completed: ${cleanedCount} cleaned, ${failedCount} failed`);
            
            return {
                success: true,
                cleanedCount,
                failedCount,
                totalProcessed: expiredStudies.length
            };

        } catch (error) {
            console.error('❌ Error during ZIP cleanup:', error);
            throw error;
        }
    }

    // Utility methods
    getWaitingZipJobs() {
        return Array.from(this.zipJobs.values()).filter(job => job.status === 'waiting');
    }

    getJob(jobId) {
        return this.zipJobs.get(jobId);
    }

    getAllJobs() {
        return Array.from(this.zipJobs.values());
    }

    getJobStats() {
        const jobs = this.getAllJobs();
        return {
            total: jobs.length,
            waiting: jobs.filter(j => j.status === 'waiting').length,
            active: jobs.filter(j => j.status === 'active').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            processing: this.processing.size,
            isProcessing: this.isProcessing
        };
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

export default new ZipCreationService();