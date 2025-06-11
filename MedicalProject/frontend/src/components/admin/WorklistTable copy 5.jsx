import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { 
  formatDate,
  formatTime,
  formatMonthDay, 
  formatMonthDayYear, 
  formatAbbrevMonthDay, 
  formatRelativeDate,
  formatMonthDayTime,
  formatMonthDayShort
} from '../../utils/dateUtils';
import PatientDetailModal from './patients/PatientDetailModal';
import DoctorAssignmentModal from './Doctor/DoctorAssignmentModal';
import OpenOHIFViewerButton from './ohifViewerButton';
import { useAuth } from '../../hooks/useAuth';
import ReportButton from './ReportButton';
import ColumnConfigurator from './ColumnConfigurator';
import PatientReport from './patients/PatientDetail';
import DiscussionButton from './patients/DiscussionButton';
import StudySeries from './patients/StudySeries';
import StatusLegend from './StatusLegend';
import DropdownPagination from './DropdownPagination';
import ShareButton from './ShareButton';
import StudyCard from './StudyCard';
import LaunchButton from './LaunchButton';

// Status dot component to indicate workflow status
const StatusDot = React.memo(({ status, priority }) => {
  let color = 'bg-gray-400'; 
  let showEmergencyIcon = false;
  let tooltipText = '';
  
  // Handle emergency cases first
  if (priority === 'EMERGENCY' || priority === 'STAT' || priority === 'URGENT') {
    showEmergencyIcon = true;
    tooltipText = `${priority} Priority - Requires immediate attention`;
  } else {
    // Handle normal priority cases based on status
    switch (status) {
      case 'new_study_received':
      case 'new':
        color = 'bg-red-500';
        tooltipText = 'New Study Received - Awaiting processing';
        break;
      case 'pending_assignment':
        color = 'bg-yellow-500';
        tooltipText = 'Pending Assignment - Waiting for doctor assignment';
        break;
      case 'assigned_to_doctor':
        color = 'bg-yellow-500';
        tooltipText = 'Assigned to Doctor - Radiologist assigned, awaiting review';
        break;
      case 'doctor_opened_report':
      case 'report_in_progress':
        color = 'bg-orange-500';
        tooltipText = 'Report in Progress - Doctor is reviewing study';
        break;
      case 'report_finalized':
      case 'report_uploaded':
        color = 'bg-blue-500';
        tooltipText = 'Report Finalized - Report completed and ready for download';
        break;
      case 'report_downloaded_radiologist':
        color = 'bg-amber-600';
        tooltipText = 'Downloaded by Radiologist - Study downloaded by assigned doctor';
        break;
      case 'report_downloaded':
        color = 'bg-gray-500';
        tooltipText = 'Report Downloaded - Study downloaded by staff';
        break;
      case 'final_report_downloaded':
        color = 'bg-green-500';
        tooltipText = 'Final Report Downloaded - Report downloaded by lab/admin';
        break;
      case 'archived':
        color = 'bg-gray-400';
        tooltipText = 'Archived - Study has been archived';
        break;
      default:
        color = 'bg-gray-400';
        tooltipText = 'Unknown Status';
    }
  }
  
  if (showEmergencyIcon) {
    return (
      <div className="relative flex items-center justify-center" title={tooltipText}>
        <svg width="24" height="24" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="greenGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a8e063"/>
              <stop offset="100%" stopColor="#56ab2f"/>
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="28" fill="url(#greenGrad)" />
          <rect x="30" y="18" width="4" height="28" fill="#fff"/>
          <rect x="18" y="30" width="28" height="4" fill="#fff"/>
        </svg>
      </div>
    );
  }
  
  return (
    <div className="relative flex items-center justify-center" title={tooltipText}>
      <div className={`w-3 h-3 rounded-full ${color}`} />
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.status === nextProps.status && prevProps.priority === nextProps.priority;
});

// Eye icon with the viewer functionality
// Update the EyeIconOHIFButton component:

const EyeIconOHIFButton = React.memo(({ studyInstanceUID }) => {
  const handleClick = useCallback((e) => {
    e.preventDefault();
    
    // Use Orthanc Stone Web Viewer URL format
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    const viewerURL = `${orthancBaseURL}/stone-webviewer/index.html?study=${studyInstanceUID}`;
    
    console.log('Opening Stone Web Viewer with URL:', viewerURL);
    window.open(viewerURL, '_blank');
  }, [studyInstanceUID]);

  return (
    <button 
      onClick={handleClick} 
      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-1 hover:bg-blue-50 rounded"
      title={`View study in Stone Web Viewer: ${studyInstanceUID}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );
});

// Enhanced DownloadDropdown
const DownloadDropdown = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // 🆕 NEW: OHIF Viewer Functions
  const handleOpenOHIFLocal = () => {
    const ohifBaseURL = 'http://localhost:4000';
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    const studyInstanceUID = study.studyInstanceUID || study.instanceID;
    
    const ohifUrl = new URL(`${ohifBaseURL}/viewer`);
    ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
    
    const dataSourceConfig = {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Local Orthanc Server',
        name: 'orthanc',
        wadoUriRoot: `${orthancBaseURL}/wado`,
        qidoRoot: `${orthancBaseURL}/dicom-web`,
        wadoRoot: `${orthancBaseURL}/dicom-web`,
        qidoSupportsIncludeField: true,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true
      }
    };
    
    ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
    
    console.log('Opening local OHIF Viewer:', ohifUrl.toString());
    window.open(ohifUrl.toString(), '_blank');
    setIsOpen(false);
  };

  const handleOpenOHIFCloud = () => {
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    const studyInstanceUID = study.studyInstanceUID || study.instanceID;
    const ohifUrl = `https://viewer.ohif.org/viewer?StudyInstanceUIDs=${studyInstanceUID}&url=${encodeURIComponent(orthancBaseURL + '/dicom-web')}`;
    
    console.log('☁️ Opening cloud OHIF Viewer:', ohifUrl);
    window.open(ohifUrl, '_blank');
    setIsOpen(false);
  };

  const handleOpenStoneViewer = () => {
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    const studyInstanceUID = study.studyInstanceUID || study.instanceID;
    const stoneUrl = `${orthancBaseURL}/stone-webviewer/index.html?study=${studyInstanceUID}`;
    
    console.log('Opening Stone Web Viewer:', stoneUrl);
    window.open(stoneUrl, '_blank');
    setIsOpen(false);
  };

  // 🆕 NEW: Launch Radiant Viewer via Bridge Server
  const handleLaunchRadiantViewer = async () => {
    try {
      if (!study.orthancStudyID) {
        toast.error('Orthanc Study ID not found - cannot launch Radiant Viewer');
        return;
      }

      console.log('📋 Complete study object for Radiant launch:', study);
      toast.loading('Launching Radiant Viewer...', { duration: 10000 });

      const launchResponse = await fetch(`${backendUrl}/api/radiant/launch/orthanc/${study.orthancStudyID}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // 🚀 Send all available study information
          studyInstanceUID: study.studyInstanceUID || study.instanceID,
          orthancStudyID: study.orthancStudyID,
          
          // Patient information
          patientName: study.patientName,
          patientId: study.patientId,
          patientGender: study.patientGender,
          patientDateOfBirth: study.patientDateOfBirth,
          
          // Study details
          modality: study.modality,
          modalitiesInStudy: study.modalitiesInStudy,
          studyDate: study.studyDate,
          studyDateTime: study.studyDateTime,
          studyTime: study.studyTime,
          description: study.description,
          accessionNumber: study.accessionNumber,
          
          // Study metadata
          seriesCount: study.seriesCount,
          numberOfSeries: study.numberOfSeries,
          instanceCount: study.instanceCount,
          numberOfImages: study.numberOfImages,
          seriesImages: study.seriesImages,
          
          // Institution info
          institutionName: study.institutionName,
          location: study.location,
          
          // Lab information
          labName: study.labName,
          labIdentifier: study.labIdentifier,
          
          // Additional context
          caseType: study.caseType,
          currentCategory: study.currentCategory,
          workflowStatus: study.workflowStatus,
          assignmentPriority: study.assignmentPriority,
          
          // Doctor information (if assigned)
          assignedDoctorName: study.assignedDoctorName,
          assignedDoctorEmail: study.assignedDoctorEmail,
          assignedDoctorSpecialization: study.assignedDoctorSpecialization,
          
          // Clinical details
          clinicalHistory: study.clinicalHistory,
          referralOrUrgencyNotes: study.referralOrUrgencyNotes,
          previousInjuryInfo: study.previousInjuryInfo,
          previousSurgeryInfo: study.previousSurgeryInfo,
          
          // Timestamps
          uploadDate: study.uploadDate,
          uploadDateTime: study.uploadDateTime,
          createdAt: study.createdAt,
          updatedAt: study.updatedAt,
          
          // Database ID for reference
          studyDbId: study._id
        })
      });

      const result = await launchResponse.json();

      if (result.success) {
        toast.dismiss();
        toast.success(
          `🖥️ Radiant Viewer launched successfully!`,
          {
            duration: 6000,
            icon: '🖥️',
            style: {
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              fontWeight: '600'
            }
          }
        );

        // Show additional info
        setTimeout(() => {
          toast(
            `📁 Downloaded ${result.data.filesDownloaded} DICOM files for ${study.patientName} in ${result.data.totalTime}ms`,
            {
              duration: 4000,
              icon: '📊',
              style: {
                background: '#f0f9ff',
                color: '#0369a1',
                border: '1px solid #0ea5e9'
              }
            }
          );
        }, 1000);

      } else {
        throw new Error(result.message || 'Failed to launch Radiant Viewer');
      }

    } catch (error) {
      console.error('Error launching Radiant Viewer:', error);
      toast.dismiss();
      
      // Enhanced error handling with debugging info
      if (error.message.includes('Missing required study information')) {
        toast.error('Study data incomplete. Check console for details.');
        console.error('🔍 Study data sent:', {
          orthancStudyID: study.orthancStudyID,
          studyInstanceUID: study.studyInstanceUID,
          instanceID: study.instanceID,
          patientName: study.patientName
        });
      } else if (error.message.includes('not found')) {
        toast.error(
          'Radiant DICOM Viewer not found. Please install Radiant Viewer.',
          {
            duration: 8000,
            icon: '⚠️',
            style: {
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fca5a5'
            }
          }
        );
        
        // Show installation instructions
        setTimeout(() => {
          toast(
            (t) => (
              <div className="space-y-2">
                <div className="font-semibold">Install Radiant DICOM Viewer:</div>
                <div className="text-sm">
                  1. Download from: <a href="https://www.radiantviewer.com" target="_blank" className="text-blue-600 underline">radiantviewer.com</a>
                </div>
                <div className="text-sm">2. Install and restart this application</div>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="mt-2 px-3 py-1 bg-red-500 text-white text-sm rounded"
                >
                  Close
                </button>
              </div>
            ),
            { duration: 15000 }
          );
        }, 2000);
        
      } else {
        toast.error(`Failed to launch Radiant Viewer: ${error.message}`);
      }
    } finally {
      setIsOpen(false);
    }
  };

  const handleDownloadStudy = async () => {
    try {
      const orthancStudyId = study.orthancStudyID;
      
      if (!orthancStudyId) {
        alert('Orthanc Study ID not found');
        return;
      }
      
      const downloadUrl = `${backendUrl}/api/orthanc-download/study/${orthancStudyId}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error downloading study:', error);
      alert('Failed to download study: ' + error.message);
    } finally {
      setIsOpen(false);
    }
  };
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-green-600 hover:text-green-800 transition-colors duration-200 p-1 hover:bg-green-50 rounded"
        title="Download & Viewer options"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-1 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
            <div className="py-1">
              
              {/* 🆕 NEW: OHIF Viewer Section */}
              <div className="px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 border-b border-gray-100 flex items-center">
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                🌐 OHIF DICOM Viewer
              </div>
              
              {/* Local OHIF Viewer */}
              <button
                onClick={handleOpenOHIFLocal}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
              >
                <span className="text-lg mr-2">🏠</span>
                <div className="text-left">
                  <div className="font-medium">OHIF Viewer (Local)</div>
                  <div className="text-xs text-gray-500">Self-hosted on port 4000</div>
                </div>
              </button>

              {/* Cloud OHIF Viewer */}
              
              {/* Stone Web Viewer */}
              

              {/* 🆕 Radiant Viewer Bridge Section */}
              <div className="px-3 py-2 text-xs font-semibold text-purple-600 bg-purple-50 border-b border-gray-100 flex items-center">
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                🖥️ Desktop Viewer
              </div>

              {/* Enhanced Launch Button */}
              <LaunchButton 
                study={study}
                variant="dropdown-item"
                onLaunchSuccess={() => setIsOpen(false)}
              />
              
             

              {/* Download Section */}
              <div className="px-3 py-2 text-xs font-semibold text-green-600 bg-green-50 border-b border-gray-100 flex items-center">
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                📥 Download
              </div>

              <button
                onClick={handleDownloadStudy}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-green-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download ZIP
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// 🔧 NEW: Eye Icon Dropdown with Multiple Viewers
// 🔧 FIXED: EyeIconDropdown with Orthanc Authentication
const EyeIconDropdown = React.memo(({ studyInstanceUID }) => {
  const [isOpen, setIsOpen] = useState(false);

  const viewers = [
    {
      name: 'OHIF Viewer (Local)',
      description: 'Self-hosted OHIF viewer',
      action: () => openOHIFLocal(studyInstanceUID),
      color: 'blue',
      icon: '🏠'
    },
    {
      name: 'Stone Web Viewer',
      description: 'Orthanc built-in viewer',
      action: () => openStoneViewer(studyInstanceUID),
      color: 'gray',
      icon: '🗿'
    }
  ];

  const openOHIFLocal = useCallback((studyInstanceUID) => {
    const ohifBaseURL = import.meta.env.VITE_OHIF_LOCAL_URL || 'http://localhost:4000';
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    
    // 🔐 FIXED: Add Orthanc credentials
    const orthancUsername = 'alice';
    const orthancPassword = 'alicePassword';
    
    const ohifUrl = new URL(`${ohifBaseURL}/viewer`);
    ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
    
    const dataSourceConfig = {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Local Orthanc Server',
        name: 'orthanc',
        wadoUriRoot: `${orthancBaseURL}/wado`,
        qidoRoot: `${orthancBaseURL}/dicom-web`,
        wadoRoot: `${orthancBaseURL}/dicom-web`,
        qidoSupportsIncludeField: true,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        // 🔐 NEW: Add authentication headers
        headers: {
          'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
        },
        // 🔐 NEW: Add request options for authentication
        requestOptions: {
          auth: `${orthancUsername}:${orthancPassword}`,
          headers: {
            'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
          }
        }
      }
    };
    
    ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
    
    console.log('🏠 Opening local OHIF Viewer with authentication:', ohifUrl.toString());
    window.open(ohifUrl.toString(), '_blank');
    setIsOpen(false);
  }, []);

  const openStoneViewer = useCallback((studyInstanceUID) => {
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    
    // 🔐 FIXED: Add credentials to Stone Viewer URL
    const orthancUsername = 'alice';
    const orthancPassword = 'alicePassword';
    
    // Create URL with embedded credentials for Stone Viewer
    const orthancUrlWithAuth = orthancBaseURL.replace('http://', `http://${orthancUsername}:${orthancPassword}@`);
    const stoneUrl = `${orthancUrlWithAuth}/stone-webviewer/index.html?study=${studyInstanceUID}`;
    
    console.log('🗿 Opening Stone Web Viewer with authentication');
    window.open(stoneUrl, '_blank');
    setIsOpen(false);
  }, []);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-1 hover:bg-blue-50 rounded flex items-center"
        title="Choose DICOM Viewer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        {/* Dropdown arrow */}
        <svg className="h-3 w-3 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
            <div className="py-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-100 flex items-center">
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                🔍 Choose DICOM Viewer
              </div>
              
              {viewers.map((viewer, index) => (
                <button
                  key={index}
                  onClick={() => viewer.action()}
                  className={`flex items-center w-full px-3 py-3 text-sm text-gray-700 hover:bg-${viewer.color}-50 transition-colors border-b border-gray-100 last:border-b-0`}
                >
                  <span className="text-lg mr-3">{viewer.icon}</span>
                  <div className="text-left">
                    <div className="font-medium">{viewer.name}</div>
                    <div className="text-xs text-gray-500">{viewer.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

const UserButton = ({ study }) => {
  const hasClinicalHistory = study.clinicalHistory && study.clinicalHistory.trim() !== '';
  
  const handleUserClick = () => {
    console.log('User button clicked for study:', study._id);
  };

  return (
    <div className="flex items-center justify-center">
      <button 
        onClick={handleUserClick}
        className={`transition-colors duration-200 p-1 hover:bg-blue-50 rounded ${
          hasClinicalHistory 
            ? 'text-blue-600 hover:text-blue-800' 
            : 'text-gray-400 hover:text-gray-500'
        }`}
        title={hasClinicalHistory ? "Clinical history available" : "No clinical history"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
      
      {hasClinicalHistory && (
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
    </div>
  );
};

// Random Emoji Button Component - Single Emoji
const RandomEmojiButton = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleEmojiClick = () => {
    setIsOpen(true);
  };

  return (
    <>
      <button 
        onClick={handleEmojiClick}
        className="hover:scale-110 transition-transform duration-200 p-1 hover:bg-gray-50 rounded"
        title="View study series"
      >
        <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
          <rect x="6" y="6" width="12" height="12" fill="#4D4D4D"/>
          <line x1="12" y1="18" x2="12" y2="24" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="24" x2="12" y2="38" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="26" x2="22" y2="26" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="36" x2="22" y2="36" stroke="#999999" strokeWidth="2"/>
          <rect x="22" y="20" width="12" height="12" fill="#F90"/>
          <rect x="22" y="30" width="12" height="12" fill="#F90"/>
        </svg>
      </button>

      {isOpen && (
        <StudySeries
          study={study}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

// 🔧 SIMPLIFIED: WorklistTable - Updated for single page mode
const WorklistTable = React.memo(({ 
  studies = [], 
  loading = false, 
  totalRecords = 0,
  filteredRecords = 0,
  userRole = 'admin',
  onAssignmentComplete,
  recordsPerPage = 20,
  onRecordsPerPageChange,
  usePagination = false
}) => {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedStudies, setSelectedStudies] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // 🆕 NEW: Mobile menu state

  // Column visibility with defaults
  const getDefaultColumnVisibility = () => {
    return {
      checkbox: true,
      status: true,
      randomEmoji: true,
      user: true,
      downloadBtn: true,
      shareBtn: true,
      discussion: true,
      patientId: true,
      patientName: true,
      ageGender: true,
      description: true,
      series: true,
      modality: true,
      location: true,
      studyDate: true,
      uploadDate: false,
      reportedDate: true,
      reportedBy: false,
      accession: false,
      seenBy: false,
      actions: true,
      report: true,
      assignDoctor: true
    };
  };

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('worklistColumns');
      if (saved) {
        const parsedColumns = JSON.parse(saved);
        const defaultColumns = getDefaultColumnVisibility();
        return { ...defaultColumns, ...parsedColumns };
      }
    } catch (error) {
      console.warn('Error loading saved column preferences:', error);
    }
    return getDefaultColumnVisibility();
  });
  
  // Modal states
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [patientDetailModalOpen, setPatientDetailModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patientDetail, setPatientDetail] = useState(false);
  
  const canAssignDoctors = userRole === 'admin';

  // Save column preferences
  useEffect(() => {
    try {
      localStorage.setItem('worklistColumns', JSON.stringify(visibleColumns));
    } catch (error) {
      console.warn('Error saving column preferences:', error);
    }
  }, [visibleColumns]);

  const handleColumnChange = useCallback((column, visible) => {
    const essentialColumns = ['patientId', 'patientName', 'status'];
    if (essentialColumns.includes(column) && !visible) {
      console.warn(`Cannot hide essential column: ${column}`);
      return;
    }
    
    setVisibleColumns(prev => ({
      ...prev,
      [column]: visible
    }));
  }, []);

  const handleResetColumnsToDefault = useCallback(() => {
    const defaults = getDefaultColumnVisibility();
    setVisibleColumns(defaults);
    localStorage.setItem('worklistColumns', JSON.stringify(defaults));
  }, []);

  // 🔧 UPDATED: Filter studies based on active tab
  const filteredStudies = useMemo(() => {
    if (!studies || studies.length === 0) return [];
    
    switch (activeTab) {
      case 'pending':
        return studies.filter(study => study.currentCategory === 'pending');
      case 'inprogress':
        return studies.filter(study => study.currentCategory === 'inprogress');
      case 'completed':
        return studies.filter(study => study.currentCategory === 'completed');
      case 'archived':
        return studies.filter(study => study.currentCategory === 'archived');
      case 'all':
      default:
        return studies;
    }
  }, [studies, activeTab]);

  // 🔧 UPDATED: Calculate status counts from actual data
  const statusCounts = useMemo(() => {
    return {
      all: studies.length,
      pending: studies.filter(study => study.currentCategory === 'pending').length,
      inprogress: studies.filter(study => study.currentCategory === 'inprogress').length,
      completed: studies.filter(study => study.currentCategory === 'completed').length,
      archived: studies.filter(study => study.currentCategory === 'archived').length || 0
    };
  }, [studies]);

  // Memoized callbacks
  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      const allStudyIds = filteredStudies.map(study => study._id);
      setSelectedStudies(allStudyIds);
    } else {
      setSelectedStudies([]);
    }
  }, [filteredStudies]);

  const handleSelectStudy = useCallback((studyId) => {
    setSelectedStudies(prev => {
      if (prev.includes(studyId)) {
        return prev.filter(id => id !== studyId);
      } else {
        return [...prev, studyId];
      }
    });
  }, []);

  const handlePatientClick = useCallback((patientId) => {
    setSelectedPatientId(patientId);
    setPatientDetailModalOpen(true);
  }, []);

  const handlePatienIdClick = useCallback((patientId, study) => {
    setSelectedPatientId(patientId);
    setSelectedStudy(study);
    setPatientDetail(true);
  }, []);

  const handleAssignDoctor = useCallback((study) => {
    setSelectedStudy(study);
    setAssignmentModalOpen(true);
  }, []);

  // Clear selections when tab changes
  useEffect(() => {
    setSelectedStudies([]);
  }, [activeTab]);

  // Footer functionality functions (keeping existing logic but simplified)
  const handleAssignStudy = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to assign');
      return;
    }
    
    try {
      toast.loading('Preparing assignment modal...');
      
      const studyToAssign = studies.find(study => study._id === selectedStudies[0]);
      
      if (!studyToAssign) {
        toast.dismiss();
        toast.error('Selected study not found');
        return;
      }
      
      toast.dismiss();
      
      const formattedStudy = {
        _id: studyToAssign._id,
        patientName: studyToAssign.patientName || 'N/A',
        patientId: studyToAssign.patientId || 'N/A',
        modality: studyToAssign.modality || '',
        description: studyToAssign.description || '',
        studyDescription: studyToAssign.studyDescription || '',
        examDescription: studyToAssign.examDescription || '',
        modalitiesInStudy: studyToAssign.modalitiesInStudy || [],
        lastAssignedDoctor: studyToAssign.lastAssignedDoctor || null,
        workflowStatus: studyToAssign.workflowStatus || 'new',
        additionalStudies: selectedStudies.length - 1
      };
      
      setSelectedStudy(formattedStudy);
      setAssignmentModalOpen(true);
    } catch (error) {
      toast.dismiss();
      console.error('Error preparing assignment:', error);
      toast.error('Failed to prepare assignment. Please try again.');
    }
  };

  const handleAssignmentModalComplete = async (doctorId, priority, note) => {
    setAssignmentModalOpen(false);
    
    if (doctorId && onAssignmentComplete) {
      onAssignmentComplete();
    }
  };

  // 🔧 ADDED: Missing footer action functions
  const handleUnauthorized = useCallback(() => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to mark as unauthorized');
      return;
    }
    
    console.log('Unauthorized action for studies:', selectedStudies);
    // TODO: Implement unauthorized functionality
    toast.info(`Marking ${selectedStudies.length} studies as unauthorized`);
  }, [selectedStudies]);

  const handleExportWorklist = useCallback(() => {
    console.log('Exporting worklist...');
    try {
      // Create CSV content
      const headers = ['Patient ID', 'Patient Name', 'Age/Gender', 'Study Date', 'Modality', 'Description', 'Status', 'Location'];
      const csvContent = [
        headers.join(','),
        ...filteredStudies.map(study => [
          `"${study.patientId || ''}"`,
          `"${study.patientName || ''}"`,
          `"${study.ageGender || ''}"`,
          `"${study.studyDate || ''}"`,
          `"${study.modality || ''}"`,
          `"${study.description || ''}"`,
          `"${study.workflowStatus || ''}"`,
          `"${study.location || ''}"`
        ].join(','))
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `worklist_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(`Exported ${filteredStudies.length} studies to CSV`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export worklist');
    }
  }, [filteredStudies]);

  const handleDispatchReport = useCallback(() => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to dispatch report');
      return;
    }
    
    console.log('Dispatching reports for studies:', selectedStudies);
    // TODO: Implement dispatch report functionality
    toast.info(`Dispatching reports for ${selectedStudies.length} studies`);
  }, [selectedStudies]);

  const handleBulkZipDownload = useCallback(async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to download');
      return;
    }
    
    try {
      toast.loading(`Preparing bulk download for ${selectedStudies.length} studies...`);
      
      // Get the selected study data
      const selectedStudyData = studies.filter(study => selectedStudies.includes(study._id));
      
      // Check if all studies have orthancStudyID
      const validStudies = selectedStudyData.filter(study => study.orthancStudyID);
      
      if (validStudies.length === 0) {
        toast.dismiss();
        toast.error('No valid studies found for download');
        return;
      }
      
      if (validStudies.length !== selectedStudies.length) {
        toast.dismiss();
        toast.warning(`Only ${validStudies.length} of ${selectedStudies.length} studies can be downloaded`);
      }
      
      // Create download URLs for each study
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const downloadPromises = validStudies.map((study, index) => {
        return new Promise((resolve, reject) => {
          const downloadUrl = `${backendUrl}/api/orthanc-download/study/${study.orthancStudyID}/download`;
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `study_${study.patientId}_${study.orthancStudyID}.zip`;
          link.style.display = 'none';
          
          // Add a small delay between downloads to avoid overwhelming the server
          setTimeout(() => {
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve(study);
          }, index * 1000); // 1 second delay between each download
        });
      });
      
      // Execute all downloads
      await Promise.all(downloadPromises);
      
      toast.dismiss();
      toast.success(`Successfully initiated download for ${validStudies.length} studies`);
      
    } catch (error) {
      console.error('Bulk download error:', error);
      toast.dismiss();
      toast.error('Failed to initiate bulk download');
    }
  }, [selectedStudies, studies]);

  // 🔧 ADDED: Missing patient click handlers
  // const handlePatientClick = useCallback((patientId) => {
  //   setSelectedPatientId(patientId);
  //   setPatientDetailModalOpen(true);
  // }, []);

  // const handleAssignDoctor = useCallback((study) => {
  //   setSelectedStudy(study);
  //   setAssignmentModalOpen(true);
  // }, []);

  // 🔧 MEMOIZED TABLE HEADER
  const tableHeader = useMemo(() => (
    <thead className="sticky top-0 z-10">
      <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
        {visibleColumns.checkbox && (
          <th className="w-8 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            <input 
              type="checkbox" 
              className="rounded border-gray-300 w-4 h-4"
              checked={filteredStudies.length > 0 && selectedStudies.length === filteredStudies.length}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
          </th>
        )}
        {visibleColumns.status && (
          <th className="w-12 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Status
          </th>
        )}
        {visibleColumns.randomEmoji && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
         🌲
          </th>
        )}
        {visibleColumns.user && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            👤
          </th>
        )}
        {visibleColumns.downloadBtn && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            ⬇️
          </th>
        )}
        {/* 🆕 NEW: Share column header */}
        {(visibleColumns.shareBtn || true) && (  // 🔧 Added || true to force visibility
  <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
    🔗
  </th>
)}

        {visibleColumns.discussion && (
          <th className="w-10 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            💬
          </th>
        )}
        {visibleColumns.patientId && (
          <th className="w-20 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Patient ID
          </th>
        )}
        {visibleColumns.patientName && (
          <th className="min-w-32 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Patient Name
          </th>
        )}
        {visibleColumns.ageGender && (
          <th className="w-16 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Age/Sex
          </th>
        )}
        {visibleColumns.description && (
          <th className="min-w-40 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Description
          </th>
        )}
        {visibleColumns.series && (
          <th className="w-12 px-1 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Series
          </th>
        )}
        {visibleColumns.modality && (
          <th className="w-16 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Modality
          </th>
        )}
        {visibleColumns.location && (
          <th className="min-w-28 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Location
          </th>
        )}
        {visibleColumns.studyDate && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Study Date
          </th>
        )}
        {visibleColumns.uploadDate && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Upload Date
          </th>
        )}
        {visibleColumns.reportedDate && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Reported Date
          </th>
        )}
        {visibleColumns.reportedBy && (
          <th className="w-24 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Reported By
          </th>
        )}
        {visibleColumns.accession && (
          <th className="w-24 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Accession
          </th>
        )}
        {visibleColumns.seenBy && (
          <th className="w-24 px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Seen By
          </th>
        )}
        {visibleColumns.actions && (
          <th className="w-20 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Actions
          </th>
        )}
        {visibleColumns.report && (
          <th className="w-16 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
            Report
          </th>
        )}
        {canAssignDoctors && visibleColumns.assignDoctor && (
          <th className="w-24 px-2 py-2 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
            Assign Doctor
          </th>
        )}
      </tr>
    </thead>
  ), [visibleColumns, filteredStudies.length, selectedStudies.length, handleSelectAll, canAssignDoctors]);

  // 🔧 MEMOIZED TABLE BODY
  const tableBody = useMemo(() => (
    <tbody>
      {filteredStudies.length === 0 ? (
        <tr>
          <td colSpan="20" className="px-6 py-12 text-center text-gray-500 bg-gray-50">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium">No studies found</p>
            <p className="text-sm">Try adjusting your search or filter criteria</p>
          </td>
        </tr>
      ) : (
        filteredStudies.map((study, index) => (
          <StudyRow
            key={study._id}
            study={study}
            index={index}
            visibleColumns={visibleColumns}
            selectedStudies={selectedStudies}
            onSelectStudy={handleSelectStudy}
            onPatientClick={handlePatientClick}
            onPatienIdClick={handlePatienIdClick}
            onAssignDoctor={handleAssignDoctor}
            canAssignDoctors={canAssignDoctors}
          />
        ))
      )}
    </tbody>
  ), [
    filteredStudies, 
    visibleColumns, 
    selectedStudies, 
    handleSelectStudy, 
    handlePatientClick, 
    handlePatienIdClick, 
    handleAssignDoctor, 
    canAssignDoctors
  ]);

  // 🔧 NEW: Card grid for mobile view
  const cardGrid = useMemo(() => (
    <div className="block lg:hidden h-full overflow-y-auto">
      <div className="p-4 pb-20"> {/* Added bottom padding for footer */}
        {filteredStudies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="mx-auto h-20 w-20 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No studies found</h3>
            <p className="text-gray-500">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className="space-y-3"> {/* Reduced space between cards */}
            {filteredStudies.map((study, index) => (
              <StudyCard
                key={study._id}
                study={study}
                index={index}
                visibleColumns={visibleColumns}
                selectedStudies={selectedStudies}
                onSelectStudy={handleSelectStudy}
                onPatientClick={handlePatientClick}
                onPatienIdClick={handlePatienIdClick}
                onAssignDoctor={handleAssignDoctor}
                canAssignDoctors={canAssignDoctors}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  ), [filteredStudies, visibleColumns, selectedStudies, handleSelectStudy, handlePatientClick, handlePatienIdClick, handleAssignDoctor, canAssignDoctors]);

  return (
    <div className="bg-white w-full h-[85vh] rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Header section remains the same */}
      <div className="bg-gradient-to-r h-[9] from-blue-50 to-indigo-50 border-b border-gray-200">
        <div className="bg-gray-400 text-white p-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm text-black font-bold tracking-wide flex-shrink-0">WORKLIST</h1>
            
            <div className="flex items-center space-x-2 min-w-0">
              {/* 📱 MOBILE: Show 4 essential tabs with smaller text */}
              <div className="flex items-center h-[30px] bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden lg:hidden">
                <button
                  className={`px-1.5 py-1 text-xs rounded-l ${activeTab === 'all' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('all')}
                >
                  ALL({statusCounts.all})
                </button>
                <button
                  className={`px-1.5 py-1 text-xs ${activeTab === 'pending' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('pending')}
                >
                  Pending({statusCounts.pending})
                </button>
                <button
                  className={`px-1.5 py-1 text-xs ${activeTab === 'inprogress' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('inprogress')}
                >
                  Progress({statusCounts.inprogress})
                </button>
                <button
                  className={`px-1.5 py-1 text-xs rounded-r ${activeTab === 'completed' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => setActiveTab('completed')}
                >
                  Done({statusCounts.completed})
                </button>
              </div>

              {/* 🖥️ DESKTOP: Full scrollable tab view - UNCHANGED */}
              <div className="hidden lg:flex items-center h-[30px] bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <div className="flex overflow-x-auto scrollbar-hide">
                  <button
                    className={`px-3 py-1 rounded-l whitespace-nowrap ${activeTab === 'all' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                    onClick={() => setActiveTab('all')}
                  >
                    ALL({statusCounts.all})
                  </button>
                  <button
                    className={`px-3 py-1 whitespace-nowrap ${activeTab === 'pending' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                    onClick={() => setActiveTab('pending')}
                  >
                    Pending({statusCounts.pending})
                  </button>
                  <button
                    className={`px-3 py-1 whitespace-nowrap ${activeTab === 'inprogress' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                    onClick={() => setActiveTab('inprogress')}
                  >
                    In Progress({statusCounts.inprogress})
                  </button>
                  <button
                    className={`px-3 py-1 rounded-r whitespace-nowrap ${activeTab === 'completed' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                    onClick={() => setActiveTab('completed')}
                  >
                    Completed({statusCounts.completed})
                  </button>
                </div>
              </div>

              {/* 📱 MOBILE: Simplified dropdown for additional options only */}
              <div className="lg:hidden relative">
                <button 
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="h-[30px] px-2 bg-white rounded-lg shadow-md border border-gray-200 flex items-center text-gray-700 hover:bg-gray-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
                
                {mobileMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setMobileMenuOpen(false)}></div>
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-30">
                      <div className="py-1">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50">
                          Tools & Settings
                        </div>
                        <div className="border-t border-gray-100 my-1"></div>
                        <div className="px-3 py-2">
                          <StatusLegend />
                        </div>
                        <div className="border-t border-gray-100 my-1"></div>
                        <div className="px-3 py-2">
                          <ColumnConfigurator 
                            visibleColumns={visibleColumns}
                            onColumnChange={handleColumnChange}
                            onResetToDefault={handleResetColumnsToDefault}
                            isMobile={true}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 🖥️ DESKTOP: Status Legend and Column Configurator */}
              <div className="hidden lg:flex items-center space-x-2 h-[30px]">
                <StatusLegend />
                <ColumnConfigurator 
                  visibleColumns={visibleColumns}
                  onColumnChange={handleColumnChange}
                  onResetToDefault={handleResetColumnsToDefault}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 🔧 FIXED: Container for both mobile cards and desktop table */}
      <div className="flex-1 overflow-hidden relative"> {/* Added relative positioning */}
        {loading ? (
          <div className="flex justify-center items-center h-full bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Loading studies...</p>
            </div>
          </div>
        ) : (
          <>
            {/* 📱 MOBILE: Card View with FIXED SCROLLING */}
            {cardGrid}
            
            {/* 🖥️ DESKTOP: Table View */}
            <div className="hidden lg:block w-full h-full overflow-auto">
              <table className="w-full border-collapse min-w-full">
                {tableHeader}
                {tableBody}
              </table>
            </div>
          </>
        )}
      </div>
      
      {/* Footer sections remain the same */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-100 px-6 py-3 border-t border-green-200 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-green-700 font-medium">
              Showing <span className="font-bold">{filteredStudies.length}</span> of <span className="font-bold">{totalRecords}</span> total records
            </p>
          </div>
          {filteredRecords !== totalRecords && (
            <p className="text-xs text-green-600">
              (Filtered from {totalRecords} total)
            </p>
          )}
        </div>
        
        <DropdownPagination
          recordsPerPage={recordsPerPage}
          onRecordsPerPageChange={onRecordsPerPageChange}
          totalRecords={totalRecords}
          usePagination={usePagination}
          loading={loading}
        />
      </div>

      {/* Bottom action bar - MAKE SURE IT'S NOT BLOCKING CONTENT */}
      <div className="bg-gray-800 text-white w-full py-0 px-3 flex items-center justify-between border-t border-gray-700 fixed bottom-0 left-0 right-0 z-30">
        <div className="flex items-center">
          {/* Logo */}
          <div className="pr-4 flex items-center">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 mr-2 text-gray-300" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 18V12M12 12L15 9M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="uppercase font-semibold tracking-wider text-md">XCENTIC</span>
          </div>
          
          {/* Action Buttons */}
          <div className="flex space-x-1">
            <button 
              onClick={handleAssignStudy}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Assign Study
            </button>
            
            <button 
              onClick={handleUnauthorized}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Unauthorized
            </button>
            
            <button 
              onClick={handleExportWorklist}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded"
            >
              Export Worklist
            </button>
            
            <button 
              onClick={handleDispatchReport}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Dispatch Report
            </button>
            
            <button 
              onClick={handleBulkZipDownload}
              className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${
                selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              disabled={selectedStudies.length === 0}
            >
              Bulk Zip Download
            </button>
          </div>
        </div>
        
        {/* Total Count and Selection Info */}
        <div className="flex items-center mr-4 space-x-4">
          {selectedStudies.length > 0 && (
            <span className="text-sm text-yellow-300">
              Selected: {selectedStudies.length}
            </span>
          )}
          <span className="text-sm">Total: {totalRecords}</span>
        </div>
      </div>
      
      {/* Modals remain the same */}
      {assignmentModalOpen && selectedStudy && (
        <DoctorAssignmentModal
          study={selectedStudy}
          isOpen={assignmentModalOpen}
          onClose={() => setAssignmentModalOpen(false)}
          onAssignmentComplete={handleAssignmentModalComplete}
          isBulkAssignment={selectedStudies.length > 1}
          totalSelected={selectedStudies.length}
        />
      )}
      
      {patientDetailModalOpen && selectedPatientId && (
        <PatientDetailModal
          patientId={selectedPatientId}
          isOpen={patientDetailModalOpen}
          onClose={() => setPatientDetailModalOpen(false)}
        />
      )}

      {patientDetail && selectedPatientId && (
        <PatientReport
          patientId={selectedPatientId}
          study={selectedStudy}
          isOpen={patientDetail}
          onClose={() => setPatientDetail(false)}
        />
      )}
    </div>
  );
});

// StudyRow component - Add emergency row styling
const StudyRow = React.memo(({ 
  study, 
  index, 
  visibleColumns, 
  selectedStudies, 
  onSelectStudy, 
  onPatientClick,
  onPatienIdClick,
  onAssignDoctor,
  canAssignDoctors 
}) => {
  const isSelected = selectedStudies.includes(study._id);
  
  // 🆕 NEW: Check if this is an emergency case
  const isEmergency = study.caseType?.toLowerCase() === 'emergency' || 
                     study.priority === 'EMERGENCY' || 
                     study.assignment?.priority === 'EMERGENCY';
  
  // 🔧 ADDED: Missing click handlers for this row
  const handlePatientClick = useCallback(() => {
    onPatientClick(study.patientId);
  }, [study.patientId, onPatientClick]);

  const handlePatienIdClick = useCallback(() => {
    onPatienIdClick(study.patientId, study);
  }, [study.patientId, study, onPatienIdClick]);

  const handleAssignDoctor = useCallback(() => {
    onAssignDoctor(study);
  }, [study, onAssignDoctor]);
  
  // 🆕 NEW: Dynamic row styling based on emergency status
  const getRowClasses = () => {
    let baseClasses = "hover:bg-blue-100 transition-colors duration-150 border-b border-gray-200";
    
    if (isEmergency) {
      // Emergency cases get red background with varying intensity
      if (isSelected) {
        return `${baseClasses} bg-red-200 hover:bg-red-300 border-red-300`;
      } else {
        return `${baseClasses} bg-red-100 hover:bg-red-200 border-red-200`;
      }
    } else {
      // Normal cases keep original styling
      if (isSelected) {
        return `${baseClasses} bg-blue-50`;
      } else {
        return `${baseClasses} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`;
      }
    }
  };
  
  return (
    <tr className={getRowClasses()}>
      {/* Table cells implementation remains the same as your existing code */}
      {visibleColumns.checkbox && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <input 
            type="checkbox" 
            className="rounded border-gray-300 w-4 h-4"
            checked={isSelected}
            onChange={() => onSelectStudy(study._id)}
          />
        </td>
      )}
      
      {visibleColumns.status && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex justify-center">
            <StatusDot status={study.workflowStatus} priority={study.priority} />
            {/* 🆕 NEW: Emergency indicator */}
            {isEmergency && (
              <div className="ml-1 flex items-center" title="Emergency Case">
                <span className="text-red-600 font-bold text-xs animate-pulse">🚨</span>
              </div>
            )}
          </div>
        </td>
      )}

      {visibleColumns.randomEmoji && (
        <td className={`px-1 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <RandomEmojiButton study={study} />
        </td>
      )}

      {visibleColumns.user && (
        <td className={`px-1 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <button 
            onClick={handlePatientClick}
            className="text-sm font-semibold hover:text-blue-800 hover:underline flex items-center justify-center"
            title={study.clinicalHistory ? "Clinical history available" : "No clinical history"}
          >
            <UserButton study={study} />
          </button>
        </td>
      )}

      {visibleColumns.downloadBtn && (
        <td className={`px-1 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <DownloadDropdown study={study} />
        </td>
      )}

      {/* 🆕 NEW: Share Button Column */}
      {(visibleColumns.shareBtn || true) && (  // 🔧 Added || true to force visibility
  <td className={`px-1 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
    <ShareButton study={study} />
  </td>
)}

      {visibleColumns.discussion && (
        <td className={`px-1 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <DiscussionButton study={study} />
        </td>
      )}
      
      {visibleColumns.patientId && (
        <td className={`px-2 py-2 border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <button 
            onClick={handlePatienIdClick}
            className={`hover:underline text-sm font-medium truncate ${
              isEmergency ? 'text-red-700 hover:text-red-900' : 'text-blue-600 hover:text-blue-800'
            }`}
            title="Click to view patient details"
          >
            {study.patientId}
            {/* 🆕 NEW: Emergency badge */}
            {isEmergency && (
              <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-xs font-bold bg-red-600 text-white">
                EMERGENCY
              </span>
            )}
          </button>
        </td>
      )}
      
      {visibleColumns.patientName && (
        <td className={`px-2 py-2 border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-sm font-medium truncate ${
            isEmergency ? 'text-red-900' : 'text-gray-900'
          }`} title={study.patientName}>
            {study.patientName}
          </div>
        </td>
      )}
      
      {visibleColumns.ageGender && (
        <td className={`px-1 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
            {study.ageGender}
          </div>
        </td>
      )}
      
      {visibleColumns.description && (
        <td className={`px-2 py-2 border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs truncate max-w-40 ${
            isEmergency ? 'text-red-900 font-medium' : 'text-gray-900'
          }`} title={study.description}>
            {study.description}
          </div>
        </td>
      )}
      
      {visibleColumns.series && (
        <td className={`px-1 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
            {study.seriesImages}
          </div>
        </td>
      )}
      
      {visibleColumns.modality && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
            isEmergency ? 'bg-red-600 text-white' : 'bg-indigo-100 text-indigo-800'
          }`}>
            {study.modality}
          </span>
        </td>
      )}
      
      {visibleColumns.location && (
        <td className={`px-2 py-2 border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs truncate max-w-28 ${
            isEmergency ? 'text-red-700' : 'text-gray-600'
          }`} title={study.location}>
            {study.location}
          </div>
        </td>
      )}
      
      {/* ✨ UPDATED: Study Date with emergency styling */}
           {visibleColumns.studyDate && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
            <div className="font-medium" title={formatMonthDayYear(study.studyDateTime)}>
              {formatMonthDay(study.studyDateTime)}
            </div>
            <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
              {formatTime(study.studyDateTime)}
            </div>
          </div>
        </td>
      )}
      
      {/* ✨ UPDATED: Upload Date with emergency styling */}
      {visibleColumns.uploadDate && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
            <div className="font-medium" title={formatMonthDayYear(study.uploadDateTime)}>
              {formatRelativeDate(study.uploadDateTime)}
            </div>
            <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
              {formatTime(study.uploadDateTime)}
            </div>
          </div>
        </td>
      )}
      
      {/* ✨ UPDATED: Reported Date with emergency styling */}
      {visibleColumns.reportedDate && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
            {(() => {
              const reportedDate = study.reportedDateTime || 
                                 study.reportFinalizedAt || 
                                 study.reportDate ||
                                 (study.uploadedReportsData && study.uploadedReportsData.length > 0 ? 
                                  study.uploadedReportsData[study.uploadedReportsData.length - 1].uploadedAt : null);
              
              if (reportedDate) {
                return (
                  <>
                    <div className="font-medium" title={formatMonthDayYear(reportedDate)}>
                      {formatAbbrevMonthDay(reportedDate)}
                    </div>
                    <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                      {formatTime(reportedDate)}
                    </div>
                  </>
                );
              } else if (study.uploadedReportsCount > 0) {
                return (
                  <div className={`font-medium ${isEmergency ? 'text-red-600' : 'text-blue-600'}`}>
                    {study.uploadedReportsCount} report{study.uploadedReportsCount > 1 ? 's' : ''}
                  </div>
                );
              } else if (study.workflowStatus === 'report_in_progress' || 
                        study.workflowStatus === 'doctor_opened_report') {
                return (
                  <div className={`font-medium ${isEmergency ? 'text-red-500' : 'text-orange-500'}`}>
                    In Progress
                  </div>
                );
              } else {
                return (
                  <div className="text-gray-400">Not reported</div>
                );
              }
            })()}
          </div>
        </td>
      )}
      
      {visibleColumns.reportedBy && (
        <td className={`px-2 py-2 border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs truncate ${
            isEmergency ? 'text-red-900' : 'text-gray-900'
          }`} title={study.reportedBy || 'N/A'}>
            {study.reportedBy || 'N/A'}
          </div>
        </td>
      )}

      {visibleColumns.accession && (
        <td className={`px-2 py-2 border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs truncate ${
            isEmergency ? 'text-red-900' : 'text-gray-900'
          }`} title={study.accessionNumber || 'N/A'}>
            {study.accessionNumber || 'N/A'}
          </div>
        </td>
      )}

      {visibleColumns.seenBy && (
        <td className={`px-2 py-2 border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className={`text-xs truncate ${
            isEmergency ? 'text-red-900' : 'text-gray-900'
          }`} title={study.seenBy || 'Not Assigned'}>
            {study.seenBy || 'Not Assigned'}
          </div>
        </td>
      )}
      
      {visibleColumns.actions && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex justify-center items-center space-x-1">
            <EyeIconDropdown studyInstanceUID={study.instanceID} />
            <DownloadDropdown study={study} />
          </div>
        </td>
      )}
      
      {visibleColumns.report && (
        <td className={`px-2 py-2 text-center border-r ${isEmergency ? 'border-red-200' : 'border-gray-200'}`}>
          <div className="flex justify-center">
            <ReportButton study={study} />
          </div>
        </td>
      )}
      
      {canAssignDoctors && visibleColumns.assignDoctor && (
        <td className={`px-2 py-2 text-center ${isEmergency ? 'border-red-200' : ''}`}>
          <button 
            onClick={handleAssignDoctor}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
              study.workflowStatus === 'report_finalized' 
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                  ? isEmergency 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : isEmergency
                    ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            disabled={study.workflowStatus === 'final_report_downloaded'}
          >
            {study.workflowStatus === 'final_report_downloaded' 
              ? 'Done' 
              : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                ? 'Reassign' 
                : isEmergency 
                  ? '🚨 ASSIGN'
                  : 'Assign'
            }
          </button>
        </td>
      )}
    </tr>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.study._id === nextProps.study._id &&
    prevProps.index === nextProps.index &&
    JSON.stringify(prevProps.visibleColumns) === JSON.stringify(nextProps.visibleColumns) &&
    JSON.stringify(prevProps.selectedStudies) === JSON.stringify(nextProps.selectedStudies)
  );
});

export default WorklistTable;