// app/api/parse-logs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Must be set before pdf-parse is imported anywhere.
process.env.PDFJS_DISABLE_WORKER = "true";

/* ==========================
   Types
   ========================== */

type OffBlock = { start: string; end: string; minutes: number };
type MealCheck = {
  mealFound: boolean;
  mealMinutes: number;
  takenBefore5thHour: boolean;
  firstMealStart?: string | null;
  firstMealEnd?: string | null;
};
type DayLog = {
  driverName: string;
  date: string; // YYYY-MM-DD
  onDutyMinutes: number;
  meal: MealCheck;
  payableMinutes: number;
  notes?: string[];
};
type ParseResult = {
  ok: true;
  numPages: number;
  byDay: DayLog[];
  summary: {
    days: number;
    totalOnDutyMinutes: number;
    totalPayableMinutes: number;
    mealNonComplianceCount: number;
  };
  debug?: {
    // remove in prod if you don’t want this
    first2000: string;
    unmatchedLines: string[];
  };
};

/* ==========================
   Helpers
   ========================== */

function j(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// Accepts multipart/form-data with ANY file key, or raw body
async function getUploadBuffer(
  req: NextRequest
): Promise<{ buffer: Buffer; filename?: string; mimetype?: string }> {
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();

    // 1) Try common keys first
    const preferredKeys = ["file", "pdf", "upload", "driverLogs", "drivers", "document"];
    for (const k of preferredKeys) {
      const v = form.get(k);
      if (v && typeof v !== "string") {
        const f = v as File;
        const arr = await f.arrayBuffer();
        return {
          buffer: Buffer.from(arr),
          filename: (f as any).name,
          mimetype: f.type || "application/pdf",
        };
      }
    }

    // 2) Otherwise, take the FIRST File found in the form (any key)
    for (const [, v] of form.entries()) {
      if (v && typeof v !== "string") {
        const f = v as File;
        const arr = await f.arrayBuffer();
        return {
          buffer: Buffer.from(arr),
          filename: (f as any).name,
          mimetype: f.type || "application/pdf",
        };
      }
    }

    throw new Error(
      "No file found in form-data. Send a File in any field (e.g., 'file', 'pdf', 'upload')."
    );
  }

  // Fallback: raw body (application/pdf or octet-stream)
  const arr = await req.arrayBuffer();
  if (!arr.byteLength) throw new Error("Empty request body.");
  return {
    buffer: Buffer.from(arr),
    filename: undefined,
    mimetype: ct || "application/pdf",
  };
}


