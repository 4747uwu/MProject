import { useState, useCallback } from 'react';
import { DEFAULT_COLUMN_VISIBILITY, ESSENTIAL_COLUMNS } from '../utils/constants';

export const useColumnVisibility = () => {
  const [columnVisibility, setColumnVisibility] = useState(DEFAULT_COLUMN_VISIBILITY);

  const toggleColumn = useCallback((columnKey) => {
    // Prevent hiding essential columns
    if (ESSENTIAL_COLUMNS.includes(columnKey)) {
      return;
    }

    setColumnVisibility(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }));
  }, []);

  const setColumnVisible = useCallback((columnKey, visible) => {
    // Prevent hiding essential columns
    if (ESSENTIAL_COLUMNS.includes(columnKey) && !visible) {
      return;
    }

    setColumnVisibility(prev => ({
      ...prev,
      [columnKey]: visible
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
  }, []);

  const isColumnVisible = useCallback((columnKey) => {
    return columnVisibility[columnKey] ?? true;
  }, [columnVisibility]);

  const getVisibleColumns = useCallback(() => {
    return Object.keys(columnVisibility).filter(key => columnVisibility[key]);
  }, [columnVisibility]);

  const isEssentialColumn = useCallback((columnKey) => {
    return ESSENTIAL_COLUMNS.includes(columnKey);
  }, []);

  return {
    columnVisibility,
    toggleColumn,
    setColumnVisible,
    resetToDefaults,
    isColumnVisible,
    getVisibleColumns,
    isEssentialColumn
  };
};
