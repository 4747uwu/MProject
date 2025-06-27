import { useState, useEffect, useCallback } from 'react';
import { ROW_HEIGHT, VIRTUAL_CONFIG, LAYOUT_HEIGHTS } from '../utils/constants';

export const useVirtualScrolling = (filteredStudies = []) => {
  const [containerHeight, setContainerHeight] = useState(VIRTUAL_CONFIG.defaultHeight);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate container height based on window size
  const calculateHeight = useCallback(() => {
    const totalOffset = LAYOUT_HEIGHTS.HEADER + LAYOUT_HEIGHTS.FOOTER + LAYOUT_HEIGHTS.ACTION_BAR + LAYOUT_HEIGHTS.TAB_NAVIGATION;
    const availableHeight = window.innerHeight - totalOffset;
    const height = Math.max(VIRTUAL_CONFIG.minHeight, availableHeight);
    setContainerHeight(height);
  }, []);

  // Update container height on window resize
  useEffect(() => {
    calculateHeight();
    
    const handleResize = () => {
      calculateHeight();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateHeight]);

  // Calculate visible range based on scroll position
  const updateVisibleRange = useCallback((scrollTop) => {
    const visibleStart = Math.floor(scrollTop / ROW_HEIGHT);
    const visibleEnd = Math.min(
      filteredStudies.length,
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT)
    );

    // Add overscan for smooth scrolling
    const start = Math.max(0, visibleStart - VIRTUAL_CONFIG.overscanCount);
    const end = Math.min(filteredStudies.length, visibleEnd + VIRTUAL_CONFIG.overscanCount);

    setVisibleRange({ start, end });
  }, [filteredStudies.length, containerHeight]);

  // Handle scroll events
  const handleScroll = useCallback((event) => {
    const scrollTop = event.target.scrollTop;
    setScrollTop(scrollTop);
    updateVisibleRange(scrollTop);
  }, [updateVisibleRange]);

  // Update visible range when filtered studies change
  useEffect(() => {
    updateVisibleRange(scrollTop);
  }, [filteredStudies.length, updateVisibleRange, scrollTop]);

  // Get visible studies for rendering
  const getVisibleStudies = useCallback(() => {
    return filteredStudies.slice(visibleRange.start, visibleRange.end);
  }, [filteredStudies, visibleRange]);

  // Calculate total height for virtual scrolling
  const totalHeight = filteredStudies.length * ROW_HEIGHT;

  // Calculate spacer heights for virtual scrolling
  const topSpacerHeight = visibleRange.start * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (filteredStudies.length - visibleRange.end) * ROW_HEIGHT);

  return {
    containerHeight,
    visibleRange,
    scrollTop,
    handleScroll,
    getVisibleStudies,
    totalHeight,
    topSpacerHeight,
    bottomSpacerHeight,
    calculateHeight
  };
};
