window.APP_CONFIG = {
  // Canonical site URL — must match Supabase Auth → URL Configuration
  SITE_URL: "https://www.quietfocusai.com",
  SUPABASE_URL: "https://pyqnhbuzpagosqxsjvwg.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cW5oYnV6cGFnb3NxeHNqdndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTc1NzksImV4cCI6MjA5NTM3MzU3OX0.XorO-8qaHlgpDsPUqcOv6WDxP0op_hWAQ73rVHf28qo",
  SUPPORT_EMAIL: "quietfocusai@gmail.com",
  SUPPORT_DISPLAY: "support@quietfocusai.com",
  // Public site key only — secret goes in Supabase Auth → Bot and Abuse Protection
  TURNSTILE_SITE_KEY: "",
  // Web Push (public key). Private key → Supabase Edge Function secrets as VAPID_PRIVATE_KEY
  VAPID_PUBLIC_KEY: "BA8c2Tqt7D_6skqSCU5vlAaFgeStR63xw_Y9WtMlXZ6K_1FKfd29_7aNKxh4F4V5_AbStRD6VaEtzUkRF25z2CQ",
  // Optional 3D mascot URL (Supabase Storage public link). Leave empty = PNG only.
  QUIET_GLB_URL: "",
  // Bump when deploying — should match sw.js CACHE suffix (quiet-focus-v32 → "32")
  APP_CACHE_VERSION: "37"
};
