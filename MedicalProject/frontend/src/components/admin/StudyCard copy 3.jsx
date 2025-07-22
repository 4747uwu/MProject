import React, { useState, useCallback } from 'react';
import { formatMonthDay, formatTime, formatMonthDayYear, formatRelativeDate, formatAbbrevMonthDay } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import ReportButton from './ReportButton';
import api from '../../services/api';
import sessionManager from '../../services/sessionManager';
import { STATUS_CONFIG, PRIORITY_LEVELS } from './WorklistTable/utils/constants';

// Synced StatusIndicator using constants.js
const StatusIndicator = React.memo(({ status, priority, isEmergency }) => {
  // Get status configuration from constants
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.default;
  
  // Override for emergency cases
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
      {/* <span className="text-xs font-medium text-gray-600">
        {getStatusDisplayText(status)}
      </span> */}
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

// Clinical History Indicator
const ClinicalHistoryIndicator = ({ study }) => {
  const hasHistory = study.clinicalHistory || study.clinicalIndication || study.indication;
  
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${hasHistory ? 'bg-green-500' : 'bg-gray-300'}`} />
      <span className={`text-xs font-medium ${hasHistory ? 'text-green-600' : 'text-gray-400'}`}>
        {hasHistory ? '📋 History' : '📋 No History'}
      </span>
    </div>
  );
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

// Direct Download Button (Replaces DownloadDropdown)
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

// Radiant Viewer Button
const RadiantViewerButton = ({ study }) => {
  const [isLaunching, setIsLaunching] = useState(false);

  const handleLaunchRadiantViewer = useCallback(async () => {
    setIsLaunching(true);
    try {
      if (!study?.orthancStudyID) {
        toast.error('Study data not found');
        return;
      }
      const loadingToastId = toast.loading('Launching Radiant Viewer...', { duration: 5000 });
      const orthancStudyId = study.orthancStudyID;
      const protocol = 'myapp';
      let launchUrl = `${protocol}://launch?study=${encodeURIComponent(orthancStudyId)}`;
      
      const authToken = sessionManager.getToken();
      if (authToken) {
        launchUrl += `&token=${encodeURIComponent(authToken)}`;
      }
      
      window.location.href = launchUrl;

      setTimeout(() => {
        toast.dismiss(loadingToastId);
        toast.success('🖥️ Launch command sent!', { duration: 4000 });
      }, 1500);
    } catch (error) {
      console.error('Error launching Radiant Viewer:', error);
      toast.error(`Failed to launch: ${error.message}`);
    } finally {
      setIsLaunching(false);
    }
  }, [study]);

  return (
    <ActionButton
      onClick={handleLaunchRadiantViewer}
      variant="blue"
      title="Launch Radiant Viewer"
      icon={
        isLaunching ? (
          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553 2.276A2 2 0 0121 14.09V17a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.91a2 2 0 01.447-1.814L8 10m7-6v6m0 0l-3-3m3 3l3-3" />
          </svg>
        )
      }
    />
  );
};

