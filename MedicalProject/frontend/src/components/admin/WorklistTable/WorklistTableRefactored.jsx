import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import toast from 'react-hot-toast';

// 🔧 UPDATED: Import all modular components from index.js
import {
  // Components
  StatusDot,
  VirtualTableHeader,
  VirtualStudyRow,
  TableFooter,
  ActionBar,
  TabNavigation,
  MobileMenu,
  EmptyState,
  
  // Button components
  DownloadDropdown,
  
  // Hooks
  useVirtualScrolling,
  useColumnVisibility,
  useStudyFiltering,
  useStudySelection,
  useWorklistActions,
  
  // Utils
  ROW_HEIGHT
} from './index';

// Import existing modals and components that we keep using from outside the modular structure
import PatientDetailModal from '../patients/PatientDetailModal';
import DoctorAssignmentModal from '../Doctor/DoctorAssignmentModal';
import PatientReport from '../patients/PatientDetail';
import ColumnConfigurator from '../ColumnConfigurator';
import StatusLegend from '../StatusLegend';
import DropdownPagination from '../DropdownPagination';
import ShareButton from '../ShareButton';
// import DiscussionButton from '../DiscussionButton';
import ReportButton from '../ReportButton';
import { useAuth } from '../../../hooks/useAuth';
import {
  formatDate,
  formatTime,
  formatMonthDay, 
  formatMonthDayYear, 
  formatAbbrevMonthDay, 
  formatRelativeDate,
  formatMonthDayTime,
  formatMonthDayShort
} from '../../../utils/dateUtils';

// 🎯 **EXACT SAME PROPS AS ORIGINAL WorklistTable**
const WorklistTableRefactored = React.memo(({ 
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
  // ✅ **Same state as original component**
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedStudies, setSelectedStudies] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const listRef = useRef(null);

  // Modal states - same as original
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [patientDetailModalOpen, setPatientDetailModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patientDetail, setPatientDetail] = useState(false);

  // ✅ **Use modular hooks from index.js**
  const { visibleColumns, handleColumnChange, handleResetColumnsToDefault } = useColumnVisibility();
  const { filteredStudies, statusCounts } = useStudyFiltering(studies, activeTab);
  const { selectedStudies: hookSelectedStudies, handleSelectAll, handleSelectStudy } = useStudySelection(activeTab);
  const { listHeight } = useVirtualScrolling(filteredStudies);
  const worklistActions = useWorklistActions(selectedStudies, studies, filteredStudies);

  // ✅ **Same derived values as original**
  const canAssignDoctors = userRole === 'admin';

  // ✅ **Same callback handlers as original**
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

  // ✅ **Same assignment logic as original**
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

  // ✅ **Same action handlers as original**
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

  // Clear selections when tab changes
  useEffect(() => {
    setSelectedStudies([]);
  }, [activeTab]);

  // ✅ **Virtual list data preparation - same logic**
  const virtualListData = useMemo(() => ({
    studies: filteredStudies,
    visibleColumns,
    selectedStudies,
    callbacks: {
      onSelectStudy: handleSelectStudy,
      onPatientClick: handlePatientClick,
      onPatienIdClick: handlePatienIdClick,
      onAssignDoctor: handleAssignDoctor,
      canAssignDoctors
    }
  }), [filteredStudies, visibleColumns, selectedStudies, handleSelectStudy, handlePatientClick, handlePatienIdClick, handleAssignDoctor, canAssignDoctors]);

  return (
    <div className="bg-white w-full h-[85vh] rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col worklist-container">
      {/* ✅ **Same header section as original** */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
        <div className="bg-gray-400 text-white p-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm text-black font-bold tracking-wide flex-shrink-0">VIRTUAL WORKLIST</h1>
            
            <div className="flex items-center space-x-2 min-w-0">
              {/* Mobile tabs */}
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

              {/* Desktop tabs */}
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

              {/* Mobile menu dropdown */}
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

              {/* Desktop controls */}
              <div className="hidden lg:flex items-center space-x-2 h-[30px]">
                <StatusLegend />
                <ColumnConfigurator 
                  visibleColumns={visibleColumns}
                  onColumnChange={handleColumnChange}
                  onResetToDefault={handleResetColumnsToDefault}
                />
                
                <div className="px-2 py-1 bg-purple-500 text-white text-xs rounded-lg font-medium shadow-sm">
                  ⚡ Virtual ({filteredStudies.length})
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* ✅ **Same virtual scrolling container as original** */}
      <div className="flex-1 overflow-hidden relative min-h-[500px]">
        {loading ? (
          <div className="flex justify-center items-center h-full bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Loading studies...</p>
            </div>
          </div>
        ) : filteredStudies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium">No studies found</p>
            <p className="text-sm">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* ✅ **Use modular VirtualTableHeader from index.js** */}
            <VirtualTableHeader
              visibleColumns={visibleColumns}
              filteredStudies={filteredStudies}
              selectedStudies={selectedStudies}
              onSelectAll={handleSelectAll}
              canAssignDoctors={canAssignDoctors}
            />
            
            <div className="flex-1 overflow-auto">
              <List
                ref={listRef}
                height={Math.max(listHeight, 500)}
                itemCount={filteredStudies.length}
                itemSize={ROW_HEIGHT}
                itemData={virtualListData}
                width="100%"
                overscanCount={10}
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#cbd5e0 #f7fafc'
                }}
              >
                {VirtualStudyRow}
              </List>
              
              {/* Debug info */}
              <div className="absolute top-2 right-2 bg-black/75 text-white text-xs p-2 rounded z-50">
                Total: {filteredStudies.length} | Height: {listHeight}px | Visible: ~{Math.floor(listHeight / ROW_HEIGHT)}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* ✅ **Same footer as original** */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-100 px-6 py-3 border-t border-green-200 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-green-700 font-medium">
              ⚡ Virtual: <span className="font-bold">{filteredStudies.length}</span> of <span className="font-bold">{totalRecords}</span> total records
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

      {/* ✅ **Same bottom action bar as original** */}
      <div className="bg-gray-800 text-white w-full py-0 px-3 flex items-center justify-between border-t border-gray-700 fixed bottom-0 left-0 right-0 z-30">
        <div className="flex items-center">
          <div className="pr-4 flex items-center">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 mr-2 text-gray-300" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 18V12M12 12L15 9M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="uppercase font-semibold tracking-wider text-md">XCENTIC VIRTUAL</span>
          </div>
          
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
        
        <div className="flex items-center mr-4 space-x-4">
          {selectedStudies.length > 0 && (
            <span className="text-sm text-yellow-300">
              Selected: {selectedStudies.length}
            </span>
          )}
          <span className="text-sm">Total: {totalRecords}</span>
        </div>
      </div>
      
      {/* ✅ **Same modals as original** */}
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

export default WorklistTableRefactored;