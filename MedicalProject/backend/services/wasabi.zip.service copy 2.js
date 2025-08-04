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
import { Worker } from 'worker_threads';
import { Transform } from 'stream';
import { createGzip } from 'zlib';
import os from 'os';
import cluster from 'cluster';
import http from 'http'; // ✅ ES module import
import https from 'https'; // ✅ ES module import

const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

class OptimizedCloudflareR2ZipService {
    constructor() {
        this.r2 = r2Client;
        
        // 🚀 OPTIMIZED: Resource allocation for 16GB RAM / 8vCPU
        this.maxConcurrentJobs = 6; // Leave 2 CPU cores for system + other operations
        this.maxMemoryPerJob = 2 * 1024 * 1024 * 1024; // 2GB per job (8GB total for ZIP operations)
        this.streamChunkSize = 64 * 1024; // 64KB chunks for memory efficiency
        this.maxPartSize = 50 * 1024 * 1024; // 50MB parts for R2 multipart upload
        this.queueSize = 8; // Parallel upload parts
        
        // Job management
        this.zipJobs = new Map();
        this.activeJobs = new Set();
        this.jobQueue = [];
        this.nextJobId = 1;
        this.isProcessing = false;
        this.zipBucket = r2Config.zipBucket;
        
        // 🔥 PERFORMANCE: Memory and connection pooling
        this.memoryUsage = 0;
        this.connectionPool = new Map();
        this.compressionLevel = 6; // Balanced compression (1=fastest, 9=best)
        
        // 🔥 OPTIMIZED: Initialize HTTP agents in constructor (FIXED)
        this.httpAgent = new http.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 20,
            maxFreeSockets: 10,
            timeout: 600000
        });
        
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 20,
            maxFreeSockets: 10,
            timeout: 600000,
            rejectUnauthorized: false // For self-signed certificates
        });
        
        // 📊 Performance monitoring
        this.metrics = {
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            avgProcessingTime: 0,
            totalDataProcessed: 0,
            peakMemoryUsage: 0,
            currentActiveJobs: 0
        };
        
        // 🧹 Resource cleanup
        this.cleanupInterval = setInterval(() => this.performCleanup(), 5 * 60 * 1000); // Every 5 minutes
        
        console.log(`🚀 OPTIMIZED R2 ZIP Service initialized`);
        console.log(`💾 Memory allocation: ${this.maxMemoryPerJob / 1024 / 1024}MB per job`);
        console.log(`⚡ Max concurrent jobs: ${this.maxConcurrentJobs}`);
        console.log(`🏗️ Stream chunk size: ${this.streamChunkSize / 1024}KB`);
        console.log(`📦 Bucket: ${this.zipBucket}`);
    }

    // 🚀 OPTIMIZED: Smart job queuing with priority and resource management
    async addZipJob(studyData, priority = 'normal') {
        const jobId = this.nextJobId++;
        const memoryEstimate = this.estimateMemoryUsage(studyData);
        
        // Check if we have enough memory available
        if (this.memoryUsage + memoryEstimate > 14 * 1024 * 1024 * 1024) { // Reserve 2GB for system
            console.warn(`⚠️ Job ${jobId} queued - insufficient memory (current: ${this.formatBytes(this.memoryUsage)}, needed: ${this.formatBytes(memoryEstimate)})`);
        }
        
        const job = {
            id: jobId,
            type: 'create-study-zip-r2-optimized',
            data: studyData,
            status: 'waiting',
            priority: priority, // 'high', 'normal', 'low'
            createdAt: new Date(),
            progress: 0,
            result: null,
            error: null,
            memoryEstimate,
            retryCount: 0,
            maxRetries: 2
        };
        
        this.zipJobs.set(jobId, job);
        this.jobQueue.push(job);
        this.metrics.totalJobs++;
        
        // Sort queue by priority
        this.jobQueue.sort((a, b) => {
            const priorityOrder = { 'high': 3, 'normal': 2, 'low': 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        
        console.log(`📋 Job ${jobId} queued (Priority: ${priority}, Est. Memory: ${this.formatBytes(memoryEstimate)})`);
        
        if (!this.isProcessing) {
            this.startOptimizedProcessing();
        }
        
        return job;
    }

    // 🔥 OPTIMIZED: High-performance concurrent processing
    async startOptimizedProcessing() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        console.log('🚀 Starting OPTIMIZED ZIP processing engine');
        console.log(`⚡ Max concurrent jobs: ${this.maxConcurrentJobs}`);
        
        while (this.jobQueue.length > 0 || this.activeJobs.size > 0) {
            // Process jobs while we have capacity and queued jobs
            while (this.activeJobs.size < this.maxConcurrentJobs && this.jobQueue.length > 0) {
                const job = this.jobQueue.shift();
                
                // Check memory availability
                if (this.memoryUsage + job.memoryEstimate <= 14 * 1024 * 1024 * 1024) {
                    this.processOptimizedZipJob(job);
                } else {
                    // Put job back at front of queue and wait
                    this.jobQueue.unshift(job);
                    console.log(`⏳ Job ${job.id} waiting for memory (${this.formatBytes(this.memoryUsage)} used)`);
                    break;
                }
            }
            
            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        this.isProcessing = false;
        console.log('⏹️ ZIP processing engine stopped');
        this.printPerformanceStats();
    }

    // 🔥 OPTIMIZED: Individual job processing with resource tracking
    async processOptimizedZipJob(job) {
        this.activeJobs.add(job.id);
        this.memoryUsage += job.memoryEstimate;
        this.metrics.currentActiveJobs++;
        
        job.status = 'active';
        job.startTime = Date.now();
        
        console.log(`🚀 Processing Job ${job.id} (${this.activeJobs.size}/${this.maxConcurrentJobs} active)`);
        console.log(`💾 Memory usage: ${this.formatBytes(this.memoryUsage)}`);
        
        try {
            job.result = await this.createOptimizedStudyZip(job);
            job.status = 'completed';
            this.metrics.completedJobs++;
            
            const processingTime = Date.now() - job.startTime;
            this.updatePerformanceMetrics(processingTime, job.result.zipSizeMB * 1024 * 1024);
            
            console.log(`✅ Job ${job.id} completed in ${processingTime}ms (${job.result.zipSizeMB}MB)`);
            
        } catch (error) {
            job.error = error.message;
            
            // Retry logic for transient failures
            if (job.retryCount < job.maxRetries && this.isRetryableError(error)) {
                job.retryCount++;
                job.status = 'waiting';
                this.jobQueue.unshift(job); // High priority retry
                console.warn(`🔄 Job ${job.id} retry ${job.retryCount}/${job.maxRetries}: ${error.message}`);
            } else {
                job.status = 'failed';
                this.metrics.failedJobs++;
                console.error(`❌ Job ${job.id} failed permanently: ${error.message}`);
            }
        } finally {
            this.activeJobs.delete(job.id);
            this.memoryUsage -= job.memoryEstimate;
            this.metrics.currentActiveJobs--;
        }
    }

    // 🚀 OPTIMIZED: Memory-efficient ZIP creation with streaming
    async createOptimizedStudyZip(job) {
        const { orthancStudyId, studyDatabaseId, studyInstanceUID } = job.data;
        const startTime = Date.now();
        
        try {
            console.log(`[OPTIMIZED] 📦 Creating ZIP for study: ${orthancStudyId}`);
            
            // Update status with resource info
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, {
                'preProcessedDownload.zipStatus': 'processing',
                'preProcessedDownload.zipJobId': job.id.toString(),
                'preProcessedDownload.zipMetadata.createdBy': 'optimized-cloudflare-r2-service',
                'preProcessedDownload.zipMetadata.storageProvider': 'cloudflare-r2',
                'preProcessedDownload.zipMetadata.processingStarted': new Date(),
                'preProcessedDownload.zipMetadata.estimatedMemory': job.memoryEstimate
            });
            
            job.progress = 10;
            
            // 🔥 OPTIMIZED: Parallel metadata and archive fetching
            const [metadataResponse, archiveStream] = await Promise.all([
                this.fetchStudyMetadata(orthancStudyId),
                this.createOptimizedArchiveStream(orthancStudyId, job)
            ]);
            
            const studyMetadata = metadataResponse.data;
            job.progress = 30;
            
            // Generate optimized filename
            const zipFileName = this.generateOptimizedFileName(studyMetadata, orthancStudyId);
            console.log(`[OPTIMIZED] 📂 ZIP filename: ${zipFileName}`);
            
            job.progress = 40;
            
            // 🚀 OPTIMIZED: Streaming upload with compression and progress tracking
            const r2Result = await this.uploadOptimizedZipToR2(
                archiveStream, 
                zipFileName, 
                {
                    studyInstanceUID,
                    orthancStudyId,
                    patientId: studyMetadata.PatientMainDicomTags?.PatientID,
                    patientName: studyMetadata.PatientMainDicomTags?.PatientName
                },
                job
            );
            
            job.progress = 90;
            
            const processingTime = Date.now() - startTime;
            const zipSizeMB = Math.round((r2Result.size || 0) / 1024 / 1024 * 100) / 100;
            
            // Generate optimized URLs
            const cdnUrl = await getCDNOptimizedUrl(r2Result.key, {
                filename: zipFileName,
                contentType: 'application/zip',
                cacheControl: true,
                r2Optimize: true
            });
            
            const publicUrl = getR2PublicUrl(r2Result.key, r2Config.features.enableCustomDomain);
            
            // Update database with comprehensive metadata
            const updateData = {
                'preProcessedDownload.zipUrl': cdnUrl,
                'preProcessedDownload.zipPublicUrl': publicUrl,
                'preProcessedDownload.zipFileName': zipFileName,
                'preProcessedDownload.zipSizeMB': zipSizeMB,
                'preProcessedDownload.zipCreatedAt': new Date(),
                'preProcessedDownload.zipStatus': 'completed',
                'preProcessedDownload.zipExpiresAt': new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                'preProcessedDownload.zipBucket': this.zipBucket,
                'preProcessedDownload.zipKey': r2Result.key,
                'preProcessedDownload.zipMetadata': {
                    orthancStudyId,
                    instanceCount: studyMetadata.Instances?.length || 0,
                    seriesCount: studyMetadata.Series?.length || 0,
                    processingTimeMs: processingTime,
                    compressionRatio: this.calculateCompressionRatio(studyMetadata, zipSizeMB),
                    createdBy: 'optimized-cloudflare-r2-service',
                    storageProvider: 'cloudflare-r2',
                    r2Key: r2Result.key,
                    r2Bucket: this.zipBucket,
                    cdnEnabled: true,
                    customDomain: r2Config.features.enableCustomDomain,
                    optimizationLevel: 'high-performance',
                    serverSpecs: {
                        cpu: '8vCPU',
                        memory: '16GB',
                        concurrency: this.maxConcurrentJobs
                    }
                }
            };
            
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, updateData);
            
            job.progress = 100;
            
            console.log(`[OPTIMIZED] ✅ ZIP completed: ${zipSizeMB}MB in ${processingTime}ms`);
            console.log(`[OPTIMIZED] 📊 Throughput: ${(zipSizeMB / (processingTime / 1000)).toFixed(2)} MB/s`);
            
            return {
                success: true,
                zipUrl: cdnUrl,
                zipPublicUrl: publicUrl,
                zipFileName,
                zipSizeMB,
                processingTime,
                throughputMBps: zipSizeMB / (processingTime / 1000),
                r2Key: r2Result.key,
                r2Bucket: this.zipBucket,
                cdnEnabled: true,
                storageProvider: 'cloudflare-r2-optimized'
            };
            
        } catch (error) {
            console.error(`[OPTIMIZED] ❌ ZIP creation failed:`, error);
            
            await DicomStudy.findByIdAndUpdate(studyDatabaseId, {
                'preProcessedDownload.zipStatus': 'failed',
                'preProcessedDownload.zipMetadata.error': error.message,
                'preProcessedDownload.zipMetadata.failedAt': new Date()
            });
            
            throw error;
        }
    }

    // 🔥 HELPER: Optimized HTTP agents with connection pooling (FIXED)
    getOptimizedHttpAgent() {
        return this.httpAgent; // Return pre-initialized agent
    }

    getOptimizedHttpsAgent() {
        return this.httpsAgent; // Return pre-initialized agent
    }

    // 🔧 HELPER: Fetch study metadata with caching (FIXED)
    async fetchStudyMetadata(orthancStudyId) {
        const cacheKey = `metadata_${orthancStudyId}`;
        
        if (this.connectionPool.has(cacheKey)) {
            return this.connectionPool.get(cacheKey);
        }
        
        const response = await axios.get(`${ORTHANC_BASE_URL}/studies/${orthancStudyId}`, {
            headers: { 'Authorization': orthancAuth },
            timeout: 30000,
            httpAgent: this.getOptimizedHttpAgent(),
            httpsAgent: this.getOptimizedHttpsAgent()
        });
        
        // Cache for 5 minutes
        this.connectionPool.set(cacheKey, response);
        setTimeout(() => this.connectionPool.delete(cacheKey), 5 * 60 * 1000);
        
        return response;
    }

    // 🚀 OPTIMIZED: High-performance archive stream creation (FIXED)
    async createOptimizedArchiveStream(orthancStudyId, job) {
        console.log(`[STREAM] 🌊 Creating optimized archive stream for ${orthancStudyId}`);
        
        const streamOptions = {
            headers: { 'Authorization': orthancAuth },
            responseType: 'stream',
            timeout: 600000, // 10 minutes for very large studies
            maxRedirects: 0,
            // 🔥 OPTIMIZED: HTTP/2 and connection reuse (FIXED)
            httpAgent: this.getOptimizedHttpAgent(),
            httpsAgent: this.getOptimizedHttpsAgent()
        };
        
        const response = await axios.get(
            `${ORTHANC_BASE_URL}/studies/${orthancStudyId}/archive`,
            streamOptions
        );
        
        // 🔥 OPTIMIZED: Transform stream with progress tracking and backpressure handling
        let processedBytes = 0;
        const progressStream = new Transform({
            objectMode: false,
            highWaterMark: this.streamChunkSize,
            transform(chunk, encoding, callback) {
                processedBytes += chunk.length;
                
                // Update job progress (40-80% during streaming)
                if (job) {
                    const progressPercent = Math.min(80, 40 + (processedBytes / (50 * 1024 * 1024)) * 40); // Estimate based on data
                    job.progress = Math.floor(progressPercent);
                }
                
                this.push(chunk);
                callback();
            }
        });
        
        // Handle backpressure
        response.data.pipe(progressStream);
        
        return progressStream;
    }

    // 🚀 OPTIMIZED: High-performance R2 upload with monitoring
    async uploadOptimizedZipToR2(zipStream, fileName, metadata, job) {
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const key = `studies/${year}/${month}/${fileName}`;
        
        console.log(`[R2-OPT] 📤 Starting optimized upload: ${key}`);
        
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
                        'patient-id': metadata.patientId || '',
                        'patient-name': metadata.patientName || '',
                        'created-at': new Date().toISOString(),
                        'service-version': 'optimized-r2-v2',
                        'storage-provider': 'cloudflare-r2',
                        'optimization-level': 'high-performance',
                        'server-specs': '16GB-8vCPU'
                    },
                    
                    StorageClass: 'STANDARD'
                },
                
                // 🔥 OPTIMIZED: R2 upload configuration for high throughput
                partSize: this.maxPartSize, // 50MB parts for maximum throughput
                leavePartsOnError: false,
                queueSize: this.queueSize, // 8 parallel uploads
                
                // 🚀 OPTIMIZED: Tags for better management
                tags: {
                    'service': 'optimized-zip-r2',
                    'year': year.toString(),
                    'month': month,
                    'type': 'dicom-study-archive'
                }
            });

            let lastProgressTime = Date.now();
            let lastProgressBytes = 0;

            // 📊 OPTIMIZED: Enhanced progress tracking with throughput
            upload.on('httpUploadProgress', (progress) => {
                if (progress.total && job) {
                    const now = Date.now();
                    const timeDiff = (now - lastProgressTime) / 1000;
                    const bytesDiff = progress.loaded - lastProgressBytes;
                    
                    if (timeDiff > 1) { // Update every second
                        const throughputMBps = (bytesDiff / timeDiff) / (1024 * 1024);
                        const percentComplete = Math.round((progress.loaded / progress.total) * 100);
                        const etaSeconds = throughputMBps > 0 ? (progress.total - progress.loaded) / (throughputMBps * 1024 * 1024) : 0;
                        
                        // Update job progress (80-90% during upload)
                        job.progress = Math.floor(80 + (percentComplete * 0.1));
                        
                        console.log(`[R2-OPT] 📊 Upload: ${percentComplete}% | ${this.formatBytes(progress.loaded)}/${this.formatBytes(progress.total)} | ${throughputMBps.toFixed(2)} MB/s | ETA: ${Math.round(etaSeconds)}s`);
                        
                        lastProgressTime = now;
                        lastProgressBytes = progress.loaded;
                    }
                }
            });

            const result = await upload.done();
            
            const publicUrl = getR2PublicUrl(key);
            const cdnUrl = getCDNOptimizedUrl(key, {
                filename: fileName,
                contentType: 'application/zip',
                r2Optimize: true
            });
            
            console.log(`[R2-OPT] ✅ Upload completed successfully`);
            console.log(`[R2-OPT] 📡 CDN URL: ${cdnUrl}`);
            
            return {
                url: cdnUrl,
                publicUrl: publicUrl,
                key: key,
                bucket: this.zipBucket,
                etag: result.ETag,
                size: result.size || 0
            };
            
        } catch (error) {
            console.error(`[R2-OPT] ❌ Upload failed:`, error);
            throw new Error(["Optimized R2 upload failed", error.message]);
        }
    }

    // 🧠 HELPER: Smart memory estimation
    estimateMemoryUsage(studyData) {
        // Base memory for processing
        let estimatedMemory = 100 * 1024 * 1024; // 100MB base
        
        // Estimate based on instance count if available
        if (studyData.instanceCount) {
            // Rough estimate: 500KB per instance for processing overhead
            estimatedMemory += studyData.instanceCount * 500 * 1024;
        } else {
            // Conservative estimate for unknown studies
            estimatedMemory = 1024 * 1024 * 1024; // 1GB
        }
        
        // Cap at maximum allowed per job
        return Math.min(estimatedMemory, this.maxMemoryPerJob);
    }

    // 🧹 HELPER: Resource cleanup and optimization
    async performCleanup() {
        console.log('🧹 Performing resource cleanup...');
        
        // Clean completed jobs older than 1 hour
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const jobsToDelete = [];
        
        for (const [jobId, job] of this.zipJobs.entries()) {
            if ((job.status === 'completed' || job.status === 'failed') && 
                job.createdAt.getTime() < oneHourAgo) {
                jobsToDelete.push(jobId);
            }
        }
        
        jobsToDelete.forEach(jobId => this.zipJobs.delete(jobId));
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        
        // Update peak memory usage
        const currentMemory = process.memoryUsage();
        this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, currentMemory.heapUsed);
        
        console.log(`🧹 Cleanup completed: ${jobsToDelete.length} old jobs removed`);
        console.log(`💾 Current memory: ${this.formatBytes(currentMemory.heapUsed)}, Peak: ${this.formatBytes(this.metrics.peakMemoryUsage)}`);
    }

    // 📊 HELPER: Performance metrics
    updatePerformanceMetrics(processingTime, dataSize) {
        const currentAvg = this.metrics.avgProcessingTime;
        const completed = this.metrics.completedJobs;
        
        this.metrics.avgProcessingTime = (currentAvg * (completed - 1) + processingTime) / completed;
        this.metrics.totalDataProcessed += dataSize;
    }

    printPerformanceStats() {
        console.log('\n📊 PERFORMANCE STATISTICS:');
        console.log(`Total Jobs: ${this.metrics.totalJobs}`);
        console.log(`Completed: ${this.metrics.completedJobs}`);
        console.log(`Failed: ${this.metrics.failedJobs}`);
        console.log(`Success Rate: ${((this.metrics.completedJobs / this.metrics.totalJobs) * 100).toFixed(2)}%`);
        console.log(`Avg Processing Time: ${this.metrics.avgProcessingTime.toFixed(0)}ms`);
        console.log(`Total Data Processed: ${this.formatBytes(this.metrics.totalDataProcessed)}`);
        console.log(`Peak Memory Usage: ${this.formatBytes(this.metrics.peakMemoryUsage)}`);
        console.log(`Current Active Jobs: ${this.metrics.currentActiveJobs}`);
    }

    // 🔧 HELPER: Optimized filename generation
    generateOptimizedFileName(studyMetadata, orthancStudyId) {
        const patientName = (studyMetadata.PatientMainDicomTags?.PatientName || 'Unknown')
            .replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        const patientId = (studyMetadata.PatientMainDicomTags?.PatientID || 'Unknown')
            .replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15);
        const studyDate = studyMetadata.MainDicomTags?.StudyDate || '';
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        return `Study_${patientName}_${patientId}_${studyDate}_${orthancStudyId.substring(0, 8)}_${timestamp}.zip`;
    }

    // 🔧 HELPER: Calculate compression ratio
    calculateCompressionRatio(studyMetadata, zipSizeMB) {
        const instanceCount = studyMetadata.Instances?.length || 0;
        if (instanceCount === 0) return 0;
        
        // Rough estimate: average DICOM file is ~1MB
        const estimatedOriginalSizeMB = instanceCount * 1;
        return estimatedOriginalSizeMB > 0 ? (zipSizeMB / estimatedOriginalSizeMB) : 0;
    }

    // 🔧 HELPER: Check if error is retryable
    isRetryableError(error) {
        const retryableErrors = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOTFOUND',
            'Network Error',
            'timeout',
            'socket hang up'
        ];
        
        return retryableErrors.some(errorType => 
            error.message.includes(errorType) || error.code === errorType
        );
    }

    // 🚀 PUBLIC: Get optimized job statistics
    getOptimizedJobStats() {
        const jobs = Array.from(this.zipJobs.values());
        return {
            ...this.getJobStats(),
            optimization: {
                maxConcurrentJobs: this.maxConcurrentJobs,
                maxMemoryPerJob: this.formatBytes(this.maxMemoryPerJob),
                currentMemoryUsage: this.formatBytes(this.memoryUsage),
                streamChunkSize: this.formatBytes(this.streamChunkSize),
                compressionLevel: this.compressionLevel,
                queuedJobs: this.jobQueue.length
            },
            performance: this.metrics,
            serverSpecs: {
                cpu: '8vCPU',
                memory: '16GB',
                targetThroughput: '2-3 studies/minute',
                maxImagesPerStudy: '2000+'
            }
        };
    }

    // Existing utility methods remain the same...
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
            processing: this.activeJobs.size,
            isProcessing: this.isProcessing,
            storageProvider: 'cloudflare-r2-optimized'
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

    // Cleanup on service shutdown
    async shutdown() {
        console.log('🛑 Shutting down optimized ZIP service...');
        
        clearInterval(this.cleanupInterval);
        
        // Wait for active jobs to complete (with timeout)
        let waitTime = 0;
        while (this.activeJobs.size > 0 && waitTime < 60000) { // Max 1 minute wait
            console.log(`⏳ Waiting for ${this.activeJobs.size} active jobs to complete...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            waitTime += 5000;
        }
        
        this.printPerformanceStats();
        console.log('✅ Optimized ZIP service shutdown complete');
    }
}

export default new OptimizedCloudflareR2ZipService();