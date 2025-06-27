/**
 * Format patient age and gender for display
 */
export const formatAgeGender = (study) => {
  const age = study.patientAge || study.age;
  const gender = study.patientSex || study.gender;
  
  if (!age && !gender) return '-';
  if (!age) return gender;
  if (!gender) return age;
  
  return `${age}/${gender}`;
};

/**
 * Format study date for display
 */
export const formatStudyDate = (dateString) => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return '-';
  }
};

/**
 * Format upload date with time for display
 */
export const formatUploadDate = (dateString) => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '-';
  }
};

/**
 * Get study series count display
 */
export const getSeriesCount = (study) => {
  if (study.numberOfSeries) return study.numberOfSeries;
  if (study.seriesCount) return study.seriesCount;
  if (study.series && Array.isArray(study.series)) return study.series.length;
  return '-';
};

/**
 * Get study images count display
 */
export const getImagesCount = (study) => {
  if (study.numberOfImages) return study.numberOfImages;
  if (study.imagesCount) return study.imagesCount;
  if (study.images && Array.isArray(study.images)) return study.images.length;
  return '-';
};

/**
 * Format series and images count for display
 */
export const formatSeriesImagesCount = (study) => {
  const series = getSeriesCount(study);
  const images = getImagesCount(study);
  
  if (series === '-' && images === '-') return '-';
  if (series === '-') return `- / ${images}`;
  if (images === '-') return `${series} / -`;
  
  return `${series} / ${images}`;
};

/**
 * Get study priority level
 */
export const getStudyPriority = (study) => {
  return study.priority || study.studyPriority || 'ROUTINE';
};

/**
 * Check if study has reports
 */
export const hasReports = (study) => {
  return study.hasReports || 
         (study.reports && study.reports.length > 0) ||
         study.reportStatus === 'completed';
};

/**
 * Get assigned doctor information
 */
export const getAssignedDoctor = (study) => {
  return study.assignedDoctor || study.doctor || study.radiologist;
};

/**
 * Check if study is assigned to a doctor
 */
export const isAssignedToDoctor = (study) => {
  const doctor = getAssignedDoctor(study);
  return doctor && (doctor.name || doctor.firstName || doctor.username);
};

/**
 * Get doctor display name
 */
export const getDoctorDisplayName = (doctor) => {
  if (!doctor) return '';
  
  if (doctor.name) return doctor.name;
  if (doctor.firstName && doctor.lastName) {
    return `${doctor.firstName} ${doctor.lastName}`;
  }
  if (doctor.firstName) return doctor.firstName;
  if (doctor.username) return doctor.username;
  
  return 'Unknown Doctor';
};

/**
 * Generate study identifier for keys and references
 */
export const getStudyId = (study) => {
  return study._id || study.id || study.studyInstanceUID || study.studyId;
};

/**
 * Check if study can be downloaded
 */
export const canDownloadStudy = (study) => {
  return study.downloadAvailable !== false && 
         study.status !== 'archived' &&
         (study.dicomFiles && study.dicomFiles.length > 0);
};

/**
 * Check if study can be shared
 */
export const canShareStudy = (study) => {
  return study.shareAvailable !== false && 
         study.status !== 'archived';
};

/**
 * Get study modality display
 */
export const getModalityDisplay = (study) => {
  return study.modality || study.studyModality || '-';
};

/**
 * Get study description for display
 */
export const getStudyDescription = (study) => {
  return study.studyDescription || study.description || study.procedureDescription || '-';
};

/**
 * Check if study has discussions
 */
export const hasDiscussions = (study) => {
  return study.hasDiscussions || 
         (study.discussions && study.discussions.length > 0) ||
         study.discussionCount > 0;
};
