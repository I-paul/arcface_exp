const path = require('path');
const fs = require('fs');
const { CameraController } = require('./camera.controller');
const { registerCamera } = require('./register.client');
const { postAttendance } = require('./attendance.client');
const { parseEdgeYaml, writeEdgeYaml } = require('./edge.yaml.js');

const CONFIG_PATH = path.join(__dirname, 'edge.yaml');

async function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config at ${CONFIG_PATH}`);
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return parseEdgeYaml(raw);
}

async function persistConfig(config) {
  const yaml = writeEdgeYaml(config);
  fs.writeFileSync(CONFIG_PATH, yaml, 'utf8');
}

async function ensureCamId(config) {
  if (config.camera.cam_id) {
    return config.camera.cam_id;
  }

  const payload = {
    site_id: config.camera.site_id,
    site_name: config.camera.site_name || null,
    camera_label: config.camera.camera_label
  };

  const camId = await registerCamera(config.backend.api_url, payload);
  config.camera.cam_id = camId;
  await persistConfig(config);

  console.log('[EDGE] cam_id registered and persisted');
  return camId;
}

async function main() {
  const config = await loadConfig();

  if (!config.backend?.api_url) {
    throw new Error('backend.api_url is required');
  }
  if (!config.camera?.stream_url) {
    throw new Error('camera.stream_url is required');
  }
  if (!config.camera?.camera_label || !config.camera?.site_id) {
    throw new Error('camera.site_id and camera_label are required for /register');
  }

  await ensureCamId(config);

  const attendanceClient = { postAttendance };
  const controller = new CameraController(config, attendanceClient);

  process.on('SIGINT', () => {
    controller.stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    controller.stop();
    process.exit(0);
  });

  controller.start();
}

main().catch((err) => {
  console.error(`[EDGE] Fatal error: ${err.message}`);
  process.exit(1);
});
