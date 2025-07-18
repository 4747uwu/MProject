import React, { useState, useEffect } from 'react';
import api from '../../../services/api';
import LoadingSpinner from '../../../common/LoadingSpinner';
import useAllowedRoles from '../../../hooks/useAllowedRoles';
import { toast } from 'react-hot-toast';

const PatientDetailModal = ({ isOpen, onClose, patientId }) => {
  const { 
    hasEditPermission, 
    hasUploadPermission, 
    hasDownloadPermission,
    isLabStaff,
    isAdmin,
    isDoctor 
  } = useAllowedRoles();

  const [patientDetails, setPatientDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('clinical');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadType, setUploadType] = useState('Clinical');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Editable fields state
  // 🆕 NEW: Enhanced state for new fields
  const [editedData, setEditedData] = useState({
    patientInfo: {},
    clinicalInfo: {},
    // 🆕 NEW: Enhanced physician and technologist info
    physicianInfo: {
      referringPhysician: '',
      referringPhysicianName: '',
      referringPhysicianEmail: '',
      referringPhysicianMobile: '',
      referringPhysicianInstitution: '',
      referringPhysicianContact: '',
      requestingPhysician: '',
      requestingPhysicianEmail: '',
      requestingPhysicianMobile: '',
      requestingPhysicianInstitution: ''
    },
    // 🆕 NEW: Technologist information
    technologistInfo: {
      name: '',
      mobile: '',
      comments: '',
      reasonToSend: ''
    },
    // 🆕 NEW: Priority and time information
    priorityInfo: {
      studyPriority: 'SELECT',
      priorityLevel: 'NORMAL',
      caseType: 'routine'
    },
    timeInfo: {
      modifiedDate: '',
      modifiedTime: '',
      reportDate: '',
      reportTime: ''
    },
    referralInfo: '',
    studyInfo: {}
  });

  // Checkbox states
  const [clinicalHistoryChecked, setClinicalHistoryChecked] = useState(false);
  const [previousInjuryChecked, setPreviousInjuryChecked] = useState(false);
  const [previousSurgeryChecked, setPreviousSurgeryChecked] = useState(false);
  const [referringPhysician, setReferringPhysician] = useState(false);

  // Check permissions
  const canEdit = hasEditPermission('patient_details');
  const canUpload = hasUploadPermission('clinical_documents');
  const canDownload = hasDownloadPermission('clinical_documents');

  // Add this near the top with other state declarations
  const [currentPatientId, setCurrentPatientId] = useState(patientId);

  // Update the useEffect to use currentPatientId
  useEffect(() => {
    if (isOpen && currentPatientId) {
      fetchPatientDetails();
    }
  }, [isOpen, currentPatientId]);

  const fetchPatientDetails = async (fetchPatientId = null) => {
    const idToUse = fetchPatientId || currentPatientId;
    setLoading(true);
    setError('');
    
    try {
      console.log(`🔍 Fetching patient details for ID: ${idToUse}`);
      let response = await api.get(`/labEdit/patients/${idToUse}`);
      
      console.log('🔍 Patient Details Response:', response.data);
      
      const data = response.data.data;
      setPatientDetails(data);
      
      // Update currentPatientId if we fetched with a different ID
      if (fetchPatientId && fetchPatientId !== currentPatientId) {
        setCurrentPatientId(fetchPatientId);
      }
      
      // 🔧 ENHANCED: Map all new API fields to component state
      const fullName = data.patientInfo?.fullName || '';
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      setEditedData({
        patientInfo: {
          firstName: firstName,
          lastName: lastName,
          age: data.patientInfo?.age || 'N/A',
          gender: data.patientInfo?.gender || 'N/A',
          dateOfBirth: data.patientInfo?.dateOfBirth || '',
          contactNumber: data.patientInfo?.contactPhone || 'N/A',
          contactEmail: data.patientInfo?.contactEmail || 'N/A',
          address: data.patientInfo?.address || ''
        },
        clinicalInfo: {
          clinicalHistory: data.clinicalInfo?.clinicalHistory || '',
          previousInjury: data.clinicalInfo?.previousInjury || '',
          previousSurgery: data.clinicalInfo?.previousSurgery || ''
        },
        // 🆕 NEW: Enhanced physician information from API
        physicianInfo: {
          referringPhysician: data.visitInfo?.referringPhysician !== 'N/A' ? data.visitInfo?.referringPhysician : '',
          referringPhysicianName: data.studyInfo?.physicians?.referring?.name || data.visitInfo?.referringPhysician || '',
          referringPhysicianEmail: data.studyInfo?.physicians?.referring?.email || data.visitInfo?.referringPhysicianEmail || '',
          referringPhysicianMobile: data.studyInfo?.physicians?.referring?.mobile || data.visitInfo?.referringPhysicianMobile || '',
          referringPhysicianInstitution: data.studyInfo?.physicians?.referring?.institution || data.visitInfo?.referringPhysicianInstitution || '',
          referringPhysicianContact: data.studyInfo?.physicians?.referring?.contactInfo || data.visitInfo?.referringPhysicianContact || '',
          requestingPhysician: data.studyInfo?.physicians?.requesting?.name || data.visitInfo?.requestingPhysician || '',
          requestingPhysicianEmail: data.studyInfo?.physicians?.requesting?.email || data.visitInfo?.requestingPhysicianEmail || '',
          requestingPhysicianMobile: data.studyInfo?.physicians?.requesting?.mobile || data.visitInfo?.requestingPhysicianMobile || '',
          requestingPhysicianInstitution: data.studyInfo?.physicians?.requesting?.institution || data.visitInfo?.requestingPhysicianInstitution || ''
        },
        // 🆕 NEW: Technologist information from API
        technologistInfo: {
          name: data.studyInfo?.technologist?.name || data.visitInfo?.technologistName || '',
          mobile: data.studyInfo?.technologist?.mobile || data.visitInfo?.technologistMobile || '',
          comments: data.studyInfo?.technologist?.comments || data.visitInfo?.technologistComments || '',
          reasonToSend: data.studyInfo?.technologist?.reasonToSend || data.visitInfo?.technologistReasonToSend || ''
        },
        // 🆕 NEW: Priority information from API
        priorityInfo: {
          studyPriority: data.studyInfo?.studyPriority || data.visitInfo?.studyPriority || 'SELECT',
          priorityLevel: data.studyInfo?.priorityLevel || data.visitInfo?.priorityLevel || 'NORMAL',
          caseType: data.studyInfo?.caseType || data.visitInfo?.caseType || 'routine'
        },
        // 🆕 NEW: Time information from API
        timeInfo: {
          modifiedDate: data.studyInfo?.modifiedDate || data.visitInfo?.modifiedDate || '',
          modifiedTime: data.studyInfo?.modifiedTime || data.visitInfo?.modifiedTime || '',
          reportDate: data.studyInfo?.reportDate || data.visitInfo?.reportDate || '',
          reportTime: data.studyInfo?.reportTime || data.visitInfo?.reportTime || ''
        },
        referralInfo: '',
        studyInfo: {
          caseType: data.visitInfo?.caseType || 'ROUTINE',
          workflowStatus: data.studyInfo?.status || data.visitInfo?.studyStatus || 'NEW'
        }
      });
      
      // Initialize checkboxes based on actual data
      setClinicalHistoryChecked(!!data.clinicalInfo?.clinicalHistory);
      setPreviousInjuryChecked(!!data.clinicalInfo?.previousInjury);
      setPreviousSurgeryChecked(!!data.clinicalInfo?.previousSurgery);
      setReferringPhysician(data.visitInfo?.referringPhysician !== 'N/A' && !!data.visitInfo?.referringPhysician);
      
      setLoading(false);
      console.log('✅ Enhanced patient data mapped successfully');
      
    } catch (error) {
      console.error('Error fetching patient details:', error);
      
      // Better error handling for 404
      if (error.response?.status === 404) {
        setError(`Patient with ID "${idToUse}" not found. The patient ID may have been changed or the patient may not exist.`);
      } else {
        setError('An error occurred while fetching patient details');
      }
      setLoading(false);
    }
  };

  const handleInputChange = (section, field, value) => {
    if (!canEdit) return;
    
    setEditedData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleFileChange = (e) => {
    if (!canUpload) {
      toast.error('You do not have permission to upload files');
      return;
    }
    setSelectedFiles(Array.from(e.target.files));
  };

  const handleUploadFile = async () => {
    if (!selectedFiles.length || !canUpload) {
      toast.error('Please select file(s) or check your permissions');
      return;
    }

    let currentStudyId = null;
    if (patientDetails?.studies && patientDetails.studies.length > 0) {
      currentStudyId = patientDetails.studies[0].studyInstanceUID;
    } else if (patientDetails?.studyInfo?.studyId) {
      currentStudyId = patientDetails.studyInfo.studyId;
    } else if (patientDetails?.allStudies && patientDetails.allStudies.length > 0) {
      currentStudyId = patientDetails.allStudies[0].studyId;
    }

    setUploading(true);

    try {
      // Use FormData and append all files
      const formData = new FormData();
      selectedFiles.forEach(file => formData.append('files', file));
      formData.append('documentType', uploadType.toLowerCase());
      formData.append('type', uploadType);
      if (currentStudyId) {
        formData.append('studyId', currentStudyId);
      }

      const response = await api.post(`/labEdit/patients/${currentPatientId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      });

      toast.success('Document(s) uploaded successfully');
      setSelectedFiles([]);
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      await fetchPatientDetails();

    } catch (error) {
      console.error('❌ Error uploading file(s):', error);
      toast.error(error.response?.data?.message || 'Failed to upload document(s)');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit this record');
      return;
    }

    setSaving(true);
    
    try {
      // 🔧 ENHANCED: Include ALL new fields in the update data
      const updateData = {
        patientInfo: {
          firstName: editedData.patientInfo.firstName,
          lastName: editedData.patientInfo.lastName,
          age: editedData.patientInfo.age,
          gender: editedData.patientInfo.gender,
          dateOfBirth: editedData.patientInfo.dateOfBirth,
          contactNumber: editedData.patientInfo.contactNumber,
          contactEmail: editedData.patientInfo.contactEmail,
          patientId: editedData.patientInfo.patientId
        },
        clinicalInfo: {
          clinicalHistory: clinicalHistoryChecked ? editedData.clinicalInfo.clinicalHistory : '',
          previousInjury: previousInjuryChecked ? editedData.clinicalInfo.previousInjury : '',
          previousSurgery: previousSurgeryChecked ? editedData.clinicalInfo.previousSurgery : ''
        },
        // 🆕 ENHANCED: Complete physician information
        physicianInfo: {
          // Referring physician
          referringPhysicianName: editedData.physicianInfo.referringPhysicianName,
          referringPhysician: editedData.physicianInfo.referringPhysician,
          referringPhysicianEmail: editedData.physicianInfo.referringPhysicianEmail,
          referringPhysicianMobile: editedData.physicianInfo.referringPhysicianMobile,
          referringPhysicianInstitution: editedData.physicianInfo.referringPhysicianInstitution,
          referringPhysicianContact: editedData.physicianInfo.referringPhysicianContact,
          
          // Requesting physician
          requestingPhysician: editedData.physicianInfo.requestingPhysician,
          requestingPhysicianEmail: editedData.physicianInfo.requestingPhysicianEmail,
          requestingPhysicianMobile: editedData.physicianInfo.requestingPhysicianMobile,
          requestingPhysicianInstitution: editedData.physicianInfo.requestingPhysicianInstitution
        },
        // 🆕 NEW: Technologist information
        technologistInfo: {
          name: editedData.technologistInfo.name,
          mobile: editedData.technologistInfo.mobile,
          comments: editedData.technologistInfo.comments,
          reasonToSend: editedData.technologistInfo.reasonToSend
        },
        // 🆕 NEW: Priority information
        priorityInfo: {
          studyPriority: editedData.priorityInfo.studyPriority,
          priorityLevel: editedData.priorityInfo.priorityLevel,
          caseType: editedData.priorityInfo.caseType
        },
        // 🆕 NEW: Time information (usually read-only, but include for completeness)
        timeInfo: {
          modifiedDate: editedData.timeInfo.modifiedDate,
          modifiedTime: editedData.timeInfo.modifiedTime,
          reportDate: editedData.timeInfo.reportDate,
          reportTime: editedData.timeInfo.reportTime
        },
        referralInfo: editedData.referralInfo,
        studyInfo: {
          ...editedData.studyInfo,
          // 🆕 NEW: Include exam description
          examDescription: editedData.studyInfo.examDescription
        }
      };

      console.log('📤 Sending COMPLETE update data with all new fields:', JSON.stringify(updateData, null, 2));

      const endpoint = isLabStaff ? `/labEdit/patients/${currentPatientId}` : `/labEdit/patients/${currentPatientId}`;
      const response = await api.put(endpoint, updateData);
      
      console.log('✅ Update response:', response.data);

      // 🆕 ENHANCED: Handle patient ID change
      const newPatientId = response.data?.newPatientId;
      if (newPatientId && newPatientId !== currentPatientId) {
        toast.success(
          `✅ Patient updated successfully!\n🆔 Patient ID changed from ${currentPatientId} to ${newPatientId}\n🔄 Refreshing data...`,
          {
            duration: 4000,
            style: {
              background: '#10B981',
              color: 'white',
            },
            icon: '🆔',
          }
        );
        
        // Update the current patient ID
        setCurrentPatientId(newPatientId);
        
        // Update the URL if you're using React Router
        if (window.history && window.history.replaceState) {
          const newUrl = window.location.pathname.replace(currentPatientId, newPatientId);
          window.history.replaceState({}, '', newUrl);
        }
        
        // Call parent component's callback if provided
        if (typeof onPatientIdChange === 'function') {
          onPatientIdChange(newPatientId);
        }
        
        // Refresh with new patient ID
        setTimeout(() => {
          fetchPatientDetails(newPatientId);
        }, 1000);
        
        return;
      }

      // Regular success message
      let successMessage = 'Patient information updated successfully';
      const updatedFields = [];
      
      if (response.data.data?.updateSummary?.technologistUpdated) updatedFields.push('technologist');
      if (response.data.data?.updateSummary?.priorityInfoUpdated) updatedFields.push('priority settings');
      if (response.data.data?.updateSummary?.referringPhysicianUpdated) updatedFields.push('referring physician');
      if (response.data.data?.updateSummary?.requestingPhysicianUpdated) updatedFields.push('requesting physician');
      
      if (updatedFields.length > 0) {
        successMessage += ` (including ${updatedFields.join(', ')})`;
      }
      
      toast.success(successMessage);
      fetchPatientDetails(); // Refresh data
      
    } catch (error) {
      console.error('Error saving patient data:', error);
      
      if (error.response?.data?.message) {
        toast.error(`Failed to save: ${error.response.data.message}`);
      } else if (error.response?.status === 403) {
        toast.error('Access denied: You do not have permission to perform this action');
      } else if (error.response?.status === 404) {
        toast.error(`Patient with ID "${currentPatientId}" not found. Please refresh and try again.`);
      } else {
        toast.error('Failed to save patient information');
      }
    } finally {
      setSaving(false);
    }
  };

  // 🔧 NEW: Function to get all documents (patient + study)
  const getAllDocuments = () => {
    const patientDocs = patientDetails?.documents || [];
    const studyReports = patientDetails?.studyReports || [];
    
    // Combine and sort by upload date
    const allDocs = [
      ...patientDocs.map(doc => ({ ...doc, source: 'patient' })),
      ...studyReports.map(report => ({ ...report, source: 'study' }))
    ].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    return allDocs;
  };

  // 🔧 ENHANCED: Single download function with comprehensive toast notifications
  const handleDownloadDocument = async (doc, index) => {
    if (!canDownload) {
      toast.error('You do not have permission to download documents');
      return;
    }

    try {
      console.log(`🔽 Downloading document:`, doc);
      
      // 🆕 NEW: Initial toast to indicate download preparation
      const downloadToast = toast.loading(
        `📋 Preparing download for: ${doc.fileName}...`,
        {
          duration: 4000,
          style: {
            background: '#3B82F6',
            color: 'white',
          },
          icon: '📋',
        }
      );
      
      // 🔧 SIMPLE: Use a single download endpoint for all documents
      let downloadUrl;
      
      if (doc.source === 'study') {
        // For study documents, use the study report download endpoint
        downloadUrl = `/labEdit/studies/${doc.studyId}/reports/${doc._id}/download`;
        console.log(`📋 Study report download URL: ${downloadUrl}`);
      } else {
        // For patient documents, find the actual index in patient.documents array
        const patientDocIndex = patientDetails.documents.findIndex(d => d._id === doc._id);
        if (patientDocIndex === -1) {
          toast.dismiss(downloadToast);
          toast.error('❌ Document not found in patient records');
          return;
        }
        downloadUrl = `/labEdit/patients/${currentPatientId}/documents/${patientDocIndex}/download`;
        console.log(`📄 Patient document download URL: ${downloadUrl}`);
      }
      
      // 🆕 NEW: Update toast to show server request progress
      toast.loading(
        `🌐 Contacting server for: ${doc.fileName}...`,
        {
          id: downloadToast,
          style: {
            background: '#059669',
            color: 'white',
          },
          icon: '🌐',
        }
      );
      
      console.log(`🔗 Download URL: ${downloadUrl}`);
      
      const response = await api.get(downloadUrl, {
        responseType: 'blob',
        timeout: 30000,
        // 🆕 NEW: Add progress tracking for downloads
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.lengthComputable) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`📊 Download progress: ${percentCompleted}%`);
            
            // Update toast with progress (only show after 10% to avoid spam)
            if (percentCompleted >= 10) {
              toast.loading(
                `⬇️ Downloading ${doc.fileName}... ${percentCompleted}%`,
                {
                  id: downloadToast,
                  style: {
                    background: '#7C3AED',
                    color: 'white',
                  },
                  icon: '📊',
                }
              );
            }
          }
        }
      });
      
      // 🆕 NEW: Update toast to show file processing
      toast.loading(
        `⚙️ Processing ${doc.fileName} for download...`,
        {
          id: downloadToast,
          style: {
            background: '#F59E0B',
            color: 'white',
          },
          icon: '⚙️',
        }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      // 🆕 NEW: Enhanced success toast with file details
      const fileSize = doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : 'Unknown size';
      const fileType = doc.fileType || doc.documentType || 'Unknown type';
      
      toast.success(
        `✅ Download completed successfully!\n📁 File: ${doc.fileName}\n💾 Size: ${fileSize}\n📋 Type: ${fileType}`,
        {
          id: downloadToast,
          duration: 4000,
          style: {
            background: '#10B981',
            color: 'white',
            fontSize: '14px',
          },
          icon: '🎉',
        }
      );
      
      // 🆕 NEW: Additional notification toast for user guidance
      
      
      console.log(`✅ Successfully downloaded: ${doc.fileName}`);
      
    } catch (error) {
      console.error('❌ Error downloading document:', error);
      
      // 🆕 NEW: Enhanced error handling with specific error toasts
      let errorMessage = 'Failed to download document';
      let errorDetails = '';
      let errorIcon = '❌';
      
      if (error.response?.status === 404) {
        errorMessage = '📄 Document not found';
        errorDetails = 'The requested document may have been moved or deleted from the server';
        errorIcon = '🔍';
      } else if (error.response?.status === 403) {
        errorMessage = '🔒 Access denied';
        errorDetails = 'You do not have permission to download this document';
        errorIcon = '🚫';
      } else if (error.response?.status === 500) {
        errorMessage = '🖥️ Server error';
        errorDetails = 'The server encountered an error. Please try again or contact support';
        errorIcon = '🛠️';
      } else if (error.code === 'NETWORK_ERROR') {
        errorMessage = '🌐 Network error';
        errorDetails = 'Please check your internet connection and try again';
        errorIcon = '📡';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '⏱️ Download timeout';
        errorDetails = 'The download took too long. Please try again with a stable connection';
        errorIcon = '⏰';
      } else if (error.response?.data?.message) {
        errorMessage = '⚠️ Download failed';
        errorDetails = error.response.data.message;
        errorIcon = '⚠️';
      }
      
      toast.error(
        `${errorIcon} ${errorMessage}\n${errorDetails}`,
        {
          duration: 6000,
          style: {
            background: '#EF4444',
            color: 'white',
            fontSize: '14px',
          },
          icon: errorIcon,
        }
      );
      
      // 🆕 NEW: Helpful suggestion toast for common errors
      if (error.response?.status === 404 || error.code === 'NETWORK_ERROR') {
        setTimeout(() => {
          toast(
            `💡 Suggestion: Try refreshing the page or contact support if the issue persists`,
            {
              duration: 4000,
              style: {
                background: '#6B7280',
                color: 'white',
              },
              icon: '💡',
            }
          );
        }, 2000);
      }
    }
  };

  const calculateFrontendTAT = (patientDetails) => {
    console.log(`[Frontend TAT] Calculating TAT with data:`, {
        hasStudies: !!patientDetails?.studies?.length,
        hasResetInfo: !!patientDetails?.tatResetInfo,
        resetWasPerformed: !!patientDetails?.tatResetInfo?.wasReset,
        hasFreshTATData: !!patientDetails?.tatResetInfo?.freshTATData?.length,
        hasVisitInfo: !!patientDetails?.visitInfo
    });

    // 🔧 PRIORITY 1: Check if we just performed a TAT reset and have fresh data
    if (patientDetails?.tatResetInfo?.wasReset && 
        patientDetails?.tatResetInfo?.freshTATData && 
        patientDetails.tatResetInfo.freshTATData.length > 0) {
        
        const freshTAT = patientDetails.tatResetInfo.freshTATData[0].tat;
        console.log(`[Frontend TAT] Found fresh TAT data from reset:`, freshTAT);
        
        // Use resetAwareTATDays if available, otherwise totalTATDays
        if (freshTAT.resetAwareTATDays !== null && freshTAT.resetAwareTATDays !== undefined) {
            console.log(`[Frontend TAT] Using fresh resetAwareTATDays: ${freshTAT.resetAwareTATDays} days`);
            return freshTAT.resetAwareTATDays;
        } else if (freshTAT.totalTATDays !== null && freshTAT.totalTATDays !== undefined) {
            console.log(`[Frontend TAT] Using fresh totalTATDays: ${freshTAT.totalTATDays} days`);
            return freshTAT.totalTATDays;
        }
    }

    // 🔧 PRIORITY 2: Use backend calculated TAT from studies if available
    if (patientDetails?.studies?.[0]?.tat?.totalTATDays !== null && 
        patientDetails?.studies?.[0]?.tat?.totalTATDays !== undefined) {
        console.log(`[Frontend TAT] Using backend calculated TAT: ${patientDetails.studies[0].tat.totalTATDays} days`);
        return patientDetails.studies[0].tat.totalTATDays;
    }
    
    // 🔧 PRIORITY 3: Use reset-aware TAT from studies if TAT was reset
    if (patientDetails?.studies?.[0]?.tat?.resetAwareTATDays !== null && 
        patientDetails?.studies?.[0]?.tat?.resetAwareTATDays !== undefined) {
        console.log(`[Frontend TAT] Using reset-aware TAT: ${patientDetails.studies[0].tat.resetAwareTATDays} days`);
        return patientDetails.studies[0].tat.resetAwareTATDays;
    }
    
    // 🔧 FALLBACK: Calculate from order date if no backend TAT
    if (patientDetails?.visitInfo?.orderDate) {
        const startDate = new Date(patientDetails.visitInfo.orderDate);
        if (!isNaN(startDate.getTime())) {
            const currentDate = new Date();
            const totalDays = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
            console.log(`[Frontend TAT] Calculated from order date: ${totalDays} days`);
            return totalDays;
        }
    }
    
    console.log(`[Frontend TAT] No valid TAT data found, returning 0`);
    return 0;
};
    

  // 🔧 ENHANCED: Delete function (only for patient documents)
  const handleDeleteDocument = async (doc, index) => {
    if (!canEdit) {
      toast.error('You do not have permission to delete documents');
      return;
    }
  
    const documentName = doc.fileName || `Document #${index + 1}`;
  
    if (!window.confirm(`Are you sure you want to delete "${documentName}"?\n\nThis action cannot be undone.`)) {
      return;
    }
  
    try {
      let deleteUrl = '';
      if (doc.source === 'patient') {
        // Patient document: use patient document delete route
        deleteUrl = `/labEdit/patients/${patientId}/documents/${index}`;
      } else if (doc.source === 'study') {
        // Study report: use new study report delete route
        deleteUrl = `/labEdit/studies/${doc.studyId}/reports/${doc._id}`;
      } else {
        toast.error('Unknown document type');
        return;
      }
  
      const response = await api.delete(deleteUrl);
  
      toast.success(`Document "${documentName}" deleted successfully`);
      await fetchPatientDetails();
  
    } catch (error) {
      console.error('❌ Error deleting document:', error);
      toast.error(error.response?.data?.message || 'Failed to delete document');
    }
  };
  if (!isOpen) return null;

  // 🔧 UPDATED FORMAT DATE FUNCTION
  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    
    // Handle YYYYMMDD format
    if (dateStr.length === 8 && !dateStr.includes('-')) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${day}-${month}-${year}`;
    }
    
    // Handle ISO date format
    if (dateStr.includes('T')) {
      return new Date(dateStr).toLocaleDateString('en-GB');
    }
    
    return dateStr;
  };

  // 🔧 UPDATED FORMAT WORKFLOW STATUS
  const formatWorkflowStatus = (status) => {
    const statusMap = {
      'new_study_received': 'New Study Received',
      'assigned_to_doctor': 'Assigned to Doctor',
      'report_in_progress': 'Report in Progress',
      'report_finalized': 'Report Finalized',
      'report_downloaded': 'Report Downloaded',
      'final_report_downloaded': 'Final Report Downloaded'
    };
    return statusMap[status] || status;
  };

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="relative w-full max-w-7xl max-h-[95vh] bg-white shadow-lg rounded-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gray-600 text-white p-3 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-medium">
              {patientDetails?.patientInfo?.fullName?.trim() || 'Unknown Patient'} - Patient Details
            </h3>
            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded">
              ID: {currentPatientId}
            </span>
            {canEdit && (
              <span className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                Editable
              </span>
            )}
            {!canEdit && (
              <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded">
                View Only
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-300">
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* Tabs Navigation */}
        <div className="flex border-b border-gray-300">
          <button
            onClick={() => setActiveTab('clinical')}
            className={`px-4 py-2 ${
              activeTab === 'clinical' ? 'bg-white text-blue-700 border-b-2 border-blue-700' : 'bg-gray-200'
            }`}
          >
            CLINICAL HISTORY
          </button>
          <button
            onClick={() => setActiveTab('visit')}
            className={`px-4 py-2 ${
              activeTab === 'visit' ? 'bg-white text-blue-700 border-b-2 border-blue-700' : 'bg-gray-200'
            }`}
          >
            VISIT INFORMATION
          </button>
          <button
            onClick={() => setActiveTab('studies')}
            className={`px-4 py-2 ${
              activeTab === 'studies' ? 'bg-white text-blue-700 border-b-2 border-blue-700' : 'bg-gray-200'
            }`}
          >
            ALL STUDIES ({patientDetails?.allStudies?.length || 0})
          </button>
          <div className="flex-grow bg-gray-700 text-white px-4 flex items-center justify-between">
            <div>TOTAL TAT: {calculateFrontendTAT(patientDetails)} days</div>
            <div>STATUS: {formatWorkflowStatus(patientDetails?.visitInfo?.studyStatus)}</div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="p-8 text-center">
              <LoadingSpinner />
              <p className="mt-2">Loading patient details...</p>
            </div>
          ) : (
            <div className="p-0">
              {/* Error Message */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mx-4 mt-4 rounded">
                  {error}
                </div>
              )}

              {/* 🔧 ENHANCED: Patient & Study Related Information Section */}
              <div className="bg-beige-100 p-4" style={{ backgroundColor: '#f5f5dc' }}>
                <h2 className="text-gray-700 font-medium mb-4">
                  Patient & Study Related Information
                  {canEdit && <span className="text-green-600 text-sm ml-2">(Editable)</span>}
                </h2>
                
                <div className="grid grid-cols-6 gap-3 text-sm">
                  {/* Row 1: Patient Basic Info */}
                  <div>
                    <label className="block text-xs mb-1">Salutation</label>
                    <select 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      disabled={!canEdit}
                    >
                      <option>SELECT</option>
                      <option>Mr</option>
                      <option>Mrs</option>
                      <option>Ms</option>
                      <option>Dr</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Patient Name</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={`${editedData.patientInfo.firstName} ${editedData.patientInfo.lastName}`.trim()}
                      onChange={(e) => {
                        const nameParts = e.target.value.trim().split(' ');
                        const firstName = nameParts[0] || '';
                        const lastName = nameParts.slice(1).join(' ') || '';
                        handleInputChange('patientInfo', 'firstName', firstName);
                        handleInputChange('patientInfo', 'lastName', lastName);
                      }}
                      readOnly={!canEdit}
                    />
                  </div>

                  <div>
                    <label className="block text-xs mb-1">Patient ID</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.patientInfo.patientId || patientDetails?.patientInfo?.patientId || ''}
                      onChange={(e) => handleInputChange('patientInfo', 'patientId', e.target.value)}
                      readOnly={!canEdit}
                      placeholder="Patient ID"
                    />
                  </div>

                  <div>
                    <label className="block text-xs mb-1">Age</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.patientInfo.age}
                      onChange={(e) => handleInputChange('patientInfo', 'age', e.target.value)}
                      readOnly={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Gender</label>
                    <select 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.patientInfo.gender}
                      onChange={(e) => handleInputChange('patientInfo', 'gender', e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="">Select</option>
                      <option value="M">M</option>
                      <option value="F">F</option>
                      <option value="O">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Accession No</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={patientDetails?.studyInfo?.accessionNumber || 'N/A'}
                      readOnly
                    />
                  </div>

                  {/* Row 2: Additional Info */}
                  <div>
                    <label className="block text-xs mb-1">DOB</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={formatDate(editedData.patientInfo.dateOfBirth)}
                      onChange={(e) => handleInputChange('patientInfo', 'dateOfBirth', e.target.value)}
                      readOnly={!canEdit}
                      placeholder="yyyy-mm-dd"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Images</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={patientDetails?.studyInfo?.numberOfImages || '0'}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Series</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={patientDetails?.studyInfo?.numberOfSeries || '0'}
                      readOnly
                    />
                  </div>

                  <div>
                      <label className="block text-xs mb-1">Exam Description</label>
                      <input
                        type="text"
                        className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                        value={editedData.studyInfo.examDescription ?? patientDetails?.studyInfo?.examDescription ?? ''}
                        onChange={e => canEdit && handleInputChange('studyInfo', 'examDescription', e.target.value)}
                        readOnly={!canEdit}
                        placeholder="Exam Description"
                      />
                    </div>


                  <div>
                    <label className="block text-xs mb-1">Code</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      placeholder="Study Code"
                      readOnly={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Date</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={formatDate(patientDetails?.studyInfo?.studyDate)}
                      readOnly
                    />
                  </div>

                  {/* Row 3: Case and Priority Info */}
                  <div>
                    <label className="block text-xs mb-1">Case Type</label>
                    <select 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.priorityInfo.caseType}
                      onChange={(e) => handleInputChange('priorityInfo', 'caseType', e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="routine">ROUTINE</option>
                      <option value="urgent">URGENT</option>
                      <option value="emergency">EMERGENCY</option>
                      <option value="stat">STAT</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Study status change</label>
                    <select 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.priorityInfo.studyPriority}
                      onChange={(e) => handleInputChange('priorityInfo', 'studyPriority', e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="SELECT">SELECT</option>
                      <option value="Emergency Case">Emergency Case</option>
                      <option value="Meet referral doctor">Meet referral doctor</option>
                      <option value="MLC Case">MLC Case</option>
                      <option value="Study Exception">Study Exception</option>
                      <option value="Billed Study">Billed Study</option>
                      <option value="New Study">New Study</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ fontSize: '10px' }}>
                      (Select this if you need immediate Report or meet referral doctor)
                    </label>
                    <select 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.priorityInfo.priorityLevel}
                      onChange={(e) => handleInputChange('priorityInfo', 'priorityLevel', e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="NORMAL">NORMAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                      <option value="STAT">STAT</option>
                      <option value="EMERGENCY">EMERGENCY</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">LMP</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      placeholder="yyyy-mm-dd"
                      readOnly={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Modified Date</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={formatDate(editedData.timeInfo.modifiedDate)}
                      readOnly
                    />
                  </div>

                  {/* Row 4: Time Information */}
                  <div>
                    <label className="block text-xs mb-1">Time</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={editedData.timeInfo.modifiedTime || 'HH:MM'}
                      readOnly
                      placeholder="HH:MM"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">ReportDate</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={formatDate(editedData.timeInfo.reportDate)}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Time</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100"
                      value={editedData.timeInfo.reportTime || '00:00'}
                      readOnly
                      placeholder="HH:MM"
                    />
                  </div>
                  <div className="col-span-3">
                    {/* Empty space for layout */}
                  </div>
                </div>
              </div>

              {/* Clinical Information Tab */}
              {activeTab === 'clinical' && (
                <>
                  {/* 🔧 EXISTING: Clinical Information Section */}
                  <div className="p-4">
                    <h2 className="text-gray-700 font-medium mb-4">
                      Clinical Information
                      {canEdit && <span className="text-green-600 text-sm ml-2">(Editable)</span>}
                    </h2>
                    
                    <div className="flex flex-row gap-4">
                      {/* Left side - Clinical History */}
                      <div className="flex-1">
                        <div className="mb-3">
                          <div className="flex items-start">
                            <input 
                              type="checkbox" 
                              id="clinicalHistory" 
                              className="mt-1"
                              checked={clinicalHistoryChecked}
                              onChange={() => setClinicalHistoryChecked(!clinicalHistoryChecked)}
                              disabled={!canEdit}
                            />
                            <label htmlFor="clinicalHistory" className="ml-2 block text-sm">Clinical History</label>
                          </div>
                          <textarea 
                            className={`w-full border p-1.5 mt-1 text-sm ${canEdit && clinicalHistoryChecked ? 'bg-white' : 'bg-gray-100'}`}
                            rows="4"
                            value={clinicalHistoryChecked ? editedData.clinicalInfo.clinicalHistory : ''}
                            onChange={(e) => handleInputChange('clinicalInfo', 'clinicalHistory', e.target.value)}
                            readOnly={!clinicalHistoryChecked || !canEdit}
                          />
                        </div>
                        
                        <div className="mb-3">
                          <div className="flex items-start">
                            <input 
                              type="checkbox" 
                              id="previousInjury" 
                              className="mt-1"
                              checked={previousInjuryChecked}
                              onChange={() => setPreviousInjuryChecked(!previousInjuryChecked)}
                              disabled={!canEdit}
                            />
                            <label htmlFor="previousInjury" className="ml-2 block text-sm">Previous Injury</label>
                          </div>
                          <textarea 
                            className={`w-full border p-1.5 mt-1 text-sm ${canEdit && previousInjuryChecked ? 'bg-white' : 'bg-gray-100'}`}
                            rows="2"
                            value={previousInjuryChecked ? editedData.clinicalInfo.previousInjury : ''}
                            onChange={(e) => handleInputChange('clinicalInfo', 'previousInjury', e.target.value)}
                            readOnly={!previousInjuryChecked || !canEdit}
                          />
                        </div>
                        
                        <div className="mb-3">
                          <div className="flex items-start">
                            <input 
                              type="checkbox" 
                              id="previousSurgery" 
                              className="mt-1"
                              checked={previousSurgeryChecked}
                              onChange={() => setPreviousSurgeryChecked(!previousSurgeryChecked)}
                              disabled={!canEdit}
                            />
                            <label htmlFor="previousSurgery" className="ml-2 block text-sm">Previous Surgery</label>
                          </div>
                          <textarea 
                            className={`w-full border p-1.5 mt-1 text-sm ${canEdit && previousSurgeryChecked ? 'bg-white' : 'bg-gray-100'}`}
                            rows="2"
                            value={previousSurgeryChecked ? editedData.clinicalInfo.previousSurgery : ''}
                            onChange={(e) => handleInputChange('clinicalInfo', 'previousSurgery', e.target.value)}
                            readOnly={!previousSurgeryChecked || !canEdit}
                          />
                        </div>
                      </div>
                      
                      {/* Right side - Attach Documents */}
                      <div className="flex-1">
                        <h2 className="text-gray-700 font-medium mb-2">
                          Attach Documents
                          {canUpload && <span className="text-green-600 text-sm ml-2">(Upload Enabled)</span>}
                        </h2>
                        <p className="text-red-500 text-xs mb-3">
                          (Select a file from the local pc and click upload the attachments)
                        </p>
                        
                        {canUpload && (
                          <div className="flex items-center mb-3 text-sm">
                            <label className={`${canUpload ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-300'} text-white py-1 px-2 border cursor-pointer transition-colors`}>
                              <span className="flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                                Choose File...
                              </span>
                              <input 
                                type="file" 
                                className="hidden" 
                                onChange={handleFileChange}
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.txt"
                                multiple
                              />
                            </label>
                            
                            <select 
                              className="ml-2 border p-1 text-sm" 
                              value={uploadType}
                              onChange={(e) => setUploadType(e.target.value)}
                              disabled={!canUpload}
                            >
                              <option value="Clinical">Clinical</option>
                              <option value="Radiology">Radiology</option>
                              <option value="Lab">Lab</option>
                              <option value="Other">Other</option>
                            </select>
                            
                            <button 
                              className={`ml-2 py-1 px-2 text-sm transition-colors ${
                                canUpload && selectedFiles.length > 0 && !uploading 
                                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                                  : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              }`}
                              onClick={handleUploadFile}
                              disabled={uploading || !canUpload}
                            >
                              {uploading ? 'Uploading...' : 'Upload File'}
                            </button>
                          </div>
                        )}

                        {/* Selected files display */}
                        {selectedFiles.length > 0 && (
                          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                            <strong>Selected:</strong>
                            <ul className="list-disc list-inside">
                              {selectedFiles.map((file, index) => (
                                <li key={index}>
                                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* 🔧 SIMPLIFIED: Documents table - removed Source and Study Link columns */}
                        <table className="w-full border text-sm">
                          <thead>
                            <tr className="bg-gray-700 text-white">
                              <th className="p-2 text-left">File</th>
                              <th className="p-2 text-left">Type</th>
                              <th className="p-2 text-left">Uploaded</th>
                              <th className="p-2 text-left">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getAllDocuments().length > 0 ? (
                              getAllDocuments().map((doc, index) => (
                                <tr key={`${doc.source}-${doc._id}-${index}`} className="hover:bg-gray-100">
                                  <td className="p-2">
                                    <div className="flex items-center">
                                      {/* File type icon */}
                                      <span className="mr-2">
                                        {doc.contentType?.includes('pdf') ? '📄' : 
                                         doc.contentType?.includes('image') ? '🖼️' : 
                                         doc.contentType?.includes('word') ? '📝' : '📁'}
                                      </span>
                                      <div>
                                        <div className="font-medium">{doc.fileName}</div>
                                        <div className="text-xs text-gray-500">
                                          {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : 'Size unknown'}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                      doc.documentType === 'clinical' || doc.fileType === 'Clinical' ? 'bg-blue-100 text-blue-800' :
                                      doc.fileType === 'Radiology' ? 'bg-green-100 text-green-800' :
                                      doc.fileType === 'uploaded-report' ? 'bg-purple-100 text-purple-800' :
                                      doc.fileType === 'Lab' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {doc.fileType === 'uploaded-report' ? 'Study Report' : 
                                       (doc.documentType || doc.fileType || 'Unknown')}
                                    </span>
                                  </td>
                                  <td className="p-2 text-xs">
                                    <div>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-GB') : 'N/A'}</div>
                                    <div className="text-gray-500">
                                      {doc.uploadedBy || 'Unknown user'}
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <div className="flex space-x-2">
                                      {canDownload && (
                                        <button 
                                          className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                                          onClick={() => handleDownloadDocument(doc, index)}
                                          title="Download document"
                                        >
                                          Download
                                        </button>
                                      )}
                                      
                                        <button 
                                          className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                                          onClick={() => handleDeleteDocument(doc, index)}
                                          title="Delete document"
                                        >
                                          Delete
                                        </button>
                                     
                                      
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr className="bg-yellow-50">
                                <td className="p-4 text-center text-gray-600" colSpan="4">
                                  <div className="flex flex-col items-center">
                                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>No Documents Found</span>
                                    <span className="text-sm text-gray-500 mt-1">Upload documents using the form above</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* 🆕 NEW: Referring Physician Section */}
                  <div className="bg-blue-50 p-4 border-t border-gray-200">
                    <h2 className="text-gray-700 font-medium mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Referring Physician Information
                      {canEdit && <span className="text-green-600 text-sm ml-2">(Editable)</span>}
                      {patientDetails?.referringPhysicians?.count > 1 && (
                        <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded ml-2">
                          {patientDetails.referringPhysicians.count} physicians found
                        </span>
                      )}
                    </h2>
                    
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {/* Referring Physician */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Referring Physician</label>
                        <input 
                          type="text" 
                          className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                          value={editedData.physicianInfo.referringPhysicianName}
                          onChange={(e) => handleInputChange('physicianInfo', 'referringPhysicianName', e.target.value)}
                          readOnly={!canEdit}
                          placeholder="Enter referring physician name"
                        />
                        <div className="mt-1">
                          <input 
                            type="email" 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                            value={editedData.physicianInfo.referringPhysicianEmail}
                            onChange={(e) => handleInputChange('physicianInfo', 'referringPhysicianEmail', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Email"
                          />
                        </div>
                        <div className="mt-1">
                          <input 
                            type="tel" 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                            value={editedData.physicianInfo.referringPhysicianMobile}
                            onChange={(e) => handleInputChange('physicianInfo', 'referringPhysicianMobile', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Mobile"
                          />
                        </div>
                        <div className="mt-1">
                          <input 
                            type="text" 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                            value={editedData.physicianInfo.referringPhysicianInstitution}
                            onChange={(e) => handleInputChange('physicianInfo', 'referringPhysicianInstitution', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Institution"
                          />
                        </div>
                      </div>
                      
                      {/* Requesting Physician */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Requesting Physician</label>
                        <input 
                          type="text" 
                          className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                          value={editedData.physicianInfo.requestingPhysician}
                          onChange={(e) => handleInputChange('physicianInfo', 'requestingPhysician', e.target.value)}
                          readOnly={!canEdit}
                          placeholder="Enter requesting physician name"
                        />
                        <div className="mt-1">
                          <input 
                            type="email" 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                            value={editedData.physicianInfo.requestingPhysicianEmail}
                            onChange={(e) => handleInputChange('physicianInfo', 'requestingPhysicianEmail', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Email"
                          />
                        </div>
                        <div className="mt-1">
                          <input 
                            type="tel" 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                            value={editedData.physicianInfo.requestingPhysicianMobile}
                            onChange={(e) => handleInputChange('physicianInfo', 'requestingPhysicianMobile', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Mobile"
                          />
                        </div>
                        <div className="mt-1">
                          <input 
                            type="text" 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                            value={editedData.physicianInfo.requestingPhysicianInstitution}
                            onChange={(e) => handleInputChange('physicianInfo', 'requestingPhysicianInstitution', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Institution"
                          />
                        </div>
                      </div>
                      
                      {/* Data Source Information */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Data Source</label>
                        <div className={`w-full border p-2 text-sm rounded ${
                          patientDetails?.studyInfo?.physicians?.referring?.source === 'dicom_structured' ? 'bg-green-100 text-green-800' :
                          patientDetails?.studyInfo?.physicians?.referring?.source === 'legacy_structured' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {patientDetails?.studyInfo?.physicians?.referring?.source === 'dicom_structured' ? '🏥 DICOM Extracted' :
                           patientDetails?.studyInfo?.physicians?.referring?.source === 'legacy_structured' ? '📋 Legacy Data' :
                           patientDetails?.studyInfo?.physicians?.referring?.source === 'name_only' ? '📝 Name Only' :
                           '❓ Manual Entry'}
                        </div>
                        
                        {/* Summary Info */}
                        <div className="mt-4 p-3 bg-white border rounded">
                          <div className="text-xs text-gray-600">
                            <strong>Total Physicians:</strong> {patientDetails?.summary?.uniqueReferringPhysicians || 0}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            <strong>Priority Cases:</strong> {patientDetails?.summary?.emergencyCases || 0} Emergency, {patientDetails?.summary?.mlcCases || 0} MLC
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 🆕 NEW: Technologist Information Section */}
                  <div className="bg-green-50 p-4 border-t border-gray-200">
                    <h2 className="text-gray-700 font-medium mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Technologist Information
                      {canEdit && <span className="text-green-600 text-sm ml-2">(Editable)</span>}
                      {patientDetails?.summary?.uniqueTechnologists > 1 && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded ml-2">
                          {patientDetails.summary.uniqueTechnologists} technologists
                        </span>
                      )}
                    </h2>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Technologist Details */}
                      <div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium mb-1">Technologist Name</label>
                            <input 
                              type="text" 
                              className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-green-300' : 'bg-gray-100'}`}
                              value={editedData.technologistInfo.name}
                              onChange={(e) => handleInputChange('technologistInfo', 'name', e.target.value)}
                              readOnly={!canEdit}
                              placeholder="Enter technologist name"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Mobile</label>
                            <input 
                              type="tel" 
                              className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-green-300' : 'bg-gray-100'}`}
                              value={editedData.technologistInfo.mobile}
                              onChange={(e) => handleInputChange('technologistInfo', 'mobile', e.target.value)}
                              readOnly={!canEdit}
                              placeholder="Mobile number"
                            />
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <label className="block text-sm font-medium mb-1">Comments</label>
                          <textarea 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-green-300' : 'bg-gray-100'}`}
                            rows="3"
                            value={editedData.technologistInfo.comments}
                            onChange={(e) => handleInputChange('technologistInfo', 'comments', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Additional comments or notes"
                          />
                        </div>
                        
                        <div className="mt-3">
                          <label className="block text-sm font-medium mb-1">Reason to Send</label>
                          <textarea 
                            className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-green-300' : 'bg-gray-100'}`}
                            rows="2"
                            value={editedData.technologistInfo.reasonToSend}
                            onChange={(e) => handleInputChange('technologistInfo', 'reasonToSend', e.target.value)}
                            readOnly={!canEdit}
                            placeholder="Reason for sending the study"
                          />
                        </div>
                      </div>
                      
                      {/* Technologist Data Source and Summary */}
                      <div>
                        <label className="block text-sm font-medium mb-1">Data Source</label>
                        <div className={`w-full border p-2 text-sm rounded mb-4 ${
                          patientDetails?.studyInfo?.technologist?.source === 'dicom_extracted' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {patientDetails?.studyInfo?.technologist?.source === 'dicom_extracted' ? '🏥 DICOM Extracted' :
                           '❓ Manual Entry'}
                        </div>
                        
                        {/* All Technologists Summary */}
                        {patientDetails?.technologists?.all && patientDetails.technologists.all.length > 0 && (
                          <div className="border rounded p-3 bg-white">
                            <h4 className="text-sm font-medium mb-2">All Technologists for This Patient</h4>
                            <div className="space-y-2">
                              {patientDetails.technologists.all.map((tech, index) => (
                                <div key={index} className="text-xs p-2 bg-green-25 border rounded">
                                  <div className="font-medium">{tech.name}</div>
                                  {tech.mobile && <div className="text-gray-600">📱 {tech.mobile}</div>}
                                  {tech.comments && (
                                    <div className="text-gray-600 mt-1 truncate" title={tech.comments}>
                                      💬 {tech.comments}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {(!patientDetails?.technologists?.current || patientDetails.technologists.current.name === 'N/A') && (
                          <div className="text-center py-4 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                            <svg className="w-8 h-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <p className="text-sm font-medium">No Technologist Information</p>
                            <p className="text-xs mt-1">
                              {canEdit ? 'You can add technologist information using the form' : 'No technologist data available'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Visit Information Tab */}
              {activeTab === 'visit' && (
                <div className="p-4">
                  <h2 className="text-gray-700 font-medium mb-4">Visit Information</h2>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-gray-600 font-medium mb-3">General Information</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm text-gray-600">Center</label>
                          <div className="text-sm font-medium">{patientDetails?.visitInfo?.center || 'N/A'}</div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Case Type</label>
                          <div className="text-sm font-medium">{patientDetails?.visitInfo?.caseType || 'N/A'}</div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Exam Type</label>
                          <div className="text-sm font-medium">{patientDetails?.visitInfo?.examType || 'N/A'}</div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Exam Description</label>
                          <div className="text-sm font-medium">{patientDetails?.visitInfo?.examDescription || 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-gray-600 font-medium mb-3">Timeline</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm text-gray-600">Order Date</label>
                          <div className="text-sm font-medium">{formatDate(patientDetails?.visitInfo?.orderDate)}</div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Study Date</label>
                          <div className="text-sm font-medium">{formatDate(patientDetails?.visitInfo?.studyDate)}</div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Report Date</label>
                          <div className="text-sm font-medium">{formatDate(patientDetails?.visitInfo?.reportDate)}</div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600">Current Status</label>
                          <div className={`text-sm font-medium inline-block px-2 py-1 rounded ${
                            patientDetails?.visitInfo?.studyStatus === 'report_finalized' ? 'bg-green-100 text-green-800' :
                            patientDetails?.visitInfo?.studyStatus === 'assigned_to_doctor' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {formatWorkflowStatus(patientDetails?.visitInfo?.studyStatus)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center p-3 border-t bg-gray-50">
          <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 mx-2 flex items-center text-sm transition-colors">
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
          
          
          {canEdit && (
            <button 
              className={`px-6 py-2 mx-2 text-sm transition-colors ${
                saving 
                  ? 'bg-gray-400 text-white cursor-not-allowed' 
                  : 'bg-blue-700 hover:bg-blue-800 text-white'
              }`}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
          
          <button 
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 mx-2 text-sm transition-colors" 
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientDetailModal;