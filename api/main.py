from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, conint
from zoneinfo import ZoneInfo


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "occupancy.db")

# Local timezone for bucketing/labels (Waterloo, Ontario).
LOCAL_TZ = ZoneInfo("America/Toronto")

# Weekly base hours by building, in local time, using decimal hours.
# Day index: 0=Sunday .. 6=Saturday.
# close times after midnight are expressed as 24.5 (00:30 next day), etc.
BUILDING_WEEKLY_HOURS: Dict[str, Dict[int, Dict[str, float]]] = {
    "PAC": {
        0: {"open": 9.0, "close": 24.5},  # Sunday
        1: {"open": 6.0, "close": 24.5},  # Monday
        2: {"open": 6.0, "close": 24.5},  # Tuesday
        3: {"open": 6.0, "close": 24.5},  # Wednesday
        4: {"open": 6.0, "close": 24.5},  # Thursday
        5: {"open": 6.0, "close": 24.5},  # Friday
        6: {"open": 9.0, "close": 24.5},  # Saturday
    },
    "CIF": {
        0: {"open": 9.0, "close": 24.5},  # Sunday
        1: {"open": 14.5, "close": 24.5},  # Monday 2:30 PM–12:30 AM
        2: {"open": 14.5, "close": 24.5},  # Tuesday
        3: {"open": 14.5, "close": 24.5},  # Wednesday
        4: {"open": 14.5, "close": 24.5},  # Thursday
        5: {"open": 13.0, "close": 24.5},  # Friday 1:00 PM–12:30 AM
        6: {"open": 9.0, "close": 22.5},  # Saturday 9:00 AM–10:30 PM
    },
}

# Map facility names from occupancy page to building keys above.
FACILITY_TO_BUILDING: Dict[str, str] = {
    "CIF Fitness Centre": "CIF",
    "PAC - 1st Floor - Free Weights": "PAC",
    "PAC - 1st Floor - Functional": "PAC",
    "PAC - 2nd Floor - Cardio": "PAC",
    "PAC - 2nd Floor - Weight Machines": "PAC",
    "Warrior Zone": "PAC",
}


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


app = FastAPI(title="PACked API")

def _cors_origins() -> List[str]:
    """Comma-separated CORS_ORIGINS env, or local Vite defaults."""
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Reading(BaseModel):
    id: int
    facility_name: str
    facility_id: str
    occupancy_pct: float
    occupancy_count: int
    max_capacity: int
    timestamp: datetime


class LiveReading(BaseModel):
    facility_name: str
    facility_id: str
    occupancy_pct: float
    occupancy_count: int
    max_capacity: int
    timestamp: datetime


class ScheduleBlock(BaseModel):
    day: conint(ge=0, le=6)  # 0=Sunday, 6=Saturday
    start_hour: float = Field(..., description="Start time in decimal hours, e.g., 9.0 or 9.5")
    end_hour: float = Field(..., description="End time in decimal hours, e.g., 10.5")


class RecommendRequest(BaseModel):
    facility: str
    schedule_blocks: List[ScheduleBlock]
    # Always return the single best slot for now.
    top_n: conint(ge=1, le=20) = 1
    # Optional personal workout window in decimal hours (local time), e.g. 10.0–20.0.
    # Defaults cover the full 6:00–23:00 range used by the heatmap.
    preferred_start_hour: float = Field(
        6.0, description="Earliest hour (local, 0-23) user is willing to work out."
    )
    preferred_end_hour: float = Field(
        23.0, description="Latest hour (local, 0-23) user is willing to work out."
    )


class Recommendation(BaseModel):
    day: int
    day_name: str
    hour: int
    hour_label: str
    avg_occupancy_pct: float
    label: str


class OptionGroup(BaseModel):
    facilities: List[str]


class SplitDay(BaseModel):
    label: str
    options: List[OptionGroup]
    is_rest: bool = False


class SplitRecommendRequest(BaseModel):
    schedule_blocks: List[ScheduleBlock]
    split_days: List[SplitDay]
    preferred_start_hour: float = Field(
        6.0, description="Earliest hour (local, 0-23) user is willing to work out."
    )
    preferred_end_hour: float = Field(
        23.0, description="Latest hour (local, 0-23) user is willing to work out."
    )


class SplitDayRecommendation(BaseModel):
    split_label: str
    option_index: int
    facilities: List[str]
    is_rest: bool = False
    day: int
    day_name: str
    hour: int
    hour_label: str
    avg_occupancy_pct: float
    label: str


def day_index_to_name(day_index: int) -> str:
    # 0=Sunday, 6=Saturday
    names = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ]
    return names[day_index % 7]


