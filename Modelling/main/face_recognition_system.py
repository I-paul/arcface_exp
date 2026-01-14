import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis
import faiss
import json
import os
from pathlib import Path
from collections import deque
from webcam_conn import openCam
import time
try:
    from gpu_monitor import print_gpu_info
    GPU_MONITOR_AVAILABLE = True
except ImportError:
    GPU_MONITOR_AVAILABLE = False
# ==========================
# CONFIG
# ==========================
import torch

# Verify GPU availability
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {DEVICE}")
if DEVICE == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

DB_DIR = Path("embeddings_db")
DB_DIR.mkdir(exist_ok=True)

FAISS_PATH = DB_DIR / "index.faiss"
META_PATH = DB_DIR / "meta.json"

EMBEDDING_DIM = 512
ENROLL_IMAGES = 5

RECOGNITION_THRESHOLD = 0.65
LOCK_FRAMES = 1
OCCLUSION_LANDMARK_RATIO = 0.6

# Video Optimization
VIDEO_SCALE = 0.75  # Scale down frames for processing efficiency
FRAME_SKIP = 2  # Process every Nth frame (1 = process all). Increase to 2+ for higher display FPS
TARGET_FPS = 30  # Target frame rate for display
ALERT_COOLDOWN = 3  # Seconds between alerts

from PIL import Image, ImageTk
import tkinter as tk
from tkinter import ttk
from queue import Queue
import threading

root = tk.Tk()
root.title("Attendance System")

# Ensure a minimum window size and center the window on screen
min_w, min_h = 800, 800
root.minsize(min_w, min_h)

# Determine a starting geometry that is at least min size
screen_w = root.winfo_screenwidth()
screen_h = root.winfo_screenheight()
start_w = max(1280, min_w)
start_h = max(720, min_h)
start_x = int((screen_w - start_w) / 2)
start_y = int((screen_h - start_h) / 2)
root.geometry(f"{start_w}x{start_h}+{start_x}+{start_y}")
root.resizable(True, True)

# Video panel (centered and expandable)
panel = tk.Label(root, bg="black")
panel.pack(fill=tk.BOTH, expand=True, anchor=tk.CENTER)

# Alert queue for non-blocking notifications
alert_queue = Queue()
last_alert_time = {"occlusion": 0}
def ask_person_name():
    """
    Modal Tkinter dialog to ask for person name.
    Returns string or None if cancelled.
    """
    result = {"name": None}

    dialog = tk.Toplevel()
    dialog.title("Enroll New Person")
    dialog.geometry("300x140")
    dialog.resizable(False, False)
    dialog.grab_set()  # modal

    ttk.Label(dialog, text="Enter person's name:").pack(pady=10)

    name_var = tk.StringVar()
    entry = ttk.Entry(dialog, textvariable=name_var, width=30)
    entry.pack()
    entry.focus()

    def submit():
        name = name_var.get().strip()
        if name:
            result["name"] = name
            dialog.destroy()

    def cancel():
        dialog.destroy()

    btn_frame = ttk.Frame(dialog)
    btn_frame.pack(pady=10)

    ttk.Button(btn_frame, text="OK", command=submit).pack(side="left", padx=5)
    ttk.Button(btn_frame, text="Cancel", command=cancel).pack(side="left", padx=5)

    dialog.wait_window()
    return result["name"]
def tk_alert(message, title="Instruction", blocking=True):
    """Show alert dialog. If blocking=False, queues it for non-blocking display."""
    if not blocking:
        alert_queue.put((message, title))
        return
    
    dialog = tk.Toplevel()
    dialog.title(title)
    dialog.geometry("360x120")
    dialog.resizable(False, False)
    dialog.grab_set()

    ttk.Label(dialog, text=message, wraplength=330, justify="center").pack(pady=20)
    ttk.Button(dialog, text="OK", command=dialog.destroy).pack()

    dialog.wait_window()

def process_alert_queue():
    """Process queued alerts without blocking video."""
    if not alert_queue.empty():
        message, title = alert_queue.get()
        # Non-modal alert
        dialog = tk.Toplevel()
        dialog.title(title)
        dialog.geometry("360x120")
        dialog.resizable(False, False)
        # No grab_set() - allows video to continue
        
        ttk.Label(dialog, text=message, wraplength=330, justify="center").pack(pady=20)
        ttk.Button(dialog, text="OK", command=dialog.destroy).pack()
        
        # Auto-close after 2 seconds
        dialog.after(2000, dialog.destroy)


