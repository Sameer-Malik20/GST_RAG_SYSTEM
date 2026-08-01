const Conversation = require('../models/Conversation');
const fetch = require('node-fetch');
const { streamGroqLLM } = require('../services/groqService');

// In-memory conversations fallback
const inMemoryConversations = new Map();

// @route   GET /api/chat_models
exports.getChatModels = (req, res) => {
  res.json({
    default: 'GSTGPT Hybrid RAG Engine',
    vision_default: 'GSTGPT Hybrid RAG Engine',
    models: [
      {
        model_name: 'GSTGPT Hybrid RAG Engine',
        display_name: 'GSTGPT Llama-3.1 RAG Model',
        endpoint: '/chat/stream',
        capabilities: {
          reasoning: true,
          web_search: true,
          vision: false,
          mcp: true
        },
        controls: {
          verbosity: {
            default: 'balanced',
            levels: ['concise', 'balanced', 'detailed']
          }
        }
      }
    ]
  });
};

// @route   GET /api/image_models
exports.getImageModels = (req, res) => {
  res.json({
    default: 'GSTGPT Image Analyzer',
    vision_default: 'GSTGPT Image Analyzer',
    models: [
      {
        model_name: 'GSTGPT Image Analyzer',
        display_name: 'GSTGPT Image Vision Engine',
        endpoint: '/image/stream',
        capabilities: { vision: true, max_input: 5 }
      }
    ]
  });
};

// @route   GET /api/realtime_models
exports.getRealtimeModels = (req, res) => {
  res.json({
    default: 'GSTGPT Voice Realtime',
    models: [
      {
        model_name: 'GSTGPT Voice Realtime',
        display_name: 'GSTGPT Voice Realtime Model',
        endpoint: '/realtime/session'
      }
    ]
  });
};

// Helper to format ISO timestamp
const nowIso = () => new Date().toISOString();

// @route   POST /api/chat/new_conversation
exports.newConversation = async (req, res) => {
  const userId = req.user?.user_id || 'guest_user';
  const conversation_id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const newConv = {
    conversation_id,
    user_id: userId,
    type: 'chat',
    alias: 'New Chat',
    model: req.body.model || 'GSTGPT Hybrid RAG Model',
    starred: false,
    starred_at: null,
    messages: [],
    created_at: nowIso(),
    updated_at: nowIso()
  };

  try {
    await Conversation.create(newConv);
  } catch (error) {
    inMemoryConversations.set(conversation_id, newConv);
  }

  res.json({
    conversation_id,
    created_at: newConv.created_at,
    updated_at: newConv.updated_at
  });
};

// @route   GET /api/conversations
exports.getConversations = async (req, res) => {
  const userId = req.user?.user_id || 'guest_user';
  try {
    const list = await Conversation.find({ user_id: userId }).sort({ updated_at: -1 });
    res.json({ conversations: list });
  } catch (error) {
    const memList = Array.from(inMemoryConversations.values()).filter(c => c.user_id === userId);
    res.json({ conversations: memList });
  }
};

// @route   GET /api/conversations/:userId  — Admin: view any user's conversations
exports.getUserConversations = async (req, res) => {
  const { userId } = req.params;
  try {
    const list = await Conversation.find({ user_id: userId }).sort({ updated_at: -1 });
    res.json({ conversations: list });
  } catch (error) {
    const memList = Array.from(inMemoryConversations.values()).filter(c => c.user_id === userId);
    res.json({ conversations: memList });
  }
};


// @route   GET /api/chat/conversation/:id
exports.getConversation = async (req, res) => {
  const { id } = req.params;
  try {
    const conv = await Conversation.findOne({ conversation_id: id });
    if (!conv) {
      const mem = inMemoryConversations.get(id);
      if (mem) return res.json(mem);
      return res.status(404).json({ detail: 'Conversation not found.' });
    }
    res.json(conv);
  } catch (error) {
    const mem = inMemoryConversations.get(id);
    if (mem) return res.json(mem);
    res.status(404).json({ detail: 'Conversation not found.' });
  }
};

// @route   PUT /api/conversation/:id/rename
exports.renameConversation = async (req, res) => {
  const { id } = req.params;
  const { alias } = req.body;

  try {
    await Conversation.updateOne({ conversation_id: id }, { alias, updated_at: nowIso() });
  } catch (e) {
    const mem = inMemoryConversations.get(id);
    if (mem) mem.alias = alias;
  }
  res.json({ message: 'Renamed successfully.' });
};

