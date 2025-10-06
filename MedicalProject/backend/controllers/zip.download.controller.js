import DicomStudy from '../models/dicomStudyModel.js';
import { updateWorkflowStatus } from '../utils/workflowStatusManger.js';
import cloudflareR2ZipService from '../services/wasabi.zip.service.js';
import { r2Config, getCDNOptimizedUrl, getPresignedUrl } from '../config/cloudflare-r2.js';

// Smart download - uses R2 with CDN if available
export const downloadPreProcessedStudy = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        console.log(`🔍 R2 pre-processed download requested for: ${orthancStudyId} by user: ${req.user.role}`);
        
        // Find study with ZIP info
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId }).lean();
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        // Check if pre-processed ZIP is available in R2
        const zipInfo = study.preProcessedDownload;
        
        if (zipInfo && zipInfo.zipStatus === 'completed' && zipInfo.zipUrl) {
            // Check if ZIP hasn't expired
            const now = new Date();
            if (!zipInfo.zipExpiresAt || zipInfo.zipExpiresAt > now) {
                console.log(`✅ Using R2 pre-processed ZIP: ${zipInfo.zipFileName} (${zipInfo.zipSizeMB}MB)`);
                
                // Update workflow status - MOVE THIS BEFORE THE REDIRECT
                console.log(`🔄 About to update workflow status for user:`, {
                    role: req.user.role,
                    email: req.user.email,
                    fullName: req.user.fullName
                });
                
                await updateWorkflowStatusForDownload(study, req.user);
                
                // Update download stats
                await DicomStudy.findByIdAndUpdate(study._id, {
                    $inc: { 'preProcessedDownload.downloadCount': 1 },
                    'preProcessedDownload.lastDownloaded': new Date()
                });
                
                console.log(`✅ Updated download stats and workflow status for study: ${study._id}`);
                
                // Set appropriate headers for download
                res.setHeader('Content-Disposition', `attachment; filename="${zipInfo.zipFileName}"`);
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('X-Download-Method', 'cloudflare-r2-cdn');
                res.setHeader('X-ZIP-Size-MB', zipInfo.zipSizeMB.toString());
                res.setHeader('X-Storage-Provider', 'cloudflare-r2');
                res.setHeader('X-CDN-Enabled', 'true');
                
                // Use CDN-optimized URL for best performance
                const cdnUrl = zipInfo.zipUrl.includes('r2.dev') || zipInfo.zipUrl.includes(r2Config.customDomain)
                    ? zipInfo.zipUrl
                    : await getCDNOptimizedUrl(zipInfo.zipKey || zipInfo.zipFileName, {
                        filename: zipInfo.zipFileName,
                        contentType: 'application/zip',
                        expiresIn: r2Config.presignedSettings.defaultExpirySeconds // ✅ 30 days
                    });
                
                // Redirect to R2 CDN URL for direct download
                return res.redirect(cdnUrl);
            } else {
                console.log(`⚠️ Pre-processed ZIP expired, returning status`);
                return res.status(410).json({
                    success: false,
                    status: 'expired',
                    message: 'Pre-processed ZIP has expired',
                    expiredAt: zipInfo.zipExpiresAt,
                    fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`
                });
            }
        } else if (zipInfo && zipInfo.zipStatus === 'processing') {
            console.log(`⏳ ZIP still processing in R2`);
            
            return res.status(202).json({
                success: false,
                status: 'processing',
                message: 'ZIP file is being prepared in Cloudflare R2. Please try again in a few moments.',
                estimatedCompletion: 'Processing...',
                jobId: zipInfo.zipJobId,
                checkStatusUrl: `/orthanc/zip-status/${zipInfo.zipJobId}`,
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`,
                storageProvider: 'cloudflare-r2'
            });
        } else if (zipInfo && zipInfo.zipStatus === 'failed') {
            console.log(`❌ R2 ZIP creation failed`);
            
            return res.status(500).json({
                success: false,
                status: 'failed',
                message: 'ZIP creation failed in Cloudflare R2',
                error: zipInfo.zipMetadata?.error || 'Unknown error',
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`,
                storageProvider: 'cloudflare-r2'
            });
        } else {
            // No pre-processed ZIP available
            console.log(`📦 No pre-processed ZIP available in R2 for: ${orthancStudyId}`);
            
            return res.status(404).json({
                success: false,
                status: 'not_available',
                message: 'Pre-processed ZIP not available in Cloudflare R2',
                canCreate: true,
                createUrl: `/orthanc/create-zip/${orthancStudyId}`,
                fallbackUrl: `/orthanc-download/study/${orthancStudyId}/download-direct`,
                storageProvider: 'cloudflare-r2'
            });
        }
        
    } catch (error) {
        console.error('Error in R2 pre-processed download:', error);
        res.status(500).json({
            success: false,
            message: 'R2 pre-processed download failed',
            error: error.message,
            fallbackUrl: `/orthanc-download/study/${req.params.orthancStudyId}/download-direct`,
            storageProvider: 'cloudflare-r2'
        });
    }
};

// Get download info for R2
export const getDownloadInfo = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId })
            .select('preProcessedDownload seriesCount instanceCount orthancStudyID')
            .lean();
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        const zipInfo = study.preProcessedDownload || {};
        
        res.json({
            success: true,
            data: {
                orthancStudyId: study.orthancStudyID,
                hasPreProcessedZip: zipInfo.zipStatus === 'completed' && !!zipInfo.zipUrl,
                zipStatus: zipInfo.zipStatus || 'not_started',
                zipSizeMB: zipInfo.zipSizeMB || 0,
                zipCreatedAt: zipInfo.zipCreatedAt,
                zipExpiresAt: zipInfo.zipExpiresAt,
                downloadCount: zipInfo.downloadCount || 0,
                lastDownloaded: zipInfo.lastDownloaded,
                seriesCount: study.seriesCount || 0,
                instanceCount: study.instanceCount || 0,
                jobId: zipInfo.zipJobId,
                error: zipInfo.zipMetadata?.error,
                storageProvider: zipInfo.zipMetadata?.storageProvider || 'cloudflare-r2',
                cdnEnabled: zipInfo.zipMetadata?.cdnEnabled || true,
                customDomain: zipInfo.zipMetadata?.customDomain || false,
                downloadMethods: {
                    preProcessed: `/api/download/study/${orthancStudyId}/pre-processed`,
                    r2Direct: `/api/download/study/${orthancStudyId}/r2-direct`,
                    direct: `/api/orthanc-download/study/${orthancStudyId}/download-direct`,
                    create: `/api/orthanc/create-zip/${orthancStudyId}`,
                    info: `/api/download/study/${orthancStudyId}/info`
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting R2 download info:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get R2 download information',
            error: error.message
        });
    }
};

// Create ZIP manually in R2
export const createZipManually = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId });
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found'
            });
        }
        
        // Check if ZIP is already being processed or completed
        if (study.preProcessedDownload?.zipStatus === 'processing') {
            return res.json({
                success: false,
                message: 'ZIP creation already in progress in Cloudflare R2',
                status: 'processing',
                jobId: study.preProcessedDownload.zipJobId,
                storageProvider: 'cloudflare-r2'
            });
        }
        
        if (study.preProcessedDownload?.zipStatus === 'completed' && study.preProcessedDownload?.zipUrl) {
            return res.json({
                success: true,
                message: 'ZIP already exists in Cloudflare R2',
                status: 'completed',
                zipUrl: study.preProcessedDownload.zipUrl,
                zipSizeMB: study.preProcessedDownload.zipSizeMB,
                storageProvider: 'cloudflare-r2',
                cdnEnabled: true
            });
        }
        
        // Queue new ZIP creation job for R2
        const zipJob = await cloudflareR2ZipService.addZipJob({
            orthancStudyId: orthancStudyId,
            studyDatabaseId: study._id,
            studyInstanceUID: study.studyInstanceUID,
            instanceCount: study.instanceCount || 0,
            seriesCount: study.seriesCount || 0
        });
        
        res.json({
            success: true,
            message: 'ZIP creation queued for Cloudflare R2',
            jobId: zipJob.id,
            status: 'queued',
            checkStatusUrl: `/api/orthanc/zip-status/${zipJob.id}`,
            downloadUrl: `/api/download/study/${orthancStudyId}/pre-processed`,
            storageProvider: 'cloudflare-r2',
            cdnEnabled: true
        });
        
    } catch (error) {
        console.error('Error creating R2 ZIP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to queue ZIP creation in Cloudflare R2',
            error: error.message
        });
    }
};

// Replace the downloadFromWasabi function with downloadFromR2
// ✅ UPDATE: The downloadFromR2 function to use 30-day expiry
export const downloadFromR2 = async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        console.log(`🌐 R2 download requested for: ${orthancStudyId}`);
        
        const study = await DicomStudy.findOne(
            { orthancStudyID: orthancStudyId }
        ).lean();
        
        console.log('🔍 DEBUG - Study found:', !!study);
        if (study) {
            console.log('🔍 DEBUG - PreProcessed Download:', JSON.stringify(study.preProcessedDownload, null, 2));
        }
        
        if (!study) {
            console.log('❌ Study not found in database for orthancStudyId:', orthancStudyId);
            return res.status(404).json({
                success: false,
                message: 'Study not found in database',
                orthancStudyId: orthancStudyId
            });
        }
        
        const zipInfo = study.preProcessedDownload;
        
        if (!zipInfo) {
            console.log('❌ No preProcessedDownload found');
            return res.status(404).json({
                success: false,
                message: 'No ZIP information found for this study',
                status: 'no_zip_info'
            });
        }
        
        if (zipInfo.zipStatus !== 'completed') {
            console.log('❌ ZIP status is not completed:', zipInfo.zipStatus);
            return res.status(404).json({
                success: false,
                message: `ZIP status is '${zipInfo.zipStatus}', not 'completed'`,
                status: zipInfo.zipStatus || 'unknown'
            });
        }
        
        // ✅ ENHANCED: Extract key from multiple possible locations
        let zipKey = zipInfo?.zipKey || 
                    zipInfo?.zipMetadata?.r2Key || 
                    zipInfo?.zipMetadata?.zipKey;
        
        // ✅ CRITICAL FIX: Extract key from zipFileName
        if (!zipKey && zipInfo.zipFileName) {
            // Your files are stored in: studies/2025/filename.zip
            const year = new Date().getFullYear();
            zipKey = `studies/${year}/${zipInfo.zipFileName}`;
            console.log(`🔧 Constructed zipKey from filename: ${zipKey}`);
        }
        
        // ✅ FALLBACK: Extract key from zipUrl if available
        if (!zipKey && zipInfo.zipUrl) {
            try {
                const urlObj = new URL(zipInfo.zipUrl);
                const pathMatch = urlObj.pathname.match(/\/studyzip\/(.+?)(\?|$)/);
                if (pathMatch) {
                    zipKey = pathMatch[1];
                    console.log(`🔧 Extracted zipKey from URL: ${zipKey}`);
                }
            } catch (urlError) {
                console.warn('⚠️ Failed to extract key from URL:', urlError.message);
            }
        }
        
        console.log('🔍 DEBUG - Final ZIP Key:', zipKey);
        
        if (!zipKey) {
            console.log('❌ No ZIP key found in any location');
            return res.status(404).json({
                success: false,
                message: 'ZIP key not found - cannot locate file in R2',
                status: 'no_zip_key',
                debug: {
                    hasZipInfo: !!zipInfo,
                    zipStatus: zipInfo?.zipStatus,
                    hasZipUrl: !!zipInfo?.zipUrl,
                    hasZipFileName: !!zipInfo?.zipFileName,
                    zipFileName: zipInfo?.zipFileName
                }
            });
        }
        
        console.log(`✅ R2 ZIP available: ${zipInfo.zipFileName} with key: ${zipKey}`);
        
        // ✅ GENERATE FRESH PRESIGNED URL using the found key
        let downloadUrl;
        let downloadMethod;
        let urlExpires = false;
        let expiresIn = null;
        let expiryDate = null;
        
        if (r2Config.features.enablePresignedUrls) {
            const expirySeconds = r2Config.presignedSettings.defaultExpirySeconds; // 7 days
            downloadUrl = await getPresignedUrl(zipKey, expirySeconds);
            downloadMethod = 'cloudflare-r2-presigned-7day';
            urlExpires = true;
            expiresIn = '7 days';
            expiryDate = new Date(Date.now() + (expirySeconds * 1000));
            console.log(`🔐 Generated FRESH 7-day presigned URL (expires: ${expiryDate.toISOString()})`);
        } else {
            downloadUrl = `${r2Config.publicUrlPattern}/${zipKey}`;
            downloadMethod = 'cloudflare-r2-public';
            urlExpires = false;
            console.log(`🌍 Generated public URL: ${downloadUrl}`);
        }
        
        // ✅ UPDATE DATABASE: Save the zipKey AND update workflow status
        setImmediate(async () => {
            try {
                // Update download stats and save zipKey
                await DicomStudy.findByIdAndUpdate(study._id, {
                    $inc: { 'preProcessedDownload.downloadCount': 1 },
                    'preProcessedDownload.lastDownloaded': new Date(),
                    'preProcessedDownload.zipKey': zipKey // ✅ Save the key for next time
                });
                
                // ✅ CRITICAL: Update workflow status for R2 downloads too
                console.log(`🔄 Updating workflow status for R2 download by ${req.user.role}: ${req.user.fullName || req.user.email}`);
                await updateWorkflowStatusForDownload(study, req.user);
                
                console.log('✅ Download stats updated, zipKey saved, and workflow status updated');
            } catch (updateError) {
                console.warn('⚠️ Failed to update download stats or workflow status:', updateError.message);
            }
        });
        
        res.json({
            success: true,
            message: `Cloudflare R2 fresh ${r2Config.features.enablePresignedUrls ? '7-day presigned' : 'public'} download URL ready`,
            data: {
                downloadUrl: downloadUrl,
                fileName: zipInfo.zipFileName,
                fileSizeMB: zipInfo.zipSizeMB || 0,
                downloadMethod: downloadMethod,
                urlType: r2Config.features.enablePresignedUrls ? 'presigned-7day-fresh' : 'public',
                urlExpires: urlExpires,
                expiresIn: expiresIn,
                expiryDate: expiryDate,
                canRegenerateUrl: true,
                regenerationNote: 'Fresh URL generated on each request',
                storageProvider: 'cloudflare-r2',
                cdnEnabled: true,
                bucketName: 'studyzip',
                expectedSpeed: 'Fast with Cloudflare R2',
                debug: {
                    zipKey: zipKey,
                    zipStatus: zipInfo.zipStatus,
                    zipSizeMB: zipInfo.zipSizeMB,
                    keySource: zipInfo?.zipKey ? 'database' : 'constructed'
                }
            }
        });
        
    } catch (error) {
        console.error('❌ R2 download error:', error);
        res.status(500).json({
            success: false,
            message: 'Cloudflare R2 download failed',
            error: error.message,
            stack: error.stack
        });
    }
};

// Helper function to update workflow status (unchanged)
async function updateWorkflowStatusForDownload(study, user) {
    try {
        let newStatus;
        let statusNote;
        
        console.log(`🔄 Updating workflow status for download by ${user.role}: ${user.fullName || user.email}`);
        console.log(`📊 Current study status: ${study.workflowStatus}`);
        
        // ✅ ENHANCED: More comprehensive role-based status updates
        if (user.role === 'doctor_account') {
            newStatus = 'report_downloaded_radiologist';
            statusNote = `Pre-processed study downloaded by radiologist from Cloudflare R2: ${user.fullName || user.email}`;
        } else if (user.role === 'lab_staff') {
            return null;
        } else if (user.role === 'admin') {
            // ✅ ADMIN EXCLUSION: No workflow status update for admin downloads
            console.log(`⚠️ Admin download detected - skipping workflow status update for: ${user.fullName || user.email}`);
            return null;
        }
        
        // ✅ CRITICAL: Always update status if we have a newStatus
        if (newStatus) {
            console.log(`✅ Updating status from '${study.workflowStatus}' to '${newStatus}'`);
            
            const result = await updateWorkflowStatus({
                studyId: study._id,
                status: newStatus,
                note: statusNote,
                user: user
            });
            
            console.log(`✅ Workflow status updated successfully:`, result);
            return result;
        } else {
            console.log(`⚠️ No status update needed for role: ${user.role}`);
            return null;
        }
    } catch (error) {
        console.error('❌ Error updating workflow status for download:', error);
        console.error('❌ Error details:', {
            studyId: study._id,
            userRole: user.role,
            currentStatus: study.workflowStatus,
            error: error.message,
            stack: error.stack
        });
        // Don't throw error - let download continue even if status update fails
        return null;
    }
}