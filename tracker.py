# ============================================================
#  Focus Session Tracker — Google Colab Backend
#  Run each cell in order. All data is stored in memory
#  (and optionally saved/loaded as JSON).
# ============================================================

# ── Cell 1: Install & Imports ──────────────────────────────
# No extra installs needed — uses only the Python standard library.

import json
import uuid
import datetime
import statistics
from pathlib import Path

print("✅ Ready.")


# ── Cell 2: Data Models ────────────────────────────────────

class Distraction:
    """A single distraction event recorded during a session."""

    def __init__(self, app: str, refocused: bool = True):
        self.id = str(uuid.uuid4())[:8]
        self.timestamp = datetime.datetime.now().isoformat()
        self.app = app          # e.g. "Instagram", "TikTok"
        self.refocused = refocused

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "app": self.app,
            "refocused": self.refocused,
        }


class Break:
    """A break taken during a session."""

    def __init__(self, duration_minutes: float):
        self.id = str(uuid.uuid4())[:8]
        self.timestamp = datetime.datetime.now().isoformat()
        self.duration_minutes = duration_minutes

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "duration_minutes": self.duration_minutes,
        }


class Session:
    """
    A single focus session.

    Attributes
    ----------
    goal        : What the user is working on (e.g. "Biology finals Ch.7")
    duration_min: Planned session length in minutes
    """

    def __init__(self, goal: str, duration_min: int = 45):
        self.id = str(uuid.uuid4())[:8]
        self.goal = goal
        self.planned_duration = duration_min
        self.actual_duration: float | None = None   # set on end()
        self.start_time = datetime.datetime.now()
        self.end_time: datetime.datetime | None = None
        self.distractions: list[Distraction] = []
        self.breaks: list[Break] = []
        self.score: int | None = None
        self.best_streak_minutes: float = 0.0       # longest focused run
        self._streak_start = self.start_time

    # ── recording events ──────────────────────────────────

    def log_distraction(self, app: str, refocused: bool = True) -> Distraction:
        d = Distraction(app, refocused)
        self.distractions.append(d)
        # reset streak clock when distracted
        self._update_streak()
        self._streak_start = datetime.datetime.now()
        print(f"  📵  Distraction logged: {app}  {'(refocused ✓)' if refocused else '(not refocused)'}")
        return d

    def log_break(self, duration_minutes: float) -> Break:
        b = Break(duration_minutes)
        self.breaks.append(b)
        self._update_streak()
        self._streak_start = datetime.datetime.now()
        print(f"  ☕  Break logged: {duration_minutes} min")
        return b

    def _update_streak(self):
        """Update best_streak if the current focused run beats the record."""
        current = (datetime.datetime.now() - self._streak_start).total_seconds() / 60
        if current > self.best_streak_minutes:
            self.best_streak_minutes = round(current, 1)

    # ── ending & scoring ──────────────────────────────────

    def end(self) -> int:
        """
        End the session, calculate score (0–100), and return it.

        Scoring formula
        ---------------
        Base              : 60 pts
        +10  if actual ≥ planned duration
        −5   per unrecovered distraction
        −3   per distraction that was recovered
        +5   if best streak > 15 min
        +10  if refocus rate ≥ 75 %
        """
        self.end_time = datetime.datetime.now()
        self.actual_duration = round(
            (self.end_time - self.start_time).total_seconds() / 60, 1
        )
        self._update_streak()

        # --- score calculation ---
        score = 60

        if self.actual_duration >= self.planned_duration:
            score += 10

        for d in self.distractions:
            score -= 3 if d.refocused else 5

        if self.best_streak_minutes >= 15:
            score += 5

        total_d = len(self.distractions)
        if total_d > 0:
            refocus_rate = sum(1 for d in self.distractions if d.refocused) / total_d
            if refocus_rate >= 0.75:
                score += 10

        self.score = max(0, min(100, score))
        print(f"\n🏁  Session ended — score: {self.score}/100")
        return self.score

    # ── serialisation ─────────────────────────────────────

    def to_dict(self):
        return {
            "id": self.id,
            "goal": self.goal,
            "planned_duration": self.planned_duration,
            "actual_duration": self.actual_duration,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "distractions": [d.to_dict() for d in self.distractions],
            "breaks": [b.to_dict() for b in self.breaks],
            "score": self.score,
            "best_streak_minutes": self.best_streak_minutes,
        }

    def summary(self) -> str:
        lines = [
            f"{'─'*44}",
            f"  Session : {self.goal}",
            f"  Duration: {self.actual_duration or '?'} / {self.planned_duration} min planned",
            f"  Score   : {self.score}/100",
            f"  Streak  : {self.best_streak_minutes} min best",
            f"  Distract: {len(self.distractions)}  (breaks: {len(self.breaks)})",
            f"{'─'*44}",
        ]
        return "\n".join(lines)


