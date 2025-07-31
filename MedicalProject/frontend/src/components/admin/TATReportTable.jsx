import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';

const TATReportTable = ({ 
  studies = [], 
  onLocationChange, 
  locations = [],
  selectedLocation,
  onModalityFilter,
  selectedModalities = [],
  onRecordsPerPageChange,
  recordsPerPage = 100 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // ✅ NEW: Modality options with combined modalities
  const modalityOptions = [
    'CT', 'MR', 'CR', 'DX', 'PR', 'US', 'XR', 'MG', 'NM', 'PT',
    'MR/SR', 'CT/SR', 'CR/SR', 'DX/SR', 'PR/MR', 'CT/MR'
  ];

  // ✅ NEW: Records per page options
  const recordOptions = [10, 25, 50, 100, 250, 500, 1000];

  // ✅ NEW: Filter and search logic
  const filteredStudies = useMemo(() => {
    let filtered = [...studies];

    // Search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(study => 
        (study.patientName || '').toLowerCase().includes(search) ||
        (study.patientId || '').toLowerCase().includes(search) ||
        (study.accessionNumber || '').toLowerCase().includes(search) ||
        (study.referredBy || '').toLowerCase().includes(search) ||
        (study.reportedBy || '').toLowerCase().includes(search) ||
        (study.studyDescription || '').toLowerCase().includes(search)
      );
    }

    // Modality filter
    if (selectedModalities.length > 0) {
      filtered = filtered.filter(study => {
        const studyModality = study.modality || '';
        return selectedModalities.some(selectedMod => {
          if (selectedMod.includes('/')) {
            // Handle combined modalities like MR/SR
            const modalityParts = selectedMod.split('/');
            return modalityParts.every(part => studyModality.includes(part));
          } else {
            return studyModality.includes(selectedMod);
          }
        });
      });
    }

    return filtered;
  }, [studies, searchTerm, selectedModalities]);

  // ✅ NEW: Pagination logic
  const totalPages = Math.ceil(filteredStudies.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const paginatedStudies = filteredStudies.slice(startIndex, startIndex + recordsPerPage);

  // ✅ NEW: Handle modality toggle
  const handleModalityToggle = (modality) => {
    const newSelection = selectedModalities.includes(modality)
      ? selectedModalities.filter(m => m !== modality)
      : [...selectedModalities, modality];
    
    onModalityFilter(newSelection);
    setCurrentPage(1); // Reset to first page when filtering
  };

  // ✅ NEW: Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // ✅ NEW: Handle records per page change
  const handleRecordsChange = (newRecordsPerPage) => {
    onRecordsPerPageChange(newRecordsPerPage);
    setCurrentPage(1); // Reset to first page
  };

  // Helper function to format date with modern style
  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return format(date, 'MMM dd, yyyy • HH:mm');
    } catch (error) {
      console.error('Date formatting error:', error);
      return '-';
    }
  };

  // Helper function to format TAT minutes to hours and minutes
  const formatTATTime = (tatString) => {
    if (!tatString || tatString === '-') return '-';
    
    // Extract minutes from string like "199 Minutes" or "4348700 Minutes"
    const minutes = parseInt(tatString.replace(/[^\d]/g, ''));
    if (isNaN(minutes) || minutes === 0) return '-';
    
    // Convert to hours and minutes
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    // Format based on duration
    if (hours === 0) {
      return `${remainingMinutes}m`;
    } else if (hours < 24) {
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      if (days < 7) {
        return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
      } else {
        const weeks = Math.floor(days / 7);
        const remainingDays = days % 7;
        return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
      }
    }
  };

  // Helper function to get TAT status color based on duration
  const getTATStatusColor = (tatString) => {
    if (!tatString || tatString === '-') return 'bg-gray-100 text-gray-700 border border-gray-200';
    
    const minutes = parseInt(tatString.replace(/[^\d]/g, ''));
    if (isNaN(minutes)) return 'bg-gray-100 text-gray-700 border border-gray-200';
    
    // Color coding based on TAT performance
    if (minutes <= 60) return 'bg-green-100 text-green-800 border border-green-200'; // ≤ 1 hour - Excellent
    if (minutes <= 240) return 'bg-blue-100 text-blue-800 border border-blue-200'; // ≤ 4 hours - Good
    if (minutes <= 480) return 'bg-yellow-100 text-yellow-800 border border-yellow-200'; // ≤ 8 hours - Fair
    if (minutes <= 1440) return 'bg-orange-100 text-orange-800 border border-orange-200'; // ≤ 24 hours - Delayed
    return 'bg-red-100 text-red-800 border border-red-200'; // > 24 hours - Critical
  };

  // Helper to handle potentially missing data
  const safeValue = (value, defaultVal = '-') => {
    return value || defaultVal;
  };

  // Helper to get status color for study status
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'final_report_downloaded':
      case 'report_finalized':
      case 'completed':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'report_in_progress':
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'assigned_to_doctor':
      case 'assigned':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'pending_assignment':
      case 'pending':
        return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'new_study_received':
      case 'new':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border border-gray-200';
    }
  };

  // Helper to format study date with relative info
  const formatStudyDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = now - date;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return `Today • ${format(date, 'HH:mm')}`;
      } else if (diffDays === 1) {
        return `Yesterday • ${format(date, 'HH:mm')}`;
      } else if (diffDays < 7) {
        return `${diffDays}d ago • ${format(date, 'HH:mm')}`;
      } else {
        return format(date, 'MMM dd • HH:mm');
      }
    } catch (error) {
      return '-';
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* ✅ NEW: Enhanced Header with Filters */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              TAT Performance Report
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Showing {paginatedStudies.length} of {filteredStudies.length} studies 
              {filteredStudies.length !== studies.length && ` (filtered from ${studies.length} total)`}
            </p>
          </div>

          {/* ✅ NEW: Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            {/* Location Search Dropdown */}
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => onLocationChange(e.target.value)}
                className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Locations</option>
                {locations.map(location => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Records Per Page */}
            <select
              value={recordsPerPage}
              onChange={(e) => handleRecordsChange(parseInt(e.target.value))}
              className="w-full sm:w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {recordOptions.map(option => (
                <option key={option} value={option}>{option} records</option>
              ))}
            </select>
          </div>
        </div>

        {/* ✅ NEW: Search and Modality Filters */}
        <div className="mt-4 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by patient name, ID, accession number, referring doctor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Modality Filter */}
          <div>
            <div className="flex items-center mb-2">
              <span className="text-sm font-medium text-gray-700 mr-3">Filter by Modality:</span>
              {selectedModalities.length > 0 && (
                <button
                  onClick={() => onModalityFilter([])}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {modalityOptions.map(modality => (
                <button
                  key={modality}
                  onClick={() => handleModalityToggle(modality)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedModalities.includes(modality)
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {modality}
                  {selectedModalities.includes(modality) && (
                    <span className="ml-1">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ EXISTING: Table remains the same, but uses paginatedStudies */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse table-auto text-xs min-w-[1200px]">
          <thead>
            <tr className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
              {/* Increased padding (px-3 py-4), removed fixed widths, simplified headers */}
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Status <span className="block text-xs text-gray-300 font-normal">Current</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Patient ID <span className="block text-xs text-gray-300 font-normal">Identifier</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Patient Name <span className="block text-xs text-gray-300 font-normal">Full Name</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-center uppercase tracking-wider font-semibold">
                Sex <span className="block text-xs text-gray-300 font-normal">M/F</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Referred By <span className="block text-xs text-gray-300 font-normal">Doctor</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Acc Number <span className="block text-xs text-gray-300 font-normal">Reference</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Study Type <span className="block text-xs text-gray-300 font-normal">Description</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-center uppercase tracking-wider font-semibold">
                Modality <span className="block text-xs text-gray-300 font-normal">Type</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-center uppercase tracking-wider font-semibold">
                S/I Count <span className="block text-xs text-gray-300 font-normal">Series</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Institution <span className="block text-xs text-gray-300 font-normal">Facility</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Study Date <span className="block text-xs text-gray-300 font-normal">Performed</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Upload Date <span className="block text-xs text-gray-300 font-normal">Received</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Assign Date <span className="block text-xs text-gray-300 font-normal">To Doctor</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Report Date <span className="block text-xs text-gray-300 font-normal">Completed</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-center uppercase tracking-wider font-semibold">
                <span className="text-blue-300">S-R TAT</span> <span className="block text-xs text-gray-300 font-normal">Upload→Assignement</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-center uppercase tracking-wider font-semibold">
                <span className="text-blue-300">S-R TAT</span> <span className="block text-xs text-gray-300 font-normal">Study→Report</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-center uppercase tracking-wider font-semibold">
                <span className="text-green-300">U-R TAT</span> <span className="block text-xs text-gray-300 font-normal">Upload→Report</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-center uppercase tracking-wider font-semibold">
                <span className="text-purple-300">A-R TAT</span> <span className="block text-xs text-gray-300 font-normal">Assign→Report</span>
              </th>
              <th className="border-r border-gray-600 px-3 py-4 text-left uppercase tracking-wider font-semibold">
                Reported By <span className="block text-xs text-gray-300 font-normal">Doctor</span>
              </th>
              <th className="px-3 py-4 text-center uppercase tracking-wider font-semibold">
                Actions <span className="block text-xs text-gray-300 font-normal">Download</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {paginatedStudies.length > 0 ? (
              paginatedStudies.map((study, index) => (
                <tr 
                  key={study._id || index} 
                  className={`hover:bg-blue-50 transition-colors duration-150 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  {/* Increased padding for td cells (px-3 py-3) */}
                  <td className="border-r border-gray-100 px-3 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${getStatusColor(study.studyStatus)}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current mr-1.5"></div>
                      {safeValue(study.studyStatus)
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                        .substring(0, 15)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-[120px]" title={safeValue(study.patientId)}>
                      {safeValue(study.patientId)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-[150px]" title={safeValue(study.patientName)}>
                      {safeValue(study.patientName)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                      study.gender === 'M' ? 'bg-blue-100 text-blue-800' : 
                      study.gender === 'F' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {safeValue(study.gender)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3">
                    <div className="text-gray-700 truncate max-w-[120px]" title={safeValue(study.referredBy)}>
                      {safeValue(study.referredBy)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3">
                    <div className="font-mono text-gray-700 text-xs truncate max-w-[100px]" title={safeValue(study.accessionNumber)}>
                      {safeValue(study.accessionNumber)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3">
                    <div className="text-gray-700 truncate max-w-[150px]" title={safeValue(study.studyDescription)}>
                      {safeValue(study.studyDescription)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-800">
                      {safeValue(study.modality)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                    <span className="font-mono text-xs text-gray-600">
                      {safeValue(study.series_Images)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3">
                    <div className="text-gray-700 text-xs truncate max-w-[150px]" title={safeValue(study.institutionName)}>
                      {safeValue(study.institutionName)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {study.billedOnStudyDate}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {study.uploadDate}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {study.assignedDate}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {study.reportDate ? formatDateTime(study.reportDate) : '-'}
                    </div>
                  </td>

                  <td className="border-r border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTATStatusColor(study.diffStudyAndReportTAT)}`}>
                      {study.fullTatDetails.uploadToAssignmentTAT

                      }
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTATStatusColor(study.diffStudyAndReportTAT)}`}>
                      {study.fullTatDetails.studyToReportTATFormatted
                      }
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTATStatusColor(study.diffUploadAndReportTAT)}`}>
                      {study.fullTatDetails.uploadToReportTATFormatted}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTATStatusColor(study.diffAssignAndReportTAT)}`}>
                      {/* {formatTATTime(study.diffAssignAndReportTAT)} */}
                      {study.fullTatDetails.assignmentToReportTATFormatted

                      }
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-3 py-3">
                    <div className="text-gray-700 text-xs truncate max-w-[120px]" title={safeValue(study.reportedBy)}>
                      {safeValue(study.reportedBy)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button 
                      className="inline-flex items-center justify-center w-8 h-8 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 hover:scale-105 transition-all duration-150 group"
                      title="Download Report"
                      onClick={() => console.log('Download report for study:', study._id)}
                    >
                      <svg className="w-4 h-4 group-hover:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="19" className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-medium text-gray-500">
                        {searchTerm || selectedModalities.length > 0 
                          ? 'No studies match your search criteria' 
                          : 'No TAT data available'
                        }
                      </p>
                      <p className="text-sm text-gray-400">
                        {searchTerm || selectedModalities.length > 0 
                          ? 'Try adjusting your search terms or filters' 
                          : 'Adjust your date range or filters to see results'
                        }
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ NEW: Enhanced Pagination Footer */}
      {filteredStudies.length > 0 && (
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 px-4 py-3">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            {/* Left: Record Info */}
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>
                Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                <span className="font-semibold">{Math.min(startIndex + recordsPerPage, filteredStudies.length)}</span> of{' '}
                <span className="font-semibold">{filteredStudies.length}</span> studies
              </span>
              
              {/* Modality Legend */}
              <div className="flex items-center space-x-2 text-xs">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                  <span className="text-gray-600">≤1h</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                  <span className="text-gray-600">≤4h</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>
                  <span className="text-gray-600">≤8h</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mr-1"></div>
                  <span className="text-gray-600">≤24h</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
                  <span className="text-gray-600">24h</span>
                </div>
              </div>
            </div>

            {/* Right: Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                {/* Page Numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
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
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-1 text-sm font-medium rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}

            {/* Last Updated */}
            <div className="text-xs text-gray-500 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Last updated: {format(new Date(), 'MMM dd, yyyy • HH:mm')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TATReportTable;