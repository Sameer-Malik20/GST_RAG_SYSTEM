import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LuBrain, LuCheck } from 'react-icons/lu';
import Tooltip from './Tooltip';
import '../styles/ThinkingDropdown.css';

function ThinkingDropdown({ isTouch, thinkingLevel, onLevelChange, thinkingLevels = ['medium', 'high'] }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (level) => {
    onLevelChange(level);
    setIsOpen(false);
  };

  const hasHigh = thinkingLevels.includes('high');

  return (
    <div className="thinking-dropdown-wrap" ref={dropdownRef}>
      <Tooltip content="Reasoning Level" position="top" isTouch={isTouch}>
        <button
          className={`thinking-trigger-btn ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <LuBrain className="thinking-icon" />
          <span className="thinking-trigger-label">
            {thinkingLevel === 'high' ? 'High' : 'Medium'}
          </span>
        </button>
      </Tooltip>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="thinking-dropdown-menu"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className={`thinking-option ${thinkingLevel === 'medium' ? 'selected' : ''}`}
              onClick={() => handleSelect('medium')}
            >
              <div className="thinking-option-info">
                <span className="thinking-option-title">Medium</span>
                <span className="thinking-option-desc">Suitable for most questions</span>
              </div>
              {thinkingLevel === 'medium' && <LuCheck className="check-icon" />}
            </div>

            {hasHigh && (
              <div
                className={`thinking-option ${thinkingLevel === 'high' ? 'selected' : ''}`}
                onClick={() => handleSelect('high')}
              >
                <div className="thinking-option-info">
                  <span className="thinking-option-title">High</span>
                  <span className="thinking-option-desc">Complex problem solving</span>
                </div>
                {thinkingLevel === 'high' && <LuCheck className="check-icon" />}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(ThinkingDropdown);