function toYmd(d: Date) {
  const m = d.getMonth() + 1,
    day = d.getDate();
  return `${d.getFullYear()}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseClockLike(s: string, baseDateYmd: string): Date | null {
  // Accepts: "07:15", "7:15", "07:15 AM", "7:15pm", "19:05", "7 PM", "19"
  // Falls back to null for bad inputs.
  const y = Number(baseDateYmd.slice(0, 4));
  const mo = Number(baseDateYmd.slice(5, 7));
  const d = Number(baseDateYmd.slice(8, 10));

  let str = s.trim().toUpperCase();
  str = str.replace(/\s+/g, ""); // "7:15 PM" -> "7:15PM"

  // HH:MM(AM|PM)?
  let m = str.match(/^(\d{1,2})(?::?(\d{2}))?(AM|PM)?$/);
  if (!m) return null;

  let hh = Number(m[1]);
  let mm = m[2] ? Number(m[2]) : 0;
  const ampm = m[3] || "";

  if (ampm) {
    // 12AM -> 0, 12PM -> 12
    if (ampm === "AM") {
      if (hh === 12) hh = 0;
    } else if (ampm === "PM") {
      if (hh !== 12) hh += 12;
    }
  } else {
    // 24h guess; keep as-is
  }

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/* ==========================
   Text Parsing (tolerant)
   ========================== */

/**
 * We expect logs that have, per day:
 *  - Driver name somewhere (e.g., "Driver: John Doe")
 *  - A date header (e.g., "Date: 2025-08-21" or "08/21/2025")
 *  - On-duty start/end times (e.g., "On Duty 6:15 AM" ... "Off Duty 4:50 PM")
 *  - Optional break/meal blocks (e.g., "Break 12:05 PM - 12:40 PM" or "Meal 12:05 - 12:40")
 *
 * The parser is REGEX-based and tolerant. Unknown lines are ignored but recorded in debug.
 */
function parseDayBlocksFromText(text: string): DayLog[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const dayLogs: DayLog[] = [];
  let currentDriver = "Unknown";
  let currentDateYmd: string | null = null;

  // tolerant patterns
  const rxDriver = /driver\s*[:\-]\s*(.+)$/i;
  const rxDateIso = /(?:^|\s)(\d{4})[-/\.](\d{1,2})[-/\.](\d{1,2})(?:\s|$)/; // 2025-08-21
  const rxDateUs = /(?:^|\s)(\d{1,2})[-/\.](\d{1,2})[-/\.](\d{2,4})(?:\s|$)/; // 08/21/2025 or 8/21/25

  const rxOn = /\b(On[-\s]?Duty|Start)\b.*?(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|\d{1,2}:\d{2})/i;
  const rxOff = /\b(Off[-\s]?Duty|End)\b.*?(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|\d{1,2}:\d{2})/i;

  // Breaks / Meals can be "Break 12:00 - 12:35", "Meal 12:00 PM - 12:35 PM"
  const rxBreakRange =
    /\b(Break|Meal|Lunch)\b.*?(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?|\d{1,2}:\d{2})/i;

  let dayOn: Date | null = null;
  let dayOff: Date | null = null;
  const breaks: OffBlock[] = [];
  const notes: string[] = [];
  const unmatched: string[] = [];

  const flushDay = () => {
    if (!currentDateYmd) return;
    const dateYmd = currentDateYmd;
    let onDutyMinutes = 0;

    if (dayOn && dayOff && dayOff > dayOn) {
      onDutyMinutes = minutesBetween(dayOn, dayOff);
    }

    // Compute meal compliance
    let mealFound = false;
    let mealMinutes = 0;
    let takenBefore5thHour = false;
    let firstMealStart: string | null = null;
    let firstMealEnd: string | null = null;

    // Find the longest break ≥ 30 minutes and whether it started before the 5th on-duty hour.
    // If multiple breaks, we check the first one that satisfies ≥ 30 minutes.
    if (dayOn) {
      const fiveHoursMark = new Date(dayOn.getTime() + 5 * 60 * 60000);

      // sort breaks by start time
      const sorted = [...breaks].sort((a, b) => {
        const sa = parseClockLike(a.start, dateYmd)?.getTime() ?? 0;
        const sb = parseClockLike(b.start, dateYmd)?.getTime() ?? 0;
        return sa - sb;
      });

      for (const b of sorted) {
        const s = parseClockLike(b.start, dateYmd);
        const e = parseClockLike(b.end, dateYmd);
        if (!s || !e || e <= s) continue;
        const mins = minutesBetween(s, e);
        if (mins >= 30) {
          mealFound = true;
          mealMinutes = mins;
          takenBefore5thHour = s <= fiveHoursMark;
          firstMealStart = b.start;
          firstMealEnd = b.end;
          break;
        }
      }
    }

    // Payable minutes:
    // If 30-min meal before 5th hour is satisfied, subtract unpaid 30 from on-duty.
    // Otherwise, payable = on-duty (no unpaid meal deduction).
    let payableMinutes = onDutyMinutes;
    if (mealFound && takenBefore5thHour) {
      const unpaid = clamp(30, 0, mealMinutes); // at least 30 is unpaid; cap at actual meal
      payableMinutes = Math.max(0, onDutyMinutes - unpaid);
    }

    dayLogs.push({
      driverName: currentDriver,
      date: dateYmd,
      onDutyMinutes,
      meal: {
        mealFound,
        mealMinutes,
        takenBefore5thHour,
        firstMealStart,
        firstMealEnd,
      },
      payableMinutes,
      notes: notes.length ? notes.slice(0) : undefined,
    });

    // reset state for next day
    dayOn = null;
    dayOff = null;
    breaks.length = 0;
    notes.length = 0;
  };

  for (const line of lines) {
    let matched = false;

    // Driver line
    const md = line.match(rxDriver);
    if (md) {
      // When driver changes mid-stream, flush current day if any
      if (currentDateYmd) flushDay();
      currentDriver = md[1].trim();
      matched = true;
    }

    // Date line (ISO first)
    if (!matched) {
      const mi = line.match(rxDateIso);
      if (mi) {
        // New date -> flush previous day
        if (currentDateYmd) flushDay();
        const y = Number(mi[1]),
          mo = Number(mi[2]),
          d = Number(mi[3]);
        currentDateYmd = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(
          d
        ).padStart(2, "0")}`;
        matched = true;
      }
    }
    // Date line (US)
    if (!matched) {
      const mu = line.match(rxDateUs);
      if (mu) {
        if (currentDateYmd) flushDay();
        const a = Number(mu[1]),
          b = Number(mu[2]),
          c = Number(mu[3]);
        const y = c < 100 ? 2000 + c : c;
        currentDateYmd = `${String(y).padStart(4, "0")}-${String(a).padStart(2, "0")}-${String(
          b
        ).padStart(2, "0")}`;
        matched = true;
      }
    }

    // On Duty
    if (!matched && currentDateYmd) {
      const mo = line.match(rxOn);
      if (mo) {
        const t = parseClockLike(mo[2], currentDateYmd);
        if (t) {
          dayOn = t;
          matched = true;
        }
      }
    }

    // Off Duty
    if (!matched && currentDateYmd) {
      const mf = line.match(rxOff);
      if (mf) {
        const t = parseClockLike(mf[2], currentDateYmd);
        if (t) {
          dayOff = t;
          matched = true;
        }
      }
    }

    // Break / Meal Range
    if (!matched && currentDateYmd) {
      const mb = line.match(rxBreakRange);
      if (mb) {
        const s = mb[2];
        const e = mb[3];
        // store as literal strings (we parse later during computation)
        breaks.push({
          start: s,
          end: e,
          minutes: 0, // will compute on flush
        });
        matched = true;
      }
    }

    // Collect non-matching lines for debug (optional)
    if (!matched && currentDateYmd) {
      unmatched.push(line);
    }
  }

  // flush last day
  if (currentDateYmd) flushDay();

  // compute minutes for each break (for reporting only)
  for (const dl of dayLogs) {
    const date = dl.date;
    // The breaks are not on the object; we only used them to compute meal. (Avoid overexposing.)
    // If you want to include break list in output, you can store and include them similarly.
    // Here we keep it minimal.
  }

  // Attach some debug notes when fields are missing
  for (const dl of dayLogs) {
    dl.notes = dl.notes || [];
    if (dl.onDutyMinutes === 0) dl.notes.push("No on-duty window found.");
    if (!dl.meal.mealFound) dl.notes.push("No 30-min meal found.");
    else if (!dl.meal.takenBefore5thHour) dl.notes.push("Meal found, but not before 5th on-duty hour.");
  }

  return dayLogs;
}

