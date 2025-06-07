import { wasabiS3, buckets } from '../config/wasabi.config.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

class WasabiService {
    constructor() {
        this.s3 = wasabiS3;
        this.buckets = buckets;
        this.isInitialized = false;
    }

    // 🔧 Initialize buckets if they don't exist
    async initializeBuckets() {
        try {
            console.log('🚀 Initializing Wasabi buckets...');
            
            for (const [bucketType, bucketName] of Object.entries(this.buckets)) {
                try {
                    await this.s3.headBucket({ Bucket: bucketName }).promise();
                    console.log(`✅ Bucket ${bucketName} exists`);
                } catch (error) {
                    if (error.statusCode === 404) {
                        console.log(`📦 Creating bucket: ${bucketName}`);
                        
                        const createParams = {
                            Bucket: bucketName
                        };
                        
                        // Only add CreateBucketConfiguration for regions other than us-east-1
                        if (process.env.WASABI_REGION && process.env.WASABI_REGION !== 'us-east-1') {
                            createParams.CreateBucketConfiguration = {
                                LocationConstraint: process.env.WASABI_REGION
                            };
                        }
                        
                        await this.s3.createBucket(createParams).promise();
                        
                        // Set bucket lifecycle policy for cost optimization
                        await this.setBucketLifecyclePolicy(bucketName, bucketType);
                        
                        // Set bucket CORS for web access
                        await this.setBucketCORS(bucketName);
                        
                        console.log(`✅ Bucket ${bucketName} created successfully`);
                    } else {
                        console.error(`❌ Error checking bucket ${bucketName}:`, error.message);
                        throw error;
                    }
                }
            }
            
            this.isInitialized = true;
            console.log('🎉 All Wasabi buckets initialized successfully!');
            
        } catch (error) {
            console.error('❌ Error initializing Wasabi buckets:', error);
            throw error;
        }
    }

    // 🔧 Set lifecycle policies for different bucket types
    async setBucketLifecyclePolicy(bucketName, bucketType) {
        const lifecyclePolicies = {
            dicom: {
                Rules: [{
                    ID: 'DicomRetention',
                    Status: 'Enabled',
                    Filter: { Prefix: '' },
                    Transitions: [{
                        Days: 90,
                        StorageClass: 'GLACIER'
                    }],
                    // Keep DICOM files for 7 years (medical requirement)
                    Expiration: { Days: 2555 }
                }]
            },
            documents: {
                Rules: [{
                    ID: 'DocumentRetention',
                    Status: 'Enabled', 
                    Filter: { Prefix: '' },
                    Transitions: [{
                        Days: 365,
                        StorageClass: 'GLACIER'
                    }],
                    Expiration: { Days: 2920 } // 8 years for documents
                }]
            },
            reports: {
                Rules: [{
                    ID: 'ReportRetention',
                    Status: 'Enabled',
                    Filter: { Prefix: '' },
                    Transitions: [{
                        Days: 180,
                        StorageClass: 'GLACIER'
                    }],
                    Expiration: { Days: 3650 } // 10 years for reports
                }]
            },
            backups: {
                Rules: [{
                    ID: 'BackupRetention',
                    Status: 'Enabled',
                    Filter: { Prefix: '' },
                    Transitions: [{
                        Days: 30,
                        StorageClass: 'GLACIER'
                    }],
                    Expiration: { Days: 1095 } // 3 years for backups
                }]
            }
        };

        if (lifecyclePolicies[bucketType]) {
            try {
                await this.s3.putBucketLifecycleConfiguration({
                    Bucket: bucketName,
                    LifecycleConfiguration: lifecyclePolicies[bucketType]
                }).promise();
                console.log(`📋 Lifecycle policy set for ${bucketName}`);
            } catch (error) {
                console.warn(`⚠️ Could not set lifecycle policy for ${bucketName}:`, error.message);
            }
        }
    }

    // 🔧 Set CORS for web access
    async setBucketCORS(bucketName) {
        const corsConfiguration = {
            CORSRules: [{
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag', 'x-amz-meta-*'],
                MaxAgeSeconds: 3000
            }]
        };

        try {
            await this.s3.putBucketCors({
                Bucket: bucketName,
                CORSConfiguration: corsConfiguration
            }).promise();
            console.log(`🌐 CORS policy set for ${bucketName}`);
        } catch (error) {
            console.warn(`⚠️ Could not set CORS policy for ${bucketName}:`, error.message);
        }
    }

