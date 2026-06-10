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

  function isFounder(userEmail) {
    const cfg = window.APP_CONFIG || {};
    const emails = (cfg.FOUNDER_EMAILS || []).map((e) => String(e).toLowerCase().trim());
    if (userEmail && emails.includes(String(userEmail).toLowerCase().trim())) return true;
    return localStorage.getItem("qf-founder") === "1";
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

  function unavailableDays(schedule) {
    const s = normalizeSchedule(schedule);
    return new Set([...s.workDays, ...s.classDays, ...s.busyDays]);
  }

  function sessionsForAssignment(assignment) {
    const type = classifyAssignmentType(assignment);
    const est = Number(assignment.estimatedMinutes) || 60;
    if (type === "quiz") return 1;
    if (type === "reading") return est > 90 ? 2 : 1;
    if (type === "essay" || type === "project") return Math.max(2, Math.ceil(est / 90));
    if (type === "lab") return Math.max(2, Math.ceil(est / 75));
    return Math.max(1, Math.ceil(est / 60));
  }

  function recommendWorkDays(assignment, schedule, now = new Date()) {
    const due = startOfDay(new Date(assignment.dueAt));
    const today = startOfDay(now);
    const blocked = unavailableDays(schedule);
    const preferred = new Set(normalizeSchedule(schedule).preferredStudyDays);
    const sessionsNeeded = sessionsForAssignment(assignment);
    const dueDow = due.getDay();

    if (due <= today) {
      return {
        days: [{ date: new Date(today), dow: today.getDay(), preferred: preferred.has(today.getDay()) }],
        dueDow,
        dueDayBusy: blocked.has(dueDow),
        urgent: true
      };
    }

    const candidates = [];
    for (let cursor = new Date(today); cursor < due; cursor.setDate(cursor.getDate() + 1)) {
      const day = startOfDay(cursor);
      const dow = day.getDay();
      if (blocked.has(dow)) continue;
      const daysFromToday = Math.round((day - today) / 86400000);
      candidates.push({
        date: day,
        dow,
        daysFromToday,
        preferred: preferred.has(dow)
      });
    }

    candidates.sort((a, b) => {
      if (a.preferred !== b.preferred) return Number(b.preferred) - Number(a.preferred);
      return a.daysFromToday - b.daysFromToday;
    });

    const picked = candidates.slice(0, sessionsNeeded).sort((a, b) => a.date - b.date);

    return {
      days: picked,
      dueDow,
      dueDayBusy: blocked.has(dueDow),
      urgent: false
    };
  }

  function joinDayNames(days) {
    const names = days.map((d) => DAY_NAMES[d.dow]);
    if (names.length <= 1) return names[0] || "";
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }

  function buildPlanMessage(assignment, plan, allPlans) {
    const type = classifyAssignmentType(assignment);
    const dueName = DAY_NAMES[plan.dueDow];
    const dayNames = joinDayNames(plan.days);

    if (plan.urgent) {
      return `Your ${assignment.title} is due soon. Block time today if you can — even 25 minutes helps.`;
    }

    if ((type === "quiz" || type === "reading" || type === "homework") && plan.days.length) {
      const bigger = allPlans.find((entry) => {
        if (entry.assignmentId === assignment.id) return false;
        const otherType = classifyAssignmentType(entry.assignment);
        return (otherType === "essay" || otherType === "project" || otherType === "lab") && entry.days.length;
      });

      if (bigger) {
        const lastBigDay = bigger.days[bigger.days.length - 1];
        const quickDay = plan.days[0];
        if (lastBigDay && quickDay && quickDay.date >= lastBigDay.date) {
          const quickName = DAY_NAMES[quickDay.dow];
          return `This ${type === "quiz" ? "quiz" : type === "reading" ? "reading" : "assignment"} looks shorter. Finish it ${quickName} after your ${bigger.title} work is complete.`;
        }
      }

      const quickName = DAY_NAMES[plan.days[0].dow];
      return `This looks quick. Plan about ${assignment.estimatedMinutes || 30} minutes on ${quickName}.`;
    }

    if (plan.dueDayBusy && plan.days.length >= 2) {
      return `Your ${assignment.title} is due ${dueName}, but ${dueName} is already busy. I recommend working on this ${dayNames} so you stay ahead of the deadline.`;
    }

    if (plan.days.length >= 2) {
      return `Your ${assignment.title} is due ${dueName}. Spread the work across ${dayNames} so you're not cramming the night before.`;
    }

    if (plan.days.length === 1) {
      return `Due ${dueName}. A good day to start is ${dayNames} — about ${assignment.estimatedMinutes || 60} minutes total.`;
    }

    return `Due ${dueName}. Your schedule is tight — look for any open evening before then.`;
  }

  function buildStayAheadPlans(assignments, schedule, now = new Date()) {
    const pending = (assignments || [])
      .filter((a) => a && !a.completed)
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    const entries = pending.map((assignment) => {
      const plan = recommendWorkDays(assignment, schedule, now);
      return {
        assignmentId: assignment.id,
        assignment,
        days: plan.days,
        dueDow: plan.dueDow,
        dueDayBusy: plan.dueDayBusy,
        urgent: plan.urgent,
        startDayLabels: plan.days.map((d) => DAY_LABELS[d.dow]),
        startDayNames: plan.days.map((d) => DAY_NAMES[d.dow]),
        message: ""
      };
    });

    entries.forEach((entry) => {
      entry.message = buildPlanMessage(entry.assignment, entry, entries);
    });

    return entries;
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

    const { data, error } = await supabase.functions.invoke("stay-ahead-plan", { body });
    if (error) throw new Error(error.message || "Planning request failed.");
    if (data?.error) throw new Error(data.error);
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
          dueDayName: DAY_NAMES[p.dueDow],
          dueDayBusy: p.dueDayBusy,
          localMessage: p.message
        }))
      });

      if (Array.isArray(data?.plans)) {
        const byId = new Map(data.plans.map((p) => [p.assignmentId, p.message]));
        return plans.map((p) => ({
          ...p,
          message: byId.get(p.assignmentId) || p.message,
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
    normalizeSchedule,
    getScheduleFromProfile,
    saveScheduleToProfile,
    buildStayAheadPlans,
    buildHowToStartLocal,
    fetchHowToStart,
    polishPlansWithAi,
    classifyAssignmentType
  };
})();
