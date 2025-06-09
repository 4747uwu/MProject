// 🔧 FIXED: routes/sharing.routes.js
import express from 'express';
import mongoose from 'mongoose';
import { 
  generateShareableLink, 
  generateQRCode, 
  accessSharedStudy 
} from '../controllers/share.controller.js';
// 🔧 FIXED: Import correct auth middleware
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// 🔗 Generate shareable link for a study
// POST /api/sharing/generate-link
router.post('/generate-link', 
  protect, 
  // authorize('admin', 'doctor', 'lab_staff'), 
  generateShareableLink
);

// 📱 Generate QR code for a shareable link
// POST /api/sharing/generate-qr
router.post('/generate-qr', 
  protect, 
  // authorize('admin', 'doctor', 'lab_staff'), 
  generateQRCode
);

// 🌐 Access shared study (public endpoint - no auth required)
// GET /api/sharing/access/:token
router.get('/access/:token', accessSharedStudy);

// 📊 Get sharing statistics (optional - for analytics)
// GET /api/sharing/stats/:studyId
router.get('/stats/:studyId', 
  protect, 
  authorize('admin'), 
  async (req, res) => {
    try {
      const { studyId } = req.params;
      
      const ShareToken = (await import('../models/shareTokenSchema.js')).default;
      
      const shareStats = await ShareToken.aggregate([
        {
          $match: { 
            studyId: new mongoose.Types.ObjectId(studyId)
          }
        },
        {
          $group: {
            _id: '$viewerType',
            totalShares: { $sum: 1 },
            totalAccess: { $sum: '$accessCount' },
            lastAccessed: { $max: '$lastAccessedAt' },
            activeLinks: {
              $sum: {
                $cond: [
                  { $and: [
                    { $eq: ['$isActive', true] },
                    { $gt: ['$expiresAt', new Date()] }
                  ]},
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      res.json({
        success: true,
        stats: shareStats,
        studyId
      });

    } catch (error) {
      console.error('❌ Error fetching sharing stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sharing statistics'
      });
    }
  }
);

// 🗑️ Revoke/deactivate a shared link
// DELETE /api/sharing/revoke/:token
router.delete('/revoke/:token', 
  protect, 
  authorize('admin', 'doctor'), 
  async (req, res) => {
    try {
      const { token } = req.params;
      
      const ShareToken = (await import('../models/shareTokenSchema.js')).default;
      
      const shareToken = await ShareToken.findOneAndUpdate(
        { token },
        { 
          isActive: false,
          revokedAt: new Date(),
          revokedBy: req.user._id // 🔧 FIXED: Use _id instead of id
        },
        { new: true }
      );

      if (!shareToken) {
        return res.status(404).json({
          success: false,
          message: 'Share token not found'
        });
      }

      console.log(`🚫 Share link revoked: ${token} by user ${req.user._id}`);

      res.json({
        success: true,
        message: 'Share link has been revoked',
        token
      });

    } catch (error) {
      console.error('❌ Error revoking share link:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to revoke share link'
      });
    }
  }
);

// 📋 List all active shares for a study
// GET /api/sharing/list/:studyId
router.get('/list/:studyId', 
  protect, 
  authorize('admin', 'doctor'), 
  async (req, res) => {
    try {
      const { studyId } = req.params;
      
      const ShareToken = (await import('../models/shareTokenSchema.js')).default;
      
      const activeShares = await ShareToken.find({
        studyId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      })
      .select('token viewerType createdAt expiresAt accessCount lastAccessedAt createdBy')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });

      res.json({
        success: true,
        shares: activeShares,
        studyId,
        count: activeShares.length
      });

    } catch (error) {
      console.error('❌ Error listing shares:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list shares'
      });
    }
  }
);

export default router;