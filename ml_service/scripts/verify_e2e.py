"""
End-to-End API Verification Script
Tests ML service health, face enrollment, websocket recognition, and re-enrollment pipeline.
"""
import asyncio
import base64
import json
import os
import sys
from pathlib import Path
import websockets
import requests

# Ensure imports resolve when running from ml_service folder
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

ML_SERVICE_URL = "http://localhost:8000"
BACKEND_URL = "http://localhost:3000"
WS_URL = "ws://localhost:8000/ws/recognize"
ENROLL_IMAGE_PATH = Path("scripts/enroll_test.jpg")
TEST_IMAGE_PATH = Path("scripts/test_face_frame.jpg")

def test_rest_endpoints():
    print("\n--- Testing ML Service Rest Endpoints ---")
    try:
        # 1. Health check
        res = requests.get(f"{ML_SERVICE_URL}/health")
        print(f"GET /health status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
        
        # 2. Collection stats
        res = requests.get(f"{ML_SERVICE_URL}/collection/stats")
        print(f"GET /collection/stats status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
    except Exception as e:
        print(f"REST endpoints test failed: {e}")

def enroll_test_employee(emp_id="EMP101", name="E2E Test Employee"):
    print(f"\n--- Enrolling Test Employee: {name} ({emp_id}) ---")
    if not ENROLL_IMAGE_PATH.exists():
        print(f"Error: Enrollment image not found at {ENROLL_IMAGE_PATH}")
        return False
        
    # We upload 3 copies of the enrollment image
    files = []
    file_handles = []
    try:
        for i in range(3):
            fh = open(ENROLL_IMAGE_PATH, "rb")
            file_handles.append(fh)
            files.append(("files", (f"enroll_{i}.jpg", fh, "image/jpeg")))
            
        data = {
            "emp_id": emp_id,
            "name": name
        }
        
        url = f"{BACKEND_URL}/api/enroll"
        print(f"Sending POST to {url}...")
        res = requests.post(url, data=data, files=files)
        print(f"Response status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
        return res.status_code in (200, 201)
    except Exception as e:
        print(f"Enrollment request failed: {e}")
        return False
    finally:
        for fh in file_handles:
            fh.close()

def fetch_enrolled_employees():
    print("\n--- Fetching enrolled employees from Backend ---")
    try:
        res = requests.get(f"{BACKEND_URL}/api/employees")
        print(f"GET /api/employees status: {res.status_code}")
        if res.status_code == 200:
            employees = res.json()
            print(f"Enrolled employees count: {len(employees)}")
            for emp in employees:
                print(f"  - ID: {emp['emp_id']}, Name: {emp['name']}, MilvusID: {emp['milvus_id']}")
            return employees
        else:
            print(f"Failed to fetch employees: {res.text}")
    except Exception as e:
        print(f"Backend communication failed: {e}")
    return []

async def test_websocket_recognition(image_path):
    print(f"\n--- Testing WebSocket Liveness & Recognition on {image_path.name} ---")
    if not image_path.exists():
        print(f"Error: Test image not found at {image_path}")
        return
        
    with open(image_path, "rb") as image_file:
        img_base64 = base64.b64encode(image_file.read()).decode('utf-8')
        
    print(f"Connecting to WebSocket: {WS_URL}")
    try:
        async with websockets.connect(WS_URL) as ws:
            print("Connected successfully. Sending 3 recognize requests sequentially (1.6s interval)...")
            req = {
                "type": "recognize",
                "image": img_base64
            }
            
            for i in range(3):
                print(f"Sending frame {i+1}/3...")
                await ws.send(json.dumps(req))
                response = await ws.recv()
                res_data = json.loads(response)
                print(f"Response {i+1}:")
                print(json.dumps(res_data, indent=2))
                # Delay of 1.6s to clear UNKNOWN_SUPPRESSION_SECONDS = 1.5s
                if i < 2:
                    await asyncio.sleep(1.6)
                
    except Exception as e:
        print(f"WebSocket test failed: {e}")

def test_re_enrollment(emp_id):
    print(f"\n--- Testing Re-enrollment for employee: {emp_id} ---")
    if not ENROLL_IMAGE_PATH.exists():
        print(f"Error: Enrollment image not found at {ENROLL_IMAGE_PATH}")
        return
        
    # We send 3 images for re-enrollment
    files = []
    file_handles = []
    try:
        for i in range(3):
            fh = open(ENROLL_IMAGE_PATH, "rb")
            file_handles.append(fh)
            files.append(("files", (f"re_enroll_{i}.jpg", fh, "image/jpeg")))
            
        data = {"emp_id": emp_id}
        
        url = f"{BACKEND_URL}/api/re-enroll"
        print(f"Sending POST to {url}...")
        res = requests.post(url, data=data, files=files)
        print(f"Response status: {res.status_code}")
        print(json.dumps(res.json(), indent=2))
    except Exception as e:
        print(f"Re-enrollment failed: {e}")
    finally:
        for fh in file_handles:
            fh.close()

def delete_test_employee(emp_id):
    print(f"\n--- Deleting Test Employee: {emp_id} ---")
    try:
        url = f"{BACKEND_URL}/api/employees/{emp_id}"
        print(f"Sending DELETE to {url}...")
        res = requests.delete(url)
        print(f"Response status: {res.status_code}")
    except Exception as e:
        print(f"Delete failed: {e}")

def main():
    # 1. Check health & stats
    test_rest_endpoints()
    
    # 2. Check if we already have employees
    employees = fetch_enrolled_employees()
    
    # If the test employee already exists, delete it first to ensure clean state
    for emp in employees:
        if emp['emp_id'] == "EMP101":
            delete_test_employee("EMP101")
            employees = fetch_enrolled_employees()
            break
            
    # 3. Enroll a test employee
    enrolled = enroll_test_employee("EMP101", "E2E Test Employee")
    if enrolled:
        # Refresh employees list
        employees = fetch_enrolled_employees()
            
    # 4. Test WebSocket recognition on the enrollment image (should succeed by frame 3!)
    asyncio.run(test_websocket_recognition(ENROLL_IMAGE_PATH))
    
    # 5. Test re-enrollment if we have employees
    if employees:
        target_emp = "EMP101"
        test_re_enrollment(target_emp)
        
        # Test recognition again after re-enrollment to make sure collapsing still works
        print("\n--- Testing WebSocket Recognition again after Re-enrollment ---")
        asyncio.run(test_websocket_recognition(ENROLL_IMAGE_PATH))
        
        # Fetch stats again to see new count
        print("\n--- Final Collection Stats ---")
        try:
            res = requests.get(f"{ML_SERVICE_URL}/collection/stats")
            print(json.dumps(res.json(), indent=2))
        except Exception:
            pass
            
    # Clean up test employee
    delete_test_employee("EMP101")

if __name__ == "__main__":
    main()
