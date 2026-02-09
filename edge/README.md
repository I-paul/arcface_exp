# Edge Runtime

Always-on edge runtime that owns camera streaming, recognition loop, and attendance emission.

## Run

```bash
node edge.service.js
```

## Config

Edit `edge.yaml` in this folder.

Required fields:
- camera.stream_url
- camera.site_id
- camera.camera_label
- backend.api_url
