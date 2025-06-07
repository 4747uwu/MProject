import { 
    HeadBucketCommand, 
    CreateBucketCommand, 
    PutObjectCommand, 
    GetObjectCommand, 
    DeleteObjectCommand,
    ListObjectsV2Command 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { wasabiS3, buckets } from '../config/wasabi.js';
import crypto from 'crypto';
import path from 'path';

class WasabiService {
    constructor() {
        this.s3 = wasabiS3;
        this.buckets = buckets;
    }

    // 🔧 Initialize buckets (AWS SDK v3)
    async initializeBuckets() {
        try {
            console.log('🚀 Initializing Wasabi buckets...');
            
            for (const [bucketType, bucketName] of Object.entries(this.buckets)) {
                try {
                    await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
                    console.log(`✅ Bucket ${bucketName} exists`);
                } catch (error) {
                    if (error.$metadata?.httpStatusCode === 404) {
                        console.log(`📦 Creating bucket: ${bucketName}`);
                        
                        const createParams = {
                            Bucket: bucketName
                        };
                        
                        // Add region configuration for non-us-east-1 regions
                        if (process.env.WASABI_REGION !== 'us-east-1') {
                            createParams.CreateBucketConfiguration = {
                                LocationConstraint: process.env.WASABI_REGION
                            };
                        }
                        
                        await this.s3.send(new CreateBucketCommand(createParams));
                        console.log(`✅ Bucket ${bucketName} created`);
                    } else {
                        console.error(`❌ Error with bucket ${bucketName}:`, error.message);
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error initializing buckets:', error);
            throw error;
        }
    }

    // 🔧 Upload document (AWS SDK v3)
    async uploadDocument(fileBuffer, fileName, documentType, metadata = {}) {
        try {
            const key = this.generateDocumentKey(fileName, documentType, metadata);
            const bucket = documentType === 'report' ? this.buckets.reports : 
                          documentType === 'backup' ? this.buckets.backups :
                          this.buckets.documents;
            
            const uploadParams = {
                Bucket: bucket,
                Key: key,
                Body: fileBuffer,
                ContentType: this.getContentType(fileName),
                Metadata: {
                    'document-type': documentType,
                    'patient-id': metadata.patientId || 'unknown',
                    'study-id': metadata.studyId || 'unknown',
                    'upload-date': new Date().toISOString(),
                    'uploaded-by': metadata.uploadedBy || 'system',
                    'original-name': fileName
                },
                ServerSideEncryption: 'AES256',
                StorageClass: 'STANDARD'
            };

            const result = await this.s3.send(new PutObjectCommand(uploadParams));
            
            console.log(`✅ Document uploaded: ${key}`);
            return {
                success: true,
                key: key,
                location: `https://${bucket}.s3.${process.env.WASABI_REGION}.wasabisys.com/${key}`,
                etag: result.ETag,
                bucket: bucket,
                size: fileBuffer.length,
                metadata: uploadParams.Metadata
            };
        } catch (error) {
            console.error('❌ Error uploading document:', error);
            throw error;
        }
    }

    // 🔧 Download file (AWS SDK v3)
    async downloadFile(bucket, key, options = {}) {
        try {
            const params = {
                Bucket: bucket,
                Key: key,
                ...options
            };

            const result = await this.s3.send(new GetObjectCommand(params));
            
            // Convert stream to buffer
            const chunks = [];
            for await (const chunk of result.Body) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            
            return {
                success: true,
                data: buffer,
                contentType: result.ContentType,
                metadata: result.Metadata,
                lastModified: result.LastModified,
                size: result.ContentLength
            };
        } catch (error) {
            console.error(`❌ Error downloading file ${key}:`, error);
            throw error;
        }
    }

    // 🔧 Generate presigned URL (AWS SDK v3)
    async generatePresignedUrl(bucket, key, expiresIn = 3600, operation = 'GetObject') {
        try {
            const commandMap = {
                'GetObject': GetObjectCommand,
                'PutObject': PutObjectCommand,
                'getObject': GetObjectCommand,
                'putObject': PutObjectCommand
            };
            
            const CommandClass = commandMap[operation] || GetObjectCommand;
            const command = new CommandClass({ Bucket: bucket, Key: key });
            
            const url = await getSignedUrl(this.s3, command, { expiresIn });
            
            return {
                success: true,
                url: url,
                expiresIn: expiresIn,
                expiresAt: new Date(Date.now() + (expiresIn * 1000))
            };
        } catch (error) {
            console.error('❌ Error generating presigned URL:', error);
            throw error;
        }
    }

    // 🔧 List files in bucket (AWS SDK v3)
    async listFiles(bucket, prefix = '', maxKeys = 1000) {
        try {
            const params = {
                Bucket: bucket,
                Prefix: prefix,
                MaxKeys: maxKeys
            };

            const result = await this.s3.send(new ListObjectsV2Command(params));
            
            return {
                success: true,
                files: result.Contents || [],
                isTruncated: result.IsTruncated,
                keyCount: result.KeyCount,
                totalSize: (result.Contents || []).reduce((sum, file) => sum + (file.Size || 0), 0)
            };
        } catch (error) {
            console.error(`❌ Error listing files in ${bucket}:`, error);
            throw error;
        }
    }

    // 🔧 Get storage statistics
    async getStorageStats() {
        try {
            console.log('📊 Getting storage statistics...');
            const stats = {};

            for (const [bucketType, bucketName] of Object.entries(this.buckets)) {
                try {
                    const listResult = await this.listFiles(bucketName, '', 1000);
                    
                    const totalSize = listResult.totalSize;
                    const fileCount = listResult.files.length;

                    stats[bucketType] = {
                        bucketName,
                        fileCount,
                        totalSize,
                        totalSizeFormatted: this.formatBytes(totalSize),
                        averageFileSize: fileCount > 0 ? Math.round(totalSize / fileCount) : 0
                    };
                    
                    console.log(`📦 ${bucketType}: ${fileCount} files, ${this.formatBytes(totalSize)}`);
                } catch (error) {
                    console.warn(`⚠️ Could not get stats for bucket ${bucketName}:`, error.message);
                    stats[bucketType] = {
                        bucketName,
                        fileCount: 0,
                        totalSize: 0,
                        totalSizeFormatted: '0 Bytes',
                        averageFileSize: 0,
                        error: error.message
                    };
                }
            }

            const totalFiles = Object.values(stats).reduce((sum, bucket) => sum + bucket.fileCount, 0);
            const totalStorage = Object.values(stats).reduce((sum, bucket) => sum + bucket.totalSize, 0);

            return {
                success: true,
                stats,
                summary: {
                    totalFiles,
                    totalStorage,
                    totalStorageFormatted: this.formatBytes(totalStorage),
                    bucketsCount: Object.keys(stats).length
                },
                generatedAt: new Date()
            };

        } catch (error) {
            console.error('❌ Error getting storage statistics:', error);
            throw error;
        }
    }

    // 🔧 Delete file (AWS SDK v3)
    async deleteFile(bucket, key, permanent = false) {
        try {
            const params = {
                Bucket: bucket,
                Key: key
            };

            await this.s3.send(new DeleteObjectCommand(params));
            console.log(`🗑️ File deleted: ${key}`);
            
            return {
                success: true,
                deletedKey: key,
                permanent
            };
        } catch (error) {
            console.error(`❌ Error deleting file ${key}:`, error);
            throw error;
        }
    }

    // 🔧 Utility methods remain the same...
    generateDocumentKey(fileName, documentType, metadata) {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const patientId = (metadata.patientId || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
        const studyId = (metadata.studyId || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
        const hash = crypto.createHash('md5').update(fileName + Date.now()).digest('hex').substring(0, 8);
        
        return `${documentType}/${year}/${month}/${day}/${patientId}/${studyId}/${hash}_${fileName}`;
    }

    getContentType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const contentTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.txt': 'text/plain',
            '.dcm': 'application/dicom',
            '.xml': 'application/xml',
            '.json': 'application/json',
            '.gz': 'application/gzip'
        };
        return contentTypes[ext] || 'application/octet-stream';
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

export default new WasabiService();