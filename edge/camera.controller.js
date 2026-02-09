const { requestJson, sleep } = require('./utils');
const { MjpegStreamReader } = require('./mjpeg.stream');

class EmployeeCache {
  constructor(apiUrl, refreshMs = 300000) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.refreshMs = refreshMs;
    this.lastRefresh = 0;
    this.map = new Map();
  }

  async resolveEmpId(milvusId) {
    if (!milvusId) return null;
    const now = Date.now();
    if (now - this.lastRefresh > this.refreshMs || !this.map.has(milvusId)) {
      await this.refresh();
    }
    return this.map.get(milvusId) || null;
  }

  async refresh() {
    const url = `${this.apiUrl}/api/employees`;
    const response = await requestJson(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Failed to fetch employees: ${response.status}`);
    }
    this.map.clear();
    for (const emp of response.data || []) {
      if (emp.milvus_id && emp.emp_id) {
        this.map.set(emp.milvus_id, emp.emp_id);
      }
    }
    this.lastRefresh = Date.now();
  }
}

class CameraController {
  constructor(config, attendanceClient) {
    this.config = config;
    this.attendanceClient = attendanceClient;
    this.processing = false;
    this.lastFrameAt = 0;
    this.lastEventAt = new Map();

    this.employeeCache = new EmployeeCache(config.backend.api_url);

    this.recognitionIntervalMs = config.camera.recognition_interval_ms || 2000;
    this.reconnectBaseMs = config.camera.reconnect_base_ms || 1000;
    this.minEventIntervalMs = config.camera.min_event_interval_ms || 15000;
  }

  start() {
    const streamUrl = this.config.camera.stream_url;
    this.stream = new MjpegStreamReader(streamUrl, {
      reconnectBaseMs: this.reconnectBaseMs,
      onFrame: (frame) => this.onFrame(frame),
      onError: (err) => {
        console.error(`[EDGE] Stream error: ${err.message}`);
      }
    });

    this.stream.start();
    console.log('[EDGE] Camera controller started');
  }

  stop() {
    if (this.stream) {
      this.stream.stop();
    }
    console.log('[EDGE] Camera controller stopped');
  }

  async onFrame(frame) {
    const now = Date.now();
    if (this.processing) return;
    if (now - this.lastFrameAt < this.recognitionIntervalMs) return;

    this.processing = true;
    this.lastFrameAt = now;

    try {
      const result = await this.submitRecognition(frame);
      if (!result?.is_recognized || !result?.person_id) {
        return;
      }

      const empId = await this.employeeCache.resolveEmpId(result.person_id);
      if (!empId) {
        console.warn('[EDGE] No emp_id for milvus_id:', result.person_id);
        return;
      }

      const lastEvent = this.lastEventAt.get(empId) || 0;
      if (now - lastEvent < this.minEventIntervalMs) {
        return;
      }

      const action = await this.resolveNextAction(empId, this.config.camera.site_id || null);
      if (!action) {
        return;
      }

      const payload = {
        emp_id: empId,
        cam_id: this.config.camera.cam_id,
        site_id: this.config.camera.site_id || null,
        action,
        event_time: new Date().toISOString(),
        similarity_score: result.confidence || null,
        liveness_passed: null
      };

      await this.attendanceClient.postAttendance(this.config.backend.api_url, payload);

      this.lastEventAt.set(empId, now);

      console.log(`[EDGE] Attendance recorded: ${empId} ${action}`);
    } catch (err) {
      console.error(`[EDGE] Frame processing error: ${err.message}`);
    } finally {
      this.processing = false;
    }
  }

  async submitRecognition(frameBuffer) {
    const apiUrl = this.config.backend.api_url.replace(/\/$/, '');
    const form = new FormData();
    const blob = new Blob([frameBuffer], { type: 'image/jpeg' });
    form.append('file', blob, 'frame.jpg');
    form.append('cam_id', this.config.camera.cam_id);
    if (this.config.camera.site_id) {
      form.append('site_id', this.config.camera.site_id);
    }

    const response = await fetch(`${apiUrl}/api/recognize`, {
      method: 'POST',
      body: form
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Recognition submit failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (!data.job_id) {
      throw new Error('Recognition response missing job_id');
    }

    return this.pollJob(data.job_id);
  }

  async pollJob(jobId) {
    const apiUrl = this.config.backend.api_url.replace(/\/$/, '');
    const maxAttempts = 40;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await requestJson(`${apiUrl}/api/job/${jobId}`, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`Job status failed: ${response.status}`);
      }

      const state = response.data?.status;
      if (state === 'completed') {
        return response.data?.result || null;
      }
      if (state === 'failed') {
        throw new Error(response.data?.error || 'Recognition failed');
      }

      await sleep(500);
    }

    throw new Error('Recognition job timed out');
  }

  async resolveNextAction(empId, siteId) {
    const apiUrl = this.config.backend.api_url.replace(/\/$/, '');
    const response = await requestJson(`${apiUrl}/api/attendance?emp_id=${encodeURIComponent(empId)}&limit=1`, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`Attendance lookup failed: ${response.status}`);
    }

    const lastEvent = Array.isArray(response.data) ? response.data[0] : null;
    if (!lastEvent) {
      return 'IN';
    }

    if (lastEvent.action === 'OUT') {
      return 'IN';
    }

    if (lastEvent.action === 'IN') {
      if (!siteId || lastEvent.site_id === siteId) {
        return 'OUT';
      }

      console.warn('[EDGE] Last action is IN at different site, waiting for OUT.');
      return null;
    }

    return 'IN';
  }
}

module.exports = {
  CameraController
};
