// filepath: d:\website\experimental\MedicalProject\frontend\src\utils\dateUtils.js
// Format date string to DD/MM/YYYY format
export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid
  
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).replace(/\//g, '.');
};

// Format time string to HH:MM format
export const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return ''; // Return empty if invalid

    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
};

// Helper function to get ordinal suffix for day
const getOrdinalSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
};

// Format date to "Month Day" format (e.g., "May 30th")
export const formatMonthDay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const ordinal = getOrdinalSuffix(day);

    return `${month} ${day}${ordinal}`;
};

// Format date to "Month Day, Year" format (e.g., "May 30th, 2025")
export const formatMonthDayYear = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const year = date.getFullYear();
    const ordinal = getOrdinalSuffix(day);

    return `${month} ${day}${ordinal}, ${year}`;
};

// Format date to short "Month Day" format (e.g., "May 30")
export const formatMonthDayShort = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric'
    });
};

// Format date to abbreviated month format (e.g., "Dec 31st")
export const formatAbbrevMonthDay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const ordinal = getOrdinalSuffix(day);

    return `${month} ${day}${ordinal}`;
};

// Format relative date (e.g., "Today", "Yesterday", "May 30th")
export const formatRelativeDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Reset time for comparison
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    if (dateOnly.getTime() === todayOnly.getTime()) {
        return 'Today';
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
        return 'Yesterday';
    } else {
        return formatMonthDay(dateString);
    }
};

// Format date with time (e.g., "May 30th at 2:30 PM")
export const formatMonthDayTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const monthDay = formatMonthDay(dateString);
    const time = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    return `${monthDay} at ${time}`;
};