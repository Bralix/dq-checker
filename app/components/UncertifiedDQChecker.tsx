// UncertifiedDQChecker.tsx
"use client";

import React, { useRef, useState, useLayoutEffect } from "react";
import * as XLSX from "xlsx";

/* ===== UI bits ===== */
const theme = { panel:"#0f172a", panel2:"#0b1220", border:"#1e293b", text:"#e5e7eb", sub:"#94a3b8", brand:"#06b6d4" };

/** Full-bleed wrapper that fills the screen width WITHOUT causing the tiny horizontal scrollbar.
 * It measures the OS scrollbar width and subtracts it from 100vw.
 */
function FullBleed({ children }: { children: React.ReactNode }) {
  const [sw, setSw] = useState(0); // scrollbar width in px

  useLayoutEffect(() => {
    const calc = () => {
      const w = window.innerWidth - document.documentElement.clientWidth;
      setSw(Math.max(0, w));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const PAD = 8;

  return (
    <div
      style={{
        width: `calc(100vw - ${sw}px)`,
        maxWidth: `calc(100vw - ${sw}px)`,
        position: "relative",
        left: "50%",
        right: "50%",
        marginLeft: `calc(-50vw + ${sw / 2}px)`,
        marginRight: `calc(-50vw + ${sw / 2}px)`,
        paddingLeft: PAD,
        paddingRight: PAD,
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Card(p: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} style={{ background:theme.panel, border:`1px solid ${theme.border}`, borderRadius:14, padding:16, ...(p.style||{}) }}/>;
}
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & {loading?: boolean}) {
  const { loading, disabled, children, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={{
        padding:"10px 16px", borderRadius:10, border:"1px solid transparent",
        background:`linear-gradient(135deg, ${theme.brand}, #7c3aed)`, color:"#fff",
        fontWeight:700, cursor:(disabled||loading)?"not-allowed":"pointer",
        display:"inline-flex", alignItems:"center", gap:8
      }}
    >
      {loading && <span style={{
        width:14, height:14, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.4)",
        borderTopColor:"#fff", display:"inline-block", animation:"spin 0.8s linear infinite"
      }}/>}
      {loading ? "Processing…" : children}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
function ButtonGhost(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} style={{
      padding:"10px 16px", borderRadius:10, border:`1px solid ${theme.border}`,
      background:theme.panel2, color:theme.text, fontWeight:700, cursor:"pointer"
    }}/>
  );
}
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span title={String(children)} style={{
      background:"rgba(124,58,237,0.12)", border:`1px solid ${theme.border}`, color:theme.text,
      padding:"4px 8px", borderRadius:8, fontSize:12, maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
    }}>{children}</span>
  );
}
function FilePicker({
  label, accept, onFiles, hint,
}: { label: React.ReactNode; accept: string; onFiles: (f: File[])=>void; hint?: string; }) {
  const ref = useRef<HTMLInputElement>(null);
  const handle = (fl: FileList|null) => { if (!fl || fl.length===0) return; onFiles(Array.from(fl)); };
  return (
    <div>
      <div style={{ color:theme.text, fontWeight:800, marginBottom:6 }}>{label}</div>
      <div onClick={()=>ref.current?.click()} style={{
        background:theme.panel2, border:`1px dashed ${theme.border}`, borderRadius:12,
        padding:14, color:theme.sub, cursor:"pointer"
      }}>Click to choose or drop file(s)</div>
      {!!hint && <div style={{ color:theme.sub, fontSize:12, marginTop:6 }}>{hint}</div>}
      <input
        ref={ref} type="file" accept={accept} multiple style={{ display:"none" }}
        onChange={(e)=>handle(e.target.files)}
        onDrop={(e)=>{ e.preventDefault(); handle(e.dataTransfer?.files ?? null); }}
        onDragOver={(e)=>e.preventDefault()}
      />
    </div>
  );
}

// Floating-scrollbar table
function Table({ rows }: { rows:any[] }) {
  const cols = ["Driver ID","Driver Name","Event Details","Verdict"];
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = React.useState(false);
  const [ghostWidth, setGhostWidth] = React.useState<number>(0);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => {
      const needed = el.scrollWidth > el.clientWidth + 2;
      setNeedsScroll(needed);
      setGhostWidth(el.scrollWidth);
    };
    check();
    const obs = new ResizeObserver(check);
    obs.observe(el);
    window.addEventListener("resize", check);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [rows]);

  const onWrapScroll = () => {
    const wrap = wrapRef.current, ghost = ghostRef.current;
    if (!wrap || !ghost) return;
    if (Math.abs(ghost.scrollLeft - wrap.scrollLeft) > 1) ghost.scrollLeft = wrap.scrollLeft;
  };
  const onGhostScroll = () => {
    const wrap = wrapRef.current, ghost = ghostRef.current;
    if (!wrap || !ghost) return;
    if (Math.abs(wrap.scrollLeft - ghost.scrollLeft) > 1) wrap.scrollLeft = ghost.scrollLeft;
  };

  if (!rows.length) return <div style={{ color:theme.sub }}>No results yet.</div>;

  return (
    <div style={{ position:"relative" }}>
      <div
        ref={wrapRef}
        onScroll={onWrapScroll}
        style={{ overflow:"auto", border:`1px solid ${theme.border}`, borderRadius:12 }}
      >
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14, minWidth:720 }}>
          <thead style={{ position:"sticky", top:0, background:theme.panel2, zIndex:1 }}>
            <tr>{cols.map(c=>
              <th key={c} style={{ textAlign:"left", padding:"10px 12px", borderBottom:`1px solid ${theme.border}`, color:theme.sub, whiteSpace:"nowrap" }}>{c}</th>
            )}</tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} style={{ background:i%2?"rgba(148,163,184,0.04)":"transparent" }}>
                {cols.map(c=>
                  <td key={c} style={{ padding:"10px 12px", borderBottom:`1px solid ${theme.border}`, whiteSpace:"nowrap" }}>
                    {r[c] ?? ""}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {needsScroll && (
        <div
          style={{
            position:"sticky",
            bottom:-2,
            paddingTop:8,
            background:"linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(10,15,28,0.75) 60%, rgba(10,15,28,1) 100%)",
          }}
        >
          <div
            ref={ghostRef}
            onScroll={onGhostScroll}
            style={{
              height:12,
              overflowX:"auto",
              overflowY:"hidden",
              border:`1px solid ${theme.border}`,
              borderRadius:8,
              background:theme.panel2,
            }}
          >
            <div style={{ width:ghostWidth, height:1 }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Logic helpers (aligned to main page) ===== */
const CERT_WINDOW_MIN = 60;                 // passenger grace after shift start
const NEAR_RESET_GRACE_MIN = 30;            // same as main page
const TEN_HOURS_MS = 10 * 3600000;          // full reset
const START_BREAK_MIN_MS = TEN_HOURS_MS - NEAR_RESET_GRACE_MIN * 60000; // 9h30m OFF/SB
const USE_NEXT_DAY_BOUNDARY = false;        // set true if you roll “log day” to prior day
const LOOKBACK_DAYS = 60;                   // limit output

// yard-move blips tolerance
const BLIP_MAX_MIN = 10;                    // treat yard-move blips <= 10 min as noise
const BLIP_MAX_MS  = BLIP_MAX_MIN * 60000;

const iso = (d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addDays = (d:Date,n:number)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };

function toDate(v:any): Date|null {
  if (v instanceof Date) return v;
  if (typeof v==="number") { const p=XLSX.SSF.parse_date_code(v); if (p && p.y!=null) return new Date(p.y,(p.m||1)-1,p.d||1,p.H||0,p.M||0,Math.floor(p.S||0)); }
  if (typeof v==="string") { const d=new Date(v); if (!isNaN(d.getTime())) return d; }
  return null;
}
function combine(dateVal:any, timeVal:any): Date|null {
  const d=toDate(dateVal); if (!d) return null;
  const t=toDate(timeVal);
  if (t) { const o=new Date(d); o.setHours(t.getHours(),t.getMinutes(),t.getSeconds(),0); return o; }
  const s=String(timeVal??""); const m=s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (m){ let hh=+m[1]; const mm=+m[2]; const ss=m[3]?+m[3]:0; const ap=m[4].toUpperCase(); if(ap==="AM") hh=hh===12?0:hh; else hh=hh===12?12:hh+12; const o=new Date(d); o.setHours(hh,mm,ss,0); return o;}
  return new Date(d);
}
function eventStatus(text:string){
  const u = String(text??"").toUpperCase();
  if (/DUTY\s*STATUS\s*-\s*D\b/.test(u) || /\bDRIV(ING)?\b/.test(u)) return "D";
  if (/DUTY\s*STATUS\s*-\s*ON\b/.test(u) || /\bON\s*DUTY\b/.test(u)) return "ON";
  if (/\bOFF\b/.test(u)) return "OFF";
  if (/\bSLEEPER\b/.test(u) || /\b\bsb\b/i.test(text)) return "SB";
  return "";
}
function dateKey(ts: Date): string {
  if (!USE_NEXT_DAY_BOUNDARY) return iso(ts);
  const d = new Date(ts); d.setDate(d.getDate()-1); return iso(d);
}
function extractIdAndName(displayName: string): {id:string; name:string} {
  const m = displayName.match(/\((\d{5,})\)\s*$/);
  const id = m ? m[1] : "";
  const name = m ? displayName.replace(m[0], "").trim().replace(/[,\s]+$/,"") : displayName;
  return { id, name };
}

/* ===== Build driver timelines from logs (events + certifications) ===== */
type Evt = { ts: Date; status: "ON"|"D"|"OFF"|"SB" };
type Bucket = {
  displayName: string; driverId: string; driverName: string;
  events: Evt[];                      // ordered
  certByDate: Map<string, Date[]>;   // dateISO -> certification timestamps (actual time cert done)
};

async function readWB(file: File){ const buf = await file.arrayBuffer(); return XLSX.read(buf,{type:"array"}); }

function parseDateFromString(s:string): Date|null {
  const a = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if (a){ const d=new Date(+a[1],+a[2]-1,+a[3]); return isNaN(d.getTime())?null:d; }
  const b = s.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/); if (b){ let y=+b[3]; if(y<100) y+=2000; const d=new Date(y,+b[1]-1,+b[2]); return isNaN(d.getTime())?null:d; }
  return null;
}

async function buildBuckets(files: File[]): Promise<Map<string, Bucket>> {
  const idx = new Map<string, Bucket>();

  for (const f of files){
    const wb = await readWB(f);
    for (const s of wb.SheetNames){
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[s], {defval:null});
      if (!rows.length) continue;

      const { id:driverId, name:driverName } = extractIdAndName(s);
      const key = (driverName||s).toLowerCase().replace(/\s+/g," ").trim();
      const bucket: Bucket = idx.get(key) || { displayName:s, driverId, driverName, events:[], certByDate:new Map() };

      const lower = Object.keys(rows[0]||{}).reduce((m,k)=>{m[k.toLowerCase()]=k; return m;},{} as Record<string,string>);
      const evK  = Object.keys(lower).find(k=>k.includes("event"));
      const detK = Object.keys(lower).find(k=>k.includes("detail"));
      const sdK  = Object.keys(lower).find(k=>k.includes("start")&&k.includes("date"));
      const stK  = Object.keys(lower).find(k=>k.includes("start")&&k.includes("time"));
      const edK  = Object.keys(lower).find(k=>k.includes("end")&&k.includes("date"));
      const etK  = Object.keys(lower).find(k=>k.includes("end")&&k.includes("time"));
      const logDateK = Object.keys(lower).find(k=>k.includes("log")&&k.includes("date"));

      for (const r of rows){
        // timestamp
        let ts: Date|null = null;
        if (sdK || stK) ts = combine(r[lower[sdK!]], r[lower[stK!]]);
        if ((!ts || isNaN(ts.getTime())) && (edK || etK)) ts = combine(r[lower[edK!]], r[lower[etK!]]);
        if (!ts || isNaN(ts.getTime())) continue;

        // duty status
        const joined = [evK? String(r[lower[evK]] ?? ""):"", detK? String(r[lower[detK]] ?? ""):""].join(" | ");
        const st = eventStatus(joined);
        if (st) bucket.events.push({ ts, status: st as any });

        // certifications (map the certified LOG DATE -> actual certification time)
        const lineAll = Object.values(r).map(v=>String(v??"")).join(" | ");
        if (/certif/i.test(lineAll)) {
          let target: Date|null = null;
          const candidates: string[] = [];
          if (detK) candidates.push(String(r[lower[detK]] ?? ""));
          for (const v of Object.values(r)) if (typeof v==="string" || typeof v==="number") candidates.push(String(v));
          for (const sTxt of candidates){ const d=parseDateFromString(sTxt); if (d){ target=d; break; } }
          if (!target && logDateK) {
            const d2 = toDate(r[lower[logDateK]]);
            if (d2) target = d2;
          }
          if (!target) { const prev = new Date(ts); prev.setDate(prev.getDate()-1); target = prev; }
          const k = iso(target);
          const arr = bucket.certByDate.get(k) || [];
          arr.push(ts);                         // record the actual time the user certified
          arr.sort((a,b)=>a.getTime()-b.getTime());
          bucket.certByDate.set(k, arr);
        }
      }

      bucket.events.sort((a,b)=>a.ts.getTime()-b.ts.getTime());
      idx.set(key, bucket);
    }
  }

  return idx;
}

/* ===== Shift detection (with yard-blip tolerance) ===== */
// Returns array of shift start timestamps (when OFF/SB block >= 9h30m ends and ON/D starts)
function detectShiftStarts(events: Evt[]): Date[] {
  const starts: Date[] = [];
  if (!events.length) return starts;

  const isOffish = (s: Evt["status"]) => s === "OFF" || s === "SB";
  const isWork   = (s: Evt["status"]) => s === "ON" || s === "D";

  let i = 0;
  while (i < events.length - 1) {
    const cur = events[i];

    if (isOffish(cur.status)) {
      const blockStart = cur.ts;
      let k = i;
      let endIndex = k;

      while (k < events.length - 1) {
        const a = events[k];
        const b = events[k + 1];
        const durMs = Math.max(0, b.ts.getTime() - a.ts.getTime());

        if (isOffish(a.status)) {
          endIndex = k + 1;
          k++;
          continue;
        }

        if (isWork(a.status)) {
          const prevIsOff = k - 1 >= 0 ? isOffish(events[k - 1].status) : false;
          const nextIsOff = isOffish(b.status);

          // yard-move blip inside OFF block
          if (prevIsOff && nextIsOff && durMs <= BLIP_MAX_MS) {
            endIndex = k + 1;
            k++;
            continue;
          } else {
            break; // real work break
          }
        }
        break;
      }

      const blockEnd = events[endIndex].ts;
      const blockMs = Math.max(0, blockEnd.getTime() - blockStart.getTime());

      const nextEvt = events[endIndex];
      if (blockMs >= START_BREAK_MIN_MS && nextEvt && isWork(nextEvt.status)) {
        starts.push(nextEvt.ts);
      }

      i = Math.max(i + 1, endIndex);
      continue;
    }

    i++;
  }

  return starts.sort((a,b)=>a.getTime()-b.getTime());
}

/* ===== Day grouping & helpers ===== */
function groupByDate(events: Evt[]){
  const map = new Map<string, Evt[]>();
  for (const e of events){
    const key = dateKey(e.ts);
    const arr = map.get(key) || [];
    arr.push(e);
    map.set(key, arr);
  }
  for (const [k, arr] of map) arr.sort((a,b)=>a.ts.getTime()-b.ts.getTime());
  return map;
}
function hasShift(arr:Evt[]){ return arr.some(e=>e.status==="ON" || e.status==="D"); }
function firstOfType(arr:Evt[], type:"ON"|"D"){ return arr.find(e=>e.status===type) || null; }
function lastShiftStartAtOrBefore(starts: Date[], t: Date): Date | null {
  let best: Date | null = null;
  const tMs = t.getTime();
  for (const s of starts) {
    const sMs = s.getTime();
    if (sMs <= tMs) {
      if (!best || sMs > best.getTime()) {
        best = s;
      }
    }
  }
  return best;
}



/** Determine prior uncertified *shift* days relative to cutoff time T (only days < iso(T)). */
function missingPriorShiftDaysByTime(
  dayOrder: string[],
  perDay: Map<string,{events:Evt[]}>,
  certByDate: Map<string, Date[]>,
  T: Date
){
  const cutoffDay = iso(T);
  const missing: string[] = [];
  for (const y of dayOrder){
    if (y >= cutoffDay) break;         // only prior days
    const ev = perDay.get(y)?.events || [];
    if (!hasShift(ev)) continue;       // ignore pure OFF-only days
    const certs = certByDate.get(y) || [];
    const ok = certs.some(c => c.getTime() <= T.getTime());
    if (!ok) missing.push(y);
  }
  return missing;
}

/* ===== Component ===== */
export default function UncertifiedDQChecker() {
  const [logFiles, setLogFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [processing, setProcessing] = useState(false);

  // keep multi-file add/merge (no duplicates)
  const addLogs = (files: File[]) => setLogFiles(prev=>{
    const all=[...prev,...files]; const seen=new Set<string>();
    return all.filter(f=>{ const k=f.name+"|"+f.size; if (seen.has(k)) return false; seen.add(k); return true; });
  });

  async function run() {
    setRows([]); setMsg(""); setProcessing(true);
    if (!logFiles.length) { setMsg("Upload at least one Driver Logs workbook."); setProcessing(false); return; }

    try {
      const idx = await buildBuckets(logFiles);
      const out:any[] = [];
      const now = new Date();
      const cutoff = addDays(now, -LOOKBACK_DAYS);

      for (const bucket of idx.values()){
        if (!bucket.events.length) continue;

        const byDate = groupByDate(bucket.events);
        const dayOrder = Array.from(byDate.keys()).sort();
        const perDay = new Map([...byDate].map(([k,v])=>[k,{events:v}]));
        const shiftStarts = detectShiftStarts(bucket.events);

        // NEW: Track which shift-starts we've already emitted for this driver to avoid cross-day duplicates
        const emittedShiftStarts = new Set<string>();

        for (const D of dayOrder){
          const ev = byDate.get(D)!;
          if (!ev.length) continue;

          const dayStart = new Date(D+"T00:00:00");
          if (dayStart < cutoff) continue;

          const firstON = firstOfType(ev, "ON");
          const firstD  = firstOfType(ev, "D");
          if (!firstON && !firstD) continue; // nothing relevant

          // Anchor for messaging
          const anchorRefTime = (firstD || firstON)!.ts;
          const anchorShiftStart = lastShiftStartAtOrBefore(shiftStarts, anchorRefTime);

          // DRIVING present today
          if (firstD) {
            const cutoffTime = firstD.ts; // morning certs before drive are allowed
            const missing = missingPriorShiftDaysByTime(dayOrder, perDay, bucket.certByDate, cutoffTime);

            const prevISO = (() => { const d0 = new Date(D + "T00:00:00"); d0.setDate(d0.getDate() - 1); return iso(d0); })();

            let isContinuation = false;
            {
              let lastWork: Date | null = null;
              for (const e of bucket.events) {
                if ((e.status === "ON" || e.status === "D") && e.ts <= firstD.ts) {
                  if (!lastWork || e.ts > lastWork) lastWork = e.ts;
                }
              }
              if (lastWork) isContinuation = iso(lastWork) < D;
            }

            let filteredMissing = isContinuation ? missing.filter(d => d !== prevISO) : missing;

            // Exempt the shift-start day while still in this same shift
            if (anchorShiftStart) {
              const shiftStartISO = iso(anchorShiftStart);
              const nextStart = shiftStarts.find(s => s.getTime() > anchorShiftStart.getTime());
              const stillInSameShift = !nextStart || cutoffTime.getTime() < nextStart.getTime();
              if (stillInSameShift) {
                filteredMissing = filteredMissing.filter(d => d !== shiftStartISO);
              }
            }

            // EMIT-GUARD: only one row per shift-start per driver
            const startISO = anchorShiftStart ? iso(anchorShiftStart) : "(unknown)";
            const emitKey = `${bucket.driverId || bucket.driverName}|${startISO}`;
            if (!emittedShiftStarts.has(emitKey)) {
              emittedShiftStarts.add(emitKey);

              out.push({
                "Driver ID": bucket.driverId || "",
                "Driver Name": bucket.driverName || bucket.displayName,
                "Event Details": filteredMissing.length
                  ? `Shift start ${anchorShiftStart ? anchorShiftStart.toLocaleString() : "(unknown)"} • ${filteredMissing.length} prior uncertified day(s), earliest ${filteredMissing[0]}`
                  : `Shift start ${anchorShiftStart ? anchorShiftStart.toLocaleString() : "(unknown)"} • Certified before first DRIVING`,
                "Verdict": filteredMissing.length ? "❌ Disqualified" : "✅ Qualified",
              });
            }
            continue;
          }

          // ON-only day (passenger / no driving events on this date):
          const anchorToday =
            shiftStarts.find(ts => iso(ts) === D) ||
            (anchorShiftStart && iso(anchorShiftStart) === D ? anchorShiftStart : null);

          if (anchorToday) {
            const plus = new Date(anchorToday.getTime() + CERT_WINDOW_MIN*60000);
            const missingByPlus = missingPriorShiftDaysByTime(dayOrder, perDay, bucket.certByDate, plus);

            // Exempt the shift-start day while still in the same shift window
            let filtered = missingByPlus;
            const shiftStartISO = iso(anchorToday);
            const nextStart = shiftStarts.find(s => s.getTime() > anchorToday.getTime());
            const stillInSameShift = !nextStart || plus.getTime() < nextStart.getTime();
            if (stillInSameShift) {
              filtered = filtered.filter(d => d !== shiftStartISO);
            }

            // EMIT-GUARD: only one row per shift-start per driver
            const startISO = iso(anchorToday);
            const emitKey = `${bucket.driverId || bucket.driverName}|${startISO}`;
            if (!emittedShiftStarts.has(emitKey)) {
              emittedShiftStarts.add(emitKey);

              out.push({
                "Driver ID": bucket.driverId || "",
                "Driver Name": bucket.driverName || bucket.displayName,
                "Event Details": filtered.length
                  ? `Shift start ${anchorToday.toLocaleString()} • ${filtered.length} prior uncertified day(s), earliest ${filtered[0]}`
                  : `Shift start ${anchorToday.toLocaleString()} • Cleared backlog within ±${CERT_WINDOW_MIN}m`,
                "Verdict": filtered.length ? "❌ Disqualified" : "✅ Qualified",
              });
            }
            continue;
          }

          // ON-only continuation (no detected start today)
          const tempCutoff = firstON!.ts;
          const missingCont = missingPriorShiftDaysByTime(dayOrder, perDay, bucket.certByDate, tempCutoff);

          // Apply the same exemption logic for ongoing shift
          let filteredCont = missingCont;
          if (anchorShiftStart) {
            const shiftStartISO = iso(anchorShiftStart);
            const nextStart = shiftStarts.find(s => s.getTime() > anchorShiftStart.getTime());
            const stillInSameShift = !nextStart || tempCutoff.getTime() < nextStart.getTime();
            if (stillInSameShift) {
              filteredCont = filteredCont.filter(d => d !== shiftStartISO);
            }
          }

          // EMIT-GUARD: only one row per shift-start per driver
          const startISO = anchorShiftStart ? iso(anchorShiftStart) : "(unknown)";
          const emitKey = `${bucket.driverId || bucket.driverName}|${startISO}`;
          if (!emittedShiftStarts.has(emitKey)) {
            emittedShiftStarts.add(emitKey);

            out.push({
              "Driver ID": bucket.driverId || "",
              "Driver Name": bucket.driverName || bucket.displayName,
              "Event Details": filteredCont.length
                ? `Shift start ${anchorShiftStart ? anchorShiftStart.toLocaleString() : "(prior day)"} • ${filteredCont.length} prior uncertified day(s), earliest ${filteredCont[0]}`
                : `Shift start ${anchorShiftStart ? anchorShiftStart.toLocaleString() : "(prior day)"} • All required prior days certified`,
              "Verdict": filteredCont.length ? "❌ Disqualified" : "✅ Qualified",
            });
          }
        }
      }

      // ---- NEW: De-duplicate identical rows (prevents doubles when overlapping files are uploaded)
      const uniq: any[] = [];
      const seen = new Set<string>();
      for (const r of out) {
        const key = `${r["Driver ID"]}|${r["Driver Name"]}|${r["Event Details"]}|${r["Verdict"]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(r);
      }

      setRows(uniq);
      setMsg(`Done. ${uniq.length} row(s).`);
    } catch (e:any) {
      setMsg("Error: " + e.message);
    } finally {
      setProcessing(false);
    }
  }

  function downloadExcel(){
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "On-Road Cert Check");
    XLSX.writeFile(wb, "OnRoad_Cert_Check.xlsx");
  }

  function clearAll(){
    setLogFiles([]);
    setRows([]);
    setMsg("");
  }

  return (
    <FullBleed>
      <h2 style={{ margin:"2px 0 10px" }}>On-Road Uncertified Log Check — Shift-Aware</h2>

      <Card>
        <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:16 }}>
          <FilePicker
            label="Driver Logs Workbook(s) (.xlsx)"
            accept=".xlsx,.xls"
            onFiles={addLogs}
            hint="Each sheet = one driver (events + certification rows)."
          />
        </div>

        {/* show selected logs */}
        <div style={{ marginTop: 12 }}>
          <div style={{ color: theme.sub, fontSize: 13, marginBottom: 4 }}>Selected Files:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {logFiles.length ? logFiles.map((f, i) => <Chip key={i}>{f.name}</Chip>) : <span style={{ color: theme.sub }}>None</span>}
          </div>
        </div>

        <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:14, flexWrap:"wrap" }}>
          <Button onClick={run} loading={processing}>Run</Button>
          <ButtonGhost onClick={downloadExcel} disabled={!rows.length || processing}>Download Excel</ButtonGhost>
          <ButtonGhost onClick={clearAll} disabled={processing}>Clear</ButtonGhost>
          <span style={{ color:theme.sub }}>{msg}</span>
        </div>
      </Card>

      <div style={{ marginTop:12 }}>
        <Card>
          <div style={{ fontWeight:800, marginBottom:10 }}>Results</div>
          <Table rows={rows}/>
        </Card>
      </div>
    </FullBleed>
  );
}
