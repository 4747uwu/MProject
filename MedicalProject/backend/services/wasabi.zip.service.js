import axios from 'axios';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import {
    HeadBucketCommand,
    CreateBucketCommand,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
    PutBucketCorsCommand,
    PutBucketPolicyCommand,
    HeadObjectCommand // ✅ ADD: For getting file size
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
        
        // ✅ OPTIMIZED: Start with a safe concurrency level
        this.concurrency = 4; 
        this.processingDelay = 2000; // ✅ INCREASED: 2 seconds between starting jobs
        this.zipBucket = r2Config.zipBucket;
        
        // ✅ ADD: Batch processing for instances
        this.instanceBatchSize = 20; // Process 20 instances concurrently
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds base delay
        
        console.log(`📦 R2 ZIP Service initialized (DECOUPLED MODE):`);
        console.log(`🔧 Concurrency: ${this.concurrency}`);
        console.log(`📦 Instance batch size: ${this.instanceBatchSize}`);
        console.log(`⏱️ Processing delay: ${this.processingDelay}ms`);
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

    // ✅ OPTIMIZED: Enhanced queue processing with resource monitoring
    async startZipProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        console.log('🚀 Cloudflare R2 ZIP Creation Queue processor started (HIGH LOAD MODE)');
        
        while (this.getWaitingZipJobs().length > 0 || this.processing.size > 0) {
            // ✅ MEMORY CHECK: Pause if memory usage is too high
            const memUsage = process.memoryUsage();
            const memUsedGB = memUsage.heapUsed / (1024 * 1024 * 1024);
            
            if (memUsage.heapUsed > this.maxMemoryUsage) {
                console.warn(`⚠️ Memory pressure: ${memUsedGB.toFixed(2)}GB, pausing for 30s`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
            }

            // ✅ SINGLE JOB: Only process one at a time
            if (this.processing.size === 0 && this.getWaitingZipJobs().length > 0) {
                const waitingJobs = this.getWaitingZipJobs();
                const job = waitingJobs[0];
                
                console.log(`📊 System Status: Memory: ${memUsedGB.toFixed(2)}GB, Queue: ${waitingJobs.length}`);
                this.processZipJob(job);
            }
            
            // ✅ LONGER DELAY: Allow system recovery
            await new Promise(resolve => setTimeout(resolve, this.processingDelay));
        }
        
        this.isProcessing = false;
        console.log('⏹️ Cloudflare R2 ZIP Creation Queue processor stopped');
    }

    // ✅ ENHANCED: Better error handling in job processing
    async processZipJob(job) {
        this.processing.add(job.id);
        job.status = 'active';
        
        const memUsage = process.memoryUsage();
        const memUsedGB = memUsage.heapUsed / (1024 * 1024 * 1024);
        
        console.log(`🚀 Processing R2 ZIP Job ${job.id} (Memory: ${memUsedGB.toFixed(2)}GB)`);
        
        try {
            job.result = await this.createAndUploadStudyZipToR2(job);
            job.status = 'completed';
            console.log(`✅ R2 ZIP Job ${job.id} completed successfully`);
            
            // ✅ CLEANUP: Force garbage collection if available
            if (global.gc) {
                global.gc();
                console.log(`🗑️ Garbage collection triggered after job ${job.id}`);
            }

        } catch (error) {
            console.error(`❌ R2 ZIP Job ${job.id} failed:`, error.message);
            
            job.retryCount = (job.retryCount || 0) + 1;
            
            // ✅ ENHANCED: Better retry logic
            const isRetryable = error.message.includes('timeout') || 
                              error.message.includes('ECONNRESET') ||
                              error.message.includes('socket hang up') ||
                              error.message.includes('ENOTFOUND') ||
                              error.message.includes('aborted');

            if (isRetryable && job.retryCount <= this.maxRetries) {
                job.status = 'waiting';
                job.error = null;
                const delay = this.retryDelay * Math.pow(2, job.retryCount - 1); // Exponential backoff
                console.log(`🔄 Retrying job ${job.id} in ${delay}ms (attempt ${job.retryCount}/${this.maxRetries})`);
                
                setTimeout(() => {
                    if (!this.isProcessing) {
                        this.startZipProcessing();
                    }
                }, delay);
            } else {
                job.error = error.message;
                job.status = 'failed';
                console.error(`❌ Job ${job.id} failed permanently after ${job.retryCount} retries`);
            }
        } finally {
            this.processing.delete(job.id);
        }
    }

    
    async createAndUploadStudyZipToR2(job) {
    const { orthancStudyId, studyDatabaseId, studyInstanceUID } = job.data;
    const startTime = Date.now();
    
    try {
        console.log(`[ZIP WORKER] 📦 Starting job for study: ${orthancStudyId} (Decoupled Method)`);
        
        // Update study status
        await DicomStudy.findByIdAndUpdate(studyDatabaseId, { 
            'preProcessedDownload.zipStatus': 'processing',
            'preProcessedDownload.zipJobId': job.id.toString(),
            'preProcessedDownload.zipMetadata.createdBy': 'cloudflare-r2-service-decoupled',
            'preProcessedDownload.zipMetadata.storageProvider': 'cloudflare-r2'
        });
        
        job.progress = 10;

        // ✅ FIXED: Step 1 - Fetch study details AND instance list in parallel for efficiency
        console.log(`[ZIP WORKER] 🔍 Fetching all metadata from Orthanc...`);
        const studyDetailsUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}`;
        const instancesUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}/instances?expanded=true`;

        const [studyDetailsResponse, instancesResponse] = await Promise.all([
            axios.get(studyDetailsUrl, { headers: { 'Authorization': orthancAuth }, timeout: 15000 }),
            axios.get(instancesUrl, { headers: { 'Authorization': orthancAuth }, timeout: 30000 })
        ]);

        const studyDetails = studyDetailsResponse.data;
        const detailedInstances = instancesResponse.data;

        if (!detailedInstances || detailedInstances.length === 0) {
            throw new Error("No instances found for this study");
        }
        
        console.log(`[ZIP WORKER] 📊 Found ${detailedInstances.length} instances to process`);
        job.progress = 25;

        // ✅ FIXED: Step 2 - Create filename from the correct source (studyDetails)
        const patientName = (studyDetails.PatientMainDicomTags.PatientName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
        const patientId = (studyDetails.PatientMainDicomTags.PatientID || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
        const studyDate = studyDetails.MainDicomTags.StudyDate || '';
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const zipFileName = `Study_${patientName}_${patientId}_${studyDate}_${orthancStudyId}.zip`;
        
        console.log(`[ZIP WORKER] 📂 Creating ZIP with correct name: ${zipFileName}`);

        // ✅ FIXED: Step 3 - Group instances by series using the detailed instance data
        const seriesMap = new Map();
        for (const instance of detailedInstances) {
            const seriesInstanceUID = instance.MainDicomTags.SeriesInstanceUID;
            if (!seriesMap.has(seriesInstanceUID)) {
                const seriesDescription = (instance.MainDicomTags.SeriesDescription || 'UnknownSeries').replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50);
                const seriesNumber = String(instance.MainDicomTags.SeriesNumber || '000').padStart(3, '0');
                seriesMap.set(seriesInstanceUID, {
                    folderName: `Series_${seriesNumber}_${seriesDescription}`,
                    instances: []
                });
            }
            seriesMap.get(seriesInstanceUID).instances.push(instance.ID);
        }

        console.log(`[ZIP WORKER] 📁 Organized into ${seriesMap.size} series`);
        job.progress = 35;

        // ✅ STEP 4: Setup streams for zipping and uploading
        const zipStream = new PassThrough();
        const archive = archiver('zip', { 
            zlib: { level: 6 }
        });
        
        archive.on('error', (err) => {
            console.error('[ZIP WORKER] ❌ Archiver error:', err);
            zipStream.destroy(err);
        });
        archive.pipe(zipStream);
        
        const uploadPromise = this.uploadZipToR2(zipStream, zipFileName, {
            studyInstanceUID,
            orthancStudyId,
            totalInstances: detailedInstances.length,
            totalSeries: seriesMap.size,
            patientName: patientName
        });
        
        console.log(`[ZIP WORKER] 📤 Started streaming upload to R2`);
        job.progress = 40;

        // STEP 5: Process instances in batches
        let processedInstances = 0;
        const totalInstances = detailedInstances.length;
        for (const [seriesUID, seriesData] of seriesMap.entries()) {
            for (let i = 0; i < seriesData.instances.length; i += this.instanceBatchSize) {
                const batch = seriesData.instances.slice(i, i + this.instanceBatchSize);
                const batchPromises = batch.map((instanceId, index) => {
                    return this.downloadAndAddInstanceToArchive(
                        archive, 
                        instanceId, 
                        seriesData.folderName, 
                        processedInstances + index + 1
                    );
                });
                await Promise.all(batchPromises);
                processedInstances += batch.length;
                job.progress = 40 + Math.floor((processedInstances / totalInstances) * 45); // Progress from 40% to 85%
                console.log(`[ZIP WORKER] 📦 Processed ${processedInstances}/${totalInstances} instances`);
            }
        }

        // STEP 6: Finalize and wait for upload
        console.log(`[ZIP WORKER] 🔒 Finalizing archive...`);
        await archive.finalize();
        job.progress = 85;
        
        console.log(`[ZIP WORKER] ⏳ Waiting for R2 upload to complete...`);
        const r2Result = await uploadPromise;
        job.progress = 95;
        
        const processingTime = Date.now() - startTime;
        const zipSizeMB = Math.round((r2Result.size || 0) / 1024 / 1024 * 100) / 100;
        
        // STEP 7: Generate URLs and update database
        const cdnUrl = await getCDNOptimizedUrl(r2Result.key, { filename: zipFileName, contentType: 'application/zip' });
        const publicUrl = getR2PublicUrl(r2Result.key, r2Config.features.enableCustomDomain);
        
        const updateData = {
            'preProcessedDownload.zipUrl': cdnUrl,
            'preProcessedDownload.zipPublicUrl': publicUrl,
            'preProcessedDownload.zipFileName': zipFileName,
            'preProcessedDownload.zipSizeMB': zipSizeMB,
            'preProcessedDownload.zipCreatedAt': new Date(),
            'preProcessedDownload.zipStatus': 'completed',
            // ... add more metadata as needed
        };
        
        await DicomStudy.findByIdAndUpdate(studyDatabaseId, updateData);
        job.progress = 100;
        
        console.log(`[ZIP WORKER] ✅ ZIP created: ${zipFileName} - ${zipSizeMB}MB in ${processingTime}ms`);
        
        return { 
            success: true, 
            zipUrl: cdnUrl, 
            zipPublicUrl: publicUrl,
            zipFileName, 
            zipSizeMB, 
            processingTime
        };

    } catch (error) {
        console.error(`[ZIP WORKER] ❌ Failed to create ZIP via decoupled method:`, error);
        await DicomStudy.findByIdAndUpdate(studyDatabaseId, { 
            'preProcessedDownload.zipStatus': 'failed',
            'preProcessedDownload.zipMetadata.error': error.message
        });
        throw error;
    }
  }

    // ✅ NEW: Enhanced instance download with retry logic
    async downloadAndAddInstanceToArchive(archive, instanceId, folderName, fileNumber) {
        let retryCount = 0;
        
        while (retryCount < this.maxRetries) {
            try {
                const instanceFileUrl = `${ORTHANC_BASE_URL}/instances/${instanceId}/file`;
                const instanceStreamResponse = await axios.get(instanceFileUrl, {
                    headers: { 'Authorization': orthancAuth },
                    responseType: 'stream',
                    timeout: 60000, // 1 minute per instance
                    maxContentLength: 500 * 1024 * 1024 // 500MB max per instance
                });
                
                const fileName = `${folderName}/${instanceId}.dcm`;
                archive.append(instanceStreamResponse.data, { name: fileName });
                
                if (fileNumber % 20 === 0) { // Log every 20 files
                    console.log(`[ZIP WORKER] ✅ Added ${fileNumber}: ${fileName}`);
                }
                
                return; // Success, exit retry loop
                
            } catch (error) {
                retryCount++;
                console.warn(`[ZIP WORKER] ⚠️ Download attempt ${retryCount}/${this.maxRetries} failed for ${instanceId}:`, error.message);
                
                if (retryCount >= this.maxRetries) {
                    console.error(`[ZIP WORKER] ❌ Failed to download ${instanceId} after ${this.maxRetries} attempts`);
                    // Add error file instead of failing entire ZIP
                    const errorContent = `Error downloading instance ${instanceId}: ${error.message}`;
                    const errorFileName = `${folderName}/ERROR_${instanceId}.txt`;
                    archive.append(Buffer.from(errorContent), { name: errorFileName });
                    return;
                }
                
                // Exponential backoff delay
                const delay = 1000 * Math.pow(2, retryCount - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // ✅ FIXED: Upload with proper size detection
    async uploadZipToR2(zipStream, fileName, metadata) {
        const year = new Date().getFullYear();
        const key = `studies/${year}/${fileName}`;
        
        console.log(`[R2] 📤 DECOUPLED Upload: ${fileName} to key: ${key}`);
        
        try {
            const upload = new Upload({
                client: this.r2,
                params: {
                    Bucket: this.zipBucket,
                    Key: key,
                    Body: zipStream,
                    ContentType: 'application/zip',
                    ContentDisposition: `attachment; filename="${fileName}"`,
                    CacheControl: `public, max-age=${r2Config.cdnSettings.cacheMaxAge}`,
                    
                    Metadata: {
                        'study-instance-uid': metadata.studyInstanceUID || '',
                        'orthanc-study-id': metadata.orthancStudyId || '',
                        'total-instances': metadata.totalInstances?.toString() || '0',
                        'total-series': metadata.totalSeries?.toString() || '0',
                        'created-at': new Date().toISOString(),
                        'service-version': 'cloudflare-r2-decoupled-streaming',
                        'download-method': 'decoupled-streaming'
                    },
                    
                    StorageClass: 'STANDARD'
                },
                
                // ✅ OPTIMIZED: For better performance
                partSize: 10 * 1024 * 1024,  // 10MB parts
                leavePartsOnError: false,
                queueSize: 4,                 // 4 concurrent uploads
                
                requestHandler: {
                    requestTimeout: 600000,   // 10 minutes
                    connectionTimeout: 60000  // 1 minute
                }
            });

            // Progress tracking with reduced logging
            let lastLogTime = 0;
            upload.on('httpUploadProgress', (progress) => {
                if (progress.total) {
                    const now = Date.now();
                    const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                    
                    // Log every 25% or every 2 minutes
                    if (percentComplete % 25 === 0 || (now - lastLogTime) > 120000) {
                        console.log(`[R2] 📊 ${fileName}: ${percentComplete}% (${this.formatBytes(progress.loaded)})`);
                        lastLogTime = now;
                    }
                }
            });

            const result = await upload.done();
            
            // ✅ FIXED: Get actual file size after upload
            let fileSize = 0;
            try {
                const headCmd = new HeadObjectCommand({ 
                    Bucket: this.zipBucket, 
                    Key: key 
                });
                const headResult = await this.r2.send(headCmd);
                fileSize = headResult.ContentLength || 0;
            } catch (headError) {
                console.warn(`[R2] ⚠️ Could not get file size for ${fileName}:`, headError.message);
            }
            
            console.log(`[R2] ✅ DECOUPLED Upload completed: ${fileName} (${this.formatBytes(fileSize)})`);
            
            return {
                url: getCDNOptimizedUrl(key, { filename: fileName, contentType: 'application/zip' }),
                publicUrl: getR2PublicUrl(key),
                key: key,
                bucket: this.zipBucket,
                etag: result.ETag,
                size: fileSize
            };
            
        } catch (error) {
            console.error(`[R2] ❌ DECOUPLED Upload failed: ${fileName}`, error.message);
            
            // Enhanced error classification for retries
            if (error.message.includes('ECONNRESET') || 
                error.message.includes('socket hang up') ||
                error.message.includes('aborted')) {
                throw new Error(`Network error (retryable): ${error.message}`);
            } else if (error.message.includes('timeout')) {
                throw new Error(`Timeout error (retryable): ${error.message}`);
            } else {
                throw new Error(`Upload failed: ${error.message}`);
            }
        }
    }

    // ✅ UTILITY: Format bytes helper
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Get R2 bucket if it doesn't exist
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
            storageProvider: 'cloudflare-r2',
            method: 'decoupled-streaming'
        };
    }
}

export default new CloudflareR2ZipService();