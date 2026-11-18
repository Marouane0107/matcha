import express from 'express';
import bodyParser from 'body-parser';
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
import { chatRouter, notificationRouter } from './routes/realtime.routes.js';
import { attachSockets } from './sockets/index.js';
import { rateLimit } from './middleware/rate-limit.middleware.js';
import { validateJwtSecret } from './utils/jwt.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the repo root .env (not the backend workspace)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
validateJwtSecret();

export const app = express();
export const server = http.createServer(app);

// Environment variables configuration
const PORT = process.env.PORT || 3000;

// Socket.io configuration
export const io = new Server(server, {
  maxHttpBufferSize: 16384,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '32kb' }));
app.use(rateLimit);

// Request logging middleware
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') console.log(`${req.method} ${req.path}`);
  next();
});

// Static files for photo uploads
app.use('/uploads', (_req, res) => res.status(404).json(apiError(ERROR_CODES.NOT_FOUND, 'Not found')));

// Routes — aligned with shared API_ROUTES contract
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);      // singular — matches API_ROUTES.PROFILE.ME
app.use('/api/profiles', browseRoutes);       // plural — suggestions & search (registered first)
app.use('/api/profiles', interactionRoutes);  // plural — public profile, like/block/report
app.use('/api/interactions', interactionsRouter);
app.use('/api/tags', tagRouter);
app.use('/api/conversations', chatRouter);
app.use('/api/notifications', notificationRouter);

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
attachSockets(io);

app.use((_req, res) => res.status(404).json(apiError(ERROR_CODES.NOT_FOUND, 'Not found')));

// Global error-handling middleware — uses shared ApiFailure envelope
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'test' && (err.statusCode ?? 500) >= 500) console.error('Request failed', err);

  const statusCode = err.statusCode || err.status || 500;
  const code = err.errorCode || (statusCode === 400 || statusCode === 413 ? ERROR_CODES.VALIDATION_ERROR : ERROR_CODES.INTERNAL_ERROR);
  // Sanitize error message in production for 500 errors
  const message = statusCode >= 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json(apiError(code, message));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
