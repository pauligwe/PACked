import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";

function occupancyToLabel(pct) {
  if (pct < 25) return "Very quiet";
  if (pct < 45) return "Light";
  if (pct < 60) return "Moderate";
  if (pct < 75) return "Busy";
  if (pct < 88) return "Very busy";
  return "Packed";
}

function labelToColor(label) {
  switch (label) {
    case "Very quiet":
      return "bg-emerald-500";
    case "Light":
      return "bg-emerald-400";
    case "Moderate":
      return "bg-amber-400";
    case "Busy":
      return "bg-orange-500";
    case "Very busy":
      return "bg-red-500";
    case "Packed":
      return "bg-red-700";
    default:
      return "bg-slate-600";
  }
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
    const interval = setInterval(fetchLive, 2 * 60 * 1000); // every 2 minutes
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return <p className="text-slate-300">Loading live occupancy…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-200">
        <p className="font-medium mb-1">Failed to load live data.</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!readings.length) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
        No readings yet. Start the scraper scheduler and give it some time to
        collect data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Live Occupancy</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {readings.map((r) => {
          const label = occupancyToLabel(r.occupancy_pct);
          const colorClass = labelToColor(label);
          const pctRounded = Math.round(r.occupancy_pct);
          const ratio = Math.min(
            100,
            Math.max(0, (r.occupancy_pct / 100) * 100)
          );

          return (
            <div
              key={r.facility_id}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col gap-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm">{r.facility_name}</h3>
                  <p className="text-xs text-slate-400">
                    {pctRounded}% — {r.occupancy_count}/{r.max_capacity} people
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-medium text-slate-900 ${colorClass}`}
                >
                  {label}
                </span>
              </div>

              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full ${colorClass} transition-all`}
                  style={{ width: `${ratio}%` }}
                />
              </div>

              <p className="text-[0.7rem] text-slate-500">
                Last updated:{" "}
                {new Date(r.timestamp).toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric"
                })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

