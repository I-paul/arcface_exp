function parseValue(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function parseEdgeYaml(text) {
  const config = {
    camera: {},
    backend: {}
  };

  let section = null;
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (!line.startsWith(' ') && trimmed.endsWith(':')) {
      section = trimmed.slice(0, -1);
      continue;
    }

    const match = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!match || !section) continue;

    const key = match[1];
    const raw = match[2];
    config[section][key] = parseValue(raw);
  }

  return config;
}

function writeEdgeYaml(config) {
  const camera = config.camera || {};
  const backend = config.backend || {};

  const lines = [];
  lines.push('camera:');
  lines.push(`  cam_id: ${camera.cam_id || 'null'}`);
  if (camera.stream_url) lines.push(`  stream_url: ${camera.stream_url}`);
  if (camera.site_id) lines.push(`  site_id: ${camera.site_id}`);
  if (camera.site_name) lines.push(`  site_name: ${camera.site_name}`);
  if (camera.camera_label) lines.push(`  camera_label: ${camera.camera_label}`);
  if (camera.recognition_interval_ms !== undefined) {
    lines.push(`  recognition_interval_ms: ${camera.recognition_interval_ms}`);
  }
  if (camera.reconnect_base_ms !== undefined) {
    lines.push(`  reconnect_base_ms: ${camera.reconnect_base_ms}`);
  }
  if (camera.min_event_interval_ms !== undefined) {
    lines.push(`  min_event_interval_ms: ${camera.min_event_interval_ms}`);
  }

  lines.push('');
  lines.push('backend:');
  if (backend.api_url) lines.push(`  api_url: ${backend.api_url}`);

  lines.push('');
  return lines.join('\n');
}

module.exports = {
  parseEdgeYaml,
  writeEdgeYaml
};
