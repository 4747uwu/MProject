import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import AdminNavbar from './AdminNavbar';

const DashboardLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };
  
  // Close sidebar on small screens initially
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    // Set initial state
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Main Admin Navbar stays at the top */}
      <AdminNavbar />
      
      {/* Content area with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} toggleSidebar={toggleSidebar} />
        
        {/* Main Content */}
        <div className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
          {/* Secondary navigation bar with hamburger menu */}
          <div className="sticky top-0 bg-white shadow-sm z-20">
            <div className="px-4 py-3 flex items-center">
              <button 
                onClick={toggleSidebar} 
                className="p-2 mr-3 rounded-md hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-gray-700">Worklist Explorer</h1>
            </div>
          </div>
          
          {/* Page Content */}
          <main className="p-4">
            {children}
          </main>
        </div>
      </div>
      
      {/* Overlay for mobile when sidebar is open */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={toggleSidebar}
        ></div>
      )}
    </div>
  );
};

export default DashboardLayout;