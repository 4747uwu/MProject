import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce, values } from 'lodash';
import { format } from 'date-fns';
import WorklistTable from './WorklistTable';
import { Link } from 'react-router-dom';
import api from '../../services/api';
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

  //location 
  const [backendLocations, setBackendLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationSearchTerm, setLocationSearchTerm] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);


  const [isExpanded, setIsExpanded] = useState(false);
  const [searchType, setSearchType] = useState("");
  const [quickSearchTerm, setQuickSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  console.log(values)
  
  // Basic filters for advanced search
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [accessionNumber, setAccessionNumber] = useState(''); // Changed from setPatientAccessionNumber
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

useEffect(() => {
  const fetchLocations = async () => {
    setLocationsLoading(true);
    try {
      const response = await api.get('/tat/locations');
      if (response.data.success) {
        setBackendLocations(response.data.locations);
        console.log('✅ Locations fetched:', response.data.locations);
      }
    } catch (error) {
      console.error('❌ Error fetching locations:', error);
      // Fallback to existing locations from studies
      const uniqueLocations = [...new Set(allStudies.filter(s => s.location).map(s => s.location))];
      setBackendLocations(uniqueLocations.map(loc => ({ 
        value: loc, 
        label: loc 
      })));
    } finally {
      setLocationsLoading(false);
    }
  };

  fetchLocations();
}, []); // Only run once
  
const filteredLocations = useMemo(() => {
  if (!locationSearchTerm.trim()) {
    return backendLocations;
  }
  
  const searchLower = locationSearchTerm.toLowerCase();
  return backendLocations.filter(location => 
    location.label.toLowerCase().includes(searchLower)
  );
}, [backendLocations, locationSearchTerm]);

// Get selected location label for display
const selectedLocationLabel = useMemo(() => {
  if (selectedLocation === 'ALL') return 'All Labs';
  
  const location = backendLocations.find(loc => loc.value === selectedLocation);
  return location ? location.label : 'Select Lab';
}, [selectedLocation, backendLocations]);

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
    console.log('🔧 FRONTEND FILTERING: Starting with', allStudies.length, 'studies from backend');
    
    let filtered = [...allStudies];

    // 🆕 ADD: Category filtering when lab is selected (hybrid mode)
    if (selectedLocation !== 'ALL' && activeCategory !== 'all') {
        console.log(`🔧 FRONTEND FILTERING: Applying category filter for ${activeCategory}`);
        
        const categoryStatusMap = {
            pending: ['new_study_received', 'pending_assignment', 'assigned_to_doctor', 'doctor_opened_report', 'report_in_progress', 'report_downloaded_radiologist', 'report_downloaded'],
            inprogress: ['report_finalized', 'report_drafted', 'report_uploaded'],
            completed: ['final_report_downloaded']
        };
        
        if (categoryStatusMap[activeCategory]) {
            filtered = filtered.filter(study => 
                categoryStatusMap[activeCategory].includes(study.workflowStatus)
            );
            console.log(`🔧 FRONTEND FILTERING: Applied ${activeCategory} category filter, ${filtered.length} remaining`);
        }
    }

    // ✅ FRONTEND ONLY: Advanced search filters (NOT quick search or lab)
    
    // Advanced patient search (separate from quick search)
    if (patientName.trim()) {
      filtered = filtered.filter(study => {
        const studyPatientName = study.patientName || '';
        return typeof studyPatientName === 'string' && 
               studyPatientName.toLowerCase().includes(patientName.toLowerCase());
      });
      console.log(`🔧 FRONTEND FILTERING: Applied patient name filter, ${filtered.length} remaining`);
    }

    if (patientId.trim()) {
      filtered = filtered.filter(study => {
        const studyPatientId = study.patientId || '';
        return typeof studyPatientId === 'string' && 
               studyPatientId.toLowerCase().includes(patientId.toLowerCase());
      });
      console.log(`🔧 FRONTEND FILTERING: Applied patient ID filter, ${filtered.length} remaining`);
    }

    if (refName.trim()) {
      filtered = filtered.filter(study => {
        const studyReferredBy = study.referredBy || '';
        return typeof studyReferredBy === 'string' && 
               studyReferredBy.toLowerCase().includes(refName.toLowerCase());
      });
      console.log(`🔧 FRONTEND FILTERING: Applied referring physician filter, ${filtered.length} remaining`);
    }

    if (accessionNumber.trim()) {
      filtered = filtered.filter(study => {
        const studyAccessionNumber = study.accessionNumber || '';
        return typeof studyAccessionNumber === 'string' && 
               studyAccessionNumber.toLowerCase().includes(accessionNumber.toLowerCase());
      });
      console.log(`🔧 FRONTEND FILTERING: Applied accession filter, ${filtered.length} remaining`);
    }

    if (description.trim()) {
      filtered = filtered.filter(study => {
        const studyDescription = study.description || '';
        const studyClinicalHistory = study.clinicalHistory || '';
        
        // ✅ FIX: Safe string handling for clinicalHistory
        const descriptionMatch = typeof studyDescription === 'string' && 
                                studyDescription.toLowerCase().includes(description.toLowerCase());
        
        const clinicalHistoryMatch = typeof studyClinicalHistory === 'string' && 
                                    studyClinicalHistory.toLowerCase().includes(description.toLowerCase());
        
        return descriptionMatch || clinicalHistoryMatch;
      });
      console.log(`🔧 FRONTEND FILTERING: Applied description filter, ${filtered.length} remaining`);
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
      console.log(`🔧 FRONTEND FILTERING: Applied workflow status filter, ${filtered.length} remaining`);
    }

    // Modality filter
    const selectedModalities = Object.entries(modalities)
      .filter(([key, value]) => value)
      .map(([key]) => key);
    
    if (selectedModalities.length > 0) {
      filtered = filtered.filter(study => {
        const studyModality = study.modality || '';
        return typeof studyModality === 'string' && 
               selectedModalities.some(mod => studyModality.includes(mod));
      });
      console.log(`🔧 FRONTEND FILTERING: Applied modality filter, ${filtered.length} remaining`);
    }

    // Emergency case filter
    if (emergencyCase) {
      filtered = filtered.filter(study => 
        study.caseType === 'urgent' || study.caseType === 'emergency' || study.priority === 'URGENT'
      );
      console.log(`🔧 FRONTEND FILTERING: Applied emergency filter, ${filtered.length} remaining`);
    }

    // MLC case filter
    if (mlcCase) {
      filtered = filtered.filter(study => study.mlcCase === true);
      console.log(`🔧 FRONTEND FILTERING: Applied MLC filter, ${filtered.length} remaining`);
    }

    // Study type filter
    if (studyType !== 'all') {
      filtered = filtered.filter(study => study.studyType === studyType);
      console.log(`🔧 FRONTEND FILTERING: Applied study type filter, ${filtered.length} remaining`);
    }

    console.log(`✅ FRONTEND FILTERING: Final result: ${filtered.length} studies`);
    return filtered;
  }, [
    allStudies, 
    selectedLocation, // 🆕 ADD: Include selectedLocation
    activeCategory,   // 🆕 ADD: Include activeCategory
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
  const handleBackendSearch = useCallback((forceSearch = false) => {
    if (!onSearchWithBackend) return;

    console.log('🔍 HYBRID SEARCH: Starting search with params');
    
    // ✅ ONLY BACKEND: Quick search + Lab selection criteria
    const hasQuickSearch = quickSearchTerm.trim();
    const hasLabSelection = selectedLocation !== 'ALL';
    
    // Determine if we should use backend search
    const shouldUseBackendSearch = hasQuickSearch || hasLabSelection || forceSearch;

    if (shouldUseBackendSearch) {
      // ✅ BUILD: Backend search parameters (Quick search + Lab only)
      const backendParams = {};
      
      // Add quick search
      if (quickSearchTerm.trim()) {
        backendParams.searchTerm = quickSearchTerm.trim();
        backendParams.searchType = searchType || 'all';
        console.log('🔍 HYBRID SEARCH: Adding quick search to backend:', backendParams.searchTerm);
      }
      
      // Add lab selection
      if (selectedLocation !== 'ALL') {
        backendParams.selectedLocation = selectedLocation;
        console.log('📍 HYBRID SEARCH: Adding lab selection to backend:', selectedLocation);
      }
      
      console.log('🔍 HYBRID SEARCH: Triggering backend search with params:', backendParams);
      onSearchWithBackend(backendParams);
      
    } else {
      // ✅ NO BACKEND SEARCH: Just trigger normal admin data fetch
      console.log('📊 HYBRID SEARCH: No quick search/lab criteria, using normal admin fetch');
      onSearchWithBackend(null);
    }
  }, [
    quickSearchTerm, searchType, selectedLocation, onSearchWithBackend
  ]);

  const handleLocationSelect = useCallback((locationValue) => {
  setSelectedLocation(locationValue);
  setLocationSearchTerm('');
  setShowLocationDropdown(false);
}, []);
  // 🔧 MEMOIZED CALLBACKS
  const handleQuickSearch = useCallback((e) => {
    e.preventDefault();
    handleBackendSearch();
  }, [handleBackendSearch]);

  const handleClear = useCallback(() => {
    setQuickSearchTerm('');
    setSearchType('');
    setSelectedLocation('ALL');
    setLocationSearchTerm('');
    setPatientName('');
    setPatientId('');
    setRefName('');
    setAccessionNumber(''); // ✅ This is correct now
    setDescription('');
    setWorkflowStatus('all');
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

    // Clear date filters via props
    if (onCustomDateChange) {
      onCustomDateChange('', '');
    }
    if (onDateFilterChange) {
      onDateFilterChange('today');
    }
    if (onDateTypeChange) {
      onDateTypeChange('UploadDate');
    }

    // Reset to default admin view
    if (onSearchWithBackend) {
      onSearchWithBackend(null);
    }
  }, [onCustomDateChange, onDateFilterChange, onDateTypeChange, onSearchWithBackend]);

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
    <div className="h-full w-full flex flex-col">
      {/* 🎯 SINGLE LINE: Compact Search-First Design */}
      <div className="relative">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          
          {/* 🚀 RESPONSIVE: All controls - horizontal on desktop, vertical on mobile */}
          <div className="px-3 py-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            
            {/* 🔍 LEFT: Search Controls (Priority 1) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
              {/* Top row on mobile: Search type and input */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Search Type */}
                <select 
                  className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-16 sm:w-20 flex-shrink-0"
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="patientName">Name</option>
                  <option value="patientId">ID</option>
                  <option value="accession">Acc#</option>
                </select>
                
                {/* Search Input */}
                <div className="flex-1 relative min-w-0">
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
              </div>

              {/* Second row on mobile: Labs dropdown and action buttons */}
              <div className="flex items-center gap-2">
                {/* Labs Dropdown - 🔧 HIDE for doctor and lab users */}
                {userRole === 'admin' && (
                  <div className="relative">
                    {/* ✅ ENHANCED: Bigger Labs Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 flex-1 sm:flex-none sm:w-40 text-left flex items-center justify-between"
                        onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                        disabled={locationsLoading}
                      >
                        <span className="truncate">
                          {locationsLoading ? 'Loading...' : selectedLocationLabel}
                        </span>
                        <svg className="w-3 h-3 ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* ✅ ENHANCED: Bigger Dropdown */}
                      {showLocationDropdown && (
                        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-300 rounded-md shadow-lg overflow-hidden w-80">
                          {/* Search input */}
                          <div className="p-3 border-b border-gray-200">
                            <div className="relative">
                              <svg className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              <input
                                type="text"
                                placeholder="Search labs..."
                                className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={locationSearchTerm}
                                onChange={(e) => setLocationSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>

                          {/* Location options */}
                          <div className="max-h-64 overflow-y-auto">
                            <button
                              type="button"
                              className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-100 flex items-center justify-between ${
                                selectedLocation === 'ALL' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                              }`}
                              onClick={() => handleLocationSelect('ALL')}
                            >
                              <div className="flex items-center">
                                <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                All Labs
                              </div>
                              {selectedLocation === 'ALL' && (
                                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>

                            {filteredLocations.length > 0 ? (
                              filteredLocations.map(location => (
                                <button
                                  key={location.value}
                                  type="button"
                                  className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-100 flex items-center justify-between ${
                                    selectedLocation === location.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                                  }`}
                                  onClick={() => handleLocationSelect(location.value)}
                                >
                                  <div className="flex items-center min-w-0 flex-1">
                                    <svg className="w-4 h-4 mr-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium truncate">{location.label}</div>
                                      {location.code && location.code !== location.label && (
                                        <div className="text-xs text-gray-500 truncate">Code: {location.code}</div>
                                      )}
                                    </div>
                                  </div>
                                  {selectedLocation === location.value && (
                                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-8 text-sm text-gray-500 text-center">
                                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <div className="font-medium">No labs found</div>
                                <div className="text-xs text-gray-400 mt-1">Try a different search term</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {showLocationDropdown && (
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowLocationDropdown(false)}
                      />
                    )}
                  </div>
                )}

                {/* Search & Filter Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleBackendSearch(true)}
                    disabled={loading}
                    className="inline-flex items-center px-2 sm:px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    title={
                      quickSearchTerm.trim() || selectedLocation !== 'ALL' 
                        ? "Search with backend (quick search + lab filter)"
                        : "Search with current filters"
                    }
                  >
                    {loading ? (
                      <svg className="w-3 h-3 sm:mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                    <span className="hidden sm:inline">
                      {quickSearchTerm.trim() || selectedLocation !== 'ALL' ? 'Search DB' : 'Search'}
                    </span>
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
            </div>

            {/* 📅 CENTER: Quick Date Filters - Mobile: full width, Desktop: compact */}
            <div className="flex items-center justify-center lg:justify-start gap-1 bg-gray-50 rounded-md px-2 py-1 overflow-x-auto">
              {userRole === 'doctor' ? (
                // 🆕 DOCTOR: Include "Assigned Today" filter
                ['last24h', 'today', 'yesterday', 'thisWeek', 'thisMonth', 'assignedToday'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => onDateFilterChange(filter)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
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
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
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
                className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  dateFilter === 'custom' 
                    ? 'bg-purple-500 text-white shadow-sm' 
                    : 'text-gray-600 hover:bg-white hover:shadow-sm'
                }`}
              >
                Custom
              </button>
            </div>

            {/* 📊 RIGHT: Status & Actions - Mobile: full width, Desktop: compact */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:gap-3">
              {/* Status Info */}
              <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 text-xs bg-gray-50 lg:bg-transparent rounded px-2 py-1 lg:p-0">
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
              <div className="flex items-center gap-1 justify-center sm:justify-start">
                <button 
                  onClick={() => {
                    onManualRefresh && onManualRefresh();
                    onResetNewStudyCount && onResetNewStudyCount();
                  }}
                  disabled={loading}
                  className="inline-flex items-center px-2 sm:px-3 py-1.5 bg-gray-600 text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 flex-1 sm:flex-none justify-center"
                  title="Refresh data"
                >
                  <svg className={`w-3 h-3 sm:mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
                  </svg>
                  <span className="sm:hidden lg:inline">Refresh</span>
                </button>

                {(userRole === 'admin' && (
                  // 🔧 ADMIN: Lab and Doctor management buttons
                  <>
                    <Link 
                      to="/admin/new-lab" 
                      className="inline-flex items-center px-2 sm:px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 transition-colors flex-1 sm:flex-none justify-center"
                      title="Add New Lab"
                    >
                      <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="sm:hidden lg:inline">Lab</span>
                    </Link>

                    <Link 
                      to="/admin/new-doctor" 
                      className="inline-flex items-center px-2 sm:px-3 py-1.5 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600 transition-colors flex-1 sm:flex-none justify-center"
                      title="Add New Doctor"
                    >
                      <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="sm:hidden lg:inline">Doctor</span>
                    </Link>

                    <Link 
                      to="/admin/new-admin" 
                      className="inline-flex items-center px-2 sm:px-3 py-1.5 bg-purple-500 text-white rounded text-xs font-medium hover:bg-purple-600 transition-colors flex-1 sm:flex-none justify-center"
                      title="Add New Admin"
                    >
                      <svg className="w-3 h-3 sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="sm:hidden lg:inline">Admin</span>
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 text-xs">
                <select
                  value={dateType}
                  onChange={(e) => onDateTypeChange && onDateTypeChange(e.target.value)}
                  className="px-2 py-1 border border-purple-300 rounded text-xs bg-white focus:ring-1 focus:ring-purple-500 w-full sm:w-auto"
                >
                  <option value="UploadDate">Upload Date</option>
                  <option value="StudyDate">Study Date</option>
                </select>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="date"
                    value={customDateFrom}
                    onChange={(e) => onCustomDateChange && onCustomDateChange(e.target.value, customDateTo)}
                    className="px-2 py-1 border border-purple-300 rounded text-xs bg-white focus:ring-1 focus:ring-purple-500"
                  />
                  
                  <span className="text-purple-600 font-medium text-center sm:text-left">to</span>
                  
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
                  className="px-2 py-1 text-xs text-purple-600 hover:text-purple-800 underline font-medium w-full sm:w-auto text-center"
                >
                  Clear Dates
                </button>
              </div>
            </div>
          )}

          {/* 🔧 CONDITIONAL: Active Filters */}
          {hasActiveFilters && (
            <div className="px-3 py-2 bg-blue-50 border-t border-blue-200">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-between gap-2 text-xs">
                <span className="text-blue-800 font-medium text-center sm:text-left">
                  🔍 Showing {filteredStudies.length} of {allStudies.length} studies
                </span>
                <button
                  onClick={handleClear}
                  className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800 underline font-medium"
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
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
                      onChange={(e) => setAccessionNumber(e.target.value)} // ✅ FIXED: Now matches the state setter
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
                  
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={handleClear}
                  className="inline-flex items-center justify-center px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Reset All
                </button>
                {/* <button
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
                </button> */}
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