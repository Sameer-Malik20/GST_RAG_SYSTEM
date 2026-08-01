import React from 'react';
import { LuChevronDown, LuChevronRight, LuSparkles, LuBrain, LuBookOpen } from 'react-icons/lu';
import { PulseLoader } from "react-spinners";
import '../styles/StatusBlock.css';

const STATUS_CONFIGS = {
  'image-generating': {
    icon: LuSparkles,
    label: "Generating image...",
    loading: true,
  },
  'remote-streaming': {
    icon: LuSparkles,
    label: "Responding in another window...",
    loading: true,
  },
  thinking: {
    icon: LuBrain,
    activeLabel: "Thinking...",
    closedLabel: "Show Reasoning",
    openLabel: "Hide Reasoning",
  },
  citations: {
    icon: LuBookOpen,
    closedLabel: "Show Sources",
    openLabel: "Hide Sources",
  },
};

function StatusBlock({
  type,
  label,
  loading = false,
  expandable = false,
  expanded = false,
  onToggle,
  children,
  isActive = false,
  activeLabel = ""
}) {
  const config = STATUS_CONFIGS[type] || {};
  const IconComponent = config.icon || null;

  let displayLabel = label;
  if (type === 'thinking') {
    if (isActive) {
      displayLabel = activeLabel ? `Thinking... (${activeLabel})` : config.activeLabel;
    } else {
      displayLabel = expanded ? config.openLabel : config.closedLabel;
    }
  } else if (type === 'citations') {
    displayLabel = expanded ? config.openLabel : config.closedLabel;
  } else if (!displayLabel) {
    displayLabel = config.label || '';
  }

  const isSpinner = loading || config.loading || (type === 'thinking' && isActive);
  const isClickable = (expandable || (type === 'thinking' && !isActive) || type === 'citations') && onToggle;

  return (
    <div className={`status-block-wrapper ${type}`}>
      <div 
        className={`status-block-header ${isClickable ? 'clickable' : ''}`}
        onClick={isClickable ? onToggle : undefined}
      >
        <div className="status-block-left">
          {IconComponent && <IconComponent className="status-block-icon" />}
          <span className="status-block-label">{displayLabel}</span>
          {isSpinner && <PulseLoader size={4} className="status-spinner" />}
        </div>
        {isClickable && (
          <div className="status-block-toggle">
            {expanded ? <LuChevronDown /> : <LuChevronRight />}
          </div>
        )}
      </div>

      {expanded && children && (
        <div className="status-block-content">
          {children}
        </div>
      )}
    </div>
  );
}

export default React.memo(StatusBlock);
