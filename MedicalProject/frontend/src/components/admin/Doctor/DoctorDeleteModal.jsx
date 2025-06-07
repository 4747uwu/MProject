import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

const DoctorDeleteModal = ({ isOpen, onClose, doctor }) => {
  const [loading, setLoading] = useState(false);
  const [deleteType, setDeleteType] = useState('soft'); // 'soft' or 'hard'

  const handleDelete = async () => {
    setLoading(true);
    try {
      const response = await api.delete(`/admin/doctors/${doctor._id}`, {
        data: { forceDelete: deleteType === 'hard' }
      });
      
      if (response.data.success) {
        toast.success(response.data.message);
        onClose();
      }
    } catch (error) {
      console.error('Error deleting doctor:', error);
      if (error.response?.status === 400 && error.response?.data?.assignedStudiesCount) {
        toast.error(`Cannot delete doctor with ${error.response.data.assignedStudiesCount} assigned studies. Use force delete if necessary.`);
      } else {
        toast.error(error.response?.data?.message || 'Failed to delete doctor');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Delete Doctor Account
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500 mb-4">
                    Are you sure you want to delete <span className="font-semibold">Dr. {doctor?.fullName}</span>? 
                    This action will affect their access to the system.
                  </p>

                  {/* Doctor Info Card */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-sm font-medium text-white">
                            {doctor?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Dr. {doctor?.fullName}</p>
                        <p className="text-sm text-gray-500">{doctor?.specialization}</p>
                        <p className="text-sm text-gray-500">{doctor?.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Delete Options */}
                  <div className="space-y-3">
                    <div className="flex items-start">
                      <input
                        type="radio"
                        id="soft-delete"
                        name="deleteType"
                        value="soft"
                        checked={deleteType === 'soft'}
                        onChange={(e) => setDeleteType(e.target.value)}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-3">
                        <label htmlFor="soft-delete" className="text-sm font-medium text-gray-700">
                          Deactivate Account (Recommended)
                        </label>
                        <p className="text-xs text-gray-500">
                          Doctor account will be deactivated but data will be preserved. Can be reactivated later.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <input
                        type="radio"
                        id="hard-delete"
                        name="deleteType"
                        value="hard"
                        checked={deleteType === 'hard'}
                        onChange={(e) => setDeleteType(e.target.value)}
                        className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                      />
                      <div className="ml-3">
                        <label htmlFor="hard-delete" className="text-sm font-medium text-gray-700">
                          Permanently Delete
                        </label>
                        <p className="text-xs text-gray-500">
                          ⚠️ Doctor account and all associated data will be permanently removed. This action cannot be undone.
                        </p>
                      </div>
                    </div>
                  </div>

                  {deleteType === 'hard' && (
                    <div className="mt-4 p-3 bg-red-50 border-l-4 border-red-400 rounded">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">
                            Warning: Permanent Deletion
                          </h3>
                          <div className="mt-2 text-sm text-red-700">
                            <p>This will permanently delete all doctor data including:</p>
                            <ul className="list-disc list-inside mt-1">
                              <li>User account and profile</li>
                              <li>Study assignments history</li>
                              <li>Login credentials</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${
                deleteType === 'hard' 
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' 
                  : 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                deleteType === 'hard' ? 'Delete Permanently' : 'Deactivate Account'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorDeleteModal;