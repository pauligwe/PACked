from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, conint


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "occupancy.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


app = FastAPI(title="Warrior Gym Tracker API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
    top_n: conint(ge=1, le=20) = 5


class Recommendation(BaseModel):
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


def compute_heatmap_for_facility(facility_name: str) -> List[List[Optional[float]]]:
    """
    Compute a 7x17 grid of average occupancy_pct values for the given facility.
    Days: 0-6 (Sunday-Saturday), Hours: 6-22 inclusive.
    """
    # Initialize sums and counts
    sums: List[List[float]] = [[0.0 for _ in range(17)] for _ in range(7)]
    counts: List[List[int]] = [[0 for _ in range(17)] for _ in range(7)]

    if not os.path.exists(DB_PATH):
        return [[None for _ in range(17)] for _ in range(7)]

    conn = get_db_connection()
    try:
        rows = conn.execute(
            """
            SELECT occupancy_pct,
                   strftime('%w', timestamp) AS dow,  -- 0=Sunday
                   strftime('%H', timestamp) AS hour
            FROM readings
            WHERE facility_name = ?
            """,
            (facility_name,),
        ).fetchall()
    finally:
        conn.close()

    for row in rows:
        try:
            day_index = int(row["dow"])
            hour = int(row["hour"])
            if 6 <= hour <= 22:
                hour_idx = hour - 6  # 0..16
                sums[day_index][hour_idx] += float(row["occupancy_pct"])
                counts[day_index][hour_idx] += 1
        except (TypeError, ValueError):
            continue

    heatmap: List[List[Optional[float]]] = []
    for d in range(7):
        row_vals: List[Optional[float]] = []
        for h_idx in range(17):
            if counts[d][h_idx] > 0:
                avg = sums[d][h_idx] / counts[d][h_idx]
                row_vals.append(avg)
            else:
                row_vals.append(None)
        heatmap.append(row_vals)

    return heatmap


@app.get("/api/heatmap/{facility_name}")
def get_heatmap(facility_name: str) -> Dict[str, Any]:
    """
    Return a 7x17 grid (days 0-6, hours 6-22) of average occupancy_pct
    for the given facility.
    """
    heatmap = compute_heatmap_for_facility(facility_name)
    return {
        "facility": facility_name,
        "heatmap": heatmap,
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
        for hour_idx in range(17):
            hour = 6 + hour_idx
            avg_pct = heatmap[day][hour_idx]
            if avg_pct is None:
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

