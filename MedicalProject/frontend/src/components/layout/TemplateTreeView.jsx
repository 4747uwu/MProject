import React, { useState, useEffect, useMemo } from 'react';

const TemplateTreeView = ({ templates, selectedTemplate, onTemplateSelect, studyModality }) => {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredTemplate, setHoveredTemplate] = useState(null);

  // Auto-expand categories when templates load
  useEffect(() => {
    if (templates && Object.keys(templates).length > 0) {
      console.log('🔍 TemplateTreeView received templates:', templates);
      
      // Auto-expand first category for better UX
      const firstCategory = Object.keys(templates)[0];
      if (firstCategory) {
        setExpandedCategories(prev => ({ ...prev, [firstCategory]: true }));
      }
    }
  }, [templates]);

  // Filter templates based on search query
  const filteredTemplates = useMemo(() => {
    if (!templates || !searchQuery.trim()) return templates;
    
    const filtered = {};
    Object.entries(templates).forEach(([category, categoryTemplates]) => {
      if (Array.isArray(categoryTemplates)) {
        const matchingTemplates = categoryTemplates.filter(template =>
          template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          category.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (matchingTemplates.length > 0) {
          filtered[category] = matchingTemplates;
        }
      }
    });
    return filtered;
  }, [templates, searchQuery]);

  // Auto-expand categories when searching
  useEffect(() => {
    if (searchQuery.trim() && filteredTemplates) {
      const categoriesToExpand = {};
      Object.keys(filteredTemplates).forEach(category => {
        categoriesToExpand[category] = true;
      });
      setExpandedCategories(categoriesToExpand);
    }
  }, [searchQuery, filteredTemplates]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const getTotalTemplatesCount = () => {
    if (!filteredTemplates) return 0;
    return Object.values(filteredTemplates).reduce((total, categoryTemplates) => {
      return total + (Array.isArray(categoryTemplates) ? categoryTemplates.length : 0);
    }, 0);
  };

  // Better empty state check
  if (!templates || typeof templates !== 'object' || Object.keys(templates).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-4 text-center h-full bg-white">
        <div className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center mb-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-xs text-gray-500">
          {templates === null ? 'Loading...' : 'No templates'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Ultra Compact Header */}
      <div className="px-2 py-1.5 bg-black flex items-center gap-2">
        {/* Compact Search */}
        <div className="relative flex-1">
          <svg className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-6 pr-6 py-1 text-xs bg-white border-0 rounded focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 transform -translate-y-1/2"
            >
              <svg className="h-2.5 w-2.5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Count Badge */}
        <div className="bg-white px-2 py-0.5 rounded-full">
          <span className="text-xs font-medium text-black">{getTotalTemplatesCount()}</span>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto">
        {searchQuery && Object.keys(filteredTemplates).length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <svg className="w-4 h-4 text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-xs text-gray-400">No results</p>
          </div>
        ) : (
          <div className="py-0.5">
            {Object.entries(filteredTemplates).map(([category, categoryTemplates], categoryIndex) => (
              <div key={category}>
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center w-full px-2 py-1.5 text-left hover:bg-gray-50 transition-colors duration-100"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    {/* Expand Arrow */}
                    <div className="w-3 h-3 mr-2 flex items-center justify-center">
                      <svg 
                        className={`w-2.5 h-2.5 text-gray-500 transition-transform duration-150 ${
                          expandedCategories[category] ? 'rotate-90' : ''
                        }`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    
                    {/* Category Name & Count */}
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold text-black truncate">{category}</span>
                      <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {Array.isArray(categoryTemplates) ? categoryTemplates.length : 0}
                      </span>
                    </div>
                  </div>
                </button>
                
                {/* Templates */}
                {expandedCategories[category] && Array.isArray(categoryTemplates) && (
                  <div>
                    {categoryTemplates.map((template, templateIndex) => (
                      <button
                        key={template.id}
                        onClick={() => onTemplateSelect(template.id)}
                        onMouseEnter={() => setHoveredTemplate(template.id)}
                        onMouseLeave={() => setHoveredTemplate(null)}
                        className={`flex items-center w-full px-2 py-1.5 text-left transition-all duration-100 ${
                          selectedTemplate?._id === template.id || selectedTemplate?.id === template.id
                            ? 'bg-gray-100 border-r-2 border-black'
                            : hoveredTemplate === template.id
                            ? 'bg-gray-50'
                            : 'hover:bg-gray-25'
                        }`}
                      >
                        {/* Tree Structure */}
                        <div className="flex items-center mr-2">
                          {/* Vertical Line */}
                          <div className="w-3 flex justify-center">
                            <div className={`w-px h-5 ${
                              templateIndex === categoryTemplates.length - 1 ? 'bg-transparent' : 'bg-gray-200'
                            }`} />
                          </div>
                          
                          {/* Horizontal Line */}
                          <div className="w-1.5 h-px bg-gray-200" />
                          
                          {/* Dot Indicator */}
                          <div className={`w-1 h-1 rounded-full ml-1.5 ${
                            selectedTemplate?._id === template.id || selectedTemplate?.id === template.id
                              ? 'bg-black'
                              : hoveredTemplate === template.id
                              ? 'bg-gray-500'
                              : 'bg-gray-300'
                          }`} />
                        </div>
                        
                        {/* Template Name */}
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs truncate block ${
                            selectedTemplate?._id === template.id || selectedTemplate?.id === template.id
                              ? 'text-black font-medium'
                              : 'text-gray-700'
                          }`}>
                            {template.title}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minimal Selection Indicator */}
      {selectedTemplate && (
        <div className="px-2 py-1 bg-gray-50 border-t border-gray-100">
          <div className="text-xs text-gray-600 truncate font-medium">
            {selectedTemplate.title}
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateTreeView;