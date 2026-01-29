# Temporary Image Storage Policy

## ✅ Implementation Complete

The system now uses **temporary storage only** - no permanent local image storage.

## 🗂️ Storage Strategy

### Where Images Are Stored

**1. Temporary Files (Auto-Cleanup)**
- **Location**: OS temp directory (`os.tmpdir()/face-recognition-temp`)
  - Windows: `C:\Users\[User]\AppData\Local\Temp\face-recognition-temp`
  - Linux/Mac: `/tmp/face-recognition-temp`
- **Duration**: Only during processing (seconds)
- **Cleanup**: Automatic after success or error

**2. Permanent Storage (Milvus Only)**
- **Face embeddings**: Stored in Milvus vector database
- **No images stored**: Only mathematical embeddings (512-dimensional vectors)
- **Person metadata**: Name and person_id in Milvus

## 🔄 How It Works

### Recognition Flow
```
1. Image captured → Temp file created
2. Sent to ML service → Face detected
3. Embedding extracted → Stored in Milvus
4. Temp file deleted ✓ → Response sent
```

### Enrollment Flow
```
1. 5 images captured → 5 temp files created
2. Sent to ML service → Faces detected
3. Embeddings computed → Centroid stored in Milvus
4. All temp files deleted ✓ → Response sent
```

### Socket.IO Flow (No Disk Storage)
```
1. Image captured → Base64 in memory
2. Sent via Socket.IO → Buffer in memory
3. Sent to ML service → Processing in memory
4. Result returned → No files created ✓
```

## 📝 Implementation Details

### Backend (Node.js)

**File: `Backend/src/routes/employeeRoutes.js`**
```javascript
// Uses OS temp directory
const tempDir = path.join(os.tmpdir(), 'face-recognition-temp');
const upload = multer({ dest: tempDir });
```

**File: `Backend/src/models/employee.model.js`**
- ✅ Tracks all uploaded files
- ✅ Deletes files after successful processing
- ✅ Deletes files if error occurs
- ✅ Logs cleanup operations

**File: `Backend/src/utils/socketHandler.js`**
- ✅ No disk storage - uses memory buffers
- ✅ Base64 → Buffer → FormData → ML Service
- ✅ Zero temp files created

### ML Service (Python/FastAPI)

**No permanent storage:**
- FastAPI receives files in memory
- Processes images directly
- Extracts embeddings
- Stores only embeddings in Milvus
- No image files written to disk

## 🧹 Cleanup Process

### Automatic Cleanup (Node.js)

**After Enrollment:**
```javascript
filesToCleanup.forEach(filePath => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[CLEANUP] Deleted temp file: ${filePath}`);
    }
  } catch (err) {
    console.error(`[CLEANUP] Failed to delete ${filePath}:`, err.message);
  }
});
```

**After Recognition:**
```javascript
if (fileToCleanup && fs.existsSync(fileToCleanup)) {
  fs.unlinkSync(fileToCleanup);
  console.log(`[CLEANUP] Deleted temp file: ${fileToCleanup}`);
}
```

**On Error:**
- Same cleanup code runs in catch blocks
- Ensures no orphaned temp files

### OS-Level Cleanup

**Temp directory (`os.tmpdir()`):**
- Automatically managed by operating system
- Cleared on reboot
- Periodic cleanup by OS

## 🔍 Verification

### Check No Permanent Storage

**1. Check Backend:**
```bash
# No uploads folder should exist
ls Backend/uploads  # Should not exist
```

**2. Check Temp Directory:**
```bash
# Check OS temp (should be empty after processing)
# Windows
dir %TEMP%\face-recognition-temp

# Linux/Mac
ls /tmp/face-recognition-temp
```

**3. Monitor Logs:**
```bash
# Backend logs show cleanup
[CLEANUP] Deleted temp file: C:\Users\...\Temp\face-recognition-temp\abc123
```

## 📊 Storage Comparison

| Method | Images Stored | Embeddings Stored | Disk Usage |
|--------|---------------|-------------------|------------|
| **Old (uploads/)** | ✓ Permanent | ✓ Milvus | High |
| **New (temp + Milvus)** | ✗ Deleted | ✓ Milvus | Minimal |

## 🎯 Benefits

### 1. **Privacy**
- No permanent image storage
- Only mathematical embeddings retained
- GDPR/Privacy compliant

### 2. **Disk Space**
- No accumulation of image files
- Only embeddings (~2KB per person)
- Automatic cleanup

### 3. **Security**
- Temp files deleted immediately
- No orphaned sensitive data
- OS-level temp file security

### 4. **Maintenance**
- No manual cleanup needed
- No disk space monitoring required
- Self-managing system

## 🔒 Data Retention

### What's Stored Permanently:
- **Face embeddings** (512-dimensional vectors)
- **Person metadata** (name, person_id)
- **Confidence scores** (in Milvus)

### What's NOT Stored:
- ✗ Original images
- ✗ Face crops
- ✗ Video frames
- ✗ Temporary files

## 📝 Logs

**Example cleanup logs:**
```
[INFO] Processing enrollment for John Doe
[CLEANUP] Deleted temp file: /tmp/face-recognition-temp/1a2b3c4d
[CLEANUP] Deleted temp file: /tmp/face-recognition-temp/2b3c4d5e
[CLEANUP] Deleted temp file: /tmp/face-recognition-temp/3c4d5e6f
[CLEANUP] Deleted temp file: /tmp/face-recognition-temp/4d5e6f7g
[CLEANUP] Deleted temp file: /tmp/face-recognition-temp/5e6f7g8h
[INFO] Successfully enrolled John Doe with 5 images
```

## 🚀 Testing

### Test Cleanup Works:

**1. Enroll a person:**
```bash
# Watch logs for cleanup messages
# Should see: [CLEANUP] Deleted temp file: ...
```

**2. Check temp directory:**
```bash
# Should be empty after processing
ls $(node -e "console.log(require('os').tmpdir())")/face-recognition-temp
```

**3. Verify Milvus has data:**
```bash
# Embeddings stored, not images
# Check ML service /collection/stats endpoint
curl http://localhost:8000/collection/stats
```

## ✅ Summary

- ✅ All images use OS temp directory
- ✅ Automatic cleanup after processing
- ✅ Cleanup on error (no orphaned files)
- ✅ Socket.IO uses memory (no files)
- ✅ Only embeddings in Milvus (permanent)
- ✅ Zero maintenance required
- ✅ Privacy-compliant
- ✅ Disk-efficient

**Result**: No permanent local image storage. Only embeddings in Milvus. ✓
