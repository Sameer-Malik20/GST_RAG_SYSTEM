import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { useFileUpload } from "../utils/useFileUpload";
import { useToast } from "../contexts/ToastContext";
import InputContainer from "../components/InputContainer";
import "../styles/Common.css";

function ImageHome({ isTouch, userInfo }) {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const { showToast } = useToast();
  const abortControllerRef = useRef(null);

  const welcomeMessage = useMemo(() => {
    const h = new Date().getHours();
    const name = userInfo?.name?.split(' ')[0] || "there";

    const morning = [
      `Good morning, ${name}.`,
      "Do you have an image idea in mind this morning?",
      "Let's create something great today.",
    ];
    const afternoon = [
      `Good afternoon, ${name}!`,
      "What scene should we visualize this afternoon?",
    ];
    const evening = [
      "Great job today.",
      "The day is winding down.",
    ];
    const night = [
      `Good night, ${name}.`,
      "I'll help draw whatever you're imagining tonight.",
    ];
    const general = [
      `Welcome, ${name}.`,
      `Glad to see you, ${name}.`,
      "What kind of image would you like to generate?",
      "What scene are you imagining?",
      "What should we draw today?",
      "Describe the scene in your imagination.",
    ];

    let pool;
    if (h >= 5 && h < 12) pool = morning;
    else if (h >= 12 && h < 17) pool = afternoon;
    else if (h >= 17 && h < 21) pool = evening;
    else pool = night;

    const combined = [...pool, ...general];
    return combined[Math.floor(Math.random() * combined.length)];
  }, [userInfo]);

  const {
    switchImageMode,
    setHasImage
  } = useContext(SettingsContext);

  const { addConversation } = useContext(ConversationsContext);

  const {
    uploadedFiles,
    processFiles,
    removeFile
  } = useFileUpload([], null, "image");

  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  useEffect(() => {
    const hasUploadedImages = uploadedFiles.length > 0;
    switchImageMode(hasUploadedImages);
    setHasImage(hasUploadedImages);
  }, [uploadedFiles, switchImageMode, setHasImage]);

  const sendMessage = useCallback(
    async (message) => {
      if (!message.trim() || uploadingFiles) return;
      try {
        setIsLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/image/new_conversation`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        if (!res.ok) {
          throw new Error('Failed to start a new chat.');
        }

        const data = await res.json();
        let title = message.trim();
        if (title.length > 35) title = title.substring(0, 32) + "...";

        const newConversation = {
          type: "image",
          conversation_id: data.conversation_id,
          alias: title || "New Chat",
          starred: false,
          starred_at: null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          isLoading: false
        };
        addConversation(newConversation);

        navigate(`/image/${data.conversation_id}`, {
          state: {
            initialMessage: message,
            initialFiles: uploadedFiles,
          },
          replace: false,
        });
      } catch (error) {
        showToast("Failed to start a new chat.");
        setIsLoading(false);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [navigate, uploadedFiles, uploadingFiles, addConversation, showToast]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setIsDragActive(false);
      const files = Array.from(e.dataTransfer.files);

      const imageFiles = files.filter((file) => file.type && file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        showToast("Only image files can be uploaded.");
        return;
      }
      await processFiles(imageFiles);
    },
    [processFiles, showToast]
  );

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="welcome-container">
        <motion.div
          className="welcome-message"
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {welcomeMessage}
        </motion.div>
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="Enter a prompt..."
        inputText={inputText}
        setInputText={setInputText}
        isLoading={isLoading}
        onSend={sendMessage}
        onCancel={cancelRequest}
        uploadedFiles={uploadedFiles}
        processFiles={processFiles}
        removeFile={removeFile}
        uploadingFiles={uploadingFiles}
        imageOnly={true}
      />

      <AnimatePresence>
        {isDragActive && (
          <motion.div
            key="drag-overlay"
            className="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <div className="drag-container">
              <IoImageOutline style={{ fontSize: "40px" }} />
              <div className="drag-text">Drop images here to add</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(ImageHome);
