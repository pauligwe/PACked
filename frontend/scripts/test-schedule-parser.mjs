/**
 * Quick manual check: node scripts/test-schedule-parser.mjs
 */
import {
  parseSchedule,
  parseQuestScheduleRich,
  serializeScheduleBlocks,
} from "../src/utils/scheduleParser.js";

const sample = `BET 100 - Entrepreneurial Pract Found
Class Nbr	Section	Component	Days & Times	Room	Instructor	Start/End Date
5037
081
LEC
TBA
ONLN - Online
Dean Pacey
01/05/2026 - 04/06/2026
CS 136 - Elem Algo Dsgn & Data Abstrac
Status	Units	Grading	Grade	Deadlines
Enrolled
5943
201
TST
M 7:00PM - 8:50PM
TBA
Dalibor Dvorski
03/02/2026 - 03/02/2026
6431
009
LEC
TTh 2:30PM - 3:50PM
MC 4061
Urs Hengartner
01/05/2026 - 04/06/2026
ECON 102 - Intro Macroeconomics
Withdrawn
Class Nbr	Section	Component	Days & Times	Room	Instructor	Start/End Date
4134
002
LEC
TTh 11:30AM - 12:50PM
UTD 105
Kate Rybczynski
01/05/2026 - 04/06/2026
MATH 136 - Linear Algebra 1 (Honours)
Class Nbr	Section	Component	Days & Times	Room	Instructor	Start/End Date
5835
003
LEC
MWF 10:30AM - 11:20AM
STC 0010
Alison Cheeseman
01/05/2026 - 04/06/2026
`;

const blocks = parseSchedule(sample);
console.assert(blocks.length === 6, `expected 6 blocks, got ${blocks.length}`);
const hasEcon = blocks.some(
  (b) => b.day === 4 && b.start_hour >= 11.4 && b.start_hour < 11.6
);
console.assert(!hasEcon, "withdrawn ECON 102 should not contribute blocks");
const rich = parseQuestScheduleRich(sample);
const simplified = serializeScheduleBlocks(rich);
console.assert(
  simplified.includes("MATH 136") && simplified.includes("CS 136"),
  "simplified lines should include course codes"
);
console.log("simplified:\n", simplified);
console.log("ok", blocks.length, "blocks");
console.dir(blocks, { depth: null });
