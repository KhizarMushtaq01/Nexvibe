# ✦ NexVibe — Full-Stack Social Media Platform

A premium, full-featured social media platform inspired by Instagram and Facebook, built with React, Node.js, Express, MongoDB, and Socket.io.

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, Tailwind CSS, Framer Motion |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB + Mongoose |
| **Real-time** | Socket.io |
| **Auth** | JWT + HTTP-only cookies |
| **Email** | Nodemailer (Gmail/SMTP) |
| **Media** | Cloudinary |
| **State** | Zustand + React Query |

---

## 📋 Features

### Auth & Security
- ✅ Email/password registration & login
- ✅ OAuth: Google, Facebook, Apple, X (Twitter), Phone
- ✅ 6-digit OTP verification on registration and login
- ✅ Two-factor authentication (2FA) via email OTP
- ✅ Password reset via email link
- ✅ JWT with HTTP-only secure cookies
- ✅ Login history & active sessions
- ✅ Rate limiting on auth endpoints
- ✅ Email alerts on: sign-in, password change, profile updates, avatar change, 2FA enable

### Posts
- ✅ Create posts with up to 10 photos/videos
- ✅ Carousel/multi-media posts
- ✅ Caption with hashtags and @mentions
- ✅ Like, comment, reply to comments
- ✅ Save/unsave posts to collections
- ✅ Archive/unarchive posts
- ✅ Pin post to profile
- ✅ Delete, edit posts
- ✅ Visibility: public, followers, close friends, private
- ✅ Toggle comments on/off
- ✅ Hide like counts
- ✅ Double-tap to like animation
- ✅ Location tagging
- ✅ Hashtag pages with post counts
- ✅ Pin/delete comments
- ✅ Comment reactions

### Stories
- ✅ 24-hour expiring stories
- ✅ Photo and video stories
- ✅ Text overlay on stories
- ✅ Story reactions and replies
- ✅ View story viewers list
- ✅ Archive stories
- ✅ Story highlights on profile
- ✅ Close friends stories
- ✅ Progress bar viewer
- ✅ Pause/play on hold

### Reels
- ✅ Short video feed
- ✅ Like, comment, save reels
- ✅ Music/audio info
- ✅ Full-screen vertical scroll

### Direct Messages
- ✅ Real-time DMs via Socket.io
- ✅ Group chats (create, add members, leave)
- ✅ Send images/videos in chat
- ✅ Message reactions with emoji
- ✅ Typing indicators
- ✅ Read receipts (✓✓)
- ✅ Unsend messages
- ✅ Delete messages (for me / for everyone)
- ✅ Mute / archive conversations
- ✅ Online status indicator
- ✅ Unread count badges

### Profile
- ✅ Profile photo + cover photo
- ✅ Bio, website, gender, pronouns
- ✅ Account type: personal / creator / business
- ✅ Story highlights
- ✅ Posts / Reels / Saved / Tagged tabs
- ✅ Followers & following lists
- ✅ Follow / unfollow
- ✅ Private account with follow requests
- ✅ Verified badge
- ✅ Block, mute, restrict users
- ✅ Close friends list
- ✅ Remove followers

### Explore & Search
- ✅ Explore grid with infinite scroll
- ✅ Search users, posts, hashtags
- ✅ Search suggestions / autocomplete
- ✅ Recent searches history
- ✅ Hashtag pages

### Notifications
- ✅ Real-time push via Socket.io
- ✅ Likes, comments, follows, mentions, story reactions
- ✅ Follow request notifications
- ✅ Mark all read
- ✅ Clear all

### Settings (Full)
- ✅ Edit profile (name, username, bio, website, gender, pronouns)
- ✅ Change avatar / remove avatar
- ✅ Change email (OTP verified)
- ✅ Change password
- ✅ Two-factor authentication
- ✅ Login history
- ✅ Privacy settings (private account, activity status, tags, mentions, messages)
- ✅ Notification preferences
- ✅ Blocked accounts management
- ✅ Close friends list
- ✅ Deactivate account
- ✅ Delete account permanently

