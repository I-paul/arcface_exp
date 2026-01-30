"""
Configuration profiles for face preprocessing

Different thresholds for enrollment vs recognition to balance
strictness with usability.
"""

# Preprocessing profiles
PROFILES = {
    "enroll": {
        "blur_min": 100.0,  # Stricter for enrollment
        "pose_max": 20.0,  # degrees
        "brightness_min": 30.0,
        "brightness_max": 225.0,
        "face_min_size": 50,  # pixels
    },
    "recognize": {
        "blur_min": 80.0,  # More lenient for recognition
        "pose_max": 25.0,  # degrees
        "brightness_min": 20.0,
        "brightness_max": 235.0,
        "face_min_size": 40,  # pixels
    },
}

# ArcFace standard face size
FACE_SIZE = (112, 112)

# Reference landmarks for alignment (ArcFace template)
# Normalized coordinates for 112x112 face
ARCFACE_SRC = [
    [38.2946, 51.6963],  # Left eye
    [73.5318, 51.5014],  # Right eye
    [56.0252, 71.7366],  # Nose tip
    [41.5493, 92.3655],  # Left mouth corner
    [70.7299, 92.2041],  # Right mouth corner
]
