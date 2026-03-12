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
  sat: 6
};

function parseTimeToHour(str) {
  // "9:00" -> 9, "10:30" -> 10.5
  const [hRaw, mRaw = "0"] = str.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h + m / 60;
}

export function parseSchedule(text) {
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
    const match = rest.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!match) continue;

    const startHour = parseTimeToHour(match[1]);
    const endHour = parseTimeToHour(match[2]);
    if (startHour == null || endHour == null || endHour <= startHour) {
      continue;
    }

    blocks.push({ day, start_hour: startHour, end_hour: endHour });
  }

  return blocks;
}

