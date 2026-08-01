import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from "react";
import { useParams, useLocation } from "react-router-dom";
import { IoImageOutline } from "react-icons/io5";
import { LuArrowDown } from "react-icons/lu";
import { PulseLoader } from "react-spinners";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsContext } from "../contexts/SettingsContext";
import { ConversationsContext } from "../contexts/ConversationsContext";
import { useFileUpload } from "../utils/useFileUpload";
import InputContainer from "../components/InputContainer";
import Message from "../components/Message";
import Modal from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import StatusBlock from "../components/StatusBlock";
import { getFastApiUrl } from "../config";
import "../styles/Common.css";

function Chat({ isTouch, chatMessageRef }) {
  const { conversation_id } = useParams();
  const location = useLocation();
  const {
    model,
    models,
    verbosity,
    instructions,
    memory,
    maxFileInput,
    updateModel,
    switchVisionMode,
    switchNonVisionMode,
    setVerbosity,
    setInstructions,
    setMemory,
    setAlias
  } = useContext(SettingsContext);

  const { updateAlias, updateTimestamp } = useContext(ConversationsContext);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editBackup, setEditBackup] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const [deleteIndex, setdeleteIndex] = useState(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [isRemoteStreaming, setIsRemoteStreaming] = useState(false);

  const { showToast } = useToast();

  const {
    uploadedFiles,
    setUploadedFiles,
    processFiles,
    removeFile
  } = useFileUpload();

  const abortControllerRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const uploadingFiles = uploadedFiles.some((file) => !file.content);
  const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const addAssistantMessage = useCallback(() => {
    const newMessage = { 
      role: "assistant", 
      content: "", 
      isComplete: false,
      id: generateMessageId()
    };
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  const updateLastAssistantMessage = useCallback((chunk) => {
    setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex < 0 || prev[lastIndex].role !== "assistant") {
        return prev;
      }
      const updatedMessages = [...prev];
      const updatedContent = updatedMessages[lastIndex].content + chunk;
      updatedMessages[lastIndex] = {
        ...updatedMessages[lastIndex],
        content: updatedContent,
      };
      return updatedMessages;
    });
  }, []);

  const markLastAssistantMessageComplete = useCallback(() => {
    setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex < 0 || prev[lastIndex].role !== "assistant") {
        return prev;
      }
      const updatedMessages = [...prev];
      updatedMessages[lastIndex] = {
        ...updatedMessages[lastIndex],
        isComplete: true,
      };
      return updatedMessages;
    });
  }, []);

  const applyData = useCallback((data) => {
    if (data.model) updateModel(data.model);
    if (data.verbosity) setVerbosity(data.verbosity);
    if (data.instructions) setInstructions(data.instructions);
    if (data.memory) setMemory(data.memory);
    if (data.alias) setAlias(data.alias);

    const messageList = Array.isArray(data.messages) ? data.messages : (Array.isArray(data.conversation) ? data.conversation : []);
    const initialMessages = messageList.map((m) => {
      const messageWithId = m.id ? m : { ...m, id: generateMessageId() };
      return messageWithId;
    });
    setMessages(initialMessages);

    const lastMessage = messageList[messageList.length - 1];
    if (lastMessage && lastMessage.role === "user" && Array.isArray(lastMessage.content)) {
      const hasImages = lastMessage.content.some(
        (item) => item.type === "image"
      );
      if (hasImages) {
        switchVisionMode();
      } else {
        switchNonVisionMode();
      }
    }

    setIsInitialized(true);
  }, [updateModel, setVerbosity, setInstructions, setMemory, setAlias, switchVisionMode, switchNonVisionMode]);

  const pollRemote = useCallback((initialData = null) => {
    if (initialData) applyData(initialData);
    clearInterval(pollIntervalRef.current);
    setIsRemoteStreaming(true);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const pollRes = await fetch(`${getFastApiUrl()}/chat/conversation/${conversation_id}`, {
          credentials: "include"
        });
        if (!pollRes.ok) {
          clearInterval(pollIntervalRef.current);
          setIsRemoteStreaming(false);
          return;
        }
        const pollData = await pollRes.json();
        if (!pollData.is_streaming) {
          clearInterval(pollIntervalRef.current);
          setIsRemoteStreaming(false);
          applyData(pollData);
        }
      } catch {
        clearInterval(pollIntervalRef.current);
        setIsRemoteStreaming(false);
      }
    }, 2000);
  }, [conversation_id, applyData]);

  const showSendError = useCallback((shouldPoll = false) => {
    showToast("An error occurred while sending the message.");
    if (shouldPoll) pollRemote();
  }, [pollRemote, showToast]);

  const showDeleteError = useCallback((shouldPoll = false) => {
    showToast("An error occurred while deleting the message.");
    if (shouldPoll) pollRemote();
  }, [pollRemote, showToast]);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        if (location.state?.initialMessage) {
          setIsInitialized(true);
          const initialMessage = location.state.initialMessage;
          const initialFiles = location.state.initialFiles;
          const initialWebSearch = Boolean(location.state.initialWebSearch);
          const initialUseLlm = location.state.initialUseLlm !== undefined ? Boolean(location.state.initialUseLlm) : true;

          window.history.replaceState({}, "", location.pathname);

          sendMessage(initialMessage, initialFiles || [], initialWebSearch, initialUseLlm);

          (async () => {
            try {
              const token = localStorage.getItem("samrag_auth_token");
              const headers = {
                "Content-Type": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
              };

              const aliasResponse = await fetch(
                `${getFastApiUrl()}/chat/get_alias`,
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ 
                    conversation_id: conversation_id,
                    text: initialMessage
                  }),
                  credentials: "include"
                }
              );

              if (aliasResponse.status === 401) {
                if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
                  window.location.href = '/login?expired=true';
                }
                return;
              }
              const aliasData = await aliasResponse.json();
              if (aliasData && aliasData.alias) {
                setAlias(aliasData.alias);
                updateAlias(conversation_id, aliasData.alias, false);
              }
            } catch (err) {
              updateAlias(conversation_id, "New Chat", false);
            }
          })();
        } 
        
        else {
          const token = localStorage.getItem("samrag_auth_token");
          const headers = token ? { "Authorization": `Bearer ${token}` } : {};

          const res = await fetch(`${getFastApiUrl()}/chat/conversation/${conversation_id}`, {
            credentials: "include",
            headers
          });
          if (!res.ok) {
            showToast("An error occurred during initialization.");
            return;
          }
          const data = await res.json();

          if (data.is_streaming) {
            pollRemote(data);
          } else {
            applyData(data);
          }
        }
      } catch (err) {
        showToast("An error occurred during initialization.");
      } finally {
        if (!isInitialized) setIsInitialized(true);
      }
    };

    initializeChat();
    return () => clearInterval(pollIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation_id, location.state]);

  useEffect(() => {
    const container = chatMessageRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
    };
    container.addEventListener('scroll', handleScroll);
    const t = setTimeout(() => setIsButtonReady(true), 600);
    return () => { container.removeEventListener('scroll', handleScroll); clearTimeout(t); };
  // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (isInitialized && chatMessageRef.current) chatMessageRef.current.scrollTop = chatMessageRef.current.scrollHeight;
  }, [chatMessageRef, isInitialized]);
  
  useEffect(() => {
    if (scrollTrigger !== 0 && chatMessageRef.current) chatMessageRef.current.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessageRef, scrollTrigger]);

  useEffect(() => {
    if (!isRemoteStreaming) return;
    requestAnimationFrame(() => {
      chatMessageRef.current?.scrollTo({
        top: chatMessageRef.current.scrollHeight,
        behavior: "smooth"
      });
    });
  }, [chatMessageRef, isRemoteStreaming]);

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

  const sendMessage = useCallback(
    async (message, files = uploadedFiles, useSearch = false, useLlm = true) => {
      if (!message.trim() || uploadingFiles) {
        if (!message.trim()) {
          showToast("Please enter a prompt.");
        }
        return;
      }

      if (files.length > maxFileInput) {
        showToast(`You can upload a maximum of ${maxFileInput} files.`);
        return;
      }

      const contentParts = [];
      contentParts.push({ type: "text", text: message });
      if (files.length > 0) {
        contentParts.push(...files);
      }

      const userMessage = { 
        role: "user", 
        content: contentParts,
        id: generateMessageId()
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputText("");
      uploadedFiles.forEach((file) => { if (file.preview) URL.revokeObjectURL(file.preview); });
      setUploadedFiles([]);
      setIsLoading(true);
      setTimeout(() => {
        setScrollTrigger((v) => v + 1);
      }, 1100);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const selectedModel = models.find(m => m.model_name === model) || {
          model_name: model || 'GSTGPT Hybrid RAG Engine',
          endpoint: '/chat/stream'
        };

        const token = localStorage.getItem("samrag_auth_token");
        const headers = {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        };

        const response = await fetch(
          `${getFastApiUrl()}${selectedModel.endpoint}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              conversation_id,
              model: selectedModel.model_name,
              message: contentParts,
              verbosity,
              instructions,
              memory,
              web_search: useSearch,
              use_web_search: useSearch,
              use_llm: useLlm,
            }),
            credentials: "include",
            signal: controller.signal,
          }
        );

        if (response.status === 401) {
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
            window.location.href = '/login?expired=true';
          }
          return;
        }
        else if (response.status === 409) {
          setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
          setInputText(message);
          showSendError(true);
          return;
        }
        else if (!response.ok) {
          throw new Error(`Server returned status ${response.status} (${response.statusText || "Error"})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let addedAssistantMessage = false;
        let isAborted = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          if (!addedAssistantMessage) {
            addAssistantMessage();
            addedAssistantMessage = true;
          }

          updateLastAssistantMessage(chunk);
        }

        if (!isAborted) {
          markLastAssistantMessageComplete();
          updateTimestamp(conversation_id, new Date().toISOString());
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            role: "assistant",
            isError: true,
            content: `Error: ${err.message || "Failed to load response from server."}`
          }
        ]);
        showToast("An error occurred: " + err.message);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [
      conversation_id,
      model,
      models,
      verbosity,
      instructions,
      memory,
      maxFileInput,
      uploadedFiles,
      setUploadedFiles,
      uploadingFiles,
      addAssistantMessage,
      updateLastAssistantMessage,
      markLastAssistantMessageComplete,
      updateTimestamp,
      showSendError,
      showToast
    ]
  );

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const deleteMessages = useCallback(
    async (startIndex) => {
      let savedMessages;
      setMessages((prevMessages) => {
        savedMessages = prevMessages;
        return prevMessages.slice(0, startIndex);
      });

      try {
        const res = await fetch(`${getFastApiUrl()}/conversation/${conversation_id}/${startIndex}`, {
          method: "DELETE",
          credentials: "include"
        });
        if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
        }
        if (!res.ok) {
          const error = new Error('Failed to delete message.');
          error.status = res.status;
          throw error;
        }
      } catch (err) {
        setMessages(savedMessages);
        throw err;
      }
    },
    [conversation_id]
  );

  const regenerateAssistantMessage = useCallback(
    async (messageIndex) => {
      if (isLoading || isRemoteStreaming) return;
      const targetUserIndex = messageIndex - 1;
      if (targetUserIndex < 0) return;

      const userMsg = messages[targetUserIndex];
      if (!userMsg || userMsg.role !== "user") return;

      const text = userMsg.content.find((item) => item.type === "text")?.text || "";
      const files = userMsg.content
        .filter((item) => item.type === "image" || item.type === "file")
        .map((item) => ({ ...item, preview: undefined, id: generateMessageId() }));

      try {
        await deleteMessages(targetUserIndex);
      } catch (err) {
        if (err.status === 400 || err.status === 409) {
          showSendError(true);
        } else {
          showSendError();
        }
        return;
      }

      sendMessage(text, files);
    },
    [messages, isLoading, isRemoteStreaming, deleteMessages, sendMessage, showSendError]
  );

  const startEdit = useCallback(
    (idx) => {
      if (isLoading || isRemoteStreaming) {
        showToast("Cannot edit while response is generating.");
        return;
      }
      const target = messages[idx];
      if (!target) return;

      const text = target.content.find((item) => item.type === "text")?.text || "";
      const files = target.content
        .filter((item) => item.type === "image" || item.type === "file")
        .map((item) => ({ ...item, preview: undefined, id: generateMessageId() }));

      setEditBackup(messages);
      setMessages(messages.slice(0, idx));
      setUploadedFiles(files);
      setInputText(text);
      setEditingIndex(idx);
      setTimeout(() => {
        setScrollTrigger((v) => v + 1);
      }, 0);
    },
    [messages, isLoading, isRemoteStreaming, setUploadedFiles, showToast]
  );

  const cancelEdit = useCallback(() => {
    if (editBackup) setMessages(editBackup);
    uploadedFiles.forEach((file) => { if (file.preview) URL.revokeObjectURL(file.preview); });
    setUploadedFiles([]);
    setInputText("");
    setEditBackup(null);
    setEditingIndex(null);
  }, [editBackup, uploadedFiles, setUploadedFiles]);

  const handleSend = useCallback(
    async (message, useSearch = false, useLlm = true) => {
      if (editingIndex !== null) {
        try {
          await deleteMessages(editingIndex);
        } catch (err) {
          if (err.status === 400 || err.status === 409) {
            showSendError(true);
          } else {
            showSendError();
          }
          return;
        }
        setEditBackup(null);
        setEditingIndex(null);
      }
      sendMessage(message, uploadedFiles, useSearch, useLlm);
    },
    [editingIndex, deleteMessages, sendMessage, uploadedFiles, showSendError]
  );

  const handleDelete = useCallback((idx) => {
    if (isLoading || isRemoteStreaming) {
      showToast("Cannot delete while response is generating.");
      return;
    }
    setdeleteIndex(idx);
    setConfirmModal(true);
  }, [isLoading, isRemoteStreaming, showToast]);

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isInitialized && (
        <motion.div
          className="page-loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <PulseLoader loading={true} size={20} />
        </motion.div>
      )}

      <div className="chat-messages-wrapper">
        <div className="chat-messages" ref={chatMessageRef} style={{ scrollbarGutter: "stable" }}>
          {useMemo(() =>
            messages.map((msg, idx) => (
              <Message
                key={msg.id}
                messageIndex={idx}
                role={msg.role}
                content={msg.content}
                isComplete={msg.isComplete}
                onDelete={handleDelete}
                onRegenerate={regenerateAssistantMessage}
                onEdit={startEdit}
                disableActions={editingIndex !== null}
                setScrollTrigger={setScrollTrigger}
                isTouch={isTouch}
                isLoading={isLoading}
                isLastMessage={idx === messages.length - 1}
                shouldRender={idx >= messages.length - 6}
              />
            )), [messages, handleDelete, regenerateAssistantMessage, startEdit, editingIndex, isTouch, isLoading]
          )}

          <AnimatePresence>
            {confirmModal && (
              <Modal
                message="Are you sure you want to delete this message?"
                onConfirm={async () => {
                  if (isLoading || isRemoteStreaming) {
                    showToast("Cannot delete while response is generating.");
                    setdeleteIndex(null);
                    setConfirmModal(false);
                    return;
                  }
                  try {
                    await deleteMessages(deleteIndex);
                  } catch (err) {
                    if (err.status === 400 || err.status === 409) {
                      showDeleteError(true);
                    } else {
                      showDeleteError();
                    }
                  }
                  setdeleteIndex(null);
                  setConfirmModal(false);
                }}
                onCancel={() => {
                  setdeleteIndex(null);
                  setConfirmModal(false);
                }}
              />
            )}
          </AnimatePresence>

          {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
            <StatusBlock type="thinking" isActive={true} activeLabel="" />
          )}

          {isRemoteStreaming && (
            <StatusBlock type="remote-streaming" />
          )}

        </div>
        <button
          className={`scroll-to-bottom-btn ${!isAtBottom && isButtonReady ? 'visible' : ''}`}
          onClick={() => chatMessageRef.current?.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: 'smooth' })}
        >
          <LuArrowDown />
        </button>
      </div>

      <InputContainer
        isTouch={isTouch}
        placeholder="Ask anything..."
        inputText={inputText}
        setInputText={setInputText}
        isLoading={isLoading}
        isRemoteStreaming={isRemoteStreaming}
        onSend={handleSend}
        onCancel={cancelRequest}
        isEditing={editingIndex !== null}
        onCancelEdit={cancelEdit}
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

export default React.memo(Chat);
