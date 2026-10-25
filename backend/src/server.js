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
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

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
app.use('/api/profiles', browseRoutes);       // plural — suggestions & search
app.use('/api/tags', tagRouter);

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

// Socket.io events
io.on('connection', (socket) => {
  console.log(`[Socket] connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] disconnected: ${socket.id}`);
  });
});

// Global error-handling middleware — uses shared ApiFailure envelope
app.use((err, req, res, next) => {
  console.error('[Error]:', err.message || err);

  const statusCode = err.statusCode || 500;
  const code = err.errorCode || ERROR_CODES.INTERNAL_ERROR;
  // Sanitize error message in production for 500 errors
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json(apiError(code, message));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
