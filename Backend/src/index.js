const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
dotenv.config();
const employeeRoutes = require('./routes/employeeRoutes');
const socketHandler = require('./utils/socketHandler');

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount
  });
});

//routes
app.use('/api', employeeRoutes);

// Socket.IO connection handler
socketHandler(io);

// Socket.IO connection monitoring
io.engine.on('connection_error', (err) => {
  console.error('[Socket.IO] Connection error:', err.message);
});

//connection
server.listen(port, () => {
  console.log(`[Server] Running on http://localhost:${port}`);
  console.log(`[Socket.IO] Ready for connections`);
  console.log(`[Server] Allowed origins:`, allowedOrigins.join(', '));
});