// ENHANCED StudyCard component with STRICT width constraints
const StudyCard = React.memo(({ 
  study, 
  index, 
  visibleColumns, 
  selectedStudies, 
  onSelectStudy, 
  onPatientClick,
  onPatienIdClick,
  onAssignDoctor,
  canAssignDoctors,
  userRole
}) => {
  const isSelected = selectedStudies.includes(study._id);
  const isEmergency = study.caseType?.toLowerCase() === 'emergency' || study.priority === 'EMERGENCY';
  
  const handlePatienIdClick = useCallback(() => {
    onPatienIdClick(study.patientId, study);
  }, [study.patientId, study, onPatienIdClick]);

  const handleAssignDoctor = useCallback(() => {
    onAssignDoctor(study);
  }, [study, onAssignDoctor]);

  // OHIF Viewer
  const handleOHIFViewer = () => {
    const ohifBaseURL = 'http://64.227.187.164:4000';
    const studyInstanceUID = study.studyInstanceUID || study.instanceID;
    const ohifUrl = new URL(`${ohifBaseURL}/viewer`);
    ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
    window.open(ohifUrl.toString(), '_blank');
  };

  // Determine button text and style based on workflow status
  const getAssignButtonProps = () => {
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
  };

  const assignButtonProps = getAssignButtonProps();

  return (
    <div className={`
      w-full max-w-full min-w-0
      bg-white border rounded-lg 
      transition-all duration-200 hover:shadow-sm 
      overflow-hidden flex-shrink-0
      ${isSelected 
        ? 'border-blue-400 ring-1 ring-blue-200 shadow-sm' 
        : isEmergency 
          ? 'border-red-300 bg-red-50/30' 
          : 'border-gray-200 hover:border-gray-300'
      }
    `}>
      
      <div className="p-3 w-full max-w-full min-w-0 overflow-hidden">
        {/* Top Row - ID, Name, Status */}
        <div className="flex items-start justify-between mb-2 w-full max-w-full min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden max-w-[calc(100%-120px)]">
            {/* Checkbox */}
            <input 
              type="checkbox" 
              className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-1 focus:ring-blue-500 flex-shrink-0"
              checked={isSelected}
              onChange={() => onSelectStudy(study._id)}
            />
            
            {/* Patient ID Button */}
            <button 
              onClick={handlePatienIdClick}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors flex-shrink-0 ${
                isEmergency 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {study.patientId}
            </button>
            
            {/* Patient Name - FIXED with strict constraints */}
            <div className="min-w-0 flex-1 overflow-hidden max-w-full">
              <h3 className="font-medium text-gray-900 text-sm truncate w-full max-w-full overflow-hidden">
                {study.patientName}
              </h3>
              <div className="text-xs text-gray-500 truncate w-full max-w-full overflow-hidden">
                {study.ageGender} • {study.location}
              </div>
            </div>
          </div>
          
          {/* Status */}
          <div className="flex-shrink-0 ml-2 max-w-[120px]">
            <StatusIndicator 
              status={study.workflowStatus} 
              priority={study.priority}
              isEmergency={isEmergency}
            />
          </div>
        </div>

        {/* Middle Row - Study Info */}
        <div className="flex items-center justify-between mb-2 w-full max-w-full min-w-0">
          <div className="min-w-0 flex-1 overflow-hidden max-w-full">
            <h4 className="font-medium text-gray-800 text-sm truncate w-full max-w-full overflow-hidden">
              {study.description}
            </h4>
            <div className="flex items-center gap-2 text-xs text-gray-500 overflow-hidden w-full max-w-full">
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium flex-shrink-0">
                {study.modality}
              </span>
              <span className="flex-shrink-0">•</span>
              <span className="flex-shrink-0">{study.seriesImages}</span>
              <span className="flex-shrink-0">•</span>
              <span className="truncate overflow-hidden">{formatMonthDay(study.studyDateTime)}</span>
            </div>
          </div>
        </div>

        {/* Clinical History Row */}
        <div className="flex items-center justify-between mb-2 w-full max-w-full min-w-0">
          <ClinicalHistoryIndicator study={study} />
        </div>

        {/* Bottom Row - Actions */}
        <div className="flex items-center justify-between w-full max-w-full min-w-0">
          {/* Left Actions - UPDATED: Replaced DownloadDropdown with DirectDownloadButton */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <ShareButton study={study} />
            <DirectDownloadButton study={study} />
            {/* <RadiantViewerButton study={study} /> */}
            <ReportButton study={study} />
          </div>
          
          {/* Right Actions */}
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {/* View Button */}
            <button 
              onClick={handleOHIFViewer}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors whitespace-nowrap"
            >
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View
            </button>
            
            {/* Assign/Reassign Doctor Button */}
            {canAssignDoctors && (
              <button 
                onClick={handleAssignDoctor}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${assignButtonProps.className}`}
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {assignButtonProps.text}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

StudyCard.displayName = 'StudyCard';

export default StudyCard;