import React from 'react';

const LoadingSpinner = ({ size = 'medium', color = 'blue' }) => {
  // Size mappings
  const sizeClasses = {
    small: 'h-5 w-5',
    medium: 'h-10 w-10',
    large: 'h-16 w-16'
  };
  
  // Color mappings
  const colorClasses = {
    blue: 'border-blue-500',
    green: 'border-green-500',
    red: 'border-red-500',
    gray: 'border-gray-500',
    primary: 'border-blue-600'
  };
  
  const spinnerSize = sizeClasses[size] || sizeClasses.medium;
  const spinnerColor = colorClasses[color] || colorClasses.blue;
  
  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`animate-spin rounded-full ${spinnerSize} border-t-2 border-b-2 ${spinnerColor}`}></div>
      <p className="mt-2 text-gray-600 text-sm">Loading...</p>
    </div>
  );
};

export default LoadingSpinner;