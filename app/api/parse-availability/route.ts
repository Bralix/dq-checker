import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { driverName: string; status: string };

/* ---------- PDF text extraction with pdf2json (no canvas/worker) ---------- */
async function extractPdfText(buf: Buffer): Promise<string> {
  // pdf2json is CJS
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFParser = require("pdf2json");
  const parser = new PDFParser();

  return new Promise<string>((resolve, reject) => {
    parser.on("pdfParser_dataError", (err: any) =>
      reject(err?.parserError || err || new Error("Unknown PDF parse error"))
    );
    parser.on("pdfParser_dataReady", (pdfData: any) => {
      const pieces: string[] = [];
      for (const page of pdfData?.Pages ?? []) {
        for (const text of page?.Texts ?? []) {
          for (const run of text?.R ?? []) {
            // pdf2json encodes text; decode to real strings
            const s = decodeURIComponent(run?.T ?? "");
            if (s) pieces.push(s);
          }
        }
        pieces.push("\n"); // page separator
      }
      resolve(pieces.join(" "));
    });
    parser.parseBuffer(buf);
  });
}

/* ---------- Your availability line parser ---------- */
function extractRowsFromText(text: string): Row[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const STATUS = ["ON","OFF","DRIVING","D","SB","SLEEPER","NO DATA","NO-DATA"];
  const rows: Row[] = [];

  const patterns: RegExp[] = [
    /^(?<name>[^|]+?)\s{2,}(?<status>ON|OFF|DRIVING|D|SB|SLEEPER|NO\s*DATA)$/i,
    /^(?<name>[^|]+?)\s*[|•]\s*(?<status>ON|OFF|DRIVING|D|SB|SLEEPER|NO\s*DATA)$/i,
    /^(?<name>.+?)\s+(?:Last\s+Calculated\s+Status:|Status:)\s*(?<status>ON|OFF|DRIVING|D|SB|SLEEPER|NO\s*DATA)$/i,
  ];

  for (const line of lines) {
    for (const rx of patterns) {
      const m = line.match(rx);
      if (m?.groups) {
        const name = (m.groups.name || "").replace(/\s+/g, " ").trim();
        const status = (m.groups.status || "").replace(/\s+/g, " ").toUpperCase();
        if (name && STATUS.includes(status)) {
          rows.push({ driverName: name, status });
          break;
        }
      }
    }
  }

  if (!rows.length) {
    for (const line of lines) {
      const hit = STATUS.find(s => new RegExp(`\\b${s}\\b`, "i").test(line));
      if (hit) {
        const name = line
          .replace(new RegExp(`\\b${hit}\\b`, "i"), "")
          .trim()
          .replace(/[|•]+$/, "")
          .trim();
        if (name) rows.push({ driverName: name, status: hit.toUpperCase() });
      }
    }
  }
  return rows;
}

/* ---------- Next handlers ---------- */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No 'file' field found in form-data." }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) return NextResponse.json({ error: "Uploaded file is empty (0 bytes)." }, { status: 400 });

    let text = "";
    try {
      text = await extractPdfText(buf);
    } catch (err: any) {
      console.error("[parse-availability] pdf2json failed:", err);
      return NextResponse.json(
        { error: "pdf2json failed to extract text", reason: String(err?.message || err) },
        { status: 500 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Parsed PDF but extracted no text.", hint: "If this is a scanned PDF, use CSV/XLSX instead." },
        { status: 422 }
      );
    }

    const rows = extractRowsFromText(text);
    if (!rows.length) {
      return NextResponse.json(
        { error: "No rows detected (Driver Name + Status).", preview: text.slice(0, 1200) },
        { status: 422 }
      );
    }

    return NextResponse.json({ rows });
  } catch (err: any) {
    console.error("[parse-availability] Uncaught:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
