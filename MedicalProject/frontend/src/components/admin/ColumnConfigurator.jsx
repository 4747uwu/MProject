// ColumnConfigurator.jsx
import React, { useState, useRef, useEffect } from 'react';

const ColumnConfigurator = ({ visibleColumns, onColumnChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const columnOptions = [
    { key: 'checkbox', label: 'Select All', defaultVisible: true },
    { key: 'status', label: 'Status', defaultVisible: true },
    { key: 'randomEmoji', label: 'Series Tree', defaultVisible: true },
    { key: 'user', label: 'User Info', defaultVisible: true },
    { key: 'downloadBtn', label: 'Download', defaultVisible: true },
    { key: 'discussion', label: 'Discussion', defaultVisible: true },
    { key: 'patientId', label: 'Patient ID', defaultVisible: true },
    { key: 'patientName', label: 'Patient Name', defaultVisible: true },
    { key: 'ageGender', label: 'Age/Gender', defaultVisible: true },
    { key: 'description', label: 'Description', defaultVisible: true },
    { key: 'series', label: 'Series Count', defaultVisible: true },
    { key: 'modality', label: 'Modality', defaultVisible: true },
    { key: 'location', label: 'Location', defaultVisible: true },
    { key: 'studyDate', label: 'Study Date', defaultVisible: true },
    { key: 'uploadDate', label: 'Upload Date', defaultVisible: false }, // 🔧 HIDDEN by default
    { key: 'reportedDate', label: 'Reported Date', defaultVisible: true },
    { key: 'reportedBy', label: 'Reported By', defaultVisible: false }, // 🔧 HIDDEN by default
    { key: 'accession', label: 'Accession', defaultVisible: false }, // 🔧 HIDDEN by default
    { key: 'seenBy', label: 'Seen By', defaultVisible: false }, // 🔧 HIDDEN by default
    { key: 'actions', label: 'Actions', defaultVisible: true },
    { key: 'report', label: 'Report', defaultVisible: true },
    { key: 'assignDoctor', label: 'Assign Doctor', defaultVisible: true }
  ];

  const handleToggleColumn = (columnKey) => {
    console.log('Toggling column:', columnKey, 'Current value:', visibleColumns[columnKey]);
    
    // Prevent deselecting these essential columns
    const essentialColumns = ['patientId', 'patientName', 'status'];
    if (essentialColumns.includes(columnKey) && visibleColumns[columnKey]) {
      alert(`${columnOptions.find(col => col.key === columnKey)?.label} is required and cannot be hidden.`);
      return;
    }

    // Call the parent's onColumnChange function
    onColumnChange(columnKey, !visibleColumns[columnKey]);
  };

  const handleSelectAll = () => {
    const allSelected = columnOptions.every(col => visibleColumns[col.key]);
    
    columnOptions.forEach(col => {
      onColumnChange(col.key, !allSelected);
    });
  };

  const handleSelectNone = () => {
    const essentialColumns = ['patientId', 'patientName', 'status'];
    
    columnOptions.forEach(col => {
      if (!essentialColumns.includes(col.key)) {
        onColumnChange(col.key, false);
      }
    });
  };

  // 🆕 NEW: Reset to Default function
  const handleResetToDefault = () => {
    columnOptions.forEach(col => {
      onColumnChange(col.key, col.defaultVisible);
    });
  };

  const getVisibleCount = () => {
    return columnOptions.filter(col => visibleColumns[col.key]).length;
  };

  const getDefaultCount = () => {
    return columnOptions.filter(col => col.defaultVisible).length;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        title="Configure visible columns"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
        </svg>
        <span>Columns ({getVisibleCount()}/{columnOptions.length})</span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Column Configuration</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Quick Actions */}
            <div className="flex space-x-2 mt-2">
              <button
                onClick={handleSelectAll}
                className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                Select All
              </button>
              <button
                onClick={handleSelectNone}
                className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Hide Optional
              </button>
              {/* 🆕 NEW: Reset to Default button */}
              <button
                onClick={handleResetToDefault}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                title={`Reset to default (${getDefaultCount()} columns)`}
              >
                Reset Default
              </button>
            </div>
          </div>

          {/* Column List */}
          <div className="py-2">
            {columnOptions.map((column) => {
              const isEssential = ['patientId', 'patientName', 'status'].includes(column.key);
              const isVisible = visibleColumns[column.key];
              const isDefault = column.defaultVisible;
              
              return (
                <div
                  key={column.key}
                  className={`flex items-center justify-between px-4 py-2 hover:bg-gray-50 cursor-pointer ${
                    isEssential ? 'bg-blue-50' : ''
                  } ${!isDefault ? 'bg-gray-25' : ''}`}
                  onClick={() => handleToggleColumn(column.key)}
                >
                  <div className="flex items-center space-x-3">
                    {/* Custom Checkbox */}
                    <div className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                      isVisible 
                        ? 'bg-blue-500 border-blue-500' 
                        : 'border-gray-300 bg-white'
                    } ${isEssential ? 'opacity-75' : ''}`}>
                      {isVisible && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    
                    <span className={`text-sm ${isEssential ? 'font-medium text-blue-700' : 'text-gray-700'} ${!isDefault ? 'italic' : ''}`}>
                      {column.label}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {!isDefault && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        Hidden by default
                      </span>
                    )}
                    {isEssential && (
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        Required
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600">
              {getVisibleCount()} of {columnOptions.length} columns visible • Default: {getDefaultCount()} columns
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnConfigurator;