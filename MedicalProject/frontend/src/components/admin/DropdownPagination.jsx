import React from 'react';

const DropdownPagination = ({ 
  recordsPerPage, 
  onRecordsPerPageChange, 
  totalRecords,
  usePagination = true,
  loading = false 
}) => {
  const recordOptions = [10, 20, 50, 100, 500, 1000];

  const handleRecordsChange = (newLimit) => {
    console.log(`📊 DROPDOWN: Changing records per page to ${newLimit}`);
    onRecordsPerPageChange(newLimit);
  };

  return (
    <div className="flex items-center space-x-3">
      {/* Records per page selector */}
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600 font-medium">Show:</span>
        <select 
          value={recordsPerPage}
          onChange={(e) => handleRecordsChange(parseInt(e.target.value))}
          disabled={loading}
          className="border border-gray-300 rounded-md px-3 py-0 text-sm bg-white hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
        >
          {recordOptions.map(option => (
            <option key={option} value={option}>
              {option} records
            </option>
          ))}
        </select>
      </div>

      {/* Display mode indicator */}
      <div className="flex items-center space-x-2">
        {usePagination ? (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full flex items-center">
            📄 Paginated
          </span>
        ) : (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center">
            📜 Single Page ({totalRecords} total)
          </span>
        )}
      </div>

      {/* Info text */}
      <div className="text-xs text-gray-500">
        {usePagination 
          ? `${recordsPerPage} per page` 
          : `All ${totalRecords} records loaded`
        }
      </div>
    </div>
  );
};

export default DropdownPagination;