// @route   POST /api/chat/get_alias
exports.getAlias = async (req, res) => {
  const { conversation_id, text } = req.body;
  if (!text) return res.json({ alias: 'New Chat' });

  let cleanText = String(text).replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = cleanText.split(/\s+/).filter(Boolean).slice(0, 5);
  let alias = words.join(' ');
  if (alias.length > 35) alias = alias.substring(0, 32) + '...';
  if (!alias) alias = 'New Chat';
  alias = alias.charAt(0).toUpperCase() + alias.slice(1);

  try {
    await Conversation.updateOne({ conversation_id }, { alias, updated_at: nowIso() });
  } catch (e) {
    const mem = inMemoryConversations.get(conversation_id);
    if (mem) mem.alias = alias;
  }

  res.json({ alias });
};

// @route   PUT /api/conversation/:id/star
exports.starConversation = async (req, res) => {
  const { id } = req.params;
  const { starred } = req.body;

  try {
    await Conversation.updateOne(
      { conversation_id: id },
      { starred, starred_at: starred ? nowIso() : null, updated_at: nowIso() }
    );
  } catch (e) {
    const mem = inMemoryConversations.get(id);
    if (mem) {
      mem.starred = starred;
      mem.starred_at = starred ? nowIso() : null;
    }
  }
  res.json({ message: 'Starred updated.' });
};

// @route   DELETE /api/conversation/:id
exports.deleteConversation = async (req, res) => {
  const { id } = req.params;
  try {
    await Conversation.deleteOne({ conversation_id: id });
  } catch (e) {
    inMemoryConversations.delete(id);
  }
  res.json({ message: 'Deleted successfully.' });
};

// @route   POST /api/chat/stream
exports.streamChat = async (req, res) => {
  const { conversation_id, message, web_search, use_web_search, use_llm } = req.body;
  const isWebSearch = Boolean(web_search || use_web_search);
  const isUseLlm = use_llm !== undefined ? Boolean(use_llm) : true;

  if (!message || !message.length) {
    return res.status(400).json({ detail: 'Message content is required.' });
  }

  const queryText = Array.isArray(message)
    ? message.find(m => m.type === 'text')?.text || ''
    : String(message);

  // Set SSE Headers for continuous token streaming to React Frontend
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  let fullAnswer = '';

  // Attempt 1: Try Groq LLM with RAG Search context
  if (process.env.GROQ_API_KEY && isUseLlm) {
    try {
      const searchRes = await fetch('http://localhost:8005/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, top_k: 3, use_web_search: isWebSearch, use_llm: isUseLlm })
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const docs = searchData.documents || [];

        // Stream via Groq LLM
        fullAnswer = await streamGroqLLM({
          query: queryText,
          documents: docs,
          res
        });

        res.end();

        // Save conversation history to MongoDB
        if (conversation_id && fullAnswer) {
          try {
            const userMsg = { id: `msg_${Date.now()}_u`, role: 'user', content: message };
            const assistantMsg = { id: `msg_${Date.now()}_a`, role: 'assistant', content: fullAnswer };

            await Conversation.updateOne(
              { conversation_id },
              {
                $push: { messages: { $each: [userMsg, assistantMsg] } },
                $set: { updated_at: nowIso() }
              }
            );
          } catch (e) { }
        }
        return;
      }
    } catch (groqErr) {
      console.warn('⚠️ [ChatController] Groq LLM streaming failed, falling back to RAG backend:', groqErr.message);
    }
  }

  // Attempt 2 (Fallback): Direct Python RAG Stream
  try {
    const ragResponse = await fetch('http://localhost:8005/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText, top_k: 3, use_web_search: isWebSearch, use_llm: isUseLlm })
    });

    if (!ragResponse.ok) {
      res.write('Unable to connect to GSTGPT Python RAG Engine.');
      return res.end();
    }

    ragResponse.body.on('data', (chunk) => {
      const textChunk = chunk.toString();
      fullAnswer += textChunk;
      res.write(textChunk);
    });

    ragResponse.body.on('end', async () => {
      res.end();

      if (conversation_id) {
        try {
          const userMsg = { id: `msg_${Date.now()}_u`, role: 'user', content: message };
          const assistantMsg = { id: `msg_${Date.now()}_a`, role: 'assistant', content: fullAnswer };

          await Conversation.updateOne(
            { conversation_id },
            {
              $push: { messages: { $each: [userMsg, assistantMsg] } },
              $set: { updated_at: nowIso() }
            }
          );
        } catch (e) { }
      }
    });

  } catch (err) {
    console.error('Error in streamChat fallback:', err);
    res.write('Error connecting to RAG backend service.');
    res.end();
  }
};
