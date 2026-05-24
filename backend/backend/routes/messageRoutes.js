const express = require('express');
const router = express.Router();
const {
  sendMessage, getMessages, markAsRead, deleteMessage,
  reactToMessage, forwardMessage, saveMessage, getSavedMessages,
  destructMessage,
} = require('../controllers/messageController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.get('/saved', protect, getSavedMessages);
router.post('/', protect, upload.single('media'), sendMessage);
router.get('/:chatId', protect, getMessages);
router.put('/:chatId/read', protect, markAsRead);
router.delete('/:id', protect, deleteMessage);
router.post('/:id/react', protect, reactToMessage);
router.post('/:id/forward', protect, forwardMessage);
router.post('/:id/save', protect, saveMessage);
router.post('/:id/destruct', protect, destructMessage);

module.exports = router;
