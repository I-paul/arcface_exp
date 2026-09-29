const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
dotenv.config();

const socketHandler = require('./utils/socketHandler');
const CameraStreamManager = require('./utils/CameraStreamManager');
const { startStreamReader } = require('./streamReader');
const sessionCache = require('./utils/sessionCache');

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS
const allowedOrigins = [
  process.env.FRONTEND_URL 
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  maxHttpBufferSize: 5e6, // 5MB for image data
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

const port = process.env.PORT || 3000;

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const enrollLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'Too many enrollment requests, try again in a minute' } });
app.use('/api', apiLimiter);
app.use('/api/enroll', enrollLimiter);
app.use('/api/re-enroll', enrollLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount
  });
});

//routes
app.use('/api', require('./routes/index'));

// Socket.IO connection handler
socketHandler(io);

// Socket.IO connection monitoring
io.engine.on('connection_error', (err) => {
  console.error('[Socket.IO] Connection error:', err.message);
});

// Start session cache auto-refresh (polls DB every 30s for active sessions)
sessionCache.startAutoRefresh(30000);

// Start Redis stream reader + camera stream manager
const cameraStreamManager = new CameraStreamManager(io);
startStreamReader(io, cameraStreamManager).catch((err) => {
  console.error('[StreamReader] Fatal:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  cameraStreamManager.closeAll();
  server.close(() => {
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down gracefully...');
  cameraStreamManager.closeAll();
  server.close(() => {
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
});

//connection
server.listen(port, () => {
  console.log(`[Server] Running on http://localhost:${port}`);
  console.log(`[Socket.IO] Ready for connections`);
  console.log(`[CameraStreamManager] Initialized`);
  console.log(`[SessionCache] Auto-refresh active`);
  console.log(`[StreamReader] Reading from Redis stream`);
  console.log(`[Server] Allowed origins:`, allowedOrigins.join(', '));
});