// 部署前填入 Supabase 專案資訊即可啟用真正的 Email Magic Link 與雲端同步。
// 注意：anon/publishable key 可以放在前端；請勿把 service_role key 放進網頁。
window.FOOD_JAR_CONFIG = {
  LOCAL_ONLY: true, // 個人使用：不需登入，紀錄儲存在目前瀏覽器。
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  REMOVE_BG_ENDPOINT: "" // 選填，例如 https://your-api.example.com/remove-background
};
