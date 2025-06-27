import React from 'react';

const UserButton = ({ study, className = '' }) => {
  const hasClinicalHistory = study.clinicalHistory && study.clinicalHistory.trim() !== '';
  
  const handleUserClick = () => {
    console.log('User button clicked for study:', study._id);
  };

  return (
    <div className="relative flex items-center justify-center">
      <button 
        onClick={handleUserClick}
        className={`transition-colors duration-200 p-1 hover:bg-blue-50 rounded ${
          hasClinicalHistory 
            ? 'text-blue-600 hover:text-blue-800' 
            : 'text-gray-400 hover:text-gray-500'
        } ${className}`}
        title={hasClinicalHistory ? "Clinical history available" : "No clinical history"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
      
      {/* Green indicator dot when clinical history is available */}
      {hasClinicalHistory && (
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      )}
    </div>
  );
};

export default UserButton;
