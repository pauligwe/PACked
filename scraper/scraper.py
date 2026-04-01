import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "occupancy.db")

OCCUPANCY_URL = "https://warrior.uwaterloo.ca/FacilityOccupancy"

# Facility configuration for validation and lookup
FACILITIES = {
    "b2d98ff8-e37a-42da-bf72-06b259ff1a2c": {
        "name": "CIF Fitness Centre",
        "max_capacity": 100,
    },
    "7c59cbfb-ea06-46e0-8ec7-06739ccaec45": {
        "name": "PAC - 1st Floor - Free Weights",
        "max_capacity": 75,
    },
    "b03ac6cb-b6ec-4fd4-bd21-e9872a3a43f3": {
        "name": "PAC - 1st Floor - Functional",
        "max_capacity": 25,
    },
    "db0e08e1-faa7-4bc5-b639-088d7642a53e": {
        "name": "PAC - 2nd Floor - Cardio",
        "max_capacity": 50,
    },
    "b08d4801-c28c-4eba-8602-8e904ae0568c": {
        "name": "PAC - 2nd Floor - Weight Machines",
        "max_capacity": 40,
    },
    "f30dc951-26b0-4909-b814-ce54d38c2fbb": {
        "name": "Warrior Zone",
        "max_capacity": 60,
    },
}

# Reverse lookup by name for resilience if facility_id is not easily extractable
FACILITY_NAME_TO_ID = {cfg["name"]: fid for fid, cfg in FACILITIES.items()}


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("scraper")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                facility_name TEXT NOT NULL,
                facility_id TEXT NOT NULL,
                occupancy_pct REAL NOT NULL,
                occupancy_count INTEGER NOT NULL,
                max_capacity INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def fetch_page() -> Optional[str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:115.0) "
            "Gecko/20100101 Firefox/115.0"
        )
    }
    try:
        resp = requests.get(OCCUPANCY_URL, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as exc:
        logger.error("Failed to fetch occupancy page: %s", exc)
        return None


def _parse_float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_readings(html: str) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    records: List[Dict[str, Any]] = []

    # This is based on the provided spec; adjust selectors if the upstream HTML changes.
    cards = soup.select(".occupancy-card")
    if not cards:
        # Fallback: try a slightly looser selector in case class names differ
        cards = soup.find_all(attrs={"class": lambda c: c and "occupancy-card" in c})

    for card in cards:
        try:
            header = card.select_one(".occupancy-card-header h2 strong")
            name = header.get_text(strip=True) if header else None

            # Grab the full text for potential fallback parsing of percentages.
            card_text = card.get_text(" ", strip=True)

            canvas = card.select_one("canvas.occupancy-chart")
            if canvas is None:
                raise ValueError("Missing canvas.occupancy-chart")

            data_ratio = _parse_float(canvas.get("data-ratio"))
            data_occupancy = _parse_int(canvas.get("data-occupancy"))
            # remaining = _parse_int(canvas.get("data-remaining"))

            occupancy_pct: Optional[float] = None
            if data_ratio is not None:
                occupancy_pct = data_ratio * 100.0

            # Facility ID may be encoded on the card or canvas; try several attributes.
            facility_id = (
                canvas.get("data-facility-id")
                or card.get("data-facility-id")
                or None
            )

            # Max capacity from HTML
            max_el = card.select_one(".max-occupancy strong")
            max_capacity = _parse_int(max_el.get_text(strip=True)) if max_el else None

            # Fallbacks using FACILITIES config
            if facility_id and facility_id in FACILITIES:
                cfg = FACILITIES[facility_id]
                if not name:
                    name = cfg["name"]
                if max_capacity is None:
                    max_capacity = cfg["max_capacity"]
            elif name and name in FACILITY_NAME_TO_ID:
                facility_id = FACILITY_NAME_TO_ID[name]
                cfg = FACILITIES[facility_id]
                if max_capacity is None:
                    max_capacity = cfg["max_capacity"]

            if not name or not facility_id or max_capacity is None:
                raise ValueError(
                    f"Incomplete facility data (name={name}, id={facility_id}, max={max_capacity})"
                )

            # Fallback: if occupancy data attributes are missing or clearly wrong
            # (e.g., always 0 for a facility that shows non-zero percentage on the page),
            # try to parse the visible percentage text instead.
            if occupancy_pct is None or data_occupancy is None:
                m = re.search(r"(\d+)\s*%", card_text)
                text_pct = _parse_float(m.group(1)) if m else None
                if text_pct is None:
                    raise ValueError("Missing or invalid occupancy percentage from text")

                occupancy_pct = text_pct

                if data_occupancy is None:
                    # Derive an approximate count from percentage and capacity.
                    data_occupancy = int(round((text_pct / 100.0) * max_capacity))

            # Final guard: ensure we have valid numbers before saving.
            if occupancy_pct is None or data_occupancy is None:
                raise ValueError("Incomplete occupancy data after fallbacks")

            records.append(
                {
                    "facility_name": name,
                    "facility_id": facility_id,
                    "occupancy_pct": occupancy_pct,
                    "occupancy_count": data_occupancy,
                    "max_capacity": max_capacity,
                }
            )
        except Exception as exc:  # noqa: BLE001
            # Log and continue; never let a single bad card kill the whole scrape.
            logger.error("Failed to parse facility card: %s", exc, exc_info=False)

    return records


def save_readings(records: List[Dict[str, Any]]) -> None:
    if not records:
        logger.warning("No records to save from this scrape.")
        return

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.executemany(
            """
            INSERT INTO readings (
                facility_name,
                facility_id,
                occupancy_pct,
                occupancy_count,
                max_capacity
            ) VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    r["facility_name"],
                    r["facility_id"],
                    float(r["occupancy_pct"]),
                    int(r["occupancy_count"]),
                    int(r["max_capacity"]),
                )
                for r in records
            ],
        )
        conn.commit()
    finally:
        conn.close()


def fetch_live_readings() -> List[Dict[str, Any]]:
    """
    Fetch the occupancy page and parse all facilities without writing to the database.
    Returns an empty list if the page cannot be fetched or no facilities were parsed.
    """
    html = fetch_page()
    if html is None:
        return []
    records = parse_readings(html)
    return records


def run_scrape() -> None:
    """Fetch the occupancy page, parse all facilities, and write readings to SQLite."""
    init_db()
    logger.info("Starting occupancy scrape.")
    try:
        html = fetch_page()
        if html is None:
            logger.error("Skipping scrape because page fetch failed.")
            return

        records = parse_readings(html)
        if not records:
            logger.warning("Parsed 0 facility records from page.")
            return

        save_readings(records)
        now = datetime.utcnow().isoformat(timespec="seconds")
        for r in records:
            logger.info(
                "Scraped %s: %.1f%% (%d/%d) at %s",
                r["facility_name"],
                r["occupancy_pct"],
                r["occupancy_count"],
                r["max_capacity"],
                now,
            )
        logger.info("Scrape completed successfully (%d records).", len(records))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error during scrape: %s", exc)


if __name__ == "__main__":
    run_scrape()

