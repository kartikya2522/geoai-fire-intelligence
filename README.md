# 🔥 GeoAI Fire Intelligence

### AI-Powered Wildfire Severity Prediction & Emergency Response System

[![Python](https://img.shields.io/badge/Python-3.11-blue?style=flat-square&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![ML](https://img.shields.io/badge/ML-Gradient%20Boosting-orange?style=flat-square)](https://scikit-learn.org)
[![NIMS](https://img.shields.io/badge/Standards-NIMS%20Compliant-red?style=flat-square)](https://www.fema.gov/nims)

---

## The Problem

Every year, wildfires burn millions of acres across California and cost billions of dollars in damage. The 2018 Camp Fire alone killed **85 people** and destroyed over 18,000 structures. The 2020 fire season burned **10.3 million acres** — the worst on record.

Incident commanders must make life-or-death resource allocation decisions — how many engines, helicopters, and personnel to deploy — under extreme time pressure with incomplete information.

**A wrong call in the first 72 hours can be the difference between a contained incident and a catastrophic megafire.**

GeoAI Fire Intelligence gives commanders an instant, data-driven severity prediction so the right resources reach the right place before the window closes.

---

## What It Does

| Feature | Description |
|---|---|
| 🎯 **Severity Prediction** | Classifies wildfire as LOW / MEDIUM / HIGH with confidence score and probability breakdown |
| 🧠 **Explainable AI** | Feature importance shows exactly which factors drove the model's decision |
| 🔮 **What-If Simulator** | Live sliders — adjust containment %, personnel, engines and see risk update in real time |
| 🚒 **Resource Deployment** | NIMS-standard resource recommendations per incident complexity type |
| 📡 **Emergency Alert System** | Dispatches government-level HTML email + SMS to authorities on HIGH detection |
| 🗺️ **Fire Intelligence Map** | 1,636 California incidents with firebreak zones drawn from predictions |
| 🌿 **Carbon Impact Calculator** | CO₂ released, trees destroyed, reforestation cost vs prevention cost |
| 📄 **Incident Report Generator** | One-click formal 9-section report — copy or download as .txt |
| 📊 **Analytics Dashboard** | Real statistics computed from dataset — nothing hardcoded |

---

## Emergency Alert System — Our USP

No existing emergency notification system combines all of these in a single automated alert. When HIGH severity is detected, GeoAI dispatches an email containing:

- **⏱ Predictive Spread Window** — AI-computed time estimate until fire doubles, based on containment % and historical CAL FIRE patterns
- **📊 Resource Gap Analysis** — live comparison of deployed resources vs NIMS federal minimum standards, flags shortfalls in red with exact numbers needed
- **🌍 Bilingual Instructions** — automatic English + Spanish resident evacuation guidance (39% of California's population is Spanish-speaking)
- **📱 QR Code** — embedded, scannable, opens exact fire coordinates in Google Maps instantly — no URL to type
- **✅ I Am Safe Check-In** — one-click pre-filled safety confirmation email, zero backend infrastructure needed
- **🌿 Carbon Impact** — environmental cost of the fire inline: CO₂, trees, reforestation cost vs prevention cost
- **🏥 Nearest Hospitals** — pre-loaded Google Maps search near fire coordinates
- **🆔 Shared Incident ID** — same ID across email and SMS for cross-channel tracking

SMS alert also dispatched simultaneously via Twilio with map link, shelter finder, and NIMS classification.

---

## Tech Stack

```
ML Pipeline            FastAPI Backend         React 19 Frontend
────────────           ───────────────         ─────────────────
Python 3.11            FastAPI                 React 19 + Vite
scikit-learn           Uvicorn                 React Leaflet Maps
XGBoost                Pydantic v2             Chart.js
Gradient Boosting      python-dotenv           GSAP + ScrollTrigger
SMOTE Balancing        Twilio (SMS)            Glassmorphism CSS
pandas / numpy         Gmail SMTP              Syne + DM Sans fonts
joblib                 qrcode (QR API)
```

---

## System Architecture

```
┌──────────────────────┐      HTTP/REST       ┌──────────────────────┐
│   React 19           │ ◄──────────────────► │   FastAPI            │
│   Frontend           │                      │   Backend            │
│   localhost:5173     │                      │   localhost:8000     │
└──────────────────────┘                      └──────────┬───────────┘
                                                         │
                                           ┌─────────────▼────────────┐
                                           │   ML Prediction Engine   │
                                           │   Gradient Boosting      │
                                           │   Trained on 1,636 CA    │
                                           │   wildfire incidents     │
                                           │   72.3% accuracy         │
                                           │   82.1% CV F1 (5-fold)  │
                                           └──────────────────────────┘
                                                         │
                              ┌──────────────────────────┼─────────────────────────┐
                              │                          │                         │
                   ┌──────────▼──────────┐  ┌───────────▼──────────┐  ┌───────────▼──────────┐
                   │  Gmail SMTP         │  │  Twilio SMS          │  │  1,636 CA Incidents  │
                   │  HTML Alert Email   │  │  Emergency Alert     │  │  Geospatial Map      │
                   └─────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

---

## ML Model

Trained on **1,636 real California wildfire incidents** from the CAL FIRE public dataset.

Three models trained and compared — Random Forest, XGBoost, and Gradient Boosting — using 80/20 stratified split with 5-fold cross-validation. **Gradient Boosting selected** based on highest CV F1 score, indicating best generalisation to unseen fires.

| Metric | Value |
|---|---|
| Algorithm | Gradient Boosting (scikit-learn) |
| Training Set | 1,308 incidents (80%) |
| Test Set | 328 incidents (20%) |
| Accuracy | 72.3% |
| F1 Weighted | 0.739 |
| CV F1 Mean (5-fold) | 82.1% ± 1.7% |
| Class Balancing | SMOTE on training data only |

**Why accuracy dropped after SMOTE:** SMOTE synthetically oversamples HIGH and MEDIUM classes (originally 97 and 207 vs 1,332 LOW), forcing the model to learn harder boundaries. Raw accuracy decreases slightly but cross-validation F1 jumps — meaning it generalises significantly better to real unseen fires. CV F1 of 82.1% is the honest metric.

**Target classes:**
- `LOW` — < 1,000 acres
- `MEDIUM` — 1,000–10,000 acres
- `HIGH` — > 10,000 acres

**Top predictive features (from model's global feature importances):**

| Feature | Importance |
|---|---|
| County | 28.8% |
| Longitude | 24.4% |
| Latitude | 22.1% |
| Major Incident Flag | 6.6% |
| Containment Efficiency | 3.8% |
| Engines Deployed | 3.2% |
| Resource Intensity | 2.9% |

Geographic features dominate because California wildfire severity is heavily terrain and vegetation dependent — certain counties consistently produce larger fires due to wind patterns, fuel load, and topography. The model learned this correctly.

---

## Project Structure

```
geoai-fire-intelligence/
│
├── ml/
│   ├── preprocessing.py      # Data cleaning, feature engineering, IQR capping
│   ├── train.py              # 3-model training, SMOTE balancing, model selection
│   └── predict.py            # WildfirePredictor class, smoke test
│
├── api/
│   ├── main.py               # FastAPI — 8 endpoints + CORS
│   ├── alert_engine.py       # Gmail SMTP + Twilio SMS alert dispatcher
│   └── report_generator.py   # 9-section incident report generator
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Landing.jsx       # Problem statement + GSAP animations
│       │   ├── Dashboard.jsx     # Prediction form + result tabs
│       │   ├── Map.jsx           # Leaflet map page
│       │   └── Analytics.jsx     # Charts + statistics
│       ├── components/
│       │   ├── RiskCard.jsx           # Risk level + probabilities
│       │   ├── WildfireMap.jsx        # Leaflet map + firebreak zones
│       │   ├── AlertBanner.jsx        # Audio + visual HIGH alarm
│       │   ├── FeatureImportance.jsx  # Explainable AI bars
│       │   ├── ResourceRecommendation.jsx  # NIMS deployment guide
│       │   ├── CarbonImpact.jsx       # Environmental cost calculator
│       │   ├── SendAlert.jsx          # Email + SMS dispatch UI
│       │   └── IncidentReport.jsx     # Report generator UI
│       ├── hooks/
│       │   └── usePrediction.js       # Axios API calls + error handling
│       └── styles/
│           └── glassmorphism.css      # Full dark design system
│
├── data/
│   └── raw/
│       └── California_Fire_Incidents.csv   # 1,636 incidents, 40 columns
│
├── models/                   # Generated by running ml/train.py
│   ├── best_model.pkl
│   ├── scaler.pkl
│   ├── label_encoder.pkl
│   └── model_report.json
│
├── requirements.txt
└── .env.template
```

---

## Setup & Run

### Prerequisites
- Python 3.11+
- Node.js 18+

### 1. Clone the repository
```bash
git clone https://github.com/kartikya2522/geoai-fire-intelligence.git
cd geoai-fire-intelligence
```

### 2. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 3. Run the ML pipeline
```bash
python ml/preprocessing.py    # Clean data → data/processed/clean_fire_data.csv
python ml/train.py             # Train 3 models → models/*.pkl + model_report.json
python ml/predict.py           # Smoke test — verify 4 scenarios predict correctly
```

### 4. Configure environment variables
```bash
cp .env.template .env
# Open .env and fill in your credentials (see Environment Variables below)
```

### 5. Start the API
```bash
python -m uvicorn api.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`

### 6. Start the frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/predict` | Wildfire severity prediction with feature importances |
| `GET` | `/incidents` | All 1,636 fire incidents for map rendering |
| `GET` | `/analytics` | Real aggregated statistics from dataset |
| `GET` | `/model-info` | Model metrics and comparison data |
| `GET` | `/recommend-resources` | NIMS resource recommendation by risk level |
| `POST` | `/send-alert` | Dispatch email + SMS emergency alert |
| `POST` | `/generate-report` | Generate 9-section incident report |
| `POST` | `/alert` | Alert status check |

Full interactive documentation at `http://localhost:8000/docs`

---

## Environment Variables

```env
# Gmail Alerts (required for email)
GMAIL_SENDER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   # Google App Password, not your regular password

# Alert Recipients
ALERT_EMAILS=authority@fire.gov,commander@example.com
ALERT_PHONES=+1xxxxxxxxxx,+1xxxxxxxxxx   # E.164 format, must be Twilio-verified on trial

# Twilio SMS (optional — email works without this)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_FROM=+1xxxxxxxxxx

# Optional enhancements
OPENWEATHER_API_KEY=xxxxxxxxxxxxxxxx    # Live wind data in alerts
ANTHROPIC_API_KEY=sk-ant-xxxxxxx       # AI-generated incident reports (upgrade)
```

---

## NIMS Resource Standards

All deployment recommendations follow **NIMS Incident Complexity Typing** — the actual US federal standard published by FEMA/DHS and used by CAL FIRE and the US Forest Service. Not dataset averages, not made-up numbers — the real federal framework.

| Risk | NIMS Type | Personnel | Engines | Helicopters | Dozers | Water Tenders |
|---|---|---|---|---|---|---|
| LOW | Type 5 — Initial Attack | 25–100 | 5–15 | 1–3 | 0–2 | 1–4 |
| MEDIUM | Type 3 — Extended Attack | 100–500 | 15–50 | 3–8 | 2–6 | 4–12 |
| HIGH | Type 1 — Major Incident | 500–1,000 | 50–100 | 8–20 | 6–15 | 12–25 |

---

## Demo Scenarios

Load these from the scenario presets on the Predict page:

| Scenario | Containment | Personnel | Expected Result |
|---|---|---|---|
| Minor Brush Fire | 75% | 25 | LOW — 97.9% confidence |
| Growing Moderate Fire | 30% | 150 | MEDIUM — 52.6% confidence |
| Critical Major Incident | 5% | 800 | HIGH — 94.8% confidence |
| Nearly Contained | 95% | 80 | LOW — 98.8% confidence |

**Best demo sequence:** Load Critical Major Incident → Predict → open 🔮 Simulate tab → drag Containment % from 5% up to 75% slowly — watch risk drop from HIGH → MEDIUM → LOW in real time with live probability bars updating.

---

## Key Design Decisions

| Decision | Reasoning |
|---|---|
| Classifier not regressor | Predicting LOW/MEDIUM/HIGH directly gives proper F1 metrics per class; regression with thresholds is dishonest |
| SMOTE on training only | Test set never touched — metrics are honest; synthetic samples only in training to fix 1,332 vs 97 imbalance |
| NIMS for resources | 88% of resource columns in dataset were imputed NaN — using dataset medians would give meaningless numbers |
| Template report over AI | Anthropic API requires paid credits; template produces consistent, structured output instantly |
| California bounds enforced | Model trained on CA data only — accepting global coordinates would give meaningless predictions |
| Global feature importances | Per-prediction SHAP values are roadmap; global weights correctly disclosed as such in UI |

---

## Roadmap

- [ ] SHAP values for per-prediction explainability (local, not global)
- [ ] Wind data integration when OpenWeatherMap key activates (code ready, feature built)
- [ ] AI-generated incident reports via Anthropic API (endpoint built, needs $5 credits)
- [ ] Multi-region support — retrain on Australian and Portuguese fire datasets
- [ ] SMS to unverified numbers (requires Twilio paid account upgrade, $1)
- [ ] Prediction history logging to SQLite

---

## Built With

This project demonstrates end-to-end production ML system design — from raw CSV to deployed 3-tier application — with a focus on real-world utility over academic benchmarks. Every number in the dashboard is computed from real data. Every feature exists because it solves a real problem faced by fire incident commanders.

---

<div align="center">
  <strong>GeoAI Fire Intelligence</strong><br/>
  Because every hour in a wildfire counts.
</div>
