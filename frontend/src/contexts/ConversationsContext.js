import React, { createContext, useState, useEffect, useCallback } from 'react';

export const ConversationsContext = createContext();

export const ConversationsProvider = ({ children }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("samrag_auth_token");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};

      const response = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/conversations`, {
        credentials: "include",
        headers
      });
      if (!response.ok) {
        throw new Error('Failed to load conversations.');
      }
      const data = await response.json();
      setConversations(data.conversations);
      setError(null);
    } catch (error) {
      console.error('Failed to load conversations.', error);
      setError(error.message || "Failed to load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const addConversation = useCallback((newConv) => {
    setConversations((prev) => [newConv, ...prev]);
  }, []);

  const updateAlias = useCallback((conversation_id, newAlias, updateTimestamp = true) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.conversation_id === conversation_id) {
          const updatedConv = { ...c, alias: newAlias, isLoading: false };
          if (updateTimestamp) {
            updatedConv.updated_at = new Date().toISOString();
          }
          return updatedConv;
        }
        return c;
      })
    );
  }, []);

  const toggleStarConversation = useCallback((conversation_id, starredStatus) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.conversation_id === conversation_id
          ? {
            ...c,
            starred: starredStatus,
            starred_at: starredStatus ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          }
          : c
      )
    );
  }, []);

  const deleteConversation = useCallback((conversation_id) => {
    setConversations((prev) => prev.filter((c) => c.conversation_id !== conversation_id));
  }, []);

  const updateTimestamp = useCallback((conversation_id, timestamp) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.conversation_id === conversation_id
          ? { ...c, updated_at: timestamp }
          : c
      )
    );
  }, []);

  return (
    <ConversationsContext.Provider
      value={{
        conversations,
        loading,
        error,
        fetchConversations,
        addConversation,
        updateAlias,
        toggleStarConversation,
        deleteConversation,
        updateTimestamp
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
};