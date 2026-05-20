# ============================================================
#  streamlit_app.py  —  Focus App (fully wired to tracker.py)
#  Run with:  streamlit run streamlit_app.py
# ============================================================

import streamlit as st
from tracker import FocusTracker, Session

# ── Page config (must be first) ────────────────────────────
st.set_page_config(
    page_title="Focus App",
    page_icon="🧠",
    layout="centered"
)

# ── Custom CSS ─────────────────────────────────────────────
st.markdown("""
<style>
  /* hide streamlit branding */
  #MainMenu, footer { visibility: hidden; }

  /* dark card style */
  .stat-card {
    background: rgba(255,255,255,0.04);
    border: 0.5px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 16px 20px;
    text-align: center;
    margin-bottom: 8px;
  }
  .stat-num  { font-size: 2rem; font-weight: 400; }
  .stat-lbl  { font-size: 0.75rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.05em; }

  .tl-item   { padding: 6px 0; border-left: 2px solid rgba(255,255,255,0.1); padding-left: 12px; margin-bottom: 6px; }
  .tl-time   { font-size: 0.75rem; opacity: 0.45; }
  .tl-text   { font-size: 0.9rem; }
</style>
""", unsafe_allow_html=True)

# ── Session state (persists across reruns) ─────────────────
# Streamlit reruns the whole script on every interaction.
# st.session_state is the way to keep data alive between reruns.

if "tracker" not in st.session_state:
    st.session_state.tracker = FocusTracker()

if "page" not in st.session_state:
    st.session_state.page = "home"   # home | session | recap

if "last_session" not in st.session_state:
    st.session_state.last_session = None

tracker: FocusTracker = st.session_state.tracker

# ── Helper ─────────────────────────────────────────────────
def go(page: str):
    st.session_state.page = page
    st.rerun()


# ══════════════════════════════════════════════════════════
#  HOME PAGE
# ══════════════════════════════════════════════════════════
if st.session_state.page == "home":

    st.title("🧠 Focus App")
    st.caption("Your AI focus companion")

    # streak badge
    streak = tracker.streak
    if streak > 0:
        st.success(f"🔥 {streak}-day streak — keep it going!")

    # coach insight from previous sessions
    if tracker.sessions:
        with st.container():
            st.info("💬 **Coach:** " + tracker.coach_insight().replace("\n💬 Coach: ", ""))

    st.divider()

    # ── Start session form ─────────────────────────────────
    st.subheader("Start a session")

    goal = st.text_input(
        "What are you focusing on?",
        placeholder="Biology finals — Chapter 7"
    )
    duration = st.slider("Duration (minutes)", 15, 120, 45)

    if st.button("▶  Start Session", type="primary", use_container_width=True):
        if not goal.strip():
            st.warning("Add a goal first!")
        else:
            tracker.start_session(goal.strip(), duration)
            go("session")

    st.divider()

    # ── History ────────────────────────────────────────────
    if tracker.sessions:
        st.subheader("Recent sessions")

        col1, col2, col3 = st.columns(3)
        col1.metric("Avg score",    f"{tracker.average_score()}/100")
        col2.metric("Total hours",  f"{tracker.total_focus_hours()} h")
        col3.metric("Sessions",     len(tracker.sessions))

        st.divider()

        for s in reversed(tracker.sessions[-5:]):
            with st.expander(f"**{s.goal}** — {s.score}/100 pts"):
                c1, c2, c3 = st.columns(3)
                c1.metric("Duration",      f"{s.actual_duration} min")
                c2.metric("Distractions",  len(s.distractions))
                c3.metric("Best streak",   f"{s.best_streak_minutes} min")
    else:
        st.caption("No sessions yet — start your first one above.")


