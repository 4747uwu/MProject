import React from 'react';

const StatusDot = ({ status, priority }) => {
  const getStatusConfig = () => {
    const isEmergency = priority === 'EMERGENCY';
    
    switch (status) {
      case 'report_finalized':
      case 'final_report_downloaded':
        return {
          color: 'bg-green-500',
          pulse: false,
          size: 'w-3 h-3',
          label: 'Finalized'
        };
      
      case 'report_in_progress':
      case 'doctor_opened_report':
        return {
          color: isEmergency ? 'bg-red-500' : 'bg-yellow-500',
          pulse: isEmergency,
          size: 'w-3 h-3',
          label: 'In Progress'
        };
      
      case 'assigned_to_doctor':
        return {
          color: isEmergency ? 'bg-red-500' : 'bg-blue-500',
          pulse: isEmergency,
          size: 'w-3 h-3',
          label: 'Assigned'
        };
      
      case 'uploaded':
      case 'pending':
      default:
        return {
          color: isEmergency ? 'bg-red-500' : 'bg-gray-400',
          pulse: isEmergency,
          size: 'w-3 h-3',
          label: 'Pending'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center">
      <div 
        className={`${config.color} ${config.size} rounded-full ${config.pulse ? 'animate-pulse' : ''}`}
        title={`Status: ${config.label}`}
      />
    </div>
  );
};

export default StatusDot;