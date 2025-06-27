import { useState, useMemo, useCallback } from 'react';
import { TABS } from '../utils/constants';
import { filterStudies, getStudyCountsByTab, sortStudies, debounce } from '../utils/worklistHelpers';

export const useStudyFiltering = (studies = []) => {
  const [activeTab, setActiveTab] = useState(TABS.ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('studyDate');
  const [sortDirection, setSortDirection] = useState('desc');

  // Debounced search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // Debounce search input
  const debouncedSetSearch = useMemo(
    () => debounce((query) => {
      setDebouncedSearchQuery(query);
    }, 300),
    []
  );

  // Update debounced search when search query changes
  const handleSearchChange = useCallback((query) => {
    setSearchQuery(query);
    debouncedSetSearch(query);
  }, [debouncedSetSearch]);

  // Get filtered and sorted studies
  const filteredStudies = useMemo(() => {
    let filtered = filterStudies(studies, activeTab, debouncedSearchQuery);
    return sortStudies(filtered, sortField, sortDirection);
  }, [studies, activeTab, debouncedSearchQuery, sortField, sortDirection]);

  // Get study counts by tab
  const studyCounts = useMemo(() => {
    return getStudyCountsByTab(studies);
  }, [studies]);

  // Handle tab change
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);

  // Handle sort change
  const handleSort = useCallback((field) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field with default direction
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setActiveTab(TABS.ALL);
    setSearchQuery('');
    setDebouncedSearchQuery('');
  }, []);

  // Reset sort to default
  const resetSort = useCallback(() => {
    setSortField('studyDate');
    setSortDirection('desc');
  }, []);

  return {
    // State
    activeTab,
    searchQuery,
    sortField,
    sortDirection,
    
    // Computed
    filteredStudies,
    studyCounts,
    
    // Actions
    handleTabChange,
    handleSearchChange,
    handleSort,
    clearFilters,
    resetSort
  };
};
