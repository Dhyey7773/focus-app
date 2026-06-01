(function () {
  function getClient() {
    return window.FocusAuth?.getSupabase?.() || window.supabaseClient || null;
  }

  function rowToHistoryItem(row) {
    const created = row.created_at ? new Date(row.created_at) : new Date();
    const offset = created.getTimezoneOffset() * 60000;
    const date = new Date(created.getTime() - offset).toISOString().slice(0, 10);
    const distractions = row.distractions ?? 0;
const completedNaturally = !!row.completed_naturally;
    let score = 96 + (completedNaturally ? 4 : 0) - distractions * 8;
    score = Math.max(25, Math.min(100, score));

    return {
      date,
      task: "Focus session",
focusMinutes: row.focus_minutes ?? 0,
      distractions,
      breaks: 0,
      refocuses: 0,
      score,
      completedNaturally,
      events: []
    };
  }

  function formatSaveError(error) {
    const msg = error?.message || "Could not save session";
    if (/row-level security|policy/i.test(msg)) {
      return "Blocked by policy. Run supabase-schema.sql in Supabase SQL Editor.";
    }
    if (/does not exist|schema cache|PGRST204/i.test(msg)) {
      return "Wrong column names. Table needs: duration, interruptions, completed.";
    }
    if (/JWT|session|not authenticated/i.test(msg)) {
      return "Not signed in. Sign out, sign in again, then finish a session.";
    }
    if (/email not confirmed/i.test(msg)) {
      return "Confirm your email in inbox, then sign in again.";
    }
    return msg;
  }

  async function saveFocusSession(summary) {
    const supabase = getClient();
    if (!supabase) {
      return { ok: false, reason: "no-client", message: "Supabase client missing." };
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return { ok: false, reason: "not-signed-in", message: "Sign in first (top of app)." };
    }

    const row = {
  user_id: session.user.id,
  task: summary.task,
  focus_minutes: Number(summary.focusMinutes) || 0,
  distractions: Number(summary.distractions) || 0,
  breaks: Number(summary.breaks) || 0,
  refocuses: Number(summary.refocuses) || 0,
  score: Number(summary.score) || 0,
  completed_naturally: Boolean(summary.completedNaturally),
  events: summary.events || [],
  date: summary.date
};

    let { data, error } = await supabase.from("focus_sessions").insert([row]).select("id");

    if (error && /user_id|null value in column/i.test(error.message)) {
      const withUser = { ...row, user_id: session.user.id };
      const retry = await supabase.from("focus_sessions").insert([withUser]).select("id");
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("focus_sessions insert failed:", error, row);
      return { ok: false, error, message: formatSaveError(error) };
    }

    return { ok: true, data };
  }

  async function loadFocusSessions(limit = 20) {
    const supabase = getClient();
    if (!supabase) return { ok: false, sessions: [], reason: "no-client" };

    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return { ok: false, sessions: [], reason: "not-signed-in" };
    }

    const { data, error } = await supabase
      .from("focus_sessions")
.select(`
  id,
  task,
  focus_minutes,
  distractions,
  breaks,
  refocuses,
  score,
  completed_naturally,
  events,
  date,
  created_at
`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("focus_sessions load error:", error);
      return { ok: false, sessions: [], error, message: formatSaveError(error) };
    }

    return { ok: true, sessions: data || [] };
  }

  async function applySessionsToProfile(profile) {
    const result = await loadFocusSessions(20);
    if (!result.ok) return result;
    profile.history = result.sessions.map(rowToHistoryItem);
    return { ok: true, count: profile.history.length };
  }

  window.FocusSessions = {
    save: saveFocusSession,
    load: loadFocusSessions,
    applyToProfile: applySessionsToProfile,
    rowToHistoryItem
  };
})();
