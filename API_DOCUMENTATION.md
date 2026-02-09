# API Documentation

## Base URL
```
http://localhost:3000/api
```

All endpoints use JSON request/response format except where specified.

---

## Camera Management

### Get All Cameras
```http
GET /cameras
```

**Response** (200 OK):
```json
[
  {
    "cam_id": "uuid-here",
    "site_id": "SITE-001",
    "site_name": "Main Entrance",
    "camera_label": "Front Door Camera",
    "created_at": "2024-02-06T10:30:00Z"
  }
]
```

### Get Camera by ID
```http
GET /cameras/:cam_id
```

**Response** (200 OK):
```json
{
  "cam_id": "uuid-here",
  "site_id": "SITE-001",
  "site_name": "Main Entrance",
  "camera_label": "Front Door Camera",
  "created_at": "2024-02-06T10:30:00Z"
}
```

**Error** (404 Not Found):
```json
{ "message": "Camera not found" }
```

### Create Camera
```http
POST /cameras
Content-Type: application/json

{
  "site_id": "SITE-001",
  "site_name": "Main Entrance",
  "camera_label": "Front Door Camera"
}
```

**Required Fields**: `site_id`, `camera_label`  
**Optional Fields**: `site_name`

**Response** (201 Created):
```json
{
  "cam_id": "uuid-here",
  "site_id": "SITE-001",
  "site_name": "Main Entrance",
  "camera_label": "Front Door Camera",
  "created_at": "2024-02-06T10:30:00Z"
}
```

### Update Camera
```http
PUT /cameras/:cam_id
Content-Type: application/json

{
  "site_name": "Updated Name",
  "camera_label": "Updated Label"
}
```

**Response** (200 OK):
```json
{
  "cam_id": "uuid-here",
  "site_id": "SITE-001",
  "site_name": "Updated Name",
  "camera_label": "Updated Label",
  "created_at": "2024-02-06T10:30:00Z"
}
```

### Delete Camera
```http
DELETE /cameras/:cam_id
```

**Response** (204 No Content)

---

## Employee Management & Enrollment

### Enroll Employee
```http
POST /enroll
Content-Type: multipart/form-data

Form Data:
- emp_id: "EMP-001" (required, string)
- name: "John Smith" (required, string)
- files: [image1.jpg, image2.jpg, ...] (required, 1-5 files)
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Employee John Smith enrolled successfully",
  "employee": {
    "emp_id": "EMP-001",
    "name": "John Smith",
    "milvus_id": 12345
  }
}
```

**Errors**:
```json
// Missing emp_id
{ "message": "emp_id is required for enrollment" }

// Missing files
{ "message": "At least one image file is required" }

// Already enrolled
{ "message": "Employee already enrolled with this ID" }

// ML service error
{ "message": "ML service error details" }
```

### Get All Employees
```http
GET /employees
```

**Response** (200 OK):
```json
[
  {
    "emp_id": "EMP-001",
    "name": "John Smith",
    "milvus_id": 12345
  },
  {
    "emp_id": "EMP-002",
    "name": "Jane Doe",
    "milvus_id": 12346
  }
]
```

### Get Employee by ID
```http
GET /employees/:emp_id
```

**Response** (200 OK):
```json
{
  "emp_id": "EMP-001",
  "name": "John Smith",
  "milvus_id": 12345
}
```

**Error** (404 Not Found):
```json
{ "message": "Employee not found" }
```

### Delete Employee
```http
DELETE /employees/:emp_id
```

**Response** (204 No Content)

---

## Face Recognition

### Submit Frame for Recognition
```http
POST /recognize
Content-Type: multipart/form-data

Form Data:
- file: image.jpg (required)
- cam_id: "uuid" (optional)
- site_id: "SITE-001" (optional)
```

**Response** (202 Accepted):
```json
{
  "message": "Face recognition job queued",
  "job_id": "job-uuid-or-id",
  "status": "queued",
  "status_url": "/api/job/job-uuid-or-id"
}
```

### Get Job Status
```http
GET /job/:jobId
```

**While Processing** (200 OK):
```json
{
  "job_id": "job-uuid",
  "status": "active",
  "progress": 0,
  "created_at": "2024-02-06T10:30:00Z"
}
```

**After Completion** (200 OK):
```json
{
  "job_id": "job-uuid",
  "status": "completed",
  "progress": 100,
  "created_at": "2024-02-06T10:30:00Z",
  "result": {
    "name": "John Smith",
    "confidence": 0.95,
    "is_recognized": true,
    "emp_id": "EMP-001",
    "matched": true
  },
  "completed_at": "2024-02-06T10:30:05Z"
}
```

**On Failure** (200 OK):
```json
{
  "job_id": "job-uuid",
  "status": "failed",
  "progress": 0,
  "created_at": "2024-02-06T10:30:00Z",
  "error": "Face not detected in image",
  "failed_at": "2024-02-06T10:30:05Z"
}
```

**Error** (404 Not Found):
```json
{ "message": "Job not found" }
```

---

## Attendance Events

### Record Attendance Event
```http
POST /attendance
Content-Type: application/json

{
  "emp_id": "EMP-001",
  "cam_id": "camera-uuid",
  "site_id": "SITE-001",
  "action": "IN",
  "similarity_score": 0.95,
  "liveness_passed": true
}
```

**Required Fields**: `emp_id`, `cam_id`, `action`  
**Optional Fields**: `site_id`, `similarity_score`, `liveness_passed`  
**Valid Actions**: `IN`, `OUT`

