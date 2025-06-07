import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

const DoctorAssignmentModal = ({ isOpen, onClose, study, onAssignComplete }) => {
  const [doctors, setDoctors] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [selectedDoctorIds, setSelectedDoctorIds] = useState([]); // Array for checkboxes
  const [currentlyAssignedDoctor, setCurrentlyAssignedDoctor] = useState(null);

  // Reset selected doctors when study changes
  useEffect(() => {
    console.log('🔄 Study changed, resetting selection:', study?.lastAssignedDoctor);
    
    if (study?.lastAssignedDoctor && typeof study.lastAssignedDoctor === 'string') {
      setSelectedDoctorIds([study.lastAssignedDoctor]);
    } else {
      setSelectedDoctorIds([]); // 🔧 FIXED: Always start with empty array
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
        setAllDoctors(allDoctorsList);
        console.log('👨‍⚕️ Loaded doctors:', allDoctorsList.length);
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

    setDoctors(filteredDoctors);
  };

  const handleSelectDoctor = (doctorId) => {
    console.log('🎯 Selecting doctor:', doctorId, 'Type:', typeof doctorId);
    
    // 🔧 FIXED: Clean state update - filter out any non-string values
    setSelectedDoctorIds(prev => {
      console.log('📋 Previous selected IDs:', prev);
      
      // 🔧 FIXED: Clean the array of any non-string values first
      const cleanPrev = prev.filter(id => typeof id === 'string');
      
      if (cleanPrev.includes(doctorId)) {
        const newIds = cleanPrev.filter(id => id !== doctorId);
        console.log('✅ Unselected doctor, new IDs:', newIds);
        return newIds;
      } else {
        const newIds = [...cleanPrev, doctorId];
        console.log('✅ Selected doctor, new IDs:', newIds);
        return newIds;
      }
    });
  };

  const handleAssign = async () => {
    // 🔧 FIXED: Clean the selected IDs array before processing
    const cleanSelectedIds = selectedDoctorIds.filter(id => typeof id === 'string');
    
    console.log('🔍 All selected IDs:', selectedDoctorIds);
    console.log('🧹 Clean selected IDs:', cleanSelectedIds);
    
    if (cleanSelectedIds.length === 0) {
      toast.error('Please select at least one doctor');
      return;
    }

    // 🔧 FIXED: Use the first clean ID
    const selectedDoctorId = cleanSelectedIds[0];
    
    console.log('🔄 Assignment details:', {
      studyId: study._id,
      selectedDoctorId: selectedDoctorId,
      selectedDoctorIdType: typeof selectedDoctorId,
      cleanSelectedIds: cleanSelectedIds,
      originalSelectedIds: selectedDoctorIds,
      study: study
    });

    // 🔧 VALIDATION: Ensure we have a valid string ID
    if (!selectedDoctorId || typeof selectedDoctorId !== 'string') {
      console.error('❌ Invalid doctor ID:', selectedDoctorId);
      toast.error('Invalid doctor selection. Please try again.');
      return;
    }

    try {
      const loadingToast = toast.loading('Assigning study to doctor...');
      
      const requestData = {
        doctorId: selectedDoctorId, // 🔧 This should now be a clean string
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
        toast.success('Study assigned successfully!');
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
      
      const errorMessage = error.response?.data?.message || error.message || 'Failed to assign doctor - please try again';
      toast.error(errorMessage);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setAssignmentFilter('');
  };

  if (!isOpen) return null;

  const patientName = study?.patientName || 'Unknown Patient';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        
        {/* Header exactly like image */}
        <div className="bg-gray-600 text-white p-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-lg font-medium">
            Assign Study : {patientName}
          </h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 text-xl font-bold w-6 h-6 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Search and Filter Bar exactly like image */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <select 
              className="border border-gray-300 rounded px-3 py-1 text-sm bg-white min-w-24"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
            >
              <option value="">SELECT</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
            
            <div className="flex items-center border border-gray-300 rounded bg-white px-2 py-1 flex-1 max-w-xs">
              <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="FILTER RADIOLOGIST NAME..."
                className="flex-1 outline-none text-sm text-gray-600 placeholder-gray-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {(searchTerm || assignmentFilter) && (
              <button 
                className="text-blue-500 hover:text-blue-700 text-sm flex items-center"
                onClick={clearFilters}
              >
                ✕Clear
              </button>
            )}
          </div>
        </div>

        {/* 🔧 Debug Panel - Shows clean vs original IDs */}
        

        {/* Table exactly like image */}
        <div className="flex-1 overflow-auto">
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
                  </td>
                </tr>
              ) : (
                doctors.map((doctor, index) => {
                  const doctorId = doctor._id || doctor.id;
                  // 🔧 FIXED: Check against clean IDs only
                  const cleanSelectedIds = selectedDoctorIds.filter(id => typeof id === 'string');
                  const isSelected = cleanSelectedIds.includes(doctorId);
                  const isOnline = doctor.isLoggedIn;
                  
                  const displayName = doctor.email || 'Unknown Doctor';
                  
                  return (
                    <tr 
                      key={doctorId}
                      className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 cursor-pointer`}
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
                            className="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300"
                          />
                          <span className="text-blue-600 hover:underline font-medium">
                            {displayName.toUpperCase()}
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

        {/* Footer exactly like image */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-pink-600">
              Note : An assign study should be have clinical history...!
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAssign}
                disabled={selectedDoctorIds.filter(id => typeof id === 'string').length === 0}
                className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Assign
              </button>
              <button
                onClick={onClose}
                className="bg-red-500 text-white px-6 py-2 rounded hover:bg-red-600 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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