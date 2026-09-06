# My Food Jar v6 — Complete Web App

這是完整的 responsive PWA 前端版本，手機與桌機都能使用。

## 已完成
- Email-only 登入介面（Magic Link 架構）
- 無後端時可用「網站預覽」進入完整功能
- 每月糖果罐、價格視覺化、預算進度與月底預估
- 餐點新增 / 編輯 / 刪除 / 搜尋 / 分類
- 手機拍照或相簿上傳，圖片壓縮並做貼紙預覽
- Diary、Monthly Recap、週花費、餐別分布、花費日曆
- 月底分享卡
- 主題、罐子名稱、預算、Avatar 設定
- JSON 備份匯出
- PWA manifest + service worker，可部署後加入手機主畫面
- Supabase schema 與 RLS，確保每個帳號只能讀寫自己的資料

## 本機預覽
在資料夾內執行：

```bash
python3 -m http.server 8080
```

瀏覽器開 `http://localhost:8080`。

## 啟用真正 Email Magic Link
1. 建立 Supabase 專案。
2. 在 SQL Editor 執行 `supabase_schema.sql`。
3. 到 Authentication > URL Configuration 設定正式網站 URL / Redirect URL。
4. 編輯 `config.js`：填入 `SUPABASE_URL` 與 `SUPABASE_ANON_KEY`。
5. 部署到 HTTPS（Vercel / Netlify / GitHub Pages 均可）。

> 不要把 Supabase `service_role` key 放在前端；只使用 anon / publishable key。

## AI 去背
`config.js` 的 `REMOVE_BG_ENDPOINT` 可填入自己的去背 API。介面會在上傳圖片後呼叫該 API，預期回傳：

```json
{"image":"data:image/png;base64,..."}
```

若不設定，網站仍會正常運作，使用原圖作為貼紙。
