import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { format } from 'date-fns';
import WorklistTable from './WorklistTable';

// 🔧 COMPACT & MODERN UI: WorklistSearch component
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
    <div className="space-y-2">
      {/* 🎨 COMPACT UI: Enhanced Search Controls */}
      <div className="relative">
        {/* Main Search Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-3 shadow-sm">
          {/* 📊 COMPACT: Results Summary */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {filteredStudies.length}/{allStudies.length}
              </span>
              <button
                onClick={handleClear}
                className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full hover:bg-red-200 transition-all"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            </div>
          )}

          {/* 🎨 CONSISTENT HEIGHT: Main Search Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            
            {/* Search Type Dropdown */}
            <div className="relative min-w-0 sm:w-20">
              <select 
                className="appearance-none bg-white border border-gray-300 rounded px-2 py-2 pr-6 text-sm font-medium text-gray-700 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none transition-all w-full h-9 shadow-sm"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="">All</option>
                <option value="patientName">Name</option>
                <option value="patientId">ID</option>
                <option value="accession">Acc#</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-1 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            
            {/* Search Input */}
            <div className="flex-1 sm:max-w-xs">
              <form onSubmit={handleQuickSearch} className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search patients..."
                  className="w-full bg-white border border-gray-300 rounded pl-9 pr-3 py-2 text-sm placeholder-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none transition-all h-9 shadow-sm"
                  onChange={(e) => debouncedSetQuickSearchTerm(e.target.value)}
                />
              </form>
            </div>

            {/* All Labs Dropdown */}
            <div className="relative min-w-0 sm:w-24">
              <select 
                className="appearance-none bg-white border border-gray-300 rounded px-2 py-2 pr-6 text-sm font-medium text-gray-700 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none transition-all w-full h-9 shadow-sm"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="ALL">All Labs</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-1 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Consistent Button Group */}
            <div className="flex gap-2">
              {/* Search Button */}
              <button
                type="button"
                onClick={handleBackendSearch}
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:ring-1 focus:ring-blue-200 focus:outline-none transition-all shadow-sm h-9"
                title="Search"
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search
              </button>

              {/* Advanced Button */}
              <button 
                className={`inline-flex items-center justify-center px-4 py-2 border text-sm font-medium rounded transition-all h-9 shadow-sm ${
                  isExpanded 
                    ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400'
                }`}
                onClick={toggleExpanded}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
                Advanced
              </button>
              
              {/* Clear Button */}
              <button 
                onClick={handleClear}
                className="inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 focus:ring-1 focus:ring-red-200 focus:outline-none transition-all shadow-sm h-9"
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* 🎨 FIXED ADVANCED SEARCH PANEL - Now properly positioned and expands space */}
        {isExpanded && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-xl transition-all duration-300 ease-in-out">
            {/* Compact Header */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-2 border-b border-gray-200 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-indigo-600 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-800">Advanced Search</h3>
                </div>
                <button 
                  onClick={toggleExpanded} 
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Compact Content */}
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Patient Info Section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-900 border-b border-gray-200 pb-1 flex items-center">
                    <svg className="w-3 h-3 mr-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Patient Info
                  </h3>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Patient ID</label>
                    <input
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                      placeholder="Enter ID..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Patient Name</label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                      placeholder="Enter name..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Referring Doctor</label>
                    <input
                      type="text"
                      value={refName}
                      onChange={(e) => setRefName(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                      placeholder="Enter doctor..."
                    />
                  </div>
                </div>

                {/* Study Info Section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-gray-900 border-b border-gray-200 pb-1 flex items-center">
                    <svg className="w-3 h-3 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Study Info
                  </h3>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Accession Number</label>
                    <input
                      type="text"
                      value={accessionNumber}
                      onChange={(e) => setAccessionNumber(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                      placeholder="Enter accession..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Study Description</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                      placeholder="Enter description..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Workflow Status</label>
                    <select
                      value={workflowStatus}
                      onChange={(e) => setWorkflowStatus(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="inprogress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* Date Range & Filters */}
                <div className="space-y-3 md:col-span-2 xl:col-span-1">
                  <h3 className="text-xs font-semibold text-gray-900 border-b border-gray-200 pb-1 flex items-center">
                    <svg className="w-3 h-3 mr-1 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Date & Filters
                  </h3>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date Type</label>
                    <select
                      value={dateType}
                      onChange={(e) => onDateTypeChange && onDateTypeChange(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all mb-2"
                    >
                      <option value="StudyDate">Study Date</option>
                      <option value="UploadDate">Upload Date</option>
                      <option value="DOB">Date of Birth</option>
                    </select>
                    
                    {/* Compact Date Presets */}
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      {['today', 'yesterday', 'thisWeek', 'thisMonth', 'thisYear', 'custom'].map(preset => (
                        <button
                          key={preset}
                          onClick={() => setDatePreset(preset)}
                          className={`px-1 py-1 text-xs rounded transition-all font-medium ${
                            dateFilter === preset 
                              ? preset === 'custom'
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'bg-blue-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {preset === 'today' ? 'Today' : 
                           preset === 'yesterday' ? 'Yesterday' :
                           preset === 'thisWeek' ? 'Week' : 
                           preset === 'thisMonth' ? 'Month' : 
                           preset === 'thisYear' ? 'Year' : 'Custom'}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Compact Custom date inputs */}
                  {dateFilter === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
                        <input
                          type="date"
                          value={customDateFrom}
                          onChange={(e) => handleCustomDateFromChange(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                        <input
                          type="date"
                          value={customDateTo}
                          onChange={(e) => handleCustomDateToChange(e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Compact Modality Checkboxes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Modality</label>
                    <div className="grid grid-cols-3 gap-1">
                      {Object.entries(modalities).map(([modality, checked]) => (
                        <label key={modality} className="flex items-center text-xs">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => handleModalityChange(modality, e.target.checked)}
                            className="mr-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                          />
                          <span className="font-medium text-gray-700">{modality}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Compact Additional Filters */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center text-xs">
                        <input
                          type="checkbox"
                          checked={emergencyCase}
                          onChange={(e) => setEmergencyCase(e.target.checked)}
                          className="mr-1 rounded border-gray-300 text-red-600 focus:ring-red-500 w-3 h-3"
                        />
                        <span className="font-medium text-red-700">Emergency</span>
                      </label>
                      <label className="flex items-center text-xs">
                        <input
                          type="checkbox"
                          checked={mlcCase}
                          onChange={(e) => setMlcCase(e.target.checked)}
                          className="mr-1 rounded border-gray-300 text-orange-600 focus:ring-orange-500 w-3 h-3"
                        />
                        <span className="font-medium text-orange-700">MLC Case</span>
                      </label>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Study Type</label>
                      <select
                        value={studyType}
                        onChange={(e) => setStudyType(e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                      >
                        <option value="all">All Types</option>
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="stat">STAT</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-t border-gray-200 p-3 bg-gray-50 rounded-b-lg space-y-2 sm:space-y-0">
              <div className="text-xs text-gray-600 text-center sm:text-left">
                {hasActiveFilters ? (
                  <span className="flex items-center justify-center sm:justify-start">
                    <svg className="w-3 h-3 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {filteredStudies.length} studies found
                  </span>
                ) : (
                  'No filters applied'
                )}
              </div>
              <div className="flex space-x-2 justify-center sm:justify-end">
                <button
                  onClick={handleClear}
                  className="inline-flex items-center px-3 py-1.5 text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:ring-1 focus:ring-gray-200 focus:outline-none transition-all text-xs font-medium"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </button>
                <button
                  onClick={() => {
                    handleBackendSearch();
                    toggleExpanded();
                  }}
                  className="inline-flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-all focus:ring-1 focus:ring-blue-200 focus:outline-none shadow-sm"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 🎨 WORKLIST TABLE - Now properly positioned and shifts down when advanced search is open */}
      <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'mt-2' : 'mt-0'}`}>
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
    </div>
  );
});

export default WorklistSearch;