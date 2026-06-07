(function () {
  function getConfig() {
    return window.APP_CONFIG || {};
  }

  function getClient() {
    return window.FocusAuth?.getSupabase?.() || window.supabaseClient || null;
  }

  function urlB64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function subscriptionPayload(subscription) {
    const json = subscription.toJSON();
    return {
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh || "",
      auth: json.keys?.auth || ""
    };
  }

  async function getRegistration() {
    if (!("serviceWorker" in navigator)) return null;
    return navigator.serviceWorker.ready;
  }

  function isSupported() {
    return (
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function permissionState() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  async function subscribe() {
    const vapidKey = getConfig().VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      throw new Error("Push not configured yet — add VAPID_PUBLIC_KEY to config.js");
    }

    const registration = await getRegistration();
    if (!registration) throw new Error("Service worker not ready");

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidKey)
      });
    }

    await saveSubscription(subscription);
    return subscription;
  }

  async function saveSubscription(subscription) {
    const supabase = getClient();
    if (!supabase) throw new Error("Not signed in");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("Not signed in");

    const payload = subscriptionPayload(subscription);
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: session.user.id,
        endpoint: payload.endpoint,
        p256dh: payload.p256dh,
        auth: payload.auth,
        updated_at: new Date().toISOString()
      },
      { onConflict: "endpoint" }
    );

    if (error) throw error;
    localStorage.setItem("quiet-focus-push-enabled", "1");
    return true;
  }

  async function enablePushReminders() {
    if (!isSupported()) {
      throw new Error("This browser does not support push notifications");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission denied");
    }

    await subscribe();
    return permission;
  }

  async function disablePushReminders() {
    const registration = await getRegistration();
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const supabase = getClient();
      if (supabase) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", subscription.endpoint);
      }
      await subscription.unsubscribe();
    }

    localStorage.removeItem("quiet-focus-push-enabled");
  }

  async function syncSubscriptionIfEnabled() {
    if (localStorage.getItem("quiet-focus-push-enabled") !== "1") return;
    if (permissionState() !== "granted") return;
    try {
      await subscribe();
    } catch (err) {
      console.warn("Push sync failed:", err.message || err);
    }
  }

  async function sendTestNotification() {
    const registration = await getRegistration();
    if (!registration) throw new Error("Service worker not ready");
    if (permissionState() !== "granted") {
      throw new Error("Allow notifications first");
    }
    await registration.showNotification("Quiet Reminder", {
      body: "Hey — reminders are working. I'll nudge you gently before things are due.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "quiet-focus-test",
      data: { url: "./live-demo.html?page=assignments" }
    });
  }

  async function showLocalReminder({ title, body, tag, url }) {
    if (permissionState() !== "granted") return;
    const registration = await getRegistration();
    if (!registration) return;
    await registration.showNotification(title || "Quiet Focus", {
      body: body || "Assignment reminder",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: tag || "quiet-focus-reminder",
      data: { url: url || "./live-demo.html?page=assignments" }
    });
  }

  window.PushReminders = {
    isSupported,
    isStandalone,
    permissionState,
    enablePushReminders,
    disablePushReminders,
    syncSubscriptionIfEnabled,
    sendTestNotification,
    showLocalReminder
  };
})();
