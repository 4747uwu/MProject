import React, { useState } from 'react';
import { useRadiantLaunch } from '../../hooks/useRadiantLaunch';
import RadiantLaunchModal from '../admin/RadiantLaunchModal';

const LaunchButton = ({ 
  study, 
  variant = 'button', // 'button', 'dropdown-item', 'icon'
  size = 'md', // 'sm', 'md', 'lg'
  showModal = true,
  onLaunchSuccess,
  className = ''
}) => {
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const { launchStudy, isLaunching } = useRadiantLaunch();

  // Quick launch (no modal)
  const handleQuickLaunch = async () => {
    try {
      const result = await launchStudy(study);
      onLaunchSuccess?.(result);
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  // Launch with modal
  const handleModalLaunch = () => {
    setShowLaunchModal(true);
  };

  const handleLaunchSuccess = (result) => {
    setShowLaunchModal(false);
    onLaunchSuccess?.(result);
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  // Variant rendering
  if (variant === 'icon') {
    return (
      <>
        <button
          onClick={showModal ? handleModalLaunch : handleQuickLaunch}
          disabled={isLaunching || !study.orthancStudyID}
          className={`text-purple-600 hover:text-purple-800 transition-colors p-1 hover:bg-purple-50 rounded ${className}`}
          title="Launch in RadiAnt Desktop Viewer"
        >
          {isLaunching ? (
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
        </button>

        {showLaunchModal && (
          <RadiantLaunchModal
            study={study}
            isOpen={showLaunchModal}
            onClose={() => setShowLaunchModal(false)}
            onLaunchSuccess={handleLaunchSuccess}
          />
        )}
      </>
    );
  }

  if (variant === 'dropdown-item') {
    return (
      <>
        <button
          onClick={showModal ? handleModalLaunch : handleQuickLaunch}
          disabled={isLaunching || !study.orthancStudyID}
          className={`flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 transition-colors disabled:opacity-50 ${className}`}
        >
          {isLaunching ? (
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2"></div>
          ) : (
            <svg className="h-4 w-4 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          🚀 Launch RadiAnt Desktop
        </button>

        {showLaunchModal && (
          <RadiantLaunchModal
            study={study}
            isOpen={showLaunchModal}
            onClose={() => setShowLaunchModal(false)}
            onLaunchSuccess={handleLaunchSuccess}
          />
        )}
      </>
    );
  }

  // Default button variant
  return (
    <>
      <button
        onClick={showModal ? handleModalLaunch : handleQuickLaunch}
        disabled={isLaunching || !study.orthancStudyID}
        className={`
          inline-flex items-center justify-center font-medium rounded-md transition-colors
          ${sizeClasses[size]}
          ${isLaunching 
            ? 'bg-purple-300 text-white cursor-not-allowed' 
            : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
      >
        {isLaunching ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            <span>Launching...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>🚀 Launch RadiAnt</span>
          </>
        )}
      </button>

      {showLaunchModal && (
        <RadiantLaunchModal
          study={study}
          isOpen={showLaunchModal}
          onClose={() => setShowLaunchModal(false)}
          onLaunchSuccess={handleLaunchSuccess}
        />
      )}
    </>
  );
};

export default LaunchButton;