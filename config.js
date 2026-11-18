// Supabase の接続設定。
// 空のままだと「デモモード」（この端末のブラウザ内だけで動作）になります。
// SUPABASE_ANON_KEY と VAPID_PUBLIC_KEY は公開前提のキーです
// （データはログインした2人だけが読めるよう DB 側で制限しています）。
// ※ VAPIDの秘密鍵は ../ふたりカレンダー_非公開/ にあり、ここには絶対に書かないこと。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://nftugeeuyaupwnroopxw.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdHVnZWV1eWF1cHducm9vcHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5NDYyNDcsImV4cCI6MjExMDUyMjI0N30.rudCQyF9dL5yxR_9XgiA5l_ZyRED56DRLCUuX550aXg',
  VAPID_PUBLIC_KEY: 'BFRfxSCrZtmI8lWAODo6NghGWihIe7Tn6kqu2-0YI4N8T4uVZVEdtsYi0MswN8vylXBZ1xT2pT1nJoHY1ZkKsZc'
};
