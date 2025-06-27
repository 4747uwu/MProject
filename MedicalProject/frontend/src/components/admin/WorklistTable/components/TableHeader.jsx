import React from 'react';
import { ROW_HEIGHT } from '../utils/constants';

const TableHeader = ({ 
  columnVisibility, 
  onSort, 
  sortField, 
  sortDirection,
  onSelectAll,
  allSelected,
  someSelected,
  className = ''
}) => {
  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleSort = (field) => {
    if (onSort) onSort(field);
  };

  return (
    <div 
      className={`bg-gray-50 border-b border-gray-200 flex items-center sticky top-0 z-10 ${className}`}
      style={{ height: `${ROW_HEIGHT}px` }}
    >
      {/* Checkbox Column */}
      {columnVisibility?.checkbox && (
        <div className="w-12 flex justify-center items-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={input => {
              if (input) input.indeterminate = someSelected && !allSelected;
            }}
            onChange={onSelectAll}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </div>
      )}

      {/* Status Column */}
      {columnVisibility?.status && (
        <div 
          className="w-12 flex justify-center items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => handleSort('status')}
          title="Sort by Status"
        >
          <span className="text-xs">Status {getSortIcon('status')}</span>
        </div>
      )}

      {/* Random Emoji Column */}
      {columnVisibility?.randomEmoji && (
        <div className="w-12 flex justify-center items-center font-medium text-gray-700">
          🎯
        </div>
      )}

      {/* User Column */}
      {columnVisibility?.user && (
        <div className="w-16 flex justify-center items-center font-medium text-gray-700 text-xs">
          User
        </div>
      )}

      {/* Download Button Column */}
      {columnVisibility?.downloadBtn && (
        <div className="w-16 flex justify-center items-center font-medium text-gray-700 text-xs">
          Download
        </div>
      )}

      {/* Share Button Column */}
      {columnVisibility?.shareBtn && (
        <div className="w-16 flex justify-center items-center font-medium text-gray-700 text-xs">
          Share
        </div>
      )}

      {/* Discussion Column */}
      {columnVisibility?.discussion && (
        <div className="w-16 flex justify-center items-center font-medium text-gray-700 text-xs">
          Chat
        </div>
      )}

      {/* Patient ID */}
      {columnVisibility?.patientId && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('patientId')}
          title="Sort by Patient ID"
        >
          Patient ID {getSortIcon('patientId')}
        </div>
      )}

      {/* Patient Name */}
      {columnVisibility?.patientName && (
        <div 
          className="w-48 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('patientName')}
          title="Sort by Patient Name"
        >
          Patient Name {getSortIcon('patientName')}
        </div>
      )}

      {/* Age/Gender */}
      {columnVisibility?.ageGender && (
        <div className="w-24 px-3 flex items-center font-medium text-gray-700 text-xs">
          Age/Gender
        </div>
      )}

      {/* Description */}
      {columnVisibility?.description && (
        <div 
          className="flex-1 min-w-48 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('studyDescription')}
          title="Sort by Description"
        >
          Study Description {getSortIcon('studyDescription')}
        </div>
      )}

      {/* Series */}
      {columnVisibility?.series && (
        <div className="w-24 px-3 flex items-center font-medium text-gray-700 text-xs" title="Series / Images">
          S/I
        </div>
      )}

      {/* Modality */}
      {columnVisibility?.modality && (
        <div 
          className="w-24 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('modality')}
          title="Sort by Modality"
        >
          Modality {getSortIcon('modality')}
        </div>
      )}

      {/* Location */}
      {columnVisibility?.location && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('location')}
          title="Sort by Location"
        >
          Location {getSortIcon('location')}
        </div>
      )}

      {/* Study Date */}
      {columnVisibility?.studyDate && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('studyDate')}
          title="Sort by Study Date"
        >
          Study Date {getSortIcon('studyDate')}
        </div>
      )}

      {/* Upload Date */}
      {columnVisibility?.uploadDate && (
        <div 
          className="w-40 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('uploadedAt')}
          title="Sort by Upload Date"
        >
          Upload Date {getSortIcon('uploadedAt')}
        </div>
      )}

      {/* Reported Date */}
      {columnVisibility?.reportedDate && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('reportedAt')}
          title="Sort by Reported Date"
        >
          Reported {getSortIcon('reportedAt')}
        </div>
      )}

      {/* Reported By */}
      {columnVisibility?.reportedBy && (
        <div className="w-32 px-3 flex items-center font-medium text-gray-700 text-xs">
          Reported By
        </div>
      )}

      {/* Accession */}
      {columnVisibility?.accession && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors text-xs"
          onClick={() => handleSort('accessionNumber')}
          title="Sort by Accession Number"
        >
          Accession {getSortIcon('accessionNumber')}
        </div>
      )}

      {/* Seen By */}
      {columnVisibility?.seenBy && (
        <div className="w-32 px-3 flex items-center font-medium text-gray-700 text-xs">
          Seen By
        </div>
      )}

      {/* Actions */}
      {columnVisibility?.actions && (
        <div className="w-24 px-3 flex items-center font-medium text-gray-700 text-xs">
          Actions
        </div>
      )}

      {/* Report */}
      {columnVisibility?.report && (
        <div className="w-20 flex justify-center items-center font-medium text-gray-700 text-xs">
          Report
        </div>
      )}

      {/* Assign Doctor */}
      {columnVisibility?.assignDoctor && (
        <div className="w-32 px-3 flex items-center font-medium text-gray-700 text-xs">
          Assign Doctor
        </div>
      )}
    </div>
  );
};

export default TableHeader;
