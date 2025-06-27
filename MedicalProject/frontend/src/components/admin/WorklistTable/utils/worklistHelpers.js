import { STATUS_CONFIG, CATEGORY_COLORS } from './constants';

/**
 * Get status configuration for a given status
 */
export const getStatusConfig = (status) => {
  return STATUS_CONFIG[status] || STATUS_CONFIG.default;
};

/**
 * Get category color for a given status
 */
export const getStatusCategoryColor = (status) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.default;
  return CATEGORY_COLORS[config.category] || CATEGORY_COLORS.unknown;
};

/**
 * Get category for a given status
 */
export const getStatusCategory = (status) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.default;
  return config.category;
};
/**
 * Determine the tab category for a study based on its status
 */
export const getStudyTabCategory = (study) => {
  const status = study.status?.toLowerCase();
  
  if (!status || status === 'new_study_received' || status === 'new' || status === 'pending_assignment') {
    return 'pending';
  }
  
  if (status === 'assigned_to_doctor' || status === 'doctor_opened_report' || status === 'report_in_progress') {
    return 'inprogress';
  }
  
  if (status === 'report_finalized' || status === 'report_uploaded' || 
      status === 'report_downloaded_radiologist' || status === 'report_downloaded' || 
      status === 'final_report_downloaded') {
    return 'completed';
  }
  
  if (status === 'archived') {
    return 'archived';
  }
  
  return 'pending';
};

/**
 * Filter studies based on active tab and search query
 */
export const filterStudies = (studies, activeTab, searchQuery) => {
  if (!Array.isArray(studies)) return [];
  
  let filtered = studies;
  
  // Filter by tab
  if (activeTab !== 'all') {
    filtered = filtered.filter(study => getStudyTabCategory(study) === activeTab);
  }
  
  // Filter by search query
  if (searchQuery?.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(study => {
      return (
        study.patientName?.toLowerCase().includes(query) ||
        study.patientId?.toLowerCase().includes(query) ||
        study.studyDescription?.toLowerCase().includes(query) ||
        study.modality?.toLowerCase().includes(query) ||
        study.accessionNumber?.toLowerCase().includes(query) ||
        study.location?.toLowerCase().includes(query)
      );
    });
  }
  
  return filtered;
};

/**
 * Get count of studies by tab category
 */
export const getStudyCountsByTab = (studies) => {
  if (!Array.isArray(studies)) {
    return { all: 0, pending: 0, inprogress: 0, completed: 0, archived: 0 };
  }
  
  const counts = {
    all: studies.length,
    pending: 0,
    inprogress: 0,
    completed: 0,
    archived: 0
  };
  
  studies.forEach(study => {
    const category = getStudyTabCategory(study);
    if (counts.hasOwnProperty(category)) {
      counts[category]++;
    }
  });
  
  return counts;
};

/**
 * Sort studies by a given field and direction
 */
export const sortStudies = (studies, sortField, sortDirection = 'asc') => {
  if (!Array.isArray(studies) || !sortField) return studies;
  
  return [...studies].sort((a, b) => {
    let aValue = a[sortField];
    let bValue = b[sortField];
    
    // Handle date fields
    if (sortField.includes('Date') || sortField === 'studyDate') {
      aValue = new Date(aValue);
      bValue = new Date(bValue);
    }
    
    // Handle string comparisons
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }
    
    // Handle null/undefined values
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return sortDirection === 'asc' ? 1 : -1;
    if (bValue == null) return sortDirection === 'asc' ? -1 : 1;
    
    // Compare values
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
};

/**
 * Toggle item in array (for selections)
 */
export const toggleArrayItem = (array, item) => {
  const index = array.indexOf(item);
  if (index > -1) {
    return array.filter((_, i) => i !== index);
  } else {
    return [...array, item];
  }
};

/**
 * Check if all items are selected
 */
export const areAllSelected = (allItems, selectedItems) => {
  return allItems.length > 0 && allItems.every(item => selectedItems.includes(item));
};

/**
 * Check if some (but not all) items are selected
 */
export const areSomeSelected = (allItems, selectedItems) => {
  return selectedItems.length > 0 && !areAllSelected(allItems, selectedItems);
};

/**
 * Debounce function for search inputs
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};
