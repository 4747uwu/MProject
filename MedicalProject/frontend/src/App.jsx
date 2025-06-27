import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { AuthProvider } from './contexts/authContext';
import { useAuth } from './hooks/useAuth';
import ChangePasswordPage from './pages/ChangePasswordPage';

// Pages
import LoginPage from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import LabDashboard from './pages/lab/Dashboard';
import DoctorDashboard from './pages/doctor/Dashboard';
import NewLabPage from './pages/admin/NewLabPage';
import NewDoctorPage from './pages/admin/NewDoctorPage';
import ForgotPasswordPage from './pages/ForgotPassword';
import ManageDoctorsPage from './pages/ManageDoctorsPage';
import TATReportPage from './pages/TATReport';
import { WebSocketProvider } from './contexts/webSocketContext';
import ShareStudy from './pages/ShareStudy';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-700">Loading Medical Platform</h3>
            <p className="text-sm text-gray-500 mt-1">Please wait while we verify your credentials...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    const redirectPath = currentUser.role === 'admin' ? '/admin/dashboard' : 
                          currentUser.role === 'lab_staff' ? '/lab/dashboard' : 
                          currentUser.role === 'doctor_account' ? '/doctor/dashboard' : 
                          '/login';
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      

        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            
            {/* Admin Routes */}
            <Route 
              path="/admin/dashboard" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/new-lab" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <NewLabPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/new-doctor" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <NewDoctorPage />
                </ProtectedRoute>
              } 
            />
            
            {/* Lab Routes */}
            <Route 
              path="/lab/dashboard" 
              element={
                <ProtectedRoute allowedRoles={['lab_staff']}>
                  <LabDashboard />
                </ProtectedRoute>
              } 
            />
            
            {/* Doctor Routes */}
            <Route 
              path="/doctor/dashboard" 
              element={
                <ProtectedRoute allowedRoles={['doctor_account']}>
                  <DoctorDashboard />
                </ProtectedRoute>
              } 
            />

            <Route 
              path="/change-password" 
              element={
                <ProtectedRoute allowedRoles={['admin', 'lab_staff', 'doctor_account']}>
                  <ChangePasswordPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/doctors" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <ManageDoctorsPage />
                </ProtectedRoute>
              } 
            />

            <Route 
              path="/reports/tat" 
              element={
                <ProtectedRoute>
                  <TATReportPage />
                </ProtectedRoute>
              } 
            />
            <Route path="/share/:token" element={<ShareStudy />} />
            
            {/* Catch-all route */}
            <Route path="*" element={<Navigate to="/login" replace />} />

          </Routes>
        </div>

        {/* Medical-themed Toast Configuration */}
        <Toaster
          position="top-right"
          gutter={8}
          containerClassName="toast-container"
          containerStyle={{
            top: 20,
            right: 20,
          }}
          toastOptions={{
            // Default options
            duration: 4000,
            className: 'medical-toast',
            style: {
              background: '#ffffff',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              maxWidth: '400px',
              wordBreak: 'break-word',
            },
            
            // Success toasts (medical green theme)
            success: {
              duration: 4000,
              style: {
                background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                border: '1px solid #22c55e',
                color: '#065f46',
              },
              iconTheme: {
                primary: '#22c55e',
                secondary: '#ffffff',
              },
            },
            
            // Error toasts (medical red theme)
            error: {
              duration: 6000,
              style: {
                background: 'linear-gradient(135deg, #fef2f2 0%, #fef7f7 100%)',
                border: '1px solid #ef4444',
                color: '#7f1d1d',
              },
              iconTheme: {
                primary: '#ef4444',
                secondary: '#ffffff',
              },
            },
            
            // Loading toasts (medical blue theme)
            loading: {
              duration: 0, // Don't auto-dismiss loading toasts
              style: {
                background: 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)',
                border: '1px solid #3b82f6',
                color: '#1e3a8a',
              },
              iconTheme: {
                primary: '#3b82f6',
                secondary: '#ffffff',
              },
            },
            
            // Warning toasts (medical amber theme)
            warning: {
              duration: 5000,
              style: {
                background: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)',
                border: '1px solid #f59e0b',
                color: '#78350f',
              },
              iconTheme: {
                primary: '#f59e0b',
                secondary: '#ffffff',
              },
            },
          }}
          // Custom toast renderer for medical icons
          children={(t) => (
            <div className={`
              flex items-start space-x-3 p-4 rounded-xl transition-all duration-300 ease-in-out transform
              ${t.visible ? 'animate-enter' : 'animate-leave'}
              ${t.type === 'success' ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' :
                t.type === 'error' ? 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200' :
                t.type === 'loading' ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200' :
                'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200'
              }
              border shadow-lg backdrop-blur-sm
            `}>
              {/* Medical-themed icons */}
              <div className="flex-shrink-0 mt-0.5">
                {t.type === 'success' && (
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {t.type === 'error' && (
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
                {t.type === 'loading' && (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                {!['success', 'error', 'loading'].includes(t.type) && (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Toast content */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {t.message}
                </div>
                {t.type === 'loading' && (
                  <div className="text-xs text-gray-500 mt-1">
                    Please wait...
                  </div>
                )}
              </div>
              
              {/* Dismiss button */}
              {t.type !== 'loading' && (
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        />
              

      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
