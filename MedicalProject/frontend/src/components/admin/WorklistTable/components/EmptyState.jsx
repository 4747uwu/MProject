import React from 'react';

const EmptyState = ({ 
  activeTab, 
  searchQuery, 
  onClearFilters,
  className = '' 
}) => {
  const getEmptyMessage = () => {
    if (searchQuery?.trim()) {
      return {
        title: 'No studies found',
        message: `No studies match your search query "${searchQuery}".`,
        action: 'Clear search to see all studies.'
      };
    }

    switch (activeTab) {
      case 'pending':
        return {
          title: 'No pending studies',
          message: 'There are no studies waiting for assignment or review.',
          action: 'New studies will appear here when uploaded.'
        };
      case 'inprogress':
        return {
          title: 'No studies in progress',
          message: 'There are no studies currently being reviewed.',
          action: 'Studies appear here when assigned to doctors.'
        };
      case 'completed':
        return {
          title: 'No completed studies',
          message: 'There are no studies with finalized reports.',
          action: 'Completed studies will appear here.'
        };
      case 'archived':
        return {
          title: 'No archived studies',
          message: 'There are no archived studies.',
          action: 'Archived studies will appear here.'
        };
      default:
        return {
          title: 'No studies available',
          message: 'There are no studies in the system.',
          action: 'Upload DICOM files to get started.'
        };
    }
  };

  const { title, message, action } = getEmptyMessage();

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
      {/* Empty state icon */}
      <div className="w-24 h-24 mx-auto mb-4 text-gray-300">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1} 
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
          />
        </svg>
      </div>

      {/* Empty state text */}
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {title}
      </h3>
      
      <p className="text-gray-500 text-center mb-4 max-w-md">
        {message}
      </p>
      
      <p className="text-sm text-gray-400 text-center mb-6">
        {action}
      </p>

      {/* Action buttons */}
      <div className="flex space-x-3">
        {(searchQuery?.trim() || activeTab !== 'all') && onClearFilters && (
          <button
            onClick={onClearFilters}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
          >
            Clear Filters
          </button>
        )}
        
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
};

export default EmptyState;
