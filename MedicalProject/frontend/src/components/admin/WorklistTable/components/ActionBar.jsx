import React from 'react';

const ActionBar = ({ 
  selectedCount,
  onBulkDelete,
  onBulkArchive,
  onBulkAssign,
  onRefresh,
  searchQuery,
  onSearchChange,
  onColumnToggle,
  className = ''
}) => {
  const handleSearchChange = (e) => {
    if (onSearchChange) {
      onSearchChange(e.target.value);
    }
  };

  return (
    <div className={`bg-white border-b border-gray-200 px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Left side - Search and bulk actions */}
        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search studies..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Bulk actions when items are selected */}
          {selectedCount > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {selectedCount} selected
              </span>
              
              {onBulkDelete && (
                <button
                  onClick={onBulkDelete}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              )}
              
              {onBulkArchive && (
                <button
                  onClick={onBulkArchive}
                  className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                >
                  Archive
                </button>
              )}
              
              {onBulkAssign && (
                <button
                  onClick={onBulkAssign}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Assign
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right side - Utility actions */}
        <div className="flex items-center space-x-2">
          {/* Column visibility toggle */}
          {onColumnToggle && (
            <button
              onClick={onColumnToggle}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title="Toggle Columns"
            >
              🏛️ Columns
            </button>
          )}

          {/* Refresh button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
              title="Refresh"
            >
              🔄 Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActionBar;