# ==========================
# FACE SYSTEM
# ==========================
class FaceSystem:
    def __init__(self):
        print("[FaceSystem] Initializing FaceAnalysis with GPU support...")
        
        # Configure ONNX Runtime for GPU
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=[
                "CUDAExecutionProvider",  # GPU - prioritized
                "CPUExecutionProvider"    # CPU - fallback
            ],
            allowed_modules=None
        )

        # Initialize with GPU context (ctx_id=0 is GPU 0)
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        print(f"[FaceSystem] FaceAnalysis initialized with GPU context")

        self.index = faiss.IndexFlatIP(EMBEDDING_DIM)
        self.meta = {}

        if FAISS_PATH.exists():
            self.index = faiss.read_index(str(FAISS_PATH))
            self.meta = json.load(open(META_PATH))
            print(f"[FaceSystem] Loaded FAISS index with {self.index.ntotal} entries")
    def estimate_yaw(self, face):
        """
        Estimate yaw using nose deviation from eye center.
        Robust for InsightFace landmarks.
        """
        if face.kps is None:
            return 0.0

        kps = face.kps

        left_eye = kps[0]
        right_eye = kps[1]
        nose = kps[2]

        eye_center_x = (left_eye[0] + right_eye[0]) / 2.0
        face_width = abs(right_eye[0] - left_eye[0]) + 1e-6

        yaw_ratio = (nose[0] - eye_center_x) / face_width
        yaw_deg = yaw_ratio * 90.0  # empirical scaling

        return yaw_deg

    # ======================
    # UTILS
    # ======================
    
    @staticmethod
    def normalize(v):

        return v / np.linalg.norm(v)

    def save(self):
        faiss.write_index(self.index, str(FAISS_PATH))
        json.dump(self.meta, open(META_PATH, "w"), indent=2)

    # ======================
    # OCCLUSION DETECTION
    # ======================
    def occlusion_score(self, face):
        if face.kps is None:
            return 1.0
        visible = np.count_nonzero(face.kps[:, 0] > 0)
        return visible / face.kps.shape[0]

    # ======================
    # ENROLLMENT
    # ======================
    def enroll(self, name, embeddings):
        if len(embeddings) < ENROLL_IMAGES:
            raise ValueError("Not enough valid face samples")

        centroid = self.normalize(np.mean(embeddings, axis=0))
        self.index.add(centroid.reshape(1, -1))

        self.meta[str(self.index.ntotal - 1)] = {
            "name": name
        }

        self.save()
    """
    def enroll(self, name, frames):
        embeddings = []

        for img in frames:
            faces = self.app.get(img)
            if len(faces) != 1:
                continue
            emb = self.normalize(faces[0].normed_embedding)
            embeddings.append(emb)
        

        if len(embeddings) < ENROLL_IMAGES:
            raise ValueError("Not enough valid face samples")

        centroid = self.normalize(np.mean(embeddings, axis=0))
        self.index.add(centroid.reshape(1, -1))

        self.meta[str(self.index.ntotal - 1)] = {
            "name": name
        }

        self.save()
        """
    # ======================
    # RECOGNITION
    # ======================
    def recognize(self, emb):
        if self.index.ntotal == 0:
            return None, 1.0

        emb = self.normalize(emb).reshape(1, -1)
        scores, ids = self.index.search(emb, 1)

        score = scores[0][0]
        idx = str(ids[0][0])

        if score >= RECOGNITION_THRESHOLD:
            return self.meta[idx]["name"], score

        return None, score


# ==========================
# TEMPORAL TRACKER
# ==========================
class IdentityTracker:
    def __init__(self):
        self.locked_name = None
        self.lock_counter = 0
        self.emb_history = deque(maxlen=10)
        self.last_occlusion_alert = 0
        # Cache last face result for skipped frames
        self.cached_result = None

    def update(self, name):
        if name:
            self.locked_name = name
            self.lock_counter = LOCK_FRAMES
        elif self.lock_counter > 0:
            self.lock_counter -= 1
        else:
            self.locked_name = None

        return self.locked_name
    
    def set_cache(self, face_data):
        """Cache face detection result for skipped frames."""
        self.cached_result = face_data
    
    def get_cache(self):
        """Get cached face detection result."""
        return self.cached_result
POSE_SEQUENCE = [
    ("FRONT", 1),
    ("LEFT", 2),
    ("RIGHT", 2),
]

# ==========================
# FACE SELECTION
# ==========================
def select_closest_face(faces):
    """
    Select the largest face (closest to camera) from detected faces.
    Uses bounding box area as proximity metric.
    """
    if not faces:
        return None
    return max(
        faces,
        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
    )

