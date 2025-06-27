import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import sessionManager from '../services/sessionManager';

// ✅ Use environment variable instead of hardcoded localhost
const API_URL = import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL !== ''
  ? `${import.meta.env.VITE_BACKEND_URL}/api`  // Development: use external URL
  : '/api';  // Production: use nginx proxy


console.log('🔍 API_URL:', API_URL); // Debug log

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ✅ Check if user is already logged in using sessionManager
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        // First check sessionStorage for existing session
        const session = sessionManager.getSession();
        if (session) {
          setCurrentUser(session.user);
          console.log('✅ Session restored from sessionStorage:', session.user.email);
        } else {
          console.log('❌ No valid session found in sessionStorage');
        }
      } catch (err) {
        console.log("Error checking session:", err);
        sessionManager.clearSession();
      } finally {
        setLoading(false);
      }
    };

    checkLoggedIn();
  }, []);

  // ✅ Updated login function to use sessionManager
  const login = async (email, password) => {
    setError(null);
    try {
      console.log('🔍 Attempting login at:', `${API_URL}/auth/login`);
      
      // ✅ Don't send withCredentials since we're not using cookies anymore
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      
      if (res.data.success) {
        const { user, token, expiresIn } = res.data;
        
        // ✅ Store session using sessionManager (tab-specific)
        sessionManager.setSession(token, user, expiresIn);
        setCurrentUser(user);
        
        return user;
      } else {
        throw new Error(res.data.message || 'Login failed');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      setError(err.response?.data?.message || err.message || 'Login failed');
      throw err;
    }
  };

  // ✅ Updated logout function to use sessionManager
  const logout = async () => {
    try {
      const token = sessionManager.getToken();
      if (token) {
        // Call logout endpoint with authorization header
        await axios.post(`${API_URL}/auth/logout`, {}, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      // ✅ Clear session from this tab
      sessionManager.clearSession();
      setCurrentUser(null);
    }
  };

  // ✅ Add method to check if authenticated using sessionManager
  const isAuthenticated = () => {
    return sessionManager.isAuthenticated();
  };

  // Get user dashboard route based on role
  const getDashboardRoute = () => {
    if (!currentUser) return '/login';
    
    switch (currentUser.role) {
      case 'admin':
        return '/admin/dashboard';
      case 'lab_staff':
        return '/lab/dashboard';
      case 'doctor_account':
        return '/doctor/dashboard';
      default:
        return '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      loading, 
      error,
      login, 
      logout, 
      isAuthenticated, // ✅ Add this
      getDashboardRoute
    }}>
      {children}
    </AuthContext.Provider>
  );
};