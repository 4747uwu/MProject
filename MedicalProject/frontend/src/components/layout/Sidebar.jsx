import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const [reportsExpanded, setReportsExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Check if the current path matches a given path
  const isActivePath = (path) => {
    return location.pathname === path;
  };

  // Toggle reports submenu
  const toggleReports = () => {
    setReportsExpanded(!reportsExpanded);
  };

  // Handle logout
  const handleLogout = () => {
    // Add logout logic here
    // For example:
    // logout();
    navigate('/login');
  };

  return (
    <div 
      className={`fixed top-0 left-0 h-full bg-gray-700 text-white w-64 overflow-y-auto transition-transform duration-300 ease-in-out z-30 ${
        isOpen ? 'transform-none' : '-translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-600">
        <h1 className="text-xl font-bold">Worklist</h1>
        <button onClick={toggleSidebar} className="lg:hidden text-gray-300 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="py-4">
        {/* Reports Dropdown */}
        <div className="px-4 py-2">
          <button 
            onClick={toggleReports}
            className="w-full flex items-center justify-between text-left text-green-400 hover:text-green-300 transition-colors"
          >
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Reports</span>
            </div>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-4 w-4 transition-transform ${reportsExpanded ? 'transform rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Reports Submenu */}
          {reportsExpanded && (
            <div className="mt-2 pl-4 border-l-2 border-gray-600 ml-2">
              <Link 
                to="/reports/tat" 
                className={`block py-2 px-2 text-sm ${isActivePath('/admin/reports/tat') ? 'bg-gray-600 rounded' : 'hover:bg-gray-600 rounded'}`}
              >
                Overall TAT Report
              </Link>
              <Link 
                to="/admin/reports/stats" 
                className={`block py-2 px-2 text-sm ${isActivePath('/admin/reports/stats') ? 'bg-gray-600 rounded' : 'hover:bg-gray-600 rounded'}`}
              >
                Study Statistics
              </Link>
            </div>
          )}
        </div>

        {/* Log Out Button */}
        <div className="px-4 py-2 mt-4 border-t border-gray-600">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center py-2 text-left text-white hover:text-gray-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Log Out</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;