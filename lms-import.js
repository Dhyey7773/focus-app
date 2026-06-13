(function () {
  "use strict";

  const BLOCKLIST =
    /office hours|spring break|fall break|thanksgiving break|winter break|no class|holiday|commencement|convocation|maintenance/i;

  const ASSIGNMENT_HINT =
    /assign|homework|quiz|exam|test|project|discussion|lab|essay|paper|report|midterm|final|submit|due|reading|presentation|portfolio|worksheet/i;

  function unfoldIcs(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n[ \t]/g, "");
  }

  function parseIcsDate(value) {
    if (!value) return null;
    const raw = value.trim();
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (m[4] != null) {
      const h = Number(m[4]);
      const min = Number(m[5]);
      const sec = Number(m[6] || 0);
      if (m[7] === "Z") return new Date(Date.UTC(y, mo, d, h, min, sec));
      return new Date(y, mo, d, h, min, sec);
    }
    return new Date(y, mo, d, 23, 59, 0, 0);
  }

  function decodeIcsText(value) {
    return String(value || "")
      .replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();
  }

  function extractCourse(summary, description, location) {
    const blob = `${summary} ${description} ${location}`;
    const bracket = blob.match(/\[([A-Z]{2,5}\s*\d{3}[A-Z]?)\]/i);
    if (bracket) return bracket[1].replace(/\s+/, " ").toUpperCase();
    const code = blob.match(/\b([A-Z]{2,5}\s*\d{3,4}[A-Z]?)\b/);
    if (code) return code[1].replace(/\s+/, " ").toUpperCase();
    return "";
  }

  function cleanTitle(summary, course) {
    let title = decodeIcsText(summary)
      .replace(/^assignment\s*:\s*/i, "")
      .replace(new RegExp(`\\[${course}\\]`, "i"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!title) title = "Assignment";
    return title.slice(0, 120);
  }

  function isClassSessionOnly(summary, description) {
    const text = `${summary} ${description}`.trim();
    if (ASSIGNMENT_HINT.test(text)) return false;
    return /^(class|lecture|lab(?:\s+session)?|discussion section|recitation|seminar|office hours|sync session|zoom|teams meeting)\b/i.test(
      text
    );
  }

  function isLikelyAssignment(summary, description, lmsFeed) {
    const text = `${summary} ${description}`;
    if (BLOCKLIST.test(text)) return false;
    if (lmsFeed) {
      if (isClassSessionOnly(summary, description)) return false;
      return true;
    }
    return ASSIGNMENT_HINT.test(text) || /due\b/i.test(text);
  }

  function parseIcsEvents(icsText, options) {
    options = options || {};
    const lmsFeed = options.lmsFeed !== false;
    const unfolded = unfoldIcs(icsText);
    if (!/BEGIN:VCALENDAR/i.test(unfolded)) {
      throw new Error("That link does not look like a calendar feed (.ics).");
    }

    const chunks = unfolded.split("BEGIN:VEVENT").slice(1);
    const now = Date.now();
    const horizon = now + 180 * 86400000;
    const seen = new Set();
    const out = [];

    for (const chunk of chunks) {
      const block = chunk.split("END:VEVENT")[0] || "";
      const fields = {};
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(" ")) continue;
        const idx = line.indexOf(":");
        if (idx < 1) continue;
        const key = line.slice(0, idx).split(";")[0].toUpperCase();
        fields[key] = decodeIcsText(line.slice(idx + 1));
      }

      const summary = fields.SUMMARY || fields.NAME || "";
      const description = fields.DESCRIPTION || "";
      if (!summary) continue;
      if (!isLikelyAssignment(summary, description, lmsFeed)) continue;

      const start = parseIcsDate(fields.DTSTART);
      const end = parseIcsDate(fields.DTEND);
      const due = end || start;
      if (!due || Number.isNaN(due.getTime())) continue;
      if (due.getTime() < now - 86400000 || due.getTime() > horizon) continue;

      const course = extractCourse(summary, description, fields.LOCATION || "");
      const title = cleanTitle(summary, course);
      const key = `${title}|${due.toISOString().slice(0, 16)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        title,
        course,
        dueAt: due.toISOString(),
        estimatedMinutes: 60,
        notes: description.slice(0, 160),
        source: "calendar"
      });
    }

    out.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    return out.slice(0, 60);
  }

  function importKey(item) {
    const title = String(item.title || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const course = String(item.course || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const due = item.dueAt ? new Date(item.dueAt).toISOString().slice(0, 13) : "";
    return `${course}|${title}|${due}`;
  }

  function detectPlatform(urlOrText) {
    const s = String(urlOrText || "").toLowerCase();
    if (/instructure\.com|canvas\./.test(s)) return "canvas";
    if (/brightspace\.com|d2l\./.test(s)) return "d2l";
    if (/blackboard\.com/.test(s)) return "blackboard";
    return "unknown";
  }

  function isAllowedCalendarUrl(url) {
    try {
      const u = new URL(url.trim());
      if (u.protocol !== "https:") return false;
      const host = u.hostname.toLowerCase();
      if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^localhost$|^0\./.test(host)) return false;
      if (/instructure\.com$/.test(host)) return true;
      if (/\.instructure\.com$/.test(host)) return true;
      if (/brightspace\.com$/.test(host)) return true;
      if (/\.brightspace\.com$/.test(host)) return true;
      if (/\.d2l\.com$/.test(host)) return true;
      if (/feed\.ics|calendar|feeds\/calendars/i.test(u.pathname + u.search)) return true;
      if (/\.ics(\?|$)/i.test(u.pathname + u.search)) return true;
      return false;
    } catch {
      return false;
    }
  }

  function parseCanvasD2lPaste(text) {
    const cleaned = String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\t/g, " ")
      .trim();
    if (!cleaned) return [];

    if (window.AssignmentScan?.extractAssignmentsLocally) {
      const fromScan = window.AssignmentScan.extractAssignmentsLocally(cleaned);
      if (fromScan.length) return fromScan.map((a) => ({ ...a, source: "paste" }));
    }

    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();

    function push(item) {
      const key = `${item.title}|${item.dueAt.slice(0, 16)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ...item, source: "paste" });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dueMatch = line.match(
        /(?:due|available until|closes?)\s*(?:on\s*)?(.+?)(?:\s*[·|•-]\s*|$)/i
      );
      if (!dueMatch) continue;

      const dueText = dueMatch[1].trim();
      const due = parseFlexibleDate(dueText);
      if (!due) continue;

      let title = lines[i - 1] || line.replace(dueMatch[0], "").trim();
      if (/^due\b/i.test(title) || title.length < 3) title = lines[i - 2] || "Assignment";
      title = title
        .replace(/^(assignment|quiz|discussion|lab)\s*[:\-]\s*/i, "")
        .replace(/\s*(unlocked|available).*$/i, "")
        .trim();

      let course = "";
      for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 2); j++) {
        const cm = lines[j].match(/\b([A-Z]{2,5}\s*\d{3,4}[A-Z]?)\b/);
        if (cm) {
          course = cm[1].replace(/\s+/, " ");
          break;
        }
      }

      if (BLOCKLIST.test(title)) continue;
      push({
        title: title.slice(0, 120),
        course,
        dueAt: due.toISOString(),
        estimatedMinutes: 60,
        notes: line.slice(0, 160)
      });
    }

    return out.slice(0, 30);
  }

  function parseFlexibleDate(str) {
    if (window.AssignmentScan) {
      const fn = window.AssignmentScan.parseDateFromString;
      if (typeof fn === "function") {
        const d = fn(str);
        if (d) return d;
      }
    }

    const s = String(str || "").trim();
    let m = s.match(
      /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i
    );
    if (m) {
      const d = new Date(`${m[1]} ${m[2]}, ${m[3] || new Date().getFullYear()}`);
      if (!Number.isNaN(d.getTime())) {
        if (m[4]) {
          let h = Number(m[4]);
          const min = Number(m[5] || 0);
          const ap = (m[6] || "").toLowerCase();
          if (ap === "pm" && h < 12) h += 12;
          if (ap === "am" && h === 12) h = 0;
          d.setHours(h, min, 0, 0);
        } else {
          d.setHours(23, 59, 0, 0);
        }
        return d;
      }
    }

    m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (m) {
      let y = Number(m[3]) || new Date().getFullYear();
      if (y < 100) y += 2000;
      const d = new Date(y, Number(m[1]) - 1, Number(m[2]), 23, 59, 0, 0);
      if (m[4]) {
        let h = Number(m[4]);
        const min = Number(m[5] || 0);
        const ap = (m[6] || "").toLowerCase();
        if (ap === "pm" && h < 12) h += 12;
        if (ap === "am" && h === 12) h = 0;
        d.setHours(h, min, 0, 0);
      }
      if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
  }

  async function fetchCalendarFeed(calendarUrl) {
    const url = String(calendarUrl || "").trim();
    if (!isAllowedCalendarUrl(url)) {
      throw new Error("Use your Canvas or D2L calendar feed link (https, .ics or calendar feed).");
    }

    const supabase = window.FocusAuth?.getSupabase?.() || window.supabaseClient;
    if (!supabase) throw new Error("Sign in to import from a calendar link.");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to import from a calendar link.");

    const { data, error } = await supabase.functions.invoke("fetch-calendar", {
      body: { url }
    });

    if (error) throw new Error(error.message || "Could not fetch calendar.");
    if (data?.error) throw new Error(data.error);
    if (!data?.ics) throw new Error("Calendar feed returned no data.");

    return parseIcsEvents(data.ics, { lmsFeed: true });
  }

  function splitNewAssignments(existing, incoming) {
    const keys = new Set((existing || []).map(importKey));
    const fresh = [];
    let skipped = 0;
    for (const item of incoming || []) {
      const key = importKey(item);
      if (keys.has(key)) {
        skipped++;
        continue;
      }
      keys.add(key);
      fresh.push(item);
    }
    return { fresh, skipped, total: (incoming || []).length };
  }

  function helpSteps(platform) {
    if (platform === "canvas") {
      return [
        "Open Canvas → Calendar (left sidebar).",
        "Click Calendar Feed or Subscribe (.ics link).",
        "Copy the feed URL and paste it here.",
        "Re-import anytime — takes ~10 seconds."
      ];
    }
    if (platform === "d2l") {
      return [
        "Open D2L Brightspace → Calendar.",
        "Choose Subscribe or Get calendar link (.ics).",
        "Copy the URL and paste it here.",
        "Works at MTSU and most transfer schools using D2L."
      ];
    }
    return [
      "Canvas: Calendar → Calendar Feed → copy .ics URL.",
      "D2L: Calendar → Subscribe → copy link.",
      "Paste here once per week during syllabus season."
    ];
  }

  window.LmsImport = {
    parseIcsEvents,
    parseCanvasD2lPaste,
    fetchCalendarFeed,
    detectPlatform,
    isAllowedCalendarUrl,
    helpSteps,
    importKey,
    splitNewAssignments
  };
})();
