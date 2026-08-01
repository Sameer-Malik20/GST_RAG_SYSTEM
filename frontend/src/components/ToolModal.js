import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { LuCheck, LuSearch, LuGlobe, LuLayers } from 'react-icons/lu';
import { getFastApiUrl } from '../config';
import '../styles/ToolModal.css';

function ToolModal({ isVisible, onClose, activeTools = [], onSave }) {
  const [availableServers, setAvailableServers] = useState([]);
  const [selectedTools, setSelectedTools] = useState(new Set(activeTools));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    const fetchMcpServers = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${getFastApiUrl()}/mcp-servers`, {
          credentials: "include"
        });
        if (!response.ok) throw new Error('Failed to load server list.');
        setAvailableServers(await response.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      fetchMcpServers();
      setSelectedTools(new Set(activeTools));
    }
  }, [isVisible, activeTools]);

  const toggleTool = (toolId) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onSave(Array.from(selectedTools));
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const selectedCount = selectedTools.size;

  const serverIcons = useMemo(() => ({
    search: <LuSearch className="tool-server-icon" />,
    web: <LuGlobe className="tool-server-icon" />,
    default: <LuLayers className="tool-server-icon" />
  }), []);

  if (!isVisible) return null;

  return (
    <motion.div
      className="tool-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={handleCancel}
    >
      <motion.div
        className="tool-modal-container"
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tool-modal-header">
          <span className="tool-modal-title">Select Tools</span>
          <span className="tool-selected-count">{selectedCount} selected</span>
        </div>

        <div className="tool-modal-body">
          {loading ? (
            <div className="tool-loading-text">Loading tools...</div>
          ) : error ? (
            <div className="tool-error-text">{error}</div>
          ) : availableServers.length === 0 ? (
            <div className="tool-error-text">No available tools found.</div>
          ) : (
            availableServers.map((server) => {
              const serverId = server.server_name;
              const isSelected = selectedTools.has(serverId);
              const icon = serverIcons[serverId] || serverIcons.default;

              return (
                <div
                  key={serverId}
                  className={`tool-server-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleTool(serverId)}
                >
                  <div className="tool-server-info">
                    {icon}
                    <div className="tool-server-meta">
                      <div className="tool-server-name">{server.display_name || serverId}</div>
                      <div className="tool-server-description">
                        {serverId === 'search' ? 'Real-time web search' : serverId === 'deep-research' ? 'Deep research tasks' : 'External MCP server tool'}
                      </div>
                    </div>
                  </div>
                  <div className={`tool-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <LuCheck />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="tool-modal-footer">
          <div className="tool-modal-actions">
            <div className="tool-btn-cancel" onClick={handleCancel}>Cancel</div>
            <div className="tool-btn-confirm" onClick={handleConfirm}>Confirm</div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default React.memo(ToolModal);
