import { useAuth } from './useAuth';

const useAllowedRoles = () => {
  const { currentUser } = useAuth();

  const checkRole = (allowedRoles) => {
    if (!currentUser || !allowedRoles) return false;
    
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.includes(currentUser.role);
    }
    
    return currentUser.role === allowedRoles;
  };

  const hasEditPermission = (resource) => {
    switch (resource) {
      case 'patient_details':
        return checkRole(['lab_staff', 'admin']);
      case 'clinical_info':
        return checkRole(['lab_staff', 'admin']);
      case 'documents':
        return checkRole(['lab_staff']);
      case 'physician_info':
        return checkRole(['lab_staff', 'admin']);
      case 'study_assignments':
        return checkRole(['admin']);
      case 'reports':
        return checkRole(['doctor_account']);
      default:
        return false;
    }
  };

  const hasViewPermission = (resource) => {
    switch (resource) {
      case 'patient_details':
        return checkRole(['lab_staff', 'admin', 'doctor_account']);
      case 'clinical_info':
        return checkRole(['lab_staff', 'admin', 'doctor_account']);
      case 'documents':
        return checkRole(['lab_staff', 'admin', 'doctor_account']);
      case 'physician_info':
        return checkRole(['lab_staff', 'admin', 'doctor_account']);
      case 'reports':
        return checkRole(['lab_staff', 'admin', 'doctor_account']);
      case 'admin_functions':
        return checkRole(['admin']);
      default:
        return false;
    }
  };

  const hasDownloadPermission = (documentType) => {
    switch (documentType) {
      case 'clinical_documents':
        return checkRole(['lab_staff', 'admin', 'doctor_account']);
      case 'reports':
        return checkRole(['lab_staff', 'admin', 'doctor_account']);
      case 'lab_reports':
        return checkRole(['admin', 'doctor_account']);
      default:
        return false;
    }
  };

  const hasUploadPermission = (documentType) => {
    switch (documentType) {
      case 'clinical_documents':
        return checkRole(['lab_staff', 'admin']);
      case 'reports':
        return checkRole(['doctor_account', 'admin']);
      case 'attachments':
        return checkRole(['lab_staff', 'admin']);
      default:
        return false;
    }
  };

  const roleConfig = {
    lab_staff: {
      canEdit: ['patient_details', 'clinical_info', 'documents', 'physician_info'],
      canView: ['patient_details', 'clinical_info', 'documents', 'physician_info', 'reports'],
      canUpload: ['clinical_documents', 'attachments'],
      canDownload: ['clinical_documents', 'reports'],
      name: 'Lab Staff'
    },
    admin: {
      canEdit: ['patient_details', 'clinical_info', 'documents', 'physician_info', 'study_assignments'],
      canView: ['patient_details', 'clinical_info', 'documents', 'physician_info', 'reports', 'admin_functions'],
      canUpload: ['clinical_documents', 'reports', 'attachments'],
      canDownload: ['clinical_documents', 'reports', 'lab_reports'],
      name: 'Administrator'
    },
    doctor_account: {
      canEdit: ['reports'],
      canView: ['patient_details', 'clinical_info', 'documents', 'physician_info', 'reports'],
      canUpload: ['reports'],
      canDownload: ['clinical_documents', 'reports', 'lab_reports'],
      name: 'Doctor'
    }
  };

  const getCurrentUserConfig = () => {
    return roleConfig[currentUser?.role] || {};
  };

  return {
    currentUser,
    checkRole,
    hasEditPermission,
    hasViewPermission,
    hasDownloadPermission,
    hasUploadPermission,
    roleConfig,
    getCurrentUserConfig,
    isLabStaff: currentUser?.role === 'lab_staff',
    isAdmin: currentUser?.role === 'admin',
    isDoctor: currentUser?.role === 'doctor_account'
  };
};

export default useAllowedRoles;