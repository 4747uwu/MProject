import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';

const RecentStudies = ({ currentStudyId }) => {
  const navigate = useNavigate();
  const { studyId: urlStudyId } = useParams(); // Get current studyId from URL
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const studiesPerPage = 5;

  // Use currentStudyId prop or fallback to URL studyId
  const activeStudyId = currentStudyId || urlStudyId;

  // Fetch studies based on filter
  const fetchStudies = useCallback(async (filter = 'today') => {
    setLoading(true);
    try {
      const params = {
        limit: 50,
        quickDatePreset: filter === 'today' ? 'assignedToday' : 'yesterday'
      };

      const response = await api.get('/doctor/assigned-studies', { params });
      
      if (response.data.success) {
        setStudies(response.data.data || []);
      } else {
        setStudies([]);
      }
    } catch (error) {
      console.error('❌ Error fetching recent studies:', error);
      setStudies([]);
      toast.error('Failed to load recent studies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudies(activeFilter);
  }, [fetchStudies, activeFilter]);

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setCurrentPage(1);
    setSearchQuery('');
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const filteredStudies = studies.filter(study => {
    if (!searchQuery.trim()) return true;
    
    const searchLower = searchQuery.toLowerCase();
    return (
      study.patientName?.toLowerCase().includes(searchLower) ||
      study.patientId?.toLowerCase().includes(searchLower) ||
      study.accessionNumber?.toLowerCase().includes(searchLower) ||
      study.modality?.toLowerCase().includes(searchLower) ||
      study.description?.toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(filteredStudies.length / studiesPerPage);
  const startIndex = (currentPage - 1) * studiesPerPage;
  const paginatedStudies = filteredStudies.slice(startIndex, startIndex + studiesPerPage);

  const handleStudySelect = (studyId) => {
    // Don't navigate if it's the same study
    if (studyId === activeStudyId) {
      toast.info('This study is already open');
      return;
    }
    
    // Navigate to the new study - this will trigger the useEffect in OnlineReportingSystem
    navigate(`/report/${studyId}`);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="bg-white border border-gray-300 rounded-b-lg border border-t-0 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-1 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">Recent Studies</h3>
          <button
            onClick={() => fetchStudies(activeFilter)}
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 mb-3">
          <button
            onClick={() => handleFilterChange('today')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeFilter === 'today'
                ? 'bg-black text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Today ({studies.filter(s => {
              const today = new Date().toDateString();
              return new Date(s.assignedDate || s.uploadDateTime).toDateString() === today;
            }).length})
          </button>
          <button
            onClick={() => handleFilterChange('yesterday')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeFilter === 'yesterday'
                ? 'bg-black text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Yesterday ({studies.filter(s => {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toDateString();
              return new Date(s.assignedDate || s.uploadDateTime).toDateString() === yesterdayStr;
            }).length})
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search studies..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-6 pr-3 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
      </div>

      {/* Studies List - Flexible height */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-black"></div>
            <span className="ml-2 text-xs text-gray-500">Loading studies...</span>
          </div>
        ) : filteredStudies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-xs text-gray-500">
              {searchQuery ? 'No studies match your search' : `No studies for ${activeFilter}`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {paginatedStudies.map((study, index) => {
              // Check if this is the currently active study
              const isCurrentStudy = study._id === activeStudyId;
              
              return (
                <div
                  key={study._id}
                  className={`px-4 py-3 cursor-pointer transition-colors relative ${
                    isCurrentStudy 
                      ? 'bg-blue-50 border-l-4 border-blue-500' // Highlight current study
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleStudySelect(study._id)}
                >
                  {/* Current study indicator */}
                  {isCurrentStudy && (
                    <div className="absolute top-2 right-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    </div>
                  )}
                  
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Patient Info */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium truncate ${
                          isCurrentStudy ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          {study.patientName}
                        </span>
                        <span className={`text-xs ${
                          isCurrentStudy ? 'text-blue-700' : 'text-gray-500'
                        }`}>
                          ({study.patientId})
                        </span>
                      </div>
                      
                      {/* Study Details */}
                      <div className={`text-xs mb-1 ${
                        isCurrentStudy ? 'text-blue-800' : 'text-gray-600'
                      }`}>
                        <span className="font-medium">{study.modality}</span>
                        {study.description && (
                          <span className="ml-1">- {study.description}</span>
                        )}
                      </div>
                      
                      {/* Accession & Time */}
                      <div className={`flex items-center gap-3 text-xs ${
                        isCurrentStudy ? 'text-blue-600' : 'text-gray-500'
                      }`}>
                        <span>#{study.accessionNumber}</span>
                        <span>{formatTime(study.assignedDate || study.uploadDateTime)}</span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        study.workflowStatus === 'assigned_to_doctor' 
                          ? 'bg-yellow-100 text-yellow-800'
                          : study.workflowStatus === 'report_in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : study.workflowStatus === 'report_finalized'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {study.workflowStatus === 'assigned_to_doctor' ? 'Pending' :
                         study.workflowStatus === 'report_in_progress' ? 'In Progress' :
                         study.workflowStatus === 'report_finalized' ? 'Completed' : 'Unknown'}
                      </span>
                      
                      {/* Priority Badge */}
                      {study.priority && ['URGENT', 'EMERGENCY', 'STAT'].includes(study.priority) && (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          {study.priority}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination - Fixed at bottom */}
      {!loading && filteredStudies.length > studiesPerPage && (
        <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs">
            <div className="text-gray-500">
              Showing {startIndex + 1}-{Math.min(startIndex + studiesPerPage, filteredStudies.length)} of {filteredStudies.length}
            </div>
            
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 border border-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <span className="px-2 py-1 text-xs">
                {currentPage} / {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 border border-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentStudies;