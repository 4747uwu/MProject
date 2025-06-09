import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

const DoctorAssignmentModal = ({ isOpen, onClose, study, onAssignComplete }) => {
  const [doctors, setDoctors] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState(''); // 🔧 CHANGED: Single string instead of array
  const [currentlyAssignedDoctor, setCurrentlyAssignedDoctor] = useState(null);

  // 🔧 FIXED: Reset selected doctor when study changes (like copy file)
  useEffect(() => {
    console.log('🔄 Study changed, resetting selection:', study?.lastAssignedDoctor);
    
    if (study?.lastAssignedDoctor && typeof study.lastAssignedDoctor === 'string') {
      setSelectedDoctorId(study.lastAssignedDoctor);
    } else {
      setSelectedDoctorId('');
      setCurrentlyAssignedDoctor(null);
    }
  }, [study]);

  useEffect(() => {
    if (isOpen) {
      fetchDoctors();
    }
  }, [isOpen]);

  useEffect(() => {
    if (allDoctors.length > 0) {
      applyFilters();
    }
  }, [searchTerm, assignmentFilter, allDoctors, currentlyAssignedDoctor]);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching doctors...');
      
      const response = await api.get('/admin/doctors', {
        params: {
          status: 'active'
        }
      });

      console.log('📋 Doctors response:', response.data);

      if (response.data.success) {
        let allDoctorsList = response.data.doctors;
        let assignedDoctor = null;

        // 🔧 FIXED: Find and set the currently assigned doctor
        if (study?.lastAssignedDoctor) {
          assignedDoctor = allDoctorsList.find(
            doc => doc._id === study.lastAssignedDoctor || doc.id === study.lastAssignedDoctor
          );
          
          if (assignedDoctor) {
            setCurrentlyAssignedDoctor(assignedDoctor);
            console.log('✅ Found assigned doctor in list:', assignedDoctor);
          } else {
            // If assigned doctor is not in the current list, fetch their details
            try {
              const doctorResponse = await api.get(`/admin/doctors/${study.lastAssignedDoctor}`);
              
              if (doctorResponse.data.success && doctorResponse.data.doctor) {
                assignedDoctor = doctorResponse.data.doctor;
                setCurrentlyAssignedDoctor(assignedDoctor);
                console.log('✅ Fetched assigned doctor details:', assignedDoctor);
                
                // Add the assigned doctor to the list if not already present
                const doctorExists = allDoctorsList.some(
                  doc => (doc._id === assignedDoctor._id || doc.id === assignedDoctor.id)
                );
                if (!doctorExists) {
                  allDoctorsList = [...allDoctorsList, assignedDoctor];
                  console.log('✅ Added assigned doctor to list');
                }
              }
            } catch (err) {
              console.error("❌ Could not fetch assigned doctor details", err);
            }
          }
        } else {
          setCurrentlyAssignedDoctor(null);
          console.log('ℹ️ No currently assigned doctor');
        }

        setAllDoctors(allDoctorsList);
        console.log('👨‍⚕️ Loaded doctors:', allDoctorsList.length);
        console.log('👨‍⚕️ Currently assigned doctor:', assignedDoctor);
      }
    } catch (error) {
      console.error('❌ Error fetching doctors:', error);
      toast.error('Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filteredDoctors = [...allDoctors];

    // Apply search filter first
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filteredDoctors = filteredDoctors.filter(doc => {
        const fullName = `${doc.firstName || ''} ${doc.lastName || ''}`.trim().toLowerCase();
        const email = (doc.email || '').toLowerCase();
        const specialization = (doc.specialization || '').toLowerCase();
        
        return fullName.includes(searchLower) || 
               email.includes(searchLower) || 
               specialization.includes(searchLower);
      });
    }

    // 🔧 FIXED: Apply assignment filter exactly like the copy file
    if (assignmentFilter === 'assigned') {
      filteredDoctors = filteredDoctors.filter(doc => {
        if (!currentlyAssignedDoctor) return false;
        const docId = doc._id || doc.id;
        const assignedId = currentlyAssignedDoctor._id || currentlyAssignedDoctor.id;
        return docId === assignedId;
      });
      console.log('🔍 Filtering for assigned doctors:', filteredDoctors.length);
    } else if (assignmentFilter === 'unassigned') {
      filteredDoctors = filteredDoctors.filter(doc => {
        if (!currentlyAssignedDoctor) return true;
        const docId = doc._id || doc.id;
        const assignedId = currentlyAssignedDoctor._id || currentlyAssignedDoctor.id;
        return docId !== assignedId;
      });
      console.log('🔍 Filtering for unassigned doctors:', filteredDoctors.length);
    }

    console.log(`Applied filters - Search: "${searchTerm}", Assignment: "${assignmentFilter}", Results: ${filteredDoctors.length}`);
    setDoctors(filteredDoctors);
  };

  // 🔧 FIXED: Handle select doctor like copy file
  const handleSelectDoctor = (doctorId) => {
    console.log('🎯 Selecting doctor:', doctorId, 'Type:', typeof doctorId);
    setSelectedDoctorId(selectedDoctorId === doctorId ? '' : doctorId);
  };

  // 🔧 FIXED: Handle assign like copy file
  const handleAssign = async () => {
    if (!selectedDoctorId) {
      toast.error('Please select a doctor');
      return;
    }

    // 🔧 FIXED: Check if reassigning to the same doctor (like copy file)
    if (currentlyAssignedDoctor && 
        (currentlyAssignedDoctor._id === selectedDoctorId || currentlyAssignedDoctor.id === selectedDoctorId)) {
      toast.error('Study is already assigned to this doctor');
      return;
    }

    console.log('🔄 Assignment details:', {
      studyId: study._id,
      selectedDoctorId: selectedDoctorId,
      selectedDoctorIdType: typeof selectedDoctorId,
      study: study
    });

    if (!selectedDoctorId || typeof selectedDoctorId !== 'string') {
      console.error('❌ Invalid doctor ID:', selectedDoctorId);
      toast.error('Invalid doctor selection. Please try again.');
      return;
    }

    try {
      const loadingToast = toast.loading(
        currentlyAssignedDoctor ? 'Reassigning study to doctor...' : 'Assigning study to doctor...'
      );
      
      // 🔧 FIXED: Use same request structure as copy file
      const requestData = {
        doctorId: selectedDoctorId,
        priority: 'NORMAL'
      };

      console.log('📤 Sending assignment request:', requestData);
      console.log('📤 Request data types:', {
        doctorId: typeof requestData.doctorId,
        priority: typeof requestData.priority
      });
      
      const response = await api.post(`/admin/studies/${study._id}/assign`, requestData);

      toast.dismiss(loadingToast);

      console.log('✅ Assignment response:', response.data);

      if (response.data.success) {
        const message = response.data.message || 
          (currentlyAssignedDoctor ? 'Study reassigned successfully!' : 'Study assigned successfully!');
        toast.success(message);
        onAssignComplete && onAssignComplete();
        onClose();
      } else {
        toast.error(response.data.message || 'Failed to assign doctor');
      }
    } catch (error) {
      toast.dismiss();
      console.error('❌ Error assigning doctor:', error);
      console.error('❌ Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      
      // 🔧 FIXED: More specific error handling like copy file
      if (error.response?.status === 400) {
        toast.error(error.response.data.message || 'Invalid request - please check your selection');
      } else if (error.response?.status === 404) {
        toast.error('Study or doctor not found');
      } else {
        const errorMessage = error.response?.data?.message || error.message || 'Failed to assign doctor - please try again';
        toast.error(errorMessage);
      }
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setAssignmentFilter('');
  };

  if (!isOpen) return null;

  const patientName = study?.patientName || 'Unknown Patient';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        
        {/* 📱 RESPONSIVE: Header */}
        <div className="bg-gray-600 text-white p-3 sm:p-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-sm sm:text-lg font-medium truncate pr-2">
            Assign Study: {patientName}
          </h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 text-lg sm:text-xl font-bold w-6 h-6 flex items-center justify-center flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* 📱 RESPONSIVE: Currently Assigned Doctor Section */}
       
        {/* 📱 RESPONSIVE: Search and Filter Bar */}
        <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <select 
              className="border border-gray-300 rounded px-2 sm:px-3 py-1 text-xs sm:text-sm bg-white min-w-20 sm:min-w-24"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
            >
              <option value="">SELECT</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
            
            <div className="flex items-center border border-gray-300 rounded bg-white px-2 py-1 flex-1 sm:max-w-xs">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Filter radiologist..."
                className="flex-1 outline-none text-xs sm:text-sm text-gray-600 placeholder-gray-400 min-w-0"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {(searchTerm || assignmentFilter) && (
              <button 
                className="text-blue-500 hover:text-blue-700 text-xs sm:text-sm flex items-center justify-center px-2 py-1 rounded border border-blue-300 hover:bg-blue-50"
                onClick={clearFilters}
              >
                ✕Clear
              </button>
            )}
          </div>

          {/* 📱 RESPONSIVE: Filter status display */}
          <div className="mt-2 text-xs sm:text-sm text-gray-600">
            {doctors.length} of {allDoctors.length} doctor{doctors.length !== 1 ? 's' : ''} shown
            {searchTerm && (
              <span className="text-blue-600"> (filtered by "{searchTerm}")</span>
            )}
            {assignmentFilter && (
              <span className="text-blue-600"> (showing {assignmentFilter} doctors)</span>
            )}
          </div>
        </div>

        {/* 📱 RESPONSIVE: Table/Cards Container */}
        <div className="flex-1 overflow-auto">
          {/* 🖥️ DESKTOP: Table View */}
          <div className="hidden sm:block">
            <table className="w-full">
              <thead className="bg-gray-600 text-white sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-center p-3 font-medium">User Role</th>
                  <th className="text-center p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="3" className="text-center py-8">
                      <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mb-2"></div>
                        <p className="text-gray-500 text-sm">Loading doctors...</p>
                      </div>
                    </td>
                  </tr>
                ) : doctors.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="text-center py-8">
                      <p className="text-gray-500">No doctors found</p>
                      {assignmentFilter && (
                        <p className="text-gray-400 text-xs mt-1">
                          {assignmentFilter === 'assigned' 
                            ? 'No currently assigned doctor found' 
                            : 'All available doctors are currently assigned'
                          }
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  doctors.map((doctor, index) => {
                    const doctorId = doctor._id || doctor.id;
                    const isSelected = selectedDoctorId === doctorId; // 🔧 FIXED: Simple comparison
                    const isOnline = doctor.isLoggedIn;
                    
                    const fullName = `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
                    const displayName = fullName || doctor.email || 'Unknown Doctor';
                    
                    const isCurrentlyAssigned = currentlyAssignedDoctor && (
                      (currentlyAssignedDoctor._id || currentlyAssignedDoctor.id) === doctorId
                    );
                    
                    return (
                      <tr 
                        key={doctorId}
                        className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                          isCurrentlyAssigned ? 'bg-amber-50' : ''
                        } ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''} hover:bg-blue-50 cursor-pointer`}
                        onClick={() => handleSelectDoctor(doctorId)}
                      >
                        <td className="p-3">
                          <div className="flex items-center">
                            <input
                              type="radio" // 🔧 CHANGED: Radio button instead of checkbox
                              name="selectedDoctor"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleSelectDoctor(doctorId);
                              }}
                              className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300"
                            />
                            <span className="text-blue-600 hover:underline font-medium">
                              {displayName.toUpperCase()}
                              {isCurrentlyAssigned && (
                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                  Currently Assigned
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-gray-700 font-medium">
                            {(doctor.role || 'RADIOLOGIST').toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-sm font-medium ${
                            isOnline 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            <span className={`w-2 h-2 rounded-full mr-1 ${
                              isOnline ? 'bg-green-500' : 'bg-red-500'
                            }`}></span>
                            {isOnline ? 'online' : 'offline'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 📱 MOBILE: Card View */}
          <div className="block sm:hidden p-3">
            {loading ? (
              <div className="flex flex-col items-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mb-2"></div>
                <p className="text-gray-500 text-sm">Loading doctors...</p>
              </div>
            ) : doctors.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No doctors found</p>
                {assignmentFilter && (
                  <p className="text-gray-400 text-xs mt-1">
                    {assignmentFilter === 'assigned' 
                      ? 'No currently assigned doctor found' 
                      : 'All available doctors are currently assigned'
                    }
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {doctors.map((doctor, index) => {
                  const doctorId = doctor._id || doctor.id;
                  const isSelected = selectedDoctorId === doctorId; // 🔧 FIXED: Simple comparison
                  const isOnline = doctor.isLoggedIn;
                  
                  const fullName = `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
                  const displayName = fullName || doctor.email || 'Unknown Doctor';
                  
                  const isCurrentlyAssigned = currentlyAssignedDoctor && (
                    (currentlyAssignedDoctor._id || currentlyAssignedDoctor.id) === doctorId
                  );
                  
                  return (
                    <div 
                      key={doctorId}
                      className={`border rounded-lg p-3 ${
                        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      } ${isCurrentlyAssigned ? 'bg-amber-50' : ''} cursor-pointer`}
                      onClick={() => handleSelectDoctor(doctorId)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start">
                          <input
                            type="radio" // 🔧 CHANGED: Radio button instead of checkbox
                            name="selectedDoctor"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectDoctor(doctorId);
                            }}
                            className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 mt-1"
                          />
                          <div>
                            <div className="text-blue-600 font-medium text-sm break-words">
                              {displayName.toUpperCase()}
                            </div>
                            <div className="text-xs text-gray-500 break-all">
                              {doctor.email}
                            </div>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          isOnline 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          <span className={`w-2 h-2 rounded-full mr-1 ${
                            isOnline ? 'bg-green-500' : 'bg-red-500'
                          }`}></span>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 font-medium">
                          {(doctor.role || 'RADIOLOGIST').toUpperCase()}
                        </span>
                        {isCurrentlyAssigned && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            Currently Assigned
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 📱 RESPONSIVE: Footer */}
        <div className="border-t border-gray-200 p-3 sm:p-4 bg-gray-50 rounded-b-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs sm:text-sm text-pink-600 text-center sm:text-left">
              Note: An assigned study should have clinical history...!
            </div>
            <div className="flex gap-2 sm:gap-3 justify-center sm:justify-end">
              <button
                onClick={handleAssign}
                disabled={!selectedDoctorId} // 🔧 FIXED: Simple boolean check
                className="bg-gray-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-sm flex-1 sm:flex-none justify-center"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {currentlyAssignedDoctor ? 'Reassign' : 'Assign'}
              </button>
              <button
                onClick={onClose}
                className="bg-red-500 text-white px-4 sm:px-6 py-2 rounded hover:bg-red-600 flex items-center text-sm flex-1 sm:flex-none justify-center"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorAssignmentModal;