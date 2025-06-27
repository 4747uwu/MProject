import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import toast from 'react-hot-toast';

// Import extracted components
import { 
  StatusDot, 
  UserButton, 
  RandomEmojiButton, 
  EyeIconDropdown,
  ROW_HEIGHT,
  DEFAULT_COLUMN_VISIBILITY 
} from './WorklistTable/index';

// Keep complex components as imports from existing files
import PatientDetailModal from './patients/PatientDetailModal';
import DoctorAssignmentModal from './Doctor/DoctorAssignmentModal';
import PatientReport from './patients/PatientDetail';
import ColumnConfigurator from './ColumnConfigurator';
import StatusLegend from './StatusLegend';
import DropdownPagination from './DropdownPagination';
import ShareButton from './ShareButton';
import DiscussionButton from './patients/DiscussionButton';
import ReportButton from './ReportButton';
import StudySeries from './patients/StudySeries';
import LaunchButton from './LaunchButton';
import StudyCard from './StudyCard';
import { 
  formatDate, formatTime, formatMonthDay, formatMonthDayYear, 
  formatAbbrevMonthDay, formatRelativeDate, formatMonthDayTime, formatMonthDayShort
} from '../../utils/dateUtils';
import api from '../../services/api'


import sessionManager from '../../services/sessionManager';
const DownloadDropdown = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // OPTION 1: Change JavaScript to use a more standard URI format
  const handleLaunchRadiantViewer = useCallback(async () => {
  try {
    if (!study || !study.orthancStudyID) {
      toast.error('Study data or Orthanc Study ID not found - cannot launch Radiant Viewer');
      return;
    }

    const loadingToastId = toast.loading('Preparing to launch Radiant Viewer...', { duration: 5000 });
    
    const orthancStudyId = study.orthancStudyID;
    const protocol = 'myapp';
    
    // OPTION 1A: Use query parameter format (RECOMMENDED)
    let launchUrl = `${protocol}://launch?study=${encodeURIComponent(orthancStudyId)}`;
    
    // OPTION 1B: Alternative - Use host-based format with proper encoding
    // let launchUrl = `${protocol}://launcher/study/${encodeURIComponent(orthancStudyId)}`;
    
    // OPTION 1C: Alternative - Use fragment-based format
    // let launchUrl = `${protocol}://launch#study=${encodeURIComponent(orthancStudyId)}`;
    
    console.log('Launch URL:', launchUrl);

    // Retrieve and append the authentication token
    const authToken = sessionManager.getToken();
    if (authToken) {
      // For query parameter format, add as additional parameter
      launchUrl += `&token=${encodeURIComponent(authToken)}`;
      console.log('Auth token included for protocol launch:', launchUrl);
    } else {
      console.warn('No auth token retrieved for protocol launch. Proceeding without it.');
    }

    // Test the URI before launching
    try {
      new URL(launchUrl); // This will throw if the URL is invalid
      console.log('URI validation passed');
    } catch (urlError) {
      console.error('Invalid URI format:', urlError);
      toast.error('Invalid URI format generated');
      return;
    }

    // Trigger the custom URL protocol
    window.location.href = launchUrl;

    setTimeout(() => {
      toast.dismiss(loadingToastId);
      toast.success('🖥️ Launch command sent to your system!', {
        duration: 4000,
        icon: '➡️'
      });
    }, 1500);

  } catch (error) {
    console.error('Error preparing to launch Radiant Viewer via protocol:', error);
    toast.dismiss();
    toast.error(`Failed to initiate Radiant Viewer launch: ${error.message}`);
  } finally {
    if (typeof setIsOpen === 'function') {
      setIsOpen(false);
    }
  }
  }, [study, setIsOpen]);
  const handleDownloadStudy = async () => {
    try {
      const orthancStudyId = study.orthancStudyID;
      
      if (!orthancStudyId) {
        toast.error('Orthanc Study ID not found');
        return;
      }
      
      // Show loading toast
      const loadingToastId = toast.loading('Preparing download...', { duration: 10000 });
      
      try {
        // Use the API service to download the study
        const response = await api.get(`/orthanc-download/study/${orthancStudyId}/download`, {
          responseType: 'blob', // Important for file downloads
          timeout: 300000, // 5 minutes timeout for large files
        });
        
        // Create blob URL and trigger download
        const blob = new Blob([response.data]);
        const downloadUrl = window.URL.createObjectURL(blob);
        
        // Create temporary link and trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `study_${orthancStudyId}.zip`; // Set a default filename
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        toast.dismiss(loadingToastId);
        toast.success('Download started successfully!');
        
      } catch (apiError) {
        toast.dismiss(loadingToastId);
        
        if (apiError.code === 'ECONNABORTED') {
          toast.error('Download timeout - the file might be too large. Please try again.');
        } else if (apiError.response?.status === 404) {
          toast.error('Study not found on the server');
        } else if (apiError.response?.status === 403) {
          toast.error('Access denied - you may not have permission to download this study');
        } else if (apiError.response?.status === 401) {
          toast.error('Authentication required - please log in again');
        } else {
          toast.error(`Download failed: ${apiError.message || 'Unknown error'}`);
        }
        
        console.error('API Error downloading study:', apiError);
        throw apiError; // Re-throw to be caught by outer catch
      }
      
    } catch (error) {
      console.error('Error downloading study:', error);
      // Only show error toast if it wasn't already handled above
      if (!error.response) {
        toast.error('Failed to download study: ' + error.message);
      }
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
              
              {/* Desktop Viewer Section */}
              <div onClick={handleLaunchRadiantViewer} className="px-3 py-2 text-xs font-semibold text-purple-600 bg-purple-50 border-b border-gray-100 flex items-center">
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                🖥️ Desktop Viewer
              </div>
              <button
                onClick={handleLaunchRadiantViewer}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 transition-colors"
                title="Launch Radiant Viewer"
              >
                Launch Radiant Viewer
              </button>

              

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

// 🔧 **MAIN COMPONENT: WorklistTable with Classic Table Design**
const WorklistTable = React.memo(({ 
  studies = [], 
  loading = false, 
  totalRecords = 0,
  filteredRecords = 0,
  userRole = 'admin',
  onAssignmentComplete,
  recordsPerPage = 20,
  onRecordsPerPageChange,
  usePagination = false,
  values,
  // 🆕 NEW: Add category props
  activeCategory = 'all',
  onCategoryChange
}) => {
  // ✅ Same state as original
    // ✅ ADD THIS: Mobile detection hook
    const [isMobile, setIsMobile] = useState(false);
    const [activeTab, setActiveTab] = useState(activeCategory);
      const [selectedStudies, setSelectedStudies] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);


  useEffect(() => {
    setActiveTab(activeCategory);
  }, [activeCategory]);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  // 🔧 **COPIED FROM COPY 4: Column visibility with defaults**
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

  // 🔧 UPDATED: Remove client-side filtering since backend handles it
  const filteredStudies = useMemo(() => {
    // 🆕 NEW: Since backend already filters by category, just return all studies
    // Only apply additional filters that might not be handled by backend
    
    if (!studies || studies.length === 0) return [];
    
    // Backend already handles tab filtering, so we just return the studies
    // The activeTab state is used to trigger different API calls
    return studies;
    
  }, [studies]); // Removed activeTab dependency since backend handles filtering

  // 🔧 UPDATED: Status counts now come from backend summary
  const statusCounts = useMemo(() => ({
    all: values?.today ?? studies.length,
    pending: values?.pending ?? 0,
    inprogress: values?.inprogress ?? 0,
    completed: values?.completed ?? 0,
    archived: 0 // Not implemented yet
  }), [studies, values]);

  

  // ✅ Same handlers (keeping the existing logic)
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

  // 🔧 ADD THIS: Tab change handler
  const handleTabChange = useCallback((newTab) => {
    setActiveTab(newTab);
    setSelectedStudies([]); // Clear selections when changing tabs
    if (onCategoryChange) {
      onCategoryChange(newTab);
    }
  }, [onCategoryChange]);

  // ✅ Action handlers (keeping existing ones)
  const handleAssignStudy = useCallback(async () => {
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
  }, [selectedStudies, studies]);

  const handleAssignmentModalComplete = async (doctorId, priority, note) => {
    setAssignmentModalOpen(false);
    
    if (doctorId && onAssignmentComplete) {
      onAssignmentComplete();
    }
  };

  // Other action handlers (keeping the existing ones)
  const handleUnauthorized = useCallback(() => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to mark as unauthorized');
      return;
    }
    
    console.log('Unauthorized action for studies:', selectedStudies);
    toast.info(`Marking ${selectedStudies.length} studies as unauthorized`);
  }, [selectedStudies]);

  const handleExportWorklist = useCallback(() => {
    console.log('Exporting worklist...');
    try {
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
    toast.info(`Dispatching reports for ${selectedStudies.length} studies`);
  }, [selectedStudies]);

  const handleBulkZipDownload = useCallback(async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to download');
      return;
    }
    
    try {
      toast.loading(`Preparing bulk download for ${selectedStudies.length} studies...`);
      
      const selectedStudyData = studies.filter(study => selectedStudies.includes(study._id));
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
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const downloadPromises = validStudies.map((study, index) => {
        return new Promise((resolve) => {
          const downloadUrl = `${backendUrl}/api/orthanc-download/study/${study.orthancStudyID}/download`;
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `study_${study.patientId}_${study.orthancStudyID}.zip`;
          link.style.display = 'none';
          
          setTimeout(() => {
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve(study);
          }, index * 1000);
        });
      });
      
      await Promise.all(downloadPromises);
      
      toast.dismiss();
      toast.success(`Successfully initiated download for ${validStudies.length} studies`);
      
    } catch (error) {
      console.error('Bulk download error:', error);
      toast.dismiss();
      toast.error('Failed to initiate bulk download');
    }
  }, [selectedStudies, studies]);

  
  const listRef = useRef(null);
  const [listHeight, setListHeight] = useState(400);

  useEffect(() => {
    const updateListHeight = () => {
      const container = document.querySelector('.worklist-container');
      if (container) {
        const headerHeight = 90; // Approximate header height
        const footerHeight = 120; // Approximate footer height
        const availableHeight = container.clientHeight - headerHeight - footerHeight;
        setListHeight(Math.max(700, availableHeight));
      }
    };

    updateListHeight();
    window.addEventListener('resize', updateListHeight);
    return () => window.removeEventListener('resize', updateListHeight);
  }, []);

  // ✅ ADD THIS: Virtual list data
  const virtualListData = useMemo(() => ({
    studies: filteredStudies,
    visibleColumns,
    selectedStudies,
    userRole, // ✅ ADD THIS LINE
  canAssignDoctors,
    callbacks: {
      onSelectStudy: handleSelectStudy,
      onPatientClick: handlePatientClick,
      onPatienIdClick: handlePatienIdClick,
      onAssignDoctor: handleAssignDoctor
    }
  }), [filteredStudies, visibleColumns, selectedStudies, handleSelectStudy, handlePatientClick, handlePatienIdClick, handleAssignDoctor]);



  // 🔧 **COPIED FROM COPY 4: StudyRow Component with Emergency Styling**
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
    
    const isEmergency = study.caseType?.toLowerCase() === 'emergency' || 
                       study.priority === 'EMERGENCY' || 
                       study.assignment?.priority === 'EMERGENCY';
    
    const handlePatientClick = useCallback(() => {
      onPatientClick(study.patientId);
    }, [study.patientId, onPatientClick]);

    const handlePatienIdClick = useCallback(() => {
      onPatienIdClick(study.patientId, study);
    }, [study.patientId, study, onPatienIdClick]);

    const handleAssignDoctor = useCallback(() => {
      onAssignDoctor(study);
    }, [study, onAssignDoctor]);

    
      // ✅ FIXED: Consistent borders with proper tabular styling
const getRowClasses = () => {
  const baseClasses = "transition-colors duration-150 border-b border-gray-300";
  
  if (isEmergency) {
    if (isSelected) {
      return `${baseClasses} bg-red-200 hover:bg-red-300 border-b-2`;
    } else {
      return `${baseClasses} bg-red-100 hover:bg-red-200`;
    }
  } else {
    if (isSelected) {
      return `${baseClasses} bg-blue-50 hover:bg-blue-100 border-b-2`;
    } else {
      // ✅ CLEAN ALTERNATING ROWS - White and light yellow
      if (index % 2 === 0) {
        return `${baseClasses} bg-white hover:bg-gray-50`;
      } else {
        return `${baseClasses} bg-gray-200 hover:bg-yellow-200`; // ✅ Changed from yellow-500 to yellow-100
      }
    }
  }
};
    
    return (
      <tr className={getRowClasses()}>        {visibleColumns.checkbox && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <input 
              type="checkbox" 
              className="rounded border-gray-300 w-4 h-4"
              checked={isSelected}
              onChange={() => onSelectStudy(study._id)}
            />
          </td>
        )}
        
        {visibleColumns.status && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <div className="flex justify-center">
              <StatusDot status={study.workflowStatus} priority={study.priority} />
              {isEmergency && (
                <div className="ml-1 flex items-center" title="Emergency Case">
                  <span className="text-red-600 font-bold text-xs animate-pulse">🚨</span>
                </div>
              )}
            </div>
          </td>
        )}

        {visibleColumns.randomEmoji && (
          <td className="px-1 py-2 text-center border-r border-gray-300">
            <RandomEmojiButton study={study} />
          </td>
        )}

        {visibleColumns.user && (
          <td className="px-1 py-2 text-center border-r border-gray-300">
            <button onClick={handlePatientClick}>
              <UserButton study={study} />
            </button>
          </td>
        )}

        {visibleColumns.downloadBtn && (
          <td className="px-1 py-2 text-center border-r border-gray-300">
            <DownloadDropdown study={study} />
          </td>
        )}

        {visibleColumns.shareBtn && (
          <td className="px-1 py-2 text-center border-r border-gray-300">
            <ShareButton study={study} />
          </td>
        )}

        {visibleColumns.discussion && (
          <td className="px-1 py-2 text-center border-r border-gray-300">
            <DiscussionButton study={study} />
          </td>
        )}        
        {visibleColumns.patientId && (
          <td className="px-2 py-2 border-r border-gray-300">
            <button 
              onClick={handlePatienIdClick}
              className={`hover:underline text-sm font-medium truncate block w-full text-left ${
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
        )}

        {visibleColumns.patientName && (
          <td className="px-2 py-2 border-r border-gray-300">
            <div className={`text-sm font-medium truncate ${
              isEmergency ? 'text-red-900' : 'text-gray-900'
            }`} title={study.patientName}>
              {study.patientName}
            </div>
          </td>
        )}

        {visibleColumns.ageGender && (
          <td className="px-1 py-2 text-center border-r border-gray-300">
            <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
              {study.ageGender || study.patientAge || 'N/A'}
            </div>
          </td>
        )}

        {visibleColumns.description && (
          <td className="px-2 py-2 border-r border-gray-300">
            <div className={`text-xs truncate ${
              isEmergency ? 'text-red-900 font-medium' : 'text-gray-900'
            }`} title={study.description}>
              {study.description || study.studyDescription || 'N/A'}
            </div>
          </td>
        )}

        {visibleColumns.series && (
          <td className="px-1 py-2 text-center border-r border-gray-300">
            <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
              {study.seriesImages || study.numberOfSeries || 'N/A'}
            </div>
          </td>
        )}

        {visibleColumns.modality && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
              isEmergency ? 'bg-red-600 text-white' : 'text-black'
            }`}>
              {study.modality || 'N/A'}
            </span>
          </td>
        )}

        {visibleColumns.location && (
          <td className="px-2 py-2 border-r border-gray-300">
            <div className={`text-xs truncate ${
              isEmergency ? 'text-red-700' : 'text-gray-600'
            }`} title={study.location}>
              {study.location || 'N/A'}
            </div>
          </td>
        )}

        {visibleColumns.studyDate && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
              <div className="font-medium">
                {study.studyDate ? formatMonthDay(study.studyDate) : 'N/A'}
              </div>
              <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                {study.studyTime || 'N/A'}
              </div>
            </div>
          </td>
        )}

        {visibleColumns.uploadDate && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
              <div className="font-medium">
                {study.uploadDate ? formatRelativeDate(study.uploadDate) : 'N/A'}
              </div>
              <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                {study.uploadTime || 'N/A'}
              </div>
            </div>
          </td>
        )}

        {visibleColumns.reportedDate && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
              {study.reportedDate ? (
                <>
                  <div className="font-medium">
                    {formatAbbrevMonthDay(study.reportedDate)}
                  </div>
                  <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                    {formatTime(study.reportedDate)}
                  </div>
                </>
              ) : (
                <div className="text-gray-400">Not reported</div>
              )}
            </div>
          </td>
        )}

        {visibleColumns.reportedBy && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <div className={`text-xs truncate ${
              isEmergency ? 'text-red-900' : 'text-gray-900'
            }`} title={study.reportedBy || 'N/A'}>
              {study.reportedBy || 'N/A'}
            </div>
          </td>
        )}

        {visibleColumns.accession && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <div className={`text-xs truncate ${
              isEmergency ? 'text-red-900' : 'text-gray-900'
            }`} title={study.accessionNumber || 'N/A'}>
              {study.accessionNumber || 'N/A'}
            </div>
          </td>
        )}

        {visibleColumns.seenBy && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <div className={`text-xs truncate ${
              isEmergency ? 'text-red-900' : 'text-gray-900'
            }`} title={study.seenBy || 'Not Assigned'}>
              {study.seenBy || 'Not Assigned'}
            </div>
          </td>
        )}        {/* Actions */}
        
        {visibleColumns.actions && (
        <td className="px-2 py-2 text-center border-r border-gray-300">
          <div className="flex justify-center items-center space-x-2">
            <EyeIconDropdown studyInstanceUID={study.instanceID} />
            <div className="flex-shrink-0">
              <DownloadDropdown study={study} />
            </div>
          </div>
        </td>
      )}

        {/* Report */}
        {visibleColumns.report && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <ReportButton study={study} />
          </td>
        )}

        {/* Assign Doctor */}
        {visibleColumns.assignDoctor && canAssignDoctors && (
          <td className="px-2 py-2 text-center border-r border-gray-300">
            <button
              onClick={handleAssignDoctor}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                study.workflowStatus === 'report_finalized' 
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                  : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                    ? isEmergency 
                      ? 'bg-orange-500 text-white hover:bg-orange-600' 
                      : 'bg-orange-500 text-white hover:bg-orange-600'
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
                    ? '🚨 Assign'
                    : 'Assign'
              }
            </button>
          </td>
        )}
      </tr>
    );
  });
      const cardGrid = useMemo(() => (
      <div className="block lg:hidden h-full overflow-y-auto">
        <div className="p-4 pb-0"> {/* Added bottom padding for footer */}
          {filteredStudies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg className="mx-auto h-20 w-20 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
    ), [filteredStudies, visibleColumns, selectedStudies, handleSelectStudy, handlePatientClick, handlePatienIdClick, handleAssignDoctor, canAssignDoctors]);  // ✅ Same rendering logic as original
  return (
    <>
    <div className="bg-white w-full h-screen min-h-0 rounded-xl shadow-xl border border-gray-200 flex flex-col worklist-container">
      {/* ✅ Header - Fixed height */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 rounded-lg flex-shrink-0" >
        {/* Header content stays the same */}
        <div className="bg-gray-400 text-white p-1 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-sm text-black font-bold tracking-wide flex-shrink-0">
              {isMobile ? 'MOBILE' : 'DESKTOP'} WORKLIST
            </h1>
            
            <div className="flex items-center space-x-2 min-w-0">
              {/* Mobile tabs - same as before */}
              <div className="flex items-center h-[30px] bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden lg:hidden">
                <button
                  className={`px-1.5 py-1 text-xs rounded-l ${activeTab === 'all' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => handleTabChange('all')}
                >
                  ALL({statusCounts.all})
                </button>
                <button
                  className={`px-1.5 py-1 text-xs ${activeTab === 'pending' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => handleTabChange('pending')}
                >
                  Pending({statusCounts.pending})
                </button>
                <button
                  className={`px-1.5 py-1 text-xs ${activeTab === 'inprogress' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => handleTabChange('inprogress')}
                >
                  Progress({statusCounts.inprogress})
                </button>
                <button
                  className={`px-1.5 py-1 text-xs rounded-r ${activeTab === 'completed' ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  onClick={() => handleTabChange('completed')}
                >
                  Done({statusCounts.completed})
                </button>
              </div>

              {/* Desktop tabs and mobile menu - same as before */}
              <div className="hidden lg:flex items-center h-[30px] bg-white rounded-lg shadow-md border border-gray-200  overflow-hidden">
                {['all', 'pending', 'inprogress', 'completed'].map(tab => (
                  <button
                    key={tab}
                    className={`px-3 py-1 whitespace-nowrap ${tab === 'all' ? 'rounded-l' : ''} ${tab === 'completed' ? 'rounded-r' : ''} ${
                      activeTab === tab ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                    onClick={() => handleTabChange(tab)} // 🔧 UPDATED: Use handleTabChange
                  >
                    {tab === 'inprogress' ? 'In Progress' : tab.charAt(0).toUpperCase() + tab.slice(1)}({statusCounts[tab]})
                  </button>
                ))}
              </div>

              {/* Mobile menu dropdown - same as before */}
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
                          📱 Mobile Tools
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

              {/* Desktop controls - same as before */}
              <div className="hidden lg:flex items-center space-x-2 h-[30px]">
                <StatusLegend />
                <ColumnConfigurator 
                  visibleColumns={visibleColumns}
                  onColumnChange={handleColumnChange}
                  onResetToDefault={handleResetColumnsToDefault}
                />
                <div className="px-2 py-1 bg-purple-500 text-white text-xs rounded-lg font-medium shadow-sm">
                  🎯 Responsive ({filteredStudies.length})
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 🔥 MAIN CONTENT: Fixed height with proper overflow */}
      <div className="flex-1 h-full overflow-y-auto relative">
        {loading ? (
          <div className="flex justify-center items-center h-full bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Loading studies...</p>
            </div>
          </div>
        ) : (
          <>
            {/* 📱 MOBILE: Card View - Fixed scrolling */}
          

           {/* 📱 MOBILE: Card View - FIXED */}
          {/* 📱 MOBILE: Card View - PROPER STUDYCARD SCROLLING */}

          <div className="block lg:hidden">
          {cardGrid}
        </div>            {/* 🖥️ DESKTOP: Virtual Scrolling Table - same as before */}
            <div className="hidden lg:block w-full flex-1 overflow-auto border border-gray-300">              {/* Desktop table implementation stays the same */}
              {/* Virtual Table Header */}
              <div className="flex items-center bg-gradient-to-r from-gray-100 to-gray-200 border-b-2 border-gray-300 w-[100%] text-xs font-bold text-gray-700 uppercase tracking-wider sticky top-0 z-10">
                {/* Header columns - same as before */}
                {visibleColumns.checkbox && (
                  <div className="flex-shrink-0 w-8 px-2 py-2 text-center border-r border-gray-300">
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300 w-4 h-4"
                      checked={selectedStudies.length === filteredStudies.length && filteredStudies.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </div>
                )}
                {visibleColumns.status && <div className="flex-shrink-0 w-16 px-2 py-2 text-center border-r border-gray-300">Status</div>}
                {visibleColumns.randomEmoji && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300"><svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                          <rect x="6" y="6" width="12" height="12" fill="#4D4D4D"/>
                          <line x1="12" y1="18" x2="12" y2="24" stroke="#999999" strokeWidth="2"/>
                          <line x1="12" y1="24" x2="12" y2="38" stroke="#999999" strokeWidth="2"/>
                          <line x1="12" y1="26" x2="22" y2="26" stroke="#999999" strokeWidth="2"/>
                          <line x1="12" y1="36" x2="22" y2="36" stroke="#999999" strokeWidth="2"/>
                          <rect x="22" y="20" width="12" height="12" fill="#F90"/>
                          <rect x="22" y="30" width="12" height="12" fill="#F90"/>
                        </svg></div>}
                {visibleColumns.user && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">👤</div>}
                
                {visibleColumns.shareBtn && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">🔗</div>}
                {visibleColumns.discussion && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">💬</div>}
                {visibleColumns.patientId && <div className="flex-1 min-w-[100px] px-2 py-2 border-r border-gray-300">Patient ID</div>}
                {visibleColumns.patientName && <div className="flex-1 min-w-[150px] px-2 py-2 border-r border-gray-300">Patient Name</div>}
                {visibleColumns.ageGender && <div className="flex-1 max-w-[60px] px-1 py-2 text-center border-r border-gray-300">Age/Sex</div>}
                {visibleColumns.description && <div className="flex-1 min-w-[150px] px-2 py-2 border-r border-gray-300">Description</div>}
                {visibleColumns.series && <div className="flex-1 min-w-[60px] px-1 py-2 text-center border-r border-gray-300">Series</div>}
                {visibleColumns.modality && <div className="flex-1 min-w-[80px] px-2 py-2 text-center border-r border-gray-300">Modality</div>}
                {visibleColumns.location && <div className="flex-1 min-w-[120px] px-2 py-2 border-r border-gray-300">Location</div>}
                {visibleColumns.studyDate && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Study Date</div>}
                {visibleColumns.uploadDate && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Upload Date</div>}
                {visibleColumns.reportedDate && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Reported Date</div>}
                {visibleColumns.reportedBy && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Reported By</div>}
                {visibleColumns.accession && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Accession</div>}
                {visibleColumns.seenBy && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Seen By</div>}
                {visibleColumns.actions && <div className="flex-1 min-w-[80px] px-2 py-2 text-center border-r border-gray-300">Actions</div>}
                {visibleColumns.report && (
  <div className="flex-1 max-w-[40px] px-2 py-2 text-center border-r border-gray-300">
    <span title="Report">
      <svg xmlns="http://www.w3.org/2000/svg" className="inline h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2m-6 4h6a2 2 0 002-2V7a2 2 0 00-2-2h-2.586a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 009.586 2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    </span>
  </div>
)}
                {visibleColumns.assignDoctor && canAssignDoctors && <div className="flex-shrink-0 w-24 px-2 py-2 text-center">Assign Doctor</div>}
              </div>              {/* Virtual List Container */}
              {filteredStudies.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
                  <svg className="mx-auto h-16 w-16 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-xl font-medium text-gray-900 mb-2">No studies found</h3>
                  <p className="text-gray-500 mb-4">Try adjusting your search or filter criteria</p>
                  <div className="text-sm text-gray-400">
                    Current filter: <span className="font-medium capitalize">{activeTab === 'inprogress' ? 'In Progress' : activeTab}</span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 ">
                  <List
                    ref={listRef}
                    height={listHeight}
                    itemCount={filteredStudies.length}
                    itemSize={ROW_HEIGHT}
                    itemData={virtualListData}
                    width="100%"
                    overscanCount={5}
                    style={{ position: 'static' }} // Add this to override react-window positioning

                  >
                    {({ index, style, data }) => {
                   const { studies, visibleColumns, selectedStudies, userRole, canAssignDoctors, callbacks } = data;
                       const study = studies[index];
                      const isSelected = selectedStudies.includes(study._id);
                      
                      const isEmergency = study.caseType?.toLowerCase() === 'emergency' || 
                                         study.priority === 'EMERGENCY' || 
                                         study.assignment?.priority === 'EMERGENCY';
                        const getRowClasses = () => {
                        let baseClasses = "flex items-center w-full hover:bg-blue-100 transition-colors duration-150 border-b border-gray-300";
                        
                        if (isEmergency) {
                          if (isSelected) {
                            return `${baseClasses} bg-red-200 hover:bg-red-300`;
                          } else {
                            return `${baseClasses} bg-red-100 hover:bg-red-200`;
                          }
                        } else {
                          if (isSelected) {
                            return `${baseClasses} bg-blue-50 hover:bg-blue-100 border-b-2`;
                          } else {
                            return `${baseClasses} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`;
                          }
                        }
                      };
                        return (
                        <div style={style} className="w-full border-b border-gray-300">
                          <div className={getRowClasses()}>
                            
                            {/* Existing virtual table row implementation */}
                            {/* Checkbox */}
                            {visibleColumns.checkbox && (
                              <div className="flex-shrink-0 w-8 px-2 py-2 text-center border-r border-gray-300">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 w-4 h-4"
                                  checked={selectedStudies.includes(study._id)}
                                  onChange={() => callbacks.onSelectStudy(study._id)}
                                />
                              </div>
                            )}
                            
                            {/* Status with Emergency indicator */}
                            {visibleColumns.status && (
                              <div className="flex-shrink-0 w-16 px-2 py-5 text-center border-r border-gray-300">
                                <div className="flex justify-center items-center">
                                  <StatusDot status={study.workflowStatus} priority={study.priority} />
                                  {isEmergency && (
                                    <span className="ml-1 text-red-600 font-bold text-xs animate-pulse">🚨</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Random Emoji (Series View) */}
                            {visibleColumns.randomEmoji && (
                              <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">
                                <RandomEmojiButton study={study} />
                              </div>
                            )}

                            {/* User */}
                            {visibleColumns.user && (
                              <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">
                                <button onClick={() => callbacks.onPatientClick(study.patientId)}>
                                  <UserButton study={study} />
                                </button>
                              </div>
                            )}

                            {/* Download */}
                            
                            {/* Share */}
                            {visibleColumns.shareBtn && (
                              <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">
                                <ShareButton study={study} />
                              </div>
                            )}

                            {/* Discussion */}
                            {visibleColumns.discussion && (
                              <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">
                                <DiscussionButton study={study} />
                              </div>
                            )}
                            
                            {/* Patient ID */}
                            {visibleColumns.patientId && (
                              <div className="flex-1 min-w-[100px] px-2 py-2 border-r border-gray-300">
                                <button 
                                  onClick={() => callbacks.onPatienIdClick(study.patientId, study)}
                                  className={`hover:underline text-sm font-medium truncate block w-full text-left ${
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
                              </div>
                            )}                            {/* Patient Name */}
                            {visibleColumns.patientName && (
                              <div className="flex-1 min-w-[150px] px-2 py-2 border-r border-gray-300">
                                <div className={`text-sm font-medium truncate ${
                                  isEmergency ? 'text-red-900' : 'text-gray-900'
                                }`} title={study.patientName}>
                                  {study.patientName}
                                </div>
                              </div>
                            )}

                            {/* Age/Sex */}
                            {visibleColumns.ageGender && (
                              <div className="flex-1 max-w-[60px] px-1 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                                  {study.ageGender || study.patientAge || 'N/A'}
                                </div>
                              </div>
                            )}

                            {/* Description */}
                            {visibleColumns.description && (
                              <div className="flex-1 min-w-[150px] px-2 py-2 border-r border-gray-300">
                                <div className={`text-xs truncate ${
                                  isEmergency ? 'text-red-900 font-medium' : 'text-gray-900'
                                }`} title={study.description}>
                                  {study.description || study.studyDescription || 'N/A'}
                                </div>
                              </div>
                            )}

                            {/* Series */}
                            {visibleColumns.series && (
                              <div className="flex-1 min-w-[60px] px-1 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                                  {study.seriesImages || study.numberOfSeries || 'N/A'}
                                </div>
                              </div>
                            )}

                            {/* Modality */}
                            {visibleColumns.modality && (
                              <div className="flex-1 min-w-[80px] px-2 py-2 text-center border-r border-gray-300">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                  isEmergency ? 'bg-red-600 text-white' : 'text-black'
                                }`}>
                                  {study.modality || 'N/A'}
                                </span>
                              </div>
                            )}

                            {/* Location */}
                            {visibleColumns.location && (
                              <div className="flex-1 min-w-[120px] px-2 py-2 border-r border-gray-300">
                                <div className={`text-xs truncate ${
                                  isEmergency ? 'text-red-700' : 'text-gray-600'
                                }`} title={study.location}>
                                  {study.location || 'N/A'}
                                </div>
                              </div>
                            )}

                            {/* Study Date */}
                            {visibleColumns.studyDate && (
                              <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                                  <div className="font-medium">
                                    {study.studyDate ? formatMonthDay(study.studyDate) : 'N/A'}
                                  </div>
                                  <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                                    {study.studyTime || 'N/A'}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Upload Date */}
                            {visibleColumns.uploadDate && (
                              <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                                  <div className="font-medium">
                                    {study.uploadDate ? formatRelativeDate(study.uploadDate) : 'N/A'}
                                  </div>
                                  <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                                    {study.uploadTime || 'N/A'}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Reported Date */}
                            {visibleColumns.reportedDate && (
                              <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                                  {study.reportedDate ? (
                                    <>
                                      <div className="font-medium">
                                        {formatAbbrevMonthDay(study.reportedDate)}
                                      </div>
                                      <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>
                                        {formatTime(study.reportedDate)}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-gray-400">Not reported</div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Reported By */}
                            {visibleColumns.reportedBy && (
                              <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs truncate ${
                                  isEmergency ? 'text-red-900' : 'text-gray-900'
                                }`} title={study.reportedBy || 'N/A'}>
                                  {study.reportedBy || 'N/A'}
                                </div>
                              </div>
                            )}

                            {/* Accession */}
                            {visibleColumns.accession && (
                              <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs truncate ${
                                  isEmergency ? 'text-red-900' : 'text-gray-900'
                                }`} title={study.accessionNumber || 'N/A'}>
                                  {study.accessionNumber || 'N/A'}
                                </div>
                              </div>
                            )}

                            {/* Seen By */}
                            {visibleColumns.seenBy && (
                              <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">
                                <div className={`text-xs truncate ${
                                  isEmergency ? 'text-red-900' : 'text-gray-900'
                                }`} title={study.seenBy || 'Not Assigned'}>
                                  {study.seenBy || 'Not Assigned'}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            
                            {visibleColumns.actions && (
                            <div className="flex-1 min-w-[80px] px-2 py-2 text-center border-r border-gray-300">
                              <div className="flex justify-center items-center space-x-2">
                                <EyeIconDropdown studyInstanceUID={study.instanceID} />
                                <div className="flex-shrink-0">
              <DownloadDropdown study={study} />
            </div>
                              </div>
                            </div>
                          )}

                            {/* Report */}
                            {visibleColumns.report && (
                              <div className="flex-1 max-w-[40px] px-2 py-2 text-center border-r border-gray-300">
                                <ReportButton study={study} />
                              </div>
                            )}

                            {/* Assign Doctor */}
                            {visibleColumns.assignDoctor && canAssignDoctors && (
                              <div className="flex-shrink-0 w-24 px-2 py-2 text-center">
                                <button
                                  onClick={() => callbacks.onAssignDoctor(study)}
                                  className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                                    study.workflowStatus === 'report_finalized' 
                                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                                      : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                                        ? isEmergency 
                                          ? 'bg-orange-500 text-white hover:bg-orange-600' 
                                          : 'bg-orange-500 text-white hover:bg-orange-600'
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
                                        ? '🚨 Assign'
                                        : 'Assign'
                                  }
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  </List>
                  
                  {/* Debug overlay */}
                  
                </div>
              )}
            </div>
          </>
        )}
      </div>      
      {/* ✅ COMBINED Footer with Pagination and Action Bar - Only show when there are studies */}
      
        <div className="bg-gray-800 text-white w-full py-0 px-3 flex items-center justify-between border-t border-gray-700 fixed bottom-0 left-0 right-0 z-30">
          {/* Left Section - Brand + Action Buttons */}
          <div className="flex items-center space-x-4">
            {/* Brand Section */}
            <div className="flex items-center">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 mr-2 text-gray-300" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 18V12M12 12L15 9M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="uppercase font-semibold tracking-wider text-sm">
                {isMobile ? '📱 MOBILE' : '🖥️ DESKTOP'} XCENTIC
              </span>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-1 overflow-x-auto">
              <button 
                onClick={handleAssignStudy}
                className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${
                  selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={selectedStudies.length === 0}
              >
                Assign Study
              </button>
              
              <button 
                onClick={handleUnauthorized}
                className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${
                  selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={selectedStudies.length === 0}
              >
                Unauthorized
              </button>
              
              <button 
                onClick={handleExportWorklist}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap"
              >
                Export Worklist
              </button>
              
              <button 
                onClick={handleDispatchReport}
                className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${
                  selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={selectedStudies.length === 0}
              >
                Dispatch Report
              </button>
              
              <button 
                onClick={handleBulkZipDownload}
                className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${
                  selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={selectedStudies.length === 0}
              >
                Bulk Zip Download
              </button>
            </div>
          </div>

          {/* Middle Section - Study Count */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-green-400 font-medium">
                {isMobile ? '📱' : '🖥️'} <span className="font-bold text-white">{filteredStudies.length}</span> of <span className="font-bold text-white">{totalRecords}</span> studies
              </p>
            </div>
            {filteredRecords !== totalRecords && (
              <p className="text-xs text-green-300">
                (Filtered from {totalRecords} total)
              </p>
            )}
          </div>

          {/* Right Section - Selection Info + Pagination */}
          <div className="flex items-center space-x-4">
            {/* Selection Count */}
            <div className="flex items-center space-x-3">
              {selectedStudies.length > 0 && (
                <span className="text-xs text-yellow-300 font-medium bg-yellow-900 px-2 py-1 rounded">
                  Selected: {selectedStudies.length}
                </span>
              )}
            </div>
            
            {/* Pagination Component */}
            <div className="bg-gray-100 text-black rounded px-2 py-1">
              <DropdownPagination
                recordsPerPage={recordsPerPage}
                onRecordsPerPageChange={onRecordsPerPageChange}
                totalRecords={totalRecords}
                usePagination={usePagination}
                loading={loading}
              />
            </div>
          </div>
        </div>
      </div>
      
      
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
    </>
  );
});

export default WorklistTable;