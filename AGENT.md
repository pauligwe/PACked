Warrior Gym Tracker is a full-stack app that scrapes live occupancy data for the University of Waterloo Warrior Athletics facilities, stores it in a local SQLite database, and exposes APIs plus a React/Tailwind frontend so students can find the quietest times to go to the gym around their class schedules.

## Current Project Phase
- Phase 1 – Scraper + Database setup (initial structure and tooling).

## What Was Just Completed
- Initial implementation of the overall project plan (see `.cursor/plans/warrior-gym-tracker-core_f18d25cb.plan.md`).
- Defined high-level folder structure and responsibilities for `scraper/`, `api/`, and `frontend/`.

## What Is In Progress
- Setting up base folder structure:
  - Creating `AGENT.md` and `README.md` at the repo root.
  - Creating `scraper/`, `api/`, and `frontend/` directories.
  - Preparing to implement the scraper and scheduler.

## What Is Next in the Queue
1. Implement `scraper/scraper.py`:
   - Create SQLite DB (`occupancy.db`) in repo root with `readings` table.
   - Scrape `https://warrior.uwaterloo.ca/FacilityOccupancy` every run.
   - Parse all six facilities from the HTML and write readings to DB.
2. Implement `scraper/scheduler.py`:
   - Use APScheduler to run the scraper every 15 minutes.
   - Run an immediate scrape at startup.
   - Log an hourly heartbeat so it is easy to see that it is still alive.
3. Implement FastAPI backend in `api/main.py` with:
   - `/api/occupancy/live`
   - `/api/occupancy/history`
   - `/api/heatmap/{facility_name}`
   - `POST /api/recommend`
4. Initialize `frontend/` with Vite + React + Tailwind and build:
   - `LiveView`, `Heatmap`, and `Recommendations` components.
   - A schedule parser utility for plain-text schedules.

## Blockers or Open Questions
- Need to confirm real HTML structure of `https://warrior.uwaterloo.ca/FacilityOccupancy` in case CSS classes change; current implementation will follow the provided spec:
  - Facility name: `h2 > strong` inside `.occupancy-card-header`.
  - Occupancy data from `canvas.occupancy-chart` `data-*` attributes.
  - Max capacity from `.max-occupancy strong`.
- Day-of-week convention will follow the project spec:
  - Day index `0` = Sunday, `1` = Monday, ..., `6` = Saturday (matches SQLite `strftime('%w')` and the schedule/recommendation examples).

## File/Folder Structure (Planned)
- `AGENT.md` – Living design log for agents (what the project is, current phase, progress, decisions, how to run).
- `README.md` – High-level project overview and quickstart instructions.
- `occupancy.db` – SQLite database file (auto-created on first scrape).
- `scraper/`
  - `scraper.py` – Scrapes the occupancy page and writes readings to SQLite.
  - `scheduler.py` – APScheduler-based runner that executes `scraper.run_scrape()` every 15 minutes and logs heartbeats.
- `api/`
  - `main.py` – FastAPI application exposing live/history/heatmap/recommend endpoints backed by `occupancy.db`.
- `frontend/`
  - `package.json` – Frontend dependencies, scripts, and Vite config hooks.
  - `vite.config.*` – Vite configuration for React.
  - `index.html` – Root HTML shell Vite mounts into.
  - `tailwind.config.*` / `postcss.config.*` – Tailwind + PostCSS config.
  - `src/`
    - `main.jsx` – React entry point.
    - `App.jsx` – Top-level layout and routing between views.
    - `components/`
      - `LiveView.jsx` – Shows live occupancy for all facilities (auto-refresh).
      - `Heatmap.jsx` – Historical occupancy heatmap per facility.
      - `Recommendations.jsx` – Schedule input + best-time-to-go recommendations.
    - `utils/`
      - `scheduleParser.js` – Parses plain-text schedule into `schedule_blocks` JSON.

## Key Decisions and Rationale
- **SQLite DB (`occupancy.db`) at repo root**: Single-file DB is easy to back up, move to a VPS, and inspect locally with CLI tools; aligns with the requirement for portability.
- **Day index convention (0 = Sunday)**: Matches SQLite `strftime('%w')` and the recommendation API examples (`day: 1` → Monday), simplifying mapping between DB, heatmap, and recommendation logic.
- **Use `occupancy_pct` (percentage) for comparisons**: All downstream logic (heatmap and recommendations) operates on percentages instead of raw counts to account for differing facility capacities.
- **Scraper uses `requests` + BeautifulSoup (no browser automation)**: The page is server-side rendered; this keeps the scraper light and lowers resource usage.
- **Scheduler interval set to 15 minutes**: Respects the project constraint to avoid polling faster than once every 15 minutes.
- **Frontend with Vite + React + Tailwind**: Provides a modern developer experience and straightforward styling for heatmaps and occupancy badges.

## Known Bugs or Fragile Areas
- HTML parsing will be tightly coupled to the current structure of `https://warrior.uwaterloo.ca/FacilityOccupancy`. If Warrior Athletics updates their markup, selectors or `data-*` attributes may need to be updated.
- Timezone considerations: SQLite `CURRENT_TIMESTAMP` uses UTC; UI will assume that times map cleanly to local expectations. If this becomes an issue, we may need to normalize or annotate timestamps.

## How to Run the Project Locally (Planned)

### 1. Start the scraper and scheduler
- Ensure Python 3.11+ is installed.
- Install backend dependencies (once):
  - `pip install -r requirements.txt`
  - Or explicitly: `pip install requests beautifulsoup4 apscheduler fastapi uvicorn`
- From the repo root:
  - `python scraper/scheduler.py`

### 2. Start the FastAPI API
- In another terminal, from the repo root:
  - `uvicorn api.main:app --reload --port 8000`

### 3. Start the frontend
- Ensure Node.js (LTS) and npm are installed.
- From the repo root:
  - `cd frontend`
  - `npm install`
  - `npm run dev`

### 4. Access the app
- API root and docs:
  - `http://localhost:8000/docs`
- Frontend (Vite dev server default):
  - `http://localhost:5173`

