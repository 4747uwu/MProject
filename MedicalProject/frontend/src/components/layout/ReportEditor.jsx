import React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';

const ReportEditor = ({ content, onChange }) => {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [paginatedContent, setPaginatedContent] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState('11pt');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [showWordCount, setShowWordCount] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTools, setActiveTools] = useState({
    bold: false,
    italic: false,
    underline: false
  });
  const contentEditableRef = useRef(null);

  // When content prop changes, update the editor's view
  useEffect(() => {
    if (contentEditableRef.current && content !== contentEditableRef.current.innerHTML) {
      contentEditableRef.current.innerHTML = content || '';
    }
  }, [content]);

  // Process content for multi-page preview
  const processContentForPreview = useCallback((htmlContent) => {
    if (!htmlContent) return '';

    if (htmlContent.includes('report-page')) {
      return htmlContent.replace(
        /(<div[^>]*class="[^"]*report-page[^"]*"[^>]*>)/g, 
        '$1'
      );
    }

    return `
      <div class="report-page-preview" data-page="1">
        ${htmlContent}
      </div>
    `;
  }, []);

  // Update paginated content when content or preview mode changes
  useEffect(() => {
    if (isPreviewMode && content) {
      const processed = processContentForPreview(content);
      setPaginatedContent(processed);
    }
  }, [content, isPreviewMode, processContentForPreview]);

  const handleContentChange = (e) => {
    onChange(e.target.innerHTML);
    updateToolStates();
  };

  // Update active tool states
  const updateToolStates = () => {
    setActiveTools({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline')
    });
  };

  // Enhanced command wrapper
  const applyCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    contentEditableRef.current?.focus();
    updateToolStates();
  };

  // Enhanced style application
  const applyStyle = (style, value) => {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(style, false, value);
    document.execCommand('styleWithCSS', false, false);
    contentEditableRef.current?.focus();
    updateToolStates();
  };

  // Word count functionality
  const getWordCount = () => {
    if (!content) return { words: 0, characters: 0 };
    const text = content.replace(/<[^>]*>/g, '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const characters = text.length;
    return { words, characters };
  };

  // Page count
  const getPageCount = () => {
    if (!content) return 0;
    const matches = content.match(/data-page="/g);
    return matches ? matches.length : 1;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'b':
            e.preventDefault();
            applyCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            applyCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            applyCommand('underline');
            break;
          case 'Enter':
            if (e.shiftKey) {
              e.preventDefault();
              setIsPreviewMode(!isPreviewMode);
            }
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewMode]);

  const ToolbarButton = ({ onClick, active, children, tooltip, className = "" }) => (
    <button
      onClick={onClick}
      title={tooltip}
      className={`
        flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium
        transition-all duration-200 transform hover:scale-105
        ${active 
          ? 'bg-blue-600 text-white shadow-lg' 
          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200 hover:border-gray-300'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );

  const ToolbarSeparator = () => (
    <div className="w-px h-8 bg-gray-200 mx-2"></div>
  );

  return (
    <div className={`h-full flex flex-col transition-all duration-300 ${
      darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-gray-100'
    } ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      
      {/* Modern Enhanced Toolbar */}
      <div className={`flex-shrink-0 border-b shadow-sm transition-colors duration-300 ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        
        {/* Top Toolbar Row */}
        <div className="p-4 flex flex-wrap items-center gap-3">
          
          {/* Mode Toggle with Modern Design */}
          <div className="flex bg-gray-100 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setIsPreviewMode(false)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                !isPreviewMode 
                  ? 'bg-white text-blue-600 shadow-md transform scale-105' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.536L16.732 3.732z" />
                </svg>
                Edit
              </span>
            </button>
            <button
              onClick={() => setIsPreviewMode(true)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                isPreviewMode 
                  ? 'bg-white text-blue-600 shadow-md transform scale-105' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Preview
              </span>
            </button>
          </div>

          <ToolbarSeparator />

          {/* Font Controls */}
          <div className="flex items-center gap-2">
            <select
              value={fontFamily}
              onChange={(e) => {
                setFontFamily(e.target.value);
                applyCommand('fontName', e.target.value);
              }}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Verdana">Verdana</option>
              <option value="Georgia">Georgia</option>
              <option value="Helvetica">Helvetica</option>
            </select>

            <select
              value={fontSize}
              onChange={(e) => {
                setFontSize(e.target.value);
                applyStyle('fontSize', e.target.value);
              }}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="8pt">8pt</option>
              <option value="9pt">9pt</option>
              <option value="10pt">10pt</option>
              <option value="11pt">11pt</option>
              <option value="12pt">12pt</option>
              <option value="14pt">14pt</option>
              <option value="16pt">16pt</option>
              <option value="18pt">18pt</option>
              <option value="24pt">24pt</option>
            </select>
          </div>

          <ToolbarSeparator />

          {/* Formatting Tools */}
          <div className="flex items-center gap-1">
            <ToolbarButton 
              onClick={() => applyCommand('bold')} 
              active={activeTools.bold}
              tooltip="Bold (Ctrl+B)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 4a1 1 0 011-1h3a3 3 0 110 6h-1v2h1a3 3 0 110 6H6a1 1 0 01-1-1V4zm3 1H7v4h1a1 1 0 100-2V5zm-1 6v4h1a1 1 0 100-2v-2H7z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>

            <ToolbarButton 
              onClick={() => applyCommand('italic')} 
              active={activeTools.italic}
              tooltip="Italic (Ctrl+I)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h3a1 1 0 110 2h-3v5a1 1 0 11-2 0v-5H6a1 1 0 110-2h3V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>

            <ToolbarButton 
              onClick={() => applyCommand('underline')} 
              active={activeTools.underline}
              tooltip="Underline (Ctrl+U)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v8a5 5 0 1010 0V3a1 1 0 112 0v8a7 7 0 11-14 0V3a1 1 0 011-1zm2 14a1 1 0 100 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>

            {/* Color Picker */}
            <div className="relative">
              <label className="flex items-center justify-center px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                <svg className="w-4 h-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4z" clipRule="evenodd" />
                </svg>
                <input 
                  type="color" 
                  onChange={(e) => applyCommand('foreColor', e.target.value)} 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                />
              </label>
            </div>
          </div>

          <ToolbarSeparator />

          {/* Alignment Tools */}
          <div className="flex items-center gap-1">
            <ToolbarButton onClick={() => applyCommand('justifyLeft')} tooltip="Align Left">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>

            <ToolbarButton onClick={() => applyCommand('justifyCenter')} tooltip="Center">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18H4.25A2.25 2.25 0 012 15.75V4.25z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>

            <ToolbarButton onClick={() => applyCommand('justifyRight')} tooltip="Align Right">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M17 4a1 1 0 01-1 1H4a1 1 0 110-2h12a1 1 0 011 1zm0 4a1 1 0 01-1 1h-6a1 1 0 110-2h6a1 1 0 011 1zm0 4a1 1 0 01-1 1H4a1 1 0 110-2h12a1 1 0 011 1zm0 4a1 1 0 01-1 1h-6a1 1 0 110-2h6a1 1 0 011 1z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>
          </div>

          <ToolbarSeparator />

          {/* List Tools
          <div className="flex items-center gap-1">
            <ToolbarButton onClick={() => applyCommand('insertUnorderedList')} tooltip="Bullet List">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 000 2h.01a1 1 0 100-2H3zm2.5 2A1.5 1.5 0 107 4v.01A1.5 1.5 0 005.5 6zM3 8a1 1 0 100 2h.01a1 1 0 100-2H3zm2.5 2A1.5 1.5 0 107 8v.01A1.5 1.5 0 005.5 10z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>

            <ToolbarButton onClick={() => applyCommand('insertOrderedList')} tooltip="Numbered List">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3z" clipRule="evenodd" />
              </svg>
            </ToolbarButton>
          </div> */}

          {/* Right Side Controls */}
          <div className="ml-auto flex items-center gap-3">
            {/* Zoom Control */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
                className="p-1 hover:bg-gray-100 rounded"
                title="Zoom Out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10h-6" />
                </svg>
              </button>
              <span className="text-sm font-medium min-w-[3rem] text-center">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}
                className="p-1 hover:bg-gray-100 rounded"
                title="Zoom In"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>
            </div>

            {/* Word Count Toggle */}
            <button
              onClick={() => setShowWordCount(!showWordCount)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showWordCount ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
              }`}
              title="Toggle Word Count"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>

            {/* Fullscreen Toggle */}
            {/* <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Toggle Fullscreen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isFullscreen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                )}
              </svg>
            </button> */}
          </div>
        </div>

        {/* Status Bar */}
        {(showWordCount || isPreviewMode) && (
          <div className={`px-4 py-2 border-t text-sm flex items-center justify-between ${
            darkMode ? 'bg-gray-750 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
            <div className="flex items-center gap-4">
              {showWordCount && (
                <div className="flex items-center gap-4">
                  <span>Words: {getWordCount().words}</span>
                  <span>Characters: {getWordCount().characters}</span>
                </div>
              )}
              {isPreviewMode && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-blue-600 font-medium">
                    {getPageCount()} page{getPageCount() !== 1 ? 's' : ''} • Multi-page preview
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs opacity-75">
              Ctrl+Shift+Enter: Toggle Preview
            </div>
          </div>
        )}
      </div>

      {/* Editor & Preview Area */}
      <div className="flex-1 overflow-auto" style={{ 
        background: darkMode ? '#1a1a1a' : '#f5f5f5',
        padding: '20px'
      }}>
        <style dangerouslySetInnerHTML={{ __html: documentStyles }} />
        {isPreviewMode ? (
          <div className="preview-container" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}>
            <div 
              className="multi-page-preview"
              dangerouslySetInnerHTML={{ __html: paginatedContent || content }} 
            />
          </div>
        ) : (
          <div
            ref={contentEditableRef}
            contentEditable
            className={`report-editor bg-white shadow-xl mx-auto transition-all duration-300 ${
              darkMode ? 'bg-gray-800 text-white' : 'bg-white'
            }`}
            style={{ 
              width: '21cm', 
              minHeight: '29.7cm', 
              padding: '1.5cm',
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              borderRadius: '8px'
            }}
            onInput={handleContentChange}
            onMouseUp={updateToolStates}
            onKeyUp={updateToolStates}
            suppressContentEditableWarning={true}
          />
        )}
      </div>
    </div>
  );
};

// Enhanced styles with modern design
const documentStyles = `
  /* Base editor styles with modern enhancements */
  .report-editor {
    font-family: Arial, sans-serif;
    line-height: 1.4;
    color: #000;
    font-size: 11pt;
    background: white;
    outline: none;
    box-sizing: border-box;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
  }
  
  .report-editor:focus {
    box-shadow: 0 10px 40px rgba(0,0,0,0.15), 0 0 0 2px rgba(59, 130, 246, 0.5);
  }

  /* Modern preview container */
  .preview-container {
    background: #f8fafc;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    background-image: 
      radial-gradient(circle at 25px 25px, lightgray 2px, transparent 0),
      radial-gradient(circle at 75px 75px, lightgray 2px, transparent 0);
    background-size: 100px 100px;
    background-position: 0 0, 50px 50px;
  }

  /* Enhanced multi-page preview */
  .multi-page-preview {
    width: 21cm;
    max-width: 21cm;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  /* Modern page styling */
  .report-page, .report-page-preview {
    background: white;
    width: 21cm;
    min-height: 29.7cm;
    padding: 0;
    margin: 0;
    box-shadow: 
      0 20px 40px rgba(0,0,0,0.1),
      0 0 0 1px rgba(0,0,0,0.05);
    box-sizing: border-box;
    position: relative;
    page-break-after: always;
    display: block;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    color: #000;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .report-page:hover, .report-page-preview:hover {
    box-shadow: 
      0 25px 50px rgba(0,0,0,0.15),
      0 0 0 1px rgba(0,0,0,0.1);
    transform: translateY(-2px);
  }

  .report-page:last-child, .report-page-preview:last-child {
    page-break-after: auto;
  }

  /* Enhanced patient table */
  .page-header-table, .patient-info-table {
    width: calc(100% - 2.5cm);
    border-collapse: collapse;
    margin: 3rem 1.25cm 1rem 1.25cm;
    font-size: 10pt;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  .page-header-table td, .patient-info-table td {
    border: 1px solid #e5e7eb;
    padding: 10px 12px;
    vertical-align: top;
    transition: background-color 0.2s ease;
  }

  .page-header-table td:nth-child(1),
  .page-header-table td:nth-child(3),
  .patient-info-table td:nth-child(1),
  .patient-info-table td:nth-child(3) {
    background: linear-gradient(135deg, #6EE4F5 0%, #5DD4E4 100%);
    font-weight: 600;
    width: 22%;
    color: #0f172a;
  }

  .page-header-table td:nth-child(2),
  .page-header-table td:nth-child(4),
  .patient-info-table td:nth-child(2),
  .patient-info-table td:nth-child(4) {
    background-color: #ffffff;
    width: 28%;
  }

  /* Modern content area */
  .content-flow-area {
    margin: 0 1.25cm;
    padding: 0;
    max-height: none;
    overflow: visible;
  }

  /* Enhanced signature section */
  .signature-section {
    margin: 1.5rem 1.25cm 1.25cm 1.25cm;
    text-align: left;
    font-size: 10pt;
    line-height: 1.3;
    border-top: 2px solid #e5e7eb;
    padding-top: 1.5rem;
    page-break-inside: avoid;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    padding: 1.5rem;
    border-radius: 8px;
    margin-top: 2rem;
  }

  .doctor-name {
    font-weight: 700;
    margin-bottom: 6px;
    font-size: 13pt;
    color: #1e293b;
  }

  .doctor-specialization,
  .doctor-license {
    margin: 4px 0;
    font-size: 11pt;
    color: #475569;
  }

  .signature-image {
    width: 100px;
    height: 50px;
    margin: 10px 0;
    object-fit: contain;
    border-radius: 4px;
  }

  /* Modern text styles */
  p { 
    margin: 8px 0; 
    font-size: 11pt;
    line-height: 1.6;
    color: #374151;
  }
  
  h1, h2, h3 { 
    font-weight: 700; 
    text-decoration: underline; 
    margin: 20px 0 12px 0; 
    page-break-after: avoid;
    color: #1f2937;
  }
  h1 { font-size: 16pt; line-height: 1.3; }
  h2 { font-size: 14pt; line-height: 1.3; }
  h3 { font-size: 12pt; line-height: 1.3; }
  
  ul, ol { 
    padding-left: 24px; 
    margin: 10px 0; 
  }
  li { 
    margin: 4px 0; 
    font-size: 11pt;
    line-height: 1.5;
  }
  strong { font-weight: 700; color: #1f2937; }
  u { text-decoration: underline; }

  /* Modern page break indicators */
  div[style*="page-break-after: always"] {
    height: 4px;
    margin: 30px 1.25cm;
    border-top: 3px dashed #3b82f6;
    background: linear-gradient(90deg, transparent 0%, #3b82f6 50%, transparent 100%);
    position: relative;
    border-radius: 2px;
  }

  div[style*="page-break-after: always"]:after {
    content: "PAGE BREAK";
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;
    font-size: 9pt;
    padding: 4px 12px;
    border-radius: 6px;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }

  /* Enhanced page numbering */
  .report-page::after, .report-page-preview::after {
    content: "Page " attr(data-page);
    position: absolute;
    bottom: 1cm;
    right: 1.25cm;
    font-size: 10pt;
    color: #6b7280;
    font-weight: 500;
    background: rgba(255, 255, 255, 0.9);
    padding: 4px 8px;
    border-radius: 4px;
    backdrop-filter: blur(4px);
  }

  .report-page::before, .report-page-preview::before {
    content: "Page " attr(data-page);
    position: absolute;
    top: -35px;
    left: 0;
    font-size: 12px;
    color: #374151;
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    padding: 6px 12px;
    border-radius: 6px;
    font-weight: 600;
    border: 1px solid #3b82f6;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
  }

  @media print {
    .preview-container { 
      background: white; 
      padding: 0; 
      background-image: none;
    }
    
    .multi-page-preview {
      gap: 0;
    }
    
    .report-page, .report-page-preview { 
      margin: 0; 
      box-shadow: none; 
      page-break-after: always;
      border-radius: 0;
    }
    
    .report-page:last-child, .report-page-preview:last-child { 
      page-break-after: auto; 
    }
    
    .report-page::before, .report-page-preview::before,
    .report-page::after, .report-page-preview::after {
      display: none;
    }
    
    div[style*="page-break-after: always"] {
      page-break-after: always;
      border: none;
      height: 0;
      margin: 0;
      background: none;
    }
    
    div[style*="page-break-after: always"]:after {
      display: none;
    }
  }
`;

export default ReportEditor;