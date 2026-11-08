import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { pool } from './config/db.js';
import { apiSuccess, apiError, ERROR_CODES } from './config/shared.js';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.routes.js';
import profileRoutes, { tagRouter } from './routes/profile.routes.js';
import browseRoutes from './routes/browse.routes.js';
import interactionRoutes, { interactionsRouter } from './routes/interaction.routes.js';
import chatRoutes from './routes/chat.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import { initSocketServer } from './sockets/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Environment variables configuration
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: false,
  }
});

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: false,
}));
app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Static files for photo uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes — aligned with shared API_ROUTES contract
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);      // singular — matches API_ROUTES.PROFILE.ME
app.use('/api/profiles', browseRoutes);       // plural — suggestions & search (registered first)
app.use('/api/profiles', interactionRoutes);  // plural — public profile, like/block/report
app.use('/api/interactions', interactionsRouter);
app.use('/api/tags', tagRouter);
app.use('/api/conversations', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json(apiSuccess({
      database: 'connected',
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Database connection failed:', error);
    next(error); // Pass to global error handler
  }
});

// Socket.io — authenticated realtime chat, presence, and notifications
initSocketServer(io);

// Global error-handling middleware — logs details server-side only; never
// exposes raw SQL, stack traces, or secrets to clients.
app.use((err, req, res, next) => {
  console.error('[Error]:', err);
  res.status(500).json(apiError(ERROR_CODES.INTERNAL_ERROR, 'Internal Server Error'));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
