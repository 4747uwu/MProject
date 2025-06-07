import React from 'react';

const OpenOHIFViewerButton = ({ studyInstanceUID }) => {
  const handleClick = () => {
    const proxyBaseURL = 'https://57e2-59-145-191-142.ngrok-free.app'; // Node.js proxy
    const ohifViewerBaseURL = 'https://viewer.ohif.org/viewer';
    
    // Construct the full OHIF viewer URL
    const viewerURL = `${ohifViewerBaseURL}?studyInstanceUIDs=${studyInstanceUID}&server=${encodeURIComponent(`${proxyBaseURL}/dicom-web`)}`;

    // Redirect to the OHIF viewer
    window.open(viewerURL, '_blank');
  };

  return (
    <button onClick={handleClick} className="btn btn-primary">
      Open in OHIF Viewer
    </button>
  );
};

export default OpenOHIFViewerButton;