def enroll_via_keyboard(system, cam):
    name = ask_person_name()
    if not name:
        return

    tk_alert(
        "Enrollment will capture 5 images:\n"
        "• Face front\n"
        "• Turn left\n"
        "• Turn right\n\n"
        "Follow on-screen instructions.",
        "Enrollment"
    )

    collected = []
    pose_index = 0
    captured_for_pose = 0

    last_instruction = None

    while len(collected) < ENROLL_IMAGES:
        ret, frame = cam.read()
        if not ret:
            continue

        faces = system.app.get(frame)
        face = select_closest_face(faces)
        if not face:
            continue

        # Quality gate ONLY
        if system.occlusion_score(face) < OCCLUSION_LANDMARK_RATIO:
            continue

        pose_label, required_count = POSE_SEQUENCE[pose_index]

        if last_instruction != pose_label:
            tk_alert(f"Please face {pose_label}")
            last_instruction = pose_label

        #collected.append(frame.copy())
        embedding = system.normalize(face.normed_embedding)
        collected.append(embedding)
        captured_for_pose += 1
        print(f"[ENROLL] {pose_label}: {captured_for_pose}/{required_count}")

        time.sleep(0.25)

        if captured_for_pose >= required_count:
            pose_index += 1
            captured_for_pose = 0

        if pose_index >= len(POSE_SEQUENCE):
            pose_index = len(POSE_SEQUENCE) - 1  # clamp

    system.enroll(name, collected)
    tk_alert(f"{name} successfully registered!", "Success")




# ==========================
# MAIN LOOP
# ==========================
def main():
    cam = openCam()
    system = FaceSystem()
    tracker = IdentityTracker()
    pressed_keys = set()
    frame_count = 0
    
    # FPS control
    frame_time = 1.0 / TARGET_FPS
    last_process_time = time.time()

    def on_key(event):
        pressed_keys.add(event.char.lower())

    root.bind("<Key>", on_key)

    while True:
        loop_start = time.time()
        
        ret, frame = cam.read()
        if not ret:
            break

        frame_count += 1
        display_frame = frame.copy()
        
        # Implement FRAME_SKIP: only process face detection every Nth frame
        should_process = (frame_count % FRAME_SKIP == 0)
        
        if should_process:
            # Scale frame for faster processing
            process_frame = cv2.resize(frame, (0, 0), fx=VIDEO_SCALE, fy=VIDEO_SCALE)
            faces = system.app.get(process_frame)
            face = select_closest_face(faces)
            
            # Cache the result
            if face:
                box = (face.bbox / VIDEO_SCALE).astype(int)
                occ_score = system.occlusion_score(face)
                emb = face.normed_embedding
                name, conf = system.recognize(emb)
                locked = tracker.update(name)
                
                # Cache for skipped frames
                tracker.set_cache({
                    'box': box,
                    'occ_score': occ_score,
                    'locked': locked
                })
            else:
                tracker.set_cache(None)
        
        # Use cached result for display
        cached = tracker.get_cache()
        face = cached

        if face:
            # Use cached face data
            box = face['box']
            occ_score = face['occ_score']
            locked = face['locked']

            # Draw
            color = (0, 255, 0) if locked else (0, 0, 255)
            label = locked if locked else "Unknown"

            cv2.rectangle(display_frame, box[:2], box[2:], color, 2)
            cv2.putText(display_frame, label, (box[0], box[1] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

            # Occlusion alert (non-blocking)
            if occ_score < OCCLUSION_LANDMARK_RATIO:
                cv2.rectangle(display_frame, box[:2], box[2:], (0, 0, 255), 2)
                cv2.putText(display_frame, "REMOVE OBSTRUCTION",
                            (box[0], box[3] + 25),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                            (0, 0, 255), 2)

                now = time.time()
                if now - last_alert_time["occlusion"] > ALERT_COOLDOWN:
                    last_alert_time["occlusion"] = now
                    tk_alert("Face is partially blocked.\nPlease remove mask / hand / object.",
                            "Occlusion Detected", blocking=False)


        # Process any queued alerts
        process_alert_queue()
        
        # Optimize: Efficient image conversion and display
        rgb = cv2.cvtColor(display_frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
        imgtk = ImageTk.PhotoImage(image=img)
        panel.imgtk = imgtk  # Store reference to prevent garbage collection
        panel.configure(image=imgtk)
        
        # Handle keyboard input
        if 'r' in pressed_keys:
            pressed_keys.clear()
            enroll_via_keyboard(system, cam)

        if 'q' in pressed_keys:
            break
        
        # Update GUI (non-blocking)
        root.update_idletasks()
        root.update()
        
        # Frame rate limiting for smooth display
        elapsed = time.time() - loop_start
        sleep_time = frame_time - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

    cam.release()
    root.destroy()

    

if __name__ == "__main__":
    # Print GPU information at startup
    if GPU_MONITOR_AVAILABLE:
        print_gpu_info()
    
    main()