def hour_to_label(hour: int) -> str:
    # 0-23 -> "H:00 AM/PM"
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12
    if display_hour == 0:
        display_hour = 12
    return f"{display_hour}:00 {suffix}"


def occupancy_to_label(pct: float) -> str:
    if pct < 25:
        return "Very quiet"
    if pct < 45:
        return "Light"
    if pct < 60:
        return "Moderate"
    if pct < 75:
        return "Busy"
    if pct < 88:
        return "Very busy"
    return "Packed"


def is_slot_open(facility_name: str, day_index: int, hour: int) -> bool:
    """
    Return True if the full [hour, hour+1) slot is within the base weekly hours
    for the facility's building. If hours are unknown, default to True.
    """
    building = FACILITY_TO_BUILDING.get(facility_name)
    if building is None:
        return True

    building_hours = BUILDING_WEEKLY_HOURS.get(building)
    if not building_hours:
        return True

    hours = building_hours.get(day_index)
    if not hours:
        return True

    open_h = hours["open"]
    close_h = hours["close"]
    slot_start = float(hour)
    slot_end = float(hour + 1)

    return open_h <= slot_start and slot_end <= close_h


def _row_to_reading(row: sqlite3.Row) -> Reading:
    ts = row["timestamp"]
    if isinstance(ts, str):
        # SQLite default CURRENT_TIMESTAMP is in UTC: "YYYY-MM-DD HH:MM:SS"
        ts_dt = datetime.fromisoformat(ts.replace(" ", "T"))
        ts_dt = ts_dt.replace(tzinfo=timezone.utc)
    else:
        ts_dt = datetime.now(timezone.utc)

    return Reading(
        id=row["id"],
        facility_name=row["facility_name"],
        facility_id=row["facility_id"],
        occupancy_pct=row["occupancy_pct"],
        occupancy_count=row["occupancy_count"],
        max_capacity=row["max_capacity"],
        timestamp=ts_dt,
    )


@app.get("/api/occupancy/live", response_model=List[LiveReading])
def get_live_readings() -> List[LiveReading]:
    """
    Return the most recent reading for each facility.
    """
    if not os.path.exists(DB_PATH):
        return []

    conn = get_db_connection()
    try:
        # Using a subquery to get the latest id (and thus latest timestamp) per facility_id.
        rows = conn.execute(
            """
            SELECT r.*
            FROM readings r
            JOIN (
                SELECT facility_id, MAX(id) AS max_id
                FROM readings
                GROUP BY facility_id
            ) latest
            ON r.facility_id = latest.facility_id AND r.id = latest.max_id
            ORDER BY r.facility_name
            """
        ).fetchall()
    finally:
        conn.close()

    return [
        LiveReading(
            facility_name=row["facility_name"],
            facility_id=row["facility_id"],
            occupancy_pct=row["occupancy_pct"],
            occupancy_count=row["occupancy_count"],
            max_capacity=row["max_capacity"],
            timestamp=datetime.fromisoformat(row["timestamp"].replace(" ", "T")).replace(
                tzinfo=timezone.utc
            ),
        )
        for row in rows
    ]


@app.get("/api/occupancy/history", response_model=List[Reading])
def get_history(
    facility: Optional[str] = Query(default=None),
    days: Optional[int] = Query(default=None, ge=1),
) -> List[Reading]:
    """
    Return historical readings, optionally filtered by facility name and/or recent days.
    """
    if not os.path.exists(DB_PATH):
        return []

    conn = get_db_connection()
    try:
        query = "SELECT * FROM readings"
        params: List[Any] = []
        conditions: List[str] = []

        if facility:
            conditions.append("LOWER(facility_name) = LOWER(?)")
            params.append(facility)

        if days is not None:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            # SQLite default timestamp format: "YYYY-MM-DD HH:MM:SS"
            cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")
            conditions.append("timestamp >= ?")
            params.append(cutoff_str)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY timestamp DESC"

        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()

    return [_row_to_reading(row) for row in rows]


