# Multi-Camera Live Recognition Frontend

## Overview

The frontend has been completely redesigned to support **simultaneous multi-camera recognition** with independent results display for each camera.

## Architecture

### New Components

#### 1. **MultiCamRecognition.jsx** (Main Component)
- Orchestrates the entire multi-camera recognition system
- Manages Socket.IO connection with the backend
- Handles camera lifecycle (add, start, stop, remove)
- Maintains recognition results for each camera independently
- Features:
  - Real-time WebSocket communication
  - Multiple camera management (local and IP cameras)
  - Per-camera recognition intervals (configurable)
  - Connection status monitoring
  - ML Service health check

#### 2. **CameraStream.jsx** (Camera Configuration)
- Renders individual camera feed controls
- Displays video/image stream
- Provides camera configuration options:
  - Device selection (for local cameras)
  - IP URL configuration (for IP cameras)
  - Recognition interval adjustment
  - Start/Stop controls
- Visual indicators:
  - Camera type badge (Local/IP)
  - Running status indicator
  - Camera-specific controls

#### 3. **RecognitionResult.jsx** (Results Display)
- Displays recognition results for each camera
- Shows different states:
  - **Pending**: Waiting for first recognition result
  - **Recognized**: Shows person name + confidence score with visual bar
  - **Not Recognized**: Shows "unknown face" message
  - **Error**: Displays error messages with timestamps
- Real-time update with timestamps

## Key Features

### ✅ Multi-Camera Support
- Add unlimited local cameras (webcam devices)
- Add unlimited IP cameras (HTTP streams)
- Each camera runs independent recognition cycles
- Results are isolated per camera

### ✅ Socket.IO Integration
```javascript
// Recognition request with camera_id
socket.emit('recognize-face', {
  image: base64ImageData,
  camera_id: uniqueCameraId
});

// Result with camera_id
socket.on('recognition-result', (data) => {
  const { camera_id, name, confidence, is_recognized, message, timestamp } = data;
});
```

### ✅ Flexible Configuration
- **Recognition Interval**: Set custom interval per camera (default: 1500ms)
- **Device Selection**: Choose specific camera device for local cameras
- **URL Configuration**: Set custom IP camera URLs
- **Throttling**: Prevents simultaneous requests on same camera

### ✅ Real-time Status
- Backend connection status indicator
- ML Service health status
- GPU availability check
- Per-camera recording status
- Timestamped results

### ✅ Responsive Design
- Grid layout that adapts to screen size
- Mobile-friendly (single column on small screens)
- Aspect-ratio locked video containers (16:9)

## Data Flow

```
┌─────────────────────────────────┐
│   MultiCamRecognition           │
│  (Main orchestrator)            │
└──────────┬──────────────────────┘
           │
      ┌────┴────────────────────────────────┐
      │                                     │
┌─────┴────────────┐        ┌──────────────┴─────────┐
│ CameraStream     │        │  RecognitionResult     │
│ (Video capture)  │        │  (Results display)     │
└──────────────────┘        └────────────────────────┘
      │                              ▲
      │  Frame capture               │
      │  (every X ms)                │
      │                              │
      └──────────────┬───────────────┘
                     │
           ┌─────────┴─────────┐
           │                   │
      ┌────▼────────┐   ┌──────▼────────┐
      │  Backend    │   │  ML Service   │
      │  Socket.IO  │   │  (FastAPI)    │
      └─────────────┘   └───────────────┘
```

## API Contract

### Socket Events

**Emitted by Frontend:**
```javascript
// Check backend health
socket.emit('check-ml-service');

// Send frame for recognition
socket.emit('recognize-face', {
  image: 'data:image/jpeg;base64,...',  // Base64 encoded image
  camera_id: 'cam_abc123'                // Unique camera identifier
});
```

**Received by Frontend:**
```javascript
// Connection established
socket.on('connect', () => { ... });

// Recognition result
socket.on('recognition-result', {
  camera_id: 'cam_abc123',
  name: 'John Doe',
  confidence: 0.92,
  is_recognized: true,
  message: 'Recognition complete'
});

// Recognition error
socket.on('recognition-error', {
  camera_id: 'cam_abc123',
  message: 'Failed to process image'
});

// ML Service status
socket.on('ml-service-status', {
  status: 'healthy',      // 'healthy' | 'offline'
  gpu_available: true,
  milvus_connected: true
});
```

## Usage

### Running the Frontend

```bash
cd Demo
npm install
npm run dev
```

### Adding Cameras

1. **Local Camera**: Click "Add Local Camera" button
   - Select device from dropdown
   - Adjust recognition interval if needed
   - Click "Start"

2. **IP Camera**: Click "Add IP Camera" button
   - Enter IP camera URL (e.g., `http://192.168.1.3:8080/video`)
   - Adjust recognition interval if needed
   - Click "Start"

### Monitoring Recognition

- Each camera displays its own recognition results
- Results update in real-time with timestamps
- Confidence scores shown with visual progress bar
- Error states clearly indicate issues

### Batch Operations

- **Start All**: Start recognition on all cameras simultaneously
- **Stop All**: Stop all cameras at once
- **Check ML Service**: Manual health check of ML service

## Performance Considerations

### Recognition Interval
- **Default**: 1500ms (recommended for real-time accuracy)
- **Minimum**: 300ms (system-enforced minimum)
- **Tuning**: Lower = More responsive but higher CPU/GPU usage

### Throughput
- Each camera's frames are processed independently
- Multiple cameras don't block each other
- ML Service handles queueing and GPU scheduling

### Memory
- Video streams are only captured when camera is running
- Unused references are cleaned up on camera removal
- Results are stored in memory (can be persisted if needed)

## Backend Updates

The backend socket handler has been updated to:
1. Accept `camera_id` in recognition requests
2. Include `camera_id` in all responses
3. Match responses to specific cameras
4. Handle per-camera error reporting

## File Structure

```
Demo/
├── src/
│   ├── App.jsx                 # Main app (cleaned up)
│   ├── main.jsx
│   ├── styles.css              # Updated styles
│   └── components/
│       ├── MultiCamRecognition.jsx  # Main component
│       ├── CameraStream.jsx         # Camera UI
│       └── RecognitionResult.jsx    # Results UI
├── index.html
├── vite.config.js
└── package.json
```

## Breaking Changes

❌ **Removed Components:**
- `Enroll.jsx` - Legacy enrollment
- `EnrollSocket.jsx` - Legacy enrollment (Socket.IO)
- `Recognize.jsx` - Legacy single-camera recognition
- `RecognizeSocket.jsx` - Legacy single-camera (Socket.IO)
- `MultiCamQueueTest.jsx` - Queue testing tool

✅ **New Approach:**
- Single unified multi-camera interface
- WebSocket-first design
- Per-camera result isolation
- Real-time status monitoring

## Styling

### Color Scheme
- **Dark Theme**: Blue-gray backgrounds (#111827, #0b1222)
- **Accents**: Blue (#2563eb) for primary actions
- **Success**: Green (#22c55e) for recognized faces
- **Warning**: Amber (#f59e0b) for unknown faces
- **Error**: Red (#ef4444) for errors

### Responsive Breakpoints
- **Desktop**: Multi-column grid
- **Tablet**: 2-column layout
- **Mobile**: Single column

## Future Enhancements

Potential improvements:
- [ ] Recording results to database
- [ ] Historical timeline of recognitions
- [ ] Face gallery with thumbnails
- [ ] Export recognition logs
- [ ] Custom recognition thresholds per camera
- [ ] Analytics dashboard
- [ ] Multi-user support
- [ ] Role-based access control
