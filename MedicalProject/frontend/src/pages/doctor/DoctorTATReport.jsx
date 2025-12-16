// frontend/src/pages/doctor/DoctorTATReport.jsx
import React, { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import AdminNavbar from '../../components/layout/AdminNavbar';
import api from '../../services/api';

const DoctorTATReport = () => {
  const { currentUser } = useAuth();
  
  // State management
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedModalities, setSelectedModalities] = useState([]);
  const [recordsPerPage, setRecordsPerPage] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Date filters
  const [dateType, setDateType] = useState('uploadDate');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const modalityOptions = [
    'CT', 'MR', 'CR', 'DX', 'PR', 'US', 'XR', 'MG', 'NM', 'PT',
    'MR/SR', 'CT/SR', 'CR/SR', 'DX/SR', 'PR/MR', 'CT/MR'
  ];

  const recordOptions = [25, 50, 100, 250, 500];

  const safeValue = useCallback((value, defaultVal = '-') => {
    if (value === null || value === undefined || value === '') return defaultVal;
    return String(value);
  }, []);

  const getTATStatusColor = useCallback((tatValue) => {
    if (!tatValue || tatValue === '-' || tatValue === null || tatValue === undefined) {
      return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
    
    const numericTAT = parseFloat(tatValue);
    
    if (isNaN(numericTAT)) return 'bg-gray-100 text-gray-700 border border-gray-200';
    
    if (numericTAT <= 1) return 'bg-green-100 text-green-800 border border-green-200';
    if (numericTAT <= 4) return 'bg-blue-100 text-blue-800 border border-blue-200';
    if (numericTAT <= 8) return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
    if (numericTAT <= 24) return 'bg-orange-100 text-orange-800 border border-orange-200';
    return 'bg-red-100 text-red-800 border border-red-200';
  }, []);

  const getStatusColor = useCallback((status) => {
    const statusString = status ? String(status).toLowerCase() : '';
    
    switch (statusString) {
      case 'final_report_downloaded':
      case 'report_finalized':
      case 'report_uploaded':
      case 'completed':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'report_in_progress':
      case 'doctor_opened_report':
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
  }, []);

  const formatDateTime = useCallback((dateValue) => {
    if (!dateValue || dateValue === '-') return '-';
    
    try {
      const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'MMM dd, yyyy • HH:mm');
    } catch (error) {
      return '-';
    }
  }, []);

  const filteredStudies = useMemo(() => {
    let filtered = [...studies];

    // Search term filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(study => 
        (study.patientName || '').toLowerCase().includes(search) ||
        (study.patientID || '').toLowerCase().includes(search) ||
        (study.studyDescription || '').toLowerCase().includes(search) ||
        (study.labName || '').toLowerCase().includes(search)
      );
    }

    // Modality filter
    if (selectedModalities.length > 0) {
      filtered = filtered.filter(study => {
        const studyModality = study.modality || '';
        return selectedModalities.some(selectedMod => {
          if (selectedMod.includes('/')) {
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

  const handleModalityToggle = useCallback((modality) => {
    const newSelection = selectedModalities.includes(modality)
      ? selectedModalities.filter(m => m !== modality)
      : [...selectedModalities, modality];
    
    setSelectedModalities(newSelection);
    setCurrentPage(1);
  }, [selectedModalities]);

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
  }, []);

  // Fetch TAT data
  const fetchTATData = useCallback(async () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both From Date and To Date');
      return;
    }

    setLoading(true);
    
    try {
      const params = {
        dateType,
        fromDate,
        toDate
      };

      if (selectedModalities.length > 0) {
        params.modality = selectedModalities.join(',');
      }

      const response = await api.get('/doctor/tat/report', { params });

      if (response.data.success) {
        setStudies(response.data.data);
        setCurrentPage(1);
        toast.success(`Loaded ${response.data.count} studies`);
      }
    } catch (error) {
      console.error('❌ Error fetching TAT data:', error);
      toast.error(error.response?.data?.message || 'Failed to load TAT data');
    } finally {
      setLoading(false);
    }
  }, [dateType, fromDate, toDate, selectedModalities]);

  // Export function
  const exportToExcel = useCallback(async () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both From Date and To Date');
      return;
    }

    if (filteredStudies.length === 0) {
      toast.error('No data to export');
      return;
    }

    setLoading(true);
    
    try {
      const params = {
        dateType,
        fromDate,
        toDate
      };

      if (selectedModalities.length > 0) {
        params.modality = selectedModalities.join(',');
      }

      const response = await api.get('/doctor/tat/report/export', { 
        params,
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Doctor_TAT_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Excel report downloaded successfully!');
    } catch (error) {
      console.error('❌ Export failed:', error);
      toast.error('Failed to export Excel report');
    } finally {
      setLoading(false);
    }
  }, [dateType, fromDate, toDate, selectedModalities, filteredStudies.length]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredStudies.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const paginatedStudies = filteredStudies.slice(startIndex, startIndex + recordsPerPage);

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <AdminNavbar />
      
      {/* Header section */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900">TAT Performance Report - Doctor</h1>
            <p className="text-xs text-gray-600">
              {loading ? (
                <span className="text-emerald-600">🔄 Loading studies...</span>
              ) : (
                <>
                  Showing <span className="font-semibold">{paginatedStudies.length}</span> of{' '}
                  <span className="font-semibold">{filteredStudies.length}</span> studies
                  {filteredStudies.length !== studies.length && (
                    <span className="text-gray-500">
                      {' '}(filtered from <span className="font-semibold">{studies.length}</span> total)
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          
          {/* TAT Legend */}
          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={exportToExcel}
              disabled={loading || filteredStudies.length === 0}
              className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed mr-4"
              title="Export current filtered data to Excel"
            >
              {loading ? '...' : '📊 Export'}
            </button>
            
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
              <span>≤1h</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
              <span>≤4h</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>
              <span>≤8h</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-orange-500 rounded-full mr-1"></div>
              <span>≤24h</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-1"></div>
              <span>24h</span>
            </div>
          </div>
        </div>

        {/* All filters in one row */}
        <div className="grid grid-cols-12 gap-1 items-end mb-2">
          {/* Date Type */}
          <div className="col-span-1">
            <select
              value={dateType}
              onChange={(e) => setDateType(e.target.value)}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-emerald-500"
            >
              <option value="uploadDate">Upload</option>
              <option value="studyDate">Study</option>
            </select>
          </div>

          {/* From Date */}
          <div className="col-span-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* To Date */}
          <div className="col-span-2">
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Records */}
          <div className="col-span-1">
            <select
              value={recordsPerPage}
              onChange={(e) => {
                setRecordsPerPage(parseInt(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-emerald-500"
            >
              {recordOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="col-span-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by Patient ID, Name, Lab..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-5 pr-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-emerald-500"
              />
              <svg className="w-3 h-3 text-gray-400 absolute left-1 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Generate Button */}
          <div className="col-span-2">
            <button
              onClick={fetchTATData}
              disabled={loading}
              className="w-full px-1 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>

        {/* Modality filters */}
        <div className="flex flex-wrap gap-1">
          {modalityOptions.map(modality => (
            <button
              key={modality}
              onClick={() => handleModalityToggle(modality)}
              className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                selectedModalities.includes(modality)
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {modality}
            </button>
          ))}
          {selectedModalities.length > 0 && (
            <button
              onClick={() => setSelectedModalities([])}
              className="px-1.5 py-0.5 rounded text-xs text-red-600 hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse table-auto text-xs">
          <thead className="sticky top-0 z-10">
  <tr className="bg-gradient-to-r from-orange-700 to-orange-800 text-white">
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">STATUS</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[70px]">PATIENT ID</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[120px]">PATIENT NAME</th>
    <th className="border-r border-orange-600 px-1 py-2 text-center text-xs font-semibold w-[30px]">SEX</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[120px]">STUDY DESCRIPTION</th>
    <th className="border-r border-orange-600 px-1 py-2 text-center text-xs font-semibold w-[50px]">MODALITY</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">STUDY DATE</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[60px]">STUDY TIME</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">UPLOAD DATE</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[100px]">DOCTOR</th>
    <th className="border-r border-orange-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">REPORT DATE</th>
    <th className="border-r border-orange-600 px-1 py-2 text-center text-xs font-semibold min-w-[80px]">UPLOAD→REPORT</th>
    <th className="border-r border-orange-600 px-1 py-2 text-center text-xs font-semibold min-w-[80px]">STUDY→REPORT</th>
    <th className="border-r border-orange-600 px-1 py-2 text-center text-xs font-semibold min-w-[90px]">ASSIGN→REPORT</th>
    <th className="px-1 py-2 text-center text-xs font-semibold min-w-[70px]">TOTAL TAT</th>
    <th className="px-1 py-2 text-center text-xs font-semibold min-w-[70px]">Reported By</th>
  </tr>
</thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedStudies.length > 0 ? (
              paginatedStudies.map((study, index) => (
                <tr 
                  key={study._id || index} 
                  className={`hover:bg-emerald-50 transition-colors duration-150 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1 py-0.5 text-xs font-medium rounded-full ${getStatusColor(study.workflowStatus)}`}>
                      <div className="w-1 h-1 rounded-full bg-current mr-1"></div>
                      {safeValue(study.workflowStatus)
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                        .substring(0, 10)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="font-medium text-gray-900 truncate max-w-[70px]" title={safeValue(study.patientID)}>
                      {safeValue(study.patientID)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="font-medium text-gray-900 truncate max-w-[120px]" title={safeValue(study.patientName)}>
                      {safeValue(study.patientName)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-semibold ${
                      study.gender === 'M' ? 'bg-blue-100 text-blue-800' : 
                      study.gender === 'F' ? 'bg-pink-100 text-pink-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {safeValue(study.gender)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="text-gray-700 truncate max-w-[120px]" title={safeValue(study.studyDescription)}>
                      {safeValue(study.studyDescription)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-1 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                      {safeValue(study.modalitiesInStudy)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="text-gray-700 text-xs truncate max-w-[100px]" title={safeValue(study.labName)}>
                      {safeValue(study.labName)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {safeValue(study.studyDate)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {safeValue(study.studyTime)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {safeValue(study.uploadedAt)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {safeValue(study.reportUploadedAt)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
  <span className="inline-flex items-center px-1 py-0.5 text-xs font-medium rounded bg-blue-50 text-blue-700">
    {safeValue(study.uploadToReportTAT)}
  </span>
</td>
<td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
  <span className="inline-flex items-center px-1 py-0.5 text-xs font-medium rounded bg-purple-50 text-purple-700">
    {safeValue(study.studyToReportTAT)}
  </span>
</td>
<td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
  <span className="inline-flex items-center px-1 py-0.5 text-xs font-medium rounded bg-indigo-50 text-indigo-700">
    {safeValue(study.assignmentToReportTAT)}
  </span>
</td>
<td className="px-1 py-1 text-center whitespace-nowrap">
  <span className="inline-flex items-center px-1 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-800">
    {safeValue(study.totalTATFormatted)}
  </span>
</td>
                  <td className="px-1 py-1">
                    <div className="text-gray-700 text-xs truncate max-w-[100px]" title={safeValue(study.reportUploadedBy)}>
                      {safeValue(study.reportUploadedBy)}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="12" className="px-4 py-8 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        {searchTerm || selectedModalities.length > 0 
                          ? 'No studies match your search criteria' 
                          : 'No TAT data available'
                        }
                      </p>
                      <p className="text-xs text-gray-400">
                        {searchTerm || selectedModalities.length > 0 
                          ? 'Try adjusting your search terms or filters' 
                          : 'Select a date range and click Generate Report'
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

      {/* Pagination footer */}
      {filteredStudies.length > 0 && (
        <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-2 py-1">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              Showing <span className="font-semibold">{startIndex + 1}</span>-
              <span className="font-semibold">{Math.min(startIndex + recordsPerPage, filteredStudies.length)}</span> of{' '}
              <span className="font-semibold">{filteredStudies.length}</span>
            </span>

            {totalPages > 1 && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-1 py-0.5 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage <= 2) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 1) {
                      pageNum = totalPages - 2 + i;
                    } else {
                      pageNum = currentPage - 1 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-1 py-0.5 text-xs font-medium rounded ${
                          currentPage === pageNum
                            ? 'bg-emerald-500 text-white'
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
                  className="px-1 py-0.5 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            )}

            <span className="flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {format(new Date(), 'HH:mm')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorTATReport;