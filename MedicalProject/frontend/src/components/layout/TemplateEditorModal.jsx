import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { toast } from 'react-toastify';

const HTMLTemplateEditorModal = ({ template, onClose, onSave }) => {
  const [form, setForm] = useState({
    title: '',
    category: 'General',
    htmlContent: ''
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Categories for dropdown
  const categories = [
    'General',
    'CT',
    'CR',
    'CT SCREENING FORMAT',
    'ECHO',
    'EEG-TMT-NCS',
    'MR',
    'MRI SCREENING FORMAT',
    'PT',
    'US',
    'Other'
  ];

  // Initialize form when template changes
  useEffect(() => {
    if (template) {
      setForm({
        title: template.title || '',
        category: template.category || 'General',
        htmlContent: template.htmlContent || ''
      });
    } else {
      setForm({
        title: '',
        category: 'General',
        htmlContent: ''
      });
    }
    setErrors({});
  }, [template]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!form.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (form.title.length > 100) {
      newErrors.title = 'Title cannot exceed 100 characters';
    }
    
    if (!form.category) {
      newErrors.category = 'Category is required';
    }
    
    if (!form.htmlContent.trim()) {
      newErrors.htmlContent = 'HTML content is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        htmlContent: form.htmlContent
      };

      let response;
      if (template?._id) {
        // Update existing template
        response = await api.put(`/html-templates/${template._id}`, payload);
        toast.success('Template updated successfully!');
      } else {
        // Create new template
        response = await api.post('/html-templates', payload);
        toast.success('Template created successfully!');
      }

      if (response.data.success) {
        onSave(response.data.data);
        onClose();
      }
    } catch (error) {
      console.error('Error saving template:', error);
      
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to save template');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!template && template !== null) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {template ? 'Edit Template' : 'Create New Template'}
            </h2>
            <p className="text-sm text-gray-600">
              Add a template with HTML content
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Title *
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleInputChange}
              placeholder="e.g., CT Chest Report"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.title && (
              <p className="text-sm text-red-600 mt-1">{errors.title}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <select
              name="category"
              value={form.category}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.category ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {errors.category && (
              <p className="text-sm text-red-600 mt-1">{errors.category}</p>
            )}
          </div>

          {/* HTML Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              HTML Content *
            </label>
            <textarea
              name="htmlContent"
              value={form.htmlContent}
              onChange={handleInputChange}
              placeholder="Enter your HTML template content here..."
              rows={15}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm ${
                errors.htmlContent ? 'border-red-500' : 'border-gray-300'
              }`}
              style={{ resize: 'vertical' }}
            />
            {errors.htmlContent && (
              <p className="text-sm text-red-600 mt-1">{errors.htmlContent}</p>
            )}
            <div className="text-sm text-gray-500 mt-1">
              Characters: {form.htmlContent.length}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end items-center p-6 border-t bg-gray-50 space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{template ? 'Update' : 'Create'} Template</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HTMLTemplateEditorModal;