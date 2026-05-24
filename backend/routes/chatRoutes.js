const express = require('express');
const router = express.Router();
const {
  accessChat, getChats, createGroupChat, updateGroup, addToGroup, inviteToGroup,
  removeFromGroup, promoteToAdmin, demoteToMember, leaveGroup, togglePinChat,
  toggleArchiveChat, searchPublicChats, setDisappearTimer, toggleMuteChat,
  deleteChat, updateChatTheme, updateChatSecurity,
} = require('../controllers/chatController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.route('/').get(protect, getChats).post(protect, accessChat);
router.route('/:id').delete(protect, deleteChat);
router.post('/group', protect, upload.single('groupPicture'), createGroupChat);
router.get('/search/public', protect, searchPublicChats);
router.put('/group/:id', protect, upload.single('groupPicture'), updateGroup);
router.put('/group/:id/add', protect, addToGroup);
router.put('/group/:id/invite', protect, inviteToGroup);
router.put('/group/:id/remove', protect, removeFromGroup);
router.put('/group/:id/promote', protect, promoteToAdmin);
router.put('/group/:id/demote', protect, demoteToMember);
router.put('/group/:id/transfer-ownership', protect, require('../controllers/chatController').transferOwnership);
router.put('/group/:id/leave', protect, leaveGroup);
router.put('/:id/pin', protect, togglePinChat);
router.put('/:id/archive', protect, toggleArchiveChat);
router.put('/:id/mute', protect, toggleMuteChat);
router.put('/:id/disappear', protect, setDisappearTimer);
router.put('/:id/theme', protect, updateChatTheme);
router.put('/:id/security', protect, updateChatSecurity);
router.put('/group/:id/accept-request', protect, require('../controllers/chatController').acceptJoinRequest);
router.put('/group/:id/decline-request', protect, require('../controllers/chatController').declineJoinRequest);

module.exports = router;
