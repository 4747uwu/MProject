import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

// 🔧 Updated Wasabi S3 Configuration for ap-southeast-1 with AWS SDK v3
const wasabiConfig = {
    endpoint: process.env.WASABI_ENDPOINT || 'https://s3.ap-southeast-1.wasabisys.com',
    credentials: {
        accessKeyId: process.env.WASABI_ACCESS_KEY,
        secretAccessKey: process.env.WASABI_SECRET_KEY,
    },
    region: process.env.WASABI_REGION || 'ap-southeast-1',
    forcePathStyle: true,
    requestHandler: {
        requestTimeout: 120000, // 2 minutes for large files
        connectionTimeout: 30000 // 30 seconds connection timeout
    }
};

// Validate configuration
if (!wasabiConfig.credentials.accessKeyId || !wasabiConfig.credentials.secretAccessKey) {
    console.error('❌ Wasabi credentials not configured properly!');
    console.error('Please check your WASABI_ACCESS_KEY and WASABI_SECRET_KEY environment variables');
    process.exit(1);
}

// Create S3 client for Wasabi with AWS SDK v3
const wasabiS3 = new S3Client(wasabiConfig);

// 🔧 Updated bucket configurations with your actual bucket names
const buckets = {
    dicom: process.env.WASABI_DICOM_BUCKET || 'diacom',
    documents: process.env.WASABI_DOCUMENTS_BUCKET || 'medicaldocuments', 
    reports: process.env.WASABI_REPORTS_BUCKET || 'diacomreports',
    backups: process.env.WASABI_BACKUPS_BUCKET || 'medical-backups'
};

console.log('🔧 Wasabi S3 Configuration initialized (AWS SDK v3):', {
    endpoint: wasabiConfig.endpoint,
    region: wasabiConfig.region,
    buckets: buckets
});

export {
    wasabiS3,
    buckets,
    wasabiConfig
};