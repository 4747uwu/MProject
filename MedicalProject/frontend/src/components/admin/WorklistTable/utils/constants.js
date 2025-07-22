// Virtual Row Height Configuration
export const ROW_HEIGHT = 44; // Height of each row in pixels
export const HEADER_HEIGHT = 40; // Height of table header

// Tab Configuration
export const TABS = {
  ALL: 'all',
  PENDING: 'pending',
  INPROGRESS: 'inprogress',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

// Status Colors and Configurations
export const STATUS_CONFIG = {
  // 🔴 CATEGORY 1: NEW/PENDING (Red) - Studies that need attention
  new_study_received: { color: 'bg-red-500', tooltip: 'New Study Received', category: 'pending' },
  new: { color: 'bg-red-500', tooltip: 'New Study', category: 'pending' },
  pending_assignment: { color: 'bg-red-500', tooltip: 'Pending Assignment', category: 'pending' },
  
  // 🟡 CATEGORY 2: IN PROGRESS (Orange/Yellow) - Studies being worked on
  assigned_to_doctor: { color: 'bg-red-500', tooltip: 'Assigned to Doctor', category: 'inprogress' },
  doctor_opened_report: { color: 'bg-yellow-500', tooltip: 'Doctor Opened Report', category: 'inprogress' },
  report_in_progress: { color: 'bg-yellow-500', tooltip: 'Report in Progress', category: 'inprogress' },
  
  // 🔵 CATEGORY 3: COMPLETED/DOWNLOADED (Blue) - Reports finished but being reviewed/downloaded
  report_drafted: { color: 'bg-purple-500', tooltip: 'Report Drafted', category: 'completed' },
  report_finalized: { color: 'bg-blue-500', tooltip: 'Report Finalized', category: 'completed' },
  report_uploaded: { color: 'bg-blue-500', tooltip: 'Report Uploaded', category: 'completed' },
  report_downloaded_radiologist: { color: 'bg-yellow-500', tooltip: 'Report Downloaded by Radiologist', category: 'completed' },
  report_downloaded: { color: 'bg-yellow-500', tooltip: 'Report Downloaded', category: 'completed' },
  
  // 🟢 CATEGORY 4: FINAL/ARCHIVED (Green) - Completely finished
  final_report_downloaded: { color: 'bg-green-500', tooltip: 'Final Report Downloaded', category: 'final' },
  archived: { color: 'bg-green-500', tooltip: 'Archived', category: 'final' },
  
  // Default fallback
  default: { color: 'bg-gray-400', tooltip: 'Unknown Status', category: 'unknown' }
};

// 🎯 CATEGORY COLOR MAPPING for easy reference
export const CATEGORY_COLORS = {
  pending: 'bg-red-500',      // 🔴 Needs immediate attention
  inprogress: 'bg-orange-500', // 🟡 Being worked on
  completed: 'bg-blue-500',    // 🔵 Completed but in review
  final: 'bg-green-500',       // 🟢 Completely done
  unknown: 'bg-gray-400'       // ⚫ Unknown status
};

// 🏷️ CATEGORY LABELS for UI display
export const CATEGORY_LABELS = {
  pending: 'Pending',
  inprogress: 'In Progress', 
  completed: 'Completed',
  final: 'Final',
  unknown: 'Unknown'
};
// Priority Levels
export const PRIORITY_LEVELS = {
  EMERGENCY: 'EMERGENCY',
  STAT: 'STAT',
  URGENT: 'URGENT',
  ROUTINE: 'ROUTINE'
};

// Column Visibility Defaults
export const DEFAULT_COLUMN_VISIBILITY = {
  checkbox: true,
  status: true,
  randomEmoji: true,
  user: true,
  downloadBtn: true,
  shareBtn: true,
  discussion: true,
  patientId: true,
  patientName: true,
  ageGender: true,
  description: true,
  series: true,
  modality: true,
  location: true,
  studyDate: true,
  uploadDate: false,
  reportedDate: true,
  reportedBy: false,
  accession: false,
  seenBy: false,
  actions: true,
  report: true,
  assignDoctor: true
};

// Essential columns that cannot be hidden
export const ESSENTIAL_COLUMNS = ['patientId', 'patientName', 'status'];

// Virtual Scrolling Configuration
export const VIRTUAL_CONFIG = {
  overscanCount: 10,
  defaultHeight: 600,
  minHeight: 400,
  headerOffset: 160,
  footerOffset: 120
};

// Layout Heights
export const LAYOUT_HEIGHTS = {
  HEADER: 160,
  FOOTER: 120,
  ACTION_BAR: 50,
  TAB_NAVIGATION: 40
};
