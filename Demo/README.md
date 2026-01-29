# Face Demo (React + Vite)

Minimal UI to enroll and recognize faces via the backend `/api/enroll` and `/api/recognize` endpoints.

## Run
```bash
cd Demo
npm install
npm run dev
```
Open http://localhost:5173

## Features
- Enroll: guided captures (1 front, 2 right, 2 left) + name, sent as multipart to `/api/enroll`.
- Recognize: live camera feed, polls a frame every ~1.2s to `/api/recognize`.

## Backend Proxy
Vite proxies `/api` to `http://localhost:3000` (adjust in `vite.config.js` if needed).
