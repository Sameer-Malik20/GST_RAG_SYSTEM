import React, { useState, useRef, useEffect, useCallback, useContext } from "react";
import {
  FiPlus,
  FiArrowUp,
  FiX,
  FiImage,
  FiPaperclip,
  FiSearch,
  FiCpu,
  FiDatabase,
} from "react-icons/fi";
import { IoStop, IoMic, IoMicOutline, IoClose } from "react-icons/io5";
import { GoPencil } from "react-icons/go";
import { motion, AnimatePresence } from "framer-motion";
import Tooltip from "./Tooltip";
import ToolModal from "./ToolModal";
import ThinkingDropdown from "./ThinkingDropdown";
import { SettingsContext } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import "../styles/InputContainer.css";
import "../styles/FileTile.css";

const getFileExt = (name) =>
  name && name.includes(".") ? name.split(".").pop().toUpperCase() : "FILE";

function InputContainer({
  isTouch,
  placeholder,
  inputText,
  setInputText,
  isLoading,
  isRemoteStreaming,
  onSend,
  onCancel,
  isEditing,
  onCancelEdit,
  uploadedFiles,
  processFiles,
  removeFile,
  uploadingFiles,
  imageOnly = false,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [isRagOnline, setIsRagOnline] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(() => {
    try {
      const saved = localStorage.getItem("gst_is_search_active");
      return saved !== null ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });
  const [isUseLlmActive, setIsUseLlmActive] = useState(() => {
    try {
      const saved = localStorage.getItem("gst_is_use_llm_active");
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  const { showToast } = useToast();
  const {
    thinkingLevel,
    thinkingLevels,
    setThinkingLevel,
    canControlThinking,
    activeTools,
    setActiveTools,
  } = useContext(SettingsContext);

  useEffect(() => {
    try {
      localStorage.setItem("gst_is_search_active", JSON.stringify(isSearchActive));
    } catch (e) {}
  }, [isSearchActive]);

  useEffect(() => {
    try {
      localStorage.setItem("gst_is_use_llm_active", JSON.stringify(isUseLlmActive));
    } catch (e) {}
  }, [isUseLlmActive]);

  useEffect(() => {
    let isMounted = true;

    const checkRagStatus = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch("http://localhost:8005/health", {
          signal: controller.signal
        }).catch(() => null);

        clearTimeout(timeoutId);

        if (res && res.ok) {
          if (isMounted) setIsRagOnline(true);
        } else {
          const fallbackRes = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/stats`, {
            signal: controller.signal
          }).catch(() => null);
          if (fallbackRes && fallbackRes.ok) {
            if (isMounted) setIsRagOnline(true);
          } else {
            if (isMounted) setIsRagOnline(false);
          }
        }
      } catch (error) {
        if (isMounted) setIsRagOnline(false);
      }
    };

    checkRagStatus();
    const interval = setInterval(checkRagStatus, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [inputText]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLoading) {
        if (onCancel) onCancel();
      } else if (!isRemoteStreaming && !uploadingFiles && inputText.trim()) {
        onSend(inputText, isSearchActive, isUseLlmActive);
      }
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      await processFiles(files);
    }
    e.target.value = "";
  };

  const handleRecordingStart = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setInputText((prev) => (prev ? `${prev} ${finalTranscript}` : finalTranscript));
      }
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setIsRecording(false);
      if (event.error === 'aborted' && event.message && event.message.includes('Dictation')) {
        showToast("Dictation disabled. Enable in Settings -> General -> Keyboard.");
      } else if (event.error !== 'aborted') {
        showToast(`Speech recognition error occurred: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [showToast, setInputText]);

  const handleRecordingStop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      handleRecordingStop();
    } else {
      handleRecordingStart();
    }
  }, [isRecording, handleRecordingStart, handleRecordingStop]);

  return (
    <div className="input-container-wrapper">
      <motion.div
        className={`input-container ${isRecording ? "recording" : ""}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {isEditing && (
          <div className="edit-header">
            <div className="edit-header-title">
              <GoPencil style={{ strokeWidth: 0.6 }} />
              <span>Editing</span>
            </div>
            <FiX className="edit-header-close" onClick={onCancelEdit} />
          </div>
        )}

        <AnimatePresence>
          {uploadedFiles.length > 0 && (
            <motion.div
              className="file-preview-area"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className={`file-object ${file.type === "image" ? "image" : ""}`}
                >
                  {file.type === "image" ? (
                    <img
                      src={file.preview || `${process.env.REACT_APP_FASTAPI_URL}${file.content}`}
                      alt={file.name}
                    />
                  ) : (
                    <>
                      <span className="file-name">{file.name}</span>
                      <span className="file-ext">{getFileExt(file.name)}</span>
                    </>
                  )}
                  <button
                    className="file-remove-btn"
                    onClick={() => removeFile(file.id)}
                  >
                    <IoClose />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="input-textarea"
            placeholder={placeholder}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>

        <div className="input-footer">
          <div className="footer-left">
            <div className="menu-wrapper" ref={menuRef}>
              <Tooltip content="Attach File" position="top" isTouch={isTouch}>
                <button
                  className="icon-button menu-trigger"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  <FiPlus />
                </button>
              </Tooltip>

              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    className="attach-menu"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div
                      className="menu-item"
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (fileInputRef.current) {
                          fileInputRef.current.accept = "image/*";
                          fileInputRef.current.click();
                        }
                      }}
                    >
                      <FiImage className="menu-icon" />
                      <span>Image</span>
                    </div>

                    {!imageOnly && (
                      <div
                        className="menu-item"
                        onClick={() => {
                          setIsMenuOpen(false);
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "*/*";
                            fileInputRef.current.click();
                          }
                        }}
                      >
                        <FiPaperclip className="menu-icon" />
                        <span>Document</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>

            <Tooltip
              content={isRagOnline ? "RAG System Online & Ready (Port 8005)" : "RAG System Offline (Port 8005)"}
              position="top"
              isTouch={isTouch}
            >
              <button
                type="button"
                className={`search-toggle-btn ${isRagOnline ? "active" : ""}`}
                style={{ cursor: "default" }}
              >
                <FiDatabase className="search-toggle-icon" />
                <span className="search-toggle-label">RAG</span>
                <span className={`search-toggle-badge ${isRagOnline ? "on" : "off"}`}>
                  {isRagOnline ? "Ready" : "Offline"}
                </span>
              </button>
            </Tooltip>

            <Tooltip
              content={isSearchActive ? "Search Enabled (Click to Turn Off)" : "Search Disabled (Click to Turn On)"}
              position="top"
              isTouch={isTouch}
            >
              <button
                type="button"
                className={`search-toggle-btn ${isSearchActive ? "active" : ""}`}
                onClick={() => setIsSearchActive((prev) => !prev)}
              >
                <FiSearch className="search-toggle-icon" />
                <span className="search-toggle-label">Search</span>
                <span className={`search-toggle-badge ${isSearchActive ? "on" : "off"}`}>
                  {isSearchActive ? "ON" : "OFF"}
                </span>
              </button>
            </Tooltip>

            <Tooltip
              content={isUseLlmActive ? "LLM Generation Active (Click to Bypass LLM & get direct results)" : "LLM Bypassed - Showing Direct Search Results (Click to Enable LLM)"}
              position="top"
              isTouch={isTouch}
            >
              <button
                type="button"
                className={`search-toggle-btn ${isUseLlmActive ? "active" : ""}`}
                onClick={() => setIsUseLlmActive((prev) => !prev)}
              >
                <FiCpu className="search-toggle-icon" />
                <span className="search-toggle-label">Use LLM</span>
                <span className={`search-toggle-badge ${isUseLlmActive ? "on" : "off"}`}>
                  {isUseLlmActive ? "ON" : "OFF"}
                </span>
              </button>
            </Tooltip>

            {canControlThinking && !imageOnly && (
              <ThinkingDropdown
                isTouch={isTouch}
                thinkingLevel={thinkingLevel}
                thinkingLevels={thinkingLevels}
                onLevelChange={setThinkingLevel}
              />
            )}
          </div>

          <div className="footer-right">
            <Tooltip content={isRecording ? "Stop Recording" : "Voice Input"} position="top" isTouch={isTouch}>
              <button
                className={`icon-button mic-button ${isRecording ? "recording" : ""}`}
                onClick={toggleRecording}
              >
                {isRecording ? <IoMic className="mic-active-icon" /> : <IoMicOutline />}
              </button>
            </Tooltip>

            {isLoading ? (
              <Tooltip content="Stop Response" position="top" isTouch={isTouch}>
                <button className="icon-button stop-button" onClick={onCancel}>
                  <IoStop />
                </button>
              </Tooltip>
            ) : (
              <Tooltip content="Send Message" position="top" isTouch={isTouch}>
                <button
                  className={`icon-button send-button ${inputText.trim() && !uploadingFiles && !isRemoteStreaming ? "active" : ""
                    }`}
                  onClick={() => {
                    if (inputText.trim() && !uploadingFiles && !isRemoteStreaming) {
                      onSend(inputText, isSearchActive, isUseLlmActive);
                    }
                  }}
                  disabled={!inputText.trim() || uploadingFiles || isRemoteStreaming}
                >
                  <FiArrowUp />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </motion.div>

      <ToolModal
        isVisible={isToolModalOpen}
        onClose={() => setIsToolModalOpen(false)}
        activeTools={activeTools}
        onSave={setActiveTools}
      />
    </div>
  );
}

export default React.memo(InputContainer);
