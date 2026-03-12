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

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

function labelToColor(label) {
  switch (label) {
    case "Very quiet":
      return "bg-emerald-500 text-slate-900";
    case "Light":
      return "bg-emerald-400 text-slate-900";
    case "Moderate":
      return "bg-amber-400 text-slate-900";
    case "Busy":
      return "bg-orange-500 text-slate-900";
    case "Very busy":
      return "bg-red-500 text-slate-50";
    case "Packed":
      return "bg-red-700 text-slate-50";
    default:
      return "bg-slate-600 text-slate-50";
  }
}

export default function Recommendations() {
  const [facility, setFacility] = useState(FACILITY_NAMES[0]);
  const [topN, setTopN] = useState(5);
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
        const distinctDays = uniqueDates.has("") ? uniqueDates.size - 1 : uniqueDates.size;
        setHistorySummary({ totalReadings, distinctDays });
      } catch {
        // Non-critical; banner will simply not appear if this fails.
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

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility,
          schedule_blocks: blocks,
          top_n: topN
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
        <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-medium">
            Not enough data yet for reliable recommendations — keep the scraper
            running!
          </p>
          <p className="mt-1">
            {historySummary.totalReadings} readings collected across{" "}
            {historySummary.distinctDays} day
            {historySummary.distinctDays === 1 ? "" : "s"} so far.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold">Schedule & Recommendations</h2>
        <p className="text-sm text-slate-400">
          Paste your class schedule, pick a facility, and get the quietest
          times that fit around your classes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 space-y-2">
            <label
              htmlFor="schedule"
              className="text-sm font-medium text-slate-200"
            >
              Class schedule
            </label>
            <textarea
              id="schedule"
              rows={6}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder={`One class per line, e.g.\nMonday 9:00-10:30 CS 341\nTuesday 13:00-14:30 MATH 239`}
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Day names can be full or abbreviated (Mon, Tue, Wed, Thu, Fri,
              Sat, Sun). Times are24-hour format.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              <label
                htmlFor="facility"
                className="text-sm font-medium text-slate-200"
              >
                Facility
              </label>
              <select
                id="facility"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                {FACILITY_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 text-sm">
              <label
                htmlFor="topN"
                className="text-sm font-medium text-slate-200"
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
                className="w-24 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 shadow hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Finding best times…" : "Get recommendations"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {!error && !loading && recommendations.length === 0 && (
        <p className="text-sm text-slate-400">
          Recommendations will appear here once you submit a schedule.
        </p>
      )}

      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">
            Recommended time slots
          </h3>
          <ul className="space-y-2">
            {recommendations.map((rec, idx) => (
              <li
                key={`${rec.day}-${rec.hour}-${idx}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-100">
                    {rec.day_name} · {rec.hour_label}
                  </p>
                  <p className="text-xs text-slate-400">
                    Expected occupancy:{" "}
                    {Math.round(rec.avg_occupancy_pct * 10) / 10}% (
                    {rec.label})
                  </p>
                </div>
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${labelToColor(
                    rec.label
                  )}`}
                >
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

