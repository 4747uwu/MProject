// Routes/qrdownloader.routes.js
import express from 'express';
import QRDownloaderController from '../controllers/qrdownloader.controller.js';

const router = express.Router();

/**
 * 🔗 QR CODE ROUTES
 * These routes are hit when users scan the QR code from the document
 */

// Main route: Scan QR code and download report
// GET /api/scan/:studyId
router.get('/:studyId', QRDownloaderController.handleQRScan);

// Info route: Get report metadata without downloading
// GET /api/scan/:studyId/info
router.get('/:studyId/info', QRDownloaderController.getReportInfo);

export default router;