import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce, values } from 'lodash';
import { format } from 'date-fns';
import WorklistTable from './WorklistTable';
import { Link } from 'react-router-dom';

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
  onSearchWithBackend,
  values = [],
  // 🆕 NEW: Integrated dashboard props
  newStudyCount = 0,
  connectionStatus = 'connecting',
  onManualRefresh,
  onResetNewStudyCount,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchType, setSearchType] = useState("");
  const [quickSearchTerm, setQuickSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  console.log(values)
  
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

  // 🆕 NEW: Connection status display logic
  const statusDisplay = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return {
          color: 'bg-emerald-500',
          text: 'Live',
          textColor: 'text-emerald-700'
        };
      case 'connecting':
        return {
          color: 'bg-amber-500 animate-pulse',
          text: 'Connecting...',
          textColor: 'text-amber-700'
        };
      case 'error':
        return {
          color: 'bg-red-500',
          text: 'Offline',
          textColor: 'text-red-700'
        };
      default:
        return {
          color: 'bg-gray-500',
          text: 'Offline',
          textColor: 'text-gray-700'
        };
    }
  }, [connectionStatus]);

  return (
    <div className="space-y-1 flex flex-col flex-1 min-h-0">
      {/* 🎯 SINGLE LINE: Compact Search-First Design */}
      <div className="relative">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          
          {/* 🚀 SINGLE ROW: All controls in one line */}
          <div className="px-3 py-2 flex items-center justify-between gap-3">
            
            {/* 🔍 LEFT: Search Controls (Priority 1) */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Search Type */}
              <select 
                className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-16 flex-shrink-0"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="">All</option>
                <option value="patientName">Name</option>
                <option value="patientId">ID</option>
                <option value="accession">Acc#</option>
              </select>
              
              {/* Search Input */}
              <div className="flex-1 relative min-w-0 max-w-xs">
                <form onSubmit={handleQuickSearch} className="relative">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search patients..."
                    className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    onChange={(e) => debouncedSetQuickSearchTerm(e.target.value)}
                  />
                </form>
              </div>

              {/* Labs Dropdown */}
              <select 
                className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-20 flex-shrink-0"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="ALL">All Labs</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>

              {/* Search & Filter Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleBackendSearch}
                  className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="hidden sm:inline">Search</span>
                </button>

                <button 
                  className={`inline-flex items-center px-2 py-1.5 border rounded text-xs font-medium transition-colors ${
                    isExpanded 
                      ? 'bg-blue-600 border-blue-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={toggleExpanded}
                >
                  <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                  </svg>
                  <span className="hidden sm:inline">Advanced</span>
                </button>
                
                <button 
                  onClick={handleClear}
                  className="inline-flex items-center px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
                >
                  <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>
            </div>

            {/* 📅 CENTER: Quick Date Filters - Doctor-specific */}
            <div className="flex items-center gap-1 bg-gray-50 rounded-md px-2 py-1">
              {userRole === 'doctor' ? (
                // 🆕 DOCTOR: Include "Assigned Today" filter
                ['last24h', 'today', 'yesterday', 'thisWeek', 'thisMonth', 'assignedToday'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => onDateFilterChange(filter)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                      dateFilter === filter 
                        ? 'bg-blue-500 text-white shadow-sm' 
                        : 'text-gray-600 hover:bg-white hover:shadow-sm'
                    }`}
                  >
                    {filter === 'last24h' ? '24h' : 
                     filter === 'today' ? 'Today' :
                     filter === 'yesterday' ? 'Yesterday' :
                     filter === 'thisWeek' ? 'Week' : 
                     filter === 'thisMonth' ? 'Month' :
                     filter === 'assignedToday' ? 'Assigned Today' : filter}
                  </button>
                ))
              ) : (
                // 🔧 ADMIN: Standard date filters
                ['last24h', 'today', 'yesterday', 'thisWeek', 'thisMonth'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => onDateFilterChange(filter)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                      dateFilter === filter 
                        ? 'bg-blue-500 text-white shadow-sm' 
                        : 'text-gray-600 hover:bg-white hover:shadow-sm'
                    }`}
                  >
                    {filter === 'last24h' ? '24h' : 
                     filter === 'today' ? 'Today' :
                     filter === 'yesterday' ? 'Yesterday' :
                     filter === 'thisWeek' ? 'Week' : 'Month'}
                  </button>
                ))
              )}
              <button
                onClick={() => onDateFilterChange('custom')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  dateFilter === 'custom' 
                    ? 'bg-purple-500 text-white shadow-sm' 
                    : 'text-gray-600 hover:bg-white hover:shadow-sm'
                }`}
              >
                Custom
              </button>
            </div>

            {/* 📊 RIGHT: Status & Actions */}
            <div className="flex items-center gap-3">
              {/* Status Info */}
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-600 font-medium whitespace-nowrap">
                  📊 {totalRecords.toLocaleString()} studies
                </span>
                
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${statusDisplay.color}`}></div>
                  <span className={`${statusDisplay.textColor} font-medium whitespace-nowrap`}>
                    {statusDisplay.text}
                  </span>
                </div>
                
                {newStudyCount > 0 && (
                  <span className="bg-red-500 text-white px-2 py-1 rounded-full font-semibold animate-pulse text-xs whitespace-nowrap">
                    🔔 {newStudyCount} new
                  </span>
                )}
              </div>

              {/* Action Buttons - Role-specific */}
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    onManualRefresh && onManualRefresh();
                    onResetNewStudyCount && onResetNewStudyCount();
                  }}
                  disabled={loading}
                  className="inline-flex items-center px-3 py-1.5 bg-gray-600 text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                  title="Refresh data"
                >
                  <svg className={`w-3 h-3 sm:mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
                  </svg>
                  <span className="hidden lg:inline">Refresh</span>
                </button>

                {(userRole === 'admin' && (
                  // 🔧 ADMIN: Lab and Doctor management buttons
                  <>
                    <Link 
                      to="/admin/new-lab" 
                      className="inline-flex items-center px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 transition-colors"
                      title="Add New Lab"
                    >
                      <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="hidden lg:inline">Lab</span>
                    </Link>

                    <Link 
                      to="/admin/new-doctor" 
                      className="inline-flex items-center px-3 py-1.5 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600 transition-colors"
                      title="Add New Doctor"
                    >
                      <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="hidden lg:inline">Doctor</span>
                    </Link>
                  </>
                ) 
                )}
              </div>
            </div>
          </div>

          {/* 🔧 CONDITIONAL: Custom Date Range */}
          {dateFilter === 'custom' && (
            <div className="px-3 py-2 bg-purple-50 border-t border-purple-200">
              <div className="flex items-center gap-3 text-xs">
                <select
                  value={dateType}
                  onChange={(e) => onDateTypeChange && onDateTypeChange(e.target.value)}
                  className="px-2 py-1 border border-purple-300 rounded text-xs bg-white focus:ring-1 focus:ring-purple-500"
                >
                  <option value="UploadDate">Upload Date</option>
                  <option value="StudyDate">Study Date</option>
                </select>
                
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => onCustomDateChange && onCustomDateChange(e.target.value, customDateTo)}
                    className="px-2 py-1 border border-purple-300 rounded text-xs bg-white focus:ring-1 focus:ring-purple-500"
                  />
                  
                  <span className="text-purple-600 font-medium">to</span>
                  
                  <input
                    type="date"
                    value={customDateTo}
                    onChange={(e) => onCustomDateChange && onCustomDateChange(customDateFrom, e.target.value)}
                    className="px-2 py-1 border border-purple-300 rounded text-xs bg-white focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                
                <button
                  onClick={() => {
                    onCustomDateChange && onCustomDateChange('', '');
                    onDateFilterChange && onDateFilterChange('last24h');
                  }}
                  className="px-2 py-1 text-xs text-purple-600 hover:text-purple-800 underline font-medium"
                >
                  Clear Dates
                </button>
              </div>
            </div>
          )}

          {/* 🔧 CONDITIONAL: Active Filters */}
          {hasActiveFilters && (
            <div className="px-3 py-2 bg-blue-50 border-t border-blue-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-800 font-medium">
                  🔍 Showing {filteredStudies.length} of {allStudies.length} studies
                </span>
                <button
                  onClick={handleClear}
                  className="inline-flex items-center text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 🔧 EXPANDED: Advanced Search Panel */}
        {isExpanded && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                  <svg className="w-4 h-4 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Advanced Search Options
                </h3>
                <button 
                  onClick={toggleExpanded} 
                  className="inline-flex items-center p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-md transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Patient Info Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 flex items-center">
                    <span className="mr-2">👤</span>
                    Patient Information
                  </h4>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Patient ID</label>
                    <input
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter patient ID..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Patient Name</label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter patient name..."
                    />
                  </div>
                </div>

                {/* Study Info Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 flex items-center">
                    <span className="mr-2">📋</span>
                    Study Information
                  </h4>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Accession Number</label>
                    <input
                      type="text"
                      value={accessionNumber}
                      onChange={(e) => setAccessionNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter accession number..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Workflow Status</label>
                    <select
                      value={workflowStatus}
                      onChange={(e) => setWorkflowStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="inprogress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* Filters Section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 flex items-center">
                    <span className="mr-2">🔧</span>
                    Filters & Options
                  </h4>
                  
                  {/* Modality Checkboxes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Modality</label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(modalities).map(([modality, checked]) => (
                        <label key={modality} className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => handleModalityChange(modality, e.target.checked)}
                            className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-gray-700">{modality}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Additional Filters */}
                  <div className="space-y-2">
                    <label className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={emergencyCase}
                        onChange={(e) => setEmergencyCase(e.target.checked)}
                        className="mr-2 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                      />
                      <span className="text-gray-700">Emergency Cases Only</span>
                    </label>
                    <label className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={mlcCase}
                        onChange={(e) => setMlcCase(e.target.checked)}
                        className="mr-2 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-gray-700">MLC Cases Only</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={handleClear}
                  className="inline-flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Reset All
                </button>
                <button
                  onClick={() => {
                    handleBackendSearch();
                    toggleExpanded();
                  }}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Worklist Table */}
      <div className="flex-1 min-h-0">
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
          values={values}

          activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
        />
      </div>
    </div>
  );
});

export default WorklistSearch;