import React from 'react';
import { ROW_HEIGHT } from '../utils/constants';

const VirtualTableHeader = ({ 
  columnVisibility, 
  onSort, 
  sortField, 
  sortDirection,
  onSelectAll,
  allSelected,
  someSelected 
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
      className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 flex items-center"
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
          className="w-12 flex justify-center items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('status')}
        >
          Status {getSortIcon('status')}
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
        <div className="w-16 flex justify-center items-center font-medium text-gray-700">
          User
        </div>
      )}

      {/* Download Button Column */}
      {columnVisibility?.downloadBtn && (
        <div className="w-16 flex justify-center items-center font-medium text-gray-700">
          Download
        </div>
      )}

      {/* Share Button Column */}
      {columnVisibility?.shareBtn && (
        <div className="w-16 flex justify-center items-center font-medium text-gray-700">
          Share
        </div>
      )}

      {/* Discussion Column */}
      {columnVisibility?.discussion && (
        <div className="w-16 flex justify-center items-center font-medium text-gray-700">
          Discussion
        </div>
      )}

      {/* Patient ID */}
      {columnVisibility?.patientId && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('patientId')}
        >
          Patient ID {getSortIcon('patientId')}
        </div>
      )}

      {/* Patient Name */}
      {columnVisibility?.patientName && (
        <div 
          className="w-48 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('patientName')}
        >
          Patient Name {getSortIcon('patientName')}
        </div>
      )}

      {/* Age/Gender */}
      {columnVisibility?.ageGender && (
        <div className="w-24 px-3 flex items-center font-medium text-gray-700">
          Age/Gender
        </div>
      )}

      {/* Description */}
      {columnVisibility?.description && (
        <div 
          className="flex-1 min-w-48 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('studyDescription')}
        >
          Description {getSortIcon('studyDescription')}
        </div>
      )}

      {/* Series */}
      {columnVisibility?.series && (
        <div className="w-24 px-3 flex items-center font-medium text-gray-700">
          S/I
        </div>
      )}

      {/* Modality */}
      {columnVisibility?.modality && (
        <div 
          className="w-24 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('modality')}
        >
          Modality {getSortIcon('modality')}
        </div>
      )}

      {/* Location */}
      {columnVisibility?.location && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('location')}
        >
          Location {getSortIcon('location')}
        </div>
      )}

      {/* Study Date */}
      {columnVisibility?.studyDate && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('studyDate')}
        >
          Study Date {getSortIcon('studyDate')}
        </div>
      )}

      {/* Upload Date */}
      {columnVisibility?.uploadDate && (
        <div 
          className="w-40 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('uploadedAt')}
        >
          Upload Date {getSortIcon('uploadedAt')}
        </div>
      )}

      {/* Reported Date */}
      {columnVisibility?.reportedDate && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('reportedAt')}
        >
          Reported Date {getSortIcon('reportedAt')}
        </div>
      )}

      {/* Reported By */}
      {columnVisibility?.reportedBy && (
        <div className="w-32 px-3 flex items-center font-medium text-gray-700">
          Reported By
        </div>
      )}

      {/* Accession */}
      {columnVisibility?.accession && (
        <div 
          className="w-32 px-3 flex items-center font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
          onClick={() => handleSort('accessionNumber')}
        >
          Accession {getSortIcon('accessionNumber')}
        </div>
      )}

      {/* Seen By */}
      {columnVisibility?.seenBy && (
        <div className="w-32 px-3 flex items-center font-medium text-gray-700">
          Seen By
        </div>
      )}

      {/* Actions */}
      {columnVisibility?.actions && (
        <div className="w-24 px-3 flex items-center font-medium text-gray-700">
          Actions
        </div>
      )}

      {/* Report */}
      {columnVisibility?.report && (
        <div className="w-20 flex justify-center items-center font-medium text-gray-700">
          Report
        </div>
      )}

      {/* Assign Doctor */}
      {columnVisibility?.assignDoctor && (
        <div className="w-32 px-3 flex items-center font-medium text-gray-700">
          Assign Doctor
        </div>
      )}
    </div>
  );
};

export default VirtualTableHeader;