    // 🔧 Upload DICOM file (called from Orthanc or direct upload)
    async uploadDicomFile(fileBuffer, fileName, metadata = {}) {
        try {
            const key = this.generateDicomKey(fileName, metadata);
            
            const uploadParams = {
                Bucket: this.buckets.dicom,
                Key: key,
                Body: fileBuffer,
                ContentType: 'application/dicom',
                Metadata: {
                    'patient-id': metadata.patientId || 'unknown',
                    'study-uid': metadata.studyInstanceUID || 'unknown',
                    'series-uid': metadata.seriesInstanceUID || 'unknown',
                    'instance-uid': metadata.sopInstanceUID || 'unknown',
                    'modality': metadata.modality || 'unknown',
                    'upload-date': new Date().toISOString(),
                    'source': metadata.source || 'orthanc',
                    'institution': metadata.institutionName || 'unknown'
                },
                ServerSideEncryption: 'AES256',
                StorageClass: 'STANDARD'
            };

            const result = await this.s3.upload(uploadParams).promise();
            
            console.log(`✅ DICOM file uploaded: ${key}`);
            return {
                success: true,
                key: key,
                location: result.Location,
                etag: result.ETag,
                bucket: this.buckets.dicom,
                size: fileBuffer.length,
                metadata: uploadParams.Metadata
            };
        } catch (error) {
            console.error('❌ Error uploading DICOM file:', error);
            throw error;
        }
    }

    // 🔧 Upload document/report from Node.js
    async uploadDocument(fileBuffer, fileName, documentType, metadata = {}) {
        try {
            const key = this.generateDocumentKey(fileName, documentType, metadata);
            const bucket = documentType === 'report' ? this.buckets.reports : this.buckets.documents;
            
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
                    'original-name': fileName,
                    'study-instance-uid': metadata.studyInstanceUID || 'unknown'
                },
                ServerSideEncryption: 'AES256',
                StorageClass: 'STANDARD'
            };

            const result = await this.s3.upload(uploadParams).promise();
            
