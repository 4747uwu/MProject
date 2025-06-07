import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is already logged in (on component mount)
  useEffect(() => {
    const checkLoggedIn = async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/me`, { withCredentials: true });
        if (res.data.success) {
          setCurrentUser(res.data.data);
        }
      } catch (err) {
        // User not logged in or token expired - that's okay
        console.log("Not logged in or session expired");
      } finally {
        setLoading(false);
      }
    };

    checkLoggedIn();
  }, []);

  // Login function
  const login = async (email, password) => {
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/auth/login`, 
        { email, password },
        { withCredentials: true } // Important for cookies
      );
      
      if (res.data.success) {
        setCurrentUser(res.data.user);
        return res.data.user;
      } else {
        throw new Error(res.data.message || 'Login failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed');
      throw err;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true });
      setCurrentUser(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
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
      getDashboardRoute
    }}>
      {children}
    </AuthContext.Provider>
  );
};