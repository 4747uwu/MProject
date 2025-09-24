import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
    getOwnerDashboard,
    getLabDetails,
    getBillingConfig,
    updateBillingConfig,
    generateInvoice,
    generateReceipt,
    getAllInvoices,
    getInvoiceDetail
} from '../controllers/owner.controller.js';

const router = express.Router();

// ✅ MIDDLEWARE: All routes require owner role
router.use(protect);
router.use(authorize('owner'));

// ✅ DASHBOARD ROUTES
router.get('/dashboard', getOwnerDashboard);
router.get('/labs/:labId/details', getLabDetails);
// ✅ ADD this route:
router.get('/invoices/:invoiceId', getInvoiceDetail);

// ✅ BILLING CONFIGURATION ROUTES
router.get('/billing/config', getBillingConfig);
router.put('/billing/config', updateBillingConfig);

// ✅ INVOICE ROUTES
router.post('/labs/:labId/invoice', generateInvoice);
router.get('/invoices', getAllInvoices);
router.get('/invoices/:invoiceId/receipt', generateReceipt);

export default router;