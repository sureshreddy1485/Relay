# 🚀 Relay (formerly Nexo)

A modern, full-stack real-time messaging application packed with robust features, security, community building tools, and AI integration. Inspired by WhatsApp, Telegram, and Discord.

## 🌟 Comprehensive Feature List

### 🔐 Authentication & Security
- **Multi-layered Login**: Signup and Login via email or unique username.
- **Robust Password Security**: Enforced complex passwords, bcrypt hashing (12 rounds).
- **Recovery System**: State-of-the-art HMAC-SHA256 recovery code system. Replaces traditional insecure password resets.
- **Audit Logs**: Rolling security audit log tracking all credential-change actions.
- **Device Management**: View all active devices, their last active times, and remotely log them out.
- **Backend Hardening**: JWT authentication (30-day tokens), Helmet.js security headers, CORS, and strict rate limiting on auth routes.

### 👤 User Profiles & Social
- **Rich Profiles**: Display name, unique username, bio, profile picture, and cover photo.
- **Friends System**: Send, accept, or deny friend requests. Manage a dedicated friends list.
- **Blocking & Filtering**: Block unwanted users to prevent communication.
- **Presence & Status**: Real-time online/offline status, "Last Seen" timestamps, and live camera activity indicators.
- **Privacy Controls**: Granular visibility settings for "Last Seen", profile picture, stories, and read receipts. Control who can DM you from groups.
- **Theming**: System, Light, and Dark mode support.
- **User Types**: Support for verified accounts, anonymous users, and distinct roles (`user`, `admin`, `system_bot`).

### 💬 Messaging & Real-Time Communication
- **Rich Media Support**: Send text, images, videos, audio/voice notes, documents, and stickers.
- **Message Interactions**: Emoji reactions, message replies, and forwarding.
- **Status Indicators**: Delivered and Read receipts. Real-time typing indicators.
- **Message Management**: "Delete for everyone", Edit sent messages, and Save/Bookmark important messages.
- **Advanced Message Types**: 
  - **Self-Destructing Messages**: Set timers for messages to disappear automatically.
  - **Polls**: Create polls with multiple options and multiple-answer support.
  - **Live Messages**: Real-time message streaming.
  - **System Messages**: Auto-generated notifications for chat events (e.g., "Alice joined the group").

### 🏛️ Chat Organizations & Community
- **Diverse Chat Types**: 
  - **1-on-1 Direct Messages**
  - **Group Chats** (up to 200 members)
  - **Channels** (One-way broadcasting)
  - **Communities** (Categorized and tagged large-scale groups)
  - **Secret Chats**: End-to-End (E2E) encrypted conversations.
- **Chat Management**: Pin favorite chats, Archive old ones, or Mute noisy conversations.
- **Group Administration**: Assign admins, manage join privacy (Invite-only, Closed, Anyone), handle join requests, ban users, and auto-accept configurations.
- **Customization**: Unique group names, descriptions, usernames, group pictures, and per-chat Custom Themes.
- **Security Constraints**: Toggle ability for users to take screenshots or forward messages within specific chats.

### 📖 Stories
- **Ephemeral Content**: Upload image or video stories that automatically expire after 24 hours.
- **Engagement**: Reply directly to stories or send quick emoji reactions.
- **Analytics**: See exactly who viewed your story and when.

### 🤖 AI Bots & Games Integration
- **Integrated Bot System**: Support for interactive server bots with distinct personalities.
  - ✨ **Mica (Powered by gpt-oss-120b)**: The cheerful and helpful group assistant. Runs community games like Mafia, Riddles, and Scramble.
  - 🔥 **Mars (Powered by qwen3.6-27b)**: The sarcastic, smart troublemaker bot. 
- **Broadcast CLI**: Integrated backend scripts for admins to blast system-wide announcements to all users via the Relay Bot.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React Native (Expo) |
| **Styling** | NativeWind / TailwindCSS |
| **State** | Zustand |
| **Backend** | Node.js + Express |
| **Database** | MongoDB Atlas |
| **Realtime** | Socket.IO |
| **Auth** | JWT + bcrypt |
| **Media** | Cloudinary |
| **Deployment** | Render (Backend) / EAS (Frontend OTA Updates) |

---

## 📂 Project Structure

```
Relay/
├── backend/
│   ├── config/          # DB, Cloudinary, Socket configurations
│   ├── controllers/     # Route logic (Auth, User, Chat, Message, Story)
│   ├── middlewares/     # JWT Auth, Error handling, File Uploads
│   ├── models/          # Mongoose Schemas (User, Chat, Message, Story, Game settings)
│   ├── routes/          # API route definitions
│   ├── scripts/         # Admin CLI tools (Broadcasts)
│   ├── utils/           # Security tools, Cloudinary upload logic
│   └── server.js        # Main entry point
└── frontend/
    ├── src/
    │   ├── components/  # Reusable UI (ChatListItem, MessageBubble)
    │   ├── navigation/  # React Navigation (Auth, Main, Tab navigators)
    │   ├── screens/     # All UI Screens (Auth, Chat, Settings, Stories, Communities)
    │   ├── services/    # API requests (Axios) and Socket.IO initialization
    │   ├── store/       # Zustand Global State
    │   └── theme/       # App styling configurations
    └── App.js
```

---

## 🚀 Setup & Run

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in your MongoDB URI, JWT secret, Cloudinary credentials
npm install
npm run dev       # Development with nodemon auto-restart
```

### 2. Frontend

```bash
cd frontend
# Edit .env - set API_URL and SOCKET_URL
npm install
npx expo start -c # Starts Expo Go server with cleared cache
```

---

## ⚙️ Environment Variables

### Backend `.env`
```env
PORT=5000
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=30d
SECURITY_KEY_SECRET=your_security_key_secret
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLIENT_URL=http://localhost:8081
```

### Frontend `.env`
```env
API_URL=http://10.0.2.2:5000/api   # Android emulator
# API_URL=http://localhost:5000/api  # iOS simulator
# API_URL=https://your-render-url.onrender.com/api  # Production
SOCKET_URL=http://10.0.2.2:5000
```

---

## 🔌 Socket Events

| Event | Direction | Description |
|---|---|---|
| `setup` | Client→Server | Initialize user connection |
| `join_chat` | Client→Server | Join a chat room |
| `typing` / `stop_typing` | Client→Server | User typing indicators |
| `new_message` | Server→Client | New incoming message broadcast |
| `messages_read` | Server→Client | Messages marked as read |
| `message_deleted` | Server→Client | Message deleted for everyone |
| `reaction_updated` | Server→Client | Reaction added/removed |
| `user_online` / `offline` | Server→Client | User presence changes |
| `camera_status_changed` | Server→Client | Camera active/inactive toggle |

---

## 🌐 Deployment 

### Backend (Render)
1. Create a **Web Service** on Render
2. Connect your GitHub repository. Set **Root Directory** to `backend`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Add all `.env` variables

### Frontend (Expo EAS)
- Build Android APK: `eas build -p android --profile preview`
- Send OTA Update: `eas update --branch preview --message "Your update description"`
- **Automated Deploy Script**: Use `node publishUpdate.js` in the project root to simultaneously push an OTA update and broadcast a message to all users via the Relay bot!
