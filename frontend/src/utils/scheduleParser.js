/**
 * Parses class schedules for PACked recommendations.
 *
 * Supports:
 * 1) Quest (Waterloo) copy/paste — vertical or tabular rows with "Days & Times" like
 *    `TTh 2:30PM - 3:50PM`, `MWF 10:30AM - 11:20AM`, `M 7:00PM - 8:50PM`.
 * 2) Simple lines: `Monday 9:00-10:30` (legacy).
 */

const DAY_TO_INDEX = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Quest day tokens — longest first so `TTh` beats `T` + `Th`. */
const QUEST_DAY_TOKEN_ORDER = [
  ["TTh", [2, 4]],
  ["TuTh", [2, 4]],
  ["MWF", [1, 3, 5]],
  ["MW", [1, 3]],
  ["WF", [3, 5]],
  ["Th", [4]],
  ["Tu", [2]],
  ["Mo", [1]],
  ["We", [3]],
  ["Fr", [5]],
  ["Sa", [6]],
  ["Su", [0]],
  ["M", [1]],
  ["T", [2]],
  ["W", [3]],
  ["F", [5]],
];

const DATE_LINE =
  /^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/;

const COURSE_TITLE =
  /^[A-Za-z&]+\s+\d+[A-Z]?\s+-\s+.+/;

const COMPONENTS = new Set(["LEC", "TST", "TUT", "LAB", "SEM", "PRA", "WRK"]);

const INDEX_TO_DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function parseTimeToHour(str) {
  const [hRaw, mRaw = "0"] = str.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h + m / 60;
}

function parseMeridiemTimeToken(token) {
  const m = token.trim().match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h + min / 60;
}

/**
 * Expands Quest "Days & Times" prefix (e.g. TTh, MWF, M) to JS weekday indices
 * 0=Sun … 6=Sat (matches backend ScheduleBlock).
 */
