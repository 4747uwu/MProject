import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

const DoctorAssignmentModal = ({ isOpen, onClose, study, onAssignComplete }) => {
  const [doctors, setDoctors] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [selectedDoctorIds, setSelectedDoctorIds] = useState([]);
  const [currentlyAssignedDoctorIds, setCurrentlyAssignedDoctorIds] = useState([]);

  // Reset selection based on the study's doctorAssignments array
  useEffect(() => {
    console.log('🔄 Study changed:', study?.studyInstanceUID);
    console.log('📋 Study data structure:', {
        doctorAssignments: study?.doctorAssignments,
        assignedDoctorName: study?.assignedDoctorName,
        latestAssignedDoctorDetails: study?.latestAssignedDoctorDetails
    });
    
    let assignedIds = [];
    
    // ✅ METHOD 1: Try doctorAssignments array (your backend format)
    if (study?.doctorAssignments && Array.isArray(study.doctorAssignments)) {
        // Get unique doctor IDs from all assignments
        const allAssignmentIds = study.doctorAssignments
            .map(assignment => {
                // Try multiple possible ID locations
                return assignment.doctorId || 
                       assignment.doctorDetails?._id || 
                       assignment.assignedTo || 
                       assignment._id;
            })
            .filter(Boolean);
        
        // Remove duplicates and get unique assigned doctor IDs
        assignedIds = [...new Set(allAssignmentIds)];
        console.log('🧑‍⚕️ Found IDs from doctorAssignments:', assignedIds);
        console.log('🧑‍⚕️ Total assignments in array:', study.doctorAssignments.length);
    }
    
    // ✅ METHOD 2: Try latestAssignedDoctorDetails (fallback)
    if (assignedIds.length === 0 && study?.latestAssignedDoctorDetails?._id) {
        assignedIds = [study.latestAssignedDoctorDetails._id];
        console.log('🧑‍⚕️ Found ID from latestAssignedDoctorDetails:', assignedIds);
    }
    
    // ✅ METHOD 3: Try assignment array format (admin controller format)
    if (assignedIds.length === 0 && study?.assignment?.assignedTo) {
        assignedIds = [study.assignment.assignedTo];
        console.log('🧑‍⚕️ Found ID from assignment.assignedTo:', assignedIds);
    }
    
    // ✅ SET STATE: Always set the state
    setSelectedDoctorIds(assignedIds);
    setCurrentlyAssignedDoctorIds(assignedIds);
    
    console.log('🧑‍⚕️ Final assigned IDs:', assignedIds);
    console.log('🧑‍⚕️ Current assignment count:', assignedIds.length);
    
  }, [study]);

  useEffect(() => {
    if (isOpen) {
      fetchDoctors();
    } else {
      // Reset when closed
      setSearchTerm('');
      setAssignmentFilter('');
    }
  }, [isOpen]);

  const applyFilters = useCallback(() => {
    let filteredDoctors = [...allDoctors];

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filteredDoctors = filteredDoctors.filter(doc => {
        const fullName = `${doc.firstName || ''} ${doc.lastName || ''}`.trim().toLowerCase();
        const email = (doc.email || '').toLowerCase();
        const specialization = (doc.specialization || '').toLowerCase();
        return fullName.includes(searchLower) || email.includes(searchLower) || specialization.includes(searchLower);
      });
    }

    if (assignmentFilter === 'assigned') {
      filteredDoctors = filteredDoctors.filter(doc => {
        const docId = doc._id || doc.id;
        return currentlyAssignedDoctorIds.includes(docId);
      });
    } else if (assignmentFilter === 'unassigned') {
      filteredDoctors = filteredDoctors.filter(doc => {
        const docId = doc._id || doc.id;
        return !currentlyAssignedDoctorIds.includes(docId);
      });
    }
    
    setDoctors(filteredDoctors);
  }, [allDoctors, searchTerm, assignmentFilter, currentlyAssignedDoctorIds]);

  useEffect(() => {
    if (allDoctors.length > 0) {
      applyFilters();
    }
  }, [applyFilters]);

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/doctors', { params: { status: 'active' } });

      if (response.data.success) {
        let fetchedDoctorsList = response.data.doctors || [];

        const currentStudyAssignedIds = study?.doctorAssignments?.map(assignment => 
          assignment.doctorId || assignment.doctorDetails?._id
        ).filter(Boolean) || [];

        const doctorsToFetchDetails = currentStudyAssignedIds.filter(
          assignedId => !fetchedDoctorsList.some(doc => (doc._id === assignedId || doc.id === assignedId))
        );

        if (doctorsToFetchDetails.length > 0) {
          console.log('🔍 Fetching details for missing assigned doctors:', doctorsToFetchDetails);
          const detailedDoctorPromises = doctorsToFetchDetails.map(id =>
            api.get(`/admin/doctors/${id}`).catch(err => {
              console.error(`Failed to fetch details for doctor ${id}`, err);
              return null;
            })
          );
          const detailedDoctorResponses = await Promise.all(detailedDoctorPromises);
          detailedDoctorResponses.forEach(res => {
            if (res && res.data.success && res.data.doctor) {
              fetchedDoctorsList.push(res.data.doctor);
            }
          });
        }

        const uniqueDoctorList = Array.from(new Map(fetchedDoctorsList.map(doc => [doc._id || doc.id, doc])).values());
        setAllDoctors(uniqueDoctorList);
        console.log('👥 Total doctors loaded:', uniqueDoctorList.length);
      }
    } catch (error) {
      console.error('❌ Error fetching doctors:', error);
      toast.error('Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDoctor = (doctorId) => {
    setSelectedDoctorIds(prevSelected =>
      prevSelected.includes(doctorId)
        ? prevSelected.filter(id => id !== doctorId)
        : [...prevSelected, doctorId]
    );
  };

  const handleAssign = async () => {
    if (selectedDoctorIds.length === 0) {
      toast.error('Please select at least one doctor');
      return;
    }

    const doctorsToAssign = selectedDoctorIds.filter(
      id => !currentlyAssignedDoctorIds.includes(id)
    );

    const doctorsToUnassign = currentlyAssignedDoctorIds.filter(
      id => !selectedDoctorIds.includes(id)
    );

    if (doctorsToAssign.length === 0 && doctorsToUnassign.length === 0) {
      toast.info('No changes to make - all selected doctors are already assigned.');
      onClose();
      return;
    }

    const loadingToast = toast.loading('Assigning doctors...');
    
    let successfulAssignments = 0;
    const assignedDoctors = [];

    for (const doctorId of doctorsToAssign) {
      try {
        const response = await api.post(`/admin/studies/${study._id}/assign`, {
          doctorId,
          priority: 'NORMAL'
        });
        
        if (response.data.success) {
          successfulAssignments++;
          
          const doctorInfo = allDoctors.find(doc => (doc._id || doc.id) === doctorId);
          assignedDoctors.push({
            id: doctorId,
            name: doctorInfo?.fullName || doctorInfo?.firstName + ' ' + doctorInfo?.lastName || 'Unknown Doctor'
          });
        }
      } catch (error) {
        console.error('Assignment error:', error);
        toast.error(`Failed to assign to doctor`);
      }
    }

    toast.dismiss(loadingToast);

    if (successfulAssignments > 0) {
      if (onAssignComplete) {
        onAssignComplete({
          success: true,
          studyId: study._id,
          assignedDoctors: assignedDoctors
        });
      }
      onClose();
    } else {
      toast.error('No assignments were successful');
    }
  };

  // ✅ FIX: Add patientName calculation before handleUnassignAll function
  const patientName = study?.patientName || study?.patientInfo?.patientName || 'Unknown Patient';

  // ✅ UPDATED: Fixed handleUnassignAll function
  const handleUnassignAll = async () => {
    // Get only selected doctors that are currently assigned
    const selectedAssignedDoctors = selectedDoctorIds.filter(id => currentlyAssignedDoctorIds.includes(id));
    
    if (selectedAssignedDoctors.length === 0) {
        toast.info('No assigned doctors are selected for unassignment');
        return;
    }

    const confirmUnassign = window.confirm(
        `Are you sure you want to unassign ${selectedAssignedDoctors.length} selected doctor(s) from this study?\n\nStudy: ${patientName}\nStudy ID: ${study?.studyInstanceUID || 'N/A'}`
    );

    if (!confirmUnassign) return;

    const loadingToast = toast.loading(`Unassigning ${selectedAssignedDoctors.length} selected doctors...`);
    
    try {
        let successfulUnassignments = 0;
        const unassignedDoctors = [];

        // ✅ SAME PATTERN: Call backend for each selected assigned doctor (like assignment)
        for (const doctorId of selectedAssignedDoctors) {
            try {
                const response = await api.post(`/admin/studies/${study._id}/unassign`, {
                    doctorId
                });
                
                if (response.data.success) {
                    successfulUnassignments++;
                    
                    const doctorInfo = allDoctors.find(doc => (doc._id || doc.id) === doctorId);
                    unassignedDoctors.push({
                        id: doctorId,
                        name: doctorInfo?.fullName || doctorInfo?.firstName + ' ' + doctorInfo?.lastName || 'Unknown Doctor'
                    });
                }
            } catch (error) {
                console.error('Unassignment error for doctor:', doctorId, error);
                toast.error(`Failed to unassign doctor`);
            }
        }

        toast.dismiss(loadingToast);

        if (successfulUnassignments > 0) {
            // ✅ UPDATE STATE: Remove unassigned doctors from current assignments and selections
            const newCurrentlyAssigned = currentlyAssignedDoctorIds.filter(id => !selectedAssignedDoctors.includes(id));
            const newSelected = selectedDoctorIds.filter(id => !selectedAssignedDoctors.includes(id));
            
            setCurrentlyAssignedDoctorIds(newCurrentlyAssigned);
            setSelectedDoctorIds(newSelected);
            
            toast.success(`Successfully unassigned ${successfulUnassignments} selected doctor(s) from this study`);
            
            // ✅ FIX: Send assignedDoctors format for compatibility with WorklistTable callback
            if (onAssignComplete) {
                onAssignComplete({
                    success: true,
                    studyId: study._id,
                    assignedDoctors: unassignedDoctors, // ✅ KEY FIX: Use assignedDoctors key
                    action: 'unassign_selected',
                    unassignedCount: successfulUnassignments
                });
            }
            
            onClose();
        } else {
            toast.error('No doctors were unassigned');
        }
    } catch (error) {
        toast.dismiss(loadingToast);
        console.error('❌ Error during selected doctors unassignment:', error);
        toast.error('Failed to unassign selected doctors');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setAssignmentFilter('');
  };

  if (!isOpen) return null;

  const doctorsToShow = assignmentFilter || searchTerm ? doctors : allDoctors;

  const assignedCount = currentlyAssignedDoctorIds.length;
  const unassignedCount = allDoctors.length - assignedCount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="bg-gray-600 text-white p-3 sm:p-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-sm sm:text-lg font-medium truncate pr-2">
            Assign Study: {patientName} (Study ID: {study?.studyInstanceUID || 'N/A'})
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 text-lg sm:text-xl font-bold w-6 h-6 flex items-center justify-center flex-shrink-0"
          >
            ✕
          </button>
        </div>

       

        {assignedCount > 0 && (
          <div className="p-3 bg-amber-50 border-b border-amber-200">
            <div className="flex items-center text-sm text-amber-800">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Currently assigned to {assignedCount} doctor(s):</span>
              <div className="ml-2 flex flex-wrap gap-1">
                {study?.doctorAssignments?.map((assignment, index) => (
                  <span key={assignment.doctorId} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-800">
                     {assignment.doctorDetails?.fullName || 'Unknown'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <select
              className="border border-gray-300 rounded px-2 sm:px-3 py-1 text-xs sm:text-sm bg-white min-w-20 sm:min-w-24"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
            >
              <option value="">All Doctors</option>
              <option value="assigned">Currently Assigned ({assignedCount})</option>
              <option value="unassigned">Not Currently Assigned ({unassignedCount})</option>
            </select>
            <div className="flex items-center border border-gray-300 rounded bg-white px-2 py-1 flex-1 sm:max-w-xs">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Filter doctors..."
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
          <div className="mt-2 text-xs sm:text-sm text-gray-600">
            {doctorsToShow.length} of {allDoctors.length} doctor{allDoctors.length !== 1 ? 's' : ''} shown.
            Selected: {selectedDoctorIds.length} | 
            Currently Assigned: {assignedCount} | 
            New Assignments: {selectedDoctorIds.filter(id => !currentlyAssignedDoctorIds.includes(id)).length}
          </div>
        </div>

        {/* Doctor List */}
        <div className="flex-1 overflow-auto">
          {/* Desktop Table View */}
          <div className="hidden sm:block">
            <table className="w-full">
              <thead className="bg-gray-600 text-white sticky top-0 z-10">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-center p-3 font-medium">Specialization</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  {/* <th className="text-center p-3 font-medium">Assignment</th> */}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>Loading...</td></tr>
                ) : doctorsToShow.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-8 text-gray-500">No doctors found matching filters.</td></tr>
                ) : (
                  doctorsToShow.map((doctor, index) => {
                    const doctorId = doctor._id || doctor.id;
                    const isSelected = selectedDoctorIds.includes(doctorId);
                    const isCurrentlyAssignedToThisStudy = currentlyAssignedDoctorIds.includes(doctorId);
                    const isOnline = doctor.isLoggedIn;
                    const fullName = doctor.fullName || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
                    const displayName = fullName || doctor.email || 'Unknown Doctor';

                    return (
                      <tr
                        key={doctorId}
                        className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isCurrentlyAssignedToThisStudy ? 'bg-amber-50' : ''} ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''} hover:bg-blue-100 cursor-pointer`}
                        onClick={() => handleSelectDoctor(doctorId)}
                      >
                        <td className="p-3">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleSelectDoctor(doctorId);
                              }}
                              className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            {/* ✨ MODIFIED: Wrapped name and email in a div for better layout */}
                            <div>
                              <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-blue-600'}`}>
                                {/* Dr. {displayName} */}
                                 {displayName}

                              </span>
                              {/* <div className="text-xs text-gray-500"></div> */}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center text-gray-700">{doctor.email}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs sm:text-sm font-medium ${isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            <span className={`w-2 h-2 rounded-full mr-1 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block sm:hidden p-3">
            {loading ? (
              <div className="flex flex-col items-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-500 text-sm">Loading doctors...</p>
              </div>
            ) : doctorsToShow.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No doctors found matching filters.</div>
            ) : (
              <div className="space-y-3">
                {doctorsToShow.map((doctor) => {
                  const doctorId = doctor._id || doctor.id;
                  const isSelected = selectedDoctorIds.includes(doctorId);
                  const isCurrentlyAssignedToThisStudy = currentlyAssignedDoctorIds.includes(doctorId);
                  const isOnline = doctor.isLoggedIn;
                  const fullName = doctor.fullName || `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim();
                  const displayName = fullName || doctor.email || 'Unknown Doctor';

                  return (
                    <div
                      key={doctorId}
                      className={`border rounded-lg p-3 ${isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-300 bg-white'} ${isCurrentlyAssignedToThisStudy ? 'bg-amber-50 border-amber-300' : ''} cursor-pointer`}
                      onClick={() => handleSelectDoctor(doctorId)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => { e.stopPropagation(); handleSelectDoctor(doctorId); }}
                            className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 mt-1 focus:ring-blue-500"
                          />
                          <div>
                            <div className={`font-medium text-sm break-words ${isSelected ? 'text-blue-700' : 'text-blue-600'}`}>
                              {/* Dr. {displayName} */}
                               {displayName}

                            </div>
                            <div className="text-xs text-gray-500 break-all">{doctor.email}</div>
                            <div className="text-xs text-gray-600">{doctor.specialization || 'Radiology'}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                          {isCurrentlyAssignedToThisStudy && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              ✓ Assigned
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
        </div>

        {/* Footer */}
        {/* ✅ SIMPLE: Footer with Unassign All button */}
        <div className="border-t border-gray-200 p-3 sm:p-4 bg-gray-50 rounded-b-lg">
          <div className="flex flex-col gap-3">
            {/* Status Info */}
            <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
              {selectedDoctorIds.length > 0 ? (
                <>
                  {selectedDoctorIds.filter(id => !currentlyAssignedDoctorIds.includes(id)).length} new assignments, 
                  {selectedDoctorIds.filter(id => currentlyAssignedDoctorIds.includes(id)).length} will be unassigned
                </>
              ) : (
                'Select doctors to assign/unassign'
              )}
            </div>
            
            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center sm:justify-end">
              {/* ✅ UNASSIGN SELECTED BUTTON - Show when selected doctors are currently assigned */}
              {selectedDoctorIds.filter(id => currentlyAssignedDoctorIds.includes(id)).length > 0 && (
                <button
                  onClick={handleUnassignAll}
                  disabled={loading}
                  className="bg-orange-500 text-white px-4 sm:px-6 py-2 rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-sm flex-1 sm:flex-none justify-center"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Unassign Selected ({selectedDoctorIds.filter(id => currentlyAssignedDoctorIds.includes(id)).length})
                </button>
              )}
              
              {/* ASSIGN SELECTED BUTTON */}
              <button
                onClick={handleAssign}
                disabled={selectedDoctorIds.length === 0 || loading}
                className="bg-gray-600 text-white px-4 sm:px-6 py-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-sm flex-1 sm:flex-none justify-center"
              >
                <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Assign Selected ({selectedDoctorIds.filter(id => !currentlyAssignedDoctorIds.includes(id)).length})
              </button>
              
              {/* CLOSE BUTTON */}
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