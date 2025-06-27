import React from 'react';
import { TABS } from '../utils/constants';

const TabNavigation = ({ 
  activeTab, 
  onTabChange, 
  studyCounts, 
  className = '' 
}) => {
  const tabs = [
    { key: TABS.ALL, label: 'All', count: studyCounts.all },
    { key: TABS.PENDING, label: 'Pending', count: studyCounts.pending },
    { key: TABS.INPROGRESS, label: 'In Progress', count: studyCounts.inprogress },
    { key: TABS.COMPLETED, label: 'Completed', count: studyCounts.completed },
    { key: TABS.ARCHIVED, label: 'Archived', count: studyCounts.archived }
  ];

  return (
    <div className={`border-b border-gray-200 ${className}`}>
      <nav className="flex space-x-8">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                activeTab === tab.key
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default TabNavigation;
