import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatTime } from '../../utils/dateUtils';
import PatientDetailModal from './patients/PatientDetailModal';
import DoctorAssignmentModal from './Doctor/DoctorAssignmentModal';
import OpenOHIFViewerButton from './ohifViewerButton';
import { useAuth } from '../../hooks/useAuth';
import ReportButton from './ReportButton';

// Status dot component to indicate workflow status
const StatusDot = ({ status, priority }) => {
  let color = 'bg-gray-400'; 
  
  switch (status) {
    case 'new':
    case 'pending_assignment':
      if (priority === 'EMERGENCY' || priority === 'STAT' || priority === 'URGENT') {
        color = 'bg-red-500';
      } else {
        color = 'bg-yellow-500';
      }
      break;
    case 'assigned_to_doctor':
      color = 'bg-blue-500';
      break;
    case 'report_in_progress':
    case 'doctor_opened_report':
      color = 'bg-orange-500';
      break;
    case 'report_finalized':
    case 'report_uploaded':
      color = 'bg-green-500';
      break;
    default:
      color = 'bg-gray-400';
  }
  
  return (
    <div className={`w-3 h-3 rounded-full ${color}`} />
  );
};

// Eye icon with the viewer functionality
const EyeIconOHIFButton = ({ studyInstanceUID }) => {
  const handleClick = (e) => {
    e.preventDefault();
    const proxyBaseURL = 'https://57e2-59-145-191-142.ngrok-free.app';
    const ohifViewerBaseURL = 'https://viewer.ohif.org/viewer';
    const viewerURL = `${ohifViewerBaseURL}?studyInstanceUIDs=${studyInstanceUID}&server=${encodeURIComponent(`${proxyBaseURL}/dicom-web`)}`;
    window.open(viewerURL, '_blank');
  };

  return (
    <button 
      onClick={handleClick} 
      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-1 hover:bg-blue-50 rounded"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );
};

// Enhanced DownloadDropdown
const DownloadDropdown = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  
  const handleDownloadStudy = async () => {
    try {
      const orthancStudyId = study.orthancStudyID;
      
      if (!orthancStudyId) {
        alert('Orthanc Study ID not found');
        return;
      }
      
      const downloadUrl = `${backendUrl}/api/orthanc-download/study/${orthancStudyId}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error downloading study:', error);
      alert('Failed to download study: ' + error.message);
    } finally {
      setIsOpen(false);
    }
  };
  
  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-green-600 hover:text-green-800 transition-colors duration-200 p-1 hover:bg-green-50 rounded"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="py-1">
              <button
                onClick={handleDownloadStudy}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download ZIP
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// New Download Button Component
const DownloadButton = ({ study }) => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  
  const handleDownload = async () => {
    try {
      const orthancStudyId = study.orthancStudyID;
      
      if (!orthancStudyId) {
        alert('Orthanc Study ID not found');
        return;
      }
      
      const downloadUrl = `${backendUrl}/api/orthanc-download/study/${orthancStudyId}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Error downloading study:', error);
      alert('Failed to download study: ' + error.message);
    }
  };

  return (
    <button 
      onClick={handleDownload}
      className="text-green-600 hover:text-green-800 transition-colors duration-200 p-1 hover:bg-green-50 rounded"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </button>
  );
};

// User Icon Button Component
const UserButton = ({ study }) => {
  const handleUserClick = () => {
    console.log('User button clicked for study:', study._id);
    // Add user-related functionality here
  };

  return (
    <button 
      onClick={handleUserClick}
      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-1 hover:bg-blue-50 rounded"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    </button>
  );
};

// Discussion Button Component
const DiscussionButton = ({ study }) => {
  const handleDiscussionClick = () => {
    console.log('Discussion button clicked for study:', study._id);
    // Add discussion functionality here
  };

  return (
    <button 
      onClick={handleDiscussionClick}
      className="text-purple-600 hover:text-purple-800 transition-colors duration-200 p-1 hover:bg-purple-50 rounded"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </button>
  );
};

// Random Emoji Button Component - Single Emoji
const RandomEmojiButton = ({ study }) => {
  const handleEmojiClick = () => {
    console.log('Emoji button clicked for study:', study._id);
    // Add emoji-related functionality here
  };

  return (
    <button 
      onClick={handleEmojiClick}
      className="text-lg hover:scale-110 transition-transform duration-200 p-1 hover:bg-gray-50 rounded"
    >
      🎯
    </button>
  );
};

