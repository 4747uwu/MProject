import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import UniversalNavbar from '../../components/layout/AdminNavbar';
import WorklistSearch from '../../components/admin/WorklistSearch';
import api from '../../services/api';

const AdminDashboard = () => {
  const [allStudies, setAllStudies] = useState([]); // Raw data from API
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const intervalRef = useRef(null); // To store interval reference for cleanup

  // Fetch all studies without any filters - let WorklistSearch handle filtering
  const fetchStudies = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/studies', {
        params: {
          page: currentPage,
          limit: 50, // Fetch more records to allow client-side filtering
        }
      });
      console.log('Fetched studies:', response.data); // Debugging log
      
      if (response.data.success) {
        setAllStudies(response.data.data);
        setTotalPages(response.data.totalPages);
        setTotalRecords(response.data.totalRecords);
      }
    } catch (error) {
      console.error('Error fetching studies:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch when component mounts or page changes
  useEffect(() => {
    fetchStudies();
  }, [currentPage]);

  // Set up auto-refresh every 10 minutes
  useEffect(() => {
    // Set interval to call fetchStudies every 10 minutes (600,000 milliseconds)
    intervalRef.current = setInterval(() => {
      console.log('Auto-refreshing studies data...');
      fetchStudies();
    }, 10 * 60 * 1000); // 10 minutes

    // Cleanup function to clear interval when component unmounts
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('Auto-refresh interval cleared');
      }
    };
  }, [currentPage]); // Re-setup interval when currentPage changes

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleAssignmentComplete = () => {
    fetchStudies(); // Refresh data after assignment
  };

  // Manual refresh function
  const handleManualRefresh = () => {
    console.log('Manual refresh triggered');
    fetchStudies();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <UniversalNavbar />

      <div className="container w-full max-w-full mx-auto p-4 pl-6 pr-6 pt-6">
        <div className="mb-6 flex flex-wrap justify-between items-center max-w-8xl">
          <div className="flex space-x-2 mt-4 sm:mt-0">
            <Link to="/admin/new-lab" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 shadow-sm flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Add Lab
            </Link>
            <Link to="/admin/new-doctor" className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 shadow-sm flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Doctor
            </Link>
            <button 
              onClick={handleManualRefresh}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 shadow-sm flex items-center"
              disabled={loading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9a8 8 0 1115.356 2M15 15v-2a8 8 0 01-15.356-2" />
              </svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Reports Section - Main Focus */}
        <div className="mb-8">
          {/* Pass raw data to WorklistSearch - it will handle filtering and display */}
          <WorklistSearch 
            allStudies={allStudies}
            loading={loading}
            totalRecords={totalRecords}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            userRole="admin"
            onAssignmentComplete={handleAssignmentComplete}
          />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;