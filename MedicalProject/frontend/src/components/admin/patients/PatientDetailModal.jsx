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
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadType, setUploadType] = useState('Clinical');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Editable fields state
  const [editedData, setEditedData] = useState({
    patientInfo: {},
    clinicalInfo: {},
    physicianInfo: {},
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

  useEffect(() => {
    if (isOpen && patientId) {
      fetchPatientDetails();
    }
  }, [isOpen, patientId]);

  const fetchPatientDetails = async () => {
    setLoading(true);
    setError('');
    
    try {
      let response = await api.get(`/labEdit/patients/${patientId}`);
      
      
      
      console.log('Patient Details:', response.data);
      
      const data = response.data.data;
      setPatientDetails(data);
      
      // 🔧 UPDATED DATA MAPPING based on actual API response
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
        // 🆕 ENHANCED: Referring physician information
        physicianInfo: {
          referringPhysician: data.visitInfo?.referringPhysician !== 'N/A' ? data.visitInfo?.referringPhysician : '',
          // 🆕 NEW: Extract additional referring physician details
          referringPhysicianName: data.referringPhysicians?.current?.name || data.visitInfo?.referringPhysicianDetails?.name || '',
          referringPhysicianInstitution: data.referringPhysicians?.current?.institution || data.visitInfo?.referringPhysicianDetails?.institution || '',
          referringPhysicianContact: data.referringPhysicians?.current?.contactInfo || data.visitInfo?.referringPhysicianDetails?.contactInfo || '',
          requestingPhysician: '',
          email: '',
          mobile: '',
          technologistName: '',
          technologistMobile: ''
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
    } catch (error) {
      console.error('Error fetching patient details:', error);
      setError('An error occurred while fetching patient details');
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
    setSelectedFile(e.target.files[0]);
  };

  const handleUploadFile = async () => {
    if (!selectedFile || !canUpload) {
      toast.error('Please select a file or check your permissions');
      return;
    }
    
    
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('documentType', uploadType.toLowerCase());
    formData.append('type', uploadType);
    
    // 🔧 FIXED: Use the correct path to get study ID
    let currentStudyId = null;
    
    // Method 1: From studies array (✅ This is where the data actually is)
    if (patientDetails?.studies && patientDetails.studies.length > 0) {
      currentStudyId = patientDetails.studies[0].studyInstanceUID;
      console.log('🔬 Found study ID in studies[0]:', currentStudyId);
    }
    // Method 2: From studyInfo (fallback, currently undefined)
    else if (patientDetails?.studyInfo?.studyId) {
      currentStudyId = patientDetails.studyInfo.studyId;
      console.log('🔬 Found study ID in studyInfo:', currentStudyId);
    }
    // Method 3: From allStudies (fallback, currently undefined)
    else if (patientDetails?.allStudies && patientDetails.allStudies.length > 0) {
      currentStudyId = patientDetails.allStudies[0].studyId;
      console.log('🔬 Found study ID in allStudies[0]:', currentStudyId);
    }
    // Method 4: No study ID found
    else {
      console.log('⚠️ No study ID found anywhere, uploading as general document');
    }
    
    if (currentStudyId) {
      formData.append('studyId', currentStudyId);
      console.log('🔬 Appending studyId to FormData:', currentStudyId);
    }
    
    // 🔧 DEBUG: Log all FormData entries
    console.log('🔧 FormData contents:');
    for (let [key, value] of formData.entries()) {
      console.log(`  ${key}:`, value);
    }
    
    setUploading(true);
    
    try {
      console.log('🔧 Uploading file:', {
        fileName: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        documentType: uploadType.toLowerCase(),
        studyId: currentStudyId || 'none'
      });

      const response = await api.post(`/labEdit/patients/${patientId}/documents`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000
      });
      
      console.log('✅ Upload response:', response.data);
      
      if (response.data.document?.studyLinked) {
        toast.success(`Document uploaded and linked to study ${response.data.document.studyId}`);
      } else {
        toast.success('Document uploaded successfully to cloud storage');
      }
      
      setSelectedFile(null);
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
      
      await fetchPatientDetails();
      
    } catch (error) {
      console.error('❌ Error uploading file:', error);
      
      if (error.response?.status === 403) {
        toast.error('Access denied. Please check your permissions.');
      } else if (error.response?.status === 401) {
        toast.error('Authentication required. Please log in again.');
      } else {
        toast.error(error.response?.data?.message || 'Failed to upload document');
      }
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
      const updateData = {
        patientInfo: {
          firstName: editedData.patientInfo.firstName,
          lastName: editedData.patientInfo.lastName,
          age: editedData.patientInfo.age,
          gender: editedData.patientInfo.gender,
          dateOfBirth: editedData.patientInfo.dateOfBirth,
          contactNumber: editedData.patientInfo.contactNumber,
          contactEmail: editedData.patientInfo.contactEmail
        },
        clinicalInfo: {
          clinicalHistory: clinicalHistoryChecked ? editedData.clinicalInfo.clinicalHistory : '',
          previousInjury: previousInjuryChecked ? editedData.clinicalInfo.previousInjury : '',
          previousSurgery: previousSurgeryChecked ? editedData.clinicalInfo.previousSurgery : ''
        },
        physicianInfo: {
          ...editedData.physicianInfo,
          referringPhysician
        },
        referralInfo: editedData.referralInfo,
        studyInfo: editedData.studyInfo
      };

      console.log('📤 Sending update data:', JSON.stringify(updateData, null, 2));

      const endpoint = isLabStaff ? `/labEdit/patients/${patientId}` : `/admin/patients/${patientId}`;
      const response = await api.put(endpoint, updateData);
      
      console.log('✅ Update response:', response.data);
      
      toast.success('Patient information updated successfully');
      fetchPatientDetails(); // Refresh data
      
    } catch (error) {
      console.error('Error saving patient data:', error);
      toast.error('Failed to save patient data');
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
        downloadUrl = `/labEdit/patients/${patientId}/documents/${patientDocIndex}/download`;
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

  // 🔧 ENHANCED: Delete function (only for patient documents)
  const handleDeleteDocument = async (doc, index) => {
    if (!canEdit) {
      toast.error('You do not have permission to delete documents');
      return;
    }

    // Prevent deletion of study documents
    if (doc.source === 'study') {
      toast.error('Study reports cannot be deleted from here. They are managed through the study workflow.');
      return;
    }

    const documentName = doc.fileName || `Document #${index + 1}`;

    if (!window.confirm(`Are you sure you want to delete "${documentName}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      console.log(`🗑️ Deleting patient document:`, doc);
      
      // Find the actual index in patient.documents
      const patientDocIndex = patientDetails.documents.findIndex(d => d._id === doc._id);
      
      if (patientDocIndex === -1) {
        toast.error('Document not found in patient records');
        return;
      }
      
      const response = await api.delete(`/labEdit/patients/${patientId}/documents/${patientDocIndex}`);
      
      console.log('✅ Delete response:', response.data);
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
              ID: {patientDetails?.patientInfo?.patientId}
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
            <div>TOTAL TAT: {patientDetails?.visitInfo?.orderDate ? 
              Math.floor((new Date() - new Date(patientDetails.visitInfo.orderDate)) / (1000 * 60 * 60 * 24)) : 0} days</div>
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

              {/* 🔧 UPDATED Patient & Study Related Information Section */}
              <div className="bg-beige-100 p-4" style={{ backgroundColor: '#f5f5dc' }}>
                <h2 className="text-gray-700 font-medium mb-4">
                  Patient & Study Related Information
                  {canEdit && <span className="text-green-600 text-sm ml-2">(Editable)</span>}
                </h2>
                
                <div className="grid grid-cols-5 gap-3 text-sm">
                  {/* Row 1 */}
                  <div>
                    <label className="block text-xs mb-1">Salutation</label>
                    <select 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      disabled={!canEdit}
                    >
                      <option>Mr</option>
                      <option>Mrs</option>
                      <option>Ms</option>
                      <option>Dr</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1">First Name</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.patientInfo.firstName}
                      onChange={(e) => handleInputChange('patientInfo', 'firstName', e.target.value)}
                      readOnly={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Last Name</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.patientInfo.lastName}
                      onChange={(e) => handleInputChange('patientInfo', 'lastName', e.target.value)}
                      readOnly={!canEdit}
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
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </div>

                  {/* Row 2 */}
                  <div>
                    <label className="block text-xs mb-1">Patient ID</label>
                    <input 
                      type="text" 
                      className="w-full border p-1 text-sm bg-gray-100" 
                      value={patientDetails?.patientInfo?.patientId || ''}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">DOB</label>
                    <input 
                      type="text" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={formatDate(editedData.patientInfo.dateOfBirth)}
                      onChange={(e) => handleInputChange('patientInfo', 'dateOfBirth', e.target.value)}
                      readOnly={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Contact Number</label>
                    <input 
                      type="tel" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.patientInfo.contactNumber}
                      onChange={(e) => handleInputChange('patientInfo', 'contactNumber', e.target.value)}
                      readOnly={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Contact Email</label>
                    <input 
                      type="email" 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.patientInfo.contactEmail}
                      onChange={(e) => handleInputChange('patientInfo', 'contactEmail', e.target.value)}
                      readOnly={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1">Case Type</label>
                    <select 
                      className={`w-full border p-1 text-sm ${canEdit ? 'bg-white' : 'bg-gray-100'}`}
                      value={editedData.studyInfo.caseType}
                      onChange={(e) => handleInputChange('studyInfo', 'caseType', e.target.value)}
                      disabled={!canEdit}
                    >
                      <option value="ROUTINE">ROUTINE</option>
                      <option value="URGENT">URGENT</option>
                      <option value="EMERGENCY">EMERGENCY</option>
                    </select>
                  </div>

                  {/* Study Information Row */}
                  <div className="col-span-5 border-t pt-3 mt-3">
                    <h3 className="text-gray-700 font-medium mb-2">Current Study Information</h3>
                    <div className="grid grid-cols-5 gap-3">
                      <div>
                        <label className="block text-xs mb-1">Study Date</label>
                        <input 
                          type="text" 
                          className="w-full border p-1 text-sm bg-gray-100"
                          value={formatDate(patientDetails?.studyInfo?.studyDate)}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Modality</label>
                        <input 
                          type="text" 
                          className="w-full border p-1 text-sm bg-gray-100"
                          value={patientDetails?.studyInfo?.modality || 'N/A'}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Accession Number</label>
                        <input 
                          type="text" 
                          className="w-full border p-1 text-sm bg-gray-100"
                          value={patientDetails?.studyInfo?.accessionNumber || 'N/A'}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Referring Physician</label>
                        <div className="flex items-center">
                          <input 
                            type="text" 
                            className="flex-1 border p-1 text-sm bg-gray-100"
                            value={patientDetails?.visitInfo?.referringPhysician || 
                                   patientDetails?.referringPhysicians?.current?.displayName || 
                                   'N/A'}
                            readOnly
                          />
                          {patientDetails?.referringPhysicians?.current?.hasDetails && (
                            <span className="ml-2 text-green-600 text-xs">✓ Details Available</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Study Status</label>
                        <span className={`inline-block w-full border p-1 text-sm text-center rounded ${
                          patientDetails?.studyInfo?.status === 'report_finalized' ? 'bg-green-100 text-green-800' :
                          patientDetails?.studyInfo?.status === 'assigned_to_doctor' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {formatWorkflowStatus(patientDetails?.studyInfo?.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 🆕 NEW: Referring Physician Information Section - Always Visible */}
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
                
                {/* Current/Primary Referring Physician */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="block text-xs mb-1 font-medium">Primary Referring Physician</label>
                    <input 
                      type="text" 
                      className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                      value={editedData.physicianInfo.referringPhysicianName || editedData.physicianInfo.referringPhysician}
                      onChange={(e) => handleInputChange('physicianInfo', 'referringPhysicianName', e.target.value)}
                      readOnly={!canEdit}
                      placeholder="Enter referring physician name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 font-medium">Institution/Hospital</label>
                    <input 
                      type="text" 
                      className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                      value={editedData.physicianInfo.referringPhysicianInstitution}
                      onChange={(e) => handleInputChange('physicianInfo', 'referringPhysicianInstitution', e.target.value)}
                      readOnly={!canEdit}
                      placeholder="Enter institution name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 font-medium">Contact Information</label>
                    <input 
                      type="text" 
                      className={`w-full border p-2 text-sm ${canEdit ? 'bg-white border-blue-300' : 'bg-gray-100'}`}
                      value={editedData.physicianInfo.referringPhysicianContact}
                      onChange={(e) => handleInputChange('physicianInfo', 'referringPhysicianContact', e.target.value)}
                      readOnly={!canEdit}
                      placeholder="Phone/Email"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 font-medium">Data Source</label>
                    <span className={`inline-block w-full p-2 text-sm rounded ${
                      patientDetails?.referringPhysicians?.current?.source === 'structured' ? 'bg-green-100 text-green-800' :
                      patientDetails?.referringPhysicians?.current?.source === 'dicom_field' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {patientDetails?.referringPhysicians?.current?.source === 'structured' ? '📋 Structured Data' :
                       patientDetails?.referringPhysicians?.current?.source === 'dicom_field' ? '🏥 DICOM Field' :
                       '❓ Manual Entry'}
                    </span>
                  </div>
                </div>
                
                {/* All Referring Physicians (if multiple) */}
                {patientDetails?.referringPhysicians?.all && patientDetails.referringPhysicians.all.length > 1 && (
                  <div className="border-t border-blue-200 pt-4">
                    <h3 className="text-gray-600 font-medium mb-3 flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.196-2.121A6.01 6.01 0 0017 20zm-3-4a3 3 0 100-6 3 3 0 000 6zm-8 4h8v-2a3 3 0 00-3-3H6a3 3 0 00-3 3v2zM9 12a3 3 0 100-6 3 3 0 000 6z" />
                      </svg>
                      All Referring Physicians for This Patient
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border border-gray-300 text-sm">
                        <thead>
                          <tr className="bg-blue-600 text-white">
                            <th className="p-2 text-left border border-gray-300">Physician Name</th>
                            <th className="p-2 text-left border border-gray-300">Institution</th>
                            <th className="p-2 text-left border border-gray-300">Contact</th>
                            <th className="p-2 text-left border border-gray-300">Source</th>
                            <th className="p-2 text-left border border-gray-300">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patientDetails.referringPhysicians.all.map((physician, index) => (
                            <tr key={index} className={`${index % 2 === 0 ? 'bg-blue-25' : 'bg-white'} hover:bg-blue-50`}>
                              <td className="p-2 border border-gray-300 font-medium">
                                {physician.displayName || physician.name || 'N/A'}
                              </td>
                              <td className="p-2 border border-gray-300">
                                {physician.institution || 'N/A'}
                              </td>
                              <td className="p-2 border border-gray-300">
                                {physician.contactInfo || 'N/A'}
                              </td>
                              <td className="p-2 border border-gray-300">
                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  physician.source === 'structured' ? 'bg-green-100 text-green-800' :
                                  physician.source === 'dicom_field' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {physician.source === 'structured' ? '📋 Structured' :
                                   physician.source === 'dicom_field' ? '🏥 DICOM' :
                                   '❓ Unknown'}
                                </span>
                              </td>
                              <td className="p-2 border border-gray-300">
                                {index === 0 ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                                    ⭐ Primary
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                    Historical
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {/* No Referring Physician Found */}
                {(!patientDetails?.referringPhysicians?.current?.hasDetails && 
                  !editedData.physicianInfo.referringPhysicianName && 
                  !editedData.physicianInfo.referringPhysician) && (
                  <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-lg font-medium">No Referring Physician Information</p>
                    <p className="text-sm mt-1">
                      {canEdit ? 'You can add referring physician information using the form above' : 'No referring physician data available'}
                    </p>
                    {canEdit && (
                      <button 
                        className="mt-3 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm"
                        onClick={() => {
                          setEditedData(prev => ({
                            ...prev,
                            physicianInfo: {
                              ...prev.physicianInfo,
                              referringPhysicianName: 'Dr. '
                            }
                          }));
                        }}
                      >
                        Add Referring Physician
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 🔧 UPDATED STUDY INFORMATION SECTION - SHOW REFERRING PHYSICIAN MORE PROMINENTLY */}
              <div className="bg-white p-4 border-t border-gray-200">
                <h2 className="text-gray-700 font-medium mb-4">
                  Study Information
                  {canEdit && <span className="text-green-600 text-sm ml-2">(Editable)</span>}
                </h2>
                
                <div className="grid grid-cols-5 gap-3 text-sm">
                  {/* Existing fields... */}
                  
                  {/* Referring Physician (Prominent) */}
                  <div>
                    <label className="block text-xs mb-1">Referring Physician</label>
                    <div className="flex items-center">
                      <input 
                        type="text" 
                        className="flex-1 border p-1 text-sm bg-gray-100"
                        value={patientDetails?.visitInfo?.referringPhysician || 
                               patientDetails?.referringPhysicians?.current?.displayName || 
                               'N/A'}
                        readOnly
                      />
                      {patientDetails?.referringPhysicians?.current?.hasDetails && (
                        <span className="ml-2 text-green-600 text-xs">✓ Details Available</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Other fields... */}
                </div>
              </div>

              {/* Rest of your existing sections (Clinical Information, etc.) */}
              {activeTab === 'clinical' && (
                <>
                  {/* Clinical Information Section */}
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
                                canUpload && selectedFile && !uploading 
                                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                                  : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              }`}
                              onClick={handleUploadFile}
                              disabled={!selectedFile || uploading || !canUpload}
                            >
                              {uploading ? 'Uploading...' : 'Upload File'}
                            </button>
                          </div>
                        )}

                        {/* Selected file display */}
                        {selectedFile && (
                          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                            <strong>Selected:</strong> {selectedFile.name}
                            <br />
                            <strong>Size:</strong> {(selectedFile.size / 1024).toFixed(1)} KB
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
                                      {canEdit && doc.source === 'patient' && (
                                        <button 
                                          className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                                          onClick={() => handleDeleteDocument(doc, index)}
                                          title="Delete document"
                                        >
                                          Delete
                                        </button>
                                      )}
                                      {doc.source === 'study' && (
                                        <span className="text-gray-500 text-sm" title="Study reports are managed through the study workflow">
                                          Study Managed
                                        </span>
                                      )}
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