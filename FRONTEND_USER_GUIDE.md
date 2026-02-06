# Frontend User Guide - New Flow

## Overview
The application now follows a logical three-step process:

1. **📹 Camera Management** - Set up your cameras
2. **🎥 Live Recognition** - Perform real-time face recognition
3. **➕ Face Enrollment** - Register new employees

---

## Step 1: Camera Management

### Purpose
Register physical or virtual cameras in the database. This metadata is used by the recognition system to track which camera detected which person.

### How to Use

1. **View Existing Cameras**
   - All previously registered cameras are displayed in a grid
   - Shows: Camera Label, Site Name, Site ID, and creation date

2. **Add New Camera**
   - Click "+ Add New Camera" button
   - Fill in the form:
     - **Site ID** (required): Unique site identifier (e.g., "SITE-001")
     - **Site Name** (optional): Human-readable location name (e.g., "Main Entrance")
     - **Camera Label** (required): Descriptive camera name (e.g., "Front Door Camera")
   - Click "Add Camera" to save

3. **Delete Camera**
   - Click the trash icon (🗑️) on any camera card
   - Confirm deletion
   - Camera is removed from database

### Why This Matters
- Every recognition event is linked to a camera
- Helps track WHERE employees were seen
- Enables multi-site deployments with attendance by location

---

## Step 2: Live Recognition

### Purpose
Real-time face recognition using local or USB cameras, tied to specific database cameras.

### Requirements
- At least one camera registered (see Step 1)
- Local camera access permissions granted

### How to Use

1. **Select Local Camera**
   - Dropdown list shows all available cameras connected to your computer
   - Select one and click to activate
   - Video feed appears below

2. **Link to Database Camera**
   - In the second dropdown, select which database camera this feed represents
   - This associates the recognition with a specific location

3. **Start Recognition**
   - Click "Start Recognition" button
   - System sends frames every 2 seconds to the ML service
   - Results appear below in real-time

4. **Recognition Results**
   - **Name**: Recognized employee name
   - **Confidence**: Match confidence score (0-100%)
   - **Status**: ✓ Recognized or ✗ Not Recognized
   - **Timestamp**: When the recognition occurred

5. **Stop Recognition**
   - Click "Stop Recognition" to pause
   - Click "Stop Camera" to disconnect the camera

### Troubleshooting
- **No cameras in dropdown**: Grant camera permissions to your browser
- **"Not Recognized"**: User may not be enrolled yet (see Step 3)
- **No ML service connection**: Check that backend is running

---

## Step 3: Face Enrollment

### Purpose
Register a new employee's face in the system for future recognition.

### Requirements
- **Employee ID**: Unique company ID (e.g., "EMP-001")
- **Employee Name**: Full name for identification
- **5 Face Images**: Captured from different angles

### How to Use

1. **Enter Employee Information**
   - **Employee ID** (required): Company-assigned ID
   - **Full Name** (required): First and last name

2. **Select Camera Source**
   - Use checkbox to toggle between:
     - **Local Browser Camera** (default)
     - **IP Camera** (if available)
   - For IP cameras, enter the URL (e.g., `http://192.168.x.x:8080/video`)

3. **Start Camera**
   - Click "Start Camera" button
   - Ensure face is clearly visible and well-lit

4. **Capture Frames**
   - **Manual Mode**: Click "Capture Frame" 5 times from different angles:
     - Front face (1)
     - Left angle (2)
     - Right angle (3)
     - Front (slightly tilted up) (4)
     - Front (slightly tilted down) (5)
   
   - **Auto-Capture Mode**: Click "Auto-Capture All" to capture 5 frames automatically over ~4 seconds

5. **Review Captured Frames**
   - Grid shows thumbnails of all captured frames
   - Each shows a number (1-5)
   - Click "Clear All" to start over if needed

6. **Submit Enrollment**
   - Once you have 5 frames, "Submit Enrollment" button activates
   - Click to submit
   - Success message appears when enrollment complete
   - Employee is now available for recognition

### Enrollment Tips
- **Lighting**: Ensure adequate lighting on face
- **Angles**: Get diverse angles - front, sides, up/down
- **Distance**: Face should fill 1/3 of the frame
- **Expressions**: Neutral or natural expression works best
- **Cleanup**: Glasses off or on consistently

### Troubleshooting
- **"Could not access camera"**: Grant browser camera permissions
- **"Enrollment failed"**: Check that ML service is running
- **"Already enrolled"**: Employee ID already exists - use different ID
- **Frames not capturing**: Ensure video shows in preview first

---

## Workflow Examples

### Example 1: Setting Up a New Site

1. **Camera Management**
   - Add camera: SITE-001, "HQ Main Entrance", "Front Door"
   - Add camera: SITE-001, "HQ Back Entrance", "Back Door"

2. **Recognition**
   - Select local camera → Link to "Front Door"
   - Start recognition to monitor entrance

### Example 2: Enrolling New Employees

1. **Camera Management**
   - Verify cameras already exist

2. **Face Enrollment**
   - Employee ID: EMP-123
   - Name: John Smith
   - Capture 5 frames
   - Submit

3. **Recognition**
   - Select camera
   - Start recognition
   - John Smith now appears when he's in front of camera

### Example 3: Multi-Camera Setup

1. **Camera Management**
   - Add multiple cameras for different locations/angles

2. **Recognition**
   - Run recognition for each camera separately
   - Each monitors its location
   - Track employee movements across site

---

## API Reference (For Developers)

### Camera Management API
```
GET    /api/cameras                    - List all cameras
POST   /api/cameras                    - Add camera
PUT    /api/cameras/:cam_id            - Update camera  
DELETE /api/cameras/:cam_id            - Delete camera
```

### Enrollment API
```
POST   /api/enroll                     - Enroll employee with images
GET    /api/employees                  - List employees
DELETE /api/employees/:emp_id          - Remove employee
```

### Recognition API
```
POST   /api/recognize                  - Submit frame for recognition
GET    /api/job/:jobId                 - Check recognition status
```

### Attendance API
```
POST   /api/attendance                 - Record event
GET    /api/attendance                 - Query events
GET    /api/attendance/employee/:emp_id - Employee history
```

---

## Keyboard Shortcuts (Future Enhancement)
- [Not yet implemented - submit feature request if desired]

---

## Common Issues

| Issue | Solution |
|-------|----------|
| No cameras show in dropdown | Check browser camera permissions in settings |
| "ML Service Not Available" | Start the ML service backend |
| Enrollment succeeds but recognition fails | Ensure enrollment location has good lighting |
| Recognition always says "Not Recognized" | Employee may not be enrolled yet |
| Browser freezes during recognition | Check backend is running; restart if needed |

---

## Best Practices

1. **Setup First**: Always create cameras before trying recognition
2. **Good Lighting**: Enroll in same lighting as recognition will occur
3. **Consistent Distance**: Keep camera distance similar during enrollment and recognition
4. **Test First**: Do a test enrollment to verify system setup before bulk enrollment
5. **Monitor Performance**: Check recognition confidence scores regularly
6. **Backup Cameras**: Have multiple camera positions for redundancy

---

## Next Steps

- [ ] Review camera setup in Management tab
- [ ] Test recognition with a sample camera
- [ ] Enroll first batch of employees
- [ ] Monitor recognition results
- [ ] Adjust camera positions if needed
- [ ] Scale to additional locations

For technical support or issues, check logs in the backend terminal.
