const express = require('express');
const router = express.Router();
const { signup, login, forgotPassword, changePassword, getMe, logout, getDevices, logoutDevice } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.post('/signup', upload.single('profilePicture'), signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.put('/change-password', protect, changePassword);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.get('/devices', protect, getDevices);
router.delete('/devices/:deviceId', protect, logoutDevice);

module.exports = router;