def compute_heatmap_for_facility(
    facility_name: str, term: Optional[str] = None
) -> List[List[Optional[float]]]:
    """
    Compute a 7x18 grid of average occupancy_pct values for the given facility.
    Days: 0-6 (Sunday-Saturday), Hours: 6-23 inclusive (6am–11pm local time).
    """
    # Initialize sums and counts
    sums: List[List[float]] = [[0.0 for _ in range(18)] for _ in range(7)]
    counts: List[List[int]] = [[0 for _ in range(18)] for _ in range(7)]

    if not os.path.exists(DB_PATH):
        return [[None for _ in range(18)] for _ in range(7)]

    conn = get_db_connection()
    try:
        rows = conn.execute(
            """
            SELECT occupancy_pct,
                   timestamp
            FROM readings
            WHERE facility_name = ?
            """,
            (facility_name,),
        ).fetchall()
    finally:
        conn.close()

    term_normalized = (term or "").lower()

    for row in rows:
        ts_raw = row["timestamp"]
        if not isinstance(ts_raw, str):
            continue
        try:
            # SQLite CURRENT_TIMESTAMP is stored in UTC as "YYYY-MM-DD HH:MM:SS".
            ts_utc = datetime.fromisoformat(ts_raw.replace(" ", "T")).replace(
                tzinfo=timezone.utc
            )
            ts_local = ts_utc.astimezone(LOCAL_TZ)
            month = ts_local.month

            # Optional coarse term filter by calendar month:
            # Winter: Jan–Apr (1–4), Summer: May–Aug (5–8), Fall: Sep–Dec (9–12).
            if term_normalized in {"winter", "summer", "fall"}:
                if term_normalized == "winter" and not (1 <= month <= 4):
                    continue
                if term_normalized == "summer" and not (5 <= month <= 8):
                    continue
                if term_normalized == "fall" and not (9 <= month <= 12):
                    continue
            # Python weekday(): Monday=0..Sunday=6. Convert to 0=Sunday..6=Saturday.
            py_weekday = ts_local.weekday()
            day_index = (py_weekday + 1) % 7
            hour = ts_local.hour
            if 6 <= hour <= 23 and is_slot_open(facility_name, day_index, hour):
                pct_val = float(row["occupancy_pct"])
                # Include 0% in the average (empty gym counts as real data, not "no readings").
                hour_idx = hour - 6  # 0..17
                sums[day_index][hour_idx] += pct_val
                counts[day_index][hour_idx] += 1
        except (TypeError, ValueError):
            continue

    heatmap: List[List[Optional[float]]] = []
    for d in range(7):
        row_vals: List[Optional[float]] = []
        for h_idx in range(18):
            if counts[d][h_idx] > 0:
                avg = sums[d][h_idx] / counts[d][h_idx]
                row_vals.append(float(avg))
            else:
                row_vals.append(None)
        heatmap.append(row_vals)

    return heatmap


def compute_closed_grid(facility_name: str) -> List[List[bool]]:
    """
    7x18 grid: True when the facility is closed for that local (day, hour) slot.
    """
    return [
        [not is_slot_open(facility_name, d, 6 + h_idx) for h_idx in range(18)]
        for d in range(7)
    ]


@app.get("/api/heatmap/{facility_name}")
def get_heatmap(
    facility_name: str,
    term: Optional[str] = Query(
        default=None,
        description="Academic term filter: winter, summer, fall, or all (default all).",
    ),
) -> Dict[str, Any]:
    """
    Return a 7x18 grid (days 0-6, hours 6-23) of average occupancy_pct
    for the given facility. Optionally filter by academic term.
    """
    normalized_term = (term or "").lower()
    if normalized_term == "all" or normalized_term == "":
        normalized_term = None

    heatmap = compute_heatmap_for_facility(facility_name, term=normalized_term)
    closed = compute_closed_grid(facility_name)
    return {
        "facility": facility_name,
        "heatmap": heatmap,
        "closed": closed,
    }


@app.post("/api/recommend", response_model=List[Recommendation])
def recommend_slots(payload: RecommendRequest) -> List[Recommendation]:
    """
    Recommend quiet time slots based on historical occupancy and a class schedule.
    """
    heatmap = compute_heatmap_for_facility(payload.facility)

    # Collect candidate slots
    candidates: List[Dict[str, Any]] = []
    for day in range(7):
        for hour_idx in range(18):
            hour = 6 + hour_idx
            avg_pct = heatmap[day][hour_idx]
            if avg_pct is None:
                continue

            # Respect the user's personal workout window.
            if not (payload.preferred_start_hour <= hour + 0.0 < payload.preferred_end_hour):
                continue

            # Skip times outside base weekly hours for this facility.
            if not is_slot_open(payload.facility, day, hour):
                continue

            # Check if this slot (hour to hour+1) overlaps any schedule block
            blocked = False
            for block in payload.schedule_blocks:
                if block.day != day:
                    continue
                if block.start_hour < hour + 1 and block.end_hour > hour:
                    blocked = True
                    break

            if not blocked:
                candidates.append(
                    {
                        "day": day,
                        "hour": hour,
                        "avg_occupancy_pct": avg_pct,
                    }
                )

    if not candidates:
        return []

    # Sort by occupancy (ascending), then by day, then by hour
    candidates.sort(
        key=lambda c: (c["avg_occupancy_pct"], c["day"], c["hour"])
    )

    top = candidates[: payload.top_n]
    results: List[Recommendation] = []
    for c in top:
        pct = float(c["avg_occupancy_pct"])
        results.append(
            Recommendation(
                day=c["day"],
                day_name=day_index_to_name(c["day"]),
                hour=c["hour"],
                hour_label=hour_to_label(c["hour"]),
                avg_occupancy_pct=pct,
                label=occupancy_to_label(pct),
            )
        )

    return results


