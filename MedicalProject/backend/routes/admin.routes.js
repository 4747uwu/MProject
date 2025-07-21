

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
    updateStudyInteractionStatus,
    registerAdmin
} from '../controllers/admin.controller.js';

import {
    getAllDoctorsForAdmin,
    getDoctorForAdmin,
    updateDoctorForAdmin,
    deleteDoctorForAdmin,
    getAllLabsForAdmin,
    getLabForAdmin,
    updateLabForAdmin,
    deleteLabForAdmin,
    uploadDoctorSignature as uploadSignature
} from '../controllers/adminCRUD.controller.js';

import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// ===============================
// 🆕 DOCTORS MANAGEMENT ROUTES
// ===============================
router.get('/doctors/list', protect, authorize('admin'), getAllDoctorsForAdmin);
router.get('/doctors/details/:doctorId', protect, authorize('admin'), getDoctorForAdmin);
router.put('/doctors/update/:doctorId', 
    protect, 
    authorize('admin'), 
    uploadSignature,  // Handle signature upload
    updateDoctorForAdmin
);
router.delete('/doctors/delete/:doctorId', protect, authorize('admin'), deleteDoctorForAdmin);

// ===============================
// 🆕 LABS MANAGEMENT ROUTES  
// ===============================
router.get('/labs/list', protect, authorize('admin'), getAllLabsForAdmin);
router.get('/labs/details/:labId', protect, authorize('admin'), getLabForAdmin);
router.put('/labs/update/:labId', protect, authorize('admin'), updateLabForAdmin);
router.delete('/labs/delete/:labId', protect, authorize('admin'), deleteLabForAdmin);


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
router.put('/studies/:studyId/interaction', protect, authorize('doctor_account'), updateStudyInteractionStatus);


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