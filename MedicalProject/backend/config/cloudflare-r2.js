import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

// ✅ UPDATED: Your actual Cloudflare R2 Configuration
export const r2Config = {
    endpoint: 'https://b39c632fcc14248dfcf837983059a2cd.r2.cloudflarestorage.com',
    accessKeyId: '84a50df7100eea000b6ddd0c2ddce67a',
    secretAccessKey: '1a925bae4d85529b3c8e68460b29d03de672a4d9fbba2a7fd430af0edc4f2a91',
    zipBucket: 'studyzip',
    
    // ✅ FIXED: Your actual public URL
    publicUrlPattern: 'https://pub-6f09f78e289e4cbab0a82e99a603f535.r2.dev',
    
    customDomain: process.env.R2_CUSTOM_DOMAIN || null,
    region: 'auto',
    
    cdnSettings: {
        cacheMaxAge: 86400,
        edgeCacheMaxAge: 2592000,
        enableCompression: false,
        enableCaching: true
    },
    
    // ✅ FIXED: Maximum 7 days for presigned URLs
    presignedSettings: {
        defaultExpirySeconds: 604800, // ✅ 7 days = 7 * 24 * 60 * 60 = 604,800 seconds (MAX)
        maxExpirySeconds: 604800,     // ✅ 7 days is the absolute maximum for S3/R2
        minExpirySeconds: 3600,       // Minimum 1 hour
        useExtendedExpiry: true
    },
    
    features: {
        enablePublicAccess: false,
        enablePresignedUrls: true,
        enableCustomDomain: !!process.env.R2_CUSTOM_DOMAIN,
        enableAnalytics: true,
        enableCDN: true
    }
};

// Existing validation code...
console.log('🔍 DEBUG: R2 Credential Validation:');
console.log(`🔑 Access Key: ${r2Config.accessKeyId.substring(0,8)}...`);
console.log(`🔐 Secret Key: ${r2Config.secretAccessKey.substring(0,8)}...`);

if (!r2Config.accessKeyId || !r2Config.secretAccessKey) {
    console.error('❌ CRITICAL: R2 credentials missing!');
    throw new Error('Missing R2 credentials');
}

export const r2Client = new S3Client({
    region: 'auto',
    endpoint: r2Config.endpoint,
    credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
    },
    forcePathStyle: true,
    signatureVersion: 'v4'
});

// ✅ ENHANCED: Presigned URL function with 7-day default expiry
export const getPresignedUrl = async (key, expiresIn = null) => {
    try {
        // ✅ Use 7 days as default if not specified
        let expiry = expiresIn || r2Config.presignedSettings.defaultExpirySeconds;
        
        // ✅ Validate expiry limits
        const maxExpiry = r2Config.presignedSettings.maxExpirySeconds;
        const minExpiry = r2Config.presignedSettings.minExpirySeconds;
        
        if (expiry > maxExpiry) {
            console.warn(`⚠️ Requested expiry (${expiry}s) exceeds max (${maxExpiry}s), using max`);
            expiry = maxExpiry;
        }
        
        if (expiry < minExpiry) {
            console.warn(`⚠️ Requested expiry (${expiry}s) below min (${minExpiry}s), using min`);
            expiry = minExpiry;
        }
        
        const command = new GetObjectCommand({
            Bucket: r2Config.zipBucket,
            Key: key,
        });
        
        const signedUrl = await getSignedUrl(r2Client, command, { 
            expiresIn: expiry
        });
        
        // ✅ Enhanced logging with human-readable time
        const expiryDate = new Date(Date.now() + (expiry * 1000));
        const humanExpiry = expiry === 604800 ? '7 days' : 
                           expiry === 86400 ? '1 day' : 
                           expiry === 3600 ? '1 hour' : 
                           `${Math.round(expiry / 86400)} days`;
        
        console.log(`🔐 Generated presigned URL for: ${key}`);
        console.log(`⏰ Expires in: ${humanExpiry} (${expiry}s) - ${expiryDate.toISOString()}`);
        
        return signedUrl;
    } catch (error) {
        console.error('❌ Error generating presigned URL:', error);
        throw error;
    }
};

// ✅ FIXED: Helper function to get public URL for R2 object (EXPORTED)
export const getR2PublicUrl = (key, useCustomDomain = false) => {
    if (useCustomDomain && r2Config.customDomain) {
        return `https://${r2Config.customDomain}/${key}`;
    }
    
    // ✅ Use your actual public URL pattern
    return `${r2Config.publicUrlPattern}/${key}`;
};

// ✅ UPDATED: Smart URL function with 7-day default
export const getCDNOptimizedUrl = async (key, options = {}) => {
    if (r2Config.features.enablePresignedUrls) {
        // ✅ Use 7 days as default for presigned URLs
        const expiresIn = options.expiresIn || r2Config.presignedSettings.defaultExpirySeconds;
        return await getPresignedUrl(key, expiresIn);
    } else if (r2Config.features.enablePublicAccess) {
        // Use public URLs (faster, but less secure)
        return getR2PublicUrl(key, r2Config.features.enableCustomDomain);
    } else {
        throw new Error('Neither presigned URLs nor public access is enabled');
    }
};

// ✅ NEW: Helper function to get expiry time options
export const getExpiryOptions = () => {
    return {
        '1hour': 3600,
        '1day': 86400,
        '7days': 604800,
        'default': r2Config.presignedSettings.defaultExpirySeconds
    };
};

console.log('🔧 Cloudflare R2 configuration loaded');
console.log(`📦 Bucket: ${r2Config.zipBucket}`);
console.log(`🌐 Public URL: ${r2Config.publicUrlPattern}`);
console.log(`🔐 Presigned URLs: ${r2Config.features.enablePresignedUrls ? 'ENABLED' : 'DISABLED'}`);
console.log(`⏰ Default Expiry: ${r2Config.presignedSettings.defaultExpirySeconds}s (7 days MAX)`);
console.log(`🌍 Public Access: ${r2Config.features.enablePublicAccess ? 'ENABLED' : 'DISABLED'}`);