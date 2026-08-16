var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-rVt4vX/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/index.ts
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToUint8Array(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  const hashHex = uint8ArrayToHex(new Uint8Array(exported));
  return { hash: hashHex, salt: uint8ArrayToHex(salt) };
}
__name(hashPassword, "hashPassword");
function uint8ArrayToHex(arr) {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(uint8ArrayToHex, "uint8ArrayToHex");
function hexToUint8Array(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}
__name(hexToUint8Array, "hexToUint8Array");
async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const strHeader = base64UrlEncode(JSON.stringify(header));
  const strPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${strHeader}.${strPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const strSig = base64UrlEncode(sig);
  return `${data}.${strSig}`;
}
__name(signJWT, "signJWT");
async function verifyJWT(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const enc = new TextEncoder();
    const data = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBuf = base64UrlDecodeToBuffer(sig);
    const valid = await crypto.subtle.verify("HMAC", key, sigBuf, enc.encode(data));
    if (!valid) return null;
    const decodedPayload = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBuffer(payload)));
    if (decodedPayload.exp && Date.now() / 1e3 > decodedPayload.exp) {
      return null;
    }
    return decodedPayload;
  } catch (e) {
    return null;
  }
}
__name(verifyJWT, "verifyJWT");
function base64UrlEncode(data) {
  let bytes;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = new Uint8Array(data);
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecodeToBuffer(base64url) {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
__name(base64UrlDecodeToBuffer, "base64UrlDecodeToBuffer");
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*",
      ...headers
    }
  });
}
__name(jsonResponse, "jsonResponse");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Expose-Headers": "*",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    if (url.pathname === "/" || url.pathname === "") {
      return jsonResponse({
        service: "BookRayder Authentication & User Management API",
        status: "online",
        version: "1.0.0",
        endpoints: {
          login: "POST /api/auth/login",
          verify: "GET /api/auth/verify",
          adminUsers: "GET /api/admin/users, POST /api/admin/users, PUT /api/admin/users/:id"
        },
        message: "Cloudflare Worker is running properly!"
      });
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const { email, password } = body;
        if (!email || !password) {
          return jsonResponse({ error: "Email and password are required" }, 400);
        }
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE email = ?"
        ).bind(email.toLowerCase().trim()).first();
        if (!user) {
          return jsonResponse({ error: "Invalid email or password" }, 401);
        }
        if (user.is_active !== 1) {
          return jsonResponse({ error: "This account has been disabled. Please contact admin." }, 403);
        }
        const { hash } = await hashPassword(password, user.salt);
        if (hash !== user.password_hash) {
          return jsonResponse({ error: "Invalid email or password" }, 401);
        }
        await env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
        const exp = Math.floor(Date.now() / 1e3) + 30 * 24 * 60 * 60;
        const token = await signJWT(
          {
            sub: user.id,
            email: user.email,
            role: user.role,
            displayName: user.display_name,
            exp
          },
          env.JWT_SECRET || "fallback-secret-key"
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
      } catch (e) {
        return jsonResponse({ error: e.message || "Login failed" }, 500);
      }
    }
    if (url.pathname === "/api/auth/verify" && request.method === "GET") {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ valid: false, error: "Missing token" }, 401);
      }
      const token = authHeader.substring(7);
      const payload = await verifyJWT(token, env.JWT_SECRET || "fallback-secret-key");
      if (!payload) {
        return jsonResponse({ valid: false, error: "Invalid or expired token" }, 401);
      }
      return jsonResponse({ valid: true, user: payload });
    }
    if (url.pathname.startsWith("/api/admin/")) {
      const adminKey = request.headers.get("X-Admin-Key");
      if (!adminKey || adminKey !== env.ADMIN_API_KEY) {
        return jsonResponse({ error: "Unauthorized: Invalid Admin Key" }, 401);
      }
      if (url.pathname === "/api/admin/users" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id, email, display_name, role, is_active, last_login_at, created_at FROM users ORDER BY created_at DESC").all();
        return jsonResponse({ users: results });
      }
      if (url.pathname === "/api/admin/users" && request.method === "POST") {
        const body = await request.json();
        const { email, password, displayName, role = "user", isActive = 1 } = body;
        if (!email || !password) {
          return jsonResponse({ error: "Email and password are required" }, 400);
        }
        const id = crypto.randomUUID();
        const { hash, salt } = await hashPassword(password);
        try {
          await env.DB.prepare(
            `INSERT INTO users (id, email, password_hash, salt, display_name, role, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(id, email.toLowerCase().trim(), hash, salt, displayName || "", role, isActive ? 1 : 0).run();
          return jsonResponse({ success: true, message: "User created successfully", id, email }, 201);
        } catch (e) {
          return jsonResponse({ error: e.message.includes("UNIQUE") ? "Email already exists" : e.message }, 400);
        }
      }
      const matchUpdate = url.pathname.match(/^\/api\/admin\/users\/([^\/]+)$/);
      if (matchUpdate && request.method === "PUT") {
        const userId = matchUpdate[1];
        const body = await request.json();
        const { isActive, password, displayName, role } = body;
        let query = "UPDATE users SET updated_at = CURRENT_TIMESTAMP";
        const binds = [];
        if (typeof isActive === "number") {
          query += ", is_active = ?";
          binds.push(isActive);
        }
        if (displayName !== void 0) {
          query += ", display_name = ?";
          binds.push(displayName);
        }
        if (role !== void 0) {
          query += ", role = ?";
          binds.push(role);
        }
        if (password) {
          const { hash, salt } = await hashPassword(password);
          query += ", password_hash = ?, salt = ?";
          binds.push(hash, salt);
        }
        query += " WHERE id = ?";
        binds.push(userId);
        await env.DB.prepare(query).bind(...binds).run();
        return jsonResponse({ success: true, message: "User updated successfully" });
      }
    }
    if (url.pathname === "/api/shared/storage" && request.method === "GET") {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "Unauthorized: Login required" }, 401);
      }
      const token = authHeader.substring(7);
      const user = await verifyJWT(token, env.JWT_SECRET || "fallback-secret-key");
      if (!user) {
        return jsonResponse({ error: "Unauthorized: Invalid token" }, 401);
      }
      try {
        await env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS shared_config (
             key TEXT PRIMARY KEY,
             value TEXT NOT NULL,
             updated_by TEXT,
             updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
           )`
        ).run();
        const row = await env.DB.prepare(
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
    if (url.pathname === "/api/shared/storage" && request.method === "POST") {
      let isAuthorizedAdmin = false;
      let adminIdentifier = "admin";
      const adminKey = request.headers.get("X-Admin-Key");
      if (adminKey && adminKey === env.ADMIN_API_KEY) {
        isAuthorizedAdmin = true;
        adminIdentifier = "api_key_admin";
      }
      const authHeader = request.headers.get("Authorization");
      if (!isAuthorizedAdmin && authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const user = await verifyJWT(token, env.JWT_SECRET || "fallback-secret-key");
        if (user && user.role === "admin") {
          isAuthorizedAdmin = true;
          adminIdentifier = user.email || user.sub;
        }
      }
      if (!isAuthorizedAdmin) {
        return jsonResponse({
          error: "Forbidden: Only administrators can configure shared storage."
        }, 403);
      }
      try {
        const body = await request.json();
        const { config } = body;
        if (!config) {
          return jsonResponse({ error: "Storage config is required" }, 400);
        }
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
          message: "Shared family storage updated successfully"
        });
      } catch (e) {
        return jsonResponse({ error: e.message || "Failed to save config" }, 500);
      }
    }
    if (url.pathname.startsWith("/api/proxy/webdav")) {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Expose-Headers": "*",
            "Access-Control-Max-Age": "86400"
          }
        });
      }
      let targetUrl = "";
      const targetParam = url.searchParams.get("target");
      if (targetParam) {
        targetUrl = decodeURIComponent(targetParam);
        const subPath = url.pathname.substring("/api/proxy/webdav".length);
        if (subPath && subPath !== "/") {
          targetUrl = targetUrl.replace(/\/$/, "") + (subPath.startsWith("/") ? subPath : "/" + subPath);
        }
      } else {
        const restPath = url.pathname.substring("/api/proxy/webdav/".length);
        if (restPath.startsWith("https://") || restPath.startsWith("http://")) {
          targetUrl = restPath + url.search;
        } else if (restPath.startsWith("https:/")) {
          targetUrl = "https://" + restPath.substring("https:/".length).replace(/^\/+/, "") + url.search;
        } else if (restPath.startsWith("http:/")) {
          targetUrl = "http://" + restPath.substring("http:/".length).replace(/^\/+/, "") + url.search;
        }
      }
      if (!targetUrl) {
        return jsonResponse({ error: "Target WebDAV URL is required" }, 400);
      }
      try {
        const parsedTarget = new URL(targetUrl);
        const forwardHeaders = new Headers();
        for (const [key, value] of request.headers.entries()) {
          const k = key.toLowerCase();
          if (!k.startsWith("cf-") && k !== "host" && !k.startsWith("sec-") && k !== "origin" && k !== "referer") {
            forwardHeaders.set(key, value);
          }
        }
        forwardHeaders.set("Host", parsedTarget.host);
        const fetchOptions = {
          method: request.method,
          headers: forwardHeaders,
          body: ["GET", "HEAD", "OPTIONS"].includes(request.method) ? void 0 : request.body,
          redirect: "follow"
        };
        const targetResp = await fetch(targetUrl, fetchOptions);
        const respHeaders = new Headers(targetResp.headers);
        respHeaders.set("Access-Control-Allow-Origin", "*");
        respHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK");
        respHeaders.set("Access-Control-Allow-Headers", "*");
        respHeaders.set("Access-Control-Expose-Headers", "*");
        return new Response(targetResp.body, {
          status: targetResp.status,
          statusText: targetResp.statusText,
          headers: respHeaders
        });
      } catch (err) {
        return jsonResponse({ error: err.message || "WebDAV Proxy Failed" }, 502);
      }
    }
    return jsonResponse({ error: "Endpoint not found" }, 404);
  }
};

// ../../../../usr/local/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../usr/local/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-rVt4vX/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../usr/local/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-rVt4vX/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
