import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import WorklistSearch from '../../components/admin/WorklistSearch';
import api from '../../services/api';
import useAdminWebSocket from '../../hooks/useAdminWebSocket';
import { useAuth } from '../../hooks/useAuth';

// 🔧 FIXED: Dashboard.jsx - Add missing paginationMeta state
const AdminDashboard = React.memo(() => {
  const { currentUser } = useAuth();
  const stableUser = useMemo(() => currentUser, [currentUser?.id, currentUser?.role]);
  
  const { isConnected, connectionStatus, newStudyCount, resetNewStudyCount, reconnect } = useAdminWebSocket(stableUser);

  const [allStudies, setAllStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');
  
  // 🆕 CENTRALIZED: All pagination state here
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [usePagination, setUsePagination] = useState(true);
  
  // 🔧 FIXED: Add missing paginationMeta state
  const [paginationMeta, setPaginationMeta] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    limit: 20,
    hasNextPage: false,
    hasPrevPage: false,
    recordRange: {
      start: 1,
      end: 0
    }
  });

  const [dashboardStats, setDashboardStats] = useState({
    totalStudies: 0,
    pendingStudies: 0,
    inProgressStudies: 0,
    completedStudies: 0,
    activeLabs: 0,
    activeDoctors: 0
  });
  const intervalRef = useRef(null);

  // 🔧 ENHANCED: Fetch studies with pagination detection
  const fetchStudies = useCallback(async () => {
    try {
      setLoading(true);
      console.log(`🔄 Fetching studies with page: ${currentPage}, limit: ${recordsPerPage}, category: ${activeCategory}`);
      
      const response = await api.get('/admin/studies', {
        params: {
          page: currentPage,
          limit: recordsPerPage,
          category: activeCategory !== 'all' ? activeCategory : undefined,
        }
      });
      
      if (response.data.success) {
        setAllStudies(response.data.data);
        setTotalPages(response.data.totalPages);
        setTotalRecords(response.data.totalRecords);
        
        // 🆕 NEW: Set pagination mode from backend response
        setUsePagination(response.data.usePagination !== false);
        
        // 🔧 FIXED: Set pagination metadata with fallback
        if (response.data.pagination) {
          setPaginationMeta(response.data.pagination);
        } else {
          // 🔧 FALLBACK: Create pagination meta from response data
          setPaginationMeta({
            currentPage: response.data.currentPage || currentPage,
            totalPages: response.data.totalPages || 1,
            totalRecords: response.data.totalRecords || 0,
            limit: recordsPerPage,
            hasNextPage: (response.data.currentPage || currentPage) < (response.data.totalPages || 1),
            hasPrevPage: (response.data.currentPage || currentPage) > 1,
            recordRange: {
              start: response.data.data.length > 0 ? ((response.data.currentPage || currentPage) - 1) * recordsPerPage + 1 : 0,
              end: Math.min((response.data.currentPage || currentPage) * recordsPerPage, response.data.totalRecords || 0)
            }
          });
        }
        
        // Use backend-provided category counts or calculate from data
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
        } else {
          // 🔧 FALLBACK: Calculate stats from current data
          const currentData = response.data.data || [];
          setDashboardStats({
            totalStudies: response.data.totalRecords || 0,
            pendingStudies: currentData.filter(s => s.currentCategory === 'pending').length,
            inProgressStudies: currentData.filter(s => s.currentCategory === 'inprogress').length,
            completedStudies: currentData.filter(s => s.currentCategory === 'completed').length,
            activeLabs: [...new Set(currentData.map(s => s.sourceLab?._id).filter(Boolean))].length,
            activeDoctors: [...new Set(currentData.map(s => s.lastAssignedDoctor?._id).filter(Boolean))].length
          });
        }
        
        console.log('✅ Studies fetched successfully:', {
          count: response.data.data.length,
          totalRecords: response.data.totalRecords,
          usePagination: response.data.usePagination !== false,
          paginationMeta: response.data.pagination || 'fallback used'
        });
      }
    } catch (error) {
      console.error('❌ Error fetching studies:', error);
      // 🔧 ERROR HANDLING: Set safe defaults
      setAllStudies([]);
      setTotalPages(1);
      setTotalRecords(0);
      setPaginationMeta({
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        limit: recordsPerPage,
        hasNextPage: false,
        hasPrevPage: false,
        recordRange: { start: 0, end: 0 }
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, activeCategory, recordsPerPage]);

  // Initial fetch when component mounts or dependencies change
  useEffect(() => {
    console.log(`🔄 useEffect triggered - Page: ${currentPage}, Records: ${recordsPerPage}, Category: ${activeCategory}`);
    fetchStudies();
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

  // 🔧 ENHANCED: Handle page change with pagination check
  const handlePageChange = useCallback((page) => {
    if (!usePagination) {
      console.log('📄 Page change ignored - pagination disabled for high record count');
      return;
    }
    
    if (page >= 1 && page <= totalPages && page !== currentPage && !loading) {
      console.log(`📄 Navigating to page ${page}`);
      setCurrentPage(page);
      resetNewStudyCount();
    }
  }, [totalPages, currentPage, loading, resetNewStudyCount, usePagination]);

  // 🔧 ENHANCED: Handle records per page change with pagination mode detection
  const handleRecordsPerPageChange = useCallback((newRecordsPerPage) => {
    console.log(`📊 DASHBOARD: Changing records per page from ${recordsPerPage} to ${newRecordsPerPage}`);
    
    setRecordsPerPage(newRecordsPerPage);
    
    // 🆕 NEW: Set pagination mode based on record count
    if (newRecordsPerPage <= 100) {
      setCurrentPage(1);
      setUsePagination(true);
    } else {
      setUsePagination(false);
      setCurrentPage(1);
    }
    
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
    setCurrentPage(1); // Reset to first page
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
                  ({recordsPerPage} per page{!usePagination ? ' - Single page mode' : ''})
                </span>
                {/* 🆕 NEW: Show pagination mode indicator */}
                {!usePagination && (
                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                    📜 All records loaded
                  </span>
                )}
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

            <div className="flex items-center space-x-3">
              {/* Quick Stats */}
              <div className="hidden md:flex items-center space-x-4 px-4 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="text-center">
                  <div className="text-lg font-semibold text-blue-600">{dashboardStats.pendingStudies}</div>
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
                  <div className="text-lg font-semibold text-purple-600">{dashboardStats.activeLabs}</div>
                  <div className="text-xs text-gray-500">Labs</div>
                </div>
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
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              userRole="admin"
              onAssignmentComplete={handleAssignmentComplete}
              onView={handleWorklistView}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              categoryStats={dashboardStats}
              paginationMeta={paginationMeta} // 🔧 FIXED: Now properly defined
              recordsPerPage={recordsPerPage}
              onRecordsPerPageChange={handleRecordsPerPageChange}
              usePagination={usePagination}
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