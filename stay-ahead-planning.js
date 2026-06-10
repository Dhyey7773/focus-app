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
        "Read the prompt.",
        "Choose a topic.",
        "Find one source.",
        "Create a rough outline."
      ],
      firstTask:
        "Spend 15 minutes finding one source and writing down three key points."
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
        "Skim your notes.",
        "List the main topics.",
        "Do three practice questions.",
        "Review what you missed."
      ],
      firstTask:
        "Spend 15 minutes listing the three topics most likely to appear."
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
      quiz: 10,
      default: 15
    }[type] || 15;
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

  function enumerateDaysBeforeDue(today, due, sets) {
    const days = [];
    const dueDay = startOfDay(due);
    for (let cursor = new Date(startOfDay(today)); cursor < dueDay; cursor.setDate(cursor.getDate() + 1)) {
      const date = startOfDay(cursor);
      const dow = date.getDay();
      days.push({
        date,
        dow,
        tier: dayTier(dow, sets),
        isBusy: sets.busy.has(dow),
        isWork: sets.work.has(dow),
        isClass: sets.class.has(dow),
        isPreferred: sets.preferred.has(dow)
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

    let pool = poolWithMinTier(beforeDueDays, 3);
    if (pool.length < sessionCount) pool = poolWithMinTier(beforeDueDays, 2);
    if (pool.length < sessionCount) pool = poolWithMinTier(beforeDueDays, 1);
    if (pool.length < sessionCount) pool = beforeDueDays.slice();

    pool = [...pool].sort((a, b) => a.date - b.date);

    if (sessionCount === 1) {
      const maxTier = Math.max(...pool.map((d) => d.tier));
      const best = pool.filter((d) => d.tier === maxTier);
      return [best[0]];
    }

    if (pool.length <= sessionCount) {
      return pool.slice(0, sessionCount);
    }

    const picked = [];
    for (let i = 0; i < sessionCount; i++) {
      const idx = Math.round((i * (pool.length - 1)) / (sessionCount - 1));
      picked.push(pool[idx]);
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
    if (dueDayIsBlocked(dueDow, sets) && first.isPreferred) {
      return `${dueName} is the deadline and ${startName} is one of your preferred study days.`;
    }
    if (dueDayIsBlocked(dueDow, sets)) {
      return `${dueName} is the deadline and you're busy that day — start on ${startName}.`;
    }
    if (first.isPreferred) {
      return `${dueName} is the deadline and ${startName} is one of your preferred study days.`;
    }
    if (first.isWork || first.isClass) {
      return `Start on ${startName} — it's the best open day before ${dueName}.`;
    }
    return `Start on ${startName} to stay ahead of the ${dueName} deadline.`;
  }

  function buildAssignmentPlan(assignment, schedule, now = new Date()) {
    const sets = getScheduleSets(schedule);
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
      const beforeDue = enumerateDaysBeforeDue(today, due, sets);
      sessionDays = pickSessionDays(beforeDue, sessionCount);
      if (!sessionDays.length && beforeDue.length) {
        sessionDays = [beforeDue[beforeDue.length - 1]];
      }
    }

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
      ? "START TODAY"
      : `START ON ${startName.toUpperCase()}`;

    const effortLabel = multiSession ? formatEffort(est) : formatEffort(efforts[0]);

    const message = multiSession
      ? `${startHeadline}. ${goal} ${formatEffort(est)} total.`
      : `${startHeadline}. Due ${dueName}. ${effortLabel}. Risk: ${risk}.`;

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
      dueLabel: `Due ${dueName}`,
      effortLabel,
      risk,
      reason,
      whyDetailed,
      goal,
      message,
      cardSummary: `Due ${dueName} · ${effortLabel} · ${risk} risk`
    };
  }

  function computePriorityScore(assignment, schedule, now = new Date()) {
    const sets = getScheduleSets(schedule);
    const hours = (new Date(assignment.dueAt) - now) / 3600000;
    const est = Number(assignment.estimatedMinutes) || 60;
    const type = classifyAssignmentType(assignment);
    const plan = buildAssignmentPlan(assignment, schedule, now);

    let urgency;
    if (hours < 0) urgency = 100;
    else if (hours <= 24) urgency = 92;
    else if (hours <= 72) urgency = 75 - Math.min(hours - 24, 48) * 0.4;
    else if (hours <= 168) urgency = 55 - (hours - 72) * 0.08;
    else urgency = Math.max(15, 40 - hours * 0.01);

    const difficulty = difficultyWeight(type);
    const effort = Math.min(30, est / 6);
    const riskBoost = plan.risk === "High" ? 25 : plan.risk === "Medium" ? 10 : 0;

    let schedulePenalty = 0;
    if (!plan.days.length) schedulePenalty += 20;
    if (plan.dueDayBusy && plan.days.length < 2 && est > 60) schedulePenalty += 15;

    return urgency + difficulty + effort + riskBoost + schedulePenalty;
  }

  function priorityLevel(score) {
    if (score >= 75) return "High";
    if (score >= 45) return "Medium";
    return "Low";
  }

  function buildStayAheadPlans(assignments, schedule, now = new Date()) {
    const pending = (assignments || [])
      .filter((a) => a && !a.completed)
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    const scored = pending.map((assignment) => {
      const score = computePriorityScore(assignment, schedule, now);
      const plan = buildAssignmentPlan(assignment, schedule, now);
      plan.priorityScore = score;
      plan.priorityLevel = priorityLevel(score);
      return plan;
    });

    scored.sort((a, b) => b.priorityScore - a.priorityScore);
    scored.forEach((plan, index) => {
      plan.priorityRank = index + 1;
    });

    return scored;
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
    priorityLevel
  };
})();
