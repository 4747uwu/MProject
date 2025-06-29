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
  userRole
}) => {
  const isSelected = selectedStudies.includes(study._id);
  const isEmergency = study.caseType?.toLowerCase() === 'emergency' || study.priority === 'EMERGENCY';
  
  const showReportButton = true;
  
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
    <div className={`bg-white rounded-xl border-2 transition-all duration-200 hover:shadow-md ${
      isSelected ? 'border-blue-400 bg-blue-50/50 shadow-sm' : 'border-gray-100 hover:border-gray-200'
    } ${isEmergency ? 'border-red-400 bg-red-50/50' : ''}`}>
      
      {/* 🔥 COMPACT HEADER: All key info in one row */}
      <div className="p-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Checkbox + Patient ID */}
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                checked={isSelected}
                onChange={() => onSelectStudy(study._id)}
              />
              <button 
                onClick={handlePatienIdClick}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  isEmergency 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {study.patientId}
              </button>
            </div>
            
            {/* Status + Emergency Indicator */}
            <div className="flex items-center gap-2">
              <StatusDot status={study.workflowStatus} priority={study.priority} />
              {isEmergency && (
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center gap-1">
                  🚨 URGENT
                </span>
              )}
            </div>
          </div>
          
          {/* Share Button */}
          <ShareButton study={study} />
        </div>

        {/* 🎯 MAIN INFO: Patient + Study in compact grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Patient Info - Compact */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                👤
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-gray-900 truncate text-sm">
                  {study.patientName}
                </h3>
                <p className="text-xs text-gray-500">
                  {study.ageGender} • {study.location}
                </p>
              </div>
            </div>
          </div>

          {/* Study Info - Compact */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                🔬
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-medium text-gray-900 truncate text-sm">
                  {study.description}
                </h4>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                    {study.modality}
                  </span>
                  <span>•</span>
                  <span>{study.seriesImages}</span>
                  <span>•</span>
                  <span>{formatMonthDay(study.studyDateTime)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 COMPACT ACTIONS: All buttons in one clean row */}
      <div className="px-4 py-3 bg-gray-50/50 rounded-b-xl border-t border-gray-100">
        <div className="flex items-center justify-between">
          {/* Left: Action buttons */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleOHIFViewer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="hidden sm:inline">View</span>
            </button>
            
            <button 
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Report Button - Integrated */}
            {showReportButton && (
              <div className="inline-flex">
                <ReportButton study={study} />
              </div>
            )}
          </div>
          
          {/* Right: Assign Doctor */}
          {canAssignDoctors && (
            <button 
              onClick={handleAssignDoctor}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                study.workflowStatus === 'final_report_downloaded' 
                  ? 'bg-green-100 text-green-700 cursor-not-allowed' 
                  : isEmergency
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
              }`}
              disabled={study.workflowStatus === 'final_report_downloaded'}
            >
              {study.workflowStatus === 'final_report_downloaded' ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="hidden sm:inline">Complete</span>
                </>
              ) : isEmergency ? (
                <>
                  🚨
                  <span className="hidden sm:inline">Assign Urgent</span>
                  <span className="sm:hidden">Assign</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="hidden sm:inline">Assign Doctor</span>
                  <span className="sm:hidden">Assign</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Debug info - development only */}
      
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