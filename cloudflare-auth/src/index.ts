/**
 * BookRayder - Cloudflare Worker Authentication & User Management Service
 * Features:
 * 1. PBKDF2 Password Hashing with Salt (WebCrypto API)
 * 2. JWT Access Token Signing & Verification (HS256)
 * 3. D1 Database Integration (Whitelisting / Status Control)
 * 4. Admin Management API (Create user, disable/enable user, reset password)
 */

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ADMIN_API_KEY: string;
}

// Helper: Hash password using PBKDF2
async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const salt = saltHex 
    ? hexToUint8Array(saltHex) 
    : crypto.getRandomValues(new Uint8Array(16));
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  const hashHex = uint8ArrayToHex(new Uint8Array(exported));
  return { hash: hashHex, salt: uint8ArrayToHex(salt) };
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}

// Simple Base64Url JWT implementation
async function signJWT(payload: any, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const strHeader = base64UrlEncode(JSON.stringify(header));
  const strPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${strHeader}.${strPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const strSig = base64UrlEncode(sig);
  return `${data}.${strSig}`;
}

async function verifyJWT(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const enc = new TextEncoder();
    const data = `${header}.${payload}`;

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBuf = base64UrlDecodeToBuffer(sig);
    const valid = await crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(data));
    if (!valid) return null;

    const decodedPayload = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBuffer(payload)));
    if (decodedPayload.exp && Date.now() / 1000 > decodedPayload.exp) {
      return null; // Expired
    }
    return decodedPayload;
  } catch (e) {
    return null;
  }
}

