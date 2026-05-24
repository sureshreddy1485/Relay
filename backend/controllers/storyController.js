const asyncHandler = require('express-async-handler');
const Story = require('../models/Story');
const User = require('../models/User');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { sanitizeUser } = require('../utils/privacyHelper');

// @desc  Create a story
// @route POST /api/stories
// @access Private
const createStory = asyncHandler(async (req, res) => {
  if (!req.file) { res.status(400); throw new Error('Media is required for a story'); }

  const { caption } = req.body;
  const mime = req.file.mimetype;
  const mediaType = mime.startsWith('video/') ? 'video' : 'image';
  
  let result;
  try {
    result = await uploadToCloudinary(req.file.buffer, 'stories', 'auto');
  } catch (cloudinaryErr) {
    console.error('Story Media Cloudinary Upload Failed:', cloudinaryErr);
    res.status(500);
    throw new Error(`Story Media Upload Failed: ${cloudinaryErr.message || cloudinaryErr}`);
  }

  const story = await Story.create({
    user: req.user._id,
    mediaUrl: result.secure_url,
    mediaPublicId: result.public_id || '',
    mediaType,
    caption: caption || '',
  });

  // Emit to friends and chat members
  const io = req.app.get('io');
  if (io) {
    const Chat = require('../models/Chat');
    const author = await User.findById(req.user._id);
    const chats = await Chat.find({ users: req.user._id }).select('users');
    const chatUserIds = new Set();
    chats.forEach(chat => {
      if (chat && chat.users) {
        chat.users.forEach(u => {
          if (u) chatUserIds.add(u.toString());
        });
      }
    });
    const friendIds = (author.friends || []).map(f => (f && f._id ? f._id.toString() : f ? f.toString() : null)).filter(Boolean);
    const allIds = new Set([...friendIds, ...chatUserIds]);
    
    // Only emit if privacy allows
    const storiesVis = author.privacy?.storiesVisibility || 'everyone';
    if (storiesVis !== 'nobody') {
      allIds.forEach(id => {
        if (id !== req.user._id.toString()) {
          if (storiesVis === 'friends' && !friendIds.includes(id)) return;
          io.to(id).emit('new_story', { story });
        }
      });
    }
  }

  res.status(201).json({ success: true, story });
});

// @desc  Get stories of friends + self
// @route GET /api/stories
// @access Private
const getStories = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const Chat = require('../models/Chat');

    // Get all users this person has chats with
    const chats = await Chat.find({ users: req.user._id }).select('users');
    const chatUserIds = new Set();
    chats.forEach(chat => {
      if (chat && chat.users) {
        chat.users.forEach(u => {
          if (u) chatUserIds.add(u.toString());
        });
      }
    });

    // Combine friends + chat members + self (deduplicated)
    const friendIds = (user.friends || []).map(f => (f && f._id ? f._id.toString() : f ? f.toString() : null)).filter(Boolean);
    const allIds = new Set([
      ...friendIds,
      ...chatUserIds,
      req.user._id.toString(),
    ]);

    const stories = await Story.find({ user: { $in: [...allIds] } })
      .populate('user', 'username displayName profilePicture privacy friends')
      .sort({ createdAt: -1 });

    // Group by user
    const grouped = {};
    for (const story of stories) {
      if (!story.user) continue; // Skip orphaned stories safely
      
      const author = story.user;
      const authorId = author._id.toString();
      const reqId = req.user._id.toString();

      if (authorId !== reqId) {
        // Enforce Stories Privacy
        const storiesVis = author.privacy?.storiesVisibility || 'everyone';
        if (storiesVis === 'nobody') {
          continue; // Skip stories entirely
        }
        if (storiesVis === 'friends') {
          const authorFriends = (author.friends || []).map(f => (f && f._id ? f._id.toString() : f ? f.toString() : ''));
          if (!authorFriends.includes(reqId)) {
            continue; // Skip stories if not friends
          }
        }
      }

      // Sanitize profile details (e.g. if profilePictureVisibility is 'nobody' or 'friends')
      const sanitizedAuthor = sanitizeUser(author, req.user._id);

      const uid = authorId;
      if (!grouped[uid]) grouped[uid] = { user: sanitizedAuthor, stories: [] };
      grouped[uid].stories.push(story);
    }

    res.status(200).json({ success: true, stories: Object.values(grouped) });
  } catch (err) {
    console.error('Error in getStories:', err);
    res.status(500).json({ success: false, message: err.message, stack: err.stack });
  }
});

const viewStory = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) { res.status(404); throw new Error('Story not found'); }

  const alreadyViewed = story.viewers.some(v => v.user && v.user.toString() === req.user._id.toString());
  if (!alreadyViewed) {
    story.viewers.push({ user: req.user._id, viewedAt: new Date() });
    await story.save();
  }
  res.status(200).json({ success: true });
});

// @desc  Delete own story
// @route DELETE /api/stories/:id
// @access Private
const deleteStory = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) { res.status(404); throw new Error('Story not found'); }
  if (story.user.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Cannot delete others\' stories');
  }
  // Delete media from Cloudinary — auto-detects image/video/raw
  const mediaRef = story.mediaPublicId || story.mediaUrl;
  if (mediaRef) {
    await deleteFromCloudinary(mediaRef);
  }
  await story.deleteOne();
  res.status(200).json({ success: true, message: 'Story deleted' });
});

// @desc  Get viewers of a story
// @route GET /api/stories/:id/viewers
// @access Private
const getStoryViewers = asyncHandler(async (req, res) => {
  const story = await Story.findById(req.params.id)
    .populate('viewers.user', 'username displayName profilePicture');
  if (!story) { res.status(404); throw new Error('Story not found'); }
  if (story.user.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Only the author can see viewers');
  }

  const populatedViewers = story.viewers
    .filter(v => v.user != null)
    .map(v => ({
      _id: v.user._id,
      username: v.user.username,
      displayName: v.user.displayName,
      profilePicture: v.user.profilePicture,
      viewedAt: v.viewedAt,
      emoji: story.reactions.find(r => r.user.toString() === v.user._id.toString())?.emoji || null,
    }));

  res.status(200).json({ success: true, viewers: populatedViewers, count: populatedViewers.length });
});

const reactStory = asyncHandler(async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) { res.status(400); throw new Error('Emoji is required'); }

  const story = await Story.findById(req.params.id);
  if (!story) { res.status(404); throw new Error('Story not found'); }

  // Check if user already reacted
  const existingReaction = story.reactions.find(r => r.user.toString() === req.user._id.toString());
  if (existingReaction) {
    existingReaction.emoji = emoji;
    existingReaction.reactedAt = new Date();
  } else {
    story.reactions.push({ user: req.user._id, emoji, reactedAt: new Date() });
  }
  await story.save();

  // Notify author if someone else reacted
  if (story.user.toString() !== req.user._id.toString()) {
    const io = req.app.get('io');
    if (io) {
      io.to(story.user.toString()).emit('story_reaction', {
        storyId: story._id,
        userId: req.user._id,
        emoji
      });
    }
  }

  res.status(200).json({ success: true, reactions: story.reactions });
});

module.exports = { createStory, getStories, viewStory, deleteStory, getStoryViewers, reactStory };
