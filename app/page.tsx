"use client";

import React, { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import UncertifiedDQChecker from "./components/UncertifiedDQChecker";

/* ===================== Theme ===================== */
const theme = {
  bg: "#0a0f1c",
  panel: "#0f172a",
  panel2: "#0b1220",
  border: "#1e293b",
  text: "#e5e7eb",
  sub: "#94a3b8",
  brand: "#7c3aed",
  brand2: "#06b6d4",
  danger: "#ef4444",
  success: "#22c55e",
};

/* ===================== Little UI bits ===================== */
function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: 16,
        ...(props.style || {}),
      }}
    />
  );
}

// Map the night of dispatch (shift start date) to the expected series.
function expectedSeriesForStart(date: Date): number | null {
  const dow = date.getDay();
  if (dow === 6) return null; // Saturday night excluded
  return (dow + 1) * 100; // Sun=100, Mon=200, ... Fri=600
}

// Extract the series bucket from the route (e.g., "103RIV-285" → 100)
function routeSeriesBucket(route: string): number | null {
  const m = String(route).trim().match(/^(\d{1,3})/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (isNaN(num)) return null;
  return Math.floor(num / 100) * 100 || 0;
}

function Button({
  children,
  variant = "primary",
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const base = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    transition: "transform 0.05s ease, box-shadow 0.15s ease",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties;

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: `linear-gradient(135deg, ${theme.brand2}, ${theme.brand})`,
      color: "white",
      boxShadow: "0 4px 20px rgba(124,58,237,0.25)",
    },
  ghost: {
      background: "transparent",
      color: theme.text,
      border: `1px solid ${theme.border}`,
    },
  };

  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ ...base, ...(variants[variant] || {}), ...(rest.style || {}) }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  const s = size;
  return (
    <span
      style={{
        width: s,
        height: s,
        border: `${Math.max(2, Math.round(s / 8))}px solid rgba(255,255,255,0.25)`,
        borderTopColor: "white",
        borderRadius: "50%",
        display: "inline-block",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

// inject keyframes for spinner once
if (typeof document !== "undefined" && !document.getElementById("spin-keyframes")) {
  const style = document.createElement("style");
  style.id = "spin-keyframes";
  style.innerHTML = `@keyframes spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);
}

function FilePicker({
  label,
  accept,
  onFile,
  onFiles,
  multiple = false,
  hint,
  icon = "📄",
}: {
  label: React.ReactNode;
  accept: string;
  onFile?: (f: File | null) => void;
  onFiles?: (files: File[]) => void;
  multiple?: boolean;
  hint?: string;
  icon?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (multiple && onFiles) onFiles(files);
    else if (onFile) onFile(files[0] ?? null);
  };

  return (
    <div>
      <div style={{ marginBottom: 8, color: theme.text, fontWeight: 600 }}>{label}</div>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          handleFiles(e.dataTransfer?.files ?? null);
        }}
        style={{
          background: dragActive ? "#0e1a33" : theme.panel2,
          border: `1px dashed ${dragActive ? theme.brand2 : theme.border}`,
          borderRadius: 12,
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          boxShadow: dragActive ? "0 0 0 2px rgba(6,182,212,0.25) inset" : "none",
          transition: "all .15s ease",
          minWidth: 260,
        }}
        title={multiple ? "Click or drop files" : "Click or drop a file"}
      >
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ color: theme.text, fontWeight: 600, fontSize: 14 }}>
            {dragActive
              ? "Drop to add files"
              : multiple
              ? "Click to choose or drop files"
              : "Click to choose or drop a file"}
          </div>
          <div style={{ color: theme.sub, fontSize: 12 }}>{hint}</div>
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        multiple={multiple}
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

/* ===================== Helpers for tables/sections ===================== */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <h3 style={{ margin: "8px 0 10px" }}>{title}</h3>
      {children}
    </div>
  );
}

function Table({ rows, columns }: { rows: any[]; columns?: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);

  if (!rows.length) return <div style={{ color: theme.sub }}>No rows.</div>;
  const cols = columns && columns.length ? columns : Object.keys(rows[0]);

  const syncScroll = (src: "container" | "float") => {
    const c = containerRef.current;
    const f = floatRef.current;
    if (!c || !f) return;
    if (src === "container") f.scrollLeft = c.scrollLeft;
    if (src === "float") c.scrollLeft = f.scrollLeft;
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        onScroll={() => syncScroll("container")}
        style={{
          overflow: "auto",
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2) inset",
          maxHeight: "70vh",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderBottom: `1px solid ${theme.border}`,
                    background:
                      "linear-gradient(0deg, rgba(2,6,23,0.0), rgba(2,6,23,0.0)), " + theme.panel2,
                    color: theme.sub,
                    whiteSpace: "nowrap",
                    fontWeight: 700,
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 ? "rgba(148,163,184,0.04)" : "transparent" }}>
                {cols.map((c) => (
                  <td
                    key={c}
                    style={{
                      padding: "10px 12px",
                      borderBottom: `1px solid ${theme.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r[c] === undefined || r[c] === null ? "" : String(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* floating scrollbar */}
      <div
        ref={floatRef}
        onScroll={() => syncScroll("float")}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 16,
          overflowX: "auto",
          overflowY: "hidden",
          background: theme.panel2,
          borderTop: `1px solid ${theme.border}`,
          zIndex: 9999,
        }}
      >
        <div style={{ width: containerRef.current?.scrollWidth ?? "100%", height: 1 }} />
      </div>
    </div>
  );
}

/* ===================== Main ===================== */
export default function Page() {
  // ==== Payable Hours state (multi-file) ====
  const [logsFiles, setLogsFiles] = useState<File[]>([]);
  const [payableResults, setPayableResults] = useState<any[]>([]);
  const [payableByDriver, setPayableByDriver] = useState<any[]>([]);
  const [phMsg, setPhMsg] = useState<string>("");
  const [isRunningPH, setIsRunningPH] = useState(false);

  // ==== Filters for per-shift table ====
  const [filterDriver, setFilterDriver] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // ==== Stops (dispatch) file + index for route lookups (ID-based) ====
  const [stopsFile, setStopsFile] = useState<File | null>(null);
  // Map key: `${driverIdNoLeadingZeros}|YYYY-MM-DD`  ->  [{ route, role }]
  const [stopsIndex, setStopsIndex] = useState<
    Map<string, { route: string; role: "driver1" | "driver2"; ts?: Date }[]>
  >(new Map());
  // NEW: optional Name index (lastName|date -> Set of ID(no-leading-zeros))
  const [stopsNameIndex, setStopsNameIndex] = useState<Map<string, Set<string>>>(new Map()); // NEW
  const [stopsIndexCount, setStopsIndexCount] = useState(0);

  const PAYABLE_COLS = [
    "Source",
    "Driver",
    "Route",
    "Shift Start",
    "Shift End",
    "Shift Duration (hrs)",
    "Payable Hours",
    "Sleeper Berth Hours",
    "Layover Hours",
    "Meal Break Compliance",
    "Meal Break Notes",
    "Note",
  ];

  const filteredPayableRows = useMemo(() => {
    const q = filterDriver.trim().toLowerCase();
    const from = filterFrom ? new Date(filterFrom + "T00:00:00") : null;
    const to = filterTo ? new Date(filterTo + "T23:59:59.999") : null;

    return payableResults
      .filter((row: any) => row["Shift Start"] && row["Payable Hours"] && row["Payable Hours"] !== "0.00")
      .filter((row: any) => {
        if (q) {
          const d = String(row.Driver ?? "").toLowerCase();
          if (!d.includes(q)) return false;
        }
        let dt: Date | null = null;
        if (row.__startISO) dt = new Date(row["__startISO"]);
        else if (row["Shift Start"]) {
          const maybe = new Date(row["Shift Start"]);
          if (!isNaN(maybe.getTime())) dt = maybe;
        }
        if (from && dt && dt < from) return false;
        if (to && dt && dt > to) return false;
        if ((from || to) && !dt) return false;
        return true;
      });
  }, [payableResults, filterDriver, filterFrom, filterTo]);

  /* ===================== Common helpers ===================== */
  async function readWorkbook(file: File) {
    const name = (file.name || "").toLowerCase();

    if (name.endsWith(".csv")) {
      const text = await file.text();
      return XLSX.read(text, { type: "string" });
    }

    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { type: "array" });
  }

  // Helpers for Stops index / dates / IDs
  function ymd(d: Date) {
    return d.toISOString().slice(0, 10);
  }
  function addDays(d: Date, n: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  // NEW: extract last name from "Last, F. (ID)" / "Last, First ..."
  function extractLastName(s: string | null | undefined): string | null {
    if (!s) return null;
    const t = String(s).trim();
    // prefer comma form: "Dominguez Abundis, A. (0000...)"
    const commaIdx = t.indexOf(",");
    if (commaIdx > 0) return t.slice(0, commaIdx).trim().toUpperCase();
    // fallback: first token until space or "("
    const m = t.match(/^([A-Za-zÁÉÍÓÚÑÜ'`-]+)/);
    return m ? m[1].toUpperCase() : null;
  }

  // === UPDATED: only for short/truncated IDs (≤4 digits) — try to resolve against Stops for the dispatch window,
  // and use last-name filter to break ties if name data exists in Stops.
  function resolveShortIdAgainstStops(
    partial: string | null,
    startDate: Date,
    driverName: string
  ): string | null {
    const want = String(partial ?? "").trim();
    const last = extractLastName(driverName);

    const stamps = [ymd(startDate), ymd(addDays(startDate, 1))];

    // 0) If we have no partial digits at all, try last-name-only unique match.
    if (!want) {
      if (!last) return null;
      const idSet = new Set<string>();
      for (const stamp of stamps) {
        const key = `${last}|${stamp}`;
        const ids = stopsNameIndex.get(key);
        if (ids) ids.forEach((id) => idSet.add(id));
      }
      return idSet.size === 1 ? Array.from(idSet)[0] : null;
    }

    if (want.length > 4) return null; // only run for 4 or fewer

    // 1) Gather candidates by digit fragment
    const seen: Record<string, number> = {};
    for (const [key] of stopsIndex) {
      const [idNoZeros, stamp] = key.split("|");
      if (!stamps.includes(stamp)) continue;
      if (idNoZeros.includes(want)) {
        seen[idNoZeros] = (seen[idNoZeros] || 0) + 1;
      }
    }
    let cands = Object.keys(seen);
    if (cands.length <= 1) return cands[0] ?? null;

    // 2) Prefer endsWith, then startsWith
const ends = cands.filter((id) => id.endsWith(want));
if (ends.length === 1) return ends[0];
if (ends.length > 1) cands = ends;

const starts = cands.filter((id) => id.startsWith(want));
if (starts.length === 1) return starts[0];
if (starts.length > 1) cands = starts;

// 3) EXTRA: allow truncated prefix (e.g., "7244" matches "72448")
const prefix = cands.filter((id) => id.startsWith(want));
if (prefix.length === 1) return prefix[0];


    // 3) If still ambiguous and we have last-name info in Stops, filter by last name
    if (last) {
      const allowed = new Set<string>();
      for (const stamp of stamps) {
        const key = `${last}|${stamp}`;
        const ids = stopsNameIndex.get(key);
        if (ids) ids.forEach((id) => allowed.add(id));
      }
      const byName = cands.filter((id) => allowed.has(id));
      if (byName.length === 1) return byName[0];
    }

    return null; // ambiguous — do not guess
  }

  // UPDATED: robust driver ID extraction — keep all digits, no zero-stripping
  function extractDriverId(driverName: string | null | undefined): string | null {
    if (!driverName) return null;
    const s = String(driverName).trim();

    // Handle truncated sheet names like "... (00009335" (missing ")")
    const mParenOpen = s.match(/\((\d{4,})\)?$/);
    if (mParenOpen && mParenOpen[1]) return mParenOpen[1];

    // Normal "(12345678)" anywhere
    const mParens = s.match(/\((\d{4,})\)/);
    if (mParens && mParens[1]) return mParens[1];

    // Fallback: grab all trailing digits (no arbitrary cap)
    const mTail = s.match(/(\d{4,})\s*$/);
    if (mTail && mTail[1]) return mTail[1];

    // Last resort: first run of 4+ digits anywhere
    const mAny = s.match(/\d{4,}/);
    return mAny ? mAny[0] : null;
  }

  /* ===================== Payable Hours ===================== */

  // Tunables
  const NEAR_RESET_GRACE_MIN = 30;
  const MAX_SHIFT_HOURS_FLAG = 18;
  const MAX_CONT_ON_HOURS_FLAG = 14;
  const MIN_LAYOVER_HOURS = 2;
  const MIN_LAYOVER_MS = MIN_LAYOVER_HOURS * 3600000;

  function toDate(val: any): Date | null {
    if (!val && val !== 0) return null;
    if (val instanceof Date) return val;
    if (typeof val === "number") {
      const p = XLSX.SSF.parse_date_code(val);
      if (p && p.y != null) {
        return new Date(p.y, (p.m || 1) - 1, p.d || 1, p.H || 0, p.M || 0, Math.floor(p.S || 0));
      }
      const epoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(epoch.getTime() + val * 24 * 3600 * 1000);
    }
    if (typeof val === "string") {
      const v = val.trim();
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
      return null;
    }
    return null;
  }

  function combineDateTime(dateVal: any, timeVal: any): Date | null {
    const d = toDate(dateVal);
    if (!d) return null;

    const t = toDate(timeVal);
    if (t && !isNaN(t.getTime())) {
      const out = new Date(d);
      out.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), 0);
      return out;
    }

    const raw = String(timeVal ?? "").trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
    if (m) {
      let hh = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const ss = m[3] ? parseInt(m[3], 10) : 0;
      const ampm = m[4].toUpperCase();
      if (ampm === "AM") hh = hh === 12 ? 0 : hh;
      else hh = hh === 12 ? 12 : hh + 12;

      const out = new Date(d);
      out.setHours(hh, mm, ss, 0);
      return out;
    }

    return new Date(d);
  }

  const HOME_LAT = 33.90;
  const HOME_LON = -117.29;
  const NEAR_RADIUS_MI = 5;

  function parseLatLon(locVal: any): { lat: number; lon: number } | null {
    const s = String(locVal ?? "");
    const m = s.match(/\(\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*\)/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lon };
  }

  function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 3958.7613; // miles
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function isNearHome(locVal: any): boolean {
    const p = parseLatLon(locVal);
    if (p) return haversineMiles(p.lat, p.lon, HOME_LAT, HOME_LON) <= NEAR_RADIUS_MI;
    const s = String(locVal ?? "").toUpperCase();
    return /MORENO\s*VALLEY|RIVERSIDE|MCLANE\s*RIVERSIDE/.test(s);
  }

  function extractStatusFromEvent(eventCell: any): string {
    const raw = String(eventCell ?? "");
    const u = raw.toUpperCase();
    const m = u.match(/DUTY\s*STATUS\s*-\s*([A-Z]+)/i);
    if (m && m[1]) return m[1].toUpperCase(); // OFF, ON, D, SB
    if (/\bSLEEPER\b/.test(u)) return "SB";
    if (/\bDRIV(ING)?\b/.test(u)) return "D";
    if (/\bON\s*DUTY\b/.test(u)) return "ON";
    if (/\bOFF\b/.test(u)) return "OFF";
    return "";
  }

  function fmtMinSec(ms: number) {
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  // ==== Load Stops file and build lookup indices ====
  async function loadStopsIntoIndex(file: File) {
    try {
      const wb = await readWorkbook(file);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setStopsIndex(new Map());
        setStopsNameIndex(new Map()); // NEW
        return;
      }

      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });
      if (!rows.length) {
        setStopsIndex(new Map());
        setStopsNameIndex(new Map()); // NEW
        return;
      }

      const keys = Object.keys(rows[0] || {});
      const find = (re: RegExp) => keys.find((k) => re.test(k));

      const keyRoute = find(/^route$/i) ?? find(/route/i);
      const keyDate = find(/^arrival\s*date$/i) ?? find(/arrival\s*date/i);
      const keyDrv1 = find(/^driver1\s*\(tms\)$/i) ?? find(/driver\s*1.*tms/i);
      const keyDrv2 = find(/^driver2\s*\(tms\)$/i) ?? find(/driver\s*2.*tms/i);
      // OPTIONAL name columns (best-effort)
      const keyDrv1Name = find(/^driver1\s*name$/i) ?? find(/driver\s*1.*name/i); // NEW
      const keyDrv2Name = find(/^driver2\s*name$/i) ?? find(/driver\s*2.*name/i); // NEW

      if (!keyRoute || !keyDate || (!keyDrv1 && !keyDrv2)) {
        setStopsIndex(new Map());
        setStopsNameIndex(new Map()); // NEW
        return;
      }

      const idx = new Map<string, { route: string; role: "driver1" | "driver2" }[]>();
      const nameIdx = new Map<string, Set<string>>(); // NEW

      const addHit = (
        idRaw: any,
        stamp: string,
        routeVal: any,
        role: "driver1" | "driver2",
        nameRaw?: any
      ) => {
        if (idRaw == null || idRaw === "") return;
        let id = String(idRaw).trim().replace(/\.0+$/, "").replace(/^0+/, "");
        if (!id || id.toUpperCase() === "UNKNOWN") return;
        const key = `${id}|${stamp}`;
        const arr = idx.get(key) || [];
        arr.push({ route: String(routeVal), role });
        idx.set(key, arr);

        // NEW: populate last-name index if name present
        if (nameRaw != null && nameRaw !== "") {
          const last = extractLastName(String(nameRaw));
          if (last) {
            const nk = `${last}|${stamp}`;
            const set = nameIdx.get(nk) ?? new Set<string>();
            set.add(id);
            nameIdx.set(nk, set);
          }
        }
      };

      for (const r of rows) {
        const routeVal = r[keyRoute];
        const dateVal = r[keyDate];
        if (!routeVal || !dateVal) continue;

        const d = toDate(dateVal);
        if (!d || isNaN(d.getTime())) continue;
        const stamp = ymd(d);

        if (keyDrv1) addHit(r[keyDrv1], stamp, routeVal, "driver1", keyDrv1Name ? r[keyDrv1Name] : undefined);
        if (keyDrv2) addHit(r[keyDrv2], stamp, routeVal, "driver2", keyDrv2Name ? r[keyDrv2Name] : undefined);
      }

      setStopsIndex(idx);
      setStopsNameIndex(nameIdx); // NEW
      setStopsIndexCount(idx.size);
    } catch (e) {
      setStopsIndex(new Map());
      setStopsNameIndex(new Map()); // NEW
    }
  }

  // ===== Parse across ALL workbooks into continuous driver timelines, then build shifts =====
  function parseLogsAcrossWorkbooks(wbs: XLSX.WorkBook[]) {
    type Evt = { ts: Date; status: string; raw: any };
    type TL = { ts: Date; eff: string; raw: any };

    const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
    const NEAR_RESET_MS = NEAR_RESET_GRACE_MIN * 60 * 1000;
    const START_BREAK_MIN_MS = TEN_HOURS_MS - NEAR_RESET_MS; // 9h30m
    const MAX_SHIFT_MS_FLAG = MAX_SHIFT_HOURS_FLAG * 3600000;
    const MAX_CONT_ON_MS_FLAG = MAX_CONT_ON_HOURS_FLAG * 3600000;

    const ON_SET = new Set(["ON", "ON DUTY", "ONDUTY", "ON-DUTY", "ON_DUTY"]);
    const D_SET = new Set(["D", "DRIVE", "DRIVING"]);
    const OFF_SET = new Set(["OFF"]);
    const SB_SET = new Set(["SB", "SLEEPER", "SLEEPER BERTH", "SLEEPER_BERTH"]);
    const isOnOrD = (s: string) => ON_SET.has(s) || D_SET.has(s);
    const isOffOrSb = (s: string) => OFF_SET.has(s) || SB_SET.has(s);

    const normKey = (k: string) => String(k).toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
    const findKey = (keys: string[], ...cands: string[]) => {
      const wanted = cands.map((c) => normKey(c));
      for (const k of keys) {
        const nk = normKey(k);
        if (wanted.some((w) => nk.includes(w))) return k;
      }
      return null;
    };

    // 1) Collect and merge events per driver (sheet name)
    const evtsByDriver = new Map<string, Evt[]>();
    for (const wb of wbs) {
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });
        if (!rows.length) continue;

        const keys = Object.keys(rows[0] || {});
        const eventKey = findKey(keys, "event");
        const startDateKey = findKey(keys, "start date", "startdate", "date start");
        const startTimeKey = findKey(keys, "start time", "starttime", "time start");
        const endDateKey = findKey(keys, "end date", "enddate", "date end");
        const endTimeKey = findKey(keys, "end time", "endtime", "time end");
        if (!eventKey || (!startDateKey && !endDateKey)) continue;

        const evts: Evt[] = [];
        for (const r of rows) {
          let ts: Date | null = null;
          if ((startDateKey || startTimeKey) && (r[startDateKey!] != null || r[startTimeKey!] != null)) {
            ts = combineDateTime(r[startDateKey!], r[startTimeKey!]);
          }
          if ((!ts || isNaN(ts.getTime())) && (endDateKey || endTimeKey) && (r[endDateKey!] != null || r[endTimeKey!] != null)) {
            ts = combineDateTime(r[endDateKey!], r[endTimeKey!]);
          }
          if (!ts || isNaN(ts.getTime())) continue;

          const status = extractStatusFromEvent(r[eventKey!]);
          if (!status) continue;
          evts.push({ ts, status, raw: r });
        }
        if (!evts.length) continue;

        evts.sort((a, b) => a.ts.getTime() - b.ts.getTime());
        // de-dup identical timestamps
        const dedup: Evt[] = [];
        let lastTs: number | null = null;
        for (const e of evts) {
          const t = e.ts.getTime();
          if (lastTs !== null && t === lastTs) continue;
          dedup.push(e);
          lastTs = t;
        }
        const arr = evtsByDriver.get(sheetName) || [];
        arr.push(...dedup);
        evtsByDriver.set(sheetName, arr);
      }
    }

    // 2) Build shifts per driver using the combined timeline
    const results: any[] = [];
    for (const [driverName, arr] of evtsByDriver) {
      if (!arr.length) continue;
      arr.sort((a, b) => a.ts.getTime() - b.ts.getTime());

      const timeline: TL[] = [];
      let lastDuty = "";
      for (const e of arr) {
        const isDuty = OFF_SET.has(e.status) || ON_SET.has(e.status) || D_SET.has(e.status) || SB_SET.has(e.status);
        if (isDuty) lastDuty = e.status;
        timeline.push({ ts: e.ts, eff: isDuty ? e.status : lastDuty, raw: e.raw });
      }

      let inOff = false;
      let offStart: Date | null = null;
      let offLoc: any = null;
      let offKind: "OFF" | "SB" | null = null;

      let shiftActive = false;
      let shiftStart: Date | null = null;
      let payableMin = 0;
      let sleeperMin = 0;
      let layoverMin = 0;
      let currentRoute = "";
      let maxOnStreakMs = 0;
      let curOnStreakMs = 0;

      const rememberRoute = (rawRow: any) => {
        for (const k of Object.keys(rawRow || {})) {
          const nk = normKey(k);
          if (nk.includes("route")) {
            const v = rawRow[k];
            if (v != null && currentRoute === "") { currentRoute = String(v); break; }
          }
        }
      };

      function fmtHM(d: Date) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      }

      function finalizeAndPush(end: Date, opts?: { note?: string; extraLayoverMin?: number }) {
        if (!shiftStart) return;
        const start = new Date(shiftStart);
        const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

        // === Fill Route from Stops index using DRIVER ID + dispatch-night rule ===
if (!currentRoute || !String(currentRoute).trim()) {
  let drvId = extractDriverId(driverName);                  // may be like "00007244"
  let idNoZeros = drvId ? drvId.replace(/^0+/, "") : "";    // -> "7244"

  const expected = expectedSeriesForStart(start);
  const stamps = [ymd(start), ymd(addDays(start, 1))];

  // helper: do we have any exact hits for this id on the window?
  const hasExactHit = (idNZ: string) => {
    for (const s of stamps) {
      if ((stopsIndex.get(`${idNZ}|${s}`) || []).length) return true;
    }
    return false;
  };

  // If no exact hits and the numeric part is short (<=4), try to recover a unique full ID
  if (!hasExactHit(idNoZeros) && idNoZeros && idNoZeros.length <= 4) {
    const recovered = resolveShortIdAgainstStops(idNoZeros, start, driverName);
    if (recovered) {
      idNoZeros = recovered;   // recovered is already "no-leading-zeros" format
    }
  }

  // If still nothing (including the case where there were no digits at all), try last-name only unique match
  if (!idNoZeros || !hasExactHit(idNoZeros)) {
    const nameOnly = resolveShortIdAgainstStops(null, start, driverName);
    if (nameOnly) idNoZeros = nameOnly;
  }

  // Final lookup if we have something to try
  if (idNoZeros) {
    let best: { route: string; role: "driver1" | "driver2" } | null = null;

    for (const s of stamps) {
      const hits = stopsIndex.get(`${idNoZeros}|${s}`) || [];
      const seriesMatches =
        expected == null ? hits : hits.filter(h => routeSeriesBucket(String(h.route)) === expected);
      const pool = seriesMatches.length ? seriesMatches : hits;
      const chosen = pool.find(h => h.role === "driver1") ?? pool[0];
      if (chosen) { best = chosen; break; }
    }

    currentRoute = best ? String(best.route) : "NO INFO";
  } else {
    currentRoute = "NO INFO (no route on stops)";
  }
}


        // ===== Meal breaks (OFF only) =====
        let mealStatus = "";
        let mealNotes = "";
        {
          const MEAL_REQ_MS = 30 * 60 * 1000;

          function onDutyDeadline(limitHours: number): Date {
            const limitMs = limitHours * 3600000;
            let acc = 0;
            for (let j = 0; j < timeline.length - 1; j++) {
              const cur = timeline[j];
              const next = timeline[j + 1];
              if (next.ts <= start || cur.ts >= end) continue;
              const segStart = new Date(Math.max(cur.ts.getTime(), start.getTime()));
              const segEnd = new Date(Math.min(next.ts.getTime(), end.getTime()));
              const segMs = Math.max(0, segEnd.getTime() - segStart.getTime());
              if (cur.eff === "ON" || cur.eff === "D") {
                if (acc + segMs >= limitMs) {
                  const need = limitMs - acc;
                  return new Date(segStart.getTime() + Math.max(0, need));
                }
                acc += segMs;
              }
            }
            return end;
          }

          const onDutyMs = payableMin * 60 * 1000;
          const needTwo = onDutyMs > 12 * 60 * 60 * 1000;
          const deadline5 = onDutyMs >= 6 * 3600000 ? onDutyDeadline(5) : end;
          const deadline10 = needTwo ? onDutyDeadline(10) : end;

          type OffSeg = { start: Date; end: Date; ms: number };
          const offSegs: OffSeg[] = [];
          for (let j = 0; j < timeline.length - 1; j++) {
            const cur = timeline[j];
            const next = timeline[j + 1];
            const segStart = new Date(Math.max(cur.ts.getTime(), start.getTime()));
            const segEnd = new Date(Math.min(next.ts.getTime(), end.getTime()));
            if (segEnd <= segStart) continue;
            if (cur.ts >= end || next.ts <= start) continue;
            if (cur.ts < start && next.ts <= start) continue;

            if (cur.eff === "OFF") {
              offSegs.push({ start: segStart, end: segEnd, ms: Math.max(0, segEnd.getTime() - segStart.getTime()) });
            }
          }

          let firstBreak: OffSeg | null = null;
          let secondBreak: OffSeg | null = null;

          if (onDutyMs < 6 * 3600000) {
            mealStatus = "✅ Compliant";
            mealNotes = "No break required (<6h on-duty)";
          } else {
            firstBreak = offSegs.find((s) => s.start < deadline5 && s.ms >= MEAL_REQ_MS) || null;
            if (needTwo) {
              secondBreak =
                offSegs.find(
                  (s) =>
                    s !== firstBreak &&
                    s.start < deadline10 &&
                    s.ms >= MEAL_REQ_MS &&
                    (!firstBreak || s.start.getTime() > firstBreak.start.getTime())
                ) || null;
            }

            if (!firstBreak) {
              const lateFirst = offSegs.find((s) => s.ms >= MEAL_REQ_MS) || null;
              mealStatus = "❌ Violation";
              mealNotes = lateFirst
                ? `Late 1st ${fmtHM(lateFirst.start)} (${Math.round(lateFirst.ms / 60000)}m) — after deadline ${fmtHM(deadline5)}`
                : "No 1st 30-min OFF before 5th on-duty hour";
            } else if (needTwo && !secondBreak) {
              const lateSecond =
                offSegs.find(
                  (s) =>
                    s !== firstBreak &&
                    s.ms >= MEAL_REQ_MS &&
                    (!firstBreak || s.start.getTime() > firstBreak.start.getTime())
                ) || null;

              mealStatus = "❌ Violation";
              mealNotes = lateSecond
                ? `Late 2nd ${fmtHM(lateSecond.start)} (${Math.round(lateSecond.ms / 60000)}m) — after deadline ${fmtHM(deadline10)}`
                : "No 2nd 30-min OFF before 10th on-duty hour";
            } else {
              const parts = [`1st ${fmtHM(firstBreak.start)} (${Math.round(firstBreak.ms / 60000)}m)`];
              if (needTwo && secondBreak) {
                parts.push(`2nd ${fmtHM(secondBreak.start)} (${Math.round(secondBreak.ms / 60000)}m)`);
              }
              mealStatus = "✅ Compliant";
              mealNotes = parts.join(" · ");
            }
          }
        }

        const flags: string[] = [];
        if (opts?.note) flags.push(opts.note);
        if (durationMin * 60000 > MAX_SHIFT_MS_FLAG) {
          flags.push(`⚠️ Long shift ${(durationMin/60).toFixed(2)}h (possible missed OFF)`);
        }
        if (maxOnStreakMs > MAX_CONT_ON_MS_FLAG) {
          flags.push(`⚠️ Continuous ON/DRIVING ${(maxOnStreakMs/3600000).toFixed(2)}h (possible forgot to log OFF)`);
        }

        const layoverTotalMin = layoverMin + (opts?.extraLayoverMin ?? 0);

        results.push({
          Driver: driverName,
          Route: currentRoute,
          "Shift Start": start.toLocaleString(),
          "Shift End": end.toLocaleString(),
          __startISO: start.toISOString(),
          __endISO: end.toISOString(),
          "Shift Duration (hrs)": (durationMin / 60).toFixed(2),
          "Payable Hours": (payableMin / 60).toFixed(2),
          "Sleeper Berth Hours": (sleeperMin / 60).toFixed(2),
          "Layover Hours": (layoverTotalMin / 60).toFixed(2),
          "Meal Break Compliance": mealStatus,
          "Meal Break Notes": mealNotes,
          Note: flags.join(" · "),
        });
      }

      for (let i = 0; i < timeline.length; i++) {
        const cur = timeline[i];
        const next = timeline[i + 1] || null;
        const segMs = next ? Math.max(0, next.ts.getTime() - cur.ts.getTime()) : 0;
        const segMin = Math.round(segMs / 60000);

        if (isOnOrD(cur.eff)) {
          curOnStreakMs += segMs;
          if (curOnStreakMs > maxOnStreakMs) maxOnStreakMs = curOnStreakMs;
        } else {
          curOnStreakMs = 0;
        }

        if (cur.eff === "OFF" || cur.eff === "SB") {
          if (!inOff) {
            inOff = true;
            offStart = cur.ts;
            offLoc = cur.raw?.Location ?? cur.raw?.location ?? null;
            offKind = cur.eff === "OFF" ? "OFF" : "SB";
          }
          if (shiftActive && next && offStart) {
            const offDur = next.ts.getTime() - offStart.getTime();
            if (offDur >= TEN_HOURS_MS) {
              const extraLayover =
                offKind === "OFF" && offDur >= MIN_LAYOVER_MS && !isNearHome(offLoc)
                  ? Math.round(offDur / 60000)
                  : 0;

              finalizeAndPush(offStart, { extraLayoverMin: extraLayover });
              shiftActive = false;
            } else if (offDur >= START_BREAK_MIN_MS) {
              const shortBy = TEN_HOURS_MS - offDur;
              const extraLayover =
                offKind === "OFF" && offDur >= MIN_LAYOVER_MS && !isNearHome(offLoc)
                  ? Math.round(offDur / 60000)
                  : 0;

              finalizeAndPush(offStart, {
                note: `⚠️ Near reset: short by ${fmtMinSec(shortBy)}`,
                extraLayoverMin: extraLayover,
              });
              shiftActive = false;
            }
          }
        } else {
          if (inOff) {
            inOff = false;
            if (offStart) {
              const gap = cur.ts.getTime() - offStart.getTime();
              if (gap >= START_BREAK_MIN_MS) {
                shiftActive = true;
                shiftStart = cur.ts;
                payableMin = 0;
                sleeperMin = 0;
                layoverMin = 0;
                currentRoute = "";
                maxOnStreakMs = 0;
                curOnStreakMs = 0;
              }
            }
            offStart = null;
            offLoc = null;
            offKind = null;
          }
        }

        if (shiftActive && next) {
          rememberRoute(cur.raw);
          if (isOnOrD(cur.eff)) payableMin += segMin;
          if (cur.eff === "SB") sleeperMin += segMin;

          if (cur.eff === "OFF" && !isNearHome(cur.raw?.Location || cur.raw?.location)) {
            if (segMs >= MIN_LAYOVER_MS) layoverMin += segMin;
          }
        }
      }

      // Tail-off at end of data: close shift
      const last = timeline[timeline.length - 1];
      if (shiftActive && last) {
        if ((last.eff === "OFF" || last.eff === "SB") && offStart) {
          const tailOff = Math.max(0, last.ts.getTime() - offStart.getTime());

          if (tailOff >= TEN_HOURS_MS) {
            const extraLayover =
              tailOff >= MIN_LAYOVER_MS && !isNearHome(offLoc) ? Math.round(tailOff / 60000) : 0;
            finalizeAndPush(offStart, { extraLayoverMin: extraLayover });
          } else if (tailOff >= START_BREAK_MIN_MS) {
            const shortBy = TEN_HOURS_MS - tailOff;
            const extraLayover =
              tailOff >= MIN_LAYOVER_MS && !isNearHome(offLoc) ? Math.round(tailOff / 60000) : 0;
            finalizeAndPush(offStart, {
              note: `⚠️ Near reset (end of data): short by ${fmtMinSec(shortBy)}`,
              extraLayoverMin: extraLayover,
            });
          } else {
            finalizeAndPush(offStart, {
              note: "📄 End-of-file: closing shift at start of OFF/SB (duration after file unknown)",
            });
          }
        } else {
          finalizeAndPush(last.ts, {
            note: "📄 End-of-file: still ON/DRIVING — closed at last event",
          });
        }
      }
    }

    return results;
  }

  function aggregateByDriver(rows: any[]) {
    const sum = new Map<
      string,
      {
        Driver: string;
        "Total Payable Hours": number;
        "Total Sleeper Berth Hours": number;
        "Total Layover Hours": number;
        "Shifts Count": number;
      }
    >();
    for (const r of rows) {
      const key = r.Driver ?? "";
      const prev =
        sum.get(key) || {
          Driver: key,
          "Total Payable Hours": 0,
          "Total Sleeper Berth Hours": 0,
          "Total Layover Hours": 0,
          "Shifts Count": 0,
        };
      prev["Total Payable Hours"] += parseFloat(r["Payable Hours"] ?? 0);
      prev["Total Sleeper Berth Hours"] += parseFloat(r["Sleeper Berth Hours"] ?? 0);
      prev["Total Layover Hours"] += parseFloat(r["Layover Hours"] ?? 0);
      prev["Shifts Count"] += 1;
      sum.set(key, prev);
    }
    return Array.from(sum.values()).map((x) => ({
      ...x,
      "Total Payable Hours": x["Total Payable Hours"].toFixed(2),
      "Total Sleeper Berth Hours": x["Total Sleeper Berth Hours"].toFixed(2),
      "Total Layover Hours": x["Total Layover Hours"].toFixed(2),
    }));
  }

  async function runPayableHoursCheck() {
    if (!logsFiles.length) {
      setPhMsg("Please select one or more logs workbooks first.");
      return;
    }

    setPhMsg("");
    setIsRunningPH(true);
    try {
      const wbs: XLSX.WorkBook[] = [];
      for (const file of logsFiles) wbs.push(await readWorkbook(file));

      const mergedRows = parseLogsAcrossWorkbooks(wbs);
      const sourceLabel =
        logsFiles.length > 1 ? `Merged (${logsFiles.length} files)` : (logsFiles[0]?.name || "");

      const allRows = mergedRows.map((r) => ({ Source: sourceLabel, ...r }));

      setPayableResults(allRows);
      setPayableByDriver(aggregateByDriver(allRows));
      setPhMsg(`✅ Processed ${logsFiles.length} file(s) • ${allRows.length} completed shift(s).`);
    } catch (e: any) {
      setPhMsg(`❌ Error: ${e.message}`);
    } finally {
      setIsRunningPH(false);
    }
  }

  function downloadPayableExcel() {
    const filtered = filteredPayableRows.map(({ __startISO, __endISO, ...rest }) => rest);
    if (!filtered.length && !payableByDriver.length) return;

    const wb = XLSX.utils.book_new();
    if (filtered.length) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(filtered),
        "Per Shift (Detailed)"
      );
    }
    if (payableByDriver.length) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(payableByDriver),
        "By Driver (Totals)"
      );
    }
    XLSX.writeFile(wb, "PayableHours_Results.xlsx");
  }

  /* ===================== UI ===================== */
  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1000px 500px at 20% -10%, rgba(6,182,212,0.15), transparent 60%),
                     radial-gradient(1000px 600px at 90% 0%, rgba(124,58,237,0.15), transparent 60%),
                     ${theme.bg}`,
        color: theme.text,
        fontFamily: "system-ui, Segoe UI, Roboto",
      }}
    >
      <div style={{ width: "100%", margin: "40px auto", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ margin: 0, letterSpacing: 0.3 }}>Payable Hours</h1>
          <span style={{ color: theme.sub, fontSize: 13 }}>100% in-browser · No uploads · No drama.</span>
        </div>

        {/* Payable Hours — Per Shift (with filters) */}
        <Card style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Payable Hours — Per Shift (All Files)</h2>
          <p style={{ color: theme.sub, marginBottom: 12 }}>
            Upload driver log workbooks. We compute Payable (ON + DRIVING), Sleeper Berth, and Layover per completed shift.
          </p>

        {/* Uploaders side-by-side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FilePicker
              label="Driver Logs Workbooks (one or many)"
              accept=".xlsx,.xls"
              multiple
              onFiles={(files) =>
                setLogsFiles((prev) => {
                  const all = [...prev, ...files];
                  const seen = new Set<string>();
                  return all.filter((f) => {
                    const key = `${f.name}|${f.size}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                })
              }
              hint='Drop multiple .xlsx files. Each sheet = one driver (2-day logs).'
              icon="📘"
            />

            <FilePicker
              label='Stops / Dispatch (CSV/XLSX) — must include: "Driver1 (TMS)", "Driver2 (TMS)", "Route", "Arrival Date"'
              accept=".csv,.xlsx,.xls"
              onFile={async (f) => {
                setStopsFile(f);
                if (f) await loadStopsIntoIndex(f);
                else { setStopsIndex(new Map()); setStopsNameIndex(new Map()); }
              }}
              hint="Used to auto-fill Route by driver ID + arrival date (handles after-midnight first stops). If optional name columns exist, we use them only to disambiguate."
              icon="🧭"
            />
          </div>

          {/* Files accepted preview */}
          {logsFiles.length > 0 && (
            <div
              style={{
                marginTop: 10,
                background: theme.panel2,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>Files accepted:</span>
                <span
                  style={{
                    background: theme.brand2,
                    color: "#001018",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {logsFiles.length}{stopsFile ? " + Stops" : ""}
                </span>
                {stopsFile && (
                  <>
                    <span
                      title={stopsFile.name}
                      style={{
                        marginLeft: 8,
                        background: "rgba(6,182,212,0.15)",
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                        padding: "4px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        maxWidth: 280,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Stops: {stopsFile.name}
                    </span>
                    <span
                      style={{
                        marginLeft: 8,
                        background: "rgba(124,58,237,0.12)",
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                        padding: "4px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      title="Number of (ID|date) keys in Stops index"
                    >
                      Stops index: {stopsIndexCount}
                    </span>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {logsFiles.slice(0, 12).map((f, i) => (
                  <span
                    key={i}
                    title={f.name}
                    style={{
                      background: "rgba(124,58,237,0.12)",
                      border: `1px solid ${theme.border}`,
                      color: theme.text,
                      padding: "4px 8px",
                      borderRadius: 8,
                      fontSize: 12,
                      maxWidth: 240,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.name}
                  </span>
                ))}
                {logsFiles.length > 12 && (
                  <span style={{ color: theme.sub, fontSize: 12 }}>
                    +{logsFiles.length - 12} more…
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Button onClick={runPayableHoursCheck} disabled={isRunningPH}>
              {isRunningPH ? (
                <>
                  <Spinner /> Processing…
                </>
              ) : (
                <>▶️ Run Payable Hours</>
              )}
            </Button>
            <Button variant="ghost" onClick={downloadPayableExcel} disabled={!payableResults.length || isRunningPH}>
              ⬇️ Download Results
            </Button>
            {phMsg && (
              <span
                style={{
                  color: phMsg.startsWith("❌") ? theme.danger : theme.sub,
                  background: "rgba(148,163,184,0.08)",
                  border: `1px solid ${theme.border}`,
                  padding: "6px 10px",
                  borderRadius: 8,
                }}
              >
                {phMsg}
              </span>
            )}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 16 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 12, color: theme.sub, marginBottom: 6 }}>Driver (name or ID)</label>
              <input
                value={filterDriver}
                onChange={(e) => setFilterDriver(e.target.value)}
                placeholder="e.g. Reyes or 000026411"
                style={{
                  background: theme.panel2,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  width: 240,
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 12, color: theme.sub, marginBottom: 6 }}>From date</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                style={{
                  background: theme.panel2,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 12, color: theme.sub, marginBottom: 6 }}>To date</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                style={{
                  background: theme.panel2,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              />
            </div>

            <Button variant="ghost" onClick={() => { setFilterDriver(""); setFilterFrom(""); setFilterTo(""); }}>
              Clear
            </Button>

            <div style={{ color: theme.sub }}>
              Showing {filteredPayableRows.length} of {payableResults.length}
            </div>
          </div>

          {filteredPayableRows.length > 0 && (
            <Section title="Per Shift (All Files)">
              <Table
                rows={filteredPayableRows.map(({ __startISO, __endISO, ...rest }) => rest)}
                columns={PAYABLE_COLS}
              />
            </Section>
          )}
        </Card>

        {/* DQ Checker */}
        <div style={{ marginTop: 32 }}>
          <UncertifiedDQChecker />
        </div>
      </div>
    </main>
  );
}
