const express = require('express');
const router = express.Router();
const {
  accessChat, getChats, createGroupChat, updateGroup, addToGroup,
  removeFromGroup, promoteToAdmin, demoteToMember, leaveGroup, togglePinChat,
  toggleArchiveChat, searchPublicChats, setDisappearTimer, toggleMuteChat,
  deleteChat,
} = require('../controllers/chatController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.route('/').get(protect, getChats).post(protect, accessChat);
router.route('/:id').delete(protect, deleteChat);
router.post('/group', protect, upload.single('groupPicture'), createGroupChat);
router.get('/search/public', protect, searchPublicChats);
router.put('/group/:id', protect, upload.single('groupPicture'), updateGroup);
router.put('/group/:id/add', protect, addToGroup);
router.put('/group/:id/remove', protect, removeFromGroup);
router.put('/group/:id/promote', protect, promoteToAdmin);
router.put('/group/:id/demote', protect, demoteToMember);
router.put('/group/:id/leave', protect, leaveGroup);
router.put('/:id/pin', protect, togglePinChat);
router.put('/:id/archive', protect, toggleArchiveChat);
router.put('/:id/mute', protect, toggleMuteChat);
router.put('/:id/disappear', protect, setDisappearTimer);

module.exports = router;
