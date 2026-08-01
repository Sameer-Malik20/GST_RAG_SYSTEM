import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PulseLoader } from 'react-spinners';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/Admin.css';

const API = process.env.REACT_APP_FASTAPI_URL || 'http://localhost:5000/api';

function getAuthHeaders() {
  const token = localStorage.getItem('samrag_auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ---- Chat History Popup ---- */
function ChatHistoryPopup({ user, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const popupRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchConvs = async () => {
      try {
        const res = await fetch(`${API}/conversations/${user.user_id}`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (res.status === 401) { window.location.href = '/login?expired=true'; return; }
        const data = res.ok ? await res.json() : { conversations: [] };
        setConversations(data.conversations || []);
      } catch {
        setConversations([]);
      } finally {
        setLoading(false);
      }
    };
    fetchConvs();
  }, [user.user_id]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const openChat = (conv) => {
    onClose();
    navigate(`/chat/${conv.conversation_id}`);
  };

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="chat-popup-overlay">
      <motion.div
        ref={popupRef}
        className="chat-popup"
        initial={{ opacity: 0, scale: 0.96, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -8 }}
        transition={{ duration: 0.15 }}
      >
        {/* Header */}
        <div className="chat-popup-header">
          <div className="chat-popup-user-info">
            <div className="chat-popup-avatar">
              {(user.name || 'U')[0].toUpperCase()}
            </div>
            <div>
              <div className="chat-popup-username">{user.name}</div>
              <div className="chat-popup-email">{user.email}</div>
            </div>
          </div>
          <button className="chat-popup-close" onClick={onClose}>✕</button>
        </div>

        <div className="chat-popup-title-bar">
          Chat History
          {!loading && (
            <span className="chat-popup-count">{conversations.length} chats</span>
          )}
        </div>

        {/* Body */}
        <div className="chat-popup-body">
          {loading ? (
            <div className="chat-popup-loading">
              <PulseLoader size={10} color="#6b7280" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="chat-popup-empty">
              <span className="chat-popup-empty-icon">💬</span>
              <span>No chat history yet</span>
            </div>
          ) : (
            <ul className="chat-popup-list">
              {conversations.map((conv) => (
                <li key={conv.conversation_id}>
                  <button
                    className="chat-popup-item"
                    onClick={() => openChat(conv)}
                    title={conv.alias || 'Untitled Chat'}
                  >
                    <span className="chat-popup-item-icon">💬</span>
                    <span className="chat-popup-item-text">
                      {conv.alias || 'Untitled Chat'}
                    </span>
                    <span className="chat-popup-item-date">
                      {formatDate(conv.updated_at || conv.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ---- Main Admin Component ---- */
function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUser, setUpdatingUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatPopupUser, setChatPopupUser] = useState(null);

  const navigate = useNavigate();

  // ---- Fetch all users ----
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API}/users`, {
        method: 'GET',
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (res.status === 401) { window.location.href = '/login?expired=true'; return; }
      if (res.status === 403) { setError('Access denied. Admin privileges required.'); setLoading(false); return; }
      if (!res.ok) { setError('Failed to load users. Please try again.'); setLoading(false); return; }

      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch {
      setError('Network error. Could not reach server.');
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ---- Toggle trial/premium status ----
  const toggleUserStatus = async (userId, currentTrial) => {
    try {
      setUpdatingUser(userId);
      const res = await fetch(`${API}/users/${userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ trial: !currentTrial }),
      });

      if (res.status === 401) { window.location.href = '/login?expired=true'; return; }
      if (!res.ok) throw new Error('Failed to update user status.');

      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.user_id === userId ? updated : u)));
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingUser(null);
    }
  };

  // ---- Status toggle switch ----
  const StatusToggle = ({ user }) => {
    const isUpdating = updatingUser === user.user_id;
    const isPremium = !user.trial;
    return (
      <div className="status-container">
        <label className={`toggle-switch ${isUpdating ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={isPremium}
            onChange={() => toggleUserStatus(user.user_id, user.trial)}
            disabled={isUpdating}
          />
          <span className="toggle-slider" />
        </label>
        <span className="status-label">{isUpdating ? '…' : isPremium ? 'Premium' : 'Trial'}</span>
      </div>
    );
  };

  // ---- Filtered users ----
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  // ---- Loading ----
  if (loading) {
    return (
      <motion.div className="admin-loading-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <PulseLoader loading size={16} color="#111827" />
        <p style={{ marginTop: 16, color: '#6b7280', fontSize: 14 }}>Loading users…</p>
      </motion.div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <div className="admin-error-state">
            <div className="admin-error-icon">⚠️</div>
            <h2 className="admin-error-title">Access Error</h2>
            <p className="admin-error-msg">{error}</p>
            <button className="admin-retry-btn" onClick={fetchUsers}>Retry</button>
            <button className="admin-back-home-btn" onClick={() => navigate('/')}>Go Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <h1 className="admin-title">User Management</h1>

        {/* Stats */}
        <div className="admin-stats">
          <div className="stat-card">
            <h3>Total Users</h3>
            <p>{users.length}</p>
          </div>
          <div className="stat-card">
            <h3>Trial Users</h3>
            <p>{users.filter((u) => u.trial).length}</p>
          </div>
          <div className="stat-card">
            <h3>Full Members</h3>
            <p>{users.filter((u) => !u.trial).length}</p>
          </div>
        </div>

        {/* Search */}
        <div className="admin-search-bar">
          <input
            type="text"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-search-input"
          />
        </div>

        {/* Table */}
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Chats</th>
                <th>Full Member</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="no-data">
                    {searchQuery ? 'No users match your search.' : 'No users found.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-user-avatar">
                          {(user.name || 'U')[0].toUpperCase()}
                        </div>
                        <span className="admin-user-name">{user.name}</span>
                      </div>
                    </td>
                    <td className="admin-email-cell">{user.email}</td>
                    <td>
                      <button
                        className="chats-btn"
                        onClick={() => setChatPopupUser(user)}
                        title={`View ${user.name}'s chats`}
                      >
                        <span className="chats-btn-icon">💬</span>
                        View Chats
                      </button>
                    </td>
                    <td>
                      <StatusToggle user={user} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chat History Popup */}
      <AnimatePresence>
        {chatPopupUser && (
          <ChatHistoryPopup
            user={chatPopupUser}
            onClose={() => setChatPopupUser(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default Admin;