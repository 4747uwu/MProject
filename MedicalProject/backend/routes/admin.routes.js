

import express from 'express';
import {
    registerLabAndStaff,
    registerDoctor,
    getAllStudiesForAdmin,
    getPatientDetailedView,
    getAllDoctors,
    assignDoctorToStudy,
    getDoctorById,
    updateDoctor,
    deleteDoctor,
    toggleDoctorStatus,
    sendDoctorEmail,
    getDoctorStats,
    resetDoctorPassword,
    uploadDoctorSignature,
    getValues,
    getPendingStudies,
    getInProgressStudies,
    getCompletedStudies,
    registerAdmin
} from '../controllers/admin.controller.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Routes that require admin only
router.post('/labs/register', protect, authorize('admin'), registerLabAndStaff);
router.post('/doctors/register', 
    protect, 
    authorize('admin'), 
    uploadDoctorSignature,  // ✅ Add this middleware
    registerDoctor
);

router.get('/studies', protect, authorize('admin'), getAllStudiesForAdmin); 
router.get('/values', protect, getValues)
router.get('/doctors', protect, authorize('admin', 'lab_staff'), getAllDoctors); 
router.post('/studies/:studyId/assign', protect, authorize('admin'), assignDoctorToStudy); 

router.get('/studies/pending', protect, authorize('admin'), getPendingStudies);
router.get('/studies/inprogress', protect, authorize('admin'), getInProgressStudies);
router.get('/studies/completed', protect, authorize('admin'), getCompletedStudies);
router.post('/admins/register', protect, authorize('admin'), registerAdmin);



// Route that allows multiple roles (admin, lab_staff, doctor_account)
router.get('/patients/:patientId/detailed-view', protect, authorize('admin', 'lab_staff', 'doctor_account'), getPatientDetailedView);
router.get('/doctors/:doctorId', getDoctorById); // We need to add this controller
router.put('/doctors/:doctorId', updateDoctor);
router.delete('/doctors/:doctorId', deleteDoctor);
router.patch('/doctors/:doctorId/toggle-status', toggleDoctorStatus);
router.post('/doctors/:doctorId/send-email', sendDoctorEmail);
router.get('/doctors/:doctorId/stats', getDoctorStats);
router.post('/doctors/:doctorId/reset-password', resetDoctorPassword)

/ router.post('/doctors/register-with-signature', 
        protect, 
        authorize('admin'), 
        uploadDoctorSignature,
        registerDoctor
    );

export default router;