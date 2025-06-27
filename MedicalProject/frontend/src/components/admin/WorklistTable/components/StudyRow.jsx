import React from 'react';
import StatusDot from './StatusDot';
import EyeIconOHIFButton from '../buttons/EyeIconOHIFButton';
import DownloadDropdown from '../buttons/DownloadDropdown';
import RandomEmojiButton from '../buttons/RandomEmojiButton';
import UserButton from '../buttons/UserButton';
import EyeIconDropdown from '../buttons/EyeIconDropdown';
import AssignDoctorButton from '../buttons/AssignDoctorButton';
import { 
  formatAgeGender, 
  formatStudyDate, 
  formatUploadDate,
  formatSeriesImagesCount,
  getModalityDisplay,
  getStudyDescription,
  hasReports,
  hasDiscussions,
  canDownloadStudy,
  canShareStudy
} from '../utils/studyUtils';
import { ROW_HEIGHT } from '../utils/constants';

const StudyRow = ({ 
  study, 
  columnVisibility,
  isSelected,
  onToggleSelect,
  onOpenInViewer,
  onShareStudy,
  onDownloadStudy,
  onOpenDiscussion,
  onViewReport,
  onAssignDoctor,
  doctors = []
}) => {
  const handleDoubleClick = () => {
    if (study.studyInstanceUID) {
      onOpenInViewer(study.studyInstanceUID);
    }
  };

  return (
    <div 
      className={`flex items-center border-b border-gray-200 hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50' : 'bg-white'
      }`}
      style={{ height: `${ROW_HEIGHT}px` }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Checkbox Column */}
      {columnVisibility?.checkbox && (
        <div className="w-12 flex justify-center items-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </div>
      )}

      {/* Status Column */}
      {columnVisibility?.status && (
        <div className="w-12 flex justify-center items-center">
          <StatusDot status={study.status} />
        </div>
      )}

      {/* Random Emoji Column */}
      {columnVisibility?.randomEmoji && (
        <div className="w-12 flex justify-center items-center">
          <RandomEmojiButton study={study} />
        </div>
      )}

      {/* User Column */}
      {columnVisibility?.user && (
        <div className="w-16 flex justify-center items-center">
          <UserButton study={study} />
        </div>
      )}

      {/* Download Button Column */}
      {columnVisibility?.downloadBtn && (
        <div className="w-16 flex justify-center items-center">
          {canDownloadStudy(study) && (
            <DownloadDropdown 
              study={study} 
              onDownload={onDownloadStudy}
            />
          )}
        </div>
      )}

      {/* Share Button Column */}
      {columnVisibility?.shareBtn && (
        <div className="w-16 flex justify-center items-center">
          {canShareStudy(study) && (
            <button
              onClick={() => onShareStudy(study._id)}
              className="p-1 text-gray-500 hover:text-blue-600"
              title="Share Study"
            >
              🔗
            </button>
          )}
        </div>
      )}

      {/* Discussion Column */}
      {columnVisibility?.discussion && (
        <div className="w-16 flex justify-center items-center">
          <button
            onClick={() => onOpenDiscussion(study._id)}
            className={`p-1 ${hasDiscussions(study) ? 'text-blue-600' : 'text-gray-400'} hover:text-blue-600`}
            title="Discussion"
          >
            💬
          </button>
        </div>
      )}

      {/* Patient ID */}
      {columnVisibility?.patientId && (
        <div className="w-32 px-3 flex items-center text-sm text-gray-900 truncate">
          {study.patientId || '-'}
        </div>
      )}

      {/* Patient Name */}
      {columnVisibility?.patientName && (
        <div className="w-48 px-3 flex items-center text-sm text-gray-900 truncate">
          {study.patientName || '-'}
        </div>
      )}

      {/* Age/Gender */}
      {columnVisibility?.ageGender && (
        <div className="w-24 px-3 flex items-center text-sm text-gray-900">
          {formatAgeGender(study)}
        </div>
      )}

      {/* Description */}
      {columnVisibility?.description && (
        <div className="flex-1 min-w-48 px-3 flex items-center text-sm text-gray-900 truncate">
          {getStudyDescription(study)}
        </div>
      )}

      {/* Series */}
      {columnVisibility?.series && (
        <div className="w-24 px-3 flex items-center text-sm text-gray-900">
          {formatSeriesImagesCount(study)}
        </div>
      )}

      {/* Modality */}
      {columnVisibility?.modality && (
        <div className="w-24 px-3 flex items-center text-sm text-gray-900">
          {getModalityDisplay(study)}
        </div>
      )}

      {/* Location */}
      {columnVisibility?.location && (
        <div className="w-32 px-3 flex items-center text-sm text-gray-900 truncate">
          {study.location || '-'}
        </div>
      )}

      {/* Study Date */}
      {columnVisibility?.studyDate && (
        <div className="w-32 px-3 flex items-center text-sm text-gray-900">
          {formatStudyDate(study.studyDate)}
        </div>
      )}

      {/* Upload Date */}
      {columnVisibility?.uploadDate && (
        <div className="w-40 px-3 flex items-center text-sm text-gray-900">
          {formatUploadDate(study.uploadedAt)}
        </div>
      )}

      {/* Reported Date */}
      {columnVisibility?.reportedDate && (
        <div className="w-32 px-3 flex items-center text-sm text-gray-900">
          {formatStudyDate(study.reportedAt)}
        </div>
      )}

      {/* Reported By */}
      {columnVisibility?.reportedBy && (
        <div className="w-32 px-3 flex items-center text-sm text-gray-900 truncate">
          {study.reportedBy || '-'}
        </div>
      )}

      {/* Accession */}
      {columnVisibility?.accession && (
        <div className="w-32 px-3 flex items-center text-sm text-gray-900 truncate">
          {study.accessionNumber || '-'}
        </div>
      )}

      {/* Seen By */}
      {columnVisibility?.seenBy && (
        <div className="w-32 px-3 flex items-center text-sm text-gray-900 truncate">
          {study.seenBy || '-'}
        </div>
      )}

      {/* Actions */}
      {columnVisibility?.actions && (
        <div className="w-24 px-3 flex justify-center items-center">
          <EyeIconDropdown 
            study={study} 
            onOpenInViewer={onOpenInViewer}
          />
        </div>
      )}

      {/* Report */}
      {columnVisibility?.report && (
        <div className="w-20 flex justify-center items-center">
          {hasReports(study) && (
            <button
              onClick={() => onViewReport(study._id)}
              className="p-1 text-green-600 hover:text-green-800"
              title="View Report"
            >
              📄
            </button>
          )}
        </div>
      )}

      {/* Assign Doctor */}
      {columnVisibility?.assignDoctor && (
        <div className="w-32 px-3 flex items-center">
          <AssignDoctorButton 
            study={study} 
            doctors={doctors}
            onAssign={onAssignDoctor}
          />
        </div>
      )}
    </div>
  );
};

export default StudyRow;
