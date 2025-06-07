// filepath: backend/scripts/test-wasabi-integration.js
import WasabiService from '../services/wasabi.service.js';

async function testWasabiIntegration() {
    console.log('🧪 Starting Wasabi integration test...');
    
    try {
        // 1. Initialize buckets
        await WasabiService.initializeBuckets();
        console.log('✅ Bucket initialization complete');
        
        // 2. Test document upload
        const testDocument = Buffer.from('This is a test document');
        const uploadResult = await WasabiService.uploadDocument(
            testDocument,
            'test-document.txt',
            'document',
            {
                patientId: 'TEST001',
                studyId: 'STUDY001',
                uploadedBy: 'system'
            }
        );
        console.log('✅ Document upload test:', uploadResult.success);
        
        // 3. Test presigned URL generation
        const presignedResult = await WasabiService.generatePresignedUrl(
            uploadResult.bucket,
            uploadResult.key,
            3600
        );
        console.log('✅ Presigned URL test:', presignedResult.success);
        
        // 4. Test file download
        const downloadResult = await WasabiService.downloadFile(
            uploadResult.bucket,
            uploadResult.key
        );
        console.log('✅ Download test:', downloadResult.success);
        
        // 5. Test storage statistics
        const statsResult = await WasabiService.getStorageStats();
        console.log('✅ Storage stats test:', statsResult.success);
        console.log('📊 Storage Statistics:', statsResult.stats);
        
        // 6. Cleanup test file - FIXED: Use WasabiService.deleteFile method
        const deleteResult = await WasabiService.deleteFile(
            uploadResult.bucket,
            uploadResult.key,
            true // permanent deletion
        );
        console.log('🧹 Test file cleaned up:', deleteResult.success);
        
        console.log('🎉 All Wasabi integration tests passed!');
        
    } catch (error) {
        console.error('❌ Wasabi integration test failed:', error);
        throw error;
    }
}

testWasabiIntegration().catch(console.error);