# BookRayder - Cloudflare 帳號管理與認證服務

本目錄包含 BookRayder 的 Serverless 認證中樞服務（基於 **Cloudflare Workers** 與 **Cloudflare D1**），提供高安全性、零維護成本的帳號密碼驗證與管理功能。

---

## 架構特點
- **安全加鹽雜湊**：使用 WebCrypto API 的 `PBKDF2`（100,000 次反覆運算）進行加鹽雜湊，不儲存明文密碼。
- **無狀態 JWT**：簽發標準 HMAC-SHA256 JWT Token，支援 30 天免重複登入。
- **帳號狀態控制**：支援 `is_active`（1: 啟用, 0: 停用），管理員可隨時在 Cloudflare 後台封鎖或解鎖帳號。
- **後台管理 API**：提供管理員 API 可批次管理使用者或整合自動化流程。

---

## 快速部屬步驟

### 1. 安裝 Wrangler 並登入 Cloudflare
```bash
cd cloudflare-auth
npm install -g wrangler
wrangler login
```

### 2. 建立 Cloudflare D1 資料庫
```bash
wrangler d1 create bookrayder-users-db
```
終端機會回傳 `database_id`，請將其填入 `wrangler.toml` 中的 `database_id = "..."`。

### 3. 初始化/更新資料庫資料表
```bash
npx wrangler d1 execute bookrayder-users-db --file=./schema.sql
```

### 4. 部署/更新 Worker
```bash
npx wrangler deploy
```
部署完成後會得到 Worker 網址，例如：`https://bookrayder-auth-worker.your-account.workers.dev`。

---

## 全家共用書庫 (Family Shared Storage) 機制

### 運作原理：
1. **管理員綁定 (`role: 'admin'`)**：
   - 管理員在閱讀器「設定 ➔ 同步與備份」中綁定 WebDAV、S3、Cloudflare R2 或雲端硬碟。
   - 綁定完成後，系統自動將連線配置加密存入 Cloudflare D1 的 `shared_config` 表中。
2. **家人帳號無感享受 (`role: 'user'`)**：
   - 任何家人帳號登入時，前端會自動向 Worker 取得 `shared_config`，無感套用共用書庫連線並自動載入所有書籍。
   - 家人端「同步與備份」設定頁面為唯讀保護狀態，防止誤刪或誤改空間配置。

---

## 如何管理可登入帳號

### 方式 A：直接在 Cloudflare 網頁控制台（最直覺）
1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ 點擊側邊欄 **Storage & Databases** ➔ **D1**。
2. 點擊 `bookrayder-users-db` ➔ 進入 **Console** 或 **Explore Data**。
3. 可以在視覺化表格中直接新增或管理使用者，或切換 `is_active` 為 `0` 即可立即停用該帳號。

### 方式 B：透過管理員 API (CLI / Postman / cURL)

#### 新增允許登入的帳號：
```bash
curl -X POST https://your-worker.workers.dev/api/admin/users \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY" \
  -d '{
    "email": "user@example.com",
    "password": "UserSecurePassword123!",
    "displayName": "Rayder User",
    "role": "user",
    "isActive": 1
  }'
```

#### 列出所有帳號：
```bash
curl https://your-worker.workers.dev/api/admin/users \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY"
```

#### 停用/啟用帳號或重設密碼：
```bash
curl -X PUT https://your-worker.workers.dev/api/admin/users/USER_ID_HERE \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY" \
  -d '{
    "isActive": 0
  }'
```
