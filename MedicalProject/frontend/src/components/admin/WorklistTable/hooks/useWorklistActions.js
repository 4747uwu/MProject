import { useCallback } from 'react';

export const useWorklistActions = ({ 
  onStudyDelete,
  onStudyArchive,
  onStudyAssign,
  onStudyShare,
  onStudyDownload,
  onDiscussionOpen,
  onReportView,
  onRefresh
}) => {

  // Delete selected studies
  const handleDeleteStudies = useCallback(async (studyIds) => {
    if (!onStudyDelete) return;
    
    try {
      await onStudyDelete(studyIds);
    } catch (error) {
      console.error('Failed to delete studies:', error);
      throw error;
    }
  }, [onStudyDelete]);

  // Archive selected studies
  const handleArchiveStudies = useCallback(async (studyIds) => {
    if (!onStudyArchive) return;
    
    try {
      await onStudyArchive(studyIds);
    } catch (error) {
      console.error('Failed to archive studies:', error);
      throw error;
    }
  }, [onStudyArchive]);

  // Assign doctor to studies
  const handleAssignDoctor = useCallback(async (studyIds, doctorId) => {
    if (!onStudyAssign) return;
    
    try {
      await onStudyAssign(studyIds, doctorId);
    } catch (error) {
      console.error('Failed to assign doctor:', error);
      throw error;
    }
  }, [onStudyAssign]);

  // Share study
  const handleShareStudy = useCallback(async (studyId, shareOptions = {}) => {
    if (!onStudyShare) return;
    
    try {
      return await onStudyShare(studyId, shareOptions);
    } catch (error) {
      console.error('Failed to share study:', error);
      throw error;
    }
  }, [onStudyShare]);

  // Download study
  const handleDownloadStudy = useCallback(async (studyId, downloadOptions = {}) => {
    if (!onStudyDownload) return;
    
    try {
      return await onStudyDownload(studyId, downloadOptions);
    } catch (error) {
      console.error('Failed to download study:', error);
      throw error;
    }
  }, [onStudyDownload]);

  // Open discussion
  const handleOpenDiscussion = useCallback(async (studyId) => {
    if (!onDiscussionOpen) return;
    
    try {
      return await onDiscussionOpen(studyId);
    } catch (error) {
      console.error('Failed to open discussion:', error);
      throw error;
    }
  }, [onDiscussionOpen]);

  // View report
  const handleViewReport = useCallback(async (studyId) => {
    if (!onReportView) return;
    
    try {
      return await onReportView(studyId);
    } catch (error) {
      console.error('Failed to view report:', error);
      throw error;
    }
  }, [onReportView]);

  // Refresh data
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    
    try {
      await onRefresh();
    } catch (error) {
      console.error('Failed to refresh data:', error);
      throw error;
    }
  }, [onRefresh]);

  // Bulk actions
  const handleBulkDelete = useCallback(async (selectedStudyIds) => {
    if (selectedStudyIds.length === 0) return;
    
    const confirmMessage = `Are you sure you want to delete ${selectedStudyIds.length} study(ies)?`;
    if (!window.confirm(confirmMessage)) return;
    
    return handleDeleteStudies(selectedStudyIds);
  }, [handleDeleteStudies]);

  const handleBulkArchive = useCallback(async (selectedStudyIds) => {
    if (selectedStudyIds.length === 0) return;
    
    const confirmMessage = `Are you sure you want to archive ${selectedStudyIds.length} study(ies)?`;
    if (!window.confirm(confirmMessage)) return;
    
    return handleArchiveStudies(selectedStudyIds);
  }, [handleArchiveStudies]);

  const handleBulkAssign = useCallback(async (selectedStudyIds, doctorId) => {
    if (selectedStudyIds.length === 0 || !doctorId) return;
    
    return handleAssignDoctor(selectedStudyIds, doctorId);
  }, [handleAssignDoctor]);

  // Open in OHIF viewer
  const handleOpenInViewer = useCallback((studyInstanceUID, seriesInstanceUID = null) => {
    const baseUrl = '/ohif/viewer';
    let url = `${baseUrl}?StudyInstanceUIDs=${studyInstanceUID}`;
    
    if (seriesInstanceUID) {
      url += `&SeriesInstanceUID=${seriesInstanceUID}`;
    }
    
    window.open(url, '_blank');
  }, []);

  return {
    // Individual actions
    handleDeleteStudies,
    handleArchiveStudies,
    handleAssignDoctor,
    handleShareStudy,
    handleDownloadStudy,
    handleOpenDiscussion,
    handleViewReport,
    handleRefresh,
    handleOpenInViewer,
    
    // Bulk actions
    handleBulkDelete,
    handleBulkArchive,
    handleBulkAssign
  };
};
