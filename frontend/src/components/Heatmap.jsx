import React, { useEffect, useMemo, useState } from "react";

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

const HOURS = Array.from({ length: 17 }, (_, idx) => 6 + idx); // 6..22

function occupancyToLabel(pct) {
  if (pct < 25) return "Very quiet";
  if (pct < 45) return "Light";
  if (pct < 60) return "Moderate";
  if (pct < 75) return "Busy";
  if (pct < 88) return "Very busy";
  return "Packed";
}

function colorForPct(pct) {
  if (pct == null) return "bg-slate-800";
  if (pct < 25) return "bg-emerald-500";
  if (pct < 45) return "bg-emerald-400";
  if (pct < 60) return "bg-amber-400";
  if (pct < 75) return "bg-orange-500";
  if (pct < 88) return "bg-red-500";
  return "bg-red-700";
}

function hourLabel(hour) {
  const suffix = hour < 12 ? "AM" : "PM";
  let display = hour % 12;
  if (display === 0) display = 12;
  return `${display}:00 ${suffix}`;
}

export default function Heatmap() {
  const [facility, setFacility] = useState(FACILITY_NAMES[0]);
  const [heatmap, setHeatmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);

  const fetchHeatmap = async (name) => {
    setLoading(true);
    try {
      const encoded = encodeURIComponent(name);
      const res = await fetch(`${API_BASE}/api/heatmap/${encoded}`);
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setHeatmap(data.heatmap || null);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load heatmap.");
      setHeatmap(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeatmap(facility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facility]);

  const tooltip = useMemo(() => {
    if (!hover || !heatmap) return null;
    const { day, hourIdx } = hover;
    const hour = 6 + hourIdx;
    const pct = heatmap?.[day]?.[hourIdx];
    if (pct == null) {
      return {
        title: `${DAY_NAMES[day]} ${hourLabel(hour)}`,
        subtitle: "No data yet"
      };
    }
    const rounded = Math.round(pct * 10) / 10;
    return {
      title: `${DAY_NAMES[day]} ${hourLabel(hour)}`,
      subtitle: `${rounded}% · ${occupancyToLabel(pct)}`
    };
  }, [hover, heatmap]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Historical Heatmap</h2>
          <p className="text-sm text-slate-400">
            Average occupancy percentage by day of week and hour, based on all
            collected readings.
          </p>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label className="text-slate-300" htmlFor="facility">
            Facility
          </label>
          <select
            id="facility"
            value={facility}
            onChange={(e) => setFacility(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {FACILITY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-slate-300 text-sm">Loading heatmap…</p>}
      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {heatmap && (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1 text-xs">
              <div />
              {DAY_NAMES.map((day) => (
                <div
                  key={day}
                  className="text-center font-medium text-slate-300"
                >
                  {day.slice(0, 3)}
                </div>
              ))}

              {HOURS.map((hour, hourIdx) => (
                <React.Fragment key={hour}>
                  <div className="flex items-center justify-end pr-1 text-[0.65rem] text-slate-400">
                    {hourLabel(hour)}
                  </div>
                  {DAY_NAMES.map((_, dayIdx) => {
                    const pct = heatmap?.[dayIdx]?.[hourIdx];
                    return (
                      <button
                        key={`${dayIdx}-${hourIdx}`}
                        type="button"
                        className={`h-6 w-full rounded-sm ${colorForPct(
                          pct
                        )} transition-opacity hover:opacity-90`}
                        onMouseEnter={() =>
                          setHover({ day: dayIdx, hourIdx })
                        }
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="font-medium text-slate-300">Legend:</span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-emerald-500" /> Very quiet
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-emerald-400" /> Light
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-amber-400" /> Moderate
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-orange-500" /> Busy
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-red-500" /> Very busy
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-red-700" /> Packed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-slate-800" /> No data
        </span>
      </div>

      {tooltip && (
        <div className="text-xs text-slate-300">
          <span className="font-medium">{tooltip.title}</span>
          <span className="text-slate-400"> — {tooltip.subtitle}</span>
        </div>
      )}
    </div>
  );
}

