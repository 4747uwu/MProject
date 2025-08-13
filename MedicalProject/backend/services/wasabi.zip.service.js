import axios from 'axios';
import { 
    HeadBucketCommand, 
    CreateBucketCommand, 
    PutObjectCommand, 
    ListObjectsV2Command,
    DeleteObjectCommand,
    PutBucketCorsCommand,
    PutBucketPolicyCommand
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { r2Client, r2Config, getR2PublicUrl, getCDNOptimizedUrl } from '../config/cloudflare-r2.js';
import DicomStudy from '../models/dicomStudyModel.js';

const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

class CloudflareR2ZipService {
    constructor() {
        this.r2 = r2Client;
        this.zipJobs = new Map();
        this.processing = new Set();
        this.nextJobId = 1;
        this.isProcessing = false;
        this.concurrency = 5;
        this.zipBucket = r2Config.zipBucket; // 'studyzip'
        
        console.log(`📦 R2 ZIP Service initialized for bucket: ${this.zipBucket}`);
        console.log(`🌐 Public URL: ${r2Config.publicUrlPattern}`);
    }

    // Add ZIP creation job to queue
    async addZipJob(studyData) {
        const jobId = this.nextJobId++;
        const job = {
            id: jobId,
            type: 'create-study-zip-r2',
            data: studyData,
            status: 'waiting',
            createdAt: new Date(),
            progress: 0,
            result: null,
            error: null
        };
        
        this.zipJobs.set(jobId, job);
        console.log(`📦 R2 ZIP Creation Job ${jobId} queued for study: ${studyData.orthancStudyId}`);
        
        if (!this.isProcessing) {
            this.startZipProcessing();
        }
        
        return job;
    }

    // Start processing ZIP jobs
    async startZipProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        console.log('🚀 Cloudflare R2 ZIP Creation Queue processor started');
        
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
        console.log('⏹️ Cloudflare R2 ZIP Creation Queue processor stopped');
    }

    // Process individual ZIP job
    async processZipJob(job) {
        this.processing.add(job.id);
        job.status = 'active';
        
        console.log(`🚀 Processing R2 ZIP Job ${job.id} for study: ${job.data.orthancStudyId}`);
        
        try {
            job.result = await this.createAndUploadStudyZipToR2(job);
            job.status = 'completed';
            console.log(`✅ R2 ZIP Job ${job.id} completed successfully`);
            
        } catch (error) {
            job.error = error.message;
            job.status = 'failed';
            console.error(`❌ R2 ZIP Job ${job.id} failed:`, error.message);
        } finally {
            this.processing.delete(job.id);
        }
    }

    // Create and upload study ZIP to Cloudflare R2
    async createAndUploadStudyZipToR2(job) {
        const { orthancStudyId, studyDatabaseId, studyInstanceUID } = job.data;
        const startTime = Date.now();
        
        try {
            console.log(`[R2 ZIP] 📦 Creating ZIP for study: ${orthancStudyId}`);
            
            // Update study status to processing
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, {
                'preProcessedDownload.zipStatus': 'processing',
                'preProcessedDownload.zipJobId': job.id.toString(),
                'preProcessedDownload.zipMetadata.createdBy': 'cloudflare-r2-service',
                'preProcessedDownload.zipMetadata.storageProvider': 'cloudflare-r2'
            });
            
            job.progress = 20;
            
            // Get study metadata for filename
            const metadataResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}`, {
                headers: { 'Authorization': orthancAuth },
                timeout: 50000
            });
            
            const studyMetadata = metadataResponse.data;
            const patientName = (studyMetadata.PatientMainDicomTags?.PatientName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
            const patientId = (studyMetadata.PatientMainDicomTags?.PatientID || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
            const studyDate = studyMetadata.MainDicomTags?.StudyDate || '';
            
            // Create ZIP filename with timestamp
            const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const zipFileName = `Study_${patientName}_${patientId}_${studyDate}_${orthancStudyId}_${timestamp}.zip`;
            
            console.log(`[R2 ZIP] 📂 Creating ZIP file: ${zipFileName}`);
            
            job.progress = 40;
            
            // Get study archive from Orthanc
            const archiveResponse = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}/archive`, {
                headers: { 'Authorization': orthancAuth },
                responseType: 'stream',
                timeout: 1000000 // 10 minutes for large studies
            });
            
            job.progress = 60;
            
            // Upload directly to Cloudflare R2
            const r2Result = await this.uploadZipToR2(archiveResponse.data, zipFileName, {
                studyInstanceUID,
                orthancStudyId,
                patientId,
                patientName
            });
            
            job.progress = 90;
            
            const processingTime = Date.now() - startTime;
            const zipSizeMB = Math.round((r2Result.size || 0) / 1024 / 1024 * 100) / 100;
            
            // Generate CDN-optimized URLs
            const cdnUrl = await getCDNOptimizedUrl(r2Result.key, {
                filename: zipFileName,
                contentType: 'application/zip',
                cacheControl: true
            });
            
            const publicUrl = getR2PublicUrl(r2Result.key, r2Config.features.enableCustomDomain);
            
            // Update study with R2 ZIP URL
            const updateData = {
                'preProcessedDownload.zipUrl': cdnUrl, // Use CDN URL as primary
                'preProcessedDownload.zipPublicUrl': publicUrl, // Store public URL as backup
                'preProcessedDownload.zipFileName': zipFileName,
                'preProcessedDownload.zipSizeMB': zipSizeMB,
                'preProcessedDownload.zipCreatedAt': new Date(),
                'preProcessedDownload.zipStatus': 'completed',
                'preProcessedDownload.zipExpiresAt': new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days (R2 has generous limits)
                'preProcessedDownload.zipBucket': this.zipBucket,
                'preProcessedDownload.zipKey': r2Result.key,
                'preProcessedDownload.zipMetadata': {
                    orthancStudyId,
                    instanceCount: studyMetadata.Instances?.length || 0,
                    seriesCount: studyMetadata.Series?.length || 0,
                    compressionRatio: 0,
                    processingTimeMs: processingTime,
                    createdBy: 'cloudflare-r2-service',
                    storageProvider: 'cloudflare-r2',
                    r2Key: r2Result.key,
                    r2Bucket: this.zipBucket,
                    cdnEnabled: true,
                    customDomain: r2Config.features.enableCustomDomain
                }
            };
            
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, updateData);
            
            job.progress = 100;
            
            console.log(`[R2 ZIP] ✅ ZIP created and uploaded: ${zipSizeMB}MB in ${processingTime}ms`);
            console.log(`[R2 ZIP] 🌐 CDN URL: ${cdnUrl}`);
            console.log(`[R2 ZIP] 📡 Public URL: ${publicUrl}`);
            
            return {
                success: true,
                zipUrl: cdnUrl,
                zipPublicUrl: publicUrl,
                zipFileName,
                zipSizeMB,
                processingTime,
                r2Key: r2Result.key,
                r2Bucket: this.zipBucket,
                cdnEnabled: true,
                storageProvider: 'cloudflare-r2'
            };
            
        } catch (error) {
            console.error(`[R2 ZIP] ❌ Failed to create ZIP:`, error);
            
            // Update study with failed status
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, {
                'preProcessedDownload.zipStatus': 'failed',
                'preProcessedDownload.zipMetadata.error': error.message,
                'preProcessedDownload.zipMetadata.storageProvider': 'cloudflare-r2'
            });
            
            throw error;
        }
    }

    // ✅ FIXED: Upload ZIP stream to Cloudflare R2
    async uploadZipToR2(zipStream, fileName, metadata) {
        const year = new Date().getFullYear();
        const key = `studies/${year}/${fileName}`;
        
        console.log(`[R2] 📤 Uploading to bucket: ${this.zipBucket}, key: ${key}`);
        
        try {
            const upload = new Upload({
                client: this.r2,
                params: {
                    Bucket: this.zipBucket,
                    Key: key,
                    Body: zipStream,
                    ContentType: 'application/zip',
                    
                    // ✅ R2-optimized headers
                    ContentDisposition: `attachment; filename="${fileName}"`,
                    CacheControl: `public, max-age=${r2Config.cdnSettings.cacheMaxAge}, s-maxage=${r2Config.cdnSettings.edgeCacheMaxAge}`,
                    
                    // R2 metadata
                    Metadata: {
                        'study-instance-uid': metadata.studyInstanceUID || '',
                        'orthanc-study-id': metadata.orthancStudyId || '',
                        'patient-id': metadata.patientId || '',
                        'patient-name': metadata.patientName || '',
                        'created-at': new Date().toISOString(),
                        'service-version': 'cloudflare-r2-v1',
                        'storage-provider': 'cloudflare-r2',
                        'cdn-enabled': 'true',
                        'bucket-name': this.zipBucket
                    },
                    
                    StorageClass: 'STANDARD'
                },
                
                // Configure multipart upload for R2
                partSize: 10 * 1024 * 1024, // 10MB per part
                leavePartsOnError: false,
                queueSize: 4
            });

            // Track upload progress
            upload.on('httpUploadProgress', (progress) => {
                if (progress.total) {
                    const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                    console.log(`[R2] 📊 Upload progress: ${percentComplete}% (${this.formatBytes(progress.loaded)}/${this.formatBytes(progress.total)})`);
                }
            });

            const result = await upload.done();
            
            // ✅ FIXED: Generate correct R2 URLs
            const publicUrl = getR2PublicUrl(key);
            const cdnUrl = getCDNOptimizedUrl(key, {
                filename: fileName,
                contentType: 'application/zip',
                r2Optimize: true
            });
            
            console.log(`[R2] ✅ Upload completed`);
            console.log(`[R2] 📡 Public URL: ${publicUrl}`);
            console.log(`[R2] 🚀 CDN URL: ${cdnUrl}`);
            
            return {
                url: cdnUrl,        // Primary CDN URL
                publicUrl: publicUrl, // Direct R2 URL
                key: key,
                bucket: this.zipBucket,
                etag: result.ETag,
                size: 0 // Will be updated if needed
            };
            
        } catch (error) {
            console.error(`[R2] ❌ Upload failed:`, error);
            throw new Error(`Cloudflare R2 upload failed: ${error.message}`);
        }
    }

    // Create R2 bucket if it doesn't exist
    async ensureR2Bucket() {
        try {
            // Check if bucket exists
            await this.r2.send(new HeadBucketCommand({ Bucket: this.zipBucket }));
            console.log(`✅ R2 ZIP Bucket ${this.zipBucket} exists`);
            return true;
        } catch (error) {
            if (error.$metadata?.httpStatusCode === 404) {
                console.log(`📦 R2 Bucket ${this.zipBucket} not found - it should be created via Cloudflare dashboard`);
                console.log(`🌐 Please create bucket at: https://dash.cloudflare.com/r2`);
                return false;
            } else {
                console.error(`❌ Error checking R2 ZIP bucket ${this.zipBucket}:`, error.message);
                throw error;
            }
        }
    }

    // Set up CORS for R2 bucket
    async setupR2BucketCORS() {
        try {
            const corsParams = {
                Bucket: this.zipBucket,
                CORSConfiguration: {
                    CORSRules: [
                        {
                            AllowedHeaders: ['*'],
                            AllowedMethods: ['GET', 'HEAD'],
                            AllowedOrigins: ['*'],
                            ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
                            MaxAgeSeconds: 3600
                        }
                    ]
                }
            };
            
            await this.r2.send(new PutBucketCorsCommand(corsParams));
            console.log(`✅ R2 bucket CORS configured`);
        } catch (error) {
            console.error(`❌ Error setting up R2 CORS:`, error.message);
        }
    }

    // Set up public access for R2 bucket
    async setupR2PublicAccess() {
        try {
            const policyDocument = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Sid: 'PublicReadGetObject',
                        Effect: 'Allow',
                        Principal: '*',
                        Action: 's3:GetObject',
                        Resource: `arn:aws:s3:::${this.zipBucket}/*`
                    }
                ]
            };
            
            const policyParams = {
                Bucket: this.zipBucket,
                Policy: JSON.stringify(policyDocument)
            };
            
            await this.r2.send(new PutBucketPolicyCommand(policyParams));
            console.log(`✅ R2 bucket public access configured`);
        } catch (error) {
            console.error(`❌ Error setting up R2 public access:`, error.message);
        }
    }

    // Get R2 storage statistics
    async getR2StorageStats() {
        try {
            console.log('📊 Getting R2 storage statistics...');
            
            const listParams = {
                Bucket: this.zipBucket,
                Prefix: 'studies/',
                MaxKeys: 1000
            };

            const result = await this.r2.send(new ListObjectsV2Command(listParams));
            
            const files = result.Contents || [];
            const totalSize = files.reduce((sum, file) => sum + (file.Size || 0), 0);
            const fileCount = files.length;

            // Group by year/month for statistics
            const groupedStats = {};
            files.forEach(file => {
                const pathParts = file.Key.split('/');
                if (pathParts.length >= 3) {
                    const year = pathParts[1];
                    const month = new Date(file.LastModified).getMonth() + 1;
                    const yearMonth = `${year}-${month.toString().padStart(2, '0')}`;
                    
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
                storageProvider: 'cloudflare-r2',
                cdnEnabled: true,
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
                generatedAt: new Date(),
                features: {
                    cdnEnabled: r2Config.features.enableCaching,
                    customDomain: r2Config.features.enableCustomDomain,
                    publicAccess: r2Config.features.enablePublicAccess
                }
            };

        } catch (error) {
            console.error('❌ Error getting R2 storage statistics:', error);
            throw error;
        }
    }

    // Cleanup expired ZIPs from R2
    async cleanupExpiredZips() {
        try {
            console.log('🧹 Starting R2 ZIP cleanup process...');
            
            // Find expired studies in database
            const expiredStudies = await DicomStudy.find({
                'preProcessedDownload.zipExpiresAt': { $lt: new Date() },
                'preProcessedDownload.zipStatus': 'completed',
                'preProcessedDownload.zipUrl': { $exists: true },
                'preProcessedDownload.zipMetadata.storageProvider': 'cloudflare-r2'
            }).select('preProcessedDownload orthancStudyID').lean();

            let cleanedCount = 0;
            let failedCount = 0;

            for (const study of expiredStudies) {
                try {
                    const zipInfo = study.preProcessedDownload;
                    
                    // Use stored key or extract from URL
                    let key = zipInfo.zipKey || zipInfo.zipMetadata?.r2Key;
                    
                    if (!key && zipInfo.zipUrl) {
                        // Extract key from R2 URL
                        const url = new URL(zipInfo.zipUrl);
                        key = url.pathname.substring(1); // Remove leading slash
                    }
                    
                    if (!key) {
                        // Fallback: construct key from filename
                        const year = new Date(zipInfo.zipCreatedAt).getFullYear();
                        key = `studies/${year}/${zipInfo.zipFileName}`;
                    }

                    // Delete from R2
                    await this.r2.send(new DeleteObjectCommand({
                        Bucket: this.zipBucket,
                        Key: key
                    }));

                    // Update database
                    await DicomStudy.findByIdAndUpdate(study._id, {
                        $unset: {
                            'preProcessedDownload.zipUrl': 1,
                            'preProcessedDownload.zipPublicUrl': 1,
                            'preProcessedDownload.zipFileName': 1,
                            'preProcessedDownload.zipSizeMB': 1,
                            'preProcessedDownload.zipKey': 1
                        },
                        'preProcessedDownload.zipStatus': 'expired'
                    });

                    cleanedCount++;
                    console.log(`🗑️ Cleaned expired R2 ZIP for study: ${study.orthancStudyID}`);

                } catch (error) {
                    failedCount++;
                    console.error(`❌ Failed to cleanup R2 ZIP for study ${study.orthancStudyID}:`, error.message);
                }
            }

            console.log(`✅ R2 ZIP cleanup completed: ${cleanedCount} cleaned, ${failedCount} failed`);
            
            return {
                success: true,
                cleanedCount,
                failedCount,
                totalProcessed: expiredStudies.length,
                storageProvider: 'cloudflare-r2'
            };

        } catch (error) {
            console.error('❌ Error during R2 ZIP cleanup:', error);
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
            isProcessing: this.isProcessing,
            storageProvider: 'cloudflare-r2'
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

export default new CloudflareR2ZipService();