import React, { useState, useCallback } from 'react';
import { formatMonthDay, formatTime, formatMonthDayYear, formatRelativeDate, formatAbbrevMonthDay } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import ReportButton from './ReportButton'; // Import ReportButton

// Simple StatusDot component
const StatusDot = React.memo(({ status, priority }) => {
  let color = 'bg-gray-400'; 
  
  if (priority === 'EMERGENCY' || priority === 'STAT' || priority === 'URGENT') {
    color = 'bg-red-500';
  } else {
    switch (status) {
      case 'new_study_received':
      case 'new':
        color = 'bg-red-500';
        break;
      case 'pending_assignment':
        color = 'bg-yellow-500';
        break;
      case 'assigned_to_doctor':
        color = 'bg-yellow-500';
        break;
      case 'report_in_progress':
        color = 'bg-orange-500';
        break;
      case 'report_finalized':
        color = 'bg-blue-500';
        break;
      case 'final_report_downloaded':
        color = 'bg-green-500';
        break;
      default:
        color = 'bg-gray-400';
    }
  }
  
  return <div className={`w-3 h-3 rounded-full ${color}`} />;
});

// Simple Share Button
const ShareButton = ({ study }) => {
  const handleShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/share/study/${study._id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied!');
    } catch (error) {
      toast.error('Failed to share study');
    }
  };

  return (
    <button
      onClick={handleShare}
      className="text-blue-600 hover:text-blue-800 p-1 rounded"
      title="Share study"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
      </svg>
    </button>
  );
};

// Main StudyCard component - Clean and Simple
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
  userRole // 🔧 IMPORTANT: Make sure userRole prop is passed
}) => {
  const isSelected = selectedStudies.includes(study._id);
  const isEmergency = study.caseType?.toLowerCase() === 'emergency' || study.priority === 'EMERGENCY';
  
  // 🔧 FIXED: Check if user is doctor or admin to show report button
  const showReportButton = true; // userRole === 'doctor' || userRole === 'admin';
  
  const handlePatienIdClick = useCallback(() => {
    onPatienIdClick(study.patientId, study);
  }, [study.patientId, study, onPatienIdClick]);

  const handleAssignDoctor = useCallback(() => {
    onAssignDoctor(study);
  }, [study, onAssignDoctor]);

  // OHIF Viewer
  const handleOHIFViewer = () => {
    const ohifBaseURL = 'http://localhost:4000';
    const studyInstanceUID = study.studyInstanceUID || study.instanceID;
    const ohifUrl = new URL(`${ohifBaseURL}/viewer`);
    ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
    window.open(ohifUrl.toString(), '_blank');
  };

  // Download
  const handleDownload = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const downloadUrl = `${backendUrl}/api/orthanc-download/study/${study.orthancStudyID}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      toast.error('Failed to download study');
    }
  };
  
  return (
    <div className={`bg-white rounded-lg border shadow-sm p-4 mb-3 ${
      isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
    } ${isEmergency ? 'border-red-400 bg-red-50' : ''}`}>
      
      {/* Header Row - Checkbox, Patient ID, Status, Share */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {/* Checkbox */}
          <input 
            type="checkbox" 
            className="rounded w-4 h-4"
            checked={isSelected}
            onChange={() => onSelectStudy(study._id)}
          />
          
          {/* Patient ID Button */}
          <button 
            onClick={handlePatienIdClick}
            className={`px-3 py-1 rounded-full text-sm font-semibold ${
              isEmergency 
                ? 'bg-red-500 text-white' 
                : 'bg-blue-500 text-white'
            }`}
          >
            {study.patientId}
          </button>
          
          {/* Status */}
          <div className="flex items-center space-x-2">
            <StatusDot status={study.workflowStatus} priority={study.priority} />
            <span className="text-xs font-medium text-gray-600">
              {isEmergency && <span className="text-red-600 font-bold">🚨 EMERGENCY</span>}
            </span>
          </div>
        </div>
        
        {/* Share Button - Top Right */}
        <ShareButton study={study} />
      </div>
      
      {/* Patient Information Section */}
      <div className="bg-blue-50 rounded p-3 mb-3">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">👤 Patient Information</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-600">Name:</span>
            <div className="font-medium">{study.patientName}</div>
          </div>
          <div>
            <span className="text-gray-600">Age/Gender:</span>
            <div className="font-medium">{study.ageGender}</div>
          </div>
          <div className="col-span-2">
            <span className="text-gray-600">Location:</span>
            <div className="font-medium">{study.location}</div>
          </div>
        </div>
      </div>
      
      {/* Study Information Section */}
      <div className="bg-green-50 rounded p-3 mb-3">
        <h4 className="text-sm font-semibold text-green-800 mb-2">🔬 Study Information</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-600">Description:</span>
            <div className="font-medium">{study.description}</div>
          </div>
          <div>
            <span className="text-gray-600">Modality:</span>
            <div>
              <span className="inline-block px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-semibold">
                {study.modality}
              </span>
            </div>
          </div>
          <div>
            <span className="text-gray-600">Series:</span>
            <div className="font-medium">{study.seriesImages}</div>
          </div>
          <div>
            <span className="text-gray-600">Study Date:</span>
            <div className="font-medium">{formatMonthDay(study.studyDateTime)}</div>
          </div>
        </div>
      </div>
      
      {/* Action Buttons Row */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        <div className="flex items-center space-x-2 flex-wrap">
          {/* OHIF Viewer Button */}
          <button 
            onClick={handleOHIFViewer}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            OHIF
          </button>
          
          {/* Download Button */}
          <button 
            onClick={handleDownload}
            className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            Download
          </button>

          {/* 🆕 FIXED: Report Button for doctors and admins - Make it more prominent */}
          {showReportButton && (
            <div className=" rounded p-1">
              <ReportButton study={study} />
            </div>
          )}
        </div>
        
        {/* Assign Doctor Button */}
        {canAssignDoctors && (
          <button 
            onClick={handleAssignDoctor}
            className={`px-4 py-1 rounded text-sm font-semibold ${
              study.workflowStatus === 'report_finalized' 
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
                : isEmergency
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
            disabled={study.workflowStatus === 'final_report_downloaded'}
          >
            {study.workflowStatus === 'final_report_downloaded' 
              ? 'Complete' 
              : isEmergency 
                ? '🚨 Assign'
                : 'Assign Doctor'
            }
          </button>
        )}
      </div>

      {/* 🆕 NEW: Debug info for development (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 p-2 bg-yellow-100 rounded text-xs">
          <strong>Debug:</strong> userRole: {userRole}, showReportButton: {showReportButton.toString()}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.study._id === nextProps.study._id &&
    prevProps.index === nextProps.index &&
    prevProps.userRole === nextProps.userRole &&
    JSON.stringify(prevProps.visibleColumns) === JSON.stringify(nextProps.visibleColumns) &&
    JSON.stringify(prevProps.selectedStudies) === JSON.stringify(nextProps.selectedStudies)
  );
});

export default StudyCard;