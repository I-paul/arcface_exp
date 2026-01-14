# Labor Attendance Project

This repo contains the final version of the Labor Attendance Project.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [API Documentation](#api-documentation)

## Overview
This project is designed to automate and streamline the attendance process for laborers. It leverages computer vision to identify individuals in real-time and logs their attendance into a centralized database via a secure REST API.

## Features
- **Real-time Face Recognition**: High-accuracy detection and recognition using InsightFace and FAISS.
- **Liveness/Occlusion Detection**: Alerts when faces are obstructed (masks, hands, etc.).
- **Automated Enrollment**: Simple keyboard-driven interface to register new users with multi-angle face capture.
- **Employee Management**: Full CRUD capabilities for employee records.
- **Secure Backend**: Node.js/Express server with PostgreSQL integration.

## Architecture
The project is divided into two main components:

1.  **Backend (`/Backend`)**:
    -   This folder contains the backend server and database.
2.  **Modelling (`/Modelling`)**:
    -   This folder contains the face recognition system and anti-spoofing system.

## Prerequisites
Ensure you have the following installed:
-   **Node.js** (v14+ recommended)
-   **Python** (v3.8+)
-   **PostgreSQL** (for the database)
-   **C++ Build Tools** (often required for installing InsightFace/dlib on Windows)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/labor-attendance.git
cd labor-attendance
```
2. Navigate to the backend directory and install dependencies:
```bash
cd Backend
npm install
```
*Note: Ensure you have a `.env` file configured with your database credentials (PORT, DB_HOST, etc.).*

3. Install python dependencies using the following command
```bash
pip install -r requirement.txt
```

## Usage

1. Start the Node.js backend server:

```bash
cd Backend
npm start
```
The server will typically run on `http://localhost:3000` (check console output).

2. Run the main Python script:
```bash
cd Modelling/main
python face_recognition_system.py
```

### App Controls
The desktop application supports the following keyboard shortcuts:
-   **`r`**: **Enroll** a new person. Follow the on-screen prompts to capture face angles (Front, Left, Right).
-   **`q`**: **Quit** the application.

## API Documentation
The backend exposes the following REST endpoints for employee management:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/employee` | Create a new employee |
| `GET` | `/api/employee` | Retrieve all employees |
| `GET` | `/api/employee/:id` | Get specific employee details |
| `PUT` | `/api/employee/:id` | Update employee information |
| `DELETE` | `/api/employee/:id` | Remove an employee |

---

