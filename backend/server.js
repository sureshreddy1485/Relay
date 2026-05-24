// Nexo API v1.1.0 — message editing, disappearing media, expo-video migration
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
require('./config/cloudinary'); // initialize cloudinary

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const storyRoutes = require('./routes/storyRoutes');

const { notFound, errorHandler } = require('./middlewares/errorMiddleware');
const socketHandler = require('./config/socketHandler');

// Connect DB
connectDB().then(async () => {
  try {
    const User = require('./models/User');
    await User.updateMany({ isOnline: true }, { $set: { isOnline: false, isCameraActive: false } });
    console.log('🧹 Purged ghost online sessions');
  } catch(e) { console.error('Failed to purge online sessions', e); }

  const { initializeMicaBot, initializeRelayBot } = require('./utils/botHelper');
  initializeMicaBot();
  initializeRelayBot();
});

const app = express();
app.set('trust proxy', 1); // Crucial for rate limiting behind Render's proxy
const server = http.createServer(app);

// Socket.IO — supports WebSocket natively on Render
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket'],
});

// Make io accessible in controllers via req.app.get('io')
app.set('io', io);
socketHandler(io);

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/auth', authLimiter);

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/stories', storyRoutes);

// Health check (root + /health for Render compatibility)
app.get('/', (req, res) => res.status(200).json({ status: 'OK', app: 'Relay API' }));
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', app: 'Relay API' }));

// ─── Error Handlers ────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Background Jobs ───────────────────────────────────────────────────────
setInterval(async () => {
  try {
    const Message = require('./models/Message');
    const Story = require('./models/Story');
    const { deleteFromCloudinary } = require('./utils/cloudinaryUpload');

    // ── 1. Expired disappearing messages ────────────────────────────────────
    const expiredMessages = await Message.find({
      expiresAt: { $lte: new Date() },
      deletedForEveryone: { $ne: true }
    });

    for (const message of expiredMessages) {
      if (message.mediaPublicId || message.mediaUrl) {
        const publicId = message.mediaPublicId || message.mediaUrl;
        await deleteFromCloudinary(publicId); // auto-detects image/video/raw
      }
      
      message.deletedForEveryone = true;
      message.content = 'Message disappeared';
      message.mediaUrl = '';
      message.mediaPublicId = '';
      message.isSelfDestructing = false;
      message.destructAfterSeconds = 0;
      message.expiresAt = null;
      await message.save();

      io.to(message.chat.toString()).emit('message_deleted', { messageId: message._id, chatId: message.chat, forEveryone: true });
    }

    // ── 2. Expired stories (24h) — delete media from Cloudinary then remove DB doc ──
    const expiredStories = await Story.find({ expiresAt: { $lte: new Date() } });

    for (const story of expiredStories) {
      // Delete media from Cloudinary
      const publicId = story.mediaPublicId || story.mediaUrl;
      if (publicId) {
        await deleteFromCloudinary(publicId); // auto-detects image/video/raw
      }
      // Notify story author so frontend can refresh
      io.to(story.user.toString()).emit('story_expired', { storyId: story._id });
      await story.deleteOne();
    }

    if (expiredMessages.length || expiredStories.length) {
      console.log(`[Cleanup] Removed ${expiredMessages.length} message(s) and ${expiredStories.length} story/stories`);
    }
  } catch (err) {
    console.error('Cleanup job error:', err);
  }
}, 60 * 1000); // Run every 60 seconds

// ─── Start Server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Relay server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

module.exports = { app, server };
