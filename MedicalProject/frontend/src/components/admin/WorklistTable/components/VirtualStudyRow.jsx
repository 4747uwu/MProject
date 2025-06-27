import React from 'react';
import StudyRow from './StudyRow';
import { ROW_HEIGHT } from '../utils/constants';
import { getStudyId } from '../utils/studyUtils';

const VirtualStudyRow = ({ 
  study, 
  index,
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
  const studyId = getStudyId(study);

  return (
    <div 
      className="absolute w-full"
      style={{ 
        height: `${ROW_HEIGHT}px`,
        top: `${index * ROW_HEIGHT}px`
      }}
    >
      <StudyRow
        study={study}
        columnVisibility={columnVisibility}
        isSelected={isSelected}
        onToggleSelect={() => onToggleSelect(studyId)}
        onOpenInViewer={onOpenInViewer}
        onShareStudy={onShareStudy}
        onDownloadStudy={onDownloadStudy}
        onOpenDiscussion={onOpenDiscussion}
        onViewReport={onViewReport}
        onAssignDoctor={onAssignDoctor}
        doctors={doctors}
      />
    </div>
  );
};

export default VirtualStudyRow;
