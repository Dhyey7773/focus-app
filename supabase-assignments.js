(function () {
  function getClient() {
    return window.FocusAuth?.getSupabase?.() || window.supabaseClient || null;
  }

  async function getSession(supabase) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  }

  function rowToAssignment(row) {
    const shown = row.reminders_shown || {};
    return {
      id: row.id,
      title: row.title || "Assignment",
      course: row.course || "",
      dueAt: row.due_at,
      estimatedMinutes: row.estimated_minutes || 60,
      completed: !!row.completed,
      completedAt: row.completed_at || null,
      snoozedUntil: row.snoozed_until || null,
      remindersShown: {
        h24: !!shown.h24,
        h6: !!shown.h6,
        h1: !!shown.h1
      },
      createdAt: row.created_at
    };
  }

  function assignmentToRow(userId, assignment) {
    return {
      id: assignment.id,
      user_id: userId,
      title: assignment.title,
      course: assignment.course || "",
      due_at: assignment.dueAt,
      estimated_minutes: Number(assignment.estimatedMinutes) || 60,
      completed: !!assignment.completed,
      completed_at: assignment.completedAt || null,
      snoozed_until: assignment.snoozedUntil || null,
      reminders_shown: assignment.remindersShown || { h24: false, h6: false, h1: false },
      updated_at: new Date().toISOString()
    };
  }

  async function syncOne(assignment) {
    const supabase = getClient();
    if (!supabase || !assignment?.id) return { ok: false, reason: "no-client" };

    const session = await getSession(supabase);
    if (!session?.user) return { ok: false, reason: "no-session" };

    const { error } = await supabase
      .from("assignments")
      .upsert(assignmentToRow(session.user.id, assignment), { onConflict: "id" });

    if (error) {
      console.warn("Assignment sync failed:", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  async function syncAll(assignments) {
    const list = assignments || [];
    for (const item of list) {
      await syncOne(item);
    }
    return { ok: true };
  }

  async function loadAll() {
    const supabase = getClient();
    if (!supabase) return { ok: false, reason: "no-client", assignments: [] };

    const session = await getSession(supabase);
    if (!session?.user) return { ok: false, reason: "no-session", assignments: [] };

    const { data, error } = await supabase
      .from("assignments")
      .select("*")
      .eq("user_id", session.user.id)
      .order("due_at", { ascending: true });

    if (error) {
      console.warn("Assignment load failed:", error.message);
      return { ok: false, message: error.message, assignments: [] };
    }

    return { ok: true, assignments: (data || []).map(rowToAssignment) };
  }

  window.AssignmentSync = { syncOne, syncAll, loadAll };
})();