function expandQuestDayPrefix(dayPart) {
  const s = dayPart.trim();
  if (!s) return [];
  const days = [];
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const [tok, indices] of QUEST_DAY_TOKEN_ORDER) {
      if (s.startsWith(tok, i)) {
        days.push(...indices);
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1;
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

const TIME_RANGE_RE =
  /^(.+?)\s+(\d{1,2}:\d{2}(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}(?:AM|PM))$/i;

/**
 * Extract short code like "CS 136" or "PD 1" from a Quest course title line.
 */
export function extractCourseCodeFromTitle(line) {
  const m = line.match(/^([A-Za-z&]+\s+\d+[A-Z]?)\s+-\s+/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

/**
 * Decimal hour (e.g. 14.5) → "14:30" 24h for display / editing.
 */
export function formatHourDecimalAs24h(decimal) {
  const total = Math.round(Number(decimal) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Parsed blocks → one line each: "Monday 14:30-15:50 CS 136 LEC"
 * (Course + component optional; helps users verify Quest import and edit.)
 */
export function serializeScheduleBlocks(blocks) {
  if (!blocks || !blocks.length) return "";
  const sorted = [...blocks].sort(
    (a, b) => a.day - b.day || a.start_hour - b.start_hour
  );
  return sorted
    .map((b) => {
      const dayName = INDEX_TO_DAY_FULL[b.day] ?? "Monday";
      const start = formatHourDecimalAs24h(b.start_hour);
      const end = formatHourDecimalAs24h(b.end_hour);
      const code = b.courseCode?.trim();
      const comp = b.component?.trim();
      const tail = [code, comp].filter(Boolean).join(" ");
      return tail
        ? `${dayName} ${start}-${end} ${tail}`
        : `${dayName} ${start}-${end}`;
    })
    .join("\n");
}

/**
 * One row's "Days & Times" cell → schedule blocks (skips TBA / online-only).
 * Optional meta adds courseCode / component (Quest vertical rows).
 */
export function parseQuestDaysTimesCell(cell, meta = {}) {
  const blocks = [];
  const raw = (cell || "").trim();
  if (!raw) return blocks;
  const upper = raw.toUpperCase();
  if (
    upper === "TBA" ||
    upper.includes("ONLN") ||
    upper.includes("ONLINE") ||
    upper === "—" ||
    upper === "-"
  ) {
    return blocks;
  }

  const m = raw.match(TIME_RANGE_RE);
  if (!m) return blocks;

  const dayPart = m[1].trim();
  const startH = parseMeridiemTimeToken(m[2]);
  const endH = parseMeridiemTimeToken(m[3]);
  if (startH == null || endH == null || endH <= startH) return blocks;

  const dayIndices = expandQuestDayPrefix(dayPart);
  if (!dayIndices.length) return blocks;

  const extra = {};
  if (meta.courseCode) extra.courseCode = meta.courseCode;
  if (meta.component) extra.component = meta.component;

  for (const day of dayIndices) {
    blocks.push({ day, start_hour: startH, end_hour: endH, ...extra });
  }
  return blocks;
}

export function isLikelyQuestSchedule(text) {
  if (!text) return false;
  if (text.includes("Class Nbr")) return true;
  if (text.includes("Days & Times")) return true;
  // Vertical Quest row: 4-digit class #, 3-digit section, LEC/TST/...
  if (/\n\d{4}\s*\n\s*\d{3}\s*\n\s*(LEC|TST|TUT|LAB|SEM|PRA)\s*\n/m.test(text)) {
    return true;
  }
  // Horizontal tab row (Quest table body)
  if (/\t(LEC|TST|TUT|LAB|SEM|PRA)\t/i.test(text)) return true;
  if (/\t\d{4}\t\d{3}\t(LEC|TST|TUT|LAB|SEM|PRA)\b/i.test(text)) return true;
  return false;
}

function scanCourseWithdrawn(lines, courseLineIdx) {
  for (let j = courseLineIdx + 1; j < lines.length && j < courseLineIdx + 50; j++) {
    const l = lines[j];
    if (l.startsWith("Class Nbr") || l === "Class Nbr") return false;
    if (COURSE_TITLE.test(l)) return false;
    if (l === "Withdrawn" || /\bWithdrawn\b/i.test(l)) return true;
  }
  return false;
}

/**
 * Tab / single-line Quest row: ClassNbr, Section, Component, Days & Times, ...
 */
function tryParseQuestTabRow(line) {
  const parts = line.split("\t").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return [];
  const compIdx = parts.findIndex((p) => COMPONENTS.has(p));
  if (compIdx < 0 || compIdx + 1 >= parts.length) return [];
  const daysCell = parts[compIdx + 1];
  const component = parts[compIdx];
  return parseQuestDaysTimesCell(daysCell, { component });
}

function parseQuestScheduleVertical(lines) {
  const blocks = [];
  let i = 0;
  let skipCourse = false;
  let currentCourseCode = null;

  while (i < lines.length) {
    const line = lines[i];

    if (COURSE_TITLE.test(line)) {
      skipCourse = scanCourseWithdrawn(lines, i);
      currentCourseCode = extractCourseCodeFromTitle(line);
      i += 1;
      continue;
    }

    if (line.startsWith("Class Nbr") || line === "Class Nbr") {
      i += 1;
      continue;
    }

    // Vertical block: 4-digit, 3-digit, LEC|TST|..., days cell, ... , date line
    if (/^\d{4}$/.test(line) && i + 3 < lines.length) {
      const section = lines[i + 1];
      const component = lines[i + 2];
      const daysTimes = lines[i + 3];

      if (!/^\d{3}$/.test(section) || !COMPONENTS.has(component)) {
        i += 1;
        continue;
      }

      let j = i + 4;
      while (j < lines.length && !DATE_LINE.test(lines[j])) {
        j += 1;
      }
      if (j >= lines.length) {
        i += 1;
        continue;
      }

      if (!skipCourse) {
        blocks.push(
          ...parseQuestDaysTimesCell(daysTimes, {
            courseCode: currentCourseCode || undefined,
            component,
          })
        );
      }
      i = j + 1;
      continue;
    }

    i += 1;
  }

  return blocks;
}

/**
 * Full Quest paste → blocks with optional courseCode / component.
 */
export function parseQuestScheduleRich(text) {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

  const tabBlocks = [];
  for (const line of rawLines) {
    if (line.includes("\t") && !line.startsWith("Class Nbr")) {
      tabBlocks.push(...tryParseQuestTabRow(line));
    }
  }

  const verticalBlocks = parseQuestScheduleVertical(lines);

  const merged = [...verticalBlocks, ...tabBlocks];
  return dedupeBlocks(merged);
}

function parseSimpleSchedule(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const dayToken = parts[0].toLowerCase();
    const day = DAY_TO_INDEX[dayToken];
    if (day == null) continue;

    const rest = line.slice(parts[0].length).trim();
    const match = rest.match(
      /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s+(.+))?$/
    );
    if (!match) continue;

    const startHour = parseTimeToHour(match[1]);
    const endHour = parseTimeToHour(match[2]);
    if (startHour == null || endHour == null || endHour <= startHour) {
      continue;
    }

    const block = { day, start_hour: startHour, end_hour: endHour };
    const tail = (match[3] || "").trim();
    if (tail) {
      const compMatch = tail.match(
        /^(.*?)\s+(TST|LEC|TUT|LAB|SEM|PRA|WRK)\s*$/i
      );
      if (compMatch) {
        block.courseCode = compMatch[1].trim();
        block.component = compMatch[2].toUpperCase();
      } else {
        block.courseCode = tail;
      }
    }

    blocks.push(block);
  }

  return blocks;
}

function dedupeBlocks(blocks) {
  const seen = new Set();
  const out = [];
  for (const b of blocks) {
    const key = `${b.day}|${b.start_hour}|${b.end_hour}|${b.courseCode ?? ""}|${b.component ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

/**
 * Parse pasted schedule text into schedule blocks (for the API, strip to day/start/end).
 * Tries Quest (Waterloo) format first when it looks like a Quest copy; otherwise simple lines.
 */
export function parseSchedule(text) {
  if (!text || !String(text).trim()) return [];

  if (isLikelyQuestSchedule(text)) {
    const quest = parseQuestScheduleRich(text);
    if (quest.length) return quest;
  }

  return parseSimpleSchedule(text);
}
