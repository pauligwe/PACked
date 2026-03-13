Warrior Gym Tracker is a full-stack app that scrapes live occupancy data for the University of Waterloo Warrior Athletics facilities, stores it over time in a local SQLite database, and provides an API + React frontend for live status, historical heatmaps, and “best time to go” recommendations based on a student’s class schedule.

## AGENT.md Protocol
- **Every agent must read `AGENT.md` first** at the start of a session.
- **After every major change (or a set of smaller related changes), update `AGENT.md`** so the next agent can pick up exactly where you left off.

## Current Project Phase
- MVP complete; running scraper to accumulate long-term data. Frontend has been visually redesigned to match Linear’s design language.

## What Was Just Completed
- **Scraper + DB**
  - Implemented `scraper/scraper.py` (requests + BeautifulSoup) that parses all 6 facilities and inserts rows into `occupancy.db` (`readings` table).
  - Implemented `scraper/scheduler.py` using APScheduler: immediate scrape on start, then every 15 minutes + hourly heartbeat.
  - Fixed `scraper/scheduler.py` import so it runs as `python3 scraper/scheduler.py` (no relative import error).
- **API (FastAPI)**
  - Implemented:
    - `GET /api/occupancy/live` (latest reading per facility)
    - `GET /api/occupancy/history` (optional `facility`, `days`)
    - `GET /api/heatmap/{facility_name}` (7×N grid)
    - `POST /api/recommend` (uses heatmap + schedule blocks to return quietest slots)
  - **Timezone fix**: Heatmap bucketing converts stored UTC timestamps to `America/Toronto` before computing day/hour.
  - **Extended hours**: Heatmap/recommendations now include local hours **6:00–23:00** (11 PM).
  - **Open-hours guard (weekly)**: Added base weekly hours by building (PAC/CIF) and filtered heatmap + recommendations so closed slots aren’t shown/recommended (e.g., CIF Saturday after 10:30 PM is excluded).
- **Frontend**
  - Implemented the 3 views (`LiveView`, `Heatmap`, `Recommendations`) and schedule parser.
  - Full **Linear.app-inspired visual redesign**: Inter font, near-black palette, sharper corners, minimal chrome, status dots, and table-style heatmap.

## What Is In Progress (exactly where left)
- Running `python3 scraper/scheduler.py` to collect data over weeks.

## What Is Next in the Queue
1. **Facility-hours exceptions (date-specific)**: model special closures/exam hour ranges from the official hours page and enforce them (right now only weekly hours are enforced).
2. Improve heatmap UX to optionally indicate “Closed” vs “No data” (backend currently filters closed slots out; UI just renders null as subtle empty).

## Blockers or Open Questions
- **Facility hours change**: the code does **not** auto-scrape `Facility_Hours.aspx` for updates; weekly hours are hard-coded and will require manual updates until exceptions scraping is implemented.

## File/Folder Structure
- `AGENT.md` – living project handoff doc (this file).
- `README.md` – overview + quickstart.
- `requirements.txt` – Python deps.
- `occupancy.db` – SQLite database created locally on first scrape (not portable via git unless copied).
- `scraper/`
  - `scraper.py` – scrapes `https://warrior.uwaterloo.ca/FacilityOccupancy` and writes to SQLite.
  - `scheduler.py` – runs scraper every 15 minutes + hourly heartbeat.
- `api/`
  - `main.py` – FastAPI app; heatmap + recommend; timezone conversion; weekly open-hours guard.
- `frontend/`
  - `package.json` – Vite/React deps.
  - `index.html` – includes Inter font link.
  - `tailwind.config.cjs` / `postcss.config.cjs` – Tailwind configuration (Linear palette).
  - `src/`
    - `index.css` – global typography + baseline styles.
    - `main.jsx` – React entry.
    - `App.jsx` – navbar tabs + layout.
    - `components/`
      - `LiveView.jsx` – live cards (status dot + hero %).
      - `Heatmap.jsx` – table-style heatmap (6am–11pm).
      - `Recommendations.jsx` – schedule textarea + recommendations list.
    - `utils/`
      - `scheduleParser.js` – parse plain text schedule to `schedule_blocks`.

## Key Decisions Made and Why
- **DB timestamps**: keep SQLite `CURRENT_TIMESTAMP` (UTC) for storage; convert to local time for bucketing (prevents 6pm local appearing as 10pm bucket).
- **Use occupancy_pct** for comparisons (facilities have different capacities).
- **Weekly open-hours guard** implemented in API (prevents recommending closed times; CIF Saturday close handled).
- **Linear-inspired UI** for a precise “tool” feel; no functionality changes.

## Known Bugs or Fragile Areas
- HTML structure of `https://warrior.uwaterloo.ca/FacilityOccupancy` may change; parsing selectors may need updates.
- Weekly hours are a **best-effort** guard until date-specific exceptions (closures/exam hours) are implemented.

## How to Run the Project Locally

### 1. Start scraper (collect data)
```bash
pip install -r requirements.txt
python3 scraper/scheduler.py
```

### 2. Start API
```bash
uvicorn api.main:app --reload --port 8000
```

### 3. Start frontend
```bash
cd frontend
npm install
npm run dev
```

