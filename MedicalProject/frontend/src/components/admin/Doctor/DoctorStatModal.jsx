import React, { useState, useEffect } from 'react';
import api from '../../../services/api';

const DoctorStatsModal = ({ isOpen, onClose, doctor }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && doctor) {
      fetchDoctorStats();
    }
  }, [isOpen, doctor]);

  const fetchDoctorStats = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/admin/doctors/${doctor._id}/stats`);
      
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching doctor stats:', error);
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
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Doctor Performance Statistics
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Doctor Info Header */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0 h-16 w-16">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-lg font-medium text-white">
                          {doctor?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-gray-900">Dr. {stats?.doctor?.name}</h4>
                      <p className="text-gray-600">{stats?.doctor?.specialization}</p>
                      <p className="text-sm text-gray-500">
                        {stats?.doctor?.experience} years of experience
                      </p>
                    </div>
                  </div>
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Total Studies */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex items-center">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-2xl font-bold text-gray-900">{stats?.studies?.total || 0}</h3>
                        <p className="text-sm text-gray-600">Total Studies</p>
                      </div>
                    </div>
                  </div>

                  {/* Completed Studies */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex items-center">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-2xl font-bold text-gray-900">{stats?.studies?.completed || 0}</h3>
                        <p className="text-sm text-gray-600">Completed</p>
                      </div>
                    </div>
                  </div>

                  {/* Pending Studies */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex items-center">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-2xl font-bold text-gray-900">{stats?.studies?.pending || 0}</h3>
                        <p className="text-sm text-gray-600">Pending</p>
                      </div>
                    </div>
                  </div>

                  {/* This Month */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex items-center">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-2xl font-bold text-gray-900">{stats?.studies?.thisMonth || 0}</h3>
                        <p className="text-sm text-gray-600">This Month</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Completion Rate */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Completion Rate</h4>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Progress</span>
                      <span className="text-sm font-medium text-gray-900">
                        {stats?.performance?.completionRate || 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${stats?.performance?.completionRate || 0}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {stats?.studies?.completed || 0} out of {stats?.studies?.total || 0} studies completed
                    </p>
                  </div>

                  {/* Account Status */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Account Status</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Account Status</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          doctor?.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {doctor?.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Login Status</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          doctor?.isLoggedIn 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {doctor?.isLoggedIn ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Joined</span>
                        <span className="text-sm text-gray-900">
                          {new Date(doctor?.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Work Distribution Chart */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Work Distribution</h4>
                  <div className="space-y-4">
                    {/* Completed Studies Bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600">Completed Studies</span>
                        <span className="text-sm font-medium text-green-600">
                          {stats?.studies?.completed || 0}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${stats?.studies?.total > 0 ? (stats?.studies?.completed / stats?.studies?.total) * 100 : 0}%` 
                          }}
                        ></div>
                      </div>
                    </div>

                    {/* Pending Studies Bar */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600">Pending Studies</span>
                        <span className="text-sm font-medium text-yellow-600">
                          {stats?.studies?.pending || 0}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${stats?.studies?.total > 0 ? (stats?.studies?.pending / stats?.studies?.total) * 100 : 0}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Professional Details */}
                <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Professional Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-600">Specialization</span>
                      <p className="text-sm font-medium text-gray-900">{doctor?.specialization}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">License Number</span>
                      <p className="text-sm font-medium text-gray-900">{doctor?.licenseNumber}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Department</span>
                      <p className="text-sm font-medium text-gray-900">{doctor?.department}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Experience</span>
                      <p className="text-sm font-medium text-gray-900">{doctor?.experience}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-sm text-gray-600">Contact</span>
                      <p className="text-sm font-medium text-gray-900">{doctor?.contactPhone}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-sm text-gray-600">Qualifications</span>
                      <p className="text-sm font-medium text-gray-900">{doctor?.qualificationsString}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Close Button */}
            <div className="flex justify-end pt-6 border-t mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorStatsModal;