import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';
import HTMLTemplateEditorModal from './TemplateEditorModal'; // Updated import

const TemplateManager = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    category: 'all',
    search: ''
  });
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0,
    limit: 12
  });
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    fetchTemplates();
    fetchCategories();
  }, [filters, pagination.current]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...filters,
        page: pagination.current,
        limit: pagination.limit
      });

      const response = await api.get(`/html-templates?${params}`);
      if (response.data.success) {
        setTemplates(response.data.data.templates);
        setPagination(prev => ({
          ...prev,
          ...response.data.data.pagination
        }));
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/html-templates/categories');
      if (response.data.success) {
        setCategories(response.data.data.categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateModal(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setShowTemplateModal(true);
  };

  const handleDeleteTemplate = async (templateId, templateTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${templateTitle}"?`)) {
      return;
    }

    try {
      await api.delete(`/html-templates/${templateId}`);
      toast.success('Template deleted successfully');
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const handleSaveTemplate = async (templateData) => {
    setShowTemplateModal(false);
    
    // Refresh the templates list after successful save
    await fetchTemplates();
    
    // If it was a new template, reset to first page
    if (!editingTemplate) {
      setPagination(prev => ({ ...prev, current: 1 }));
    }
    
    setEditingTemplate(null);
  };

  const getCategoryColor = (category) => {
    const colors = {
      'General': 'bg-blue-50 border-blue-200 text-blue-800',
      'CT': 'bg-purple-50 border-purple-200 text-purple-800',
      'CR': 'bg-green-50 border-green-200 text-green-800',
      'CT SCREENING FORMAT': 'bg-yellow-50 border-yellow-200 text-yellow-800',
      'ECHO': 'bg-cyan-50 border-cyan-200 text-cyan-800',
      'EEG-TMT-NCS': 'bg-red-50 border-red-200 text-red-800',
      'MR': 'bg-indigo-50 border-indigo-200 text-indigo-800',
      'MRI SCREENING FORMAT': 'bg-orange-50 border-orange-200 text-orange-800',
      'PT': 'bg-pink-50 border-pink-200 text-pink-800',
      'US': 'bg-gray-50 border-gray-200 text-gray-800',
      'Other': 'bg-slate-50 border-slate-200 text-slate-800'
    };
    return colors[category] || 'bg-gray-50 border-gray-200 text-gray-800';
  };

  const getContentPreview = (htmlContent) => {
    // Strip HTML and get first 100 characters
    const textContent = htmlContent.replace(/<[^>]*>/g, '').trim();
    return textContent.length > 100 ? textContent.substring(0, 100) + '...' : textContent;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HTML Template Manager</h1>
          <p className="text-gray-600">Create and manage HTML report templates with full formatting</p>
        </div>
        <button
          onClick={handleCreateTemplate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>New HTML Template</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Templates</label>
            <input
              type="text"
              placeholder="Search by title or content..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          // Loading skeleton
          [...Array(6)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow-sm border animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-4"></div>
              <div className="h-3 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded mb-4"></div>
              <div className="h-6 w-20 bg-gray-200 rounded mb-4"></div>
              <div className="flex justify-between">
                <div className="h-8 w-20 bg-gray-200 rounded"></div>
                <div className="h-8 w-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))
        ) : templates.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 text-lg">No templates found</p>
            <p className="text-gray-400">Create your first HTML template to get started</p>
          </div>
        ) : (
          templates.map((template) => (
            <div key={template._id} className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
              <div className="p-6">
                {/* Template Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{template.title}</h3>
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getCategoryColor(template.category)}`}>
                        {template.category}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                        HTML
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                    <button
                      onClick={() => handleEditTemplate(template)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template._id, template.title)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Content Preview */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4 min-h-[80px]">
                  <p className="text-sm text-gray-600 line-clamp-4">
                    {getContentPreview(template.htmlContent)}
                  </p>
                </div>

                {/* Template Info */}
                <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
                  <span>
                    {template.htmlContent.length} characters
                  </span>
                  <span>
                    {template.htmlContent.replace(/<[^>]*>/g, '').split(/\s+/).filter(word => word.length > 0).length} words
                  </span>
                  <span>
                    Created {new Date(template.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center">
                  <div className="text-xs text-gray-500">
                    By {template.createdBy?.fullName || 'Unknown'}
                  </div>
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    Edit Template
                  </button>
                </div>
              </div>

              {/* Template Preview on Hover */}
              <div className="hidden group-hover:block absolute top-0 right-full mr-2 w-96 bg-white border rounded-lg shadow-xl z-10 p-4">
                <h4 className="font-medium text-gray-900 mb-2">Preview</h4>
                <div 
                  className="text-sm prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: template.htmlContent.length > 500 
                      ? template.htmlContent.substring(0, 500) + '...' 
                      : template.htmlContent 
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center">
          <nav className="flex space-x-1">
            <button
              onClick={() => setPagination(prev => ({ ...prev, current: Math.max(1, prev.current - 1) }))}
              disabled={pagination.current === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            
            {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
              const page = pagination.current <= 3 ? i + 1 : 
                         pagination.current >= pagination.pages - 2 ? pagination.pages - 4 + i :
                         pagination.current - 2 + i;
              
              if (page < 1 || page > pagination.pages) return null;
              
              return (
                <button
                  key={page}
                  onClick={() => setPagination(prev => ({ ...prev, current: page }))}
                  className={`px-3 py-2 text-sm font-medium border transition-colors ${
                    pagination.current === page
                      ? 'bg-blue-50 border-blue-500 text-blue-600'
                      : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            
            <button
              onClick={() => setPagination(prev => ({ ...prev, current: Math.min(pagination.pages, prev.current + 1) }))}
              disabled={pagination.current === pagination.pages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </nav>
        </div>
      )}

      {/* Stats */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{pagination.total}</div>
            <div className="text-sm text-gray-600">Total Templates</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{categories.length}</div>
            <div className="text-sm text-gray-600">Categories</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {templates.filter(t => new Date(t.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
            </div>
            <div className="text-sm text-gray-600">Created This Week</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">HTML</div>
            <div className="text-sm text-gray-600">Template Type</div>
          </div>
        </div>
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <HTMLTemplateEditorModal
          template={editingTemplate}
          onClose={() => {
            setShowTemplateModal(false);
            setEditingTemplate(null);
          }}
          onSave={handleSaveTemplate}
        />
      )}
    </div>
  );
};

export default TemplateManager;