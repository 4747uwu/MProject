import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import toast from 'react-hot-toast';
import AutoSizer from 'react-virtualized-auto-sizer';

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

  const handleLaunchRadiantViewer = useCallback(async () => {
    try {
      if (!study || !study.orthancStudyID) {
        toast.error('Study data or Orthanc Study ID not found - cannot launch Radiant Viewer');
        return;
      }
      const loadingToastId = toast.loading('Preparing to launch Radiant Viewer...', { duration: 5000 });
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
        toast.success('🖥️ Launch command sent to your system!', { duration: 4000, icon: '➡️' });
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
      const loadingToastId = toast.loading('Preparing download...', { duration: 10000 });
      
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
          toast.error('Download timeout - the file might be too large. Please try again.');
        } else if (apiError.response?.status === 404) {
          toast.error('Study not found on the server');
        } else {
          toast.error(`Download failed: ${apiError.message || 'Unknown error'}`);
        }
        throw apiError;
      }
    } catch (error) {
      console.error('Error downloading study:', error);
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-1 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
            <div className="py-1">
              
            <button
              onClick={handleLaunchRadiantViewer}
              className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-green-50 transition-colors rounded"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553 2.276A2 2 0 0121 14.09V17a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.91a2 2 0 01.447-1.814L8 10m7-6v6m0 0l-3-3m3 3l3-3" />
              </svg>
              Radiant Viewer
            </button>
              
              <button onClick={handleDownloadStudy} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-green-50 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Download ZIP
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

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
  activeCategory = 'all',
  onCategoryChange
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState(activeCategory);
  const [selectedStudies, setSelectedStudies] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [immediateUpdates, setImmediateUpdates] = useState({});

  useEffect(() => {
    setActiveTab(activeCategory);
  }, [activeCategory]);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getDefaultColumnVisibility = () => ({
      checkbox: true, status: true, randomEmoji: true, user: true, downloadBtn: true,
      shareBtn: true, discussion: true, patientId: true, patientName: true, ageGender: true,
      description: true, series: true, modality: true, location: true, studyDate: true,
      uploadDate: false, reportedDate: true, reportedBy: false, accession: false,
      seenBy: false, actions: true, report: true, assignDoctor: true
  });

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('worklistColumns');
      if (saved) {
        return { ...getDefaultColumnVisibility(), ...JSON.parse(saved) };
      }
    } catch (error) {
      console.warn('Error loading saved column preferences:', error);
    }
    return getDefaultColumnVisibility();
  });

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [patientDetailModalOpen, setPatientDetailModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patientDetail, setPatientDetail] = useState(false);
  const canAssignDoctors = userRole === 'admin';

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
    setVisibleColumns(prev => ({ ...prev, [column]: visible }));
  }, []);

  const handleResetColumnsToDefault = useCallback(() => {
    const defaults = getDefaultColumnVisibility();
    setVisibleColumns(defaults);
    localStorage.setItem('worklistColumns', JSON.stringify(defaults));
  }, []);

  const filteredStudies = useMemo(() => studies || [], [studies]);

  const statusCounts = useMemo(() => ({
    all: values?.today ?? studies.length,
    pending: values?.pending ?? 0,
    inprogress: values?.inprogress ?? 0,
    completed: values?.completed ?? 0,
    archived: 0
  }), [studies, values]);

  const handleSelectAll = useCallback((checked) => {
    setSelectedStudies(checked ? filteredStudies.map(study => study._id) : []);
  }, [filteredStudies]);

  const handleSelectStudy = useCallback((studyId) => {
    setSelectedStudies(prev => prev.includes(studyId) ? prev.filter(id => id !== studyId) : [...prev, studyId]);
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

  useEffect(() => {
    setSelectedStudies([]);
  }, [activeTab]);

  const handleTabChange = useCallback((newTab) => {
    setActiveTab(newTab);
    setSelectedStudies([]);
    if (onCategoryChange) {
      onCategoryChange(newTab);
    }
  }, [onCategoryChange]);

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

  const handleAssignmentSuccess = useCallback((studyId, assignedDoctors) => {
    setImmediateUpdates(prev => ({
      ...prev,
      [studyId]: {
        workflowStatus: 'assigned_to_doctor',
        assignedDoctors: assignedDoctors,
        timestamp: Date.now()
      }
    }));
    toast.success(`✅ Study assigned to ${assignedDoctors.map(d => `Dr. ${d.name}`).join(', ')}!`);
  }, []);

  const enhancedStudies = useMemo(() => {
    return filteredStudies.map(study => {
      const update = immediateUpdates[study._id];
      if (update && Date.now() - update.timestamp < 30000) {
        return {
          ...study,
          workflowStatus: update.workflowStatus,
          assignedDoctors: update.assignedDoctors,
          isJustAssigned: true
        };
      }
      return study;
    });
  }, [filteredStudies, immediateUpdates]);

  const handleAssignmentModalComplete = (result) => {
    setAssignmentModalOpen(false);
    if (result?.success) {
      // onAssignmentComplete?.();
      handleAssignmentSuccess(result.studyId, result.assignedDoctors);
    }
  };

  const handleUnauthorized = useCallback(() => toast.info(`Marking ${selectedStudies.length} studies as unauthorized`), [selectedStudies]);
  const handleExportWorklist = useCallback(() => toast.success(`Exported ${filteredStudies.length} studies to CSV`), [filteredStudies]);
  const handleDispatchReport = useCallback(() => toast.info(`Dispatching reports for ${selectedStudies.length} studies`), [selectedStudies]);
  const handleBulkZipDownload = useCallback(async () => toast.success(`Initiated download for ${selectedStudies.length} studies`), [selectedStudies]);

  const listRef = useRef(null);

  const virtualListData = useMemo(() => ({
    studies: enhancedStudies,
    visibleColumns,
    selectedStudies,
    userRole,
    canAssignDoctors,
    callbacks: {
      onSelectStudy: handleSelectStudy,
      onPatientClick: handlePatientClick,
      onPatienIdClick: handlePatienIdClick,
      onAssignDoctor: handleAssignDoctor
    }
  }), [enhancedStudies, visibleColumns, selectedStudies, userRole, canAssignDoctors, handleSelectStudy, handlePatientClick, handlePatienIdClick, handleAssignDoctor]);

   const cardGrid = useMemo(() => (
    <div className="block lg:hidden h-full overflow-y-auto">
      {/* MOBILE TAB NAVIGATION - Fixed here */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">WORKLIST</h2>
          <div className="flex items-center gap-1 overflow-x-auto">
            {['all', 'pending', 'inprogress', 'completed'].map(tab => (
              <button 
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab 
                    ? 'bg-blue-500 text-white' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab === 'inprogress' ? 'In Progress' : tab.charAt(0).toUpperCase() + tab.slice(1)} ({statusCounts[tab] || 0})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 pb-20">
        {filteredStudies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="mx-auto h-20 w-20 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No studies found</h3>
            <p className="text-gray-500">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div classname = 'w-full max-w-full overflow-hidden'>
          <div className="space-y-3 w-full">
            {filteredStudies.map((study, index) => (
              <div classname = "w-full max-w-full overflow-hidden">
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
              </div>
            ))}
          </div>
          </div>
        )}
      </div>
    </div>
  ), [filteredStudies, visibleColumns, selectedStudies, handleSelectStudy, handlePatientClick, handlePatienIdClick, handleAssignDoctor, canAssignDoctors, activeTab, statusCounts, handleTabChange]);
  
  return (
    <>
      <div className="bg-white w-full h-full rounded-xl shadow-xl border border-gray-200 flex flex-col">
        
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 rounded-lg flex-shrink-0">
          <div className="bg-gray-400 text-white p-1 rounded-t-lg">
            <div className="flex items-center justify-between">
              <h1 className="text-sm text-black font-bold tracking-wide flex-shrink-0">WORKLIST</h1>
              <div className="flex items-center space-x-2 min-w-0">
                <div className="hidden lg:flex items-center h-[30px] bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                  {['all', 'pending', 'inprogress', 'completed'].map(tab => (
                    <button key={tab} className={`px-3 py-1 whitespace-nowrap ${tab === 'all' ? 'rounded-l' : ''} ${tab === 'completed' ? 'rounded-r' : ''} ${activeTab === tab ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-700'}`} onClick={() => handleTabChange(tab)}>
                      {tab === 'inprogress' ? 'In Progress' : tab.charAt(0).toUpperCase() + tab.slice(1)} ({statusCounts[tab]})
                    </button>
                  ))}
                </div>
                <div className="lg:hidden relative">
                  <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="h-[30px] px-2 bg-white rounded-lg shadow-md border border-gray-200 flex items-center text-gray-700 hover:bg-gray-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                  </button>
                  {mobileMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMobileMenuOpen(false)}></div>
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-30">
                        <div className="py-1">
                          <div className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50">📱 Mobile Tools</div>
                          <div className="border-t border-gray-100 my-1"></div>
                          <div className="px-3 py-2"><StatusLegend /></div>
                          <div className="border-t border-gray-100 my-1"></div>
                          <div className="px-3 py-2"><ColumnConfigurator visibleColumns={visibleColumns} onColumnChange={handleColumnChange} onResetToDefault={handleResetColumnsToDefault} isMobile={true}/></div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="hidden lg:flex items-center space-x-2 h-[30px]">
                  <StatusLegend />
                  <ColumnConfigurator visibleColumns={visibleColumns} onColumnChange={handleColumnChange} onResetToDefault={handleResetColumnsToDefault} />
                  <div className="px-2 py-1 bg-purple-500 text-white text-xs rounded-lg font-medium shadow-sm">🎯 Responsive ({filteredStudies.length})</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className="flex justify-center items-center h-full bg-gray-50"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div><p className="text-gray-600 font-medium">Loading studies...</p></div></div>
          ) : (
            <>
              {cardGrid}
              <div className="hidden lg:flex flex-col w-full h-full">
                <div className="flex items-center bg-gradient-to-r from-gray-100 to-gray-200 border-b-2 border-gray-300 w-full text-xs font-bold text-gray-700 uppercase tracking-wider sticky top-0 z-10 flex-shrink-0">
                  {visibleColumns.checkbox && <div className="flex-shrink-0 w-8 px-2 py-2 text-center border-r border-gray-300"><input type="checkbox" className="rounded border-gray-300 w-4 h-4" checked={selectedStudies.length === filteredStudies.length && filteredStudies.length > 0} onChange={(e) => handleSelectAll(e.target.checked)}/></div>}
                  {visibleColumns.status && <div className="flex-shrink-0 w-16 px-2 py-2 text-center border-r border-gray-300">Status</div>}
                  {visibleColumns.randomEmoji && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300"><svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="6" y="6" width="12" height="12" fill="#4D4D4D"/><line x1="12" y1="18" x2="12" y2="24" stroke="#999999" strokeWidth="2"/><line x1="12" y1="24" x2="12" y2="38" stroke="#999999" strokeWidth="2"/><line x1="12" y1="26" x2="22" y2="26" stroke="#999999" strokeWidth="2"/><line x1="12" y1="36" x2="22" y2="36" stroke="#999999" strokeWidth="2"/><rect x="22" y="20" width="12" height="12" fill="#F90"/><rect x="22" y="30" width="12" height="12" fill="#F90"/></svg></div>}
                  {visibleColumns.user && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">👤</div>}
                  {visibleColumns.shareBtn && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">🔗</div>}
                  {visibleColumns.discussion && <div className="flex-shrink-0 w-10 px-1 py-2 text-center border-r border-gray-300">💬</div>}
                  {visibleColumns.patientId && <div className="flex-1 min-w-[100px] px-2 py-2 border-r border-gray-300">Patient ID</div>}
                  {visibleColumns.patientName && <div className="flex-1 lg:min-w-[120px] xl:min-w-[150px] px-2 py-2 border-r border-gray-300">Patient Name</div>}
                  {visibleColumns.ageGender && <div className="flex-shrink-0 w-16 px-1 py-2 text-center border-r border-gray-300">Age/Sex</div>}
                  {visibleColumns.description && <div className="flex-1 lg:min-w-[120px] xl:min-w-[150px] px-2 py-2 border-r border-gray-300">Description</div>}
                  {visibleColumns.series && <div className="flex-shrink-0 w-16 px-1 py-2 text-center border-r border-gray-300">Series</div>}
                  {visibleColumns.modality && <div className="flex-shrink-0 w-20 px-2 py-2 text-center border-r border-gray-300">Modality</div>}
                  {visibleColumns.location && <div className="flex-1 lg:min-w-[100px] xl:min-w-[120px] px-2 py-2 border-r border-gray-300">Location</div>}
                  {visibleColumns.studyDate && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Study Date</div>}
                  {visibleColumns.uploadDate && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300 hidden xl:block">Upload Date</div>}
                  {visibleColumns.reportedDate && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300">Reported Date</div>}
                  {visibleColumns.reportedBy && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300 hidden xl:block">Reported By</div>}
                  {visibleColumns.accession && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300 hidden xl:block">Accession</div>}
                  {visibleColumns.seenBy && <div className="flex-1 min-w-[100px] px-2 py-2 text-center border-r border-gray-300 hidden xl:block">Seen By</div>}
                  {visibleColumns.actions && <div className="flex-1 min-w-[80px] px-2 py-2 text-center border-r border-gray-300">Actions</div>}
                  {visibleColumns.report && <div className="flex-1 max-w-[40px] px-2 py-2 text-center border-r border-gray-300"><span title="Report"><svg xmlns="http://www.w3.org/2000/svg" className="inline h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2m-6 4h6a2 2 0 002-2V7a2 2 0 00-2-2h-2.586a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 009.586 2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></span></div>}
                  {visibleColumns.assignDoctor && canAssignDoctors && <div className="flex-shrink-0 w-24 px-2 py-2 text-center">Assign Doctor</div>}
                </div>
                
                <div className="w-full flex-1 relative">
                  {filteredStudies.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center"><svg className="mx-auto h-16 w-16 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><h3 className="text-xl font-medium text-gray-900 mb-2">No studies found</h3><p className="text-gray-500 mb-4">Try adjusting your search or filter criteria</p><div className="text-sm text-gray-400">Current filter: <span className="font-medium capitalize">{activeTab === 'inprogress' ? 'In Progress' : activeTab}</span></div></div>
                  ) : (
                    <AutoSizer>
                      {({ height, width }) => (
                        <List 
                          ref={listRef} 
                          height={height} 
                          width={width}
                          itemCount={filteredStudies.length} 
                          itemSize={ROW_HEIGHT} 
                          itemData={virtualListData} 
                          overscanCount={5}
                        >
                          {({ index, style, data }) => {
                            const { studies, visibleColumns, selectedStudies, callbacks } = data;
                            const study = studies[index];
                            const isSelected = selectedStudies.includes(study._id);
                            const isEmergency = study.caseType?.toLowerCase() === 'emergency' || study.priority === 'EMERGENCY';
                            
                            const getRowClasses = () => {
                              let baseClasses = "flex items-center w-full h-full transition-colors duration-150";
                              if (isEmergency) return isSelected ? `${baseClasses} bg-red-200 hover:bg-red-300` : `${baseClasses} bg-red-100 hover:bg-red-200`;
                              if (isSelected) return `${baseClasses} bg-blue-50 hover:bg-blue-100`;
                              return `${baseClasses} ${index % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`;
                            };
                            
                            return (
                              <div style={style} className="w-full border-b border-gray-300">
                                <div className={getRowClasses()}>
                                  {visibleColumns.checkbox && <div className="flex-shrink-0 w-8 px-2 flex items-center justify-center border-r border-gray-300 h-full"><input type="checkbox" className="rounded border-gray-300 w-4 h-4" checked={selectedStudies.includes(study._id)} onChange={() => callbacks.onSelectStudy(study._id)}/></div>}
                                  {visibleColumns.status && <div className="flex-shrink-0 w-16 px-2 flex items-center justify-center border-r border-gray-300 h-full"><div className="flex justify-center items-center"><StatusDot status={study.workflowStatus} priority={study.priority} />{isEmergency && (<span className="ml-1 text-red-600 font-bold text-xs animate-pulse">🚨</span>)}</div></div>}
                                  {visibleColumns.randomEmoji && <div className="flex-shrink-0 w-10 px-1 flex items-center justify-center border-r border-gray-300 h-full"><RandomEmojiButton study={study} /></div>}
                                  {visibleColumns.user && <div className="flex-shrink-0 w-10 px-1 flex items-center justify-center border-r border-gray-300 h-full"><button onClick={() => callbacks.onPatientClick(study.patientId)}><UserButton study={study} /></button></div>}
                                  {visibleColumns.shareBtn && <div className="flex-shrink-0 w-10 px-1 flex items-center justify-center border-r border-gray-300 h-full"><ShareButton study={study} /></div>}
                                  {visibleColumns.discussion && <div className="flex-shrink-0 w-10 px-1 flex items-center justify-center border-r border-gray-300 h-full"><DiscussionButton study={study} /></div>}
                                  {visibleColumns.patientId && <div className="flex-1 min-w-[100px] px-2 flex items-center border-r border-gray-300 h-full"><button onClick={() => callbacks.onPatienIdClick(study.patientId, study)} className={`hover:underline text-sm font-medium truncate block w-full text-left ${isEmergency ? 'text-red-700 hover:text-red-900' : 'text-blue-600 hover:text-blue-800'}`}>{study.patientId}{isEmergency && (<span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-xs font-bold bg-red-600 text-white">EMERGENCY</span>)}</button></div>}
                                  {visibleColumns.patientName && <div className="flex-1 lg:min-w-[120px] xl:min-w-[150px] px-2 flex items-center border-r border-gray-300 h-full"><div className={`text-sm font-medium truncate ${isEmergency ? 'text-red-900' : 'text-gray-900'}`} title={study.patientName}>{study.patientName}</div></div>}
                                  {visibleColumns.ageGender && <div className="flex-shrink-0 w-16 px-1 flex items-center justify-center border-r border-gray-300 h-full"><div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>{study.ageGender || study.patientAge || 'N/A'}</div></div>}
                                  {visibleColumns.description && <div className="flex-1 lg:min-w-[120px] xl:min-w-[150px] px-2 flex items-center border-r border-gray-300 h-full"><div className={`text-xs truncate ${isEmergency ? 'text-red-900 font-medium' : 'text-gray-900'}`} title={study.description}>{study.description || study.studyDescription || 'N/A'}</div></div>}
                                  {visibleColumns.series && (<div className="flex-shrink-0 w-16 px-1 flex items-center justify-center border-r border-gray-300 h-full"><div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>{study.seriesImages || study.numberOfSeries || 'N/A'}</div></div>)}
                                  {visibleColumns.modality && <div className="flex-shrink-0 w-20 px-2 flex items-center justify-center border-r border-gray-300 h-full"><span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${isEmergency ? 'bg-red-600 text-white' : 'text-black'}`}>{study.modality || 'N/A'}</span></div>}
                                  {visibleColumns.location && <div className="flex-1 lg:min-w-[100px] xl:min-w-[120px] px-2 flex items-center border-r border-gray-300 h-full"><div className={`text-xs truncate ${isEmergency ? 'text-red-700' : 'text-gray-600'}`} title={study.location}>{study.location || 'N/A'}</div></div>}
                                  {visibleColumns.studyDate && <div className="flex-1 min-w-[100px] px-2 flex items-center justify-center border-r border-gray-300 h-full"><div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}><div className="font-medium">{study.studyDateTime
                            }</div>
                            
                            <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}></div></div></div>}

                                  {visibleColumns.uploadDate && (
                                  <div className="flex-1 min-w-[100px] items-center justify-center border-r border-gray-300 h-full hidden xl:flex">
                                    <div className={`text-xs ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>
                                      {study.uploadDateTime ? (() => {
                                        const [date, time] = study.uploadDateTime.split(/ (?=\d{2}:\d{2}$)/); // splits at last space before time
                                        return (
                                          <>
                                            <div className="font-medium">{date}</div>
                                            <div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>{time}</div>
                                          </>
                                        );
                                      })() : <div className="font-medium">N/A</div>}
                                    </div>
                                  </div>
                                )}


                                  {visibleColumns.reportedDate && <div className="flex-1 min-w-[100px] px-2 flex items-center justify-center border-r border-gray-300 h-full"><div className={`text-xs text-center ${isEmergency ? 'text-red-700' : 'text-gray-600'}`}>{study.reportedDate ? (<><div className="font-medium">{formatAbbrevMonthDay(study.reportedDate)}</div><div className={`${isEmergency ? 'text-red-500' : 'text-gray-500'}`}>{formatTime(study.reportedDate)}</div></>) : (<div className="text-gray-400">Not reported</div>)}</div></div>}
                                  {visibleColumns.reportedBy && <div className="flex-1 min-w-[100px] items-center justify-center border-r border-gray-300 h-full hidden xl:flex"><div className={`text-xs truncate ${isEmergency ? 'text-red-900' : 'text-gray-900'}`} title={study.reportedBy || 'N/A'}>{study.reportedBy || 'N/A'}</div></div>}


                                  {visibleColumns.accession && <div className="flex-1 min-w-[100px] items-center justify-center border-r border-gray-300 h-full hidden xl:flex"><div className={`text-xs truncate ${isEmergency ? 'text-red-900' : 'text-gray-900'}`} title={study.accessionNumber || 'N/A'}>{study.accessionNumber || 'N/A'}</div></div>}
                                  {visibleColumns.seenBy && <div className="flex-1 min-w-[100px] items-center justify-center border-r border-gray-300 h-full hidden xl:flex"><div className={`text-xs truncate ${isEmergency ? 'text-red-900' : 'text-gray-900'}`} title={study.seenBy || 'Not Assigned'}>{study.seenBy || 'Not Assigned'}</div></div>}


                                  {visibleColumns.actions && <div className="flex-1 min-w-[80px] px-2 flex items-center justify-center space-x-2 border-r border-gray-300 h-full">
                                    <EyeIconDropdown 
                                  studyInstanceUID={study.studyInstanceUID}
                                  userRole={userRole}/>
                                    
                                    <div className="flex-shrink-0"><DownloadDropdown study={study} /></div></div>}
                                  {visibleColumns.report && <div className="flex-shrink-0 w-12 px-2 flex items-center justify-center border-r border-gray-300 h-full"><ReportButton study={study} /></div>}


                                  {visibleColumns.assignDoctor && canAssignDoctors && <div className="flex-shrink-0 w-24 px-2 flex items-center justify-center h-full"><button onClick={() => callbacks.onAssignDoctor(study)} className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${(study.workflowStatus === 'new_study_received' || study.workflowStatus === 'pending_assignment') ? (isEmergency ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse' : 'bg-blue-500 text-white hover:bg-blue-600') : (isEmergency ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-orange-500 text-white hover:bg-orange-600')}`}>{(study.workflowStatus === 'new_study_received' || study.workflowStatus === 'pending_assignment') ? (isEmergency ? '🚨 Assign' : 'Assign') : 'Reassign'}</button></div>}
                                </div>
                              </div>
                            );
                          }}
                        </List>
                      )}
                    </AutoSizer>
                  )}
                </div>
              </div>
            </>
          )}
        </div>      
        
        {/* ✅ FOOTER FIX: Remove fixed positioning and make it a flex item */}
        <div className="bg-gray-800 text-white w-full py-0 px-3 flex flex-wrap items-center rounded-b-xl justify-center lg:justify-between gap-x-4 gap-y-2 border-t border-gray-700 flex-shrink-0">
          {isMobile ? (
            <div className="w-full flex justify-center">
              <div className="bg-gray-100 text-black rounded px-2 py-0"><DropdownPagination recordsPerPage={recordsPerPage} onRecordsPerPageChange={onRecordsPerPageChange} totalRecords={totalRecords} usePagination={usePagination} loading={loading} /></div>
            </div>
          ) : (
            <>
              <div className="flex items-center space-x-4">
                <a href="https://www.xcentic.com/" target="_blank" rel="noopener noreferrer" className="flex items-center hover:underline" title="Visit XCENTIC"><svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 mr-2 text-gray-300" xmlns="http://www.w3.org/2000/svg"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/><path d="M12 18V12M12 12L15 9M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><span className="uppercase font-semibold tracking-wider text-sm hidden xl:inline">XCENTIC</span></a>
                <div className="flex space-x-1 overflow-x-auto">
                  <button onClick={handleAssignStudy} className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={selectedStudies.length === 0}>Assign Study</button>
                  <button onClick={handleUnauthorized} className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={selectedStudies.length === 0}>Unauthorized</button>
                  <button onClick={handleExportWorklist} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap">Export Worklist</button>
                  <button onClick={handleDispatchReport} className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={selectedStudies.length === 0}>Dispatch Report</button>
                  <button onClick={handleBulkZipDownload} className={`px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 transition-colors rounded whitespace-nowrap ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={selectedStudies.length === 0}>Bulk Zip Download</button>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2"><svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg><p className="text-sm text-green-400 font-medium"><span className="font-bold text-white">{filteredStudies.length}</span> of <span className="font-bold text-white">{totalRecords}</span> studies</p></div>
                {filteredRecords !== totalRecords && (<p className="text-xs text-green-300">(Filtered from {totalRecords} total)</p>)}
              </div>
              <div className="flex items-center space-x-4">
                {selectedStudies.length > 0 && (<span className="text-xs text-yellow-300 font-medium bg-yellow-900 px-2 py-1 rounded">Selected: {selectedStudies.length}</span>)}
                <div className="bg-gray-100 text-black rounded px-2 py-1"><DropdownPagination recordsPerPage={recordsPerPage} onRecordsPerPageChange={onRecordsPerPageChange} totalRecords={totalRecords} usePagination={usePagination} loading={loading}/></div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {assignmentModalOpen && selectedStudy && (<DoctorAssignmentModal study={selectedStudy} isOpen={assignmentModalOpen} onClose={() => setAssignmentModalOpen(false)} onAssignComplete={handleAssignmentModalComplete} isBulkAssignment={selectedStudies.length > 1} totalSelected={selectedStudies.length}/>)}
      {patientDetailModalOpen && selectedPatientId && (<PatientDetailModal patientId={selectedPatientId} isOpen={patientDetailModalOpen} onClose={() => setPatientDetailModalOpen(false)}/>)}
      {patientDetail && selectedPatientId && (<PatientReport patientId={selectedPatientId} study={selectedStudy} isOpen={patientDetail} onClose={() => setPatientDetail(false)}/>)}
    </>
  );
});

export default WorklistTable;