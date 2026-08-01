import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LuSearch, LuX } from 'react-icons/lu';
import '../styles/SearchModal.css';

function SearchModal({ isVisible, onClose, sortedConversations = [], onSelectConversation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isVisible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isVisible]);

  const filteredConversations = sortedConversations.filter(c =>
    c.alias.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <div className="search-modal-overlay" onClick={onClose}>
        <motion.div
          className="search-modal-container"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.15 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="search-modal-header">
            <LuSearch className="search-modal-icon" />
            <input
              ref={inputRef}
              type="text"
              className="search-modal-input"
              placeholder="Search chat titles..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button className="search-modal-close-btn" onClick={onClose}>
              <LuX />
            </button>
          </div>

          <div className="search-modal-results">
            {filteredConversations.length > 0 ? (
              filteredConversations.map(c => (
                <div
                  key={c.conversation_id}
                  className="search-result-item"
                  onClick={() => {
                    onSelectConversation(c.conversation_id);
                    onClose();
                  }}
                >
                  <span className="search-result-title">{c.alias}</span>
                </div>
              ))
            ) : (
              <div className="search-no-results">No conversations found.</div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default React.memo(SearchModal);
