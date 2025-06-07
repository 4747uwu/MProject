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

      <div className="max-w-8xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Studies Worklist</h1>
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
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                  📜 All records loaded
                </span>
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${statusDisplay.color}`}></div>
                  <span className={`text-xs ${statusDisplay.textColor}`}>{statusDisplay.text}</span>
                </div>
                {newStudyCount > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-semibold animate-pulse">
                    {newStudyCount} new
                  </span>
                )}
              </div>
            </div>

            {/* Quick Date Filter Controls */}
            <div className="flex items-center space-x-3">
              {/* Quick date filter buttons */}
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

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleManualRefresh}
                  disabled={loading}
                  className="p-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 disabled:opacity-50"
                  title="Refresh data"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
                  </svg>
                </button>

                <Link 
                  to="/admin/new-lab" 
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 text-sm font-medium"
                >
                  + Lab
                </Link>

                <Link 
                  to="/admin/new-doctor" 
                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-200 text-sm font-medium"
                >
                  + Doctor
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-6">
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

        {/* Mobile Stats */}
        <div className="md:hidden mt-4">
          <details className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
              View Statistics
            </summary>
            <div className="px-4 pb-4 grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-lg font-semibold text-blue-600">{dashboardStats.pendingStudies}</div>
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
            </div>
          </details>
        </div>
      </div>
    </div>
  );
});

export default AdminDashboard;