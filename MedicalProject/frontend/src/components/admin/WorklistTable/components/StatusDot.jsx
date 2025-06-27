import React from 'react';
import { getStatusConfig, getStatusCategoryColor } from '../utils/worklistHelpers';

const StatusDot = ({ status, useCategory = false, className = '' }) => {
  const statusConfig = getStatusConfig(status);
  const color = useCategory ? getStatusCategoryColor(status) : statusConfig.color;

  return (
    <div
      className={`w-3 h-3 rounded-full ${color} ${className}`}
      title={statusConfig.tooltip}
    />
  );
};

export default StatusDot;