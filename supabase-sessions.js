(function () {
  function getClient() {
    return window.FocusAuth?.getSupabase?.() || window.supabaseClient || null;
  }

  function isColumnError(error) {
    const msg = error?.message || "";
    return /does not exist|schema cache|PGRST204|column/i.test(msg);
  }

  function rowToHistoryItem(row) {
    const created = row.created_at ? new Date(row.created_at) : new Date();
    const offset = created.getTimezoneOffset() * 60000;
    const date =
      row.date || new Date(created.getTime() - offset).toISOString().slice(0, 10);

    const focusSeconds = row.focus_seconds ?? (row.focus_minutes ?? row.duration ?? 0) * 60;
    const focusMinutes = row.focus_minutes ?? row.duration ?? Math.floor(focusSeconds / 60);
    const distractions = row.distractions ?? row.interruptions ?? 0;

    return {
      date,
      task: row.task || "Focus session",
      focusMinutes,
      focusSeconds,
      distractions,
      breaks: row.breaks ?? 0,
      refocuses: row.refocuses ?? 0,
      score: row.score ?? 0,
      completedNaturally: !!(row.completed_naturally ?? row.completed),
      events: Array.isArray(row.events) ? row.events : []
    };
  }

  function formatSaveError(error) {
    const msg = error?.message || "Could not save session";
    if (/row-level security|policy/i.test(msg)) {
      return "Save blocked — run supabase-schema.sql in Supabase SQL Editor.";
    }
    if (isColumnError(msg)) {
      return "Table columns missing — run supabase-schema.sql in Supabase SQL Editor.";
    }
    if (/JWT|session|not authenticated|401/i.test(msg)) {
      return "Session expired — sign out and sign in again.";
    }
    if (/email not confirmed/i.test(msg)) {
      return "Confirm your email, then sign in again.";
    }
    if (/too many sessions saved/i.test(msg)) {
      return "Session saved on this device. Cloud sync paused — try again in an hour.";
    }
    return msg;
  }

  async function getAuthSession(supabase) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (session?.user) return session;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    return refreshed.session;
  }

  function focusSecondsFromSummary(summary) {
    if (summary.focusSeconds != null) return Math.max(0, Math.round(Number(summary.focusSeconds)));
    return Math.max(0, Math.round(Number(summary.focusMinutes) || 0) * 60);
  }

  function buildFullRow(userId, summary) {
    const focusSeconds = focusSecondsFromSummary(summary);
    return {
      user_id: userId,
      task: summary.task || "Focus session",
      focus_minutes: Math.floor(focusSeconds / 60),
      focus_seconds: focusSeconds,
      distractions: Number(summary.distractions) || 0,
      breaks: Number(summary.breaks) || 0,
      refocuses: Number(summary.refocuses) || 0,
      score: Number(summary.score) || 0,
      completed_naturally: Boolean(summary.completedNaturally),
      events: summary.events || [],
      date: summary.date || new Date().toISOString().slice(0, 10)
    };
  }

  function buildLegacyRow(userId, summary) {
    return {
      user_id: userId,
      task: summary.task || "Focus session",
      focus_minutes: Number(summary.focusMinutes) || 0,
      distractions: Number(summary.distractions) || 0,
      completed_naturally: Boolean(summary.completedNaturally),
      date: summary.date || new Date().toISOString().slice(0, 10)
    };
  }

  async function saveFocusSession(summary) {
    const supabase = getClient();
    if (!supabase) {
      return { ok: false, reason: "no-client", message: "Supabase client missing." };
    }

    let session;
    try {
      session = await getAuthSession(supabase);
    } catch (err) {
      return { ok: false, reason: "auth-error", message: formatSaveError(err) };
    }

    if (!session?.user) {
      return { ok: false, reason: "not-signed-in", message: "Sign in to sync sessions." };
    }

    const fullRow = buildFullRow(session.user.id, summary);
    let { error } = await supabase.from("focus_sessions").insert([fullRow]);

    if (error && isColumnError(error) && fullRow.focus_seconds != null) {
      const { focus_seconds, ...rowWithoutSeconds } = fullRow;
      const retry = await supabase.from("focus_sessions").insert([rowWithoutSeconds]);
      error = retry.error;
    }

    if (error && isColumnError(error)) {
      const legacyRow = buildLegacyRow(session.user.id, summary);
      const retry = await supabase.from("focus_sessions").insert([legacyRow]);
      error = retry.error;
    }

    if (error) {
      console.error("focus_sessions insert failed:", error, fullRow);
      if (/row-level security|policy|permission denied|42501/i.test(error.message || "")) {
        return {
          ok: false,
          error,
          message: "Cloud save blocked — re-run supabase-schema.sql in Supabase SQL Editor."
        };
      }
      return { ok: false, error, message: formatSaveError(error) };
    }

    return { ok: true };
  }

  async function loadFocusSessions(limit = 20) {
    const supabase = getClient();
    if (!supabase) return { ok: false, sessions: [], reason: "no-client" };

    let session;
    try {
      session = await getAuthSession(supabase);
    } catch (err) {
      return { ok: false, sessions: [], error: err, message: formatSaveError(err) };
    }

    if (!session?.user) {
      return { ok: false, sessions: [], reason: "not-signed-in" };
    }

    const fullSelect =
      "id, task, focus_minutes, distractions, breaks, refocuses, score, completed_naturally, events, date, created_at";

    let { data, error } = await supabase
      .from("focus_sessions")
      .select(fullSelect + ", focus_seconds")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error && isColumnError(error)) {
      const fallback = await supabase
        .from("focus_sessions")
        .select(fullSelect)
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("focus_sessions load error:", error);
      return { ok: false, sessions: [], error, message: formatSaveError(error) };
    }

    return { ok: true, sessions: data || [] };
  }

  async function loadSessionStats() {
    const supabase = getClient();
    if (!supabase) return { ok: false, totalSessions: 0, totalMinutes: 0 };

    let session;
    try {
      session = await getAuthSession(supabase);
    } catch {
      return { ok: false, totalSessions: 0, totalMinutes: 0 };
    }

    if (!session?.user) return { ok: false, totalSessions: 0, totalMinutes: 0 };

    let { data, error } = await supabase
      .from("focus_sessions")
      .select("focus_minutes, focus_seconds")
      .eq("user_id", session.user.id);

    if (error && isColumnError(error)) {
      const fallback = await supabase
        .from("focus_sessions")
        .select("focus_minutes")
        .eq("user_id", session.user.id);
      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) return { ok: false, totalSessions: 0, totalMinutes: 0, totalSeconds: 0 };

    const totalSeconds = data.reduce(
      (s, r) => s + (r.focus_seconds ?? (r.focus_minutes || 0) * 60),
      0
    );
    return {
      ok: true,
      totalSessions: data.length,
      totalMinutes: totalSeconds / 60,
      totalSeconds
    };
  }

  function sessionHistoryKey(item) {
    if (item.id) return item.id;
    const seconds = item.focusSeconds ?? (Number(item.focusMinutes) || 0) * 60;
    return `${item.date}|${item.task}|${seconds}|${item.score ?? 0}|${item.savedAt || ""}`;
  }

  function mergeSessionHistory(localItems, cloudItems) {
    const merged = new Map();
    (cloudItems || []).forEach((item) => {
      merged.set(sessionHistoryKey(item), { ...item, syncedToCloud: true });
    });
    (localItems || []).forEach((item) => {
      const key = sessionHistoryKey(item);
      if (!merged.has(key)) {
        merged.set(key, item);
        return;
      }
      const existing = merged.get(key);
      if (!existing.syncedToCloud && item.syncedToCloud) {
        merged.set(key, { ...existing, syncedToCloud: true });
      }
    });
    return Array.from(merged.values()).sort((a, b) => {
      if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
      const bs = b.focusSeconds ?? (b.focusMinutes || 0) * 60;
      const as = a.focusSeconds ?? (a.focusMinutes || 0) * 60;
      return bs - as;
    });
  }

  async function applySessionsToProfile(profile) {
    const localItems = (profile.history || []).slice();
    const result = await loadFocusSessions(20);
    if (!result.ok) {
      profile.history = localItems;
      return {
        ok: true,
        count: localItems.length,
        cloudCount: 0,
        cloudUnavailable: true,
        loadError: result.message || result.reason
      };
    }
    const cloudItems = result.sessions.map(rowToHistoryItem);
    profile.history = mergeSessionHistory(localItems, cloudItems).slice(0, 20);
    return { ok: true, count: profile.history.length, cloudCount: cloudItems.length };
  }

  window.FocusSessions = {
    save: saveFocusSession,
    load: loadFocusSessions,
    loadStats: loadSessionStats,
    applyToProfile: applySessionsToProfile,
    mergeSessionHistory,
    rowToHistoryItem
  };
})();
