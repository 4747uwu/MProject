// filepath: src/services/api.js
import axios from 'axios';

// ✅ Use environment variable with production fallback
const API_URL = import.meta.env.VITE_BACKEND_URL 
  ? `${import.meta.env.VITE_BACKEND_URL}/api`
  : 'http://localhost:3000/api';

console.log('🔍 API Service URL:', API_URL); // Debug log

// Create an axios instance with defaults
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized errors (session expired)
    if (error.response && error.response.status === 401) {
      // Redirect to login or refresh token logic here
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;