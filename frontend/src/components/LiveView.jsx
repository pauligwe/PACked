import React, { useEffect, useState } from "react";
import { API_BASE } from "../apiBase.js";

function occupancyToLabel(pct) {
  if (pct < 25) return "Very quiet";
  if (pct < 45) return "Light";
  if (pct < 60) return "Moderate";
  if (pct < 75) return "Busy";
  if (pct < 88) return "Very busy";
  return "Packed";
}

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

function labelToBarColor(label) {
  return labelToDotColor(label);
}

export default function LiveView() {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const fetchLive = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/occupancy/live`);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = await res.json();
        if (!mounted) return;
        setReadings(data);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "Failed to load live occupancy.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchLive();
    const interval = setInterval(fetchLive, 2 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <p className="text-[13px] text-linear-text-secondary">
        Loading live occupancy…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-linear-border bg-linear-surface p-4 text-[13px] text-linear-text-secondary">
        <p className="text-linear-text-primary font-medium mb-1">
          Failed to load live data.
        </p>
        <p>{error}</p>
      </div>
    );
  }

  if (!readings.length) {
    return (
      <div className="rounded-md border border-linear-border bg-linear-surface p-4 text-[13px] text-linear-text-secondary">
        No readings yet. Start the scraper scheduler and give it some time to
        collect data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-[13px] font-medium text-linear-text-secondary tracking-[-0.03em]">
        Live Occupancy
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {readings.map((r) => {
          const label = occupancyToLabel(r.occupancy_pct);
          const dotColor = labelToDotColor(label);
          const barColor = labelToBarColor(label);
          const pctRounded = Math.round(r.occupancy_pct);
          const ratio = Math.min(100, Math.max(0, r.occupancy_pct));

          return (
            <div
              key={r.facility_id}
              className="rounded-md border border-linear-border bg-linear-surface p-4 flex flex-col gap-2 shadow-linear transition-colors duration-100 hover:bg-linear-elevated"
              style={{ minHeight: "140px" }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-medium text-linear-text-primary">
                  {r.facility_name}
                </h3>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-linear-text-secondary">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: dotColor,
                    }}
                  />
                  {label}
                </span>
              </div>

              <p className="text-[28px] font-semibold text-linear-text-primary tracking-[-0.03em] leading-none">
                {pctRounded}%
              </p>
              <p className="text-[12px] text-linear-text-tertiary">
                {r.occupancy_count}/{r.max_capacity} people
              </p>

              <div
                className="h-[3px] rounded-[2px] overflow-hidden mt-1"
                style={{ backgroundColor: "#2A2A2A" }}
              >
                <div
                  className="h-full rounded-[2px] transition-all duration-100"
                  style={{
                    width: `${ratio}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>

              <p className="text-[11px] text-linear-text-muted mt-auto pt-1">
                Last updated:{" "}
                {new Date(r.timestamp).toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
