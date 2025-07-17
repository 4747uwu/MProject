import React, { useState, useCallback } from 'react';
import { formatMonthDay, formatTime, formatMonthDayYear, formatRelativeDate, formatAbbrevMonthDay } from '../../utils/dateUtils';
import toast from 'react-hot-toast';
import ReportButton from './ReportButton';

// Enhanced StatusIndicator component
const StatusIndicator = React.memo(({ status, priority, isEmergency }) => {
  let statusConfig = {
    color: 'bg-gray-400',
    text: 'Unknown',
    textColor: 'text-gray-600'
  };
  
  if (isEmergency) {
    statusConfig = {
      color: 'bg-red-500',
      text: 'URGENT',
      textColor: 'text-red-700'
    };
  } else {
    switch (status) {
      case 'new_study_received':
      case 'new':
        statusConfig = { color: 'bg-blue-500', text: 'New', textColor: 'text-blue-700' };
        break;
      case 'pending_assignment':
        statusConfig = { color: 'bg-yellow-500', text: 'Pending', textColor: 'text-yellow-700' };
        break;
      case 'assigned_to_doctor':
        statusConfig = { color: 'bg-orange-500', text: 'Assigned', textColor: 'text-orange-700' };
        break;
      case 'report_in_progress':
        statusConfig = { color: 'bg-purple-500', text: 'In Progress', textColor: 'text-purple-700' };
        break;
      case 'report_finalized':
        statusConfig = { color: 'bg-green-500', text: 'Completed', textColor: 'text-green-700' };
        break;
      case 'final_report_downloaded':
        statusConfig = { color: 'bg-emerald-500', text: 'Downloaded', textColor: 'text-emerald-700' };
        break;
      default:
        statusConfig = { color: 'bg-gray-400', text: 'Unknown', textColor: 'text-gray-600' };
    }
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${statusConfig.color} ring-2 ring-white shadow-sm`} />
      <span className={`text-xs font-medium ${statusConfig.textColor}`}>
        {statusConfig.text}
      </span>
    </div>
  );
});

// Enhanced ShareButton with better UX
const ShareButton = ({ study }) => {
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const shareUrl = `${window.location.origin}/share/study/${study._id}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied to clipboard!', {
        icon: '🔗',
        duration: 2000
      });
    } catch (error) {
      toast.error('Failed to copy share link');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 group"
      title="Share study link"
    >
      {isSharing ? (
        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
        </svg>
      )}
    </button>
  );
};

// Main StudyCard component - Professional & Clean Design
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
  const [isExpanded, setIsExpanded] = useState(false);
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
      toast.success('Download started');
    } catch (error) {
      toast.error('Failed to download study');
    }
  };

  return (
    <div className={`group relative bg-white rounded-xl shadow-sm border transition-all duration-300 hover:shadow-lg ${
      isSelected 
        ? 'border-blue-400 ring-2 ring-blue-100 shadow-md' 
        : isEmergency 
          ? 'border-red-300 bg-red-50/30' 
          : 'border-gray-200 hover:border-gray-300'
    }`}>
      
      {/* Emergency Banner */}
      {isEmergency && (
        <div className="absolute -top-2 -right-2 z-10">
          <div className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
            🚨 URGENT
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between mb-4">
          {/* Left: Checkbox + Patient ID */}
          <div className="flex items-center gap-3">
            <input 
              type="checkbox" 
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 transition-colors"
              checked={isSelected}
              onChange={() => onSelectStudy(study._id)}
            />
            <button 
              onClick={handlePatienIdClick}
              className={`px-2 py-1 rounded-lg font-bold text-sm transition-all duration-200 hover:scale-105 ${
                isEmergency 
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {study.patientId}
            </button>
          </div>
          
          {/* Right: Status + Share */}
          <div className="flex items-center gap-3">
            <StatusIndicator 
              status={study.workflowStatus} 
              priority={study.priority}
              isEmergency={isEmergency}
            />
            <ShareButton study={study} />
          </div>
        </div>

        {/* Patient Information */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center">
              <span className="text-blue-600 font-semibold">👤</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-bold text-gray-900  truncate">
                {study.patientName}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{study.ageGender}</span>
                <span>•</span>
                <span className="truncate">{study.location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Study Information */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-100 to-emerald-200 rounded-xl flex items-center justify-center">
              <span className="text-green-600 font-semibold">🔬</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 text-sm mb-1 truncate">
                {study.description}
              </h4>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md font-medium">
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

        {/* Additional Details (Expandable) */}
        {isExpanded && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="font-medium text-gray-600">Study Date:</span>
                <p className="text-gray-800">{formatMonthDayYear(study.studyDateTime)}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Accession:</span>
                <p className="text-gray-800 truncate">{study.accessionNumber || 'N/A'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Institution:</span>
                <p className="text-gray-800 truncate">{study.institutionName || 'N/A'}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Priority:</span>
                <p className="text-gray-800">{study.priority || 'Normal'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Section */}
      <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-100 rounded-b-xl">
        <div className="flex items-center justify-between gap-3">
          {/* Primary Actions */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleOHIFViewer}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 shadow-sm hover:shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="hidden sm:inline">View</span>
            </button>
            
            <button 
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 shadow-sm hover:shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Report Button */}
            <div className="inline-flex">
              <ReportButton study={study} />
            </div>

            {/* Expand/Collapse Button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title={isExpanded ? "Show less" : "Show more details"}
            >
              <svg 
                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          {/* Assign Doctor Button */}
          {canAssignDoctors && (
            <button 
              onClick={handleAssignDoctor}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 shadow-sm hover:shadow-md ${
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
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="hidden sm:inline">
                    {isEmergency ? 'Assign Urgent' : 'Assign Doctor'}
                  </span>
                  <span className="sm:hidden">Assign</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

StudyCard.displayName = 'StudyCard';

export default StudyCard;