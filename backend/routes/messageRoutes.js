const express = require('express');
const router = express.Router();
const {
  sendMessage, getMessages, markAsRead, markAsDelivered, deleteMessage,
  reactToMessage, forwardMessage, saveMessage, getSavedMessages,
  destructMessage, editMessage, voteOnPoll,
} = require('../controllers/messageController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

// Specific routes FIRST (before wildcard /:id and /:chatId)
router.get('/saved', protect, getSavedMessages);
router.post('/', protect, upload.single('media'), sendMessage);

// Sub-routes on specific message ID (must come before /:chatId)
router.patch('/:id/edit', protect, editMessage);
router.post('/:id/react', protect, reactToMessage);
router.post('/:id/forward', protect, forwardMessage);
router.post('/:id/save', protect, saveMessage);
router.post('/:id/destruct', protect, destructMessage);
router.post('/:id/vote', protect, voteOnPoll);

// Wildcard routes last
router.get('/:chatId', protect, getMessages);
router.put('/:chatId/read', protect, markAsRead);
router.put('/:chatId/deliver', protect, markAsDelivered);
router.delete('/:id', protect, deleteMessage);

module.exports = router;
