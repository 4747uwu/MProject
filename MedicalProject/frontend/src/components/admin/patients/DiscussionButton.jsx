import React, { useState } from 'react';
import StudyDiscussion from './StudyDiscussion';

const DiscussionButton = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const hasDiscussions = study.discussions && study.discussions.length > 0;

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="text-purple-600 hover:text-purple-800 transition-colors duration-200 p-1 hover:bg-purple-50 rounded relative"
        title="View study discussion"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        
        {/* Notification badge for discussions */}
        {hasDiscussions && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
            {study.discussions.length}
          </span>
        )}
      </button>

      {isOpen && (
        <StudyDiscussion
          studyId={study._id || study.orthancStudyID}
          discussions={study.discussions || []}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onSaveComplete={(updatedDiscussions) => {
            // You can update the local study object if needed
            if (study.onDiscussionUpdate) {
              study.onDiscussionUpdate(updatedDiscussions);
            }
            // Keep the modal open to see the new comment
          }}
        />
      )}
    </>
  );
};

export default DiscussionButton;