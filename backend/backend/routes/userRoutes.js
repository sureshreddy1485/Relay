const express = require('express');
const router = express.Router();
const {
  searchUsers, getUserProfile, updateProfile, sendFriendRequest,
  acceptFriendRequest, declineFriendRequest, blockUser, unblockUser,
  getFriendRequests, updateCameraStatus, deactivateAccount, deleteAccount,
  removeFriend, getBlockedUsers, getFriends, updatePushToken,
} = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.get('/search', protect, searchUsers);
router.get('/friend-requests', protect, getFriendRequests);
router.get('/blocked', protect, getBlockedUsers);
router.get('/friends', protect, getFriends);
router.put('/profile', protect, upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'coverPhoto', maxCount: 1 },
]), updateProfile);
router.put('/profile/deactivate', protect, deactivateAccount);
router.delete('/profile/delete', protect, deleteAccount);
router.put('/camera-status', protect, updateCameraStatus);
router.put('/push-token', protect, updatePushToken);
router.get('/:username', protect, getUserProfile);
router.post('/:id/friend-request', protect, sendFriendRequest);
router.post('/:id/accept-request', protect, acceptFriendRequest);
router.post('/:id/decline-request', protect, declineFriendRequest);
router.post('/:id/remove-friend', protect, removeFriend);
router.post('/:id/block', protect, blockUser);
router.post('/:id/unblock', protect, unblockUser);

module.exports = router;
