(function () {
  "use strict";

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function assignmentLabel(title, course) {
    const name = String(title || "task").trim();
    const subject = String(course || "").trim();
    if (subject) return `your ${subject} — ${name}`;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function formatDueIn(ms) {
    if (ms < 0) return "overdue";
    const totalMinutes = Math.ceil(ms / 60000);
    if (totalMinutes < 60) return `${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (totalMinutes < 24 * 60) {
      return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    const days = Math.ceil(ms / 86400000);
    return days === 1 ? "tomorrow" : `${days} days`;
  }

  function build({ title, course, dueAt, milestone }) {
    const ms = new Date(dueAt).getTime() - Date.now();
    const hours = ms / 3600000;
    const name = assignmentLabel(title, course);
    const when = formatDueIn(ms);

    if (ms < 0 || milestone === "overdue") {
      return {
        kicker: "Overdue",
        title: "Quiet Checking In",
        body: pick([
          `${name} is overdue. Need more time? Update the deadline or finish it off.`,
          `Hey — ${name} is past due. You can still finish it or move the date.`,
        ]),
        modalHint: "Finish it or update the due date?",
      };
    }

    if (hours <= 1 || milestone === "h1") {
      return {
        kicker: hours <= 1 ? "1 Hour Left" : "Due Soon",
        title: "Quiet Reminder",
        body: pick([
          `Just a heads-up — ${name} is due in ${when}.`,
          `Hey, don't forget — ${name} is due in ${when}.`,
        ]),
        modalHint: "",
      };
    }

    if (hours <= 3) {
      return {
        kicker: "3 Hours Left",
        title: "Quiet Reminder",
        body: pick([
          `Just a heads-up — ${name} is due in ${when}.`,
          `${name} is due in ${when}. A little progress now helps.`,
        ]),
        modalHint: "Want to knock out a quick session?",
      };
    }

    if (hours <= 6 || milestone === "h6") {
      return {
        kicker: "Due Soon",
        title: "Quiet Reminder",
        body: pick([
          `${name} is due in ${when}. A little progress now can save stress later.`,
          `Hey — ${name} is due in ${when}. Even 20 minutes helps.`,
        ]),
        modalHint: "Start a focus session?",
      };
    }

    const dueTomorrow = hours >= 18 && hours <= 36;
    return {
      kicker: dueTomorrow ? "Due Tomorrow" : "Due Soon",
      title: dueTomorrow ? "Quiet Check-In" : "Quiet Reminder",
      body: dueTomorrow
        ? pick([
            `${name} is tomorrow. Want to knock out 20 minutes today?`,
            `Tomorrow's the due date for ${name}. A small start today feels good.`,
          ])
        : pick([
            `${name} is due in ${when}. A little progress now can save stress later.`,
            `Hey — ${name} is coming up in ${when}. You've got time.`,
          ]),
      modalHint: "Plan a focus block?",
    };
  }

  function buildEndOfDay(completedCount) {
    const n = Number(completedCount) || 0;
    if (n <= 0) return null;
    return {
      kicker: "End of Day",
      title: "Quiet",
      body: pick([
        `You completed ${n} task${n === 1 ? "" : "s"} today. Nice work. 🌱`,
        `${n} task${n === 1 ? "" : "s"} done today. Steady progress. 🌱`,
      ]),
    };
  }

  window.QuietReminderCopy = { build, buildEndOfDay, assignmentLabel, formatDueIn };
})();
