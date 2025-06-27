import React, { useState, useEffect } from 'react';
import StudySeries from '../../patients/StudySeries';

const EMOJIS = ['🎯', '🚀', '⭐', '🔥', '💎', '🎪', '🎨', '🎭', '🎪', '🎲'];

const RandomEmojiButton = ({ study, className = '' }) => {
  const [emoji, setEmoji] = useState('🎯');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Generate consistent emoji based on study ID
    if (study._id || study.id) {
      const hash = study._id || study.id;
      const index = hash.length % EMOJIS.length;
      setEmoji(EMOJIS[index]);
    }
  }, [study]);

  const handleClick = () => {
    // Cycle to next emoji on click
    const currentIndex = EMOJIS.indexOf(emoji);
    const nextIndex = (currentIndex + 1) % EMOJIS.length;
    setEmoji(EMOJIS[nextIndex]);
  };

  const handleEmojiClick = () => {
    setIsOpen(true);
  };

  return (
    <>
      <button
        onClick={handleEmojiClick}
        className={`p-1 text-lg hover:scale-110 transition-transform ${className}`}
        title="View study series"
      >
        <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
          <rect x="6" y="6" width="12" height="12" fill="#4D4D4D"/>
          <line x1="12" y1="18" x2="12" y2="24" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="24" x2="12" y2="38" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="26" x2="22" y2="26" stroke="#999999" strokeWidth="2"/>
          <line x1="12" y1="36" x2="22" y2="36" stroke="#999999" strokeWidth="2"/>
          <rect x="22" y="20" width="12" height="12" fill="#F90"/>
          <rect x="22" y="30" width="12" height="12" fill="#F90"/>
        </svg>
      </button>

      {isOpen && (
        <StudySeries
          study={study}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default RandomEmojiButton;
