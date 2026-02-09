const { requestJson } = require('./utils');

async function registerCamera(apiUrl, payload) {
  const url = `${apiUrl.replace(/\/$/, '')}/api/register`;
  const response = await requestJson(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const message = response.data?.message || `Register failed with ${response.status}`;
    throw new Error(message);
  }

  if (!response.data?.cam_id) {
    throw new Error('Register response missing cam_id');
  }

  return response.data.cam_id;
}

module.exports = {
  registerCamera
};
