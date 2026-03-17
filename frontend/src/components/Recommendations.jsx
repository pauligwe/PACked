import React, { useEffect, useState } from "react";
import { parseSchedule } from "../utils/scheduleParser.js";

const API_BASE = "http://localhost:8000";

const FACILITY_NAMES = [
  "CIF Fitness Centre",
  "PAC - 1st Floor - Free Weights",
  "PAC - 1st Floor - Functional",
  "PAC - 2nd Floor - Cardio",
  "PAC - 2nd Floor - Weight Machines",
  "Warrior Zone"
];

function labelToDotColor(label) {
  switch (label) {
    case "Very quiet":
      return "#10b981";
    case "Light":
      return "#34d399";
    case "Moderate":
      return "#fbbf24";
    case "Busy":
      return "#f97316";
    case "Very busy":
      return "#ef4444";
    case "Packed":
      return "#b91c1c";
    default:
      return "#525252";
  }
}

function parseHourMinuteWithMeridiem(timeText, meridiem) {
  if (!timeText) return null;
  const match = timeText.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] != null ? Number(match[2]) : 0;
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute >= 60) return null;
  const isPM = meridiem === "PM";
  if (hour === 12) {
    hour = isPM ? 12 : 0;
  } else if (isPM) {
    hour += 12;
  }
  return hour + minute / 60;
}