print("✅ Data models ready.")


# ── Cell 3: Tracker (stores all sessions) ─────────────────

class FocusTracker:
    """
    Central tracker.  Holds a list of completed sessions and
    exposes analytics / coach insights.
    """

    DATA_FILE = Path("focus_sessions.json")

    def __init__(self):
        self.sessions: list[Session] = []
        self._active: Session | None = None

    # ── session lifecycle ─────────────────────────────────

    def start_session(self, goal: str, duration_min: int = 45) -> Session:
        if self._active:
            print("⚠️  A session is already running — end it first.")
            return self._active
        self._active = Session(goal, duration_min)
        print(f"▶  Session started: '{goal}' ({duration_min} min)")
        return self._active

    def log_distraction(self, app: str, refocused: bool = True):
        self._require_active()
        return self._active.log_distraction(app, refocused)

    def log_break(self, duration_minutes: float = 5.0):
        self._require_active()
        return self._active.log_break(duration_minutes)

    def end_session(self) -> Session | None:
        self._require_active()
        self._active.end()
        self.sessions.append(self._active)
        done = self._active
        self._active = None
        print(done.summary())
        print(self.coach_insight())
        return done

    def _require_active(self):
        if not self._active:
            raise RuntimeError("No active session. Call start_session() first.")

    # ── streak ────────────────────────────────────────────

    @property
    def streak(self) -> int:
        """
        How many consecutive calendar days the user has had
        at least one completed session.
        """
        if not self.sessions:
            return 0

        days = sorted(
            {datetime.date.fromisoformat(s.start_time.date().isoformat())
             for s in self.sessions},
            reverse=True,
        )

        streak = 1
        for i in range(1, len(days)):
            if (days[i - 1] - days[i]).days == 1:
                streak += 1
            else:
                break
        return streak

    # ── analytics ─────────────────────────────────────────

    def average_score(self) -> float:
        if not self.sessions:
            return 0.0
        scores = [s.score for s in self.sessions if s.score is not None]
        return round(statistics.mean(scores), 1) if scores else 0.0

    def average_focus_minutes(self) -> float:
        """Average actual session length in minutes."""
        durations = [s.actual_duration for s in self.sessions if s.actual_duration]
        return round(statistics.mean(durations), 1) if durations else 0.0

    def total_focus_hours(self) -> float:
        total = sum(s.actual_duration or 0 for s in self.sessions)
        return round(total / 60, 2)

    def best_time_of_day(self) -> str:
        """
        Returns 'morning', 'afternoon', or 'evening' based on which
        period has the highest average score.
        """
        buckets = {"morning": [], "afternoon": [], "evening": []}
        for s in self.sessions:
            if s.score is None:
                continue
            h = s.start_time.hour
            if 5 <= h < 12:
                buckets["morning"].append(s.score)
            elif 12 <= h < 18:
                buckets["afternoon"].append(s.score)
            else:
                buckets["evening"].append(s.score)

        avgs = {k: statistics.mean(v) for k, v in buckets.items() if v}
        if not avgs:
            return "unknown"
        return max(avgs, key=avgs.get)

    def distraction_frequency(self) -> dict:
        """
        Returns a dict of {app_name: count} sorted by frequency.
        """
        freq: dict[str, int] = {}
        for s in self.sessions:
            for d in s.distractions:
                freq[d.app] = freq.get(d.app, 0) + 1
        return dict(sorted(freq.items(), key=lambda x: -x[1]))

    # ── coach insight ─────────────────────────────────────

    def coach_insight(self) -> str:
        """Returns a short personalised tip based on recent sessions."""
        if not self.sessions:
            return "💬 Coach: Complete your first session to unlock insights."

        last = self.sessions[-1]
        tips = []

        # refocus rate tip
        total_d = len(last.distractions)
        if total_d > 0:
            refocused = sum(1 for d in last.distractions if d.refocused)
            rate = refocused / total_d
            if rate >= 0.75:
                tips.append(
                    f"You refocused {refocused}/{total_d} times — that's discipline."
                )
            else:
                tips.append(
                    f"You only refocused {refocused}/{total_d} times. "
                    "Try the 'keep going' rule: wait 2 min before acting on any urge."
                )

        # streak tip
        if last.best_streak_minutes > 0:
            tips.append(
                f"Your best streak was {last.best_streak_minutes} min — "
                + ("great flow!" if last.best_streak_minutes >= 15 else "aim for 15+ next time.")
            )

        # time-of-day tip (needs ≥3 sessions)
        if len(self.sessions) >= 3:
            best = self.best_time_of_day()
            tips.append(f"You score best in the {best} — schedule hard tasks then.")

        # most distracting app
        freq = self.distraction_frequency()
        if freq:
            worst = next(iter(freq))
            tips.append(f"Your biggest distraction is {worst} — consider blocking it.")

        insight = "  ".join(tips[:3])
        return f"\n💬 Coach: {insight}"

    # ── printing ──────────────────────────────────────────

    def print_history(self):
        if not self.sessions:
            print("No sessions yet.")
            return
        print(f"\n{'─'*44}")
        print(f"  Total sessions : {len(self.sessions)}")
        print(f"  Total hours    : {self.total_focus_hours()} h")
        print(f"  Average score  : {self.average_score()}/100")
        print(f"  Average session: {self.average_focus_minutes()} min")
        print(f"  Current streak : {self.streak} day(s)")
        print(f"{'─'*44}")
        for s in self.sessions[-5:]:     # show last 5
            score_str = f"{s.score}/100" if s.score is not None else "in progress"
            dur = f"{s.actual_duration} min" if s.actual_duration else "?"
            print(f"  [{s.id}] {s.goal[:28]:<28} {dur:>8}  {score_str}")
        print()

    # ── persistence ───────────────────────────────────────

    def save(self, path: str | None = None):
        """Save all sessions to a JSON file."""
        file = Path(path) if path else self.DATA_FILE
        data = [s.to_dict() for s in self.sessions]
        file.write_text(json.dumps(data, indent=2))
        print(f"💾  Saved {len(data)} session(s) to {file}")

    def load(self, path: str | None = None):
        """Load sessions from a JSON file (replaces current sessions)."""
        file = Path(path) if path else self.DATA_FILE
        if not file.exists():
            print(f"⚠️  File not found: {file}")
            return
        raw = json.loads(file.read_text())
        self.sessions = []
        for item in raw:
            s = Session.__new__(Session)
            s.id = item["id"]
            s.goal = item["goal"]
            s.planned_duration = item["planned_duration"]
            s.actual_duration = item["actual_duration"]
            s.start_time = datetime.datetime.fromisoformat(item["start_time"])
            s.end_time = (
                datetime.datetime.fromisoformat(item["end_time"])
                if item["end_time"] else None
            )
            s.distractions = [
                Distraction(d["app"], d["refocused"])
                for d in item["distractions"]
            ]
            s.breaks = [Break(b["duration_minutes"]) for b in item["breaks"]]
            s.score = item["score"]
            s.best_streak_minutes = item["best_streak_minutes"]
            s._active = None
            s._streak_start = s.start_time
            self.sessions.append(s)
        print(f"📂  Loaded {len(self.sessions)} session(s) from {file}")


