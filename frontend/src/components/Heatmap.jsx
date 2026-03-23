import React, { useEffect, useMemo, useState } from "react";

import { API_BASE } from "../apiBase.js";

const FACILITY_NAMES = [
  "PAC - 1st Floor - Free Weights",
  "PAC - 1st Floor - Functional",
  "PAC - 2nd Floor - Cardio",
  "PAC - 2nd Floor - Weight Machines",
  "Warrior Zone",
  "CIF Fitness Centre"
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

const HOURS = Array.from({ length: 18 }, (_, idx) => 6 + idx);

const TERM_OPTIONS = ["Winter", "Summer", "Fall", "All"];

function getCurrentTermLabel() {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 1 && month <= 4) return "Winter";
  if (month >= 5 && month <= 8) return "Summer";
  if (month >= 9 && month <= 12) return "Fall";
  return "All";
}

function occupancyToLabel(pct) {
  if (pct < 25) return "Very quiet";
  if (pct < 45) return "Light";
  if (pct < 60) return "Moderate";
  if (pct < 75) return "Busy";
  if (pct < 88) return "Very busy";
  return "Packed";
}

function colorForPct(pct) {
  if (pct == null) return "rgba(26,26,26,1)";
  if (pct < 25) return "rgba(16,185,129,0.35)";
  if (pct < 45) return "rgba(52,211,153,0.45)";
  if (pct < 60) return "rgba(251,191,36,0.5)";
  if (pct < 75) return "rgba(249,115,22,0.55)";
  if (pct < 88) return "rgba(239,68,68,0.6)";
  return "rgba(185,28,28,0.7)";
}

function hourLabel(hour) {
  const suffix = hour < 12 ? "AM" : "PM";
  let display = hour % 12;
  if (display === 0) display = 12;
  return `${display}:00 ${suffix}`;
}

export default function Heatmap() {
  const [facility, setFacility] = useState(FACILITY_NAMES[0]);
  const [term, setTerm] = useState(getCurrentTermLabel());
  const [heatmap, setHeatmap] = useState(null);
  const [closedGrid, setClosedGrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);

  const fetchHeatmap = async (name, termLabel) => {
    setLoading(true);
    try {
      const encoded = encodeURIComponent(name);
      const termQuery =
        termLabel && termLabel !== "All"
          ? `?term=${encodeURIComponent(termLabel.toLowerCase())}`
          : "";
      const res = await fetch(`${API_BASE}/api/heatmap/${encoded}${termQuery}`);
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setHeatmap(data.heatmap || null);
      setClosedGrid(Array.isArray(data.closed) ? data.closed : null);
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load heatmap.");
      setHeatmap(null);
      setClosedGrid(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeatmap(facility, term);
  }, [facility, term]);

  const tooltip = useMemo(() => {
    if (!hover || !heatmap) return null;
    const { day, hourIdx } = hover;
    const hour = 6 + hourIdx;
    const pct = heatmap?.[day]?.[hourIdx];
    const isClosed = closedGrid?.[day]?.[hourIdx] === true;
    if (isClosed) {
      return {
        title: `${DAY_NAMES[day]} ${hourLabel(hour)}`,
        subtitle: "Closed"
      };
    }
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
  }, [hover, heatmap, closedGrid]);

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium text-linear-text-secondary tracking-[-0.03em]">
            Historical Heatmap
          </h2>
          <p className="text-[12px] text-linear-text-tertiary mt-0.5">
            Average occupancy by day and hour.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="term"
              className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary"
            >
              Term
            </label>
            <select
              id="term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="min-w-[140px] rounded-md border border-linear-border bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
            >
              {TERM_OPTIONS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
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
              className="min-w-[200px] rounded-md border border-linear-border bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
            >
              {FACILITY_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <p className="text-[13px] text-linear-text-secondary">
          Loading heatmap…
        </p>
      )}
      {error && (
        <div className="rounded-md border border-linear-border bg-linear-surface p-3 text-[13px] text-linear-text-secondary">
          {error}
        </div>
      )}

      {heatmap && (
        <div className="w-full min-w-0 overflow-x-hidden">
          <div className="w-full min-w-0">
            <div
              className="grid w-full min-w-0 gap-px text-[9px] leading-tight sm:text-[11px] sm:leading-normal"
              style={{
                gridTemplateColumns:
                  "minmax(0, auto) repeat(7, minmax(0, 1fr))",
              }}
            >
              <div />
              {DAY_NAMES.map((day) => (
                <div
                  key={day}
                  className="py-1 text-center uppercase tracking-[0.06em] text-linear-text-tertiary sm:py-2"
                >
                  {day.slice(0, 3)}
                </div>
              ))}

              {HOURS.map((hour, hourIdx) => (
                <React.Fragment key={hour}>
                  <div
                    className="flex h-5 shrink-0 items-center justify-end whitespace-nowrap pr-1 text-linear-text-muted tabular-nums sm:h-8 sm:pr-3"
                  >
                    {hourLabel(hour)}
                  </div>
                  {DAY_NAMES.map((_, dayIdx) => {
                    const pct = heatmap?.[dayIdx]?.[hourIdx];
                    return (
                      <button
                        key={`${dayIdx}-${hourIdx}`}
                        type="button"
                        className="h-5 min-h-0 min-w-0 w-full rounded-[2px] transition-colors duration-100 hover:opacity-90 sm:h-8 sm:rounded-[3px]"
                        style={{
                          backgroundColor: colorForPct(pct),
                        }}
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

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-linear-text-tertiary">
        <span className="uppercase tracking-[0.06em]">Legend</span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "rgba(16,185,129,0.5)",
            }}
          />
          Very quiet
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "rgba(52,211,153,0.5)",
            }}
          />
          Light
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "rgba(251,191,36,0.5)",
            }}
          />
          Moderate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "rgba(249,115,22,0.55)",
            }}
          />
          Busy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "rgba(239,68,68,0.6)",
            }}
          />
          Very busy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: "rgba(185,28,28,0.7)",
            }}
          />
          Packed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full bg-linear-elevated"
            style={{ width: 6, height: 6 }}
          />
          Closed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="rounded-full bg-linear-elevated"
            style={{ width: 6, height: 6 }}
          />
          No data
        </span>
      </div>

      {tooltip && (
        <div className="text-[12px] text-linear-text-secondary">
          <span className="text-linear-text-primary font-medium">
            {tooltip.title}
          </span>
          <span className="text-linear-text-tertiary"> — {tooltip.subtitle}</span>
        </div>
      )}
    </div>
  );
}
