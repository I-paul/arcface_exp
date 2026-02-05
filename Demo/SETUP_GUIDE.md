# Frontend Setup & Quick Start Guide

## Prerequisites

- Node.js 16+ installed
- Backend server running on `http://localhost:3000`
- ML Service running on `http://localhost:8000`
- Cameras (local webcam or IP cameras)

## Installation

```bash
cd Demo
npm install
```

## Development Mode

```bash
npm run dev
```

Access the application at `http://localhost:5173`

## Production Build

```bash
npm run build
npm run preview
```

## Environment Configuration

Create a `.env.local` file in the `Demo` directory to customize:

```env
VITE_BACKEND_URL=http://localhost:3000
```

## Camera Setup

### Local Cameras
- Ensure browser has camera permissions
- Click "Add Local Camera"
- Select camera device from dropdown
- Click "Start"

### IP Cameras (Mobile/Other Devices)
- Ensure IP camera is accessible from your network
- Click "Add IP Camera"
- Enter camera URL (e.g., `http://192.168.1.10:8080/video`)
- Click "Start"

## Troubleshooting

### "Failed to connect to server"
- Check if backend is running: `http://localhost:3000`
- Check CORS settings in backend
- Verify firewall/network connectivity

### "ML Service: Offline"
- Check if ML service is running: `http://localhost:8000`
- Check logs: `docker logs ml_service` (if using Docker)
- Verify GPU is available (if required)

### Camera Permission Denied
- Allow camera access in browser settings
- Some browsers require HTTPS for camera access
- Check browser console for specific errors

### No Recognition Results
- Verify ML Service is healthy (click "Check ML Service")
- Ensure faces are clearly visible in camera
- Check recognition interval isn't too low
- Review backend logs for errors

### IP Camera Not Working
- Verify IP camera URL is correct
- Test URL in browser: `http://your-ip:port/video`
- Check CORS headers if using IP camera
- Try adding `/` at the end of URL

## Performance Tips

1. **Adjust Recognition Interval**
   - Lower for faster updates (uses more resources)
   - Higher for efficiency (uses fewer resources)
   - Default 1500ms is balanced

2. **Limit Simultaneous Cameras**
   - ML Service GPU has limited capacity
   - Start with 2-3 cameras, scale up as needed
   - Monitor CPU/GPU usage

3. **Use Lower Resolution IP Cameras**
   - Lower bandwidth requirements
   - Faster processing
   - More cameras can run simultaneously

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| WebSocket reconnection loops | Check backend is running and accepting connections |
| High GPU memory usage | Reduce number of cameras or increase recognition interval |
| Blurry video feed | Adjust camera focus or use higher resolution camera |
| False positives | Lower confidence thresholds (if configurable in ML service) |
| Timeout errors | Increase timeout in socketHandler.js if needed |

## Project Structure

```
Demo/
├── src/
│   ├── components/
│   │   ├── MultiCamRecognition.jsx (main orchestrator)
│   │   ├── CameraStream.jsx (camera UI)
│   │   └── RecognitionResult.jsx (results display)
│   ├── App.jsx (root component)
│   ├── main.jsx (entry point)
│   └── styles.css (all styling)
├── public/ (static assets)
├── index.html
├── vite.config.js
├── package.json
└── FRONTEND_IMPLEMENTATION.md (detailed documentation)
```

## Dependencies

- **react**: UI framework
- **react-dom**: React DOM rendering
- **socket.io-client**: WebSocket client for real-time communication
- **react-webcam**: Local camera access
- **axios**: HTTP client (if needed for REST APIs)
- **vite**: Build tool and dev server

## Testing the System End-to-End

1. **Start Backend**
   ```bash
   cd Backend
   npm install
   npm start
   ```

2. **Start ML Service**
   ```bash
   cd ml_service
   python -m venv venv
   source venv/bin/activate  # or `venv\Scripts\activate` on Windows
   pip install -r requirements.txt
   python main.py
   ```

3. **Start Frontend**
   ```bash
   cd Demo
   npm run dev
   ```

4. **Test Multi-Camera Recognition**
   - Open `http://localhost:5173` in browser
   - Add multiple cameras (local and/or IP)
   - Click "Start All"
   - Watch real-time recognition results for each camera

## Build & Deployment

### Docker Build
```bash
cd Demo
docker build -t face-recognition-frontend .
docker run -p 5173:5173 face-recognition-frontend
```

### Production Deployment
```bash
npm run build
# dist/ folder contains production build
# Deploy dist/ to your web server
```

## Support

For issues or questions:
1. Check the FRONTEND_IMPLEMENTATION.md for detailed architecture
2. Review browser console for JavaScript errors
3. Check backend logs for API errors
4. Verify ML Service is running and healthy
