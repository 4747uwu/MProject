import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import UniversalNavbar from '../components/layout/AdminNavbar';
import api from '../services/api';

const TATReport = () => {
  const { currentUser } = useAuth();
  
  // State management
  const [studies, setStudies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [doctors, setDoctors] = useState([]); // 🆕 NEW
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState(''); // 🆕 NEW
  const [selectedModalities, setSelectedModalities] = useState([]);
  const [recordsPerPage, setRecordsPerPage] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Date filters
  const [dateType, setDateType] = useState('uploadDate');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // ✅ NEW: Searchable location dropdown state
  const [locationSearchTerm, setLocationSearchTerm] = useState('');
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef(null);

  // 🆕 NEW: Searchable doctor dropdown state
  const [doctorSearchTerm, setDoctorSearchTerm] = useState('');
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false);
  const doctorDropdownRef = useRef(null);

  // ✅ COMPACT: Modality options
  const modalityOptions = [
    'CT', 'MR', 'CR', 'DX', 'PR', 'US', 'XR', 'MG', 'NM', 'PT',
    'MR/SR', 'CT/SR', 'CR/SR', 'DX/SR', 'PR/MR', 'CT/MR'
  ];

  const recordOptions = [25, 50, 100, 250, 500];

  // Fetch locations
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await api.get('/tat/locations');
        if (response.data.success) {
          setLocations(response.data.locations);
        }
      } catch (error) {
        console.error('❌ Error fetching locations:', error);
        toast.error('Failed to load locations');
      }
    };
    fetchLocations();
  }, []);

  // 🆕 NEW: Fetch doctors
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const response = await api.get('/tat/doctors');
        if (response.data.success) {
          setDoctors(response.data.doctors);
        }
      } catch (error) {
        console.error('❌ Error fetching doctors:', error);
        toast.error('Failed to load doctors');
      }
    };
    fetchDoctors();
  }, []);

  // ✅ NEW: Filtered locations based on search
  const filteredLocations = useMemo(() => {
    if (!locationSearchTerm.trim()) return locations;
    
    const search = locationSearchTerm.toLowerCase();
    return locations.filter(location => 
      location.label.toLowerCase().includes(search) ||
      location.value.toLowerCase().includes(search)
    );
  }, [locations, locationSearchTerm]);

  // 🆕 NEW: Filtered doctors based on search
  const filteredDoctors = useMemo(() => {
    if (!doctorSearchTerm.trim()) return doctors;
    
    const search = doctorSearchTerm.toLowerCase();
    return doctors.filter(doctor => 
      doctor.label.toLowerCase().includes(search) ||
      (doctor.specialization && doctor.specialization.toLowerCase().includes(search)) ||
      (doctor.email && doctor.email.toLowerCase().includes(search))
    );
  }, [doctors, doctorSearchTerm]);

  // ✅ NEW: Handle location selection
  const handleLocationSelect = (location) => {
    setSelectedLocation(location ? location.value : '');
    setLocationSearchTerm(location ? location.label : '');
    setIsLocationDropdownOpen(false);
  };

  // 🆕 NEW: Handle doctor selection
  const handleDoctorSelect = (doctor) => {
    setSelectedDoctor(doctor ? doctor.value : '');
    setDoctorSearchTerm(doctor ? doctor.label : '');
    setIsDoctorDropdownOpen(false);
    setCurrentPage(1); // 🔧 ADDED: Reset to first page when doctor changes
  };

  // ✅ NEW: Handle search input
  const handleLocationSearchChange = (e) => {
    const value = e.target.value;
    setLocationSearchTerm(value);
    setIsLocationDropdownOpen(true);
    
    // Clear selection if search doesn't match current selection
    if (selectedLocation && !value) {
      setSelectedLocation('');
    }
  };

  // 🆕 NEW: Handle doctor search input
  const handleDoctorSearchChange = (e) => {
    const value = e.target.value;
    setDoctorSearchTerm(value);
    setIsDoctorDropdownOpen(true);
    
    // Clear selection if search doesn't match current selection
    if (selectedDoctor && !value) {
      setSelectedDoctor('');
    }
  };

  // ✅ NEW: Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target)) {
        setIsLocationDropdownOpen(false);
      }
      if (doctorDropdownRef.current && !doctorDropdownRef.current.contains(event.target)) {
        setIsDoctorDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ✅ NEW: Set initial search term when location is selected externally
  useEffect(() => {
    if (selectedLocation) {
      const location = locations.find(loc => loc.value === selectedLocation);
      if (location) {
        setLocationSearchTerm(location.label);
      }
    } else {
      setLocationSearchTerm('');
    }
  }, [selectedLocation, locations]);

  // 🆕 NEW: Set initial search term when doctor is selected externally
  useEffect(() => {
    if (selectedDoctor) {
      const doctor = doctors.find(doc => doc.value === selectedDoctor);
      if (doctor) {
        setDoctorSearchTerm(doctor.label);
      }
    } else {
      setDoctorSearchTerm('');
    }
  }, [selectedDoctor, doctors]);

  // Fetch TAT data
  const fetchTATData = useCallback(async () => {
    if (!selectedLocation) return;

    setLoading(true);
    try {
      const params = {
        location: selectedLocation,
        dateType,
        fromDate,
        toDate
        // 🔧 REMOVED: limit parameter - fetch ALL studies
      };

      if (selectedModalities.length > 0) {
        params.modality = selectedModalities.join(',');
      }

      const response = await api.get('/tat/report', { params });
      
      if (response.data.success) {
        setStudies(response.data.studies);
        setCurrentPage(1);
        console.log(`✅ Fetched ${response.data.studies.length} studies from backend`);
      } else {
        toast.error('Failed to load TAT data');
        setStudies([]);
      }
    } catch (error) {
      console.error('❌ Error fetching TAT data:', error);
      toast.error('Failed to load TAT data');
      setStudies([]);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, dateType, fromDate, toDate, selectedModalities]); // 🔧 REMOVED: recordsPerPage dependency

  // 🔧 MODIFIED: Remove selectedDoctor from Excel export
  const exportToExcel = useCallback(async () => {
    if (!selectedLocation) {
      toast.error('Please select a location first');
      return;
    }

    try {
      setLoading(true);
      const params = {
        location: selectedLocation,
        dateType,
        fromDate,
        toDate
      };

      // 🔧 REMOVED: Don't send reportedBy to backend for export
      // We'll export the filtered data from frontend

      const response = await api.get('/tat/report/export', { 
        params,
        responseType: 'blob'
      });

      // Create blob link to download
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with doctor filter info
      const locationName = locations.find(loc => loc.value === selectedLocation)?.label || 'Unknown';
      const doctorName = selectedDoctor ? doctors.find(doc => doc.value === selectedDoctor)?.label || 'Unknown_Doctor' : 'All_Doctors';
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `TAT_Report_${locationName}_${doctorName}_${dateStr}.xlsx`;
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Excel report downloaded successfully!');
    } catch (error) {
      console.error('❌ Error exporting Excel:', error);
      toast.error('Failed to export Excel report');
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, dateType, fromDate, toDate, locations, selectedDoctor, doctors]);

  // 🔧 ENHANCED: Reorder filtering - Doctor filter BEFORE pagination
  const filteredStudies = useMemo(() => {
    let filtered = [...studies];

    // 🆕 STEP 1: Doctor filter FIRST (on full dataset before any pagination)
    if (selectedDoctor) {
      filtered = filtered.filter(study => {
        const reportedBy = study.reportedBy || '';
        // Get the selected doctor's name
        const selectedDoctorName = doctors.find(doc => doc.value === selectedDoctor)?.label || '';
        
        // Check if the study's reportedBy matches the selected doctor
        return reportedBy.toLowerCase().includes(selectedDoctorName.toLowerCase()) ||
               reportedBy === selectedDoctorName;
      });
    }

    // 🔧 STEP 2: Search filter (after doctor filter)
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

    // 🔧 STEP 3: Modality filter (after search filter)
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
  }, [studies, selectedDoctor, doctors, searchTerm, selectedModalities]);

  // Pagination
  const totalPages = Math.ceil(filteredStudies.length / recordsPerPage);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const paginatedStudies = filteredStudies.slice(startIndex, startIndex + recordsPerPage);

  // ✅ OPTIMIZED: Helper functions
  const safeValue = (value, defaultVal = '-') => {
    if (value === null || value === undefined || value === '') return defaultVal;
    return String(value);
  };

  const getTATStatusColor = (tatValue) => {
    if (!tatValue || tatValue === '-' || tatValue === null || tatValue === undefined) {
      return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
    
    const tatString = String(tatValue);
    const minutes = parseInt(tatString.replace(/[^\d]/g, ''));
    
    if (isNaN(minutes) || minutes === 0) {
      return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
    
    if (minutes <= 60) return 'bg-green-100 text-green-800 border border-green-200';
    if (minutes <= 240) return 'bg-blue-100 text-blue-800 border border-blue-200';
    if (minutes <= 480) return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
    if (minutes <= 1440) return 'bg-orange-100 text-orange-800 border border-orange-200';
    return 'bg-red-100 text-red-800 border border-red-200';
  };

  const getStatusColor = (status) => {
    const statusString = status ? String(status).toLowerCase() : '';
    
    switch (statusString) {
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

  const getSafeNestedValue = (obj, path, defaultValue = '-') => {
    try {
      const keys = path.split('.');
      let current = obj;
      
      for (const key of keys) {
        if (current === null || current === undefined) {
          return defaultValue;
        }
        current = current[key];
      }
      
      return current !== null && current !== undefined ? String(current) : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  };

  const formatDateTime = (dateValue) => {
    if (!dateValue) return '-';
    
    try {
      const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
      
      if (isNaN(date.getTime())) {
        return '-';
      }
      
      return format(date, 'MMM dd, yyyy • HH:mm');
    } catch (error) {
      return '-';
    }
  };

  // Event handlers
  const handleModalityToggle = (modality) => {
    const newSelection = selectedModalities.includes(modality)
      ? selectedModalities.filter(m => m !== modality)
      : [...selectedModalities, modality];
    
    setSelectedModalities(newSelection);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // 🔧 ENHANCED: Update the title to show active filters
  const getFilterSummary = () => {
    const filters = [];
    if (selectedDoctor) {
      const doctorName = doctors.find(doc => doc.value === selectedDoctor)?.label || 'Unknown Doctor';
      // Show how many studies match this doctor
      const doctorStudies = studies.filter(study => {
        const reportedBy = study.reportedBy || '';
        return reportedBy.toLowerCase().includes(doctorName.toLowerCase()) ||
               reportedBy === doctorName;
      });
      filters.push(`Doctor: ${doctorName} (${doctorStudies.length} studies)`);
    }
    if (selectedModalities.length > 0) {
      filters.push(`Modalities: ${selectedModalities.join(', ')}`);
    }
    if (searchTerm.trim()) {
      filters.push(`Search: "${searchTerm}"`);
    }
    return filters.length > 0 ? ` (${filters.join(' | ')})` : '';
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <UniversalNavbar />
      
      {/* ✅ ULTRA-COMPACT: 50% SPACE SAVED - Single header section */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 p-2">
        {/* ✅ COMPACT: Title and filters in single row */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900">TAT Performance Report</h1>
            <p className="text-xs text-gray-600">
              {loading ? (
                <span className="text-blue-600">
                  🔄 Loading studies...
                </span>
              ) : (
                <>
                  Showing <span className="font-semibold">{paginatedStudies.length}</span> of{' '}
                  <span className="font-semibold">{filteredStudies.length}</span> studies
                  {filteredStudies.length !== studies.length && (
                    <span className="text-gray-500">
                      {' '}(filtered from <span className="font-semibold">{studies.length}</span> total)
                    </span>
                  )}
                  {getFilterSummary()}
                </>
              )}
            </p>
          </div>
          
          {/* ✅ COMPACT: TAT Legend */}
          <div className="flex items-center space-x-2 text-xs">
            {/* 🆕 NEW: Add Export button next to legend */}
            <button
              onClick={exportToExcel}
              disabled={!selectedLocation || loading || filteredStudies.length === 0}
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

        {/* ✅ SUPER-COMPACT: All filters in one row */}
        <div className="grid grid-cols-12 gap-1 items-end mb-2">
          {/* Date Type */}
          <div className="col-span-1">
            <select
              value={dateType}
              onChange={(e) => setDateType(e.target.value)}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
            >
              <option value="uploadDate">Upload</option>
              <option value="studyDate">Study</option>
              <option value="assignedDate">Assigned</option>
              <option value="reportDate">Report</option>
            </select>
          </div>

          {/* From Date */}
          <div className="col-span-1">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* To Date */}
          <div className="col-span-1">
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* ✅ SEARCHABLE: Location Dropdown */}
          <div className="col-span-2 relative" ref={locationDropdownRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Search locations..."
                value={locationSearchTerm}
                onChange={handleLocationSearchChange}
                onFocus={() => setIsLocationDropdownOpen(true)}
                className="w-full pl-6 pr-6 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg 
                className="w-3 h-3 text-gray-400 absolute left-1 top-1/2 transform -translate-y-1/2" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              
            
              {/* Clear button */}
              {locationSearchTerm && (
                <button
                  onClick={() => {
                    setLocationSearchTerm('');
                    setSelectedLocation('');
                    setIsLocationDropdownOpen(false);
                  }}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* ✅ SEARCHABLE: Dropdown list */}
            {isLocationDropdownOpen && (
              <div className="absolute z-50 w-80 mt-1 bg-white border border-gray-300 rounded-md shadow-xl max-h-80 overflow-y-auto">
                {/* All Locations option */}
                <div
                  onClick={() => handleLocationSelect(null)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 ${
                    !selectedLocation ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="font-medium">All Locations</span>
                  </div>
                </div>

                {/* Filtered locations */}
                {filteredLocations.length > 0 ? (
                  filteredLocations.map((location) => (
                    <div
                      key={location.value}
                      onClick={() => handleLocationSelect(location)}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                        selectedLocation === location.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <div>
                            <div className="font-medium">{location.label}</div>
                            {location.code && (
                              <div className="text-xs text-gray-500">Code: {location.code}</div>
                            )}
                          </div>
                        </div>
                        {selectedLocation === location.value && (
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 italic">
                    No locations found for "{locationSearchTerm}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 🆕 NEW: Searchable Doctor Dropdown */}
          <div className="col-span-2 relative" ref={doctorDropdownRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Search doctors..."
                value={doctorSearchTerm}
                onChange={handleDoctorSearchChange}
                onFocus={() => setIsDoctorDropdownOpen(true)}
                className="w-full pl-6 pr-6 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg 
                className="w-3 h-3 text-gray-400 absolute left-1 top-1/2 transform -translate-y-1/2" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              
            
              {/* Clear button */}
              {doctorSearchTerm && (
                <button
                  onClick={() => {
                    setDoctorSearchTerm('');
                    setSelectedDoctor('');
                    setIsDoctorDropdownOpen(false);
                  }}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* 🆕 NEW: Doctor dropdown list */}
            {isDoctorDropdownOpen && (
              <div className="absolute z-50 w-96 mt-1 bg-white border border-gray-300 rounded-md shadow-xl max-h-80 overflow-y-auto">
                {/* All Doctors option */}
                <div
                  onClick={() => handleDoctorSelect(null)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 ${
                    !selectedDoctor ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="font-medium">All Doctors</span>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      {studies.length}
                    </span>
                  </div>
                </div>

                {/* Filtered doctors with study counts */}
                {filteredDoctors.length > 0 ? (
                  filteredDoctors.map((doctor) => {
                    // 🔧 Calculate study count for this doctor from FULL dataset
                    const doctorStudyCount = studies.filter(study => {
                      const reportedBy = study.reportedBy || '';
                      return reportedBy.toLowerCase().includes(doctor.label.toLowerCase()) ||
                             reportedBy === doctor.label;
                    }).length;

                    return (
                      <div
                        key={doctor.value}
                        onClick={() => handleDoctorSelect(doctor)}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                          selectedDoctor === doctor.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <div>
                              <div className="font-medium">{doctor.label}</div>
                              {doctor.specialization && doctor.specialization !== 'N/A' && (
                                <div className="text-xs text-gray-500">{doctor.specialization}</div>
                              )}
                              {doctor.email && (
                                <div className="text-xs text-gray-400">{doctor.email}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {/* Study count badge */}
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              doctorStudyCount > 0 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {doctorStudyCount}
                            </span>
                            {/* Selected checkmark */}
                            {selectedDoctor === doctor.value && (
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 italic">
                    No doctors found for "{doctorSearchTerm}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Records */}
          <div className="col-span-1">
            <select
              value={recordsPerPage}
              onChange={(e) => {
                setRecordsPerPage(parseInt(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
            >
              {recordOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="col-span-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-5 pr-1 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
              />
              <svg className="w-3 h-3 text-gray-400 absolute left-1 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Generate Button */}
          <div className="col-span-1">
            <button
              onClick={fetchTATData}
              disabled={!selectedLocation || loading}
              className="w-full px-1 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'Go'}
            </button>
          </div>
        </div>

        {/* ✅ COMPACT: Modality filters */}
        <div className="flex flex-wrap gap-1">
          {modalityOptions.map(modality => (
            <button
              key={modality}
              onClick={() => handleModalityToggle(modality)}
              className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                selectedModalities.includes(modality)
                  ? 'bg-blue-500 text-white'
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

      {/* ✅ MAXIMIZED: Table area - takes 85% of screen */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse table-auto text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gradient-to-r from-gray-800 to-gray-900 text-white">
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">STATUS</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[70px]">PATIENT ID</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[100px]">PATIENT NAME</th>
              <th className="border-r border-gray-600 px-1 py-2 text-center text-xs font-semibold w-[30px]">SEX</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">REFERRED BY</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[70px]">ACC NUMBER</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[100px]">STUDY TYPE</th>
              <th className="border-r border-gray-600 px-1 py-2 text-center text-xs font-semibold w-[50px]">MODALITY</th>
              <th className="border-r border-gray-600 px-1 py-2 text-center text-xs font-semibold w-[50px]">S/I COUNT</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[100px]">INSTITUTION</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">STUDY DATE</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">UPLOAD DATE</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">ASSIGN DATE</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">REPORT DATE</th>
              <th className="border-r border-gray-600 px-1 py-2 text-center text-xs font-semibold min-w-[70px]">U→A TAT</th>
              {/* <th className="border-r border-gray-600 px-1 py-2 text-center text-xs font-semibold min-w-[70px]">S→R TAT</th> */}
              <th className="border-r border-gray-600 px-1 py-2 text-center text-xs font-semibold min-w-[70px]">U→R TAT</th>
              <th className="border-r border-gray-600 px-1 py-2 text-center text-xs font-semibold min-w-[70px]">A→R TAT</th>
              <th className="border-r border-gray-600 px-1 py-2 text-left text-xs font-semibold min-w-[80px]">REPORTED BY</th>
              <th className="px-1 py-2 text-center text-xs font-semibold w-[50px]">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedStudies.length > 0 ? (
              paginatedStudies.map((study, index) => (
                <tr 
                  key={study._id || index} 
                  className={`hover:bg-blue-50 transition-colors duration-150 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}
                >
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1 py-0.5 text-xs font-medium rounded-full ${getStatusColor(study.studyStatus)}`}>
                      <div className="w-1 h-1 rounded-full bg-current mr-1"></div>
                      {safeValue(study.studyStatus)
                        .replace(/_/g, ' ')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                        .substring(0, 10)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="font-medium text-gray-900 truncate max-w-[70px]" title={safeValue(study.patientId)}>
                      {safeValue(study.patientId)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="font-medium text-gray-900 truncate max-w-[100px]" title={safeValue(study.patientName)}>
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
                    <div className="text-gray-700 truncate max-w-[80px]" title={safeValue(study.referredBy)}>
                      {safeValue(study.referredBy)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="font-mono text-gray-700 text-xs truncate max-w-[70px]" title={safeValue(study.accessionNumber)}>
                      {safeValue(study.accessionNumber)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="text-gray-700 truncate max-w-[100px]" title={safeValue(study.studyDescription)}>
                      {safeValue(study.studyDescription)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-1 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
                      {safeValue(study.modality)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className="font-mono text-xs text-gray-600">
                      {safeValue(study.series_Images)}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="text-gray-700 text-xs truncate max-w-[100px]" title={safeValue(study.institutionName)}>
                      {safeValue(study.institutionName)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {safeValue(study.billedOnStudyDate)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {safeValue(study.uploadDate)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {safeValue(study.assignedDate)}
                    </div>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 whitespace-nowrap">
                    <div className="font-mono text-xs text-gray-700">
                      {study.reportDate ? formatDateTime(study.reportDate) : '-'}
                    </div>
                  </td>
                  
                  {/* ✅ TAT columns with minutes indicator */}
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-1 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.uploadToAssignmentTAT'))}`}>
                      {(() => {
                        const val = getSafeNestedValue(study, 'fullTatDetails.uploadToAssignmentTAT', 'N/A');
                        return val !== 'N/A' && val !== '-' ? `${val}m` : val;
                      })()}
                    </span>
                  </td>
                  {/* <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-1 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.studyToReportTATFormatted'))}`}>
                      {(() => {
                        const val = getSafeNestedValue(study, 'fullTatDetails.studyToReportTATFormatted', 'N/A');
                        return val !== 'N/A' && val !== '-' ? `${val}m` : val;
                      })()}
                    </span>
                  </td> */}
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-1 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.uploadToReportTATFormatted'))}`}>
                      {(() => {
                        const val = getSafeNestedValue(study, 'fullTatDetails.uploadToReportTATFormatted', 'N/A');
                        return val !== 'N/A' && val !== '-' ? `${val}m` : val;
                      })()}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1 text-center whitespace-nowrap">
                    <span className={`inline-flex items-center px-1 py-0.5 text-xs font-medium rounded-full ${getTATStatusColor(getSafeNestedValue(study, 'fullTatDetails.assignmentToReportTATFormatted'))}`}>
                      {(() => {
                        const val = getSafeNestedValue(study, 'fullTatDetails.assignmentToReportTATFormatted', 'N/A');
                        return val !== 'N/A' && val !== '-' ? `${val}m` : val;
                      })()}
                    </span>
                  </td>
                  <td className="border-r border-gray-100 px-1 py-1">
                    <div className="text-gray-700 text-xs truncate max-w-[80px]" title={safeValue(study.reportedBy)}>
                      {safeValue(study.reportedBy)}
                    </div>
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button 
                      className="inline-flex items-center justify-center w-5 h-5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 hover:scale-105 transition-all duration-150"
                      title="Download Report"
                      onClick={() => console.log('Download report for study:', study._id)}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="20" className="px-4 py-8 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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
                          : 'Select a location and date range to generate the report'
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

      {/* ✅ MINIMAL: Compact pagination footer */}
      {filteredStudies.length > 0 && (
        <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-2 py-1">
          <div className="flex items-center justify-between text-xs text-gray-600">
            {/* Left: Record Info */}
            <span>
              Showing <span className="font-semibold">{startIndex + 1}</span>-
              <span className="font-semibold">{Math.min(startIndex + recordsPerPage, filteredStudies.length)}</span> of{' '}
              <span className="font-semibold">{filteredStudies.length}</span>
            </span>

            {/* Center: Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-1 py-0.5 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                
                {/* Page Numbers */}
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
                  className="px-1 py-0.5 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            )}

            {/* Right: Last Updated */}
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

export default TATReport;