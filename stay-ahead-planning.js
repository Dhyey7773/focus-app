(function () {
  "use strict";

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  const DEFAULT_SCHEDULE = {
    workDays: [3, 4, 5, 6],
    classDays: [1, 3],
    busyDays: [],
    preferredStudyDays: [0, 2, 4]
  };

  const HOW_TO_START_TEMPLATES = {
    essay: {
      steps: [
        "Read rubric",
        "Create thesis",
        "Build outline",
        "Gather one source"
      ],
      firstTask:
        "Spend 15 minutes reading the rubric and writing a one-sentence thesis idea."
    },
    discussion: {
      steps: [
        "Read prompt",
        "Pick one argument",
        "Write 3 bullet points",
        "Draft your post"
      ],
      firstTask:
        "Spend 15 minutes reading the prompt and writing three bullets for your argument."
    },
    project: {
      steps: [
        "Read the requirements.",
        "Break the project into three parts.",
        "Pick the easiest part to start.",
        "Gather what you need for that part."
      ],
      firstTask:
        "Spend 15 minutes listing three concrete tasks for the first part."
    },
    quiz: {
      steps: [
        "Review notes",
        "Complete practice questions",
        "Identify weak topics",
        "Quick recap"
      ],
      firstTask:
        "Spend 15 minutes reviewing notes and listing three topics to practice."
    },
    homework: {
      steps: [
        "Open the assignment.",
        "Read the first problem.",
        "Write down what you know.",
        "Try the easiest question first."
      ],
      firstTask:
        "Spend 15 minutes on the first problem — even a partial attempt counts."
    },
    lab: {
      steps: [
        "Read the lab instructions.",
        "List materials and steps.",
        "Do the setup first.",
        "Start the first experiment section."
      ],
      firstTask:
        "Spend 15 minutes reading the instructions and highlighting key steps."
    },
    reading: {
      steps: [
        "Preview headings and summaries.",
        "Set a page goal.",
        "Read one section.",
        "Write three bullet notes."
      ],
      firstTask:
        "Spend 15 minutes reading the first section and jotting three takeaways."
    },
    default: {
      steps: [
        "Open the assignment.",
        "Name the very first small step.",
        "Gather what you need.",
        "Start a short timer."
      ],
      firstTask:
        "Spend 15 minutes on the smallest piece you can finish today."
    }
  };

  const SESSION_LABELS = {
    essay: ["Research", "Outline", "Draft", "Revise", "Final pass"],
    project: ["Plan", "Build", "Draft", "Polish", "Submit prep"],
    lab: ["Read & prep", "Data collection", "Analysis", "Write-up"],
    reading: ["Skim & notes", "Deep read", "Review"],
    homework: ["Problems 1–3", "Problems 4–6", "Review"],
    quiz: ["Review"],
    default: ["Session 1", "Session 2", "Session 3", "Session 4"]
  };

  const DEFAULT_FOUNDER_EMAILS = ["quietfocusai@gmail.com"];

  function classifyAssignmentType(assignment) {
    const text = `${assignment.title || ""} ${assignment.course || ""}`.toLowerCase();
    if (/discussion|forum|db\b|reply post|weekly post/.test(text)) return "discussion";
    if (/essay|paper|thesis|dissertation|\d+\s*word|report|writing/.test(text)) return "essay";
    if (/project|capstone|portfolio|presentation/.test(text)) return "project";
    if (/lab\b|practicum|experiment/.test(text)) return "lab";
    if (/quiz|exam|midterm|final|\btest\b/.test(text)) return "quiz";
    if (/reading|chapter|read\b|\bpages?\b/.test(text)) return "reading";
    if (/homework|hw\b|worksheet|problem set|pset/.test(text)) return "homework";
    return "default";
  }

  function difficultyWeight(type) {
    return {
      essay: 35,
      project: 40,
      lab: 28,
      reading: 18,
      homework: 15,
      discussion: 12,
      quiz: 10,
      default: 15
    }[type] || 15;
  }

  function formatDayRange(dayIndices) {
    const days = normalizeDayList(dayIndices);
    if (!days.length) return "";
    if (days.length === 1) return DAY_LABELS[days[0]];
    const labels = days.map((d) => DAY_LABELS[d]);
    if (days.length === 2) return `${labels[0]}–${labels[1]}`;
    return `${labels[0]}–${labels[labels.length - 1]}`;
  }

  function compareRankedAssignments(a, b, now = new Date()) {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const dueA = new Date(a.assignment.dueAt);
    const dueB = new Date(b.assignment.dueAt);
    if (dueA !== dueB) return dueA - dueB;
    const estA = Number(a.assignment.estimatedMinutes) || 60;
    const estB = Number(b.assignment.estimatedMinutes) || 60;
    if (estB !== estA) return estB - estA;
    const typeA = classifyAssignmentType(a.assignment);
    const typeB = classifyAssignmentType(b.assignment);
    if (difficultyWeight(typeB) !== difficultyWeight(typeA)) {
      return difficultyWeight(typeB) - difficultyWeight(typeA);
    }
    const sessionsA = sessionCountForAssignment(a.assignment);
    const sessionsB = sessionCountForAssignment(b.assignment);
    if (sessionsB !== sessionsA) return sessionsB - sessionsA;
    return (a.assignment.title || "").localeCompare(b.assignment.title || "");
  }

  function assignRelativePriorityLevels(plans) {
    if (!plans.length) return;
    const topScore = plans[0].priorityScore;
    plans.forEach((plan, index) => {
      const gap = topScore - plan.priorityScore;
      if (index === 0) plan.priorityLevel = "High";
      else if (index === 1 && gap <= 15) plan.priorityLevel = "High";
      else if (index <= 3 && gap <= 28) plan.priorityLevel = "Medium";
      else plan.priorityLevel = "Low";
    });
  }

  function buildTopRankReason(plan) {
    const parts = [];
    if (plan.multiSession) parts.push("requires multiple sessions");
    const hours = (new Date(plan.assignment.dueAt) - Date.now()) / 3600000;
    const days = Math.max(0, Math.ceil(hours / 24));
    if (days <= 1) parts.push("is due very soon");
    else if (days <= 4) parts.push("is due soon");
    if (plan.risk === "High") parts.push("has higher deadline risk");
    if (!parts.length) return "Top priority based on deadline, effort, and your schedule.";
    const text = parts.join(" and ");
    return text.charAt(0).toUpperCase() + text.slice(1) + ".";
  }

  function buildRankReason(plan, prevPlan) {
    if (!prevPlan) return "";
    const planDue = new Date(plan.assignment.dueAt);
    const prevDue = new Date(prevPlan.assignment.dueAt);
    const planEst = Number(plan.assignment.estimatedMinutes) || 60;
    const prevEst = Number(prevPlan.assignment.estimatedMinutes) || 60;
    const planSessions = plan.multiSession ? plan.sessions?.length || 2 : 1;
    const prevSessions = prevPlan.multiSession ? prevPlan.sessions?.length || 2 : 1;

    if (planSessions > 1 && prevSessions === 1) {
      return "Requires multiple sessions and is due sooner.";
    }
    if (planDue < prevDue && planEst >= prevEst) {
      return "Due sooner and needs more time.";
    }
    if (planDue < prevDue) return "Due sooner than the assignment below.";
    if (planEst >= prevEst + 45 && planSessions > prevSessions) {
      return "Higher effort and needs more sessions.";
    }
    if (planEst <= prevEst - 30 && prevSessions > 1 && planSessions === 1) {
      return "Lower effort and can be completed in one sitting.";
    }
    if (plan.risk === "High" && prevPlan.risk !== "High") {
      return "Higher deadline risk on your schedule.";
    }
    if (planEst > prevEst + 20) return "Requires more focused time.";
    return "Ranked above based on deadline, effort, and your schedule.";
  }

  function buildStartReason(assignment, sessionDays, dueDow, sets, multiSession) {
    const first = sessionDays[0];
    if (!first) return "Your schedule is tight before the deadline.";
    const startName = DAY_NAMES[first.dow];
    const dueName = DAY_NAMES[dueDow];
    const parts = [];
    const workRange = formatDayRange([...sets.work]);
    const busyRange = formatDayRange([...sets.busy]);

    if (workRange) parts.push(`you work ${workRange}`);
    if (busyRange) parts.push(`${busyRange} is marked busy`);
    if (multiSession) parts.push("this assignment needs multiple sessions");

    if (first.isPreferred) {
      parts.push(`${startName} is a preferred study day`);
    } else if (dueDayIsBlocked(dueDow, sets)) {
      parts.push(`${dueName} is busy on your schedule`);
    }

    if (!parts.length) {
      return `${startName} is the best open day before ${dueName}.`;
    }
    const joined = parts.join(", ").replace(/, ([^,]*)$/, ", and $1");
    return joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
  }

  function parseFounderEmails(cfg) {
    const raw = cfg?.FOUNDER_EMAILS ?? cfg?.founderEmails ?? [];
    let parsed = [];
    if (Array.isArray(raw)) {
      parsed = raw.map((e) => String(e).toLowerCase().trim()).filter(Boolean);
    } else if (typeof raw === "string") {
      parsed = raw.split(",").map((e) => e.toLowerCase().trim()).filter(Boolean);
    }
    if (parsed.length) return parsed;
    return DEFAULT_FOUNDER_EMAILS.slice();
  }

  function parseFounderUserIds(cfg) {
    const raw = cfg?.FOUNDER_USER_IDS ?? [];
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
  }

  function resolveUserEmail(user) {
    if (!user) return "";
    const direct = user.email?.trim();
    if (direct) return direct;
    const meta = user.user_metadata?.email?.trim();
    if (meta) return meta;
    for (const identity of user.identities || []) {
      const fromIdentity = identity.identity_data?.email?.trim();
      if (fromIdentity) return fromIdentity;
    }
    return "";
  }

  function isFounder(userOrEmail) {
    const cfg = window.APP_CONFIG || {};
    const emails = parseFounderEmails(cfg);
    const userIds = parseFounderUserIds(cfg);

    let email = "";
    let userId = "";

    if (userOrEmail && typeof userOrEmail === "object") {
      email = resolveUserEmail(userOrEmail);
      userId = userOrEmail.id || "";
    } else if (userOrEmail) {
      email = String(userOrEmail).trim();
    }

    if (userId && userIds.includes(userId)) return true;

    if (email && emails.includes(email.toLowerCase())) {
      if (userId) {
        try {
          sessionStorage.setItem(`qf-founder-${userId}`, "1");
        } catch (_) {}
      }
      return true;
    }

    if (userId) {
      try {
        if (sessionStorage.getItem(`qf-founder-${userId}`) === "1") return true;
      } catch (_) {}
    }

    try {
      return localStorage.getItem("qf-founder") === "1";
    } catch (_) {
      return false;
    }
  }

  function normalizeDayList(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map(Number).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b);
  }

  function normalizeSchedule(schedule) {
    const base = { ...DEFAULT_SCHEDULE, ...(schedule || {}) };
    return {
      workDays: normalizeDayList(base.workDays),
      classDays: normalizeDayList(base.classDays),
      busyDays: normalizeDayList(base.busyDays),
      preferredStudyDays: normalizeDayList(base.preferredStudyDays)
    };
  }

  function getScheduleFromProfile(profile) {
    return normalizeSchedule(profile?.stayAheadSchedule);
  }

  function saveScheduleToProfile(profile, schedule) {
    profile.stayAheadSchedule = normalizeSchedule(schedule);
    return profile.stayAheadSchedule;
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getScheduleSets(schedule) {
    const s = normalizeSchedule(schedule);
    return {
      work: new Set(s.workDays),
      class: new Set(s.classDays),
      busy: new Set(s.busyDays),
      preferred: new Set(s.preferredStudyDays)
    };
  }

  /** Higher tier = better study day. Busy = 0, work/class = 1, neutral = 2, preferred = 3 */
  function dayTier(dow, sets) {
    if (sets.busy.has(dow)) return 0;
    if (sets.work.has(dow) || sets.class.has(dow)) return 1;
    if (sets.preferred.has(dow)) return 3;
    return 2;
  }

  function formatEffort(minutes) {
    const m = Math.max(5, Number(minutes) || 60);
    if (m < 60) return `${m} minutes`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (!rem) return `${h} hour${h === 1 ? "" : "s"}`;
    return `${h} hr${h === 1 ? "" : "s"} ${rem} min`;
  }

  function formatSessionBlock(minutes) {
    const m = Math.max(5, Number(minutes) || 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (!rem) return `${h} hr`;
    return `${h} hr ${rem} min`;
  }

  function formatTaskEffort(minutes, multiSession) {
    if (multiSession) return formatEffort(minutes);
    const m = Math.max(5, Number(minutes) || 60);
    if (m < 60) return `${m} min task`;
    return `${formatEffort(m)} task`;
  }

  function sessionCountForAssignment(assignment) {
    const type = classifyAssignmentType(assignment);
    const est = Number(assignment.estimatedMinutes) || 60;
    if (type === "quiz") return 1;
    if (est <= 45) return 1;
    if (est <= 90) return 2;
    if (est <= 180) return 3;
    return Math.min(5, Math.ceil(est / 60));
  }

  function sessionLabels(type, count) {
    const pool = SESSION_LABELS[type] || SESSION_LABELS.default;
    return Array.from({ length: count }, (_, i) => pool[i] || `Session ${i + 1}`);
  }

  function splitEffort(totalMinutes, count) {
    const total = Math.max(count * 15, Number(totalMinutes) || 60);
    const base = Math.floor(total / count);
    const remainder = total % count;
    return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
  }

  function enumerateDaysBeforeDue(today, due, sets, usedDayKeys) {
    const days = [];
    const dueDay = startOfDay(due);
    const used = usedDayKeys || new Set();
    for (let cursor = new Date(startOfDay(today)); cursor < dueDay; cursor.setDate(cursor.getDate() + 1)) {
      const date = startOfDay(cursor);
      const dow = date.getDay();
      let tier = dayTier(dow, sets);
      if (used.has(date.getTime())) tier = Math.max(0, tier - 2);
      days.push({
        date,
        dow,
        tier,
        isBusy: sets.busy.has(dow),
        isWork: sets.work.has(dow),
        isClass: sets.class.has(dow),
        isPreferred: sets.preferred.has(dow),
        isUsed: used.has(date.getTime())
      });
    }
    return days;
  }

  function poolWithMinTier(days, minTier) {
    const filtered = days.filter((d) => d.tier >= minTier);
    if (filtered.length) return filtered;
    if (minTier > 0) return poolWithMinTier(days, minTier - 1);
    return days;
  }

  function pickSessionDays(beforeDueDays, sessionCount) {
    if (!beforeDueDays.length || sessionCount < 1) return [];

    const noBusy = beforeDueDays.filter((d) => !d.isBusy);
    const basePool = noBusy.length >= sessionCount ? noBusy : beforeDueDays;

    let pool = poolWithMinTier(basePool, 3);
    if (pool.length < sessionCount) pool = poolWithMinTier(basePool, 2);
    if (pool.length < sessionCount) pool = poolWithMinTier(basePool, 1);
    if (pool.length < sessionCount) pool = basePool.slice();

    pool = [...pool].sort((a, b) => {
      if (b.tier !== a.tier) return b.tier - a.tier;
      return a.date - b.date;
    });

    if (sessionCount === 1) {
      const maxTier = Math.max(...pool.map((d) => d.tier));
      const best = pool.filter((d) => d.tier === maxTier);
      return [best[0]];
    }

    const chronological = [...pool].sort((a, b) => a.date - b.date);
    if (chronological.length <= sessionCount) return chronological;

    const picked = [];
    for (let i = 0; i < sessionCount; i++) {
      const idx = Math.round((i * (chronological.length - 1)) / (sessionCount - 1));
      picked.push(chronological[idx]);
    }

    const seen = new Set();
    return picked
      .filter((d) => {
        const key = d.date.getTime();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.date - b.date);
  }

  function dueDayIsBlocked(dueDow, sets) {
    return sets.busy.has(dueDow) || sets.work.has(dueDow) || sets.class.has(dueDow);
  }

  function computeRisk(assignment, sessionDays, due, today) {
    const hoursToDue = (due - today) / 3600000;
    const est = Number(assignment.estimatedMinutes) || 60;
    const firstDay = sessionDays[0];
    const bufferDays = firstDay ? (due - firstDay.date) / 86400000 : 0;

    if (hoursToDue < 0) return "High";
    if (hoursToDue <= 24) return "High";
    if (!firstDay || bufferDays < 1) return "High";
    if (hoursToDue <= 72 && est > 45) return "High";
    if (bufferDays < 2 && est > 90) return "High";
    if (hoursToDue <= 168 || bufferDays < 3) return "Medium";
    return "Low";
  }

  function buildWhyDetailed(assignment, sessionDays, dueDow, sets) {
    const dueName = DAY_NAMES[dueDow];
    const first = sessionDays[0];
    const title = assignment.title || "This assignment";

    if (!first) {
      return `${title} is due ${dueName}, but there are no open study days before then on your schedule. Start the first piece you can today.`;
    }

    const startName = DAY_NAMES[first.dow];
    const dueBlocked = dueDayIsBlocked(dueDow, sets);
    const parts = [];

    parts.push(`We selected ${startName} because your assignment is due ${dueName}`);

    if (dueBlocked) {
      parts.push(`and ${dueName} is already marked busy on your schedule`);
    }

    if (first.isPreferred) {
      parts.push(`and ${startName} is one of your preferred study days`);
    } else if (first.isWork || first.isClass) {
      parts.push(`and it was the best available day before the deadline`);
    } else if (first.isBusy) {
      parts.push(`and it was the only open slot before the deadline`);
    }

    if (sessionDays.length > 1) {
      const spread = sessionDays.map((d) => DAY_NAMES[d.dow]).join(", ");
      parts.push(`Work is spread across ${spread} so you're not cramming on ${dueName}`);
    }

    parts.push("Starting earlier reduces deadline risk.");
    return parts.join(". ").replace(/\.\s+and/g, ",") + ".";
  }

  function buildReasonShort(assignment, sessionDays, dueDow, sets) {
    const dueName = DAY_NAMES[dueDow];
    const first = sessionDays[0];
    if (!first) return `${dueName} is the deadline and your schedule is tight before then.`;

    const startName = DAY_NAMES[first.dow];
    const dueBlocked = dueDayIsBlocked(dueDow, sets);

    if (dueBlocked && first.isPreferred) {
      return `You are busy ${dueName} and ${startName} is a preferred study day.`;
    }
    if (dueBlocked) {
      return `${dueName} is the deadline and you're busy that day — start on ${startName}.`;
    }
    if (first.isPreferred) {
      return `${dueName} is the deadline and ${startName} is one of your preferred study days.`;
    }
    if (first.isBusy) {
      return `${startName} is the only open day before ${dueName}.`;
    }
    if (first.isWork || first.isClass) {
      return `${startName} is the best available day before ${dueName}.`;
    }
    return `Start on ${startName} to stay ahead of the ${dueName} deadline.`;
  }

  function buildAssignmentPlan(assignment, schedule, now = new Date(), usedDayKeys = null) {
    const sets = getScheduleSets(schedule);
    const used = usedDayKeys || new Set();
    const due = startOfDay(new Date(assignment.dueAt));
    const today = startOfDay(now);
    const dueDow = due.getDay();
    const dueName = DAY_NAMES[dueDow];
    const est = Number(assignment.estimatedMinutes) || 60;
    const type = classifyAssignmentType(assignment);
    const sessionCount = sessionCountForAssignment(assignment);
    const labels = sessionLabels(type, sessionCount);
    const efforts = splitEffort(est, sessionCount);

    let sessionDays;
    let urgent = false;

    if (due <= today) {
      urgent = true;
      sessionDays = [
        {
          date: new Date(today),
          dow: today.getDay(),
          tier: dayTier(today.getDay(), sets),
          isBusy: sets.busy.has(today.getDay()),
          isWork: sets.work.has(today.getDay()),
          isClass: sets.class.has(today.getDay()),
          isPreferred: sets.preferred.has(today.getDay())
        }
      ];
    } else {
      const beforeDue = enumerateDaysBeforeDue(today, due, sets, used);
      sessionDays = pickSessionDays(beforeDue, sessionCount);
      if (!sessionDays.length && beforeDue.length) {
        sessionDays = [beforeDue.filter((d) => !d.isBusy).pop() || beforeDue[beforeDue.length - 1]];
      }
    }

    sessionDays.forEach((d) => used.add(d.date.getTime()));

    const multiSession = sessionDays.length > 1;
    const sessions = sessionDays.map((day, i) => ({
      dayName: DAY_NAMES[day.dow],
      dayLabel: DAY_LABELS[day.dow],
      dow: day.dow,
      date: day.date,
      tasks: [{ label: labels[i] || `Session ${i + 1}`, minutes: efforts[i] }]
    }));

    const first = sessionDays[0];
    const startName = first ? DAY_NAMES[first.dow] : "today";
    const risk = computeRisk(assignment, sessionDays, due, today);
    const reason = buildReasonShort(assignment, sessionDays, dueDow, sets);
    const whyDetailed = buildWhyDetailed(assignment, sessionDays, dueDow, sets);
    const goal = multiSession ? `Finish before ${dueName}.` : `Complete before ${dueName}.`;

    const startHeadline = urgent
      ? "Recommended start: Today"
      : `Recommended start: ${startName}`;
    const startReason = buildStartReason(assignment, sessionDays, dueDow, sets, multiSession);

    const effortLabel = formatEffort(est);
    const taskLabel = formatTaskEffort(multiSession ? est : efforts[0], multiSession);
    const effortDetail = multiSession
      ? `Estimated effort: ${formatEffort(est)} total`
      : `Estimated effort: ${formatEffort(efforts[0])}`;

    const message = multiSession
      ? `${startHeadline}. ${goal} ${formatEffort(est)} total.`
      : `${startHeadline}. Due ${dueName}. ${effortDetail}. Risk: ${risk}.`;

    return {
      assignmentId: assignment.id,
      assignment,
      dueDow,
      dueName,
      dueDayBusy: dueDayIsBlocked(dueDow, sets),
      urgent,
      multiSession,
      sessions,
      days: sessionDays,
      startDayLabels: sessionDays.map((d) => DAY_LABELS[d.dow]),
      startDayNames: sessionDays.map((d) => DAY_NAMES[d.dow]),
      startHeadline,
      startReason,
      dueLabel: `Due ${dueName}`,
      effortLabel,
      taskLabel,
      effortDetail,
      risk,
      reason,
      whyDetailed,
      goal,
      message,
      cardSummary: `${taskLabel} · ${risk} risk`
    };
  }

  function computePriorityScore(assignment, schedule, now = new Date()) {
    const sets = getScheduleSets(schedule);
    const hours = (new Date(assignment.dueAt) - now) / 3600000;
    const est = Number(assignment.estimatedMinutes) || 60;
    const type = classifyAssignmentType(assignment);
    const dueDow = startOfDay(new Date(assignment.dueAt)).getDay();
    const dueDayBusy = dueDayIsBlocked(dueDow, sets);

    let urgency;
    if (hours < 0) urgency = 100;
    else if (hours <= 24) urgency = 92;
    else if (hours <= 72) urgency = 75 - Math.min(hours - 24, 48) * 0.4;
    else if (hours <= 168) urgency = 55 - (hours - 72) * 0.08;
    else urgency = Math.max(15, 40 - hours * 0.01);

    const difficulty = difficultyWeight(type);
    const effort = Math.min(30, est / 6);
    let riskBoost = 0;
    if (hours < 0 || hours <= 24) riskBoost = 25;
    else if (hours <= 72 && est > 45) riskBoost = 20;
    else if (hours <= 168) riskBoost = 10;

    let schedulePenalty = 0;
    if (dueDayBusy && est > 45) schedulePenalty += 12;
    const beforeDue = enumerateDaysBeforeDue(startOfDay(now), startOfDay(new Date(assignment.dueAt)), sets);
    const goodDays = beforeDue.filter((d) => d.tier >= 2).length;
    if (goodDays < 2 && est > 60) schedulePenalty += 15;

    return urgency + difficulty + effort + riskBoost + schedulePenalty;
  }

  function priorityLevel(score) {
    if (score >= 75) return "High";
    if (score >= 45) return "Medium";
    return "Low";
  }

  function buildWhyBullets(plan, schedule) {
    const bullets = [];
    const assignment = plan.assignment;
    const hours = (new Date(assignment.dueAt) - Date.now()) / 3600000;
    const days = Math.max(0, Math.ceil(hours / 24));
    const sets = getScheduleSets(schedule);
    const est = Number(assignment.estimatedMinutes) || 60;
    const type = classifyAssignmentType(assignment);
    const s = normalizeSchedule(schedule);

    if (hours < 0) bullets.push("Overdue — start as soon as you can");
    else if (hours <= 24) bullets.push("Due within 24 hours");
    else if (days === 1) bullets.push("Due tomorrow");
    else bullets.push(`Due in ${days} days`);

    bullets.push(`Requires ${formatEffort(est)}`);

    if (plan.multiSession) {
      const count = plan.sessions?.length || 2;
      bullets.push(`Needs ${count} focused sessions`);
    } else if (type === "essay" || type === "project") {
      bullets.push("Best completed in one focused block");
    }

    const workRange = formatDayRange(s.workDays);
    if (workRange) bullets.push(`You work ${workRange}`);

    const startDay = plan.days?.[0];
    if (startDay?.isPreferred) {
      bullets.push(`${DAY_NAMES[startDay.dow]} is a preferred study day`);
    } else if (startDay && !startDay.isBusy && !startDay.isWork && !startDay.isClass) {
      bullets.push(`${DAY_NAMES[startDay.dow]} is an available study day`);
    } else if (startDay?.isWork || startDay?.isClass) {
      bullets.push(`${DAY_NAMES[startDay.dow]} is the best open slot before the deadline`);
    }

    if (sets.busy.has(plan.dueDow)) bullets.push(`${plan.dueName} is marked busy`);
    else if (sets.work.has(plan.dueDow)) bullets.push(`${plan.dueName} is a work day`);

    return bullets.slice(0, 4);
  }

  function isAheadOfSchedule(plan, now = new Date()) {
    if (!plan || plan.urgent || plan.risk === "High") return false;
    const today = startOfDay(now);
    const due = startOfDay(new Date(plan.assignment.dueAt));
    if (due <= today) return false;

    const hoursToDue = (due - today) / 3600000;
    if (hoursToDue < 48) return false;

    const firstDay = plan.days?.[0];
    if (!firstDay) return false;

    const firstDate = startOfDay(firstDay.date);
    const todayMs = today.getTime();

    if (firstDate.getTime() > todayMs && plan.risk === "Low") return true;

    const hasSessionToday = (plan.days || []).some(
      (d) => startOfDay(d.date).getTime() === todayMs
    );
    if (!hasSessionToday && plan.risk === "Low") {
      const bufferDays = (due - firstDate) / 86400000;
      if (bufferDays >= 2) return true;
    }

    return false;
  }

  function buildWeeklySummary(plans, schedule, now = new Date()) {
    const weekly = plans.filter((p) => isDueThisWeek(p.assignment.dueAt, now));
    const pool = weekly.length ? weekly : plans;
    const totalMinutes = pool.reduce(
      (sum, p) => sum + (Number(p.assignment.estimatedMinutes) || 60),
      0
    );

    return {
      assignmentCount: pool.length,
      effortLabel: formatEffort(totalMinutes),
      highPriorityCount: pool.filter((p) => p.priorityLevel === "High").length,
      atRiskCount: pool.filter((p) => p.risk === "High").length
    };
  }

  function isDueThisWeek(dueAt, now = new Date()) {
    const ms = new Date(dueAt) - now;
    return ms <= 7 * 86400000;
  }

  function categorizeWeeklyPlans(plans, now = new Date()) {
    const ahead = plans.filter((p) => isAheadOfSchedule(p, now));
    const aheadIds = new Set(ahead.map((p) => p.assignmentId));
    const weekly = plans.filter((p) => isDueThisWeek(p.assignment.dueAt, now));

    // Rank #1 = do first (one only), #2–#3 = next up, #4+ = can wait
    const actionable = plans.filter((p) => !aheadIds.has(p.assignmentId));

    return {
      weekly,
      ahead,
      doFirst: actionable.slice(0, 1),
      doNext: actionable.slice(1, 3),
      canWait: actionable.slice(3),
      summary: buildWeeklySummary(plans, null, now)
    };
  }

  function buildStayAheadPlans(assignments, schedule, now = new Date()) {
    const pending = (assignments || [])
      .filter((a) => a && !a.completed)
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    const ranked = pending
      .map((assignment) => ({
        assignment,
        priorityScore: computePriorityScore(assignment, schedule, now)
      }))
      .sort((a, b) => compareRankedAssignments(a, b, now));

    const usedDayKeys = new Set();
    const plans = ranked.map(({ assignment, priorityScore }) => {
      const plan = buildAssignmentPlan(assignment, schedule, now, usedDayKeys);
      plan.priorityScore = priorityScore;
      return plan;
    });

    assignRelativePriorityLevels(plans);

    plans.forEach((plan, index) => {
      plan.priorityRank = index + 1;
      plan.rankReason = index === 0
        ? buildTopRankReason(plan)
        : buildRankReason(plan, plans[index - 1]);
      plan.whyBullets = buildWhyBullets(plan, schedule);
      plan.isAhead = isAheadOfSchedule(plan, now);
    });

    return plans;
  }

  function buildHowToStartLocal(assignment) {
    const type = classifyAssignmentType(assignment);
    const template = HOW_TO_START_TEMPLATES[type] || HOW_TO_START_TEMPLATES.default;
    return {
      steps: template.steps.slice(),
      firstTask: template.firstTask,
      source: "local"
    };
  }

  async function invokePlanningFunction(body) {
    const supabase = window.FocusAuth?.getSupabase?.() || window.supabaseClient;
    if (!supabase) throw new Error("Sign in to use AI planning.");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to use AI planning.");

    const invoke = supabase.functions.invoke("stay-ahead-plan", { body });
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("AI request timed out. Try Refresh plans again.")), 20000);
    });

    const { data, error } = await Promise.race([invoke, timeout]);

    if (error) {
      let message = error.message || "Planning request failed.";
      try {
        const payload = await error.context?.json?.();
        if (payload?.error) message = payload.error;
        if (payload?.hint) message += ` ${payload.hint}`;
      } catch (_) {}
      throw new Error(message);
    }

    if (data?.error) {
      const hint = data.hint ? ` ${data.hint}` : "";
      throw new Error(`${data.error}${hint}`);
    }

    return data;
  }

  async function fetchHowToStart(assignment) {
    try {
      const data = await invokePlanningFunction({
        mode: "how-to-start",
        assignment: {
          title: assignment.title,
          course: assignment.course || "",
          dueAt: assignment.dueAt,
          estimatedMinutes: assignment.estimatedMinutes || 60,
          notes: assignment.notes || ""
        }
      });
      if (data?.steps?.length && data?.firstTask) {
        return { steps: data.steps, firstTask: data.firstTask, source: "ai" };
      }
    } catch (err) {
      console.warn("How-to-start AI fallback:", err);
    }
    return buildHowToStartLocal(assignment);
  }

  async function polishPlansWithAi(plans, schedule) {
    if (!plans.length) return plans;

    try {
      const data = await invokePlanningFunction({
        mode: "polish-plans",
        schedule: normalizeSchedule(schedule),
        plans: plans.map((p) => ({
          assignmentId: p.assignmentId,
          title: p.assignment.title,
          type: classifyAssignmentType(p.assignment),
          dueAt: p.assignment.dueAt,
          estimatedMinutes: p.assignment.estimatedMinutes,
          startDayNames: p.startDayNames,
          dueDayName: p.dueName,
          dueDayBusy: p.dueDayBusy,
          localMessage: p.reason
        }))
      });

      if (Array.isArray(data?.plans)) {
        const byId = new Map(data.plans.map((p) => [p.assignmentId, p.message]));
        return plans.map((p) => ({
          ...p,
          reason: byId.get(p.assignmentId) || p.reason,
          source: byId.has(p.assignmentId) ? "ai" : p.source || "local"
        }));
      }
    } catch (err) {
      console.warn("Stay ahead AI polish fallback:", err);
    }

    return plans.map((p) => ({ ...p, source: "local" }));
  }

  window.StayAheadPlanning = {
    DAY_LABELS,
    DAY_NAMES,
    DEFAULT_SCHEDULE,
    isFounder,
    resolveUserEmail,
    parseFounderEmails,
    normalizeSchedule,
    getScheduleFromProfile,
    saveScheduleToProfile,
    buildStayAheadPlans,
    buildAssignmentPlan,
    buildHowToStartLocal,
    fetchHowToStart,
    polishPlansWithAi,
    classifyAssignmentType,
    formatEffort,
    formatSessionBlock,
    formatTaskEffort,
    buildWhyBullets,
    categorizeWeeklyPlans,
    buildWeeklySummary,
    isAheadOfSchedule,
    isDueThisWeek,
    priorityLevel
  };
})();
