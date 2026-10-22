# SkillSync (GripSense)

> **Real-Time Psychomotor Skill Intelligence & Procedure Training Platform**  
> Powered by Computer Vision (MediaPipe), Kinematic Feature Engineering, and Cognitive Skill-Decay Modeling.

---

## 📌 Overview

In high-stakes manual disciplines—including **surgical procedures**, **dental drilling**, and **electronics soldering**—novice errors often stem from subtle grip angle deviations, excessive tremor, and muscle fatigue. Traditional haptic simulators are prohibitively expensive ($50,000–$100,000+), while human instructors cannot monitor every trainee simultaneously.

**SkillSync** is a low-cost, camera-based precision training system that:
1. **Tracks 3D Hand Kinematics in Real Time** via 21 spatial landmarks without specialized wearable hardware.
2. **Enforces Procedural Sequences** through a constraint-driven state machine requiring exact spatial tolerance windows and hold dwell times.
3. **Detects Micro-Tremor & Fatigue** by analyzing landmark coordinate jitter and high-frequency coordinate variance over sliding time windows.
4. **Predicts Skill Decay** using an Ebbinghaus forgetting curve model personalized to each student's hesitation and stability metrics.
5. **Provides Instant Multi-Channel Feedback** with sub-second visual overlays, numerical guidance hints, and student retention telemetry.

---

## 🏗 Architecture

```
                                  ┌───────────────────────────────┐
                                  │      Camera Feed (Client)     │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │   MediaPipe Vision Pipeline   │
                                  │  (21 3D Spatial Landmarks)   │
                                  └───────────────┬───────────────┘
                                                  │ (WebSocket / IPC)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     SkillSync Core Backend                                      │
├───────────────────────────────┬───────────────────────────────┬─────────────────────────────────┤
│    Kinematic Feature Engine   │    Procedure State Machine    │    Stability & Fatigue Engine   │
│ - Joint angles (PIP, MCP)     │ - Step transition engine      │ - Coordinate variance & jitter  │
│ - Palm-normalized distances   │ - Multi-constraint validator  │ - Rest break recommendation     │
│ - Exponential smoothing       │ - Dwell-time completion check │ - Ebbinghaus decay predictor    │
└───────────────────────────────┴───────────────────────────────┴─────────────────────────────────┘
                                                  │
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │      Next.js Dashboard        │
                                  │  - 60 FPS Canvas Skeleton     │
                                  │  - Live Telemetry & Feedback  │
                                  │  - Student Retention Analytics│
                                  └───────────────────────────────┘
```

---

## ⚡ Key Features

- **Real-Time 3D Hand Tracking**: Captures 21 anatomical landmarks per hand at up to 60 FPS using MediaPipe Tasks Vision.
- **Biomechanical Angle & Distance Calculations**:
  - Wrist-index angle, thumb-index pinch distance, index-middle alignment, and elevation scalars.
  - Palm-normalized distance metrics invariant to distance from camera.
- **Constraint-Driven Procedure Engine**:
  - Declarative JSON schemas for procedures (e.g., Scalpel Handling / Surgical Knot Tying).
  - Difficulty modes: **Beginner** (wider tolerance windows) and **Intermediate** (strict surgical precision).
- **Fatigue & Tremor Analytics**:
  - Measures high-frequency landmark jitter to assess fine-motor stability.
  - Automatically flags fatigue spikes and suggests timed rest breaks.
- **Skill Retention & Decay Prediction**:
  - Models student memory retention: $S(t) = S_0 \cdot e^{-\lambda t}$.
  - Dynamically calculates decay factor $\lambda$ based on historical hesitation, tremor score, and repetition count to forecast when refresher training is due.
- **Responsive Dashboard**:
  - Real-time skeleton visualization with adaptive color coding (Good / Warn / Bad).
  - Camera switching support for mobile, webcams, and external document cameras.
  - Fullscreen stage mode with telemetry indicators.

---

## 🛠 Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Backend & API** | Python 3.10+, FastAPI, Uvicorn, WebSockets, Pydantic v2 |
| **Computer Vision** | MediaPipe Tasks Vision, OpenCV, NumPy |
| **Frontend UI** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons |
| **Storage & Persistence**| SQLite (Session records, student profiles, performance metrics) |
| **Math & Algorithms** | Ebbinghaus Skill Decay Modeling, Exponential Moving Average (EMA) smoothing |

---

## 📂 Project Structure

```text
SkillSync/
├── backend/
│   ├── app/
│   │   ├── core/                    # Core database and application settings
│   │   ├── features/
│   │   │   ├── hand_tracking/       # MediaPipe CV pipeline & feature extraction (angles, distances)
│   │   │   ├── health/              # Health endpoints and diagnostic checks
│   │   │   ├── procedure_intelligence/ # State machine, rules, scoring, fatigue & decay predictor
│   │   │   └── realtime_feedback/   # WebSocket streaming pipeline & schemas
│   │   ├── main.py                  # FastAPI application entry point
│   │   └── shared/                  # Common exceptions, models, and utilities
│   ├── tests/                       # Pytest automated test suite
│   ├── requirements.txt             # Python backend dependencies
│   └── README.md                    # Backend documentation
├── frontend/
│   ├── app/                         # Next.js App Router (HomePageClient, layout, page)
│   ├── features/
│   │   ├── hand-tracking/           # Camera feed, canvas overlay, useCamera hook
│   │   ├── realtime-feedback/       # Telemetry metrics & feedback panels
│   │   └── step-tracker/            # Procedural step checklist UI
│   ├── shared/                      # React contexts, constants, and TypeScript types
│   ├── styles/                      # Global styles and stage animations
│   ├── package.json                 # Node dependencies and scripts
│   └── README.md                    # Frontend documentation
├── Problem.md                       # Background research and clinical problem statement
├── features.md                      # Detailed system feature breakdown & deliverables
├── techstack.md                     # Technology stack documentation
├── .gitignore                       # Clean Git exclusion rules
└── README.md                        # Master repository documentation
```

---

## 🚀 Getting Started

### Prerequisites

- **Python**: 3.10 or higher
- **Node.js**: 18.x or higher
- **Webcam**: Standard USB or built-in webcam

---

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# On Windows PowerShell:
.venv\Scripts\Activate.ps1
# On macOS/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will start at `http://localhost:8000`. You can test the health endpoint at `http://localhost:8000/health`.

---

### 2. Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```

Open `http://localhost:3000` in your browser. Grant camera access when prompted.

---

## 🧪 Running Tests

To verify backend modules and feature pipelines:

```bash
cd backend
pytest tests/ -v
```

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