**Response** (201 Created):
```json
{
  "id": "event-uuid",
  "emp_id": "EMP-001",
  "cam_id": "camera-uuid",
  "site_id": "SITE-001",
  "event_time": "2024-02-06T10:30:00Z",
  "action": "IN",
  "similarity_score": 0.95,
  "liveness_passed": true,
  "created_at": "2024-02-06T10:30:00Z"
}
```

### Query Attendance Events
```http
GET /attendance?emp_id=EMP-001&cam_id=cam-uuid&action=IN&start_date=2024-02-01&end_date=2024-02-06&limit=50
```

**Query Parameters** (all optional):
- `emp_id`: Filter by employee
- `cam_id`: Filter by camera
- `site_id`: Filter by site
- `action`: `IN` or `OUT`
- `start_date`: ISO format date/time
- `end_date`: ISO format date/time
- `limit`: Results limit (default 100, max 1000)

**Response** (200 OK):
```json
[
  {
    "id": "event-uuid-1",
    "emp_id": "EMP-001",
    "cam_id": "camera-uuid",
    "site_id": "SITE-001",
    "event_time": "2024-02-06T09:00:00Z",
    "action": "IN",
    "similarity_score": 0.97,
    "liveness_passed": true,
    "created_at": "2024-02-06T09:00:00Z"
  },
  {
    "id": "event-uuid-2",
    "emp_id": "EMP-001",
    "cam_id": "camera-uuid",
    "site_id": "SITE-001",
    "event_time": "2024-02-06T17:30:00Z",
    "action": "OUT",
    "similarity_score": 0.94,
    "liveness_passed": true,
    "created_at": "2024-02-06T17:30:00Z"
  }
]
```

### Get Employee Attendance History
```http
GET /attendance/employee/:emp_id?start_date=2024-02-01&end_date=2024-02-06&limit=50
```

**Query Parameters** (all optional):
- `start_date`: ISO format date/time
- `end_date`: ISO format date/time
- `limit`: Results limit (default 50)

**Response** (200 OK):
```json
[
  {
    "id": "event-uuid-1",
    "emp_id": "EMP-001",
    "cam_id": "camera-uuid",
    "site_id": "SITE-001",
    "event_time": "2024-02-06T09:00:00Z",
    "action": "IN",
    "similarity_score": 0.97,
    "liveness_passed": true,
    "created_at": "2024-02-06T09:00:00Z",
    "employee_name": "John Smith",
    "camera_label": "Front Door",
    "site_name": "Main Entrance"
  }
]
```

**Error** (404 Not Found):
```json
{ "message": "No attendance records found" }
```

### Get Today's Attendance Summary
```http
GET /attendance/summary/today?site_id=SITE-001
```

**Query Parameters** (optional):
- `site_id`: Filter by specific site

**Response** (200 OK):
```json
[
  {
    "emp_id": "EMP-001",
    "name": "John Smith",
    "camera_label": "Front Door",
    "site_name": "Main Entrance",
    "check_in_time": "2024-02-06T09:00:00Z",
    "check_out_time": "2024-02-06T17:30:00Z",
    "event_count": 2
  },
  {
    "emp_id": "EMP-002",
    "name": "Jane Doe",
    "camera_label": "Back Door",
    "site_name": "Secondary Entrance",
    "check_in_time": "2024-02-06T09:15:00Z",
    "check_out_time": null,
    "event_count": 1
  }
]
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success - Request completed |
| 201 | Created - Resource successfully created |
| 202 | Accepted - Request queued for processing |
| 204 | No Content - Successful deletion |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Server Error - Backend issue |

---

## Common Request Patterns

### Pattern 1: Enroll and Immediately Recognize
```
1. POST /enroll with 5 frames
2. Wait for response with milvus_id
3. POST /recognize with new image
4. GET /job/:jobId until completed
```

### Pattern 2: Track Attendance
```
1. POST /recognize when face detected
2. GET /job/:jobId to get emp_id
3. POST /attendance to record IN/OUT event
4. GET /attendance/employee/:emp_id for history
```

### Pattern 3: Audit Trail
```
1. GET /attendance with date filters
2. Analyze employee patterns
3. Generate reports
```

---

## Rate Limits
- No strict rate limits enforced by default
- ML Service may have queue limits (configurable)
- Recommend: 1-2 recognition requests per camera per second

---

## CORS Headers
```
Access-Control-Allow-Origin: <FRONTEND_URL>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Example cURL Commands

### Create Camera
```bash
curl -X POST http://localhost:3000/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "site_id": "SITE-001",
    "site_name": "Main Entrance",
    "camera_label": "Front Door"
  }'
```

### Enroll Employee
```bash
curl -X POST http://localhost:3000/api/enroll \
  -F "emp_id=EMP-001" \
  -F "name=John Smith" \
  -F "files=@frame1.jpg" \
  -F "files=@frame2.jpg" \
  -F "files=@frame3.jpg" \
  -F "files=@frame4.jpg" \
  -F "files=@frame5.jpg"
```

### Submit Recognition
```bash
curl -X POST http://localhost:3000/api/recognize \
  -F "file=@image.jpg" \
  -F "cam_id=camera-uuid" \
  -F "site_id=SITE-001"
```

### Check Recognition Result
```bash
curl http://localhost:3000/api/job/job-uuid
```

### Query Attendance
```bash
curl "http://localhost:3000/api/attendance?emp_id=EMP-001&action=IN&limit=10"
```

---

## Webhook Notifications (Future)
Not yet implemented - consider for real-time notifications to external systems
