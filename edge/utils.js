async function requestJson(url, options) {
  const response = await fetch(url, options);
  let data = null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    if (text) {
      data = { message: text };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  requestJson,
  sleep
};
