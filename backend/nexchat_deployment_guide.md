# Nexo — Production Deployment Guide

## Architecture
```
Phone App (Expo APK)  →  Render (Backend API + Socket)  →  MongoDB Atlas + Cloudinary
```
No tunnels. No local IP. Works for all users, anywhere.

---

## Step 1 — Push Backend to GitHub

1. Go to [github.com](https://github.com) → **New Repository** → name it `nexo-backend`
2. Run these commands in `c:\Users\sures\Desktop\nexo\backend`:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nexo-backend.git
git push -u origin main
```

> ✅ The `.gitignore` already excludes `.env` — your secrets are safe.

---

## Step 2 — Deploy to Render

1. Go to [render.com](https://render.com) → Sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub → select `nexo-backend`
4. Settings:
   - **Name**: `nexchat-new` (your URL will be `https://nexchat-new.onrender.com`)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 5. Set Environment Variables in Render Dashboard

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `MONGO_URI` | `mongodb://sureshreddymallidi45_db_user:PrXaYP62FFtkIdhz@ac-gbesgjg-shard-00-00.p7yhvjw.mongodb.net:27017,ac-gbesgjg-shard-00-01.p7yhvjw.mongodb.net:27017,ac-gbesgjg-shard-00-02.p7yhvjw.mongodb.net:27017/nexo?ssl=true&replicaSet=atlas-3uy115-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0` |
| `JWT_SECRET` | `chattrix_super_secret_jwt_key_replace_this_in_production_32chars` |
| `JWT_EXPIRES_IN` | `365d` |
| `SECURITY_KEY_SECRET` | `a3f8e2c1d4b7a9f0e1c2d3b4a5f6e7d8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4` |
| `CLOUDINARY_CLOUD_NAME` | `dz3m8nxj3` |
| `CLOUDINARY_API_KEY` | `339391243631687` |
| `CLOUDINARY_API_SECRET` | `nNt0aOSrYMbI0ioEPw_90xXjVSE` |
| `CLIENT_URL` | `*` |

6. Click **Deploy**. Wait ~2 minutes.
7. Test: open `https://nexchat-new.onrender.com/health` — should return `{"status":"OK","app":"Nexo API"}`

> ⚠️ **Free tier sleeps after 15 min of inactivity** (first request after sleep takes ~30s).  
> Upgrade to **$7/mo Starter** for always-on if you want instant response for users.

---

## Step 3 — Update Frontend URL

Edit `frontend/.env` — replace the service name if you chose a different name on Render:

```
EXPO_PUBLIC_API_URL=https://nexo-api.onrender.com/api
EXPO_PUBLIC_SOCKET_URL=https://nexo-api.onrender.com
```

> **WebSocket on Render**: Works natively — no tunnels, no hacks. Socket.io connects with WebSocket and falls back to polling automatically.

---

## Step 4 — Build the APK

```bash
cd frontend
npm install -g eas-cli      # only needed once
eas login                   # your Expo account
eas build -p android --profile preview
```

This builds an `.apk` file you can share directly with users (no Play Store needed for testing).

For Play Store release use: `eas build -p android --profile production`

---

## MongoDB Atlas — Allow Render IPs

> [!IMPORTANT]
> By default MongoDB Atlas blocks unknown IPs.  
> Go to **Atlas → Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`)  
> This is needed because Render uses dynamic IPs.

---

## Summary

| Component | Service | URL |
|-----------|---------|-----|
| Backend API | Render | `https://nexchat-new.onrender.com/api` |
| Realtime Socket | Render | `https://nexchat-new.onrender.com` |
| Database | MongoDB Atlas | Cloud-hosted |
| Media Storage | Cloudinary | Cloud-hosted |
| App | Expo EAS Build | `.apk` file |
