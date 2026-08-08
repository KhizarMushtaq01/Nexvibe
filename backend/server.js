import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { geoBlock } from './middleware/geoBlock.js';
import { initSocket } from './config/socket.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import e2eRoutes from './routes/e2eRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import reelRoutes from './routes/reelRoutes.js';
import reportRoutes from './routes/reportRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Only trust X-Forwarded-For when genuinely deployed behind exactly one
// reverse-proxy hop (set TRUST_PROXY=1 in that environment's config).
// Trusting it unconditionally lets any direct client spoof their IP,
// bypassing both geo-restriction and the IP-keyed rate limiters.
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Make io accessible in routes
app.set('io', io);
initSocket(io);

// Connect to database
connectDB();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: { action: 'deny' }, // X-Frame-Options: DENY -- prevents clickjacking
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } // 1 year
  // X-Content-Type-Options: nosniff is on by default in helmet -- no override needed.
}));

// CORS -- explicit allowlist (comma-separated ALLOWED_ORIGINS, falling back to
// CLIENT_URL) instead of reflecting an arbitrary Origin header.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin requests / non-browser tools (curl, server-to-server) send
    // no Origin header at all -- allow those through.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Site-wide geo-restriction gate -- needs cookies (checks the access-token
// cookie as a fallback) and must run before any route is mounted.
app.use(geoBlock);

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'NexVibe API is running', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/e2e', e2eRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reels', reelRoutes);
app.use('/api/reports', reportRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Rate limiters (middleware/rateLimiters.js) prefer Redis but fall back to
// an in-memory store if it's unreachable, so this only waits for the first
// connection attempt to settle -- a down Redis delays startup by one
// connect timeout, it never blocks or crashes it (see config/redis.js).
const startServer = async () => {
  await connectRedis();
  server.listen(PORT, () => {
    console.log(`\n🚀 NexVibe Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    console.log(`💬 Socket.io ready\n`);
  });
};

startServer();

export default app;
