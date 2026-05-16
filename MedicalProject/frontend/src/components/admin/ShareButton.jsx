import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';

const ShareButton = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const modalRef = useRef(null);

  const buildShareLink = () => `https://ai.starradiology.com/admin/share/${study._id}`;

  // Get the element to mount the portal to.
  // It's best practice to have a dedicated div like <div id="modal-root"></div> in your index.html.
  const modalRoot = document.getElementById('modal-root') || document.body;

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden'; // Prevent scrolling on body when modal is open
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset'; // Re-enable scrolling when modal is closed
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);


  // Copy link to clipboard
  const copyToClipboard = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard!', {
        icon: '📋',
        duration: 2000
      });
    } catch (error) {
      // Fallback for older browsers or non-secure contexts (http)
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      toast.success('Link copied to clipboard!', {
        icon: '📋',
        duration: 2000
      });
    }
  };

  // Handle share action (copy or email)
  const handleShare = async (action) => {
    const link = shareLink || buildShareLink();

    switch (action) {
      case 'copy':
        await copyToClipboard(link);
        break;
      case 'email':
        const subject = encodeURIComponent(`DICOM Study - ${study.patientName}`);
        const body = encodeURIComponent(`View ${study.patientName}'s ${study.modality} study:\n\n${link}\n\nThis link expires in 7 days.`);
        window.open(`mailto:?subject=${subject}&body=${body}`);
        break;
      default:
        break;
    }
  };

  const handleOpenModal = () => {
    setIsOpen(true);
    if (!shareLink) {
      setShareLink(buildShareLink());
    }
  };

  // Define the modal content, which will be rendered via portal
  const modalContent = isOpen ? (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"></div>
      
      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div 
          ref={modalRef}
          className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md"
        >
          {/* Modal Header */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium leading-6 text-gray-900">
                    🔗 Share Study
                  </h3>
                  <p className="text-sm text-gray-500">
                    Viewer & Report Access
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Study Info */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-sm font-medium text-blue-600">
                    {study.modality}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900">{study.patientName}</p>
                <p className="text-sm text-gray-500">
                  {study.patientId} • {study.description}
                </p>
              </div>
            </div>
          </div>

          {/* Modal Body */}
          <div className="bg-white px-4 py-5 sm:p-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Share link (lets recipient choose Viewer or Report):</p>
                <div className="p-2 bg-gray-50 rounded text-xs text-gray-700 break-all font-mono border border-gray-100">
                  {shareLink}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleShare('copy')}
                  className="flex items-center justify-center px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                >
                  📋 Copy Link
                </button>
                <button
                  onClick={() => handleShare('email')}
                  className="flex items-center justify-center px-3 py-2 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
                >
                  ✉️ Email
                </button>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 flex justify-end">
            <button
              onClick={() => setIsOpen(false)}
              className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Close
            </button>
          </div>

        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Share Button (remains in the component's normal render tree) */}
      <button
        onClick={handleOpenModal}
        className="text-purple-600 hover:text-purple-800 transition-colors duration-200 p-1 hover:bg-purple-50 rounded"
        title="Share study"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
        </svg>
      </button>
      
      {/* The modal is rendered into 'modalRoot' (e.g., a div outside the main app div) */}
      {createPortal(modalContent, modalRoot)}
    </>
  );
};

export default ShareButton;