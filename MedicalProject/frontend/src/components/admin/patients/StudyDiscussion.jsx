import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import api from '../../../services/api.jsx';

const StudyDiscussion = ({ studyId, discussions = [], isOpen, onClose, onSaveComplete }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  // Load discussions when the component opens
  useEffect(() => {
    if (isOpen) {
      if (discussions && discussions.length > 0) {
        setComments(discussions);
        setLoading(false);
      } else {
        fetchDiscussions();
      }
    }
  }, [isOpen, discussions, studyId]);

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
    } catch (err) {
      console.error('Error fetching study discussions:', err);
      setError('Failed to load discussions');
    } finally {
      setLoading(false);
    }
  };

  // Save a new comment using the api service
  const saveComment = async () => {
    if (!newComment.trim()) return;
    
    setSubmitting(true);
    try {
      const commentData = {
        comment: newComment,
        userName: user?.fullName || localStorage.getItem('userName') || 'Anonymous',
        userRole: user?.role || localStorage.getItem('userRole') || 'User'
      };
      
      // Use the api service with authentication token from interceptors
      const response = await api.post(`/studies/${studyId}/discussions`, commentData);
      
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
      setError('Failed to save comment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-full max-w-2xl bg-white rounded shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gray-600 text-white px-4 py-2 flex justify-between items-center">
          <h2 className="text-base font-medium">Study Discussion</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300"
            aria-label="Close"
          >
            <span className="text-xl">×</span>
          </button>
        </div>

        {/* Discussions Table */}
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-600 text-white">
              <tr>
                <th className="px-4 py-2 text-left">DateTime</th>
                <th className="px-4 py-2 text-left">CommentFrom</th>
                <th className="px-4 py-2 text-left">UserRole</th>
                <th className="px-4 py-2 text-left">Comment</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-4">Loading...</td>
                </tr>
              ) : comments && comments.length > 0 ? (
                comments.map((comment, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="px-4 py-2">
                      {new Date(comment.dateTime).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{comment.userName}</td>
                    <td className="px-4 py-2">{comment.userRole}</td>
                    <td className="px-4 py-2">{comment.comment}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center py-4 text-gray-500">
                    No Records Found...!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Comment Input */}
        <div className="p-4">
          <div className="mb-2">Type Your Comments:</div>
          <textarea
            className="w-full border border-gray-300 p-2 mb-4 h-24"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          
          {error && (
            <div className="text-red-500 mb-2">{error}</div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            <button
              onClick={saveComment}
              disabled={submitting || !newComment.trim()}
              className={`px-4 py-2 rounded text-white ${
                submitting || !newComment.trim()
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
            <button 
              onClick={onClose}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudyDiscussion;