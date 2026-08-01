import React, { useState, useCallback, useRef, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { useFileUpload } from "../utils/useFileUpload";
import { useToast } from "../contexts/ToastContext";
import InputContainer from "../components/InputContainer";
import "../styles/Common.css";

import { getFastApiUrl } from "../config";

function Home({ isTouch, userInfo }) {
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
      "Shall we get started this morning?",
      "Let's make today productive.",
      "What are you curious about this morning?",
    ];
    const afternoon = [
      "Shall we begin our afternoon session?",
      `Good afternoon, ${name}!`,
      "What topic should we discuss this afternoon?",
    ];
    const evening = [
      "Great work today.",
      "The day is ending soon.",
    ];
    const night = [
      `Good night, ${name}.`,
      "Working late tonight?",
    ];
    const general = [
      `Welcome, ${name}.`,
      `Glad to see you, ${name}.`,
      "How can I help you today?",
      "What would you like to explore?",
      "Ask me anything you're working on.",
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
    model,
    verbosity,
    instructions,
    isDAN,
  } = useContext(SettingsContext);

  const { addConversation } = useContext(ConversationsContext);

  const {
    uploadedFiles,
    processFiles,
    removeFile
  } = useFileUpload();

  const uploadingFiles = uploadedFiles.some((file) => !file.content);

  const sendMessage = useCallback(
    async (message, useSearch = false, useLlm = true) => {
      if (!message.trim() || uploadingFiles) return;
      try {
        setIsLoading(true);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const token = localStorage.getItem("samrag_auth_token");
        const headers = {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        };

        const res = await fetch(`${getFastApiUrl()}/chat/new_conversation`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers,
          body: JSON.stringify({
            model,
            verbosity,
            instructions,
            isDAN
          })
        });
        if (!res.ok) {
          throw new Error('Failed to start a new chat.');
        }

        const data = await res.json();
        let title = message.trim();
        if (title.length > 35) title = title.substring(0, 32) + "...";

        const newConversation = {
          type: "chat",
          conversation_id: data.conversation_id,
          alias: title || "New Chat",
          starred: false,
          starred_at: null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          isLoading: false
        };
        addConversation(newConversation);

        navigate(`/chat/${data.conversation_id}`, {
          state: {
            initialMessage: message,
            initialFiles: uploadedFiles,
            initialWebSearch: useSearch,
            initialUseLlm: useLlm,
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
    [navigate, model, verbosity, instructions, isDAN, uploadedFiles, uploadingFiles, addConversation, showToast]
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
      await processFiles(files);
    },
    [processFiles]
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
        placeholder="Ask anything..."
        inputText={inputText}
        setInputText={setInputText}
        isLoading={isLoading}
        onSend={sendMessage}
        onCancel={cancelRequest}
        uploadedFiles={uploadedFiles}
        processFiles={processFiles}
        removeFile={removeFile}
        uploadingFiles={uploadingFiles}
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
              <div className="drag-text">Drop files here to add</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(Home);
