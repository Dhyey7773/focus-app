(function () {
  function getClient() {
    return window.FocusAuth?.getSupabase?.() || window.supabaseClient || null;
  }

  function rowToHistoryItem(row) {
    const created = row.created_at ? new Date(row.created_at) : new Date();
    const offset = created.getTimezoneOffset() * 60000;
    const date =
      row.date || new Date(created.getTime() - offset).toISOString().slice(0, 10);

    return {
      date,
      task: row.task || "Focus session",
      focusMinutes: row.focus_minutes ?? 0,
      distractions: row.distractions ?? 0,
      breaks: row.breaks ?? 0,
      refocuses: row.refocuses ?? 0,
      score: row.score ?? 0,
      completedNaturally: !!row.completed_naturally,
      events: Array.isArray(row.events) ? row.events : []
    };
  }

  function formatSaveError(error) {
    const msg = error?.message || "Could not save session";
    if (/row-level security|policy/i.test(msg)) {
      return "Blocked by policy. Check Supabase RLS for focus_sessions.";
    }
    if (/does not exist|schema cache|PGRST204/i.test(msg)) {
      return "Table or column missing. Run your Supabase schema migration.";
    }
    if (/JWT|session|not authenticated/i.test(msg)) {
      return "Not signed in. Sign out, sign in again, then finish a session.";
    }
    if (/email not confirmed/i.test(msg)) {
      return "Confirm your email, then sign in again.";
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
      return { ok: false, reason: "not-signed-in", message: "Sign in to sync sessions." };
    }

    const row = {
      user_id: session.user.id,
      task: summary.task || "Focus session",
      focus_minutes: Number(summary.focusMinutes) || 0,
      distractions: Number(summary.distractions) || 0,
      breaks: Number(summary.breaks) || 0,
      refocuses: Number(summary.refocuses) || 0,
      score: Number(summary.score) || 0,
      completed_naturally: Boolean(summary.completedNaturally),
      events: summary.events || [],
      date: summary.date || new Date().toISOString().slice(0, 10)
    };

    const { data, error } = await supabase.from("focus_sessions").insert([row]).select("id");

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
      .select(
        "id, task, focus_minutes, distractions, breaks, refocuses, score, completed_naturally, events, date, created_at"
      )
      .eq("user_id", session.user.id)
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
