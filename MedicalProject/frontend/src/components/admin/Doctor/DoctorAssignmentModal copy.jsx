import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

const DoctorAssignmentModal = ({ isOpen, onClose, study, onAssignComplete }) => {
  const [doctors, setDoctors] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]); // Store all doctors for filtering
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [assignmentNote, setAssignmentNote] = useState('');
  const [currentlyAssignedDoctor, setCurrentlyAssignedDoctor] = useState(null);

  // Reset selected doctor when study changes
  useEffect(() => {
    if (study?.lastAssignedDoctor) {
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

  // Apply filters whenever search term, assignment filter, or allDoctors change
  useEffect(() => {
    if (allDoctors.length > 0) {
      applyFilters();
    }
  }, [searchTerm, assignmentFilter, allDoctors, currentlyAssignedDoctor]);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/doctors', {
        params: {
          status: 'active'
        }
      });

      if (response.data.success) {
        let allDoctorsList = response.data.doctors;
        let assignedDoctor = null;

        // First, find and set the currently assigned doctor
        if (study?.lastAssignedDoctor) {
          assignedDoctor = allDoctorsList.find(
            doc => doc._id === study.lastAssignedDoctor || doc.id === study.lastAssignedDoctor
          );
          
          if (assignedDoctor) {
            setCurrentlyAssignedDoctor(assignedDoctor);
          } else {
            // If assigned doctor is not in the current list, fetch their details
            try {
              const doctorResponse = await api.get(`/admin/doctors/${study.lastAssignedDoctor}`);
              
              if (doctorResponse.data.success && doctorResponse.data.doctor) {
                assignedDoctor = doctorResponse.data.doctor;
                setCurrentlyAssignedDoctor(assignedDoctor);
                // Add the assigned doctor to the list if not already present
                const doctorExists = allDoctorsList.some(
                  doc => (doc._id === assignedDoctor._id || doc.id === assignedDoctor.id)
                );
                if (!doctorExists) {
                  allDoctorsList = [...allDoctorsList, assignedDoctor];
                }
              }
            } catch (err) {
              console.error("Could not fetch assigned doctor details", err);
            }
          }
        } else {
          setCurrentlyAssignedDoctor(null);
        }

        setAllDoctors(allDoctorsList);
        console.log('All doctors loaded:', allDoctorsList.length);
        console.log('Currently assigned doctor:', assignedDoctor);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
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

    // Apply assignment filter
    if (assignmentFilter === 'assigned') {
      filteredDoctors = filteredDoctors.filter(doc => {
        if (!currentlyAssignedDoctor) return false;
        const docId = doc._id || doc.id;
        const assignedId = currentlyAssignedDoctor._id || currentlyAssignedDoctor.id;
        return docId === assignedId;
      });
    } else if (assignmentFilter === 'unassigned') {
      filteredDoctors = filteredDoctors.filter(doc => {
        if (!currentlyAssignedDoctor) return true;
        const docId = doc._id || doc.id;
        const assignedId = currentlyAssignedDoctor._id || currentlyAssignedDoctor.id;
        return docId !== assignedId;
      });
    }

    console.log(`Applied filters - Search: "${searchTerm}", Assignment: "${assignmentFilter}", Results: ${filteredDoctors.length}`);
    setDoctors(filteredDoctors);
  };

  const handleAssign = async () => {
    if (!selectedDoctorId) {
      toast.error('Please select a doctor');
      return;
    }

    // Check if reassigning to the same doctor
    if (currentlyAssignedDoctor && 
        (currentlyAssignedDoctor._id === selectedDoctorId || currentlyAssignedDoctor.id === selectedDoctorId)) {
      toast.error('Study is already assigned to this doctor');
      return;
    }

    try {
      const loadingToast = toast.loading(
        currentlyAssignedDoctor ? 'Reassigning study to doctor...' : 'Assigning study to doctor...'
      );
      
      const response = await api.post(`/admin/studies/${study._id}/assign`, {
        doctorId: selectedDoctorId,
        assignmentNote: assignmentNote.trim() || undefined
      });

      toast.dismiss(loadingToast);

      if (response.data.success) {
        const message = response.data.message || 
          (currentlyAssignedDoctor ? 'Study reassigned successfully' : 'Study assigned successfully');
        toast.success(message);
        onAssignComplete && onAssignComplete();
        onClose();
      } else {
        toast.error(response.data.message || 'Failed to assign doctor');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error assigning doctor:', error);
      
      // More specific error handling
      if (error.response?.status === 400) {
        toast.error(error.response.data.message || 'Invalid request - please check your selection');
      } else if (error.response?.status === 404) {
        toast.error('Study or doctor not found');
      } else {
        toast.error('Failed to assign doctor - please try again');
      }
    }
  };

  const handleFilterChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setAssignmentFilter('');
  };

  if (!isOpen) return null;

  // Get study description for title
  const studyDescription = study?.description || study?.studyDescription || study?.examDescription || 'Study';
  const patientName = study?.patientName || 'Unknown Patient';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Modern Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Doctor Assignment</h2>
              <p className="text-blue-100 text-sm mt-1">
                Patient: {patientName} | Study: {studyDescription}
              </p>
            </div>
            <button 
              onClick={onClose} 
              className="text-white hover:text-gray-200 p-2 rounded-full hover:bg-white/20 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Currently Assigned Doctor Section */}
        {currentlyAssignedDoctor && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 m-4 rounded-r-md">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">Currently Assigned Doctor</h3>
                <div className="mt-1 text-sm text-amber-700">
                  <strong>
                    {`${currentlyAssignedDoctor.firstName || ''} ${currentlyAssignedDoctor.lastName || ''}`.trim() || 
                     currentlyAssignedDoctor.email || 'Unknown Doctor'}
                  </strong> 
                  <span className="mx-2">•</span>
                  <span>{currentlyAssignedDoctor.email}</span>
                  <span className="mx-2">•</span>
                  <span className="capitalize">{currentlyAssignedDoctor.specialization || 'Radiologist'}</span>
                  <span className="mx-2">•</span>
                  <span className={`inline-flex items-center ${currentlyAssignedDoctor.isLoggedIn ? 'text-green-600' : 'text-red-600'}`}>
                    <span className={`w-2 h-2 rounded-full mr-1 ${currentlyAssignedDoctor.isLoggedIn ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {currentlyAssignedDoctor.isLoggedIn ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Excel-style Filter Controls */}
        <div className="bg-gray-50 border-b border-gray-200 p-3">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Assignment Status:</label>
              <select 
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
              >
                <option value="">All Doctors</option>
                <option value="assigned">Currently Assigned</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
            
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by name, email, or specialization..."
                className="block w-full pl-10 pr-3 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                value={searchTerm}
                onChange={handleFilterChange}
              />
            </div>
            
            {(searchTerm || assignmentFilter) && (
              <button 
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={clearFilters}
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear Filters
              </button>
            )}
          </div>
          
          <div className="mt-2 text-sm text-gray-600">
            {doctors.length} of {allDoctors.length} doctor{doctors.length !== 1 ? 's' : ''} shown
            {searchTerm && (
              <span className="text-blue-600"> (filtered by "{searchTerm}")</span>
            )}
            {assignmentFilter && (
              <span className="text-blue-600"> (showing {assignmentFilter} doctors)</span>
            )}
          </div>
        </div>
        
        {/* Excel-style Doctor List - Reduced Heights */}
        <div className="flex-1 overflow-hidden">
          <div className="overflow-auto h-full">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="w-12 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                    Select
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                    Doctor Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                    Specialization
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                    Experience
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                    Status
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Load
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center">
                      <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mb-3"></div>
                        <p className="text-gray-500 text-sm">Loading doctors...</p>
                      </div>
                    </td>
                  </tr>
                ) : doctors.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-8 h-8 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-gray-500">No doctors found</p>
                        <p className="text-gray-400 text-xs mt-1">
                          {searchTerm || assignmentFilter 
                            ? 'Try adjusting your search criteria or filters' 
                            : 'No doctors available at the moment'
                          }
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  doctors.map((doctor, index) => {
                    const doctorId = doctor._id || doctor.id;
                    const isSelected = selectedDoctorId === doctorId;
                    const isCurrentlyAssigned = currentlyAssignedDoctor && (
                      (currentlyAssignedDoctor._id || currentlyAssignedDoctor.id) === doctorId
                    );
                    const isOnline = doctor.isLoggedIn;
                    
                    // Fix doctor name display - prefer firstName + lastName, fallback to email
                    const fullName = `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
                    const displayName = fullName || doctor.email || 'Unknown Doctor';
                    
                    return (
                      <tr 
                        key={doctorId} 
                        className={`
                          ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} 
                          ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''} 
                          ${isCurrentlyAssigned ? 'bg-amber-50' : ''}
                          hover:bg-blue-100 transition-colors cursor-pointer
                        `}
                        onClick={() => setSelectedDoctorId(isSelected ? '' : doctorId)}
                      >
                        <td className="px-3 py-2 text-center border-r border-gray-200">
                          <input
                            type="radio"
                            name="selectedDoctor"
                            checked={isSelected}
                            onChange={() => setSelectedDoctorId(doctorId)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-6 w-6">
                              <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                                <span className="text-xs font-medium text-white">
                                  {(doctor.firstName?.[0] || doctor.email?.[0] || 'D').toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div className="ml-2">
                              <div className="text-sm font-medium text-gray-900">
                                {displayName}
                                {isCurrentlyAssigned && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                    Currently Assigned
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 border-r border-gray-200">
                          {doctor.email}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 border-r border-gray-200">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {doctor.specialization || 'Radiologist'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 border-r border-gray-200">
                          {doctor.experience || 'N/A'} years
                        </td>
                        <td className="px-3 py-2 text-center border-r border-gray-200">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOnline 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${
                              isOnline ? 'bg-green-500' : 'bg-red-500'
                            }`}></span>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-sm text-gray-900">
                          <div className="flex items-center justify-center">
                            <div className="w-12 bg-gray-200 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${
                                (doctor.currentLoad || 0) > 80 ? 'bg-red-500' :
                                (doctor.currentLoad || 0) > 60 ? 'bg-yellow-500' : 'bg-green-500'
                              }`} style={{ width: `${Math.min(doctor.currentLoad || 20, 100)}%` }}></div>
                            </div>
                            <span className="ml-1 text-xs text-gray-600">{doctor.currentLoad || 20}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Assignment Note Section - Reduced Padding */}
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assignment Note (Optional)
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
            rows="2"
            placeholder="Add any special instructions or notes for the doctor..."
            value={assignmentNote}
            onChange={(e) => setAssignmentNote(e.target.value)}
          />
        </div>
        
        {/* Modern Footer - Reduced Padding */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-md border border-red-200">
              <svg className="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Note: Ensure the study has complete clinical history before assignment
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedDoctorId}
                className="px-6 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {currentlyAssignedDoctor ? 'Reassign Study' : 'Assign Study'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorAssignmentModal;