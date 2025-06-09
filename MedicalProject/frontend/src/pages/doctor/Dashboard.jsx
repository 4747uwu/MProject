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

      {/* 🔧 ULTRA COMPACT: Much tighter container (matching admin) */}
      <div className="max-w-full mx-auto p-1 sm:p-2 lg:p-3">
        {/* 🔧 COMPACT: Header with minimal spacing (matching admin) */}
        <div className="mb-1 sm:mb-2">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1 lg:gap-2 mb-1">
            {/* Title and Info Section */}
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 truncate">
                My Assigned Studies
              </h1>
              
              {/* 🔧 ULTRA COMPACT: Tighter info badges (matching admin) */}
              <div className="flex flex-wrap items-center gap-0.5 sm:gap-1 mt-0.5 text-xs">
                <span className="text-gray-600 whitespace-nowrap">
                  {totalRecords.toLocaleString()} total studies
                </span>
                <span className="text-gray-500 whitespace-nowrap hidden sm:inline">
                  ({recordsPerPage} per page)
                </span>
                
                {/* Date filter indicator */}
                <span className="bg-blue-100 text-blue-800 px-1 py-0.5 rounded-full text-xs whitespace-nowrap">
                  📅 {dateFilter === 'custom' 
                    ? `Custom Range` 
                    : dateFilter === 'last24h' ? '24h' 
                    : dateFilter}
                </span>
                
                <span className="bg-green-100 text-green-800 px-1 py-0.5 rounded-full text-xs whitespace-nowrap">
                  📜 All loaded
                </span>
                
                {/* Auto-refresh status indicator */}
                <div className="flex items-center gap-0.5">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-xs text-blue-700 whitespace-nowrap">
                    Auto-refresh: {formatRefreshTime}
                  </span>
                </div>
              </div>
            </div>

            {/* 🔧 ULTRA COMPACT: Controls section (matching admin) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 lg:gap-2">
              {/* Quick Date Filter Controls */}
              <div className="flex items-center gap-0.5 bg-white rounded border border-gray-200 p-0.5 overflow-x-auto">
                {['last24h', 'today', 'yesterday', 'thisWeek', 'thisMonth', 'assignedToday'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => handleDateFilterChange(filter)}
                    className={`px-1 py-0.5 text-xs whitespace-nowrap rounded transition-colors flex-shrink-0 ${
                      dateFilter === filter 
                        ? 'bg-blue-500 text-white' 
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {filter === 'last24h' ? '24h' : 
                     filter === 'today' ? 'Today' :
                     filter === 'yesterday' ? 'Yesterday' :
                     filter === 'thisWeek' ? 'Week' : 
                     filter === 'thisMonth' ? 'Month' :
                     filter === 'assignedToday' ? 'Assigned Today' : 'Custom'}
                  </button>
                ))}
                <button
                  onClick={() => handleDateFilterChange('custom')}
                  className={`px-1 py-0.5 text-xs whitespace-nowrap rounded transition-colors flex-shrink-0 ${
                    dateFilter === 'custom' 
                      ? 'bg-purple-500 text-white' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleManualRefresh}
                  disabled={loading}
                  className="inline-flex items-center px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-all duration-200 text-xs font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed h-6"
                  title={`Manual refresh (Auto-refresh in ${formatRefreshTime})`}
                >
                  <svg className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
                  </svg>
                  <span className="hidden sm:inline">Refresh</span>
                  <span className="sm:hidden">↻</span>
                </button>

                <Link 
                  to="/doctor/reports" 
                  className="inline-flex items-center px-2 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-all duration-200 text-xs font-medium whitespace-nowrap h-6"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden sm:inline">Reports</span>
                  <span className="sm:hidden">Reports</span>
                </Link>

                <Link 
                  to="/doctor/profile" 
                  className="inline-flex items-center px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-all duration-200 text-xs font-medium whitespace-nowrap h-6"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="hidden sm:inline">Profile</span>
                  <span className="sm:hidden">Profile</span>
                </Link>
              </div>
            </div>
          </div>


          {dateFilter === 'custom' && (
            <div className="bg-purple-50 border border-purple-200 rounded p-1 sm:p-2 mt-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 text-xs">
                <select
                  value={dateType}
                  onChange={(e) => handleDateTypeChange(e.target.value)}
                  className="px-1 py-0.5 text-xs border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                >
                  <option value="UploadDate">Upload Date</option>
                  <option value="StudyDate">Study Date</option>
                </select>
                
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => handleCustomDateChange(e.target.value, customDateTo)}
                  className="px-1 py-0.5 text-xs border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  placeholder="From"
                />
                
                <span className="text-purple-600 hidden sm:inline">to</span>
                
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => handleCustomDateChange(customDateFrom, e.target.value)}
                  className="px-1 py-0.5 text-xs border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  placeholder="To"
                />
                
                <button
                  onClick={() => {
                    setCustomDateFrom('');
                    setCustomDateTo('');
                    setDateFilter('last24h');
                  }}
                  className="px-1 py-0.5 text-xs text-purple-600 hover:text-purple-800 underline"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 🔧 ULTRA COMPACT: Main Content with minimal padding (matching admin) */}
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
          <div className="p-1 sm:p-2 lg:p-3">
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

        {/* 🔧 ULTRA COMPACT: Mobile Stats (matching admin but with doctor-specific stats) */}
        <div className="lg:hidden mt-1 sm:mt-2">
          <details className="bg-white rounded border border-gray-200 shadow-sm">
            <summary className="px-2 py-1.5 cursor-pointer text-xs font-medium text-gray-700 hover:bg-gray-50 select-none">
              <span className="flex items-center justify-between">
                <span>View Statistics</span>
                <span className="text-blue-600">Auto-refresh: {formatRefreshTime}</span>
              </span>
            </summary>
            <div className="px-2 pb-2">
              {/* Auto-refresh info section */}
              <div className="mb-2 p-2 bg-blue-50 rounded text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-blue-700 font-medium">Auto-refresh enabled</span>
                  <span className="text-blue-600">{formatRefreshTime}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-1 mt-1 overflow-hidden">
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

              {/* Stats Grid - Doctor specific */}
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                <div className="text-center p-1.5 bg-yellow-50 rounded">
                  <div className="text-sm font-semibold text-yellow-600">
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
                <div className="text-center p-1.5 bg-red-50 rounded">
                  <div className="text-sm font-semibold text-red-600">
                    {dashboardStats.urgentStudies.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Urgent</div>
                </div>
                <div className="text-center p-1.5 bg-blue-50 rounded">
                  <div className="text-sm font-semibold text-blue-600">
                    {dashboardStats.todayAssigned.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Today</div>
                </div>
                <div className="text-center p-1.5 bg-gray-50 rounded">
                  <div className="text-sm font-semibold text-gray-600">
                    {dashboardStats.totalStudies.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Total</div>
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