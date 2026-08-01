import React, { useState, useContext, useRef, useEffect } from "react";
import { useLocation, useNavigate } from 'react-router-dom';
import { RiMenuLine, RiArrowRightSLine, RiShare2Line, RiLightbulbLine, RiEdit2Line, RiImage2Line, RiCloseLine } from "react-icons/ri";
import { SettingsContext } from "../contexts/SettingsContext";
import { motion, AnimatePresence } from "framer-motion";
import BrandLogo from "./BrandLogo";


import Tooltip from "./Tooltip";
import { useToast } from "../contexts/ToastContext";
import "../styles/Header.css";

function Header({ toggleSidebar, isSidebarOpen, isTouch }) {
  const {
    models,
    model,
    imageModels,
    imageModel,
    verbosity,
    memory,
    instructions,
    hasImage,
    canControlVerbosity,
    canControlSystemMessage,
    isDAN,
    updateModel,
    updateImageModel,
    setVerbosity,
    setMemory,
    setInstructions,
    setIsDAN
  } = useContext(SettingsContext);

  const location = useLocation();
  const navigate = useNavigate();
  const { pathname } = location;
  const isLogoOnly = pathname.startsWith("/view") || pathname.startsWith("/share");
  const isImage = pathname.startsWith("/image");
  const match = pathname.match(/^\/(?:chat|image)\/([^/]+)/);

  const activeModels = isImage ? imageModels : models;
  const activeModel = isImage ? imageModel : model;
  const activeUpdateModel = isImage ? updateImageModel : updateModel;

  const selectedModel = activeModels.find(m => m.model_name === activeModel);
  const verbosityLevels = selectedModel?.controls?.verbosity?.levels ?? [];
  const conversation_id = match?.[1];

  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [isSystemMessageOpen, setIsSystemMessageOpen] = useState(false);
  const { showToast } = useToast();
  const [localMemory, setLocalMemory] = useState(memory);
  const [localVerbosity, setLocalVerbosity] = useState(verbosity);

  const modelModalRef = useRef(null);
  const controlPanelRef = useRef(null);
  const instructionsRef = useRef(null);
  const memTimerRef = useRef(null);
  const verbosityTimerRef = useRef(null);

  useEffect(() => { setLocalMemory(memory); }, [memory]);
  useEffect(() => { setLocalVerbosity(verbosity); }, [verbosity]);

  const handleMemoryChange = (val) => {
    setLocalMemory(val);
    clearTimeout(memTimerRef.current);
    memTimerRef.current = setTimeout(() => setMemory(val), 150);
  };

  const handleVerbosityChange = (val) => {
    setLocalVerbosity(val);
    clearTimeout(verbosityTimerRef.current);
    verbosityTimerRef.current = setTimeout(() => setVerbosity(val), 150);
  };

  const modelsList = activeModels.filter(m => !m.variants?.base);
  const currentModelAlias = activeModels.find(m => m.model_name === activeModel)?.model_alias || "Select Model";

  const handleShare = async () => {
    try {
      if (!conversation_id) {
        throw new Error("Shared conversation not found.");
      }

      const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/share/new_share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id })
      });
      if (!res.ok) {
        throw new Error("Shared conversation not found.");
      }
      const data = await res.json();
      const shareUrl = `${window.location.origin}/share/${data.share_id}`;
      await navigator.clipboard.writeText(shareUrl);
      showToast("Share link copied to clipboard.", "copy");
    } catch (error) {
      console.error('Failed to create share link:', error);
      showToast(error.message || "Failed to create share link.");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isModelModalOpen &&
        modelModalRef.current &&
        !modelModalRef.current.contains(event.target)
      ) {
        setIsModelModalOpen(false);
      }
      if (
        isControlPanelOpen &&
        controlPanelRef.current &&
        !controlPanelRef.current.contains(event.target) &&
        !event.target.closest(".slider-icon")
      ) {
        setIsControlPanelOpen(false);
      }
      if (
        isSystemMessageOpen &&
        instructionsRef.current &&
        !instructionsRef.current.contains(event.target) &&
        !event.target.closest(".system-message-icon")
      ) {
        setIsSystemMessageOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isModelModalOpen, isControlPanelOpen, isSystemMessageOpen]);

  if (isLogoOnly) return (
    <div className="header" style={{ padding: "0 20px" }}>
      <BrandLogo size="medium" onClick={() => navigate("/")} />
    </div>
  );


  if (isImage || pathname === "/" || pathname.startsWith("/chat/") || pathname.startsWith("/realtime")) return (
    <div className="header">
      <div className="header-left">
        {!isSidebarOpen && (
          <div className="header-icon menu-icon">
            <RiMenuLine onClick={toggleSidebar} />
          </div>
        )}
        <div className="model-box" onClick={() => setIsModelModalOpen(true)}>
          {currentModelAlias}
          <RiArrowRightSLine className="expand-icon" />
        </div>
      </div>

      <div className="header-right">
        {conversation_id && (
          <div className="header-icon-wrapper">
            <Tooltip content="Share" position="left" isTouch={isTouch}>
              <div className="header-icon share-icon">
                <RiShare2Line onClick={handleShare} />
              </div>
            </Tooltip>
          </div>
        )}

        {!isImage && (
          <AnimatePresence initial={false}>
            <motion.div
              className="header-icon-wrapper"
              key="controls"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Tooltip content="Parameter Settings" position="left" isTouch={isTouch}>
                <div className="header-icon slider-icon">
                  <RiLightbulbLine
                    onClick={() => {
                      setIsControlPanelOpen(!isControlPanelOpen);
                      setIsSystemMessageOpen(false);
                    }}
                    style={{ strokeWidth: 0.3 }}
                  />
                </div>
              </Tooltip>

              <AnimatePresence>
                {isControlPanelOpen && (
                  <motion.div
                    className="slider-container"
                    ref={controlPanelRef}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {canControlVerbosity && (
                      <div className="slider-section">
                        <div className="custom-item dropdown-toggle">
                          <span className="bold label-bold">Model</span>
                          <span className="dropdown-label">{selectedModel?.model_alias || "Select Model"}</span>
                        </div>
                        <div className="slider-label">
                          <span>Response Length</span>
                          <span className="slider-value">{localVerbosity}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={verbosityLevels.length - 1}
                          step={1}
                          value={verbosityLevels.indexOf(localVerbosity)}
                          onChange={(e) => handleVerbosityChange(verbosityLevels[parseInt(e.target.value)])}
                          className="slider"
                        />
                      </div>
                    )}
                    <div className="slider-section">
                      <div className="slider-label">
                        <span>Chat Memory</span>
                        <span className="slider-value">
                          {localMemory === 0 ? "Disabled" : `${localMemory} turns`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={12}
                        step={1}
                        value={localMemory}
                        onChange={(e) => handleMemoryChange(parseInt(e.target.value))}
                        className="slider"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {canControlSystemMessage && (
              <motion.div
                className="header-icon-wrapper"
                key="system"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Tooltip content="Instruction Settings" position="left" isTouch={isTouch}>
                  <div className="header-icon system-message-icon">
                    <RiEdit2Line
                      onClick={() => {
                        setIsSystemMessageOpen(!isSystemMessageOpen);
                        setIsControlPanelOpen(false);
                      }}
                      style={{ fontSize: "20px", strokeWidth: 0.3 }}
                    />
                  </div>
                </Tooltip>

                <AnimatePresence>
                  {isSystemMessageOpen && (
                    <motion.div
                      className="system-message-container"
                      ref={instructionsRef}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="system-message-label">
                        <span>System Instructions</span>
                        <span
                          className={`dan-toggle ${isDAN ? "active" : ""}`}
                          onClick={() => setIsDAN(!isDAN)}
                        >
                          DAN
                        </span>
                      </div>
                      <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="system-message-input"
                        placeholder="Enter system instructions..."
                        rows={5}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {isModelModalOpen && (
          <motion.div
            className="hmodal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button className="hmodal-close" onClick={() => setIsModelModalOpen(false)}>
              <RiCloseLine />
            </button>
            <div className="hmodal" ref={modelModalRef}>
              <div className="model-list">
                {modelsList.map((m, index) => {
                  const visionDisabled = hasImage && !m.capabilities?.vision;
                  return (
                    <Tooltip
                      key={index}
                      content="Vision Not Supported"
                      position="overlay"
                      isTouch={isTouch}
                      enabled={visionDisabled}
                    >
                      <div
                        className={`model-item${visionDisabled ? " disabled" : ""}`}
                        onClick={() => {
                          if (visionDisabled) return;
                          activeUpdateModel(m.model_name);
                          setIsModelModalOpen(false);
                        }}
                      >
                        <div className="model-alias">
                          {m.model_alias}
                          <div className="model-badge">
                            {m.capabilities?.vision && (
                              <RiImage2Line className="image-badge" />
                            )}
                          </div>
                        </div>
                        <div className="model-description">{m.description}</div>
                        <div className="model-pricing">
                          {isImage
                            ? `$${parseFloat(((parseFloat(m.billing?.in_billing || 0) + parseFloat(m.billing?.out_billing || 0)) * 100).toFixed(1))} / 100 uses`
                            : `In $${m.billing?.in_billing || 0} / Out $${m.billing?.out_billing || 0}`
                          }
                        </div>
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return null;
}

export default React.memo(Header);
