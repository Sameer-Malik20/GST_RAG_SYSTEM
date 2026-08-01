const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  conversation_id: {
    type: String,
    required: true,
    unique: true
  },
  user_id: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'chat'
  },
  alias: {
    type: String,
    default: 'New Chat'
  },
  model: {
    type: String,
    default: 'GSTGPT Hybrid RAG Model'
  },
  starred: {
    type: Boolean,
    default: false
  },
  starred_at: {
    type: Date,
    default: null
  },
  messages: [
    {
      id: String,
      role: String,
      content: mongoose.Schema.Types.Mixed,
      created_at: { type: Date, default: Date.now }
    }
  ],
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Conversation', conversationSchema);
