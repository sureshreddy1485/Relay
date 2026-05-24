# Nexo 🚀

A modern, full-stack realtime messaging application inspired by WhatsApp, Telegram, and Kik.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native (Expo) |
| Styling | NativeWind / TailwindCSS |
| State | Zustand |
| Backend | Node.js + Express |
| Database | MongoDB Atlas |
| Realtime | Socket.IO |
| Auth | JWT + bcrypt |
| Media | Cloudinary |
| Deployment | Render |

## Project Structure

```
nexo/
├── backend/
│   ├── config/          # DB, Cloudinary, Socket
│   ├── controllers/     # Auth, User, Chat, Message, Story
│   ├── middlewares/     # Auth JWT, Error, Upload
│   ├── models/          # User, Chat, Message, Story schemas
│   ├── routes/          # API route definitions
│   ├── utils/           # Security key, Cloudinary upload
│   ├── .env.example
│   └── server.js
└── frontend/
    ├── src/
    │   ├── components/  # ChatListItem, MessageBubble
    │   ├── navigation/  # Root, Auth, Main, Tab navigators
    │   ├── screens/     # All app screens
    │   ├── services/    # API (Axios), Socket.IO
    │   ├── store/       # Zustand (Auth, Chat)
    │   └── theme/       # Colors
    └── App.js
```

## Setup & Run

### Backend

```bash
cd backend
cp .env.example .env
# Fill in your MongoDB URI, JWT secret, Cloudinary credentials
npm install
npm run dev       # Development with nodemon
npm start         # Production
```

### Frontend

```bash
cd frontend
# Edit .env - set API_URL and SOCKET_URL
npm install
npx expo start
```

## Environment Variables

### Backend `.env`
```
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
```
API_URL=http://10.0.2.2:5000/api   # Android emulator
# API_URL=http://localhost:5000/api  # iOS simulator
# API_URL=https://your-render-url.onrender.com/api  # Production
SOCKET_URL=http://10.0.2.2:5000
```

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register |
| POST | `/api/auth/login` | Login (email or username) |
| POST | `/api/auth/forgot-password` | Reset password with security key |
| PUT | `/api/auth/change-password` | Change password (auth required) |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/users/search?q=` | Search users |
| GET | `/api/chats` | Get user's chats |
| POST | `/api/chats` | Create/access 1-to-1 chat |
| POST | `/api/chats/group` | Create group |
| POST | `/api/messages` | Send message |
| GET | `/api/messages/:chatId` | Get messages |
| DELETE | `/api/messages/:id` | Delete for everyone |
| POST | `/api/messages/:id/react` | React to message |
| POST | `/api/stories` | Upload story |
| GET | `/api/stories` | Get stories feed |

## Socket Events

| Event | Direction | Description |
|---|---|---|
| `setup` | Client→Server | Initialize user connection |
| `join_chat` | Client→Server | Join a chat room |
| `typing` | Client→Server | User is typing |
| `stop_typing` | Client→Server | User stopped typing |
| `new_message` | Server→Client | New incoming message |
| `messages_read` | Server→Client | Messages marked as read |
| `message_deleted` | Server→Client | Message deleted for everyone |
| `reaction_updated` | Server→Client | Reaction added/removed |
| `user_online` | Server→Client | User came online |
| `user_offline` | Server→Client | User went offline |
| `camera_status_changed` | Server→Client | Camera active/inactive |

## Deployment on Render

1. Create a **Web Service** on Render
2. Connect your GitHub repository
3. Set **Root Directory** to `backend`
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. Add all environment variables from `.env`
7. Update frontend `.env` with your Render URL

## Security Features

- ✅ JWT authentication (30-day tokens)
- ✅ bcrypt password hashing (12 rounds)
- ✅ AES-encrypted security keys
- ✅ Security key required for password reset/change
- ✅ Rate limiting on all routes (stricter on auth)
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Input validation on all endpoints
