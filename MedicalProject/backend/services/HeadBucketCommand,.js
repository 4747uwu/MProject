HeadBucketCommand, 
PutObjectCommand,
DeleteObjectCommand,
ListObjectsV2Command
} from '@aws-sdk/client-s3';

const pipelineAsync = promisify(pipeline);

const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

class OptimizedCloudflareR2ZipService {
constructor() {
    this.r2 = r2Client;
    this.zipJobs = new Map();
    this.processing = new Set();
    this.nextJobId = 1;
    this.isProcessing = false;
    
    // 🚀 OPTIMIZED: Resource allocation for 16GB RAM / 8vCPU
    this.concurrency = 3; // Process 3 studies simultaneously
    this.maxMemoryPerJob = 2 * 1024 * 1024 * 1024; // 2GB per job (6GB total)
    this.reservedMemoryBuffer = 4 * 1024 * 1024 * 1024; // 4GB system buffer
    this.streamBufferSize = 64 * 1024 * 1024; // 64MB stream buffer
    this.multipartThreshold = 100 * 1024 * 1024; // 100MB threshold for multipart
    this.partSize = 50 * 1024 * 1024; // 50MB per part
    this.maxConcurrentUploads = 4; // Concurrent upload parts
    
    // 🔧 Performance monitoring
    this.stats = {
        totalProcessed: 0,
        totalErrors: 0,
        totalSizeMB: 0,
        avgProcessingTime: 0,
        peakMemoryUsage: 0,
        currentMemoryUsage: 0
    };
    
    this.zipBucket = r2Config.zipBucket;
    
    // 🛡️ Circuit breaker for resource protection
    this.circuitBreaker = {
        failures: 0,
        maxFailures: 5,
        resetTimeout: 5 * 60 * 1000, // 5 minutes
        isOpen: false,
        lastFailure: null
    };
    
    // 📊 Memory monitoring
    this.startMemoryMonitoring();
    
    console.log(`🚀 Optimized R2 ZIP Service initialized:`);
    console.log(`   Concurrency: ${this.concurrency} jobs`);
    console.log(`   Memory per job: ${this.formatBytes(this.maxMemoryPerJob)}`);
    console.log(`   Stream buffer: ${this.formatBytes(this.streamBufferSize)}`);
    console.log(`   Part size: ${this.formatBytes(this.partSize)}`);
    console.log(`   Bucket: ${this.zipBucket}`);
}

// 📊 Memory monitoring for resource management
startMemoryMonitoring() {
    setInterval(() => {
        const memUsage = process.memoryUsage();
        this.stats.currentMemoryUsage = memUsage.heapUsed;
        this.stats.peakMemoryUsage = Math.max(this.stats.peakMemoryUsage, memUsage.heapUsed);
        
        // 🛡️ Memory pressure detection
        const memoryPressure = memUsage.heapUsed / (16 * 1024 * 1024 * 1024); // Percentage of 16GB
        
        if (memoryPressure > 0.75) { // Over 75% memory usage
            console.warn(`⚠️ High memory usage: ${this.formatBytes(memUsage.heapUsed)} (${Math.round(memoryPressure * 100)}%)`);
            this.reduceProcessingLoad();
        }
        
        // Force garbage collection if available
        if (global.gc && memoryPressure > 0.8) {
            global.gc();