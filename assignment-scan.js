(function () {
  const MONTHS =
    "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  async function extractTextFromPdf(file) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    const pdfjs = window.pdfjsLib;
    if (!pdfjs) throw new Error("PDF reader failed to load");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items.map((it) => it.str).join(" ");
      parts.push(line);
    }
    return parts.join("\n\n").replace(/\s+\n/g, "\n").trim();
  }

  async function extractTextFromImage(file) {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    if (!window.Tesseract) throw new Error("OCR failed to load");
    const { data } = await window.Tesseract.recognize(file, "eng", {
      logger: () => {}
    });
    return (data.text || "").trim();
  }

  async function extractTextFromFile(file) {
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    if (type === "application/pdf" || name.endsWith(".pdf")) {
      return extractTextFromPdf(file);
    }
    if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(name)) {
      return extractTextFromImage(file);
    }
    throw new Error("Upload a PDF or image (PNG, JPG, WEBP)");
  }

  function textToMarkdown(raw) {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const important = lines.filter((line) =>
      /due|deadline|submit|exam|quiz|homework|assignment|project|reading|lab|essay|midterm|final|pm|am|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}/i.test(
        line
      )
    );
    const body = (important.length ? important : lines.slice(0, 12))
      .slice(0, 20)
      .map((l) => "- " + l.replace(/^[-*•]\s*/, ""))
      .join("\n");
    return `# Scanned assignment\n\n${body}\n`;
  }

  function parseDateFromString(str) {
    if (!str) return null;
    const s = str.trim();

    let m = s.match(new RegExp(`(${MONTHS})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, "i"));
    if (m) {
      const d = new Date(`${m[1]} ${m[2]}, ${m[3] || new Date().getFullYear()}`);
      if (!Number.isNaN(d.getTime())) return d;
    }

    m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      const d = new Date(y, Number(m[1]) - 1, Number(m[2]), 23, 59);
      if (!Number.isNaN(d.getTime())) return d;
    }

    m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59);
      if (!Number.isNaN(d.getTime())) return d;
    }

    const rel = s.match(/due\s+(?:on\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (rel) {
      const d = new Date();
      const word = rel[1].toLowerCase();
      if (word === "tomorrow") d.setDate(d.getDate() + 1);
      else if (word !== "today") {
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const target = days.indexOf(word);
        if (target >= 0) {
          const diff = (target - d.getDay() + 7) % 7 || 7;
          d.setDate(d.getDate() + diff);
        }
      }
      d.setHours(23, 59, 0, 0);
      return d;
    }

    return null;
  }

  function extractTimeFromString(str) {
    const m = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return { h, min };
  }

  function guessCourse(lines) {
    for (const line of lines) {
      const m = line.match(/\b([A-Z]{2,4}\s*\d{3}[A-Z]?)\b/);
      if (m) return m[1].replace(/\s+/, " ");
      if (/^course\s*:/i.test(line)) return line.replace(/^course\s*:/i, "").trim().slice(0, 40);
    }
    return "";
  }

  function guessTitle(lines, dueLineIndex) {
    const idx = dueLineIndex >= 0 ? dueLineIndex : 0;
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[(idx - i + lines.length) % lines.length] || lines[i];
      if (!line) continue;
      if (/^(due|deadline|date|submit)/i.test(line)) continue;
      if (line.length < 4) continue;
      if (/^\d+$/.test(line)) continue;
      return line.replace(/^(assignment|homework|project)\s*:\s*/i, "").slice(0, 80);
    }
    return "Scanned assignment";
  }

  function guessMinutes(text) {
    const h = text.match(/(\d+)\s*(?:hours?|hrs?|h)\b/i);
    if (h) return Math.min(480, Number(h[1]) * 60);
    const m = text.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
    if (m) return Math.min(480, Number(m[1]));
    return 60;
  }

  function extractAssignmentsLocally(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const course = guessCourse(lines);
    const dueLines = [];
    lines.forEach((line, i) => {
      if (/due|deadline|submit by|hand in|due date/i.test(line)) dueLines.push(i);
    });
    if (!dueLines.length) {
      lines.forEach((line, i) => {
        if (parseDateFromString(line)) dueLines.push(i);
      });
    }
    if (!dueLines.length) dueLines.push(0);

    const seen = new Set();
    const out = [];
    for (const i of dueLines.slice(0, 5)) {
      const chunk = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
      const due = parseDateFromString(chunk) || parseDateFromString(lines[i]);
      if (!due) continue;
      const t = extractTimeFromString(chunk);
      if (t) due.setHours(t.h, t.min, 0, 0);
      const key = due.toISOString().slice(0, 16);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        title: guessTitle(lines, i),
        course,
        dueAt: due.toISOString(),
        estimatedMinutes: guessMinutes(chunk),
        notes: lines.slice(Math.max(0, i - 1), i + 2).join(" · ").slice(0, 200)
      });
    }
    if (!out.length && lines.length) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 7);
      fallback.setHours(23, 59, 0, 0);
      out.push({
        title: guessTitle(lines, 0),
        course,
        dueAt: fallback.toISOString(),
        estimatedMinutes: guessMinutes(text),
        notes: lines.slice(0, 3).join(" · ").slice(0, 200)
      });
    }
    return out;
  }

  async function extractWithEdge(text, markdown) {
    const supabase = window.FocusAuth?.getSupabase?.() || window.supabaseClient;
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    try {
      const { data, error } = await supabase.functions.invoke("scan-assignment", {
        body: { text: text.slice(0, 12000), markdown: markdown.slice(0, 12000) }
      });
      if (error || !data?.assignments?.length) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function scanFile(file) {
    const text = await extractTextFromFile(file);
    if (!text || text.length < 8) {
      throw new Error("Could not read enough text. Try a clearer photo or PDF.");
    }
    const markdown = textToMarkdown(text);
    let assignments = extractAssignmentsLocally(text);
    let source = "local";

    const edge = await extractWithEdge(text, markdown);
    if (edge?.assignments?.length) {
      assignments = edge.assignments.map((a) => ({
        title: a.title || "Assignment",
        course: a.course || "",
        dueAt: a.dueAt || a.due_at,
        estimatedMinutes: Number(a.estimatedMinutes || a.estimated_minutes) || 60,
        notes: a.notes || ""
      }));
      source = "ai";
    }

    return { text, markdown, assignments, source };
  }

  window.AssignmentScan = {
    scanFile,
    textToMarkdown,
    extractAssignmentsLocally
  };
})();
