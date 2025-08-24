import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import WorklistSearch from '../../components/admin/WorklistSearch';
import api from '../../services/api';
import useAdminWebSocket from '../../hooks/useAdminWebSocket';
import { useAuth } from '../../hooks/useAuth';

const AdminDashboard = React.memo(() => {
  const { currentUser } = useAuth();
  const stableUser = useMemo(() => currentUser, [currentUser?.id, currentUser?.role]);
  
  const { isConnected, connectionStatus, newStudyCount, resetNewStudyCount, reconnect } = useAdminWebSocket(stableUser);

  const [allStudies, setAllStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('pending');
  
  // Single page mode state management
  const [recordsPerPage, setRecordsPerPage] = useState(100);
  const [totalRecords, setTotalRecords] = useState(0);
  
  // Date filter state for backend integration
  const [dateFilter, setDateFilter] = useState('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [dateType, setDateType] = useState('UploadDate');
  
  const [dashboardStats, setDashboardStats] = useState({
    totalStudies: 0,
    pendingStudies: 0,
    inProgressStudies: 0,
    completedStudies: 0,
    activeLabs: 0,
    activeDoctors: 0
  });

  const [values, setValues] = useState({
    today: 0,
    pending: 0,
    inprogress: 0,
    completed: 0,
  });
  
  const intervalRef = useRef(null);

  // 🆕 NEW: API endpoint mapping for tabs
  const getEndpointForCategory = useCallback((category) => {
    switch (category) {
      case 'pending':
        return '/admin/studies/pending';
      case 'inprogress':
        return '/admin/studies/inprogress';
      case 'completed':
        return '/admin/studies/completed';
      case 'all':
      default:
        return '/admin/studies';
    }
  }, []);
  console.log(activeCategory)

  // 🔧 UPDATED: Fetch studies with dynamic endpoint
  const fetchAllData = useCallback(async (searchParams = {}) => {
    try {
      setLoading(true);
      console.log(`🔄 DASHBOARD: Fetching data for category: ${activeCategory}`);
      console.log(`🔍 DASHBOARD: Search params:`, searchParams);
      
      // ✅ ADD: Detailed debugging
      console.log(`🔍 DEBUG: searchParams type:`, typeof searchParams);
      console.log(`🔍 DEBUG: searchParams keys:`, Object.keys(searchParams || {}));
      console.log(`🔍 DEBUG: searchTerm value:`, searchParams?.searchTerm);
      console.log(`🔍 DEBUG: selectedLocation value:`, searchParams?.selectedLocation);
      console.log(`🔍 DEBUG: activeCategory:`, activeCategory);
      
      // ✅ FIXED: More strict hybrid search detection
      const hasQuickSearch = searchParams?.searchTerm && searchParams.searchTerm.trim().length > 0;
      const hasLabSelection = searchParams?.selectedLocation && 
                           searchParams.selectedLocation !== 'ALL' && 
                           searchParams.selectedLocation.trim().length > 0;
    
      const hasHybridSearchParams = hasQuickSearch || hasLabSelection;
    
      console.log(`🔍 DEBUG: hasQuickSearch:`, hasQuickSearch);
      console.log(`🔍 DEBUG: hasLabSelection:`, hasLabSelection);
      console.log(`🔍 DEBUG: hasHybridSearchParams:`, hasHybridSearchParams);
      console.log(`🔍 DEBUG: Will use ${hasHybridSearchParams ? 'SEARCH' : 'ADMIN'} controller`);
      
      let studiesResponse, valuesResponse;

      if (hasHybridSearchParams) {
        // 🔍 HYBRID SEARCH MODE: Use search endpoint ONLY for quick search + lab
        console.log('🔍 DASHBOARD: Using HYBRID search endpoint');
        
        const searchApiParams = {
          limit: recordsPerPage,
          dateType: dateType,
          searchTerm: searchParams.searchTerm || '',
          searchType: searchParams.searchType || 'all',
          selectedLocation: searchParams.selectedLocation || 'ALL'
        };
        
        // Add date filter parameters for search
        if (dateFilter === 'custom') {
          if (customDateFrom) searchApiParams.customDateFrom = customDateFrom;
          if (customDateTo) searchApiParams.customDateTo = customDateTo;
          searchApiParams.dateFilter = 'custom';
        } else if (dateFilter && dateFilter !== 'all') {
          searchApiParams.quickDatePreset = dateFilter;
        }
        
        console.log('📤 DASHBOARD: Hybrid search API params:', searchApiParams);
        
        [studiesResponse, valuesResponse] = await Promise.all([
          api.get('/admin/studies/search', { params: searchApiParams }),
          api.get('/admin/search/values', { params: searchApiParams })
        ]);
        
      } else {
        // 📊 NORMAL MODE: Use admin controller endpoint for category-specific data
        console.log(`📊 DASHBOARD: Using ADMIN controller for category: ${activeCategory}`);
        
        const adminParams = {
          limit: recordsPerPage,
          dateType: dateType,
          ...searchParams
        };
        
        // Add date filter parameters for admin endpoint
        if (dateFilter === 'custom') {
          if (customDateFrom) adminParams.customDateFrom = customDateFrom;
          if (customDateTo) adminParams.customDateTo = customDateTo;
          adminParams.dateFilter = 'custom';
        } else if (dateFilter && dateFilter !== 'all') {
          adminParams.quickDatePreset = dateFilter;
        }
        
        // ✅ CRITICAL: Add category filter for admin endpoint
        if (activeCategory && activeCategory !== 'all') {
          adminParams.category = activeCategory;
        }
        
        console.log('📤 DASHBOARD: Admin API params:', adminParams);
        
        // ✅ FIXED: Use category-specific endpoints
        const studiesEndpoint = getEndpointForCategory(activeCategory);
        
        [studiesResponse, valuesResponse] = await Promise.all([
          api.get(studiesEndpoint, { params: adminParams }),
          api.get('/admin/values', { params: adminParams }) // ✅ This should match the studies params
        ]);
      }
      
      // Process studies response
      if (studiesResponse.data.success) {
        setAllStudies(studiesResponse.data.data);
        setTotalRecords(studiesResponse.data.totalRecords);
        
        console.log(`✅ DASHBOARD: Data fetch successful: ${studiesResponse.data.data.length} studies`);
        console.log(`📊 DASHBOARD: Using ${hasHybridSearchParams ? 'HYBRID SEARCH' : 'ADMIN'} controller`);
      }

      // Process values response
      if (valuesResponse.data && valuesResponse.data.success) {
        setValues({
          today: valuesResponse.data.total || 0,
          pending: valuesResponse.data.pending || 0,
          inprogress: valuesResponse.data.inprogress || 0,
          completed: valuesResponse.data.completed || 0,
        });
        
        console.log(`📊 DASHBOARD: Values updated:`, {
          total: valuesResponse.data.total,
          pending: valuesResponse.data.pending,
          inprogress: valuesResponse.data.inprogress,
          completed: valuesResponse.data.completed
        });
      }

      console.log(`✅ ${hasHybridSearchParams ? 'Hybrid search' : `Admin ${activeCategory}`} data fetched successfully`);
      
    } catch (error) {
      console.error(`❌ Error fetching ${activeCategory} data:`, error);
      setAllStudies([]);
      setTotalRecords(0);
      setValues({
        today: 0,
        pending: 0,
        inprogress: 0,
        completed: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [activeCategory, recordsPerPage, dateFilter, customDateFrom, customDateTo, dateType, getEndpointForCategory]);

  console.log(allStudies)
  // 🔧 SIMPLIFIED: Single useEffect for initial load and dependency changes
  useEffect(() => {
    console.log(`🔄 Data dependencies changed - fetching fresh data`);
    fetchAllData();
  }, [fetchAllData]);

  // 🔧 SIMPLIFIED: Single auto-refresh interval
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refreshing all data...');
      fetchAllData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchAllData]);

  // Date filter handlers
  const handleDateFilterChange = useCallback((newDateFilter) => {
    console.log(`📅 DASHBOARD: Changing date filter to ${newDateFilter}`);
    setDateFilter(newDateFilter);
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  const handleCustomDateChange = useCallback((from, to) => {
    console.log(`📅 DASHBOARD: Setting custom date range from ${from} to ${to}`);
    setCustomDateFrom(from);
    setCustomDateTo(to);
    if (from || to) {
      setDateFilter('custom');
    }
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  const handleDateTypeChange = useCallback((newDateType) => {
    console.log(`📅 DASHBOARD: Changing date type to ${newDateType}`);
    setDateType(newDateType);
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  // Handle search with backend parameters
  const handleSearchWithBackend = useCallback((searchParams) => {
    console.log('🔍 DASHBOARD: Handling search with backend params:', searchParams);
    fetchAllData(searchParams || {});
  }, [fetchAllData]);

  // Handle records per page change
  const handleRecordsPerPageChange = useCallback((newRecordsPerPage) => {
    console.log(`📊 DASHBOARD: Changing records per page from ${recordsPerPage} to ${newRecordsPerPage}`);
    setRecordsPerPage(newRecordsPerPage);
    resetNewStudyCount();
  }, [recordsPerPage, resetNewStudyCount]);

  const handleAssignmentComplete = useCallback(() => {
    console.log('📋 Assignment completed, refreshing data...');
    fetchAllData();
  }, [fetchAllData]);

  const handleManualRefresh = useCallback(() => {
    console.log('🔄 Manual refresh triggered for all data');
    fetchAllData();
    resetNewStudyCount();
  }, [fetchAllData, resetNewStudyCount]);

  const handleWorklistView = useCallback(() => {
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  const handleCategoryChange = useCallback((category) => {
    console.log(`🏷️ DASHBOARD: Changing category from ${activeCategory} to ${category}`);
    
    // 🔧 FIXED: Only change if actually different
    if (activeCategory !== category) {
      setActiveCategory(category);
      resetNewStudyCount();
    }
  }, [activeCategory, resetNewStudyCount]);

  // Connection status display logic
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
    <div className="h-screen bg-gray-50 flex flex-col">
      <UniversalNavbar />

      <div className="min-w-full mx-auto p-1 sm:p-2 lg:p-0 flex-1 flex flex-col">
        {/* Main Content - Now WorklistSearch handles all controls */}
        <div className="bg-white flex-1 min-h-full rounded border border-gray-200 flex flex-col">
          <div className="flex-1 flex flex-col min-h-0 p-0 sm:p-2 lg:px-1 lg:pb-0 pb-0">
            <WorklistSearch 
              allStudies={allStudies}
              loading={loading}
              totalRecords={totalRecords}
              userRole="admin"
              onAssignmentComplete={handleAssignmentComplete}
              onView={handleWorklistView}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              categoryStats={dashboardStats}
              recordsPerPage={recordsPerPage}
              onRecordsPerPageChange={handleRecordsPerPageChange}
              dateFilter={dateFilter}
              onDateFilterChange={handleDateFilterChange}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
              onCustomDateChange={handleCustomDateChange}
              dateType={dateType}
              onDateTypeChange={handleDateTypeChange}
              onSearchWithBackend={handleSearchWithBackend}
              values={values}
              // 🆕 NEW: Pass additional props for integrated controls
              newStudyCount={newStudyCount}
              connectionStatus={connectionStatus}
              onManualRefresh={handleManualRefresh}
              onResetNewStudyCount={resetNewStudyCount}
            />
          </div>
        </div>

        {/* Mobile Stats - Keep this for mobile view */}
        <div className="lg:hidden mt-1 sm:mt-2">
          <details className="bg-white rounded border border-gray-200 shadow-sm">
            <summary className="px-2 py-1.5 cursor-pointer text-xs font-medium text-gray-700 hover:bg-gray-50 select-none">
              <span className="flex items-center justify-between">
                View Statistics
                <svg className="w-3 h-3 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="px-2 pb-2 grid grid-cols-3 gap-1 sm:gap-2">
              <div className="text-center p-1.5 bg-blue-50 rounded">
                <div className="text-sm font-semibold text-blue-600">
                  {dashboardStats.pendingStudies.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
              <div className="text-center p-1.5 bg-orange-50 rounded">
                <div className="text-sm font-semibold text-orange-600">
                  {dashboardStats.inProgressStudies.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">In Progress</div>
              </div>
              <div className="text-center p-1.5 bg-green-50 rounded">
                <div className="text-sm font-semibold text-green-600">
                  {dashboardStats.completedStudies.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
});

export default AdminDashboard;