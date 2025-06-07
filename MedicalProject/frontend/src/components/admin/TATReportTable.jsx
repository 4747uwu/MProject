import React from 'react';
import { format } from 'date-fns';

const TATReportTable = ({ studies = [] }) => {
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
    if (!tatString || tatString === '-') return 'text-gray-500';
    
    const minutes = parseInt(tatString.replace(/[^\d]/g, ''));
    if (isNaN(minutes)) return 'text-gray-500';
    
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

  // Helper to get status color
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
      {/* Enhanced Table Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              TAT Performance Report
            </h3>
            <p className="text-sm text-gray-600 mt-1">Turnaround Time Analysis & Study Status</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{studies.length}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Total Records</div>
          </div>
        </div>
      </div>

      {/* Enhanced Table Container */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse table-fixed text-xs">
          <thead>
            <tr className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[5%]">
                <div className="flex flex-col">
                  <span>Status</span>
                  <span className="text-xs text-gray-300 font-normal">Current</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[6%]">
                <div className="flex flex-col">
                  <span>Patient ID</span>
                  <span className="text-xs text-gray-300 font-normal">Identifier</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[8%]">
                <div className="flex flex-col">
                  <span>Patient Name</span>
                  <span className="text-xs text-gray-300 font-normal">Full Name</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-center uppercase tracking-wider font-semibold w-[3%]">
                <div className="flex flex-col">
                  <span>Sex</span>
                  <span className="text-xs text-gray-300 font-normal">M/F</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[6%]">
                <div className="flex flex-col">
                  <span>Referred By</span>
                  <span className="text-xs text-gray-300 font-normal">Doctor</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[5%]">
                <div className="flex flex-col">
                  <span>Acc Number</span>
                  <span className="text-xs text-gray-300 font-normal">Reference</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[7%]">
                <div className="flex flex-col">
                  <span>Study Type</span>
                  <span className="text-xs text-gray-300 font-normal">Description</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-center uppercase tracking-wider font-semibold w-[4%]">
                <div className="flex flex-col">
                  <span>Modality</span>
                  <span className="text-xs text-gray-300 font-normal">Type</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-center uppercase tracking-wider font-semibold w-[4%]">
                <div className="flex flex-col">
                  <span>S/I Count</span>
                  <span className="text-xs text-gray-300 font-normal">Series</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[7%]">
                <div className="flex flex-col">
                  <span>Institution</span>
                  <span className="text-xs text-gray-300 font-normal">Facility</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[8%]">
                <div className="flex flex-col">
                  <span>Study Date</span>
                  <span className="text-xs text-gray-300 font-normal">Performed</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[8%]">
                <div className="flex flex-col">
                  <span>Upload Date</span>
                  <span className="text-xs text-gray-300 font-normal">Received</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[8%]">
                <div className="flex flex-col">
                  <span>Assign Date</span>
                  <span className="text-xs text-gray-300 font-normal">To Doctor</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[8%]">
                <div className="flex flex-col">
                  <span>Report Date</span>
                  <span className="text-xs text-gray-300 font-normal">Completed</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-center uppercase tracking-wider font-semibold w-[5%]">
                <div className="flex flex-col">
                  <span className="text-blue-300">S-R TAT</span>
                  <span className="text-xs text-gray-300 font-normal">Study→Report</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-center uppercase tracking-wider font-semibold w-[5%]">
                <div className="flex flex-col">
                  <span className="text-green-300">U-R TAT</span>
                  <span className="text-xs text-gray-300 font-normal">Upload→Report</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-center uppercase tracking-wider font-semibold w-[5%]">
                <div className="flex flex-col">
                  <span className="text-purple-300">A-R TAT</span>
                  <span className="text-xs text-gray-300 font-normal">Assign→Report</span>
                </div>
              </th>
              <th className="border-r border-gray-600 px-2 py-3 text-left uppercase tracking-wider font-semibold w-[6%]">
                <div className="flex flex-col">
                  <span>Reported By</span>
                  <span className="text-xs text-gray-300 font-normal">Doctor</span>
                </div>
              </th>
              <th className="px-2 py-3 text-center uppercase tracking-wider font-semibold w-[4%]">
                <div className="flex flex-col">
                  <span>Actions</span>
                  <span className="text-xs text-gray-300 font-normal">Download</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {studies.length > 0 ? (
              studies.map((study, index) => (
                <tr 
                  key={study._id || index} 
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors duration-150 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  <td className="border-r border-gray-100 px-2 py-3">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(study.studyStatus)}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current mr-1.5"></div>
                      {safeValue(study.studyStatus)
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                        .substring(0, 15)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="font-medium text-gray-900 truncate" title={safeValue(study.patientId)}>
                      {safeValue(study.patientId)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="font-medium text-gray-900 truncate" title={safeValue(study.patientName)}>
                      {safeValue(study.patientName)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                      study.gender === 'M' ? 'bg-blue-100 text-blue-800' : 
                      study.gender === 'F' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {safeValue(study.gender)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="text-gray-700 truncate" title={safeValue(study.referredBy)}>
                      {safeValue(study.referredBy)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="font-mono text-gray-700 truncate text-xs" title={safeValue(study.accessionNumber)}>
                      {safeValue(study.accessionNumber)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="text-gray-700 truncate" title={safeValue(study.studyDescription)}>
                      {safeValue(study.studyDescription)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3 text-center">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-800">
                      {safeValue(study.modality)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3 text-center">
                    <span className="font-mono text-xs text-gray-600">
                      {safeValue(study.series_Images)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="text-gray-700 truncate text-xs" title={safeValue(study.institutionName)}>
                      {safeValue(study.institutionName)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="font-mono text-xs text-gray-700">
                      {study.billedOnStudyDate ? formatStudyDate(study.billedOnStudyDate) : '-'}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="font-mono text-xs text-gray-700">
                      {study.uploadDate ? formatDateTime(study.uploadDate) : '-'}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="font-mono text-xs text-gray-700">
                      {study.assignedDate ? formatDateTime(study.assignedDate) : '-'}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="font-mono text-xs text-gray-700">
                      {study.reportDate ? formatDateTime(study.reportDate) : '-'}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTATStatusColor(study.diffStudyAndReportTAT)}`}>
                      {formatTATTime(study.diffStudyAndReportTAT)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTATStatusColor(study.diffUploadAndReportTAT)}`}>
                      {formatTATTime(study.diffUploadAndReportTAT)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTATStatusColor(study.diffAssignAndReportTAT)}`}>
                      {formatTATTime(study.diffAssignAndReportTAT)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-2 py-3">
                    <div className="text-gray-700 truncate text-xs" title={safeValue(study.reportedBy)}>
                      {safeValue(study.reportedBy)}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center">
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-medium text-gray-500">No TAT data available</p>
                      <p className="text-sm text-gray-400">Adjust your date range or filters to see results</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Enhanced Table Footer */}
      {studies.length > 0 && (
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                <span className="font-semibold">{studies.length}</span> {studies.length === 1 ? 'record' : 'records'} displayed
              </div>
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