export default function Recommendations() {
  const [facility, setFacility] = useState(FACILITY_NAMES[0]);
  const [topN, setTopN] = useState(5);
  const [startTimeText, setStartTimeText] = useState("10:00");
  const [startMeridiem, setStartMeridiem] = useState("AM");
  const [endTimeText, setEndTimeText] = useState("8:00");
  const [endMeridiem, setEndMeridiem] = useState("PM");
  const [scheduleText, setScheduleText] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [historySummary, setHistorySummary] = useState({
    totalReadings: 0,
    distinctDays: 0
  });

  useEffect(() => {
    const fetchHistorySummary = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/occupancy/history`);
        if (!res.ok) return;
        const data = await res.json();
        const totalReadings = data.length || 0;
        const uniqueDates = new Set(
          data.map((r) => (r.timestamp || "").slice(0, 10))
        );
        const distinctDays = uniqueDates.has("")
          ? uniqueDates.size - 1
          : uniqueDates.size;
        setHistorySummary({ totalReadings, distinctDays });
      } catch {
        // Non-critical
      }
    };

    fetchHistorySummary();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setRecommendations([]);

    const blocks = parseSchedule(scheduleText);
    if (!blocks.length) {
      setError(
        "Could not detect any valid schedule lines. Use format like 'Monday 9:00-10:30 CS 341'."
      );
      return;
    }

    const preferredStart = parseHourMinuteWithMeridiem(
      startTimeText,
      startMeridiem
    );
    const preferredEnd = parseHourMinuteWithMeridiem(
      endTimeText,
      endMeridiem
    );
    if (preferredStart == null || preferredEnd == null) {
      setError(
        "Please enter valid times like 10:00 and 8:30 and pick AM/PM."
      );
      return;
    }
    if (preferredEnd <= preferredStart) {
      setError(
        "Please choose a workout window where the end time is after the start time."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility,
          schedule_blocks: blocks,
          top_n: topN,
          preferred_start_hour: preferredStart,
          preferred_end_hour: preferredEnd
        })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setRecommendations(data);
    } catch (err) {
      setError(err.message || "Failed to fetch recommendations.");
    } finally {
      setLoading(false);
    }
  };

  const showDataWarning =
    historySummary.distinctDays > 0 && historySummary.distinctDays < 3;

  return (
    <div className="space-y-5">
      {showDataWarning && (
        <div
          className="pl-4 py-2 text-[13px] text-linear-text-secondary"
          style={{
            borderLeftWidth: "3px",
            borderLeftColor: "#f59e0b",
            borderLeftStyle: "solid",
            backgroundColor: "transparent",
          }}
        >
          <p className="text-linear-text-primary">
            Not enough data yet for reliable recommendations — keep the
            scraper running!
          </p>
          <p className="mt-0.5 text-linear-text-tertiary">
            {historySummary.totalReadings} readings collected across{" "}
            {historySummary.distinctDays} day
            {historySummary.distinctDays === 1 ? "" : "s"} so far.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-[13px] font-medium text-linear-text-secondary tracking-[-0.03em]">
          Schedule & Recommendations
        </h2>
        <p className="text-[12px] text-linear-text-tertiary mt-0.5">
          Paste your class schedule, pick a facility, and get the quietest
          times that fit around your classes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <label
              htmlFor="schedule"
              className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary"
            >
              Class schedule
            </label>
            <textarea
              id="schedule"
              rows={6}
              className="w-full rounded-md border border-linear-border-alt bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary font-mono focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
              placeholder={`One class per line, e.g.\nMonday 9:00-10:30 CS 341\nTuesday 13:00-14:30 MATH 239`}
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
            />
            <p className="text-[11px] text-linear-text-tertiary">
              Day names full or abbreviated. Times in 24-hour format.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="space-y-1 flex-1">
                <span className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary">
                  Earliest workout time
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={startTimeText}
                    onChange={(e) => setStartTimeText(e.target.value)}
                    placeholder="10:00"
                    className="flex-1 rounded-md border border-linear-border bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
                  />
                  <select
                    value={startMeridiem}
                    onChange={(e) => setStartMeridiem(e.target.value)}
                    className="rounded-md border border-linear-border bg-linear-surface px-2 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1 flex-1">
                <span className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary">
                  Latest workout time
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={endTimeText}
                    onChange={(e) => setEndTimeText(e.target.value)}
                    placeholder="8:00"
                    className="flex-1 rounded-md border border-linear-border bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
                  />
                  <select
                    value={endMeridiem}
                    onChange={(e) => setEndMeridiem(e.target.value)}
                    className="rounded-md border border-linear-border bg-linear-surface px-2 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="facility"
                className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary"
              >
                Facility
              </label>
              <select
                id="facility"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full rounded-md border border-linear-border bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
              >
                {FACILITY_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="topN"
                className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary"
              >
                Number of recommendations
              </label>
              <input
                id="topN"
                type="number"
                min={1}
                max={20}
                value={topN}
                onChange={(e) =>
                  setTopN(
                    Math.min(
                      20,
                      Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                    )
                  )
                }
                className="w-24 rounded-md border border-linear-border bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center h-8 rounded px-4 text-[13px] font-medium text-linear-bg bg-linear-text-primary transition-colors duration-100 hover:bg-[#e5e5e5] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Finding best times…" : "Get recommendations"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-linear-border bg-linear-surface p-3 text-[13px] text-linear-text-secondary">
          {error}
        </div>
      )}

      {!error && !loading && recommendations.length === 0 && (
        <p className="text-[13px] text-linear-text-tertiary">
          Recommendations will appear here once you submit a schedule.
        </p>
      )}

      {recommendations.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary mb-2">
            Recommended time slots
          </h3>
          <ul className="rounded-md border border-linear-border bg-linear-surface overflow-hidden">
            {recommendations.map((rec, idx) => (
              <li
                key={`${rec.day}-${rec.hour}-${idx}`}
                className="flex items-center justify-between gap-4 px-4 py-3 text-[13px] border-b border-linear-border last:border-b-0 transition-colors duration-100 hover:bg-linear-elevated"
              >
                <span className="text-linear-text-primary font-medium">
                  {rec.day_name} · {rec.hour_label}
                </span>
                <span className="text-linear-text-secondary">
                  {Math.round(rec.avg_occupancy_pct * 10) / 10}%
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-linear-text-tertiary">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: labelToDotColor(rec.label),
                    }}
                  />
                  {rec.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