// Column Configurator Component
const ColumnConfigurator = ({ visibleColumns, onColumnChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const availableColumns = [
    { key: 'checkbox', label: 'Select', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'randomEmoji', label: 'Random Emoji', default: true },
    { key: 'user', label: 'User', default: true },
    { key: 'downloadBtn', label: 'Download', default: true },
    { key: 'discussion', label: 'Discussion', default: true },
    { key: 'patientId', label: 'Patient ID', default: true },
    { key: 'patientName', label: 'Patient Name', default: true },
    { key: 'ageGender', label: 'Age/Sex', default: true },
    { key: 'description', label: 'Description', default: true },
    { key: 'series', label: 'Series', default: true },
    { key: 'modality', label: 'Modality', default: true },
    { key: 'location', label: 'Location', default: true },
    { key: 'studyDate', label: 'Study Date', default: true },
    { key: 'uploadDate', label: 'Upload Date', default: true },
    { key: 'reportedDate', label: 'Reported Date', default: true },
    { key: 'reportedBy', label: 'Reported By', default: true },
    { key: 'accession', label: 'Accession', default: true },
    { key: 'seenBy', label: 'Seen By', default: true },
    { key: 'actions', label: 'Actions', default: true },
    { key: 'report', label: 'Report', default: true },
    { key: 'assignDoctor', label: 'Assign Doctor', default: true }
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
        </svg>
        Columns
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Show/Hide Columns</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableColumns.map((column) => (
                  <label key={column.key} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={visibleColumns[column.key]}
                      onChange={(e) => onColumnChange(column.key, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{column.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const WorklistTable = ({ 
  studies = [], 
  loading = false, 
  totalRecords = 0, 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange,
  onSearch,
  onLocationChange,
  hideFilters = false,
  userRole = 'admin',
  onAssignmentComplete
}) => {
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    pending: 0,
    inprogress: 0,
    completed: 0
  });

  // Column visibility state with updated order
  const [visibleColumns, setVisibleColumns] = useState({
    checkbox: true,
    status: true,
    randomEmoji: true,
    user: true,
    downloadBtn: true,
    discussion: true,
    patientId: true,
    patientName: true,
    ageGender: true,
    description: true,
    series: true,
    modality: true,
    location: true,
    studyDate: true,
    uploadDate: true,
    reportedDate: true,
    reportedBy: true,
    accession: true,
    seenBy: true,
    actions: true,
    report: true,
    assignDoctor: true
  });
  
  // Assignment modal state
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState(null);
  
  // Patient detail modal state
  const [patientDetailModalOpen, setPatientDetailModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  const canAssignDoctors = userRole === 'admin';

  // Calculate status counts when studies change
  useEffect(() => {
    const calculateStatusCounts = (studiesData) => {
      const counts = {
        all: studiesData.length,
        pending: studiesData.filter(study => 
          study.workflowStatus === 'new_study_received' || 
          study.workflowStatus === 'pending_assignment'
        ).length,
        inprogress: studiesData.filter(study => 
          study.workflowStatus === 'assigned_to_doctor' || 
          study.workflowStatus === 'report_in_progress'
        ).length,
        completed: studiesData.filter(study => 
          study.workflowStatus === 'report_finalized'
        ).length
      };
      setStatusCounts(counts);
    };

    calculateStatusCounts(studies);
  }, [studies]);

  // Handle column visibility change
  const handleColumnChange = (columnKey, isVisible) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: isVisible
    }));
  };

  // Open doctor assignment modal for a study (only for admin)
  const handleAssignDoctor = (studyData) => {
    if (!canAssignDoctors) {
      console.warn('User does not have permission to assign doctors');
      return;
    }

    const formattedStudy = {
      _id: studyData._id,
      patientName: studyData.patientName || 
                (studyData.patient ? 
                  `${studyData.patient.firstName || ''} ${studyData.patient.lastName || ''}`.trim() : 'N/A'),
      patientId: studyData.patientId || (studyData.patient ? studyData.patient.patientID : 'N/A'),
      modality: studyData.modality || '',
      description: studyData.description || '',
      studyDescription: studyData.studyDescription || '',
      examDescription: studyData.examDescription || '',
      modalitiesInStudy: studyData.modalitiesInStudy || [],
      lastAssignedDoctor: studyData.lastAssignedDoctor || null,
      workflowStatus: studyData.workflowStatus || 'new'
    };
    
    setSelectedStudy(formattedStudy);
    setAssignmentModalOpen(true);
  };
  
  // Open patient detail modal when clicking on a patient ID
  const handlePatientClick = (patientId) => {
    setSelectedPatientId(patientId);
    setPatientDetailModalOpen(true);
  };

  // Filter studies based on active tab
  const getFilteredStudies = () => {
    if (activeTab === 'all') return studies;
    
    return studies.filter(study => {
      switch (activeTab) {
        case 'pending':
          return study.workflowStatus === 'new_study_received' || study.workflowStatus === 'pending_assignment';
        case 'inprogress':
          return study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress';
        case 'completed':
          return study.workflowStatus === 'report_finalized';
        default:
          return true;
      }
    });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchTerm);
    }
  };

  const handleLocationFilterChange = (location) => {
    setSelectedLocation(location);
    if (onLocationChange) {
      onLocationChange(location);
    }
  };

  const handleAssignmentModalComplete = () => {
    setAssignmentModalOpen(false);
    if (onAssignmentComplete) {
      onAssignmentComplete();
    }
  };

  const filteredStudies = getFilteredStudies();

  return (
    <div className="bg-white w-full h-[85vh] rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Excel-style Header with Status Tabs */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
        {/* Status Tabs */}
        <div className="flex border-b border-gray-200">
          {[{
            key: 'all',
            label: 'All Studies',
            count: statusCounts.all,
            color: 'text-blue-600 border-blue-500',
            bgColor: 'bg-blue-50'
          },
          {
            key: 'pending',
            label: 'Pending',
            count: statusCounts.pending,
            color: 'text-yellow-600 border-yellow-500',
            bgColor: 'bg-yellow-50'
          },
          {
            key: 'inprogress',
            label: 'In Progress',
            count: statusCounts.inprogress,
            color: 'text-orange-600 border-orange-500',
            bgColor: 'bg-orange-50'
          },
          {
            key: 'completed',
            label: 'Completed',
            count: statusCounts.completed,
            color: 'text-green-600 border-green-500',
            bgColor: 'bg-green-50'
          }].map(tab => (
            <button 
              key={tab.key}
              className={`flex-1 py-3 px-4 text-sm font-semibold transition-all duration-200 border-b-2 ${
                activeTab === tab.key 
                  ? `${tab.color} ${tab.bgColor}` 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-transparent'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        
        {/* Search and Filters */}
        {!hideFilters && (
          <div className="p-4 flex flex-wrap gap-3 items-center justify-between">
            <form onSubmit={handleSearch} className="flex items-center space-x-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by Patient Name and Accession No"
                  className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm font-medium"
              >
                Search
              </button>
            </form>

            <div className="flex items-center space-x-3">
              <select
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                value={selectedLocation}
                onChange={(e) => handleLocationFilterChange(e.target.value)}
              >
                <option value="">All Work Stations</option>
                <option value="MITTAL LAB MOGA">MITTAL LAB MOGA</option>
                <option value="APEKSHA DIAGNOSTIC">APEKSHA DIAGNOSTIC</option>
                <option value="NAV JEEVAN HOSPITAL KANGRA">NAV JEEVAN HOSPITAL KANGRA</option>
              </select>
              
              {/* Column Configurator */}
              <ColumnConfigurator 
                visibleColumns={visibleColumns}
                onColumnChange={handleColumnChange}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Excel-style Table Container */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center items-center h-full bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Loading studies...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              {/* Excel-style Header with new order */}
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                  {visibleColumns.checkbox && (
                    <th className="w-12 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      <input type="checkbox" className="rounded border-gray-300" />
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th className="w-16 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Status
                    </th>
                  )}
                  {visibleColumns.randomEmoji && (
                    <th className="w-12 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      🎯
                    </th>
                  )}
                  {visibleColumns.user && (
                    <th className="w-12 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      👤
                    </th>
                  )}
                  {visibleColumns.downloadBtn && (
                    <th className="w-12 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      ⬇️
                    </th>
                  )}
                  {visibleColumns.discussion && (
                    <th className="w-12 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      💬
                    </th>
                  )}
                  {visibleColumns.patientId && (
                    <th className="w-24 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Patient ID
                    </th>
                  )}
                  {visibleColumns.patientName && (
                    <th className="w-40 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Patient Name
                    </th>
                  )}
                  {visibleColumns.ageGender && (
                    <th className="w-20 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Age/Sex
                    </th>
                  )}
                  {visibleColumns.description && (
                    <th className="w-48 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Description
                    </th>
                  )}
                  {visibleColumns.series && (
                    <th className="w-20 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Series
                    </th>
                  )}
                  {visibleColumns.modality && (
                    <th className="w-20 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Modality
                    </th>
                  )}
                  {visibleColumns.location && (
                    <th className="w-36 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Location
                    </th>
                  )}
                  {visibleColumns.studyDate && (
                    <th className="w-32 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Study Date
                    </th>
                  )}
                  {visibleColumns.uploadDate && (
                    <th className="w-32 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Upload Date
                    </th>
                  )}
                  {visibleColumns.reportedDate && (
                    <th className="w-32 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Reported Date
                    </th>
                  )}
                  {visibleColumns.reportedBy && (
                    <th className="w-28 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Reported By
                    </th>
                  )}
                  {visibleColumns.accession && (
                    <th className="w-32 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Accession
                    </th>
                  )}
                  {visibleColumns.seenBy && (
                    <th className="w-28 px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Seen By
                    </th>
                  )}
                  {visibleColumns.actions && (
                    <th className="w-24 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Actions
                    </th>
                  )}
                  {visibleColumns.report && (
                    <th className="w-20 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                      Report
                    </th>
                  )}
                  {canAssignDoctors && visibleColumns.assignDoctor && (
                    <th className="w-28 px-3 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Assign Doctor
                    </th>
                  )}
                </tr>
              </thead>
              
              {/* Excel-style Body with Alternating Colors and new order */}
              <tbody>
                {filteredStudies.length === 0 ? (
                  <tr>
                    <td colSpan="23" className="px-6 py-12 text-center text-gray-500 bg-gray-50">
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-lg font-medium">No studies found</p>
                      <p className="text-sm">Try adjusting your search or filter criteria</p>
                    </td>
                  </tr>
                ) : (
                  filteredStudies.map((study, index) => (
                    <tr 
                      key={study._id} 
                      className={`
                        ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} 
                        hover:bg-blue-100 transition-colors duration-150 border-b border-gray-200
                      `}
                    >
                      {/* Checkbox */}
                      {visibleColumns.checkbox && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <input type="checkbox" className="rounded border-gray-300" />
                        </td>
                      )}
                      
                      {/* Status */}
                      {visibleColumns.status && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="flex justify-center">
                            <StatusDot status={study.workflowStatus} priority={study.priority} />
                          </div>
                        </td>
                      )}

                      {/* Random Emoji */}
                      {visibleColumns.randomEmoji && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <RandomEmojiButton study={study} />
                        </td>
                      )}

                      {/* User */}
                      {visibleColumns.user && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <UserButton study={study} />
                        </td>
                      )}

                      {/* Download Button */}
                      {visibleColumns.downloadBtn && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <DownloadButton study={study} />
                        </td>
                      )}

                      {/* Discussion */}
                      {visibleColumns.discussion && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <DiscussionButton study={study} />
                        </td>
                      )}
                      
                      {/* Patient ID */}
                      {visibleColumns.patientId && (
                        <td className="px-3 py-3 border-r border-gray-200">
                          <button 
                            onClick={() => handlePatientClick(study.patientId)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {study.patientId}
                          </button>
                        </td>
                      )}
                      
                      {/* Patient Name */}
                      {visibleColumns.patientName && (
                        <td className="px-3 py-3 border-r border-gray-200">
                          <div className="text-sm font-medium text-gray-900">{study.patientName}</div>
                        </td>
                      )}
                      
                      {/* Age/Sex */}
                      {visibleColumns.ageGender && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="text-sm text-gray-600">{study.ageGender}</div>
                        </td>
                      )}
                      
                      {/* Description */}
                      {visibleColumns.description && (
                        <td className="px-3 py-3 border-r border-gray-200">
                          <div className="text-sm text-gray-900 truncate max-w-xs" title={study.description}>
                            {study.description}
                          </div>
                        </td>
                      )}
                      
                      {/* Series */}
                      {visibleColumns.series && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="text-sm text-gray-600">{study.seriesImages}</div>
                        </td>
                      )}
                      
                      {/* Modality */}
                      {visibleColumns.modality && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            {study.modality}
                          </span>
                        </td>
                      )}
                      
                      {/* Location */}
                      {visibleColumns.location && (
                        <td className="px-3 py-3 border-r border-gray-200">
                          <div className="text-xs text-gray-600 truncate max-w-xs" title={study.location}>
                            {study.location}
                          </div>
                        </td>
                      )}
                      
                      {/* Study Date */}
                      {visibleColumns.studyDate && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="text-xs text-gray-600">
                            <div className="font-medium">{formatDate(study.studyDateTime)}</div>
                            <div className="text-gray-500">{formatTime(study.studyDateTime)}</div>
                          </div>
                        </td>
                      )}
                      
                      {/* Upload Date */}
                      {visibleColumns.uploadDate && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="text-xs text-gray-600">
                            <div className="font-medium">{formatDate(study.uploadDateTime)}</div>
                            <div className="text-gray-500">{formatTime(study.uploadDateTime)}</div>
                          </div>
                        </td>
                      )}
                      
                      {/* Reported Date */}
                      {visibleColumns.reportedDate && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="text-xs text-gray-600">
                            <div className="font-medium">{formatDate(study.reportedDateTime)}</div>
                            <div className="text-gray-500">{formatTime(study.reportedDateTime)}</div>
                          </div>
                        </td>
                      )}
                      
                      {/* Reported By */}
                      {visibleColumns.reportedBy && (
                        <td className="px-3 py-3 border-r border-gray-200">
                          <div className="text-sm text-gray-900">{study.reportedBy || 'N/A'}</div>
                        </td>
                      )}

                      {/* Accession */}
                      {visibleColumns.accession && (
                        <td className="px-3 py-3 border-r border-gray-200">
                          <div className="text-sm text-gray-900">{study.accessionNumber || 'N/A'}</div>
                        </td>
                      )}

                      {/* Seen By */}
                      {visibleColumns.seenBy && (
                        <td className="px-3 py-3 border-r border-gray-200">
                          <div className="text-sm text-gray-900">{study.seenBy || 'Not Assigned'}</div>
                        </td>
                      )}
                      
                      {/* Actions */}
                      {visibleColumns.actions && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="flex justify-center items-center space-x-2">
                            <EyeIconOHIFButton studyInstanceUID={study.instanceID} />
                            <DownloadDropdown study={study} />
                          </div>
                        </td>
                      )}
                      
                      {/* Report */}
                      {visibleColumns.report && (
                        <td className="px-3 py-3 text-center border-r border-gray-200">
                          <div className="flex justify-center">
                            <ReportButton study={study} />
                          </div>
                        </td>
                      )}
                      
                      {/* Assign Doctor */}
                      {canAssignDoctors && visibleColumns.assignDoctor && (
                        <td className="px-3 py-3 text-center">
                          <button 
                            onClick={() => handleAssignDoctor(study)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                              study.workflowStatus === 'report_finalized' 
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                                : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                                  ? 'bg-yellow-500 text-white hover:bg-yellow-600' 
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                            disabled={study.workflowStatus === 'report_finalized'}
                          >
                            {study.workflowStatus === 'report_finalized' 
                              ? 'Completed' 
                              : study.workflowStatus === 'assigned_to_doctor' || study.workflowStatus === 'report_in_progress'
                                ? 'Reassign' 
                                : 'Assign'
                            }
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Excel-style Footer with Pagination */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <p className="text-sm text-gray-700 font-medium">
            Showing <span className="font-bold text-blue-600">{filteredStudies.length > 0 ? ((currentPage - 1) * 10) + 1 : 0}</span> to{' '}
            <span className="font-bold text-blue-600">{Math.min(currentPage * 10, totalRecords)}</span> of{' '}
            <span className="font-bold text-blue-600">{totalRecords}</span> results
          </p>
        </div>
        
        {/* Pagination Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange && onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPage === 1 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
            }`}
          >
            Previous
          </button>
          
          {/* Page Numbers */}
          <div className="flex space-x-1">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            
                            return (
                              <button
                                key={pageNum}
                                onClick={() => onPageChange && onPageChange(pageNum)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  currentPage === pageNum 
                                    ? 'bg-blue-600 text-white shadow-sm' 
                                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>
                        
                        <button
                          onClick={() => onPageChange && onPageChange(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            currentPage === totalPages 
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm'
                          }`}
                        >
                          Next
                        </button>
                      </div>
                    </div>
              
                    {/* Assignment Modal */}
                    {assignmentModalOpen && selectedStudy && (
                      <DoctorAssignmentModal
                        study={selectedStudy}
                        isOpen={assignmentModalOpen}
                        onClose={() => setAssignmentModalOpen(false)}
                        onAssignmentComplete={handleAssignmentModalComplete}
                      />
                    )}
              
                    {/* Patient Detail Modal */}
                    {patientDetailModalOpen && selectedPatientId && (
                      <PatientDetailModal
                        patientId={selectedPatientId}
                        isOpen={patientDetailModalOpen}
                        onClose={() => setPatientDetailModalOpen(false)}
                      />
                    )}
                  </div>
                );
              };
              
              export default WorklistTable;