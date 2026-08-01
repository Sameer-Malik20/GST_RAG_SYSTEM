const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getAuthStatus,
  getUserProfile,
  logoutUser,
  getAllUsers,
  updateUserStatus
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/status', protect, getAuthStatus);
router.get('/user', protect, getUserProfile);
router.post('/logout', logoutUser);
router.get('/users', protect, getAllUsers);
router.patch('/users/:id', protect, updateUserStatus);

module.exports = router;
