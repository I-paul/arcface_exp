const { requestJson } = require('./utils');

async function postAttendance(apiUrl, payload) {
  const url = `${apiUrl.replace(/\/$/, '')}/api/attendance`;
  const response = await requestJson(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const message = response.data?.message || `Attendance failed with ${response.status}`;
    throw new Error(message);
  }

  return response.data;
}

module.exports = {
  postAttendance
};
