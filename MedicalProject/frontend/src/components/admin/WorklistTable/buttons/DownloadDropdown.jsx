import React, { useState, useRef, useEffect } from 'react';

const DownloadDropdown = ({ study, onDownload, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownload = (format) => {
    if (onDownload) {
      onDownload(study._id, { format });
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
        title="Download Study"
      >
        ⬇️
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="py-1">
            <button
              onClick={() => handleDownload('dicom')}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Download DICOM
            </button>
            <button
              onClick={() => handleDownload('zip')}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Download ZIP
            </button>
            {study.hasReports && (
              <button
                onClick={() => handleDownload('report')}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Download Report
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DownloadDropdown;
