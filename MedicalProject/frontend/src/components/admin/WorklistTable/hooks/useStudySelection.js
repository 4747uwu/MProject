import { useState, useCallback, useMemo } from 'react';
import { toggleArrayItem, areAllSelected, areSomeSelected } from '../utils/worklistHelpers';
import { getStudyId } from '../utils/studyUtils';

export const useStudySelection = (studies = []) => {
  const [selectedStudyIds, setSelectedStudyIds] = useState([]);

  // Get study IDs for easy reference
  const studyIds = useMemo(() => {
    return studies.map(study => getStudyId(study));
  }, [studies]);

  // Check if all studies are selected
  const allSelected = useMemo(() => {
    return areAllSelected(studyIds, selectedStudyIds);
  }, [studyIds, selectedStudyIds]);

  // Check if some studies are selected
  const someSelected = useMemo(() => {
    return areSomeSelected(studyIds, selectedStudyIds);
  }, [studyIds, selectedStudyIds]);

  // Get selected studies
  const selectedStudies = useMemo(() => {
    return studies.filter(study => selectedStudyIds.includes(getStudyId(study)));
  }, [studies, selectedStudyIds]);

  // Toggle individual study selection
  const toggleStudy = useCallback((studyId) => {
    setSelectedStudyIds(prev => toggleArrayItem(prev, studyId));
  }, []);

  // Toggle all studies selection
  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedStudyIds([]);
    } else {
      setSelectedStudyIds([...studyIds]);
    }
  }, [allSelected, studyIds]);

  // Select specific studies
  const selectStudies = useCallback((studyIds) => {
    setSelectedStudyIds(studyIds);
  }, []);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedStudyIds([]);
  }, []);

  // Check if a specific study is selected
  const isStudySelected = useCallback((studyId) => {
    return selectedStudyIds.includes(studyId);
  }, [selectedStudyIds]);

  // Select studies by criteria
  const selectStudiesByCriteria = useCallback((predicate) => {
    const matchingIds = studies
      .filter(predicate)
      .map(study => getStudyId(study));
    setSelectedStudyIds(matchingIds);
  }, [studies]);

  // Add studies to selection
  const addToSelection = useCallback((studyIds) => {
    setSelectedStudyIds(prev => {
      const newIds = Array.isArray(studyIds) ? studyIds : [studyIds];
      const uniqueIds = [...new Set([...prev, ...newIds])];
      return uniqueIds;
    });
  }, []);

  // Remove studies from selection
  const removeFromSelection = useCallback((studyIds) => {
    setSelectedStudyIds(prev => {
      const idsToRemove = Array.isArray(studyIds) ? studyIds : [studyIds];
      return prev.filter(id => !idsToRemove.includes(id));
    });
  }, []);

  return {
    // State
    selectedStudyIds,
    
    // Computed
    allSelected,
    someSelected,
    selectedStudies,
    selectedCount: selectedStudyIds.length,
    
    // Actions
    toggleStudy,
    toggleAll,
    selectStudies,
    clearSelection,
    isStudySelected,
    selectStudiesByCriteria,
    addToSelection,
    removeFromSelection
  };
};
