import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { format } from 'date-fns';
import WorklistTable from './WorklistTable';

// 🔧 UPDATED: WorklistSearch.jsx - Remove pagination props, focus on single-page mode
const WorklistSearch = React.memo(({ 
  allStudies = [], 
  loading = false, 
  totalRecords = 0, 
  userRole = 'admin',
  onAssignmentComplete,
  onView,
  activeCategory,
  onCategoryChange,
  categoryStats,
  recordsPerPage,
  onRecordsPerPageChange,
  // 🆕 NEW: Backend date filter props
  dateFilter = 'last24h',
  onDateFilterChange,
  customDateFrom = '',
  customDateTo = '',
  onCustomDateChange,
  dateType = 'UploadDate',
  onDateTypeChange,
  onSearchWithBackend
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchType, setSearchType] = useState("");
  const [quickSearchTerm, setQuickSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  
  // Basic filters for advanced search
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [accessionNumber, setAccessionNumber] = useState('');
  const [description, setDescription] = useState('');
  
  // Enhanced filters matching the UI design
  const [refName, setRefName] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState('all');
  // 🔧 REMOVED: Local date state - now using props from Dashboard
  // const [dateType, setDateType] = useState('StudyDate');
  // const [dateFrom, setDateFrom] = useState('');
  // const [dateTo, setDateTo] = useState('');
  const [emergencyCase, setEmergencyCase] = useState(false);
  const [mlcCase, setMlcCase] = useState(false);
  const [studyType, setStudyType] = useState('all');
  
  // Modality filters
  const [modalities, setModalities] = useState({
    CT: false,
    MR: false,
    CR: false,
    DX: false,
    PR: false,
    'CT\\SR': false
  });

  // Status counts for tabs
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    pending: 0,
    inprogress: 0,
    completed: 0
  });

  // 🔧 MEMOIZE LOCATIONS
  const locations = useMemo(() => {
    const uniqueLocations = [...new Set(allStudies.filter(s => s.location).map(s => s.location))];
    return uniqueLocations.map(loc => ({ id: loc, name: loc }));
  }, [allStudies]);

  // Calculate status counts
  useEffect(() => {
    const counts = {
      all: allStudies.length,
      pending: allStudies.filter(s => ['new_study_received', 'pending_assignment'].includes(s.workflowStatus)).length,
      inprogress: allStudies.filter(s => ['assigned_to_doctor', 'report_in_progress'].includes(s.workflowStatus)).length,
      completed: allStudies.filter(s => ['report_finalized', 'final_report_downloaded'].includes(s.workflowStatus)).length
    };
    setStatusCounts(counts);
  }, [allStudies]);

  // 🔧 SIMPLIFIED: Frontend filtering only for non-date filters
  const filteredStudies = useMemo(() => {
    let filtered = [...allStudies];

    // Quick search
    if (quickSearchTerm.trim()) {
      const searchTerm = quickSearchTerm.toLowerCase();
      filtered = filtered.filter(study => {
        const name = (study.patientName || '').toLowerCase();
        const id = (study.patientId || '').toLowerCase();
        const accession = (study.accessionNumber || '').toLowerCase();

        if (searchType === 'patientName') {
          return name.includes(searchTerm);
        } else if (searchType === 'patientId') {
          return id.includes(searchTerm);
        } else if (searchType === 'accession') {
          return accession.includes(searchTerm);
        } else {
          return name.includes(searchTerm) || id.includes(searchTerm) || accession.includes(searchTerm);
        }
      });
    }

    // Workflow status filter
    if (workflowStatus !== 'all') {
      const statusMap = {
        pending: ['new_study_received', 'pending_assignment'],
        inprogress: ['assigned_to_doctor', 'report_in_progress'],
        completed: ['report_finalized', 'final_report_downloaded']
      };
      filtered = filtered.filter(study => 
        statusMap[workflowStatus]?.includes(study.workflowStatus) || study.workflowStatus === workflowStatus
      );
    }

    // Location filter
    if (selectedLocation !== 'ALL') {
      filtered = filtered.filter(study => study.location === selectedLocation);
    }

    // Advanced search filters (non-date)
    if (patientName.trim()) {
      filtered = filtered.filter(study => 
        (study.patientName || '').toLowerCase().includes(patientName.toLowerCase())
      );
    }

    if (patientId.trim()) {
      filtered = filtered.filter(study => 
        (study.patientId || '').toLowerCase().includes(patientId.toLowerCase())
      );
    }

    if (refName.trim()) {
      filtered = filtered.filter(study => 
        (study.referredBy || '').toLowerCase().includes(refName.toLowerCase())
      );
    }

    if (accessionNumber.trim()) {
      filtered = filtered.filter(study => 
        (study.accessionNumber || '').toLowerCase().includes(accessionNumber.toLowerCase())
      );
    }

    if (description.trim()) {
      filtered = filtered.filter(study => 
        (study.description || '').toLowerCase().includes(description.toLowerCase())
      );
    }

    // 🔧 REMOVED: Date filtering - now handled by backend
    // Date filtering is now handled by the backend through API parameters

    // Modality filter
    const selectedModalities = Object.entries(modalities)
      .filter(([key, value]) => value)
      .map(([key]) => key);
    
    if (selectedModalities.length > 0) {
      filtered = filtered.filter(study => {
        const studyModality = study.modality || '';
        return selectedModalities.some(mod => studyModality.includes(mod));
      });
    }

    // Emergency case filter
    if (emergencyCase) {
      filtered = filtered.filter(study => 
        study.caseType === 'urgent' || study.caseType === 'emergency' || study.priority === 'URGENT'
      );
    }

    // MLC case filter
    if (mlcCase) {
      filtered = filtered.filter(study => study.mlcCase === true);
    }

    // Study type filter
    if (studyType !== 'all') {
      filtered = filtered.filter(study => study.studyType === studyType);
    }

    return filtered;
  }, [
    allStudies, quickSearchTerm, searchType, selectedLocation, 
    patientName, patientId, refName, accessionNumber, description,
    workflowStatus, modalities, emergencyCase, mlcCase, studyType
    // 🔧 REMOVED: Date dependencies - now handled by backend
  ]);

  // 🔧 DEBOUNCED SEARCH
  const debouncedSetQuickSearchTerm = useMemo(
    () => debounce((value) => {
      setQuickSearchTerm(value);
    }, 300),
    []
  );

  // 🆕 NEW: Backend search with parameters
  const handleBackendSearch = useCallback(() => {
    if (!onSearchWithBackend) return;

    const searchParams = {};
    
    // Add search filters
    if (quickSearchTerm.trim()) {
      searchParams.search = quickSearchTerm.trim();
    }
    
    if (patientName.trim()) {
      searchParams.patientName = patientName.trim();
    }
    
    if (workflowStatus !== 'all') {
      searchParams.status = workflowStatus;
    }

    // Add modality filters
    const selectedModalities = Object.entries(modalities)
      .filter(([key, value]) => value)
      .map(([key]) => key);
    
    if (selectedModalities.length > 0) {
      searchParams.modality = selectedModalities.join(',');
    }

    console.log('🔍 WORKLIST SEARCH: Triggering backend search with params:', searchParams);
    onSearchWithBackend(searchParams);
  }, [
    quickSearchTerm, patientName, workflowStatus, modalities, onSearchWithBackend
  ]);

  // 🔧 MEMOIZED CALLBACKS
  const handleQuickSearch = useCallback((e) => {
    e.preventDefault();
    handleBackendSearch();
  }, [handleBackendSearch]);

  const handleClear = useCallback(() => {
    setQuickSearchTerm('');
    setSearchType('');
    setSelectedLocation('ALL');
    setPatientName('');
    setPatientId('');
    setRefName('');
    setAccessionNumber('');
    setDescription('');
    setWorkflowStatus('all');
    // 🔧 UPDATED: Clear date filters via props
    if (onCustomDateChange) {
      onCustomDateChange('', '');
    }
    if (onDateFilterChange) {
      onDateFilterChange('last24h');
    }
    if (onDateTypeChange) {
      onDateTypeChange('UploadDate');
    }
    setEmergencyCase(false);
    setMlcCase(false);
    setStudyType('all');
    setModalities({
      CT: false,
      MR: false,
      CR: false,
      DX: false,
      PR: false,
      'CT\\SR': false
    });
    
    // Trigger backend refresh
    handleBackendSearch();
  }, [onCustomDateChange, onDateFilterChange, onDateTypeChange, handleBackendSearch]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  // Handle modality checkbox changes
  const handleModalityChange = useCallback((modality, checked) => {
    setModalities(prev => ({
      ...prev,
      [modality]: checked
    }));
  }, []);

  // 🔧 UPDATED: Quick date presets now use backend
  const setDatePreset = useCallback((preset) => {
    console.log(`📅 WORKLIST SEARCH: Setting date preset to ${preset}`);
    
    if (onDateFilterChange) {
      onDateFilterChange(preset);
    }
    
    // For custom dates, set the values
    if (preset === 'custom' && onCustomDateChange) {
      const today = new Date();
      let from, to;
      
      // You can set default custom date range here if needed
      from = format(today, 'yyyy-MM-dd');
      to = format(today, 'yyyy-MM-dd');
      
      onCustomDateChange(from, to);
    }
  }, [onDateFilterChange, onCustomDateChange]);

  // 🆕 NEW: Handle custom date changes
  const handleCustomDateFromChange = useCallback((value) => {
    if (onCustomDateChange) {
      onCustomDateChange(value, customDateTo);
    }
  }, [customDateTo, onCustomDateChange]);

  const handleCustomDateToChange = useCallback((value) => {
    if (onCustomDateChange) {
      onCustomDateChange(customDateFrom, value);
    }
  }, [customDateFrom, onCustomDateChange]);

  // 🔧 MEMOIZE ACTIVE FILTERS CHECK
  const hasActiveFilters = useMemo(() => {
    const selectedModalityCount = Object.values(modalities).filter(Boolean).length;
    return quickSearchTerm || patientName || patientId || refName || accessionNumber || 
           description || selectedLocation !== 'ALL' || workflowStatus !== 'all' ||
           emergencyCase || mlcCase || studyType !== 'all' || 
           selectedModalityCount > 0 || dateFilter !== 'last24h' ||
           (dateFilter === 'custom' && (customDateFrom || customDateTo));
  }, [
    quickSearchTerm, patientName, patientId, refName, accessionNumber, description,
    selectedLocation, workflowStatus, emergencyCase, mlcCase, 
    studyType, modalities, dateFilter, customDateFrom, customDateTo
  ]);

  return (
    <div className="space-y-6">
      {/* Enhanced Search Controls */}
      <div className="relative">
        {/* Main Search Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 shadow-sm">
          {hasActiveFilters && (
            <div className="flex items-center space-x-2 mb-4">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                {filteredStudies.length} results from {allStudies.length} total
              </span>
              <button
                onClick={handleClear}
                className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full hover:bg-red-200 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Top Search Bar - remains the same */}
          <div className="flex items-center space-x-3 flex-wrap gap-y-2">
            {/* Search Type Selector */}
            <div className="relative">
              <select 
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="">All Fields</option>
                <option value="patientName">Patient Name</option>
                <option value="patientId">Patient ID</option>
                <option value="accession">Accession</option>
              </select>
            </div>
            
            {/* Search Input */}
            <form onSubmit={handleQuickSearch} className="flex-1 min-w-64">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by Patient ID, Name and Accession"
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 pr-12 text-sm placeholder-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  onChange={(e) => debouncedSetQuickSearchTerm(e.target.value)}
                />
                <button 
                  type="submit" 
                  className="absolute right-1 top-1 bottom-1 px-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </form>
            
            {/* Location Filter */}
            <div className="relative">
              <select 
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all min-w-48"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="ALL">Work Station-Less Labs</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-2">
              <button 
                className={`px-4 py-2 border rounded-lg transition-all text-sm font-medium ${
                  isExpanded 
                    ? 'bg-blue-500 border-blue-500 text-white shadow-md' 
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-400'
                }`}
                onClick={toggleExpanded}
                title="Advanced Search"
              >
                Advanced
              </button>
              
              <button 
                onClick={handleClear}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Search Panel */}
        {isExpanded && (
          <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-200 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">Advanced Search Options</h3>
                <button onClick={toggleExpanded} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Patient Info Section - remains the same */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                    Patient Info
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Patient ID</label>
                    <input
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ref Name</label>
                    <input
                      type="text"
                      value={refName}
                      onChange={(e) => setRefName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Study Info Section - remains the same */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                    Study Info
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Accession#</label>
                    <input
                      type="text"
                      value={accessionNumber}
                      onChange={(e) => setAccessionNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={workflowStatus}
                      onChange={(e) => setWorkflowStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">All selected</option>
                      <option value="pending">Pending</option>
                      <option value="inprogress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* 🔧 UPDATED: Date Range & Other Filters */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
                    Date Range
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date Type</label>
                    <select
                      value={dateType}
                      onChange={(e) => onDateTypeChange && onDateTypeChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-2"
                    >
                      <option value="StudyDate">Study Date</option>
                      <option value="UploadDate">Upload Date</option>
                      <option value="DOB">DOB</option>
                    </select>
                    
                    {/* 🔧 UPDATED: Quick Date Presets with backend integration */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {['today', 'yesterday', 'thisWeek', 'thisMonth', 'thisYear'].map(preset => (
                        <button
                          key={preset}
                          onClick={() => setDatePreset(preset)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            dateFilter === preset 
                              ? 'bg-blue-500 text-white' 
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {preset === 'today' ? 'Today' : 
                           preset === 'yesterday' ? 'Yesterday' :
                           preset === 'thisWeek' ? 'This Week' : 
                           preset === 'thisMonth' ? 'This Month' : 'This Year'}
                        </button>
                      ))}
                      <button
                        onClick={() => setDatePreset('custom')}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          dateFilter === 'custom' 
                            ? 'bg-purple-500 text-white' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>
                  
                  {/* 🔧 UPDATED: Custom date inputs with backend integration */}
                  {dateFilter === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
                        <input
                          type="date"
                          value={customDateFrom}
                          onChange={(e) => handleCustomDateFromChange(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                        <input
                          type="date"
                          value={customDateTo}
                          onChange={(e) => handleCustomDateToChange(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Modality Checkboxes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Modality</label>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(modalities).map(([modality, checked]) => (
                        <label key={modality} className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => handleModalityChange(modality, e.target.checked)}
                            className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          {modality}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Emergency & Study Type */}
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="flex items-center text-sm">
                        <input
                          type="checkbox"
                          checked={emergencyCase}
                          onChange={(e) => setEmergencyCase(e.target.checked)}
                          className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Emergency
                      </label>
                      <label className="flex items-center text-sm">
                        <input
                          type="checkbox"
                          checked={mlcCase}
                          onChange={(e) => setMlcCase(e.target.checked)}
                          className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        MLC
                      </label>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Study Type</label>
                      <select
                        value={studyType}
                        onChange={(e) => setStudyType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">None selected</option>
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="stat">Stat</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 🔧 UPDATED: Action Buttons with backend search */}
            <div className="flex justify-between items-center border-t border-gray-200 p-4 bg-gray-50 rounded-b-xl">
              <div className="text-sm text-gray-600">
                {hasActiveFilters ? `${filteredStudies.length} studies found` : 'No filters applied'}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleClear}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Reset All
                </button>
                <button
                  onClick={() => {
                    handleBackendSearch();
                    toggleExpanded();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 🔧 UPDATED: Pass only necessary props to WorklistTable */}
      <WorklistTable 
        studies={filteredStudies}
        loading={loading}
        totalRecords={allStudies.length}
        filteredRecords={filteredStudies.length}
        userRole={userRole}
        onAssignmentComplete={onAssignmentComplete}
        recordsPerPage={recordsPerPage}
        onRecordsPerPageChange={onRecordsPerPageChange}
        usePagination={false}
      />
    </div>
  );
});

export default WorklistSearch;