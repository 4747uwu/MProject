import React, { useState } from 'react';

const StatusLegend = () => {
  const [isOpen, setIsOpen] = useState(false);

  const statusItems = [
    { status: 'new_study_received', color: 'bg-red-500', label: 'New Study Received' },
    { status: 'pending_assignment', color: 'bg-yellow-500', label: 'Pending Assignment' },
    { status: 'assigned_to_doctor', color: 'bg-yellow-500', label: 'Assigned to Doctor' },
    { status: 'report_in_progress', color: 'bg-orange-500', label: 'Report in Progress' },
    { status: 'report_finalized', color: 'bg-blue-500', label: 'Report Finalized' },
    { status: 'report_downloaded_radiologist', color: 'bg-amber-600', label: 'Downloaded by Radiologist' },
    { status: 'report_downloaded', color: 'bg-gray-500', label: 'Report Downloaded' },
    { status: 'final_report_downloaded', color: 'bg-green-500', label: 'Final Report Downloaded' },
    { status: 'archived', color: 'bg-gray-400', label: 'Archived' },
  ];

  const EmergencyIcon = () => (
    <svg width="20" height="20" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="greenGradLegend" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a8e063"/>
          <stop offset="100%" stopColor="#56ab2f"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#greenGradLegend)" />
      <rect x="30" y="18" width="4" height="28" fill="#fff"/>
      <rect x="18" y="30" width="28" height="4" fill="#fff"/>
    </svg>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
        title="Status Legend"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Status Legend</h3>
            
            <div className="space-y-2">
              {statusItems.map((item) => (
                <div key={item.status} className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                  <span className="text-xs text-gray-700">{item.label}</span>
                </div>
              ))}
              
              <div className="border-t border-gray-200 pt-2 mt-2">
                <div className="flex items-center space-x-2">
                  <EmergencyIcon />
                  <span className="text-xs text-gray-700 font-medium">Emergency/Urgent/STAT</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default StatusLegend;