tracker = FocusTracker()
print("✅ FocusTracker ready. Use `tracker` to interact.")


# ── Cell 4: Demo Run ───────────────────────────────────────
# This simulates a full session so you can see everything working.
# Delete or skip this cell in real use.

print("=" * 44)
print("  DEMO SESSION")
print("=" * 44)

tracker.start_session("Biology finals — Ch. 7", duration_min=46)

# Simulate events
tracker.log_distraction("TikTok", refocused=True)
tracker.log_break(5.0)
tracker.log_distraction("Instagram", refocused=True)
tracker.log_distraction("YouTube", refocused=False)
tracker.log_distraction("Instagram", refocused=True)

tracker.end_session()

tracker.print_history()

tracker.save()      # saves to focus_sessions.json


# ── Cell 5: Start a Real Session ──────────────────────────
# Uncomment and run this cell when you want to track a real session.

# tracker.start_session("Your goal here", duration_min=45)

# During the session, run these in new cells as events happen:
# tracker.log_distraction("Instagram")        # refocused=True by default
# tracker.log_distraction("YouTube", refocused=False)
# tracker.log_break(5)

# When done:
# tracker.end_session()
# tracker.save()

print("\n✅ All cells executed. Your tracker is set up and a demo session was saved.")
print("   Edit Cell 5 to start tracking real sessions.")
