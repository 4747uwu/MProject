import React, { useState, useRef, useEffect } from 'react';
import { getAssignedDoctor, getDoctorDisplayName } from '../utils/studyUtils';

const AssignDoctorButton = ({ study, doctors = [], onAssign, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAssignDoctor = (doctorId) => {
    if (onAssign) {
      onAssign([study._id], doctorId);
    }
    setIsOpen(false);
  };

  const handleUnassign = () => {
    if (onAssign) {
      onAssign([study._id], null);
    }
    setIsOpen(false);
  };

  const assignedDoctor = getAssignedDoctor(study);
  const isAssigned = !!assignedDoctor;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1 text-xs rounded border ${
          isAssigned 
            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
        } transition-colors`}
        title={isAssigned ? `Assigned to: ${getDoctorDisplayName(assignedDoctor)}` : 'Assign Doctor'}
      >
        {isAssigned ? (
          <>
            👨‍⚕️ {getDoctorDisplayName(assignedDoctor).split(' ')[0]}
          </>
        ) : (
          <>
            + Assign
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
          <div className="py-1">
            {isAssigned && (
              <>
                <button
                  onClick={handleUnassign}
                  className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  ❌ Unassign Doctor
                </button>
                <div className="border-t border-gray-100 my-1"></div>
              </>
            )}
            
            {doctors.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                No doctors available
              </div>
            ) : (
              doctors.map((doctor) => {
                const doctorName = getDoctorDisplayName(doctor);
                const isCurrentlyAssigned = assignedDoctor && 
                  (assignedDoctor._id === doctor._id || assignedDoctor.id === doctor.id);
                
                return (
                  <button
                    key={doctor._id || doctor.id}
                    onClick={() => handleAssignDoctor(doctor._id || doctor.id)}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${
                      isCurrentlyAssigned 
                        ? 'bg-green-50 text-green-700 font-medium' 
                        : 'text-gray-700'
                    }`}
                    title={`Assign to ${doctorName}`}
                  >
                    {isCurrentlyAssigned && '✓ '}
                    👨‍⚕️ {doctorName}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignDoctorButton;