# ══════════════════════════════════════════════════════════
#  SESSION PAGE
# ══════════════════════════════════════════════════════════
elif st.session_state.page == "session":

    active: Session = tracker._active

    if active is None:
        st.error("No active session found.")
        if st.button("Go home"):
            go("home")
    else:
        # header
        col_left, col_right = st.columns([3, 1])
        col_left.subheader(f"📚 {active.goal}")
        if col_right.button("End session", type="secondary"):
            st.session_state.last_session = tracker.end_session()
            go("recap")

        st.caption(f"Planned: {active.planned_duration} min")
        st.divider()

        # live stats
        c1, c2, c3 = st.columns(3)
        c1.metric("Distractions", len(active.distractions))
        c2.metric("Breaks",       len(active.breaks))
        c3.metric("Best streak",  f"{round(active.best_streak_minutes, 1)} min")

        st.divider()

        # ── Log a distraction ──────────────────────────────
        st.subheader("📵 Log a distraction")
        st.caption("Tap the app that distracted you.")

        apps = ["Instagram", "TikTok", "YouTube", "Twitter / X", "Reddit", "WhatsApp", "Other"]
        cols = st.columns(4)
        for i, app in enumerate(apps):
            if cols[i % 4].button(app, key=f"app_{app}", use_container_width=True):
                tracker.log_distraction(app, refocused=True)
                st.toast(f"📵 {app} logged — refocus!", icon="📵")
                st.rerun()

        st.divider()

        # ── Log a break ────────────────────────────────────
        st.subheader("☕ Take a break")
        break_min = st.select_slider(
            "Break length",
            options=[2, 5, 10, 15, 20],
            value=5,
            format_func=lambda x: f"{x} min"
        )
        if st.button("Log break", use_container_width=True):
            tracker.log_break(float(break_min))
            st.toast(f"☕ {break_min}-min break logged", icon="☕")
            st.rerun()

        st.divider()

        # ── Timeline so far ────────────────────────────────
        if active.distractions or active.breaks:
            st.subheader("Timeline so far")
            for d in active.distractions:
                st.markdown(
                    f'<div class="tl-item">'
                    f'<div class="tl-time">{d.timestamp[11:16]}</div>'
                    f'<div class="tl-text">📵 Opened {d.app}</div>'
                    f'</div>',
                    unsafe_allow_html=True
                )
            for b in active.breaks:
                st.markdown(
                    f'<div class="tl-item">'
                    f'<div class="tl-time">{b.timestamp[11:16]}</div>'
                    f'<div class="tl-text">☕ {b.duration_minutes}-min break</div>'
                    f'</div>',
                    unsafe_allow_html=True
                )


# ══════════════════════════════════════════════════════════
#  RECAP PAGE
# ══════════════════════════════════════════════════════════
elif st.session_state.page == "recap":

    s: Session = st.session_state.last_session

    if s is None:
        st.error("No session to recap.")
        if st.button("Go home"):
            go("home")
    else:
        st.title("Session complete 🎉")

        # big score
        score_color = "green" if s.score >= 70 else "orange" if s.score >= 50 else "red"
        st.markdown(
            f"<h1 style='font-size:4rem;color:{score_color}'>{s.score} <span style='font-size:1.5rem;opacity:0.5'>/ 100</span></h1>",
            unsafe_allow_html=True
        )

        # compare to previous
        prev_sessions = tracker.sessions[:-1]
        if prev_sessions:
            prev_score = prev_sessions[-1].score
            delta = s.score - prev_score
            st.metric("vs last session", f"{s.score}/100", delta=f"{delta:+d} pts")

        st.divider()

        # stats row
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Duration",      f"{s.actual_duration} min")
        c2.metric("Distractions",  len(s.distractions))
        c3.metric("Breaks",        len(s.breaks))
        c4.metric("Best streak",   f"{round(s.best_streak_minutes, 1)} min")

        st.divider()

        # coach insight
        st.subheader("💬 Coach")
        st.info(tracker.coach_insight().replace("\n💬 Coach: ", ""))

        # timeline
        st.subheader("Timeline")
        st.markdown(
            f'<div class="tl-item"><div class="tl-time">{s.start_time.strftime("%H:%M")}</div>'
            f'<div class="tl-text">▶ Session started — {s.goal}</div></div>',
            unsafe_allow_html=True
        )
        for d in s.distractions:
            st.markdown(
                f'<div class="tl-item"><div class="tl-time">{d.timestamp[11:16]}</div>'
                f'<div class="tl-text">📵 Opened {d.app}</div></div>',
                unsafe_allow_html=True
            )
        for b in s.breaks:
            st.markdown(
                f'<div class="tl-item"><div class="tl-time">{b.timestamp[11:16]}</div>'
                f'<div class="tl-text">☕ {b.duration_minutes}-min break</div></div>',
                unsafe_allow_html=True
            )
        if s.end_time:
            st.markdown(
                f'<div class="tl-item"><div class="tl-time">{s.end_time.strftime("%H:%M")}</div>'
                f'<div class="tl-text">🏁 Session ended</div></div>',
                unsafe_allow_html=True
            )

        st.divider()

        # score breakdown
        with st.expander("How was my score calculated?"):
            base = 60
            st.write(f"**Base score:** {base}")
            if s.actual_duration and s.actual_duration >= s.planned_duration:
                st.write("✅ +10 — finished on time")
            for d in s.distractions:
                pts = -3 if d.refocused else -5
                st.write(f"{'⚠️' if d.refocused else '❌'} {pts} — {d.app} ({'refocused' if d.refocused else 'did not refocus'})")
            if s.best_streak_minutes >= 15:
                st.write("✅ +5 — best streak > 15 min")
            total_d = len(s.distractions)
            if total_d > 0:
                rate = sum(1 for d in s.distractions if d.refocused) / total_d
                if rate >= 0.75:
                    st.write("✅ +10 — refocused 75%+ of the time")
            st.write(f"**Final score: {s.score}/100**")

        st.divider()

        # save and go home
        col1, col2 = st.columns(2)
        if col1.button("💾 Save & go home", type="primary", use_container_width=True):
            tracker.save()
            go("home")
        if col2.button("🏠 Go home (don't save)", use_container_width=True):
            go("home")
