import React, { useEffect, useState } from "react";
import {
  isLikelyQuestSchedule,
  parseQuestScheduleRich,
  parseSchedule,
  serializeScheduleBlocks,
} from "../utils/scheduleParser.js";

import { API_BASE } from "../apiBase.js";

const FACILITY_NAMES = [
  "CIF Fitness Centre",
  "PAC - 1st Floor - Free Weights",
  "PAC - 1st Floor - Functional",
  "PAC - 2nd Floor - Cardio",
  "PAC - 2nd Floor - Weight Machines",
  "Warrior Zone",
];

const UL_PRESET = [
  {
    label: "Upper",
    options: [
      {
        facilities: [
          "PAC - 1st Floor - Free Weights",
          "PAC - 1st Floor - Functional",
          "PAC - 2nd Floor - Weight Machines",
        ],
      },
    ],
  },
  {
    label: "Lower",
    options: [
      {
        facilities: [
          "PAC - 1st Floor - Free Weights",
          "PAC - 2nd Floor - Weight Machines",
        ],
      },
    ],
  },
];

const PPL_PRESET = [
  {
    label: "Push",
    options: [
      {
        facilities: [
          "PAC - 1st Floor - Free Weights",
          "PAC - 2nd Floor - Weight Machines",
        ],
      },
    ],
    isRest: false,
  },
  {
    label: "Pull",
    options: [
      {
        facilities: [
          "PAC - 1st Floor - Free Weights",
          "PAC - 2nd Floor - Weight Machines",
        ],
      },
    ],
    isRest: false,
  },
  {
    label: "Legs",
    options: [
      {
        facilities: [
          "PAC - 1st Floor - Free Weights",
          "PAC - 2nd Floor - Weight Machines",
        ],
      },
    ],
    isRest: false,
  },
  {
    label: "Rest",
    options: [],
    isRest: true,
  },
];

const FBEOD_PRESET = [
  {
    label: "Full Body",
    options: [
      {
        facilities: [
          "PAC - 1st Floor - Free Weights",
          "PAC - 1st Floor - Functional",
          "PAC - 2nd Floor - Weight Machines",
        ],
      },
    ],
  },
];

const PPLUL_PRESET = [
  {
    label: "Push",
    options: PPL_PRESET[0].options,
    isRest: false,
  },
  {
    label: "Pull",
    options: PPL_PRESET[1].options,
    isRest: false,
  },
  {
    label: "Legs",
    options: PPL_PRESET[2].options,
    isRest: false,
  },
  {
    label: "Rest",
    options: [],
    isRest: true,
  },
  {
    label: "Upper",
    options: UL_PRESET[0].options,
    isRest: false,
  },
  {
    label: "Lower",
    options: UL_PRESET[1].options,
    isRest: false,
  },
];

