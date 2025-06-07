import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import UniversalNavbar from '../components/layout/AdminNavbar';
import TATReportTable from '../components/admin/TATReportTable';
import api from '../services/api';

const TATReportPage = () => {
  // State for filters and data
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [dateTypeOptions, setDateTypeOptions] = useState([
    { value: 'studyDate', label: 'Study Date' },
    { value: 'uploadDate', label: 'Upload Date' },
    { value: 'assignedDate', label: 'Assigned Date' },
    { value: 'reportDate', label: 'Report Date' }
  ]);
  
  // Filter states
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDateType, setSelectedDateType] = useState('studyDate');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [fromDate, setFromDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Summary data
  const [summary, setSummary] = useState({
    totalStudies: 0,
    averageStudyToReport: 0,
    averageUploadToReport: 0,
    averageAssignToReport: 0
  });

  // Define fetchTATData outside useEffect using useCallback
  const fetchTATData = useCallback(async () => {
    if (!selectedLocation) return;
    
    setLoading(true);
    try {
      const response = await api.get('/reports/tat', {
        params: {
          location: selectedLocation,
          dateType: selectedDateType,
          fromDate,
          toDate,
          status: selectedStatus
        }
      });
      console.log('TAT Report Data:', response.data);
      
      if (response.data.success) {
        setStudies(response.data.studies || []);
        setSummary({
          totalStudies: response.data.summary?.totalStudies || 0,
          averageStudyToReport: response.data.summary?.averageStudyToReport || 0,
          averageUploadToReport: response.data.summary?.averageUploadToReport || 0,
          averageAssignToReport: response.data.summary?.averageAssignToReport || 0
        });
      } else {
        toast.error(response.data.message || 'Failed to load TAT data');
        setStudies([]);
        setSummary({
          totalStudies: 0,
          averageStudyToReport: 0,
          averageUploadToReport: 0,
          averageAssignToReport: 0
        });
      }
    } catch (error) {
      console.error('Error fetching TAT data:', error);
      toast.error('Failed to load TAT report');
      setStudies([]);
      setSummary({
        totalStudies: 0,
        averageStudyToReport: 0,
        averageUploadToReport: 0,
        averageAssignToReport: 0
      });
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedDateType, selectedStatus, fromDate, toDate]);

  // Load locations and statuses on component mount
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [locationsResponse, statusesResponse] = await Promise.all([
          api.get('/reports/locations'),
          api.get('/reports/statuses')
        ]);
        
        setLocations(locationsResponse.data.locations || []);
        setStatuses(statusesResponse.data.statuses || []);
        
        // Set default location if available
        if (locationsResponse.data.locations?.length > 0) {
          setSelectedLocation(locationsResponse.data.locations[0].value);
        }
      } catch (error) {
        console.error('Error fetching master data:', error);
        toast.error('Failed to load locations and statuses');
      }
    };
    
    fetchMasterData();
  }, []);

  // Fetch TAT report data when filters change
  useEffect(() => {
    fetchTATData();
  }, [fetchTATData]);

  // Handle search with current filters
  const handleSearch = () => {
    fetchTATData();
  };

  // Handle clear filters
  const handleClear = () => {
    if (locations.length > 0) {
      setSelectedLocation(locations[0].value);
    } else {
      setSelectedLocation('');
    }
    setSelectedDateType('studyDate');
    setSelectedStatus('');
    setFromDate(format(new Date(), 'yyyy-MM-dd'));
    setToDate(format(new Date(), 'yyyy-MM-dd'));
  };

  // Export report as CSV/Excel
  const handleExport = async () => {
    try {
      const response = await api.get('/reports/tat/export', {
        params: {
          location: selectedLocation,
          dateType: selectedDateType,
          fromDate,
          toDate,
          status: selectedStatus
        },
        responseType: 'blob' // Important for binary downloads
      });
      
      // Create a download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `TAT_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting TAT report:', error);
      toast.error('Failed to export report');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <UniversalNavbar />
      
      {/* Header */}
      <div className="bg-gray-600 text-white py-4 mt-2 rounded-t-lg shadow-md">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold">OVERALL TAT REPORT</h1>
        </div>
      </div>
      
      {/* Filter Section */}
      <div className="bg-white border-b border-gray-200 py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Location Filter */}
            <div className="flex items-center">
              <label className="mr-2 text-sm font-medium text-gray-700">
                Location <span className="text-red-500">*</span>
              </label>
              <select
                className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                {locations.map((location) => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Date Type */}
            <div>
              <select
                className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                value={selectedDateType}
                onChange={(e) => setSelectedDateType(e.target.value)}
              >
                {dateTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* From Date */}
            <div>
              <input
                type="date"
                className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            
            {/* To Date */}
            <div>
              <input
                type="date"
                className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            
            {/* Status */}
            <div>
              <select
                className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="">SELECT STATUS</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Additional Filters (Can be added as needed) */}
            <div>
              <select
                className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
                defaultValue=""
              >
                <option value="">SELECT</option>
                <option value="option1">Option 1</option>
                <option value="option2">Option 2</option>
              </select>
            </div>
            
            {/* Action Buttons */}
            <div className="ml-auto flex gap-2">
              <button
                onClick={handleSearch}
                className="bg-blue-900 text-white px-4 py-2 rounded flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                SEARCH
              </button>
              <button
                onClick={handleClear}
                className="bg-red-500 text-white px-4 py-2 rounded flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                CLEAR
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Report Content */}
      <div className="container mx-auto px-4 py-6 max-w-full">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            
            
            {/* Result Table */}
            <div className="bg-white rounded shadow overflow-x-auto max-w-full">
              <TATReportTable studies={studies} />
            </div>
            
            {/* Footer Actions */}
            <div className="flex justify-end mt-4 gap-2">
              <button
                onClick={() => window.close()}
                className="bg-gray-700 text-white px-6 py-2 rounded flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
              <button
                onClick={handleExport}
                className="bg-teal-500 text-white px-6 py-2 rounded flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                EXPORT
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TATReportPage;