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
      const min = Number(m[5]);a
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

  function isExpiredCalendarResponse(text) {
    const s = String(text || "");
    if (/BEGIN:VCALENDAR/i.test(s)) return false;
    return /sessionExpired|d2l\/login|<html|<!DOCTYPE/i.test(s);
  }

  function assertValidIcsText(icsText, context) {
    const s = String(icsText || "");
    if (/BEGIN:VCALENDAR/i.test(s)) return;
    if (isExpiredCalendarResponse(s)) {
      throw new Error("Your D2L Subscribe link expired. In D2L: Calendar → Subscribe → copy a fresh link.");
    }
    if (looksLikeCalendarUrl(s)) {
      throw new Error("That is a link — paste it in the top box and tap Connect, not in Paste calendar text.");
    }
    if (context === "paste") {
      throw new Error("Not calendar text. Open your Subscribe link in Safari, copy everything starting with BEGIN:VCALENDAR.");
    }
    throw new Error("D2L did not return calendar data. Get a fresh Subscribe link or paste calendar text.");
  }

  function parseIcsEvents(icsText, options) {
    options = options || {};
    const lmsFeed = options.lmsFeed !== false;
    const unfolded = unfoldIcs(icsText);
    assertValidIcsText(unfolded, options.context || "feed");

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

  function normalizeTitleForMatch(title) {
    return String(title || "")
      .toLowerCase()
      .replace(/\s*-\s*(available|due|closed|ends?|submitted|no longer available)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchKey(item) {
    const course = String(item.course || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    return `${course}|${normalizeTitleForMatch(item.title)}`;
  }

  function pickBestAssignment(list) {
    return [...list].sort((a, b) => {
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const da = new Date(a.dueAt || 0).getTime();
      const db = new Date(b.dueAt || 0).getTime();
      if (da !== db) return db - da;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })[0];
  }

  function mergeCalendarImport(existing, incoming) {
    let list = [...(existing || [])];
    const feed = [...(incoming || [])];

    const feedByMatch = new Map();
    for (const item of feed) {
      const mk = matchKey(item);
      const prev = feedByMatch.get(mk);
      if (!prev || new Date(item.dueAt || 0) >= new Date(prev.dueAt || 0)) {
        feedByMatch.set(mk, item);
      }
    }
    const feedItems = [...feedByMatch.values()];

    const removedIds = [];
    let deduped = 0;
    let added = 0;
    let updated = 0;
    let reopened = 0;
    let skipped = 0;
    const fresh = [];
    const touched = [];

    const groups = new Map();
    for (const a of list) {
      const mk = matchKey(a);
      if (!groups.has(mk)) groups.set(mk, []);
      groups.get(mk).push(a);
    }

    for (const [, dupes] of groups) {
      if (dupes.length <= 1) continue;
      const keep = pickBestAssignment(dupes);
      for (const a of dupes) {
        if (a.id === keep.id) continue;
        removedIds.push(a.id);
        deduped++;
        list = list.filter(x => x.id !== a.id);
      }
    }

    const byMatch = new Map();
    for (const a of list) {
      byMatch.set(matchKey(a), a);
    }

    for (const item of feedItems) {
      const mk = matchKey(item);
      const target = byMatch.get(mk);

      if (!target) {
        fresh.push({ ...item, source: "calendar" });
        added++;
        continue;
      }

      let changed = false;

      if (target.completed) {
        target.completed = false;
        target.completedAt = null;
        target.remindersShown = { h24: false, h6: false, h1: false };
        reopened++;
        changed = true;
      }

      if (item.dueAt && target.dueAt !== item.dueAt) {
        target.dueAt = item.dueAt;
        updated++;
        changed = true;
      }

      const nextTitle = String(item.title || "").trim();
      if (nextTitle && target.title !== nextTitle) {
        target.title = nextTitle;
        changed = true;
      }

      const nextCourse = String(item.course || "").trim();
      if ((target.course || "") !== nextCourse) {
        target.course = nextCourse;
        changed = true;
      }

      const nextEst = Number(item.estimatedMinutes) || 0;
      if (nextEst && target.estimatedMinutes !== nextEst) {
        target.estimatedMinutes = nextEst;
        changed = true;
      }

      if (changed) {
        target.source = target.source || "calendar";
        touched.push(target);
      } else {
        skipped++;
      }
    }

    return {
      fresh,
      touched,
      removedIds,
      added,
      updated,
      reopened,
      deduped,
      skipped,
      total: feedItems.length
    };
  }

  function splitNewAssignments(existing, incoming) {
    const merged = mergeCalendarImport(existing, incoming);
    return {
      fresh: merged.fresh,
      skipped: merged.skipped,
      total: merged.total,
      merge: merged
    };
  }

  function detectPlatform(urlOrText) {
    const s = String(urlOrText || "").toLowerCase();
    if (/instructure\.com|canvas\./.test(s)) return "canvas";
    if (/brightspace\.com|d2l\.|\/d2l\/|elearn\.|mscc\.edu/.test(s)) return "d2l";
    if (/blackboard\.com/.test(s)) return "blackboard";
    return "unknown";
  }

  function stripUrlNoise(raw) {
    return String(raw || "")
      .trim()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/^["']|["']$/g, "");
  }

  function extractCalendarUrl(raw) {
    const s = stripUrlNoise(raw);
    if (!s) return "";
    const match = s.match(/(webcal:\/\/[^\s<>"']+|https?:\/\/[^\s<>"']+)/i);
    if (match) return normalizeCalendarUrl(match[1]);
    return normalizeCalendarUrl(s);
  }

  function looksLikeCalendarUrl(text) {
    const s = stripUrlNoise(text);
    return /^(webcal:\/\/|https?:\/\/)/i.test(s) || /https?:\/\/[^\s]+feed\.ics/i.test(s);
  }

  function normalizeCalendarUrl(raw) {
    let url = stripUrlNoise(raw);
    if (!url) return "";
    if (/^webcal:\/\//i.test(url)) url = url.replace(/^webcal:\/\//i, "https://");
    if (/^http:\/\//i.test(url)) url = url.replace(/^http:\/\//i, "https://");
    return url;
  }

  function isAllowedCalendarUrl(url) {
    try {
      const u = new URL(extractCalendarUrl(url));
      if (u.protocol !== "https:") return false;
      const host = u.hostname.toLowerCase();
      const pathQuery = `${u.pathname}${u.search}`;
      if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^localhost$|^0\./.test(host)) return false;
      if (/instructure\.com$/.test(host)) return true;
      if (/\.instructure\.com$/.test(host)) return true;
      if (/brightspace\.com$/.test(host)) return true;
      if (/\.brightspace\.com$/.test(host)) return true;
      if (/\.d2l\.com$/.test(host)) return true;
      if (/\/d2l\//i.test(pathQuery)) return true;
      if (/feed\.ics|calendar|feeds\/calendars/i.test(pathQuery)) return true;
      if (/\.ics(\?|$)/i.test(pathQuery)) return true;
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

  function looksLikeCalendarExport(text) {
    const s = String(text || "").toLowerCase();
    return (
      /brightspace|d2l|instructure|canvas/.test(s) &&
      (/calendar/.test(s) || (s.match(/\d{1,2}\/\d{1,2}/g) || []).length >= 3)
    );
  }

  function parseCalendarExportText(text) {
    const lines = String(text || "")
      .replace(/\u00a0/g, " ")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    const now = Date.now();
    const horizon = now + 180 * 86400000;

    function push(title, due, course) {
      if (!title || !due || Number.isNaN(due.getTime())) return;
      if (due.getTime() < now - 86400000 || due.getTime() > horizon) return;
      if (BLOCKLIST.test(title)) return;
      const item = {
        title: title.slice(0, 120),
        course: course || "",
        dueAt: due.toISOString(),
        estimatedMinutes: 60,
        source: "calendar-export"
      };
      const key = importKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const inline = line.match(
        /^(.+?)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?)/i
      );
      if (inline) {
        const due = parseFlexibleDate(inline[2]);
        push(inline[1].replace(/^[-–—•]\s*/, ""), due, extractCourse(inline[1], "", ""));
        continue;
      }

      const dateFirst = line.match(
        /^((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?)\s*[-–—]?\s*(.+)$/i
      );
      if (dateFirst) {
        push(dateFirst[2], parseFlexibleDate(dateFirst[1]), extractCourse(dateFirst[2], "", ""));
        continue;
      }

      const due = parseFlexibleDate(line);
      if (due && lines[i - 1] && !parseFlexibleDate(lines[i - 1])) {
        push(lines[i - 1], due, extractCourse(lines[i - 1], line, ""));
      }
    }

    out.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    return out.slice(0, 60);
  }

  function readIcsFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No file selected"));
      const name = (file.name || "").toLowerCase();
      if (!name.endsWith(".ics") && file.type && !/calendar|ics/i.test(file.type)) {
        return reject(new Error("Upload the .ics calendar file — not a PDF. In D2L: Calendar → Subscribe → download or copy link."));
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read calendar file."));
      reader.readAsText(file);
    });
  }

  async function importIcsFile(file) {
    const ics = await readIcsFile(file);
    return parseIcsEvents(ics, { lmsFeed: true });
  }

  function importIcsText(rawText) {
    const raw = String(rawText || "").trim();
    if (raw.length < 20) {
      throw new Error("Paste the full calendar text starting with BEGIN:VCALENDAR.");
    }
    if (looksLikeCalendarUrl(raw) && !/BEGIN:VCALENDAR/i.test(raw)) {
      throw new Error("That is your Subscribe link — paste it in the top box and tap Connect.");
    }
    return parseIcsEvents(raw, { lmsFeed: true, context: "paste" });
  }

  function withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(message || "Timed out")), ms)
      )
    ]);
  }

  function getSupabaseConfig() {
    const cfg = window.APP_CONFIG || {};
    return {
      url: String(
        cfg.SUPABASE_URL || window.SUPABASE_URL || window.supabaseClient?.supabaseUrl || ""
      ).replace(/\/$/, ""),
      anon: cfg.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || ""
    };
  }

  async function invokeCalendarFetch(supabase, url, options) {
    options = options || {};
    const signal = options.signal;
    const onStatus = options.onStatus;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sign in to import from a calendar link.");

    const { url: baseUrl, anon } = getSupabaseConfig();
    if (!baseUrl || !anon) throw new Error("App config missing — refresh the page.");

    async function callFunction(name, body) {
      if (signal?.aborted) throw new Error("Cancelled");
      if (onStatus) onStatus(name === "fetch-calendar" ? "Contacting calendar server…" : "Trying backup server…");

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      const timer = setTimeout(() => controller.abort(), 16000);
      try {
        const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: anon
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        let data = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }

        if (res.status === 404) return { unavailable: true };
        if (!res.ok) {
          const msg = data.error || `Server error ${res.status}`;
          if (/not found|404|502|503/i.test(msg)) return { unavailable: true, error: msg };
          throw new Error(msg);
        }
        if (data.error) throw new Error(data.error);
        if (Array.isArray(data.assignments)) return { assignments: data.assignments };
        if (data.ics) return { ics: data.ics };
        throw new Error("Calendar feed returned no data.");
      } catch (err) {
        if (err?.name === "AbortError" || signal?.aborted) {
          throw new Error("Cancelled");
        }
        const msg = err?.message || "";
        if (/not found|404|failed to fetch|network/i.test(msg)) return { unavailable: true, error: msg };
        throw err;
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    }

    const primary = await callFunction("fetch-calendar", { url });
    if (primary.unavailable) {
      const fallback = await callFunction("scan-assignment", { mode: "fetch-calendar", url });
      if (fallback.unavailable) {
        throw new Error(
          "Calendar server not responding. Use Open feed → copy text → Import pasted calendar below."
        );
      }
      return fallback;
    }
    return primary;
  }

  async function fetchCalendarFeed(calendarUrl, options) {
    options = options || {};
    const url = extractCalendarUrl(calendarUrl);
    if (!isAllowedCalendarUrl(url)) {
      throw new Error("Use your D2L Subscribe link (https://…/feed.ics?token=…) — not a calendar PDF.");
    }

    const supabase = window.FocusAuth?.getSupabase?.() || window.supabaseClient;
    if (!supabase) throw new Error("Sign in to import from a calendar link.");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to import from a calendar link.");

    let result;
    try {
      result = await withTimeout(
        invokeCalendarFetch(supabase, url, options),
        20000,
        "Timed out after 20 sec. Use Open feed → copy text → Import below."
      );
    } catch (err) {
      if (/cancelled/i.test(err.message || "")) throw err;
      if (/timed out/i.test(err.message || "")) throw err;
      throw new Error(err.message || "Could not sync calendar. Try Import pasted calendar below.");
    }

    if (result.assignments) {
      return result.assignments;
    }

    if (options.onStatus) options.onStatus("Reading deadlines…");
    return parseIcsEvents(result.ics, { lmsFeed: true, context: "feed" });
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
        "Open D2L → Calendar → Subscribe → copy the https link.",
        "Paste the link in Quiet, tap Open feed in new tab.",
        "In the new tab: Select All → Copy (text must start with BEGIN:VCALENDAR).",
        "Paste in Step 2 below → Import pasted calendar."
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
    parseCalendarExportText,
    looksLikeCalendarExport,
    importIcsFile,
    importIcsText,
    extractCalendarUrl,
    normalizeCalendarUrl,
    fetchCalendarFeed,
    detectPlatform,
    isAllowedCalendarUrl,
    helpSteps,
    importKey,
    matchKey,
    mergeCalendarImport,
    splitNewAssignments
  };
})();
