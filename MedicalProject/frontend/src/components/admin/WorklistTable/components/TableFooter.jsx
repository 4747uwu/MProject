import React from 'react';

const TableFooter = ({ 
  totalStudies, 
  filteredStudies, 
  selectedCount,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  className = '' 
}) => {
  const startIndex = filteredStudies > 0 ? 1 : 0;
  const endIndex = filteredStudies;

  return (
    <div className={`bg-white border-t border-gray-200 px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Left side - Study counts */}
        <div className="text-sm text-gray-700">
          {filteredStudies > 0 ? (
            <>
              Showing <span className="font-medium">{startIndex}</span> to{' '}
              <span className="font-medium">{endIndex}</span> of{' '}
              <span className="font-medium">{totalStudies}</span> studies
              {selectedCount > 0 && (
                <>
                  {' '}(<span className="font-medium">{selectedCount}</span> selected)
                </>
              )}
            </>
          ) : (
            <>No studies to display</>
          )}
        </div>

        {/* Right side - Pagination (if needed) */}
        {totalPages > 1 && onPageChange && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableFooter;
