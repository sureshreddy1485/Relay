const express = require('express');
const router = express.Router();
const { createStory, getStories, viewStory, deleteStory, getStoryViewers } = require('../controllers/storyController');
const { protect } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

router.route('/').post(protect, upload.single('media'), createStory).get(protect, getStories);
router.put('/:id/view', protect, viewStory);
router.get('/:id/viewers', protect, getStoryViewers);
router.delete('/:id', protect, deleteStory);

module.exports = router;
