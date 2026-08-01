import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LuArrowDown } from "react-icons/lu";
import Message from '../components/Message';
import { PulseLoader } from "react-spinners";
import { motion } from "framer-motion";
import '../styles/Common.css';

function View({ isTouch }) {
  const { conversation_id } = useParams();
  const navigate = useNavigate();
  const [conversationData, setConversationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const chatMessageRef = useRef(null);

  useEffect(() => {
    const fetchConversationData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${process.env.REACT_APP_FASTAPI_URL}/view/${conversation_id}`, {
          credentials: "include"
        });

        if (res.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
          return;
        }

        if (!res.ok) {
          const errorModal = res.status === 404 ? "Conversation not found." : "Failed to load conversation.";
          navigate("/", { state: { errorModal } });
          return;
        }

        const data = await res.json();
        setConversationData(data);
      } catch (err) {
        navigate("/", { state: { errorModal: "An error occurred while fetching conversation data." } });
      } finally {
        setLoading(false);
      }
    };

    fetchConversationData();
  }, [conversation_id, navigate]);

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
  }, []);

  if (loading) {
    return (
      <motion.div
        className="page-loading-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <PulseLoader loading={true} size={20} />
      </motion.div>
    );
  }

  if (!conversationData) {
    return null;
  }

  return (
    <div className="container view-page">
      <div className="chat-messages-wrapper">
        <div className="chat-messages" ref={chatMessageRef} style={{ scrollbarGutter: "stable" }}>
          {conversationData.conversation.map((msg, idx) => (
            <Message
              key={msg.id || `msg_${idx}_${msg.role}`}
              messageIndex={idx}
              role={msg.role}
              content={msg.content}
              disableActions={true}
              isTouch={isTouch}
              shouldRender={true}
            />
          ))}
        </div>
        <button
          className={`scroll-to-bottom-btn ${!isAtBottom && isButtonReady ? 'visible' : ''}`}
          onClick={() => chatMessageRef.current?.scrollTo({ top: chatMessageRef.current.scrollHeight, behavior: 'smooth' })}
          aria-label="Scroll to bottom"
        >
          <LuArrowDown />
        </button>
      </div>
    </div>
  );
}

export default View;
