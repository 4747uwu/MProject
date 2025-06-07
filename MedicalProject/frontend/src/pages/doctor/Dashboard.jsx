import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import WorklistSearch from '../../components/admin/WorklistSearch';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';

const DoctorDashboard = React.memo(() => {
  const { currentUser } = useAuth();
  
  // 🔧 MEMOIZE THE USER TO PREVENT UNNECESSARY RE-RENDERS
  const stableUser = useMemo(() => currentUser, [currentUser?.id, currentUser?.role]);

  const [allStudies, setAllStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  
  // 🔧 SIMPLIFIED: Single page mode state management (matching admin)
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  
  // 🆕 NEW: Date filter state for backend integration (matching admin)
  const [dateFilter, setDateFilter] = useState('last24h'); // Default to 24 hours
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [dateType, setDateType] = useState('UploadDate'); // StudyDate, UploadDate
  
  const [dashboardStats, setDashboardStats] = useState({
    totalStudies: 0,
    pendingStudies: 0,
    inProgressStudies: 0,
    completedStudies: 0,
    urgentStudies: 0,
    todayAssigned: 0
  });
  
  // 🔧 AUTO-REFRESH STATE
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [nextRefreshIn, setNextRefreshIn] = useState(300); // 5 minutes in seconds
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  // 🔧 ENHANCED: Fetch studies with date filters (matching admin pattern)
  const fetchStudies = useCallback(async (showLoadingState = true, searchParams = {}) => {
    try {
      if (showLoadingState) {
        setLoading(true);
      }
      
      console.log(`🔄 DOCTOR: Fetching studies with limit: ${recordsPerPage}, category: ${activeCategory}, dateFilter: ${dateFilter}`);
      
      // 🆕 NEW: Build API parameters including date filters (matching admin)
      const apiParams = {
        limit: recordsPerPage,
        category: activeCategory !== 'all' ? activeCategory : undefined,
        dateType: dateType,
        ...searchParams // Allow override from WorklistSearch
      };

      // Add date filter parameters
      if (dateFilter === 'custom') {
        if (customDateFrom) apiParams.customDateFrom = customDateFrom;
        if (customDateTo) apiParams.customDateTo = customDateTo;
        apiParams.quickDatePreset = 'custom';
      } else if (dateFilter && dateFilter !== 'all') {
        apiParams.quickDatePreset = dateFilter;
      }
      
      // Remove undefined values
      Object.keys(apiParams).forEach(key => 
        apiParams[key] === undefined && delete apiParams[key]
      );

      console.log('📤 DOCTOR API Parameters:', apiParams);
      
      const response = await api.get('/doctor/assigned-studies', {
        params: apiParams
      });
      
      console.log('📊 DOCTOR Studies response:', response.data);
      
      if (response.data.success) {
        setAllStudies(response.data.data);
        setTotalRecords(response.data.totalRecords);
        setLastRefresh(new Date());
        
        // Use the backend-provided category counts if available
        if (response.data.summary?.byCategory) {
          setDashboardStats({
            totalStudies: response.data.summary.byCategory.all || response.data.totalRecords,
            pendingStudies: response.data.summary.byCategory.pending || 0,
            inProgressStudies: response.data.summary.byCategory.inprogress || 0,
            completedStudies: response.data.summary.byCategory.completed || 0,
            urgentStudies: response.data.summary.urgentStudies || 
                           response.data.data.filter(s => ['EMERGENCY', 'STAT', 'URGENT'].includes(s.priority)).length,
            todayAssigned: response.data.summary.todayAssigned || 
                          response.data.data.filter(s => {
                            const today = new Date().toDateString();
                            return new Date(s.assignedDate).toDateString() === today;
                          }).length
          });
        } else {
          // Fallback to the client-side counting (less efficient)
          const studies = response.data.data;
          setDashboardStats({
            totalStudies: response.data.totalRecords,
            pendingStudies: studies.filter(s => s.currentCategory === 'pending').length,
            inProgressStudies: studies.filter(s => s.currentCategory === 'inprogress').length,
            completedStudies: studies.filter(s => s.currentCategory === 'completed').length,
            urgentStudies: studies.filter(s => ['EMERGENCY', 'STAT', 'URGENT'].includes(s.priority)).length,
            todayAssigned: studies.filter(s => {
              const today = new Date().toDateString();
              return new Date(s.assignedDate).toDateString() === today;
            }).length
          });
        }
        
        console.log('✅ DOCTOR Studies fetched successfully:', {
          count: response.data.data.length,
          totalRecords: response.data.totalRecords,
          dateFilter: dateFilter,
          isSinglePage: response.data.pagination?.isSinglePage || true
        });
      }
    } catch (error) {
      console.error('❌ DOCTOR Error fetching studies:', error);
      setAllStudies([]);
      setTotalRecords(0);
    } finally {
      if (showLoadingState) {
        setLoading(false);
      }
    }
  }, [activeCategory, recordsPerPage, dateFilter, customDateFrom, customDateTo, dateType]);

  // 🆕 NEW: Date filter handlers (matching admin)
  const handleDateFilterChange = useCallback((newDateFilter) => {
    console.log(`📅 DOCTOR: Changing date filter to ${newDateFilter}`);
    setDateFilter(newDateFilter);
    setNextRefreshIn(300); // Reset countdown
  }, []);

  const handleCustomDateChange = useCallback((from, to) => {
    console.log(`📅 DOCTOR: Setting custom date range from ${from} to ${to}`);
    setCustomDateFrom(from);
    setCustomDateTo(to);
    if (from || to) {
      setDateFilter('custom');
    }
    setNextRefreshIn(300); // Reset countdown
  }, []);

  const handleDateTypeChange = useCallback((newDateType) => {
    console.log(`📅 DOCTOR: Changing date type to ${newDateType}`);
    setDateType(newDateType);
    setNextRefreshIn(300); // Reset countdown
  }, []);

  // 🆕 NEW: Handle search with backend parameters (matching admin)
  const handleSearchWithBackend = useCallback((searchParams) => {
    console.log('🔍 DOCTOR: Handling search with backend params:', searchParams);
    fetchStudies(true, searchParams);
  }, [fetchStudies]);

  // Handle category change
  const handleCategoryChange = useCallback((category) => {
    console.log(`🏷️ DOCTOR: Changing category to: ${category}`);
    setActiveCategory(category);
    setNextRefreshIn(300); // Reset countdown
  }, []);

  // 🔧 SIMPLIFIED: Handle records per page change (no pagination, matching admin)
  const handleRecordsPerPageChange = useCallback((newRecordsPerPage) => {
    console.log(`📊 DOCTOR: Changing records per page from ${recordsPerPage} to ${newRecordsPerPage}`);
    setRecordsPerPage(newRecordsPerPage);
    setNextRefreshIn(300); // Reset countdown
  }, [recordsPerPage]);

  // Handle assignment completion (refresh data)
  const handleAssignmentComplete = useCallback(() => {
    console.log('📋 DOCTOR: Assignment completed, refreshing studies...');
    fetchStudies();
    setNextRefreshIn(300); // Reset countdown
  }, [fetchStudies]);

  // Handle manual refresh
  const handleManualRefresh = useCallback(() => {
    console.log('🔄 DOCTOR: Manual refresh triggered');
    fetchStudies();
    setNextRefreshIn(300); // Reset countdown
  }, [fetchStudies]);

  // Handle worklist view
  const handleWorklistView = useCallback((view) => {
    console.log('DOCTOR: Worklist view changed:', view);
    setNextRefreshIn(300); // Reset countdown
  }, []);

  // Initial data fetch (triggered when dependencies change)
  useEffect(() => {
    console.log(`🔄 DOCTOR useEffect triggered - Records: ${recordsPerPage}, Category: ${activeCategory}, DateFilter: ${dateFilter}`);
    fetchStudies();
  }, [fetchStudies]);

  // 🔧 AUTO-REFRESH EVERY 5 MINUTES
  useEffect(() => {
    // Clear any existing intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    // Set up auto-refresh every 5 minutes (300 seconds)
    intervalRef.current = setInterval(() => {
      console.log('🔄 DOCTOR: Auto-refreshing studies...');
      fetchStudies(false); // Don't show loading state for auto-refresh
      setNextRefreshIn(300); // Reset countdown
    }, 300000); // 5 minutes

    // Set up countdown timer (updates every second)
    countdownRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        if (prev <= 1) {
          return 300; // Reset to 5 minutes
        }
        return prev - 1;
      });
    }, 1000);

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [fetchStudies]);

  // 🔧 FORMAT NEXT REFRESH TIME
  const formatRefreshTime = useMemo(() => {
    const minutes = Math.floor(nextRefreshIn / 60);
    const seconds = nextRefreshIn % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [nextRefreshIn]);

  // 🔧 FORMAT LAST REFRESH TIME
  const formatLastRefresh = useMemo(() => {
    return lastRefresh.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, [lastRefresh]);

  return (
    <div className="min-h-screen bg-gray-50">
      <UniversalNavbar />

      <div className="max-w-8xl mx-auto p-4">
        {/* Enhanced Header with Auto-Refresh Info and Date Filters */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            {/* Left side - Title and basic info */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Assigned Studies</h1>
              <div className="flex items-center space-x-4 mt-1">
                <span className="text-sm text-gray-600">{totalRecords} total studies</span>
                <span className="text-sm text-gray-500">
                  ({recordsPerPage} per page - Single page mode)
                </span>
                {/* 🆕 NEW: Date filter indicator */}
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  📅 {dateFilter === 'custom' 
                    ? `Custom: ${customDateFrom || 'start'} - ${customDateTo || 'end'}` 
                    : dateFilter === 'last24h' ? 'Last 24 hours' 
                    : dateFilter}
                </span>
                
                {/* 🔧 AUTO-REFRESH STATUS */}
                
              </div>
            </div>

            {/* Right side - Date Filter Controls and Actions */}
            <div className="flex items-center space-x-3">
              {/* Quick Date Filter Controls (matching admin) */}
              <div className="flex items-center space-x-1 bg-white rounded-lg border border-gray-200 p-1">
                {['last24h', 'today', 'yesterday', 'thisWeek', 'thisMonth'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => handleDateFilterChange(filter)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      dateFilter === filter 
                        ? 'bg-blue-500 text-white' 
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {filter === 'last24h' ? '24h' : 
                     filter === 'today' ? 'Today' :
                     filter === 'yesterday' ? 'Yesterday' :
                     filter === 'thisWeek' ? 'Week' : 'Month'}
                  </button>
                ))}
                <button
                  onClick={() => handleDateFilterChange('custom')}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dateFilter === 'custom' 
                      ? 'bg-purple-500 text-white' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Quick Stats - Horizontal - DOCTOR SPECIFIC */}
              <div className="hidden md:flex items-center space-x-4 px-4 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-yellow-600">{dashboardStats.pendingStudies}</div>
                  <div className="text-xs text-gray-500">Pending</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-orange-600">{dashboardStats.inProgressStudies}</div>
                  <div className="text-xs text-gray-500">In Progress</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-600">{dashboardStats.completedStudies}</div>
                  <div className="text-xs text-gray-500">Completed</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-red-600">{dashboardStats.urgentStudies}</div>
                  <div className="text-xs text-gray-500">Urgent</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-600">{dashboardStats.todayAssigned}</div>
                  <div className="text-xs text-gray-500">Today</div>
                </div>
              </div>

              {/* Action Buttons - Enhanced with Auto-Refresh Info */}
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleManualRefresh}
                  disabled={loading}
                  className="flex items-center space-x-1 p-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 disabled:opacity-50"
                  title={`Manual refresh (Auto-refresh in ${formatRefreshTime})`}
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
                  </svg>
                  <span className="hidden sm:inline text-xs">
                    {formatRefreshTime}
                  </span>
                </button>

                <Link 
                  to="/doctor/reports" 
                  className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all duration-200 text-sm font-medium"
                >
                  My Reports
                </Link>

                <Link 
                  to="/doctor/profile" 
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 text-sm font-medium"
                >
                  Profile
                </Link>
              </div>
            </div>
          </div>

          {/* 🔧 AUTO-REFRESH PROGRESS BAR */}
          
        </div>

        {/* PRIMARY FOCUS: Enhanced Worklist Section */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Worklist Content - Maximum Focus */}
          <div className="p-6">
            <WorklistSearch 
              allStudies={allStudies}
              loading={loading}
              totalRecords={totalRecords}
              userRole="doctor"
              onAssignmentComplete={handleAssignmentComplete}
              onView={handleWorklistView}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              categoryStats={dashboardStats}
              recordsPerPage={recordsPerPage}
              onRecordsPerPageChange={handleRecordsPerPageChange}
              // 🆕 NEW: Pass date filter props (matching admin)
              dateFilter={dateFilter}
              onDateFilterChange={handleDateFilterChange}
              customDateFrom={customDateFrom}
              customDateTo={customDateTo}
              onCustomDateChange={handleCustomDateChange}
              dateType={dateType}
              onDateTypeChange={handleDateTypeChange}
              onSearchWithBackend={handleSearchWithBackend}
            />
          </div>
        </div>

        {/* Secondary Information - Collapsible Mobile Stats - DOCTOR SPECIFIC */}
        <div className="md:hidden mt-4">
          <details className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between">
              <span>View Statistics</span>
              <span className="text-xs text-blue-600">
                Auto-refresh: {formatRefreshTime}
              </span>
            </summary>
            <div className="px-4 pb-4">
              {/* Mobile Auto-Refresh Info */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700 font-medium">Auto-refresh enabled</span>
                  <span className="text-blue-600">{formatRefreshTime}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-1 mt-2 overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
                    style={{ 
                      width: `${((300 - nextRefreshIn) / 300) * 100}%` 
                    }}
                  ></div>
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Last updated: {formatLastRefresh}
                </div>
              </div>

              {/* Date Filter Mobile Controls */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-700 mb-2">Date Filter</div>
                <div className="flex flex-wrap gap-1">
                  {['last24h', 'today', 'yesterday', 'thisWeek', 'thisMonth', 'custom'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => handleDateFilterChange(filter)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        dateFilter === filter 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                    >
                      {filter === 'last24h' ? '24h' : 
                       filter === 'today' ? 'Today' :
                       filter === 'yesterday' ? 'Yesterday' :
                       filter === 'thisWeek' ? 'Week' : 
                       filter === 'thisMonth' ? 'Month' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-lg font-semibold text-yellow-600">{dashboardStats.pendingStudies}</div>
                  <div className="text-xs text-gray-500">Pending</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-lg font-semibold text-orange-600">{dashboardStats.inProgressStudies}</div>
                  <div className="text-xs text-gray-500">In Progress</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-semibold text-green-600">{dashboardStats.completedStudies}</div>
                  <div className="text-xs text-gray-500">Completed</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-lg font-semibold text-red-600">{dashboardStats.urgentStudies}</div>
                  <div className="text-xs text-gray-500">Urgent</div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
});

export default DoctorDashboard;