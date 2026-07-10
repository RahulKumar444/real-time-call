/**
 * Entry point for the Express + Socket.io server.
 *
 * Architecture note: We create a raw http.Server and pass it to both Express
 * and Socket.io so they share the same port. This is the standard pattern —
 * Express handles REST routes while Socket.io upgrades eligible requests to
 * WebSocket connections on the same server.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/db');
const { registerSocketHandlers } = require('./socket');
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

// Load environment variables from .env (falls back silently if missing)
dotenv.config();

const app = express();
const server = http.createServer(app);

// --- Ensure uploads directory exists ---------------------------------------

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// --- Middleware -------------------------------------------------------------

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Rate limiting for auth routes (max 20 requests per 15 min window)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});

// --- REST routes ------------------------------------------------------------

// Health-check — useful for uptime monitors and verifying the server is alive
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root path handler to avoid confusing "Cannot GET /" page
app.get('/', (_req, res) => {
  res.send('<h1>SyncSpace API Server is running!</h1><p>This is the backend API. Please visit the frontend client application to use the interface.</p>');
});

// Auth routes with rate limiting
app.use('/api/auth', authLimiter, authRoutes);

// File routes
app.use('/api/files', fileRoutes);

// --- Socket.io setup --------------------------------------------------------

const io = new SocketIOServer(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

// Delegate socket event wiring to a dedicated module
registerSocketHandlers(io);

// --- Start server -----------------------------------------------------------

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start();
