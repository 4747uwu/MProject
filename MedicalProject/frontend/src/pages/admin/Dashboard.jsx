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
  const [activeCategory, setActiveCategory] = useState('all');
  
  // 🔧 SIMPLIFIED: Single page mode state management
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  
  // 🆕 NEW: Date filter state for backend integration
  const [dateFilter, setDateFilter] = useState('today'); // Default to 24 hours
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [dateType, setDateType] = useState('UploadDate'); // StudyDate, UploadDate
  
  const [dashboardStats, setDashboardStats] = useState({
    totalStudies: 0,
    pendingStudies: 0,
    inProgressStudies: 0,
    completedStudies: 0,
    activeLabs: 0,
    activeDoctors: 0
  });
  
  const intervalRef = useRef(null);

  // 🔧 ENHANCED: Fetch studies with date filters
  const fetchStudies = useCallback(async (searchParams = {}) => {
    try {
      setLoading(true);
      console.log(`🔄 Fetching studies with limit: ${recordsPerPage}, category: ${activeCategory}, dateFilter: ${dateFilter}`);
      
      // 🆕 NEW: Build API parameters including date filters
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

      console.log('📤 API Parameters:', apiParams);
      
      const response = await api.get('/admin/studies', {
        params: apiParams
      });
      
      console.log('📊 Studies response:', response.data);
      
      if (response.data.success) {
        setAllStudies(response.data.data);
        setTotalRecords(response.data.totalRecords);
        
        // Update dashboard stats from backend response
        if (response.data.summary?.byCategory) {
          setDashboardStats({
            totalStudies: response.data.summary.byCategory.all || response.data.totalRecords,
            pendingStudies: response.data.summary.byCategory.pending || 0,
            inProgressStudies: response.data.summary.byCategory.inprogress || 0,
            completedStudies: response.data.summary.byCategory.completed || 0,
            activeLabs: response.data.summary.activeLabs || 
                        [...new Set(response.data.data.map(s => s.sourceLab?._id).filter(Boolean))].length,
            activeDoctors: response.data.summary.activeDoctors || 
                           [...new Set(response.data.data.map(s => s.lastAssignedDoctor?._id).filter(Boolean))].length
          });
        }
        
        console.log('✅ Studies fetched successfully:', {
          count: response.data.data.length,
          totalRecords: response.data.totalRecords,
          dateFilter: dateFilter,
          isSinglePage: response.data.pagination?.isSinglePage || true
        });
      }
    } catch (error) {
      console.error('❌ Error fetching studies:', error);
      setAllStudies([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, recordsPerPage, dateFilter, customDateFrom, customDateTo, dateType]);

  // Initial fetch when component mounts or dependencies change
  useEffect(() => {
    console.log(`🔄 useEffect triggered - Records: ${recordsPerPage}, Category: ${activeCategory}, DateFilter: ${dateFilter}`);
    fetchStudies();
  }, [fetchStudies]);

  // 🆕 NEW: Date filter handlers
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

  // 🆕 NEW: Handle search with backend parameters
  const handleSearchWithBackend = useCallback((searchParams) => {
    console.log('🔍 DASHBOARD: Handling search with backend params:', searchParams);
    fetchStudies(searchParams);
  }, [fetchStudies]);

  // Auto-refresh setup
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      console.log('🔄 Auto-refreshing studies data...');
      fetchStudies();
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStudies]);

  // 🔧 SIMPLIFIED: Handle records per page change (no pagination)
  const handleRecordsPerPageChange = useCallback((newRecordsPerPage) => {
    console.log(`📊 DASHBOARD: Changing records per page from ${recordsPerPage} to ${newRecordsPerPage}`);
    setRecordsPerPage(newRecordsPerPage);
    resetNewStudyCount();
  }, [recordsPerPage, resetNewStudyCount]);

  const handleAssignmentComplete = useCallback(() => {
    console.log('📋 Assignment completed, refreshing studies...');
    fetchStudies();
  }, [fetchStudies]);

  const handleManualRefresh = useCallback(() => {
    console.log('🔄 Manual refresh triggered');
    fetchStudies();
    resetNewStudyCount();
  }, [fetchStudies, resetNewStudyCount]);

  const handleWorklistView = useCallback(() => {
    resetNewStudyCount();
  }, [resetNewStudyCount]);

  const handleCategoryChange = useCallback((category) => {
    console.log(`🏷️ Changing category to: ${category}`);
    setActiveCategory(category);
    resetNewStudyCount();
  }, [resetNewStudyCount]);

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
    <div className="min-h-screen bg-gray-50">
      <UniversalNavbar />

      {/* 🔧 ULTRA COMPACT: Much tighter container */}
      <div className="max-w-full mx-auto p-1 sm:p-2 lg:p-3">
        {/* 🔧 COMPACT: Header with minimal spacing */}
        <div className="mb-1 sm:mb-2">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1 lg:gap-2 mb-1">
            {/* Title and Info Section */}
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 truncate">
                Studies Worklist
              </h1>
              
              {/* 🔧 ULTRA COMPACT: Tighter info badges */}
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
                
                {/* Connection status */}
                <div className="flex items-center gap-0.5">
                  <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${statusDisplay.color}`}></div>
                  <span className={`text-xs ${statusDisplay.textColor} whitespace-nowrap`}>
                    {statusDisplay.text}
                  </span>
                </div>
                
                {newStudyCount > 0 && (
                  <span className="bg-red-500 text-white text-xs px-1 py-0.5 rounded-full font-semibold animate-pulse whitespace-nowrap">
                    {newStudyCount} new
                  </span>
                )}
              </div>
            </div>

            {/* 🔧 ULTRA COMPACT: Controls section */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 lg:gap-2">
              {/* Quick Date Filter Controls */}
              <div className="flex items-center gap-0.5 bg-white rounded border border-gray-200 p-0.5 overflow-x-auto">
                {['last24h', 'today', 'yesterday', 'thisWeek', 'thisMonth'].map(filter => (
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
                     filter === 'thisWeek' ? 'Week' : 'Month'}
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
                  title="Refresh data"
                >
                  <svg className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
                  </svg>
                  <span className="hidden sm:inline">Refresh</span>
                  <span className="sm:hidden">↻</span>
                </button>

                <Link 
                  to="/admin/new-lab" 
                  className="inline-flex items-center px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-all duration-200 text-xs font-medium whitespace-nowrap h-6"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="hidden sm:inline">Lab</span>
                  <span className="sm:hidden">Lab</span>
                </Link>

                <Link 
                  to="/admin/new-doctor" 
                  className="inline-flex items-center px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-all duration-200 text-xs font-medium whitespace-nowrap h-6"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="hidden sm:inline">Doctor</span>
                  <span className="sm:hidden">Doc</span>
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

        

        {/* 🔧 ULTRA COMPACT: Main Content with minimal padding */}
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
          <div className="p-1 sm:p-2 lg:p-3">
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
              // 🆕 NEW: Pass date filter props
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

        {/* 🔧 ULTRA COMPACT: Mobile Stats */}
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