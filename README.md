# PACked

PACked is a full-stack project for the University of Waterloo Warrior Athletics facilities. It continuously scrapes live occupancy data from the official Facility Occupancy page, stores it in a local SQLite database, and uses that historical data to power an API and frontend that recommend the quietest times to work out around a student's class schedule.

## Architecture Overview

- **Scraper** (`scraper/`):
  - Uses `requests` to fetch `https://warrior.uwaterloo.ca/FacilityOccupancy` with a browser-like User-Agent.
  - Parses the server-rendered HTML with BeautifulSoup.
  - Writes one row per facility into a SQLite database (`occupancy.db` at the repo root).
- **Scheduler** (`scraper/scheduler.py`):
  - Uses APScheduler to run the scraper every 15 minutes.
  - Runs an immediate scrape at startup.
  - Logs an hourly heartbeat so you can confirm it is still running.
- **API** (`api/main.py`):
  - FastAPI application that reads from `occupancy.db`.
  - Endpoints:
    - `GET /api/occupancy/live` – most recent reading per facility.
    - `GET /api/occupancy/history` – historical readings with optional filters.
    - `GET /api/heatmap/{facility_name}` – 7×17 (days × hours) occupancy heatmap.
    - `POST /api/recommend` – best-time-to-go recommendations given a class schedule.
- **Frontend** (`frontend/`):
  - React + Vite + Tailwind CSS single-page app.
  - Views:
    - **Live View** – current occupancy for all six facilities, auto-refreshing.
    - **Heatmap View** – historical occupancy heatmap by day/hour for a selected facility.
    - **Schedule + Recommendations View** – paste your class schedule, select a facility, and see recommended quiet times.

All data and recommendations are based on the percentage occupancy (`occupancy_pct`) so that facilities with different capacities are comparable.

## Data Source

- Source: `https://warrior.uwaterloo.ca/FacilityOccupancy`
- The page is server-side rendered; all relevant data is present in the initial HTML.
- Each facility card exposes:
  - Facility name in `h2 > strong` inside `.occupancy-card-header`.
  - Current occupancy ratio, count, and remaining capacity in `canvas.occupancy-chart` `data-*` attributes.
  - Max capacity in `.max-occupancy strong`.

The scraper polls at most once every 15 minutes to avoid unnecessary load on the upstream site. This project is intended for personal/educational use only.

## Getting Started

### 1. Backend dependencies

From the project root:

```bash
pip install -r requirements.txt
# or, equivalently:
pip install requests beautifulsoup4 apscheduler fastapi uvicorn
```

### 2. Start the scraper scheduler

```bash
python scraper/scheduler.py
```

This will:
- Create `occupancy.db` at the project root on first run.
- Run an immediate scrape.
- Schedule subsequent scrapes every 15 minutes.
- Log an hourly heartbeat so you can see that it is still active.

Leave this process running for several days or weeks to accumulate historical data.

### 3. Start the FastAPI server

In a second terminal:

```bash
uvicorn api.main:app --reload --port 8000
```

You can then visit:
- API docs at `http://localhost:8000/docs`
- Live endpoints under `/api/...`

### 4. Start the frontend

In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

By default, Vite serves the frontend at `http://localhost:5173`.

## Frontend Features (Planned)

- **Live View**
  - Grid of cards, one per facility.
  - Shows percentage occupancy, raw count vs max, and a qualitative label (Very quiet → Packed).
  - Auto-refreshes every 2 minutes.

- **Heatmap View**
  - Facility selector dropdown.
  - 7 columns (days 0–6, Sunday–Saturday) by 17 rows (hours 6:00–22:00).
  - Cell colors from green → yellow → red based on average `occupancy_pct`.
  - Tooltips showing exact percentage and label, or “No data yet”.

- **Schedule + Recommendations View**
  - Text area for pasting **Quest (Waterloo) class schedules** (copy from Quest → Class Schedule, same workflow as UW Flow) or simple lines:
    - Quest paste: auto-parses `Days & Times` for LEC/TST/TUT/LAB (skips TBA/online-only rows; ignores withdrawn courses); the text area is replaced with one line per block (`Weekday HH:MM–HH:MM · course · LEC/TST/…`) for easy review and editing.
    - Manual: `Monday 9:00-10:30`, `Tuesday 13:00-14:30`, etc.
  - Client-side parser converts these to `schedule_blocks` JSON.
  - Calls `POST /api/recommend_split` and displays quietest unblocked time slots.
  - Shows a banner when fewer than 3 days of data exist in the DB:
    - “Not enough data yet for reliable recommendations — keep the scraper running! X readings collected so far.”

## Notes

- All time-slot bucketing and recommendations use the day index convention:
  - `0` = Sunday, `1` = Monday, ..., `6` = Saturday.
- Recommendations are only as good as the amount of data collected. For fresh installs, expect the heatmap and recommendations to improve over time as more scrapes accumulate.
- `AGENT.md` is the living log for this project; read it at the start of each session to understand current status, decisions, and next steps.

