import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom'; // Import createPortal
import { useAuth } from '../../../hooks/useAuth';
import api from '../../../services/api.jsx'; // Ensure this path is correct

const StudyDiscussion = ({ studyId, discussions = [], isOpen, onClose, onSaveComplete }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  // Define the DOM node for the portal.
  // It's best practice to have a dedicated div like <div id="modal-root"></div> in your public/index.html.
  // If not found, it falls back to document.body.
  const portalRoot = document.getElementById('modal-root') || document.body;

  // Load discussions when the component opens
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';

      if (discussions && discussions.length > 0) {
        setComments(discussions);
        setLoading(false);
      } else {
        fetchDiscussions();
      }
    }

    return () => {
      // Re-enable body scroll when modal closes
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, discussions, studyId]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);


  // Fetch discussions from the server using the api service
  const fetchDiscussions = async () => {
    setLoading(true);
    try {
      // Use the api service with authentication token from interceptors
      const response = await api.get(`/studies/${studyId}/discussions`);
      
      if (response.data) {
        setComments(response.data);
      } else {
        setComments([]);
      }
      setError(null); // Clear any previous errors on successful fetch
    } catch (err) {
      console.error('Error fetching study discussions:', err);
      setError('Failed to load discussions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Save a new comment using the api service
  const saveComment = async () => {
    if (!newComment.trim()) return; // Don't save empty comments
    
    setSubmitting(true);
    try {
      const commentData = {
        comment: newComment.trim(), // Trim whitespace
        // Prioritize user from context, then local storage, then fallback
        userName: user?.fullName || localStorage.getItem('userName') || 'Anonymous',
        userRole: user?.role || localStorage.getItem('userRole') || 'User'
      };
      
      // Use the api service with authentication token from interceptors
      const response = await api.post(`/studies/${studyId}/discussions`, commentData);
      
      // Assuming response.data is the newly created comment object
      const updatedComments = [...comments, response.data];
      setComments(updatedComments);
      setNewComment(''); // Clear the input
      setError(null); // Clear any previous errors
      
      // Notify the parent component that a comment was added
      if (onSaveComplete) {
        onSaveComplete(updatedComments);
      }
    } catch (err) {
      console.error('Error saving comment:', err);
      setError('Failed to save comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // The modal content itself. This will be portaled.
  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-full max-w-2xl bg-white rounded shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gray-700 text-white px-4 py-3 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Study Discussion</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 rounded-full w-8 h-8 flex items-center justify-center"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Discussions Table */}
        <div className="max-h-80 overflow-y-auto bg-gray-50 border-b border-gray-200"> {/* Increased max-h, added bg-gray-50 */}
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-600 text-white"> {/* Sticky header */}
              <tr>
                <th className="px-4 py-2 text-left w-1/4">DateTime</th> {/* Added widths for better table layout */}
                <th className="px-4 py-2 text-left w-1/5">From</th>
                <th className="px-4 py-2 text-left w-1/6">Role</th>
                <th className="px-4 py-2 text-left w-auto">Comment</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-600">Loading discussions...</td>
                </tr>
              ) : comments && comments.length > 0 ? (
                comments.map((comment, index) => (
                  <tr key={comment._id || index} className="border-b border-gray-100 last:border-b-0 hover:bg-white transition-colors duration-100">
                    <td className="px-4 py-2 text-gray-800 text-xs">
                      {new Date(comment.dateTime).toLocaleString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric', 
                        hour: '2-digit', minute: '2-digit', hour12: true
                      })}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">{comment.userName}</td>
                    <td className="px-4 py-2 text-gray-700">{comment.userRole}</td>
                    <td className="px-4 py-2 text-gray-800 break-words">{comment.comment}</td> {/* break-words for long comments */}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-500">
                    No comments found for this study. Be the first to add one!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Comment Input */}
        <div className="p-4 bg-white">
          <label htmlFor="newComment" className="block text-sm font-medium text-gray-700 mb-2">Type Your Comment:</label>
          <textarea
            id="newComment"
            className="w-full border border-gray-300 rounded-md p-3 mb-4 text-sm resize-y focus:ring-blue-500 focus:border-blue-500 min-h-[80px]"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Enter your comment here..."
            rows="3" // Initial visible rows
            aria-label="New comment input"
            disabled={submitting}
          />
          
          {error && (
            <div className="text-red-600 text-sm mb-3" role="alert">{error}</div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={saveComment}
              disabled={submitting || !newComment.trim()}
              className={`px-5 py-2 rounded-md font-semibold transition-colors duration-200 ${
                submitting || !newComment.trim()
                  ? 'bg-blue-300 text-white cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              }`}
            >
              {submitting ? 'Saving Comment...' : 'Save Comment'}
            </button>
            <button 
              onClick={onClose}
              className="bg-gray-200 text-gray-800 px-5 py-2 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Only render the portal if the modal is open
  return isOpen ? createPortal(modalContent, portalRoot) : null;
};

export default StudyDiscussion;