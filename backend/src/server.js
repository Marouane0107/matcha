import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import http from 'http';
import { Server } from 'socket.io';
import { pool } from './config/db.js';
import authRoutes from './routes/auth.routes.js';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Environment variables configuration
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Database is now configured in src/config/db.js

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

// Routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'success',
      data: {
        database: 'connected',
        timestamp: new Date().toISOString()
      }
    });
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

// Global error-handling middleware
app.use((err, req, res, next) => {
  console.error('[Error]:', err.message || err);

  const statusCode = err.statusCode || 500;
  // Sanitize error message in production for 500 errors
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    status: 'error',
    message: message
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