@app.post("/api/recommend_split", response_model=List[SplitDayRecommendation])
def recommend_split_slots(payload: SplitRecommendRequest) -> List[SplitDayRecommendation]:
    """
    Recommend a weekly schedule by cycling the split days across the week,
    starting on Monday. For each calendar day:
    - If the corresponding split day is a rest day, emit a Rest entry.
    - Otherwise, choose the quietest valid hour on that calendar day.

    Takes into account:
    - academic schedule blocks
    - user's preferred workout window
    - multiple facility option-groups per day
    """
    if not payload.split_days:
        return []

    # Precompute heatmaps for all facilities referenced in any option group.
    facility_names: List[str] = []
    for day in payload.split_days:
        for opt in day.options:
            for fac in opt.facilities:
                if fac not in facility_names:
                    facility_names.append(fac)

    heatmaps: Dict[str, List[List[Optional[float]]]] = {
        fac: compute_heatmap_for_facility(fac) for fac in facility_names
    }

    def build_schedule_for_start(start_day_index: int) -> Tuple[List[SplitDayRecommendation], float]:
        """
        Build a 7-day schedule given a starting calendar day index (0=Sunday..6=Saturday).
        Returns (recommendations, total_occupancy_score_for_training_days).
        """
        schedule: List[SplitDayRecommendation] = []
        total_score = 0.0

        for day_offset in range(7):
            target_day_index = (start_day_index + day_offset) % 7
            split_day = payload.split_days[day_offset % len(payload.split_days)]

            if split_day.is_rest:
                schedule.append(
                    SplitDayRecommendation(
                        split_label=split_day.label,
                        option_index=-1,
                        facilities=[],
                        is_rest=True,
                        day=target_day_index,
                        day_name=day_index_to_name(target_day_index),
                        hour=12,
                        hour_label=hour_to_label(12),
                        avg_occupancy_pct=0.0,
                        label="Rest",
                    )
                )
                continue

            best: Optional[Dict[str, Any]] = None

            for option_idx, option in enumerate(split_day.options):
                if not option.facilities:
                    continue

                for hour_idx in range(18):
                    hour = 6 + hour_idx

                    # Respect user's workout window.
                    if not (
                        payload.preferred_start_hour
                        <= float(hour)
                        < payload.preferred_end_hour
                    ):
                        continue

                    # Require at least one facility in the option to be open.
                    if not any(
                        is_slot_open(
                            facility_name=fac,
                            day_index=target_day_index,
                            hour=hour,
                        )
                        for fac in option.facilities
                    ):
                        continue

                    # For this option at this slot, compute the max occupancy across all facilities.
                    pct_values: List[float] = []
                    for fac in option.facilities:
                        heatmap = heatmaps.get(fac)
                        if (
                            heatmap is None
                            or target_day_index >= len(heatmap)
                            or hour_idx >= len(heatmap[target_day_index])
                        ):
                            continue
                        cell = heatmap[target_day_index][hour_idx]
                        if cell is not None:
                            pct_values.append(float(cell))

                    if not pct_values:
                        continue

                    slot_score = max(pct_values)

                    if best is None or slot_score < best["score"]:
                        best = {
                            "score": slot_score,
                            "day_index": target_day_index,
                            "hour": hour,
                            "option_index": option_idx,
                            "facilities": option.facilities,
                        }

            if best is not None:
                pct = float(best["score"])
                total_score += pct
                schedule.append(
                    SplitDayRecommendation(
                        split_label=split_day.label,
                        option_index=best["option_index"],
                        facilities=best["facilities"],
                        is_rest=False,
                        day=best["day_index"],
                        day_name=day_index_to_name(best["day_index"]),
                        hour=best["hour"],
                        hour_label=hour_to_label(best["hour"]),
                        avg_occupancy_pct=pct,
                        label=occupancy_to_label(pct),
                    )
                )

        return schedule, total_score

    # Evaluate two possible anchors: Sunday (0) and Monday (1), and pick the lower total occupancy.
    from typing import Tuple  # type: ignore

    sunday_schedule, sunday_score = build_schedule_for_start(0)
    monday_schedule, monday_score = build_schedule_for_start(1)

    if monday_score and (monday_score <= sunday_score or not sunday_schedule):
        return monday_schedule
    return sunday_schedule if sunday_schedule else monday_schedule