### Admin Panel
- ✅ Dashboard with stats and charts (7-day user/post growth)
- ✅ User management: search, filter, ban/unban, verify, change role, delete
- ✅ Post moderation: view, remove posts
- ✅ Send system notifications (to all or specific users)
- ✅ User detail view with full info

### UI/UX
- ✅ Dark / Light mode (persists in localStorage)
- ✅ Fully responsive (mobile, tablet, desktop)
- ✅ Instagram-style sidebar with icon collapse
- ✅ Mobile bottom navigation
- ✅ Smooth animations (fade, slide, scale, shimmer skeletons)
- ✅ Double-tap heart animation on posts
- ✅ Infinite scroll on feed, explore, hashtag pages
- ✅ Image carousel with dot indicators
- ✅ Emoji picker in comments and DMs

---

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Cloudinary account (free tier works)
- Gmail account (for email sending)

### 1. Clone and install
```bash
git clone <repo-url>
cd nexvibe
npm install  # installs root concurrently
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure backend environment
```bash
cd backend
cp .env.example .env
# Edit .env with your values
```

**.env required values:**
```env
MONGODB_URI=mongodb://localhost:27017/nexvibe
JWT_SECRET=your_secret_key_min_32_chars

# Email (Gmail App Password)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password    # Google account → Security → App Passwords

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

CLIENT_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

### 3. Run development servers
```bash
# From root (runs both frontend and backend)
npm run dev

# OR separately:
npm run dev:backend   # http://localhost:5000
npm run dev:frontend  # http://localhost:5173
```

### 4. Create admin account
Register normally, then update in MongoDB:
```js
db.users.updateOne({ username: "yourusername" }, { $set: { role: "admin" } })
```
Then visit `http://localhost:5173/admin`

---

## 📁 Project Structure

```
nexvibe/
├── backend/
│   ├── config/          # DB, Socket.io, Cloudinary
│   ├── controllers/     # Auth, User, Post, Story, Message, Notification, Admin, Search
│   ├── middleware/      # Auth JWT, Error handler, Multer
│   ├── models/          # User, Post, Story, Message, Conversation, Notification
│   ├── routes/          # All API routes (~80 endpoints)
│   ├── utils/           # Email templates, JWT helpers
│   └── server.js
├── frontend/
│   └── src/
│       ├── components/  # Layout, Post, Story, Profile, Common, Admin
│       ├── context/     # Auth, Theme, Socket
│       ├── pages/       # Auth, Main, Admin (25+ pages)
│       ├── services/    # Axios API service
│       └── styles/      # Tailwind + CSS variables
└── README.md
```

---

## 🔌 API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | `/api/auth/*` — register, login, logout, OTP, 2FA, OAuth, reset password |
| Users | `/api/users/*` — profile, follow, block, mute, settings, avatar |
| Posts | `/api/posts/*` — CRUD, feed, explore, like, save, archive, comments |
| Stories | `/api/stories/*` — create, view, react, highlight, archive |
| Messages | `/api/messages/*` — conversations, group chat, send, react |
| Notifications | `/api/notifications/*` — get, read, clear |
| Search | `/api/search/*` — users, posts, hashtags |
| Reels | `/api/reels/*` — feed, create |
| Admin | `/api/admin/*` — dashboard, user management, content moderation |

---

## 📧 Email Notifications Sent

| Event | Email |
|-------|-------|
| Registration | Welcome + OTP + verification link |
| Login | New sign-in alert with device/IP |
| Password reset | Reset link |
| Password changed | Security alert |
| Email change | Alert to old email |
| Profile updated | Change summary |
| Avatar changed | Security notice |
| 2FA enabled | Confirmation |

---

## 🎨 Design System

- **Dark/Light mode** via CSS variables + Tailwind `dark:` classes
- **Color palette**: Instagram-inspired gradient (purple → red → orange)
- **Animations**: fade-in, slide-up, scale-in, shimmer, heart-burst, bounce
- **Typography**: System font stack for native feel
- **Responsive**: Mobile-first with sidebar collapse on desktop

---

## 📄 License
MIT