const SPLIT_PRESETS = {
  UL: UL_PRESET,
  PPL: PPL_PRESET,
  FBEOD: FBEOD_PRESET,
  PPLUL: PPLUL_PRESET,
};

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
  const [splitPreset, setSplitPreset] = useState("UL");
  const [splitDays, setSplitDays] = useState(UL_PRESET);
  const [customSplitName, setCustomSplitName] = useState("");
  const [savedCustomSplitName, setSavedCustomSplitName] = useState(null);
  const [startTimeText, setStartTimeText] = useState("10:00");
  const [startMeridiem, setStartMeridiem] = useState("AM");
  const [endTimeText, setEndTimeText] = useState("8:00");
  const [endMeridiem, setEndMeridiem] = useState("PM");
  const [scheduleText, setScheduleText] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasHydratedState, setHasHydratedState] = useState(false);

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

  // Load saved custom split (if any) on first render.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("warrior-gym-custom-split-v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.days) && typeof parsed.name === "string") {
        setSavedCustomSplitName(parsed.name);
      }
    } catch {
      // ignore malformed local storage
    }
  }, []);

  // Load last working state for Schedule (tab persistence).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        "warrior-gym-schedule-state-v1"
      );
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed) {
        if (typeof parsed.splitPreset === "string") {
          setSplitPreset(parsed.splitPreset);
        }
        if (Array.isArray(parsed.splitDays)) {
          setSplitDays(parsed.splitDays);
        }
        if (typeof parsed.customSplitName === "string") {
          setCustomSplitName(parsed.customSplitName);
        }
        if (typeof parsed.scheduleText === "string") {
          setScheduleText(parsed.scheduleText);
        }
        if (typeof parsed.startTimeText === "string") {
          setStartTimeText(parsed.startTimeText);
        }
        if (typeof parsed.startMeridiem === "string") {
          setStartMeridiem(parsed.startMeridiem);
        }
        if (typeof parsed.endTimeText === "string") {
          setEndTimeText(parsed.endTimeText);
        }
        if (typeof parsed.endMeridiem === "string") {
          setEndMeridiem(parsed.endMeridiem);
        }
      }
    } catch {
      // ignore
    }
    setHasHydratedState(true);
  }, []);

  // Persist working state whenever key fields change.
  useEffect(() => {
    if (!hasHydratedState) return;
    try {
      const payload = {
        splitPreset,
        splitDays,
        customSplitName,
        scheduleText,
        startTimeText,
        startMeridiem,
        endTimeText,
        endMeridiem,
      };
      window.localStorage.setItem(
        "warrior-gym-schedule-state-v1",
        JSON.stringify(payload)
      );
    } catch {
      // ignore
    }
  }, [
    hasHydratedState,
    splitPreset,
    splitDays,
    customSplitName,
    scheduleText,
    startTimeText,
    startMeridiem,
    endTimeText,
    endMeridiem,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setRecommendations([]);

    const blocksRaw = parseSchedule(scheduleText);
    const blocks = blocksRaw.map(({ day, start_hour, end_hour }) => ({
      day,
      start_hour,
      end_hour,
    }));
    if (!blocks.length) {
      setError(
        "Could not find any class times. Paste your Quest Class Schedule (with Days & Times), or use lines like 'Monday 9:00-10:30'."
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
      const res = await fetch(`${API_BASE}/api/recommend_split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_blocks: blocks,
          split_days: splitDays,
          preferred_start_hour: preferredStart,
          preferred_end_hour: preferredEnd,
        }),
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

  const handleSchedulePaste = (e) => {
    const text = e.clipboardData?.getData("text/plain");
    if (!text || !isLikelyQuestSchedule(text)) return;
    const rich = parseQuestScheduleRich(text);
    if (!rich.length) return;
    e.preventDefault();
    setScheduleText(serializeScheduleBlocks(rich));
  };

  const handlePresetChange = (value) => {
    setSplitPreset(value);
    const preset = SPLIT_PRESETS[value];
    if (preset) {
      // Deep copy to allow editing without mutating the preset.
      setSplitDays(JSON.parse(JSON.stringify(preset)));
      if (value === "UL") setCustomSplitName("Upper / Lower");
      else if (value === "PPL") setCustomSplitName("Push / Pull / Legs");
      else if (value === "FBEOD") setCustomSplitName("Full Body (EOD)");
      else if (value === "PPLUL") setCustomSplitName("PPLUL (5-day)");
    }
  };

  const toggleFacilityInOption = (dayIndex, optionIndex, facility) => {
    setSplitDays((prev) => {
      const next = prev.map((d) => ({
        label: d.label,
        options: d.options.map((o) => ({ facilities: [...o.facilities] })),
      }));
      const option = next[dayIndex].options[optionIndex];
      const exists = option.facilities.includes(facility);
      option.facilities = exists
        ? option.facilities.filter((f) => f !== facility)
        : [...option.facilities, facility];
      return next;
    });
  };

  const updateDayLabel = (dayIndex, label) => {
    setSplitDays((prev) =>
      prev.map((d, idx) =>
        idx === dayIndex ? { ...d, label } : d
      )
    );
  };

  const addDay = () => {
    setSplitDays((prev) => [
      ...prev,
      {
        label: "",
        options: [{ facilities: [] }],
        isRest: false,
      },
    ]);
  };

  const removeDay = (dayIndex) => {
    setSplitDays((prev) => prev.filter((_, idx) => idx !== dayIndex));
  };

  const addOptionRow = (dayIndex) => {
    setSplitDays((prev) =>
      prev.map((d, idx) =>
        idx === dayIndex
          ? { ...d, options: [...d.options, { facilities: [] }] }
          : d
      )
    );
  };

  const removeOptionRow = (dayIndex, optionIndex) => {
    setSplitDays((prev) =>
      prev.map((d, idx) => {
        if (idx !== dayIndex) return d;
        const nextOptions = d.options.filter((_, oi) => oi !== optionIndex);
        return {
          ...d,
          options: nextOptions.length ? nextOptions : [{ facilities: [] }],
        };
      })
    );
  };

  const handleCreateSplit = () => {
    setSplitPreset("CUSTOM");
    setSplitDays([
      {
        label: "",
        options: [{ facilities: [] }],
        isRest: false,
      },
    ]);
    setCustomSplitName("");
  };

  const handleSaveCustomSplit = () => {
    if (!customSplitName.trim() || !splitDays.length) {
      return;
    }
    const payload = {
      name: customSplitName.trim(),
      days: splitDays,
    };
    try {
      window.localStorage.setItem(
        "warrior-gym-custom-split-v1",
        JSON.stringify(payload)
      );
      setSavedCustomSplitName(payload.name);
    } catch {
      // ignore storage errors
    }
  };

  const handleLoadSavedSplit = () => {
    try {
      const raw = window.localStorage.getItem("warrior-gym-custom-split-v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.days) && typeof parsed.name === "string") {
        setSplitPreset("CUSTOM");
        setSplitDays(parsed.days);
        setCustomSplitName(parsed.name);
      }
    } catch {
      // ignore malformed storage
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
          Schedule & Split Recommendations
        </h2>
        <p className="text-[12px] text-linear-text-tertiary mt-0.5">
          Paste your Quest schedule (or simple lines), choose a training split, and
          get your recommended schedule.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <label
              htmlFor="schedule"
              className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary"
            >
              Class schedule (Quest paste)
            </label>
            <p className="text-[12px] text-linear-text-secondary leading-relaxed rounded-md border border-linear-border bg-linear-surface/50 px-3 py-2">
              <span className="font-mono text-[11px] text-linear-text-tertiary">
                Quest
              </span>{" "}
              → <em>Class Schedule</em> → select your term → select all text on the
              page and paste it here (same idea as UW Flow).
            </p>
            <textarea
              id="schedule"
              rows={10}
              className="w-full rounded-md border border-linear-border-alt bg-linear-surface px-3 py-2 text-[13px] text-linear-text-primary font-mono focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
              placeholder={`Paste everything off Quest:\nMonday 14:30-15:50 CS 136 LEC\n\nOr type/edit lines just like above (24h times).`}
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              onPaste={handleSchedulePaste}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary">
                Workout window
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-linear-text-tertiary w-16">
                    Earliest
                  </span>
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
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-linear-text-tertiary w-16">
                    Latest
                  </span>
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

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={handleCreateSplit}
            className="h-7 rounded px-3 text-[12px] font-medium bg-linear-text-primary text-linear-bg hover:bg-[#e5e5e5] transition-colors duration-100"
          >
            Create split
          </button>
          {savedCustomSplitName && (
            <button
              type="button"
              onClick={handleLoadSavedSplit}
              className={
                "h-7 rounded px-3 text-[12px] border transition-colors duration-100 " +
                (splitPreset === "CUSTOM"
                  ? "bg-linear-elevated text-linear-text-primary border-linear-border"
                  : "bg-linear-surface text-linear-text-secondary border-linear-border hover:bg-linear-elevated")
              }
            >
              Load "{savedCustomSplitName}"
            </button>
          )}
          <button
            type="button"
            onClick={() => handlePresetChange("UL")}
            className={
              "h-7 rounded px-3 text-[12px] border transition-colors duration-100 " +
              (splitPreset === "UL"
                ? "bg-linear-elevated text-linear-text-primary border-linear-border"
                : "bg-linear-surface text-linear-text-secondary border-linear-border hover:bg-linear-elevated")
            }
          >
            Upper / Lower
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("PPL")}
            className={
              "h-7 rounded px-3 text-[12px] border transition-colors duration-100 " +
              (splitPreset === "PPL"
                ? "bg-linear-elevated text-linear-text-primary border-linear-border"
                : "bg-linear-surface text-linear-text-secondary border-linear-border hover:bg-linear-elevated")
            }
          >
            Push / Pull / Legs
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("FBEOD")}
            className={
              "h-7 rounded px-3 text-[12px] border transition-colors duration-100 " +
              (splitPreset === "FBEOD"
                ? "bg-linear-elevated text-linear-text-primary border-linear-border"
                : "bg-linear-surface text-linear-text-secondary border-linear-border hover:bg-linear-elevated")
            }
          >
            Full Body (EOD)
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange("PPLUL")}
            className={
              "h-7 rounded px-3 text-[12px] border transition-colors duration-100 " +
              (splitPreset === "PPLUL"
                ? "bg-linear-elevated text-linear-text-primary border-linear-border"
                : "bg-linear-surface text-linear-text-secondary border-linear-border hover:bg-linear-elevated")
            }
          >
            PPLUL (5-day)
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <h3 className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary">
            Split details
          </h3>
          <input
            type="text"
            value={customSplitName}
            onChange={(e) => setCustomSplitName(e.target.value)}
            placeholder="Split name (e.g. UL with CIF alt)"
            className="flex-1 rounded-md border border-linear-border bg-linear-surface px-2 py-1.5 text-[12px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
          />
          <button
            type="button"
            onClick={handleSaveCustomSplit}
            disabled={!customSplitName.trim() || !splitDays.length}
            className="h-7 rounded px-3 text-[12px] font-medium bg-linear-surface border border-linear-border text-linear-text-secondary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-linear-elevated transition-colors duration-100"
          >
            Save
          </button>
        </div>
        <div className="rounded-md border border-linear-border bg-linear-surface p-3 space-y-3">
          {splitDays.map((day, dayIdx) => (
            <div
              key={dayIdx}
              className="group border border-linear-border/60 rounded-md p-3 space-y-2 bg-linear-elevated/40 relative"
            >
              <button
                type="button"
                onClick={() => removeDay(dayIdx)}
                className="absolute top-0 right-2 text-[14px] text-[#4b5563] opacity-0 group-hover:opacity-100 transition-opacity duration-100 hover:text-[#fecaca]"
                aria-label="Remove day"
              >
                −
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.06em] text-linear-text-tertiary">
                  Day {dayIdx + 1}
                </span>
                <input
                  type="text"
                  value={day.label}
                  onChange={(e) => updateDayLabel(dayIdx, e.target.value)}
                  className="flex-1 rounded-md border border-linear-border bg-linear-surface px-2 py-1.5 text-[13px] text-linear-text-primary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
                />
              </div>
              {!day.isRest && (
                <div className="space-y-2">
                  {day.options.map((opt, optIdx) => (
                    <div key={optIdx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-linear-text-tertiary">
                          Option {optIdx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeOptionRow(dayIdx, optIdx)}
                          className="text-[11px] text-[#6b7280] opacity-0 group-hover:opacity-100 transition-opacity duration-100 hover:text-[#fecaca]"
                        >
                          Remove option
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {opt.facilities.map((fac) => (
                          <span
                            key={fac}
                            className="inline-flex items-center gap-1 rounded-full bg-linear-elevated px-2 py-0.5 text-[11px] text-linear-text-secondary"
                          >
                            <span>{fac}</span>
                            <button
                              type="button"
                              onClick={() =>
                                toggleFacilityInOption(dayIdx, optIdx, fac)
                              }
                              className="text-[#6b7280] hover:text-[#fecaca]"
                            >
                              −
                            </button>
                          </span>
                        ))}
                        {FACILITY_NAMES.filter(
                          (f) => !opt.facilities.includes(f)
                        ).length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                toggleFacilityInOption(
                                  dayIdx,
                                  optIdx,
                                  e.target.value
                                );
                                e.target.value = "";
                              }
                            }}
                            className="rounded-md border border-linear-border bg-linear-surface px-2 py-1 text-[11px] text-linear-text-secondary focus:border-linear-text-tertiary focus:outline-none transition-colors duration-100"
                          >
                            <option value="">+ Add facility</option>
                            {FACILITY_NAMES.filter(
                              (f) => !opt.facilities.includes(f)
                            ).map((fac) => (
                              <option key={fac} value={fac}>
                                {fac}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addOptionRow(dayIdx)}
                    className="mt-1 inline-flex items-center text-[11px] text-linear-text-secondary hover:text-linear-text-primary"
                  >
                    + Add alternative
                  </button>
                </div>
              )}
              {day.isRest && (
                <p className="text-[11px] text-linear-text-tertiary italic">
                  Rest day – no facilities used.
                </p>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={addDay}
              className="inline-flex items-center text-[12px] text-linear-text-secondary hover:text-linear-text-primary"
            >
              + Add day
            </button>
            <button
              type="button"
              onClick={() =>
                setSplitDays((prev) => [
                  ...prev,
                  { label: "Rest", options: [], isRest: true },
                ])
              }
              className="inline-flex items-center text-[12px] text-linear-text-secondary hover:text-linear-text-primary"
            >
              + Add rest day
            </button>
          </div>
        </div>
      </div>

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
            Recommended slots per split day
          </h3>
          <ul className="rounded-md border border-linear-border bg-linear-surface overflow-hidden">
            {recommendations.map((rec, idx) => (
              <li
                key={`${rec.split_label}-${rec.day}-${rec.hour}-${idx}`}
                className="grid grid-cols-[minmax(0,1fr)_5.5rem_10.5rem] items-center gap-x-4 px-4 py-3 text-[13px] border-b border-linear-border last:border-b-0 transition-colors duration-100 hover:bg-linear-elevated"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-linear-text-primary font-medium">
                    {rec.split_label} · {rec.day_name} · {rec.hour_label}
                  </span>
                  <span className="text-[11px] text-linear-text-tertiary">
                    {rec.facilities && rec.facilities.length
                      ? rec.facilities.join(" + ")
                      : "Facilities: (not specified)"}
                  </span>
                </div>
                <span className="text-left tabular-nums text-linear-text-secondary">
                  {Math.round(rec.avg_occupancy_pct * 10) / 10}%
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
                    aria-hidden
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: 6,
                        height: 6,
                        backgroundColor: labelToDotColor(rec.label),
                      }}
                    />
                  </span>
                  <span className="min-w-0 truncate text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-linear-text-tertiary">
                    {rec.label}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
