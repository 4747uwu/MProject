import React, { useState, useCallback } from 'react';
import { formatMonthDay, formatTime, formatMonthDayYear, formatRelativeDate, formatAbbrevMonthDay } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import ReportButton from './ReportButton';
import api from '../../services/api';
import sessionManager from '../../services/sessionManager';
import { STATUS_CONFIG, PRIORITY_LEVELS } from './WorklistTable/utils/constants';
import PatientDetailModal from './patients/PatientDetailModal';

// Status components from WorklistTable
const StatusDot = ({ status, priority }) => {
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.default;
  return (
    <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} title={statusConfig.label} />
  );
};

// Clinical History UserButton - Same as WorklistTable
const UserButton = ({ study, className = '' }) => {
  const hasClinicalHistory = study.clinicalHistory && study.clinicalHistory.trim() !== '';
  
  const handleUserClick = () => {
    console.log('User button clicked for study:', study._id);
  };

  return (
    <div className="relative flex items-center justify-center">
      <button 
        onClick={handleUserClick}
        className={`transition-colors duration-200 p-1 hover:bg-blue-50 rounded ${
          hasClinicalHistory 
            ? 'text-blue-600 hover:text-blue-800' 
            : 'text-gray-400 hover:text-gray-500'
        } ${className}`}
        title={hasClinicalHistory ? "Clinical history available" : "No clinical history"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
      
      {/* Green indicator dot when clinical history is available */}
      {hasClinicalHistory && (
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
    </div>
  );
};

// Synced StatusIndicator using constants.js
const StatusIndicator = React.memo(({ status, priority, isEmergency }) => {
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.default;
  
  if (isEmergency) {
    return (
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
          🚨 URGENT
        </span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${statusConfig.color}`} />
      <span className="text-xs font-medium text-gray-600">
        {getStatusDisplayText(status)}
      </span>
    </div>
  );
});

// Helper function to get display text for status
const getStatusDisplayText = (status) => {
  const statusMap = {
    'new_study_received': 'New',
    'new': 'New',
    'pending_assignment': 'Pending',
    'assigned_to_doctor': 'Assigned',
    'doctor_opened_report': 'In Review',
    'report_in_progress': 'In Progress',
    'report_finalized': 'Finalized',
    'report_uploaded': 'Uploaded',
    'report_downloaded_radiologist': 'Downloaded',
    'report_downloaded': 'Downloaded',
    'report_drafted': 'Drafted',
    'final_report_downloaded': 'Completed',
    'archived': 'Archived'
  };
  return statusMap[status] || 'Unknown';
};

// Compact ActionButton for downloads/sharing
const ActionButton = ({ onClick, icon, title, variant = 'default' }) => {
  const variants = {
    default: 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
    blue: 'text-blue-500 hover:text-blue-600 hover:bg-blue-50',
    green: 'text-green-500 hover:text-green-600 hover:bg-green-50'
  };

  return (
    <button
      onClick={onClick}
      className={`p-1 rounded transition-colors ${variants[variant]}`}
      title={title}
    >
      {icon}
    </button>
  );
};

// Enhanced ShareButton component
const ShareButton = ({ study }) => {
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const shareUrl = `${window.location.origin}/share/study/${study._id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied!', { icon: '🔗', duration: 2000 });
    } catch (error) {
      toast.error('Failed to copy share link');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <ActionButton
      onClick={handleShare}
      variant="blue"
      title="Share study"
      icon={
        isSharing ? (
          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
          </svg>
        )
      }
    />
  );
};

// Direct Download Button
const DirectDownloadButton = ({ study }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDirectDownload = async () => {
    setIsDownloading(true);
    try {
      const orthancStudyId = study.orthancStudyID;
      if (!orthancStudyId) {
        toast.error('Orthanc Study ID not found');
        return;
      }
      
      const loadingToastId = toast.loading('Starting download...', { duration: 10000 });
      
      try {
        const response = await api.get(`/orthanc-download/study/${orthancStudyId}/download`, {
          responseType: 'blob',
          timeout: 300000,
        });
        
        const blob = new Blob([response.data]);
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `study_${orthancStudyId}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        toast.dismiss(loadingToastId);
        toast.success('Download started successfully!');
        
      } catch (apiError) {
        toast.dismiss(loadingToastId);
        if (apiError.code === 'ECONNABORTED') {
          toast.error('Download timeout - file too large. Try again.');
        } else if (apiError.response?.status === 404) {
          toast.error('Study not found');
        } else {
          toast.error(`Download failed: ${apiError.message}`);
        }
      }
    } catch (error) {
      console.error('Error downloading study:', error);
      toast.error('Failed to download: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <ActionButton
      onClick={handleDirectDownload}
      variant="green"
      title="Download study"
      icon={
        isDownloading ? (
          <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      }
    />
  );
};

// Patient Details Button
const PatientDetailsButton = ({ study, onOpenModal }) => {
  return (
    <ActionButton
      onClick={() => onOpenModal(study.patientId)}
      variant="blue"
      title="View patient details"
      icon={
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      }
    />
  );
};

// FIXED HTML TABLE STRUCTURE - StudyTable component (Mobile Table Layout)
const StudyTable = React.memo(({ 
  studies = [],
  selectedStudies = [],
  onSelectStudy,
  onPatienIdClick,
  onAssignDoctor,
  canAssignDoctors,
  userRole,
  visibleColumns = {}
}) => {
  // Modal state
  const [patientDetailModalOpen, setPatientDetailModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  // Handle opening patient detail modal
  const handleOpenPatientModal = useCallback((patientId) => {
    setSelectedPatientId(patientId);
    setPatientDetailModalOpen(true);
  }, []);

  // Handle closing patient detail modal
  const handleClosePatientModal = useCallback(() => {
    setPatientDetailModalOpen(false);
    setSelectedPatientId(null);
  }, []);

  // OHIF Viewer handler
  const handleOHIFViewer = useCallback((study) => {
    const ohifBaseURL = 'http://64.227.187.164:4000';
    const studyInstanceUID = study.studyInstanceUID || study.instanceID;
    const ohifUrl = new URL(`${ohifBaseURL}/viewer`);
    ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
    window.open(ohifUrl.toString(), '_blank');
  }, []);

  // Get assign button props
  const getAssignButtonProps = useCallback((study) => {
    const isEmergency = study.caseType?.toLowerCase() === 'emergency' || study.priority === 'EMERGENCY';
    const isNewOrPending = study.workflowStatus === 'new_study_received' || study.workflowStatus === 'pending_assignment';
    
    if (isEmergency) {
      return {
        text: isNewOrPending ? '🚨 Assign' : 'Reassign',
        className: 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
      };
    }
    
    return {
      text: isNewOrPending ? 'Assign' : 'Reassign',
      className: isNewOrPending 
        ? 'bg-blue-500 hover:bg-blue-600 text-white' 
        : 'bg-orange-500 hover:bg-orange-600 text-white'
    };
  }, []);

  return (
    <>
      {/* PROPER SCROLLING CONTAINER - Matches WorklistTable structure */}
      <div className="w-full h-full flex flex-col">
        <div className="w-full flex-1 relative overflow-hidden">
          <div className="absolute inset-0 overflow-auto">
            <table className="w-full border-collapse bg-white shadow-sm">
              {/* TABLE HEADER - Sticky like WorklistTable */}
              <thead className="bg-gradient-to-r from-gray-100 to-gray-200 border-b-2 border-gray-300 sticky top-0 z-10">
                <tr className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  <th className="w-8 px-2 py-2 text-center border-r border-gray-300">
                    <input 
                      type="checkbox" 
                      className="w-3 h-3 text-blue-600 border-gray-300 rounded"
                    />
                  </th>
                  <th className="w-12 px-1 py-2 text-center border-r border-gray-300">Status</th>
                  <th className="w-10 px-1 py-2 text-center border-r border-gray-300">👤</th>
                  <th className="min-w-[100px] px-2 py-2 text-left border-r border-gray-300">Patient ID</th>
                  <th className="min-w-[120px] px-2 py-2 text-left border-r border-gray-300">Patient Name</th>
                  <th className="w-16 px-1 py-2 text-center border-r border-gray-300">Age/Sex</th>
                  <th className="min-w-[120px] px-2 py-2 text-left border-r border-gray-300">Description</th>
                  <th className="w-16 px-1 py-2 text-center border-r border-gray-300">Series</th>
                  <th className="w-20 px-2 py-2 text-center border-r border-gray-300">Modality</th>
                  <th className="min-w-[100px] px-2 py-2 text-left border-r border-gray-300">Location</th>
                  <th className="min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Study Date</th>
                  <th className="min-w-[80px] px-1 py-2 text-center border-r border-gray-300">Actions</th>
                  {canAssignDoctors && (
                    <th className="w-24 px-2 py-2 text-center">Assign Doctor</th>
                  )}
                </tr>
              </thead>

              {/* TABLE BODY - Scrollable content */}
              <tbody className="bg-white divide-y divide-gray-200">
                {studies.map((study, index) => {
                  const isSelected = selectedStudies.includes(study._id);
                  const isEmergency = study.caseType?.toLowerCase() === 'emergency' || study.priority === 'EMERGENCY';
                  const assignButtonProps = getAssignButtonProps(study);

                  const getRowClasses = () => {
                    let baseClasses = "transition-colors duration-150";
                    if (isEmergency) return isSelected ? `${baseClasses} bg-red-200 hover:bg-red-300` : `${baseClasses} bg-red-100 hover:bg-red-200`;
                    if (isSelected) return `${baseClasses} bg-blue-50 hover:bg-blue-100`;
                    return `${baseClasses} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100`;
                  };

                  return (
                    <tr key={study._id} className={getRowClasses()}>
                      {/* CHECKBOX */}
                      <td className="w-8 px-2 py-3 text-center border-r border-gray-300">
                        <input 
                          type="checkbox" 
                          className="w-3 h-3 text-blue-600 border-gray-300 rounded"
                          checked={isSelected}
                          onChange={() => onSelectStudy(study._id)}
                        />
                      </td>

                      {/* STATUS */}
                      <td className="w-12 px-1 py-3 text-center border-r border-gray-300">
                        <div className="flex justify-center items-center">
                          <StatusDot status={study.workflowStatus} priority={study.priority} />
                          {isEmergency && (
                            <span className="ml-1 text-red-600 font-bold text-xs animate-pulse">🚨</span>
                          )}
                        </div>
                      </td>

                      {/* CLINICAL HISTORY - Added like WorklistTable */}
                      <td className="w-10 px-1 py-3 text-center border-r border-gray-300">
                        <UserButton study={study} />
                      </td>

                      {/* PATIENT ID */}
                      <td className="min-w-[100px] px-2 py-3 border-r border-gray-300">
                        <button 
                          onClick={() => onPatienIdClick(study.patientId, study)}
                          className={`text-xs font-medium truncate block w-full text-left hover:underline ${
                            isEmergency ? 'text-red-700 hover:text-red-900' : 'text-blue-600 hover:text-blue-800'
                          }`}
                        >
                          {study.patientId}
                          {isEmergency && (
                            <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-xs font-bold bg-red-600 text-white">
                              EMERGENCY
                            </span>
                          )}
                        </button>
                      </td>

                      {/* PATIENT NAME */}
                      <td className="min-w-[120px] px-2 py-3 border-r border-gray-300">
                        <div className={`text-xs font-medium truncate ${isEmergency ? 'text-red-900' : 'text-gray-900'}`} title={study.patientName}>
                          {study.patientName}
                        </div>
                      </td>

                      {/* AGE/GENDER */}
                      <td className="w-16 px-1 py-3 text-center border-r border-gray-300">
                        <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                          {study.ageGender || study.patientAge || 'N/A'}
                        </div>
                      </td>

                      {/* DESCRIPTION */}
                      <td className="min-w-[120px] px-2 py-3 border-r border-gray-300">
                        <div className={`text-xs truncate ${isEmergency ? 'text-red-900 font-medium' : 'text-gray-900'}`} title={study.description}>
                          {study.description || study.studyDescription || 'N/A'}
                        </div>
                      </td>

                      {/* SERIES */}
                      <td className="w-16 px-1 py-3 text-center border-r border-gray-300">
                        <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                          {study.seriesImages || study.numberOfSeries || 'N/A'}
                        </div>
                      </td>

                      {/* MODALITY */}
                      <td className="w-20 px-2 py-3 text-center border-r border-gray-300">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          isEmergency ? 'bg-red-600 text-white' : 'text-black'
                        }`}>
                          {study.modality || 'N/A'}
                        </span>
                      </td>

                      {/* LOCATION - Added like WorklistTable */}
                      <td className="min-w-[100px] px-2 py-3 border-r border-gray-300">
                        <div className={`text-xs truncate ${isEmergency ? 'text-red-700' : 'text-gray-600'}`} title={study.location}>
                          {study.location || 'N/A'}
                        </div>
                      </td>

                      {/* STUDY DATE */}
                      <td className="min-w-[100px] px-2 py-3 text-center border-r border-gray-300">
                        <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                          <div className="font-medium">{formatMonthDay(study.studyDateTime)}</div>
                          <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                            {formatTime(study.studyDateTime)}
                          </div>
                        </div>
                      </td>

                      {/* ACTIONS */}
                      <td className="min-w-[80px] px-1 py-3 text-center border-r border-gray-300">
                        <div className="flex items-center justify-center space-x-1">
                          {/* <ShareButton study={study} /> */}
                          <DirectDownloadButton study={study} />
                          <PatientDetailsButton study={study} onOpenModal={handleOpenPatientModal} />
                          <ReportButton study={study} />
                          
                          {/* View Button */}
                          <button 
                            onClick={() => handleOHIFViewer(study)}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                            title="View in OHIF"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7z" />
                            </svg>
                          </button>
                        </div>
                      </td>

                      {/* ASSIGN DOCTOR */}
                      {canAssignDoctors && (
                        <td className="w-24 px-2 py-3 text-center">
                          <button 
                            onClick={() => onAssignDoctor(study)}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${assignButtonProps.className}`}
                          >
                            {assignButtonProps.text}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* NO STUDIES MESSAGE */}
            {studies.length === 0 && (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No studies found</h3>
                <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PatientDetailModal Integration */}
      {patientDetailModalOpen && selectedPatientId && (
        <PatientDetailModal 
          patientId={selectedPatientId}
          isOpen={patientDetailModalOpen} 
          onClose={handleClosePatientModal}
        />
      )}
    </>
  );
});

StudyTable.displayName = 'StudyTable';

export default StudyTable;