const express = require('express');
const router = express.Router();
const {
  newConversation,
  getConversations,
  getUserConversations,
  getConversation,
  renameConversation,
  starConversation,
  deleteConversation,
  streamChat,
  getChatModels,
  getImageModels,
  getRealtimeModels,
  getAlias
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

router.get('/chat_models', protect, getChatModels);
router.get('/image_models', protect, getImageModels);
router.get('/realtime_models', protect, getRealtimeModels);
router.post('/chat/new_conversation', protect, newConversation);
router.post('/image/new_conversation', protect, newConversation);
router.post('/chat/get_alias', protect, getAlias);
router.get('/conversations', protect, getConversations);
// Admin: get conversations for a specific user (must come before /conversation/:id to avoid conflict)
router.get('/conversations/:userId', protect, getUserConversations);
router.get('/chat/conversation/:id', protect, getConversation);
router.get('/image/conversation/:id', protect, getConversation);
router.get('/view/:id', protect, getConversation);
router.put('/conversation/:id/rename', protect, renameConversation);
router.put('/conversation/:id/star', protect, starConversation);
router.delete('/conversation/:id', protect, deleteConversation);
router.post('/chat/generate', protect, streamChat);
router.post('/chat/stream', protect, streamChat);

module.exports = router;