/* ==========================
   Main route
   ========================== */

export async function POST(req: NextRequest) {
  try {
    // 1) Get uploaded file
    const { buffer } = await getUploadBuffer(req);
    if (buffer.length < 100) throw new Error("Uploaded file appears too small to be a valid PDF.");

    // 2) Import pdf-parse right before parsing
    const pdf = (await import("pdf-parse")).default;

    // 3) Parse PDF -> text
    const parsed = await pdf(buffer);
    const text = parsed.text || "";

    // 4) Extract day logs + compute
    const byDay = parseDayBlocksFromText(text);

    // 5) Summaries
    const totalOnDutyMinutes = byDay.reduce((s, d) => s + d.onDutyMinutes, 0);
    const totalPayableMinutes = byDay.reduce((s, d) => s + d.payableMinutes, 0);
    const mealNonComplianceCount = byDay.filter(
      (d) => !(d.meal.mealFound && d.meal.takenBefore5thHour)
    ).length;

    const result: ParseResult = {
      ok: true,
      numPages: parsed.numpages,
      byDay,
      summary: {
        days: byDay.length,
        totalOnDutyMinutes,
        totalPayableMinutes,
        mealNonComplianceCount,
      },
      debug: {
        first2000: text.slice(0, 2000),
        unmatchedLines: [], // we tracked them internally; omit here to keep payload small
      },
    };

    return j(result, 200);
  } catch (err: any) {
    console.error("[parse-logs] Error:", err);
    return j({ ok: false, error: String(err?.message || err) }, 500);
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/parse-logs", runtime: "nodejs" });
}