function base64UrlEncode(data: string | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(data);
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecodeToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// CORS Response Helper
function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
      ...headers
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
        }
      });
    }

    // Health Check / Root endpoint: GET /
    if (url.pathname === '/' || url.pathname === '') {
      return jsonResponse({
        service: 'BookRayder Authentication & User Management API',
        status: 'online',
        version: '1.0.0',
        endpoints: {
          login: 'POST /api/auth/login',
          verify: 'GET /api/auth/verify',
          adminUsers: 'GET /api/admin/users, POST /api/admin/users, PUT /api/admin/users/:id'
        },
        message: 'Cloudflare Worker is running properly!'
      });
    }

    // 1. User Login: POST /api/auth/login
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      try {
        const body: any = await request.json();
        const { email, password } = body;

        if (!email || !password) {
          return jsonResponse({ error: 'Email and password are required' }, 400);
        }

        const user: any = await env.DB.prepare(
          'SELECT * FROM users WHERE email = ?'
        ).bind(email.toLowerCase().trim()).first();

        if (!user) {
          return jsonResponse({ error: 'Invalid email or password' }, 401);
        }

        if (user.is_active !== 1) {
          return jsonResponse({ error: 'This account has been disabled. Please contact admin.' }, 403);
        }

        // Verify password hash
        const { hash } = await hashPassword(password, user.salt);
        if (hash !== user.password_hash) {
          return jsonResponse({ error: 'Invalid email or password' }, 401);
        }

        // Update last login timestamp
        await env.DB.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run();

        // Sign JWT Token (valid for 30 days)
        const exp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
        const token = await signJWT(
          {
            sub: user.id,
            email: user.email,
            role: user.role,
            displayName: user.display_name,
            exp
          },
          env.JWT_SECRET || 'fallback-secret-key'
        );

        return jsonResponse({
          success: true,
          token,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            role: user.role
          }
        });
      } catch (e: any) {
        return jsonResponse({ error: e.message || 'Login failed' }, 500);
      }
    }

    // 2. Verify Token: GET /api/auth/verify
    if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse({ valid: false, error: 'Missing token' }, 401);
      }
      const token = authHeader.substring(7);
      const payload = await verifyJWT(token, env.JWT_SECRET || 'fallback-secret-key');
      if (!payload) {
        return jsonResponse({ valid: false, error: 'Invalid or expired token' }, 401);
      }
      return jsonResponse({ valid: true, user: payload });
    }

    // 3. Admin API: Manage Users (Requires X-Admin-Key)
    if (url.pathname.startsWith('/api/admin/')) {
      const adminKey = request.headers.get('X-Admin-Key');
      if (!adminKey || adminKey !== env.ADMIN_API_KEY) {
        return jsonResponse({ error: 'Unauthorized: Invalid Admin Key' }, 401);
      }

      // List all users: GET /api/admin/users
      if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, email, display_name, role, is_active, last_login_at, created_at FROM users ORDER BY created_at DESC').all();
        return jsonResponse({ users: results });
      }

      // Create new user: POST /api/admin/users
      if (url.pathname === '/api/admin/users' && request.method === 'POST') {
        const body: any = await request.json();
        const { email, password, displayName, role = 'user', isActive = 1 } = body;
        if (!email || !password) {
          return jsonResponse({ error: 'Email and password are required' }, 400);
        }

        const id = crypto.randomUUID();
        const { hash, salt } = await hashPassword(password);

        try {
          await env.DB.prepare(
            `INSERT INTO users (id, email, password_hash, salt, display_name, role, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(id, email.toLowerCase().trim(), hash, salt, displayName || '', role, isActive ? 1 : 0).run();

          return jsonResponse({ success: true, message: 'User created successfully', id, email }, 201);
        } catch (e: any) {
          return jsonResponse({ error: e.message.includes('UNIQUE') ? 'Email already exists' : e.message }, 400);
        }
      }

      // Update user status/password: PUT /api/admin/users/:id
      const matchUpdate = url.pathname.match(/^\/api\/admin\/users\/([^\/]+)$/);
      if (matchUpdate && request.method === 'PUT') {
        const userId = matchUpdate[1];
        const body: any = await request.json();
        const { isActive, password, displayName, role } = body;

        let query = 'UPDATE users SET updated_at = CURRENT_TIMESTAMP';
        const binds: any[] = [];

        if (typeof isActive === 'number') {
          query += ', is_active = ?';
          binds.push(isActive);
        }
        if (displayName !== undefined) {
          query += ', display_name = ?';
          binds.push(displayName);
        }
        if (role !== undefined) {
          query += ', role = ?';
          binds.push(role);
        }
        if (password) {
          const { hash, salt } = await hashPassword(password);
          query += ', password_hash = ?, salt = ?';
          binds.push(hash, salt);
        }

        query += ' WHERE id = ?';
        binds.push(userId);

        await env.DB.prepare(query).bind(...binds).run();
        return jsonResponse({ success: true, message: 'User updated successfully' });
      }
    }

    // 4. Family Shared Storage Config API
    // GET /api/shared/storage (Any authenticated family member)
    if (url.pathname === '/api/shared/storage' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse({ error: 'Unauthorized: Login required' }, 401);
      }
      const token = authHeader.substring(7);
      const user = await verifyJWT(token, env.JWT_SECRET || 'fallback-secret-key');
      if (!user) {
        return jsonResponse({ error: 'Unauthorized: Invalid token' }, 401);
      }

      try {
        // Auto ensure table exists
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS shared_config (
             key TEXT PRIMARY KEY,
             value TEXT NOT NULL,
             updated_by TEXT,
             updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
           )`
        ).run();

        const row: any = await env.DB.prepare(
          "SELECT value, updated_at, updated_by FROM shared_config WHERE key = 'shared_storage'"
        ).first();

        if (!row) {
          return jsonResponse({ configured: false, config: null });
        }

        const config = JSON.parse(row.value);
        return jsonResponse({
          configured: true,
          config,
          updatedAt: row.updated_at,
          updatedBy: row.updated_by
        });
      } catch (e) {
        return jsonResponse({ configured: false, config: null });
      }
    }

    // POST /api/shared/storage (ADMIN ONLY)
    if (url.pathname === '/api/shared/storage' && request.method === 'POST') {
      let isAuthorizedAdmin = false;
      let adminIdentifier = 'admin';

      // Check X-Admin-Key
      const adminKey = request.headers.get('X-Admin-Key');
      if (adminKey && adminKey === env.ADMIN_API_KEY) {
        isAuthorizedAdmin = true;
        adminIdentifier = 'api_key_admin';
      }

      // Check JWT role === 'admin'
      const authHeader = request.headers.get('Authorization');
      if (!isAuthorizedAdmin && authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = await verifyJWT(token, env.JWT_SECRET || 'fallback-secret-key');
        if (user && user.role === 'admin') {
          isAuthorizedAdmin = true;
          adminIdentifier = user.email || user.sub;
        }
      }

      if (!isAuthorizedAdmin) {
        return jsonResponse({
          error: 'Forbidden: Only administrators can configure shared storage.'
        }, 403);
      }

      try {
        const body: any = await request.json();
        const { config } = body;
        if (!config) {
          return jsonResponse({ error: 'Storage config is required' }, 400);
        }

        // Auto ensure table exists
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS shared_config (
             key TEXT PRIMARY KEY,
             value TEXT NOT NULL,
             updated_by TEXT,
             updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
           )`
        ).run();

        const valueStr = JSON.stringify(config);
        await env.DB.prepare(
          `INSERT INTO shared_config (key, value, updated_by, updated_at) 
           VALUES ('shared_storage', ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET 
             value = excluded.value,
             updated_by = excluded.updated_by,
             updated_at = CURRENT_TIMESTAMP`
        ).bind(valueStr, adminIdentifier).run();

        return jsonResponse({
          success: true,
          message: 'Shared family storage updated successfully'
        });
} catch (e: any) {
        return jsonResponse({ error: e.message || 'Failed to save config' }, 500);
      }
    }

    // 5. Universal WebDAV CORS Reverse Proxy
    if (url.pathname.startsWith('/api/proxy/webdav')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Expose-Headers': '*',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      const targetParam = url.searchParams.get('target');
      if (!targetParam) {
        return jsonResponse({ error: 'target query parameter is required' }, 400);
      }

      let targetUrl = decodeURIComponent(targetParam);
      const proxyBasePath = '/api/proxy/webdav';
      const subPath = url.pathname.substring(proxyBasePath.length);
      if (subPath && subPath !== '/') {
        targetUrl = targetUrl.replace(/\/$/, '') + (subPath.startsWith('/') ? subPath : '/' + subPath);
      }

      const parsedTarget = new URL(targetUrl);
      const forwardHeaders = new Headers();
      for (const [key, value] of request.headers.entries()) {
        const k = key.toLowerCase();
        if (!k.startsWith('cf-') && k !== 'host' && !k.startsWith('sec-') && k !== 'origin' && k !== 'referer') {
          forwardHeaders.set(key, value);
        }
      }
      forwardHeaders.set('Host', parsedTarget.host);

      try {
        const fetchOptions: RequestInit = {
          method: request.method,
          headers: forwardHeaders,
          body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? undefined : request.body,
          redirect: 'follow',
        };

        const targetResp = await fetch(targetUrl, fetchOptions);
        const respHeaders = new Headers(targetResp.headers);
        respHeaders.set('Access-Control-Allow-Origin', '*');
        respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
        respHeaders.set('Access-Control-Allow-Headers', '*');
        respHeaders.set('Access-Control-Expose-Headers', '*');

        return new Response(targetResp.body, {
          status: targetResp.status,
          statusText: targetResp.statusText,
          headers: respHeaders,
        });
      } catch (err: any) {
        return jsonResponse({ error: err.message || 'WebDAV Proxy Failed' }, 502);
      }
    }

    return jsonResponse({ error: 'Endpoint not found' }, 404);
  }
};
