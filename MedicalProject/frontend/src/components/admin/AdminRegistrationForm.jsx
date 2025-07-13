import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GradientInfoPanel from '../layout/GradientInfo';
import api from '../../services/api';

const AdminRegistrationForm = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  
  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Handle the close action
  const handleClose = () => {
    // Check if any data has been entered
    const hasData = fullName || email || password || confirmPassword;
      
    if (hasData) {
      // Show confirmation dialog if data exists
      setShowCloseConfirm(true);
    } else {
      // Navigate away directly if no data entered
      navigate('/admin/dashboard');
    }
  };

  // Handle confirmation dialog actions
  const confirmClose = () => {
    navigate('/admin/dashboard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    
    // Validation
    if (!fullName || !email || !password) {
      setError('Full name, email, and password are required.');
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setIsSubmitting(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      setIsSubmitting(false);
      return;
    }
    
    try {
      const response = await api.post('/admin/admins/register', {
        fullName,
        email,
        password
      });
      
      setSuccess(
        `Admin account created successfully! Username: ${response.data.data.username}`
      );
      
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 2000);
      
    } catch (error) {
      console.error('Error registering admin:', error);
      
      if (error.response?.data?.message) {
        setError(error.response.data.message);
      } else {
        setError('An error occurred while creating the admin account. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Left panel features list
  const adminFeatures = [
    "Full system administration",
    "User account management", 
    "Lab and doctor oversight",
    "System configuration",
    "Security controls",
    "Audit trail access"
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Side - Using our reusable component with purple color for admin */}
      <GradientInfoPanel 
        title="Admin Registration" 
        subtitle="Create administrative accounts with full system access and management capabilities"
        features={adminFeatures}
        primaryColor="purple"
        secondaryColor="violet"
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        }
      />

      {/* Right Side - Form */}
      <div className="flex-1 lg:w-2/3 xl:w-3/5">
        <div className="min-h-screen flex items-center justify-center p-4 md:p-6">
          <div className="w-full max-w-2xl">
            {/* Close Button */}
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gray-200"
                aria-label="Close form"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Confirmation Dialog */}
            {showCloseConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Discard changes?</h3>
                  <p className="text-gray-600 mb-6">Any information you've entered will be lost. Are you sure you want to exit?</p>
                  <div className="flex justify-end space-x-3">
                    <button 
                      type="button"
                      onClick={() => setShowCloseConfirm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all duration-150 text-sm font-medium"
                    >
                      Continue editing
                    </button>
                    <button 
                      type="button"
                      onClick={confirmClose}
                      className="px-4 py-2 bg-red-50 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-all duration-150 text-sm font-medium"
                    >
                      Discard changes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Header (only visible on small screens) */}
            <div className="lg:hidden mb-6 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Registration</h1>
              <p className="text-gray-600">Create new administrator accounts</p>
            </div>

            <div className="bg-white shadow-lg rounded-xl p-6 border border-gray-100 w-full max-w-2xl">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Administrator Account</h2>
                <p className="text-gray-600 text-sm">Create a new admin account with full system privileges</p>
              </div>
              
              {/* Alert Messages */}
              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-r-lg">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {success && (
                <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 rounded-r-lg">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-green-700">{success}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="space-y-5">
                  {/* Info Banner */}
                  <div className="bg-purple-50 border-l-4 border-purple-400 p-3 rounded-r-lg">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-purple-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-xs text-purple-700">
                          Admin accounts have full system access. A username will be automatically generated from the email address.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        placeholder="e.g. John Smith"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        placeholder="e.g. admin@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This will be used as the login email and for system notifications.
                      </p>
                    </div>
                    
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="password"
                        type="password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Must be at least 6 characters long.
                      </p>
                    </div>
                    
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm Password <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="confirmPassword"
                        type="password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                        placeholder="Confirm password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                
                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg hover:from-purple-700 hover:to-violet-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium shadow"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Creating Account...
                        </span>
                      ) : (
                        'Create Admin Account'
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRegistrationForm;