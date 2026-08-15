-- ========================================================
-- BookRayder - Cloudflare D1 Authentication Database Schema
-- ========================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'user',        -- 'admin' | 'user'
    is_active INTEGER DEFAULT 1,     -- 1 = Enabled (Can login), 0 = Disabled (Banned)
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