            console.log(`✅ Document uploaded: ${key}`);
            return {
                success: true,
                key: key,
                location: result.Location,
                etag: result.ETag,
                bucket: bucket,
                documentType: documentType,
                size: fileBuffer.length,
                metadata: uploadParams.Metadata
            };
        } catch (error) {
            console.error('❌ Error uploading document:', error);
            throw error;
        }
    }

    // 🔧 Download file with streaming support
    async downloadFile(bucket, key, options = {}) {
        try {
            const params = {
                Bucket: bucket,
                Key: key,
                ...options
            };

            const result = await this.s3.getObject(params).promise();
            return {
                success: true,
                data: result.Body,
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

    // 🔧 Get streaming download for large files
    getDownloadStream(bucket, key, options = {}) {
        const params = {
            Bucket: bucket,
            Key: key,
            ...options
        };
        
        return this.s3.getObject(params).createReadStream();
    }

    // 🔧 Generate presigned URL for secure access
    async generatePresignedUrl(bucket, key, expiresIn = 3600, operation = 'getObject') {
        try {
            const params = {
                Bucket: bucket,
                Key: key,
                Expires: expiresIn
            };

            const url = await this.s3.getSignedUrlPromise(operation, params);
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

    // 🔧 Delete file with versioning support
    async deleteFile(bucket, key, permanent = false) {
        try {
            const params = {
                Bucket: bucket,
                Key: key
            };
            
            if (permanent) {
                await this.s3.deleteObject(params).promise();
            } else {
                // Soft delete by moving to deleted folder
                const deletedKey = `deleted/${new Date().toISOString()}/${key}`;
                await this.copyFile(bucket, key, bucket, deletedKey);
                await this.s3.deleteObject(params).promise();
            }

            console.log(`🗑️ File ${permanent ? 'permanently ' : ''}deleted: ${key}`);
            return { success: true, permanent };
        } catch (error) {
            console.error(`❌ Error deleting file ${key}:`, error);
            throw error;
        }
    }

    // 🔧 Copy file between buckets or within bucket
    async copyFile(sourceBucket, sourceKey, destBucket, destKey) {
        try {
            const copyParams = {
                Bucket: destBucket,
                Key: destKey,
                CopySource: `/${sourceBucket}/${sourceKey}`,
                ServerSideEncryption: 'AES256'
            };

            const result = await this.s3.copyObject(copyParams).promise();
            
            console.log(`📋 File copied from ${sourceKey} to ${destKey}`);
            return {
                success: true,
                etag: result.ETag,
                lastModified: result.LastModified
            };
        } catch (error) {
            console.error(`❌ Error copying file:`, error);
            throw error;
        }
    }

    // 🔧 List files with pagination and filtering
    async listFiles(bucket, prefix = '', maxKeys = 1000, continuationToken = null) {
        try {
            const params = {
                Bucket: bucket,
                Prefix: prefix,
                MaxKeys: maxKeys,
                ...(continuationToken && { ContinuationToken: continuationToken })
            };

            const result = await this.s3.listObjectsV2(params).promise();
            
            return {
                success: true,
                files: result.Contents || [],
                isTruncated: result.IsTruncated,
                nextContinuationToken: result.NextContinuationToken,
                keyCount: result.KeyCount,
                totalSize: (result.Contents || []).reduce((sum, file) => sum + (file.Size || 0), 0)
            };
        } catch (error) {
            console.error(`❌ Error listing files in ${bucket}:`, error);
            throw error;
        }
    }

    // 🔧 Get comprehensive file information
    async getFileInfo(bucket, key) {
        try {
            const params = {
                Bucket: bucket,
                Key: key
            };

            const result = await this.s3.headObject(params).promise();
            return {
                success: true,
                size: result.ContentLength,
                lastModified: result.LastModified,
                etag: result.ETag,
                contentType: result.ContentType,
                metadata: result.Metadata,
                storageClass: result.StorageClass,
                serverSideEncryption: result.ServerSideEncryption
            };
        } catch (error) {
            console.error(`❌ Error getting file info for ${key}:`, error);
            throw error;
        }
    }

    // 🔧 Generate DICOM storage key with medical hierarchy
    generateDicomKey(fileName, metadata) {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        const patientId = (metadata.patientId || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
        const studyUID = (metadata.studyInstanceUID || 'unknown').replace(/[^a-zA-Z0-9.]/g, '_');
        const seriesUID = (metadata.seriesInstanceUID || 'unknown').replace(/[^a-zA-Z0-9.]/g, '_');
        const modality = metadata.modality || 'unknown';
        
        return `dicom/${year}/${month}/${day}/${patientId}/${studyUID}/${seriesUID}/${modality}/${fileName}`;
    }

    // 🔧 Generate document storage key with medical organization
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

    // 🔧 Get content type based on file extension
    getContentType(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const contentTypes = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.tiff': 'image/tiff',
            '.txt': 'text/plain',
            '.dcm': 'application/dicom',
            '.xml': 'application/xml',
            '.json': 'application/json',
            '.zip': 'application/zip',
            '.tar': 'application/x-tar',
            '.gz': 'application/gzip'
        };
        return contentTypes[ext] || 'application/octet-stream';
    }

    // 🔧 Get storage statistics for all buckets
    async getStorageStats() {
        try {
            const stats = {};

            for (const [bucketType, bucketName] of Object.entries(this.buckets)) {
                const listResult = await this.listFiles(bucketName, '', 1000);
                
                const totalSize = listResult.totalSize;
                const fileCount = listResult.files.length;

                // Get files by month for trending
                const filesByMonth = {};
                listResult.files.forEach(file => {
                    const month = file.LastModified.toISOString().substring(0, 7); // YYYY-MM
                    if (!filesByMonth[month]) {
                        filesByMonth[month] = { count: 0, size: 0 };
                    }
                    filesByMonth[month].count++;
                    filesByMonth[month].size += file.Size;
                });

                stats[bucketType] = {
                    bucketName,
                    fileCount,
                    totalSize,
                    totalSizeFormatted: this.formatBytes(totalSize),
                    averageFileSize: fileCount > 0 ? Math.round(totalSize / fileCount) : 0,
                    filesByMonth
                };
            }

            return {
                success: true,
                stats,
                totalFiles: Object.values(stats).reduce((sum, bucket) => sum + bucket.fileCount, 0),
                totalStorage: Object.values(stats).reduce((sum, bucket) => sum + bucket.totalSize, 0),
                generatedAt: new Date()
            };

        } catch (error) {
            console.error('❌ Error getting storage statistics:', error);
            throw error;
        }
    }

    // 🔧 Format bytes to human readable format
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

export default new WasabiService();