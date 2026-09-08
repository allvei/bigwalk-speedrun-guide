/**
 * Cloudflare Worker for the compendium site.
 *
 *   POST /              file an anonymous suggestion as a GitHub issue (optionally with a video,
 *                       committed to UPLOAD_BRANCH first and linked from the issue)
 *   GET  /auth/login    start GitHub OAuth
 *   GET  /auth/callback finish it and store the user token in an HttpOnly cookie
 *   GET  /auth/me       who is signed in, and whether they can write to the repo
 *   POST /auth/comment  reply to an issue as the signed-in user
 *   POST /auth/logout   drop the cookie
 *
 * Deploy:
 *   npm i -g wrangler
 *   cd worker && wrangler deploy
 *   wrangler secret put GITHUB_TOKEN           # fine-grained PAT, Contents + Issues read+write
 *   wrangler secret put GITHUB_CLIENT_SECRET   # OAuth app secret (client id goes in wrangler.toml)
 * Then set `suggestions.endpoint` in src/_data/site.json to the worker URL.
 */
const MAX_FIELD = 20000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const EXT = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v" };

const COOKIE = "gh_session";

function corsHeaders(origin, allowed) {
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2)
      .map(([name, value]) => [name, decodeURIComponent(value)])
  );
}

function setCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=None`;
}

/* Calls GitHub as the signed-in user rather than with the worker's own token. */
function ghUser(token, path, init) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bigwalk-speedrun-guide-suggestions",
      "Content-Type": "application/json",
    },
  });
}

async function auth(request, env, url, cors, allowed) {
  const route = url.pathname.replace(/\/+$/, "");

  if (route === "/auth/login") {
    const back = url.searchParams.get("return") || allowed[0];
    if (!allowed.some((origin) => back.startsWith(origin))) {
      return new Response("Unknown return URL", { status: 400 });
    }
    const state = crypto.randomUUID();
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    authorize.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
    authorize.searchParams.set("scope", "public_repo");
    authorize.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: authorize.toString(),
        "Set-Cookie": setCookie("gh_state", `${state}|${back}`, 600),
      },
    });
  }

  if (route === "/auth/callback") {
    const saved = (cookies(request).gh_state || "").split("|");
    const code = url.searchParams.get("code");
    if (!code || !saved[0] || saved[0] !== url.searchParams.get("state")) {
      return new Response("Sign-in expired, try again", { status: 400 });
    }
    const exchange = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/auth/callback`,
      }),
    });
    const token = exchange.ok ? (await exchange.json()).access_token : null;
    if (!token) return new Response("GitHub refused the sign-in", { status: 502 });

    const headers = new Headers({ Location: saved[1] || allowed[0] });
    headers.append("Set-Cookie", setCookie(COOKIE, token, 60 * 60 * 24 * 30));
    headers.append("Set-Cookie", setCookie("gh_state", "", 0));
    return new Response(null, { status: 302, headers });
  }

  if (route === "/auth/logout") {
    return Response.json({ ok: true }, { headers: { ...cors, "Set-Cookie": setCookie(COOKIE, "", 0) } });
  }

  const token = cookies(request)[COOKIE];
  if (!token) return Response.json({ signedIn: false }, { headers: cors });

  if (route === "/auth/me") {
    const me = await ghUser(token, "/user");
    if (!me.ok) {
      return Response.json(
        { signedIn: false },
        { headers: { ...cors, "Set-Cookie": setCookie(COOKIE, "", 0) } }
      );
    }
    const user = await me.json();
    const repo = await ghUser(token, `/repos/${env.REPO}`);
    const canWrite = repo.ok ? Boolean((await repo.json()).permissions?.push) : false;
    return Response.json(
      { signedIn: true, login: user.login, avatar: user.avatar_url, canWrite },
      { headers: cors }
    );
  }

  if (route === "/auth/comment" && request.method === "POST") {
    let data;
    try {
      data = await request.json();
    } catch (_) {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers: cors });
    }
    const issue = parseInt(data.issue, 10);
    const body = String(data.body || "").slice(0, MAX_FIELD).trim();
    if (!issue || !body) return Response.json({ error: "Empty reply" }, { status: 400, headers: cors });

    const posted = await ghUser(token, `/repos/${env.REPO}/issues/${issue}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    if (!posted.ok) {
      return Response.json({ error: "GitHub rejected the reply" }, { status: 502, headers: cors });
    }
    return Response.json({ ok: true, comment: await posted.json() }, { headers: cors });
  }

  return new Response("Not found", { status: 404, headers: cors });
}

async function gh(env, path, init) {
  return fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bigwalk-speedrun-guide-suggestions",
      "Content-Type": "application/json",
    },
  });
}

async function ensureBranch(env, branch) {
  const existing = await gh(env, `/git/ref/heads/${branch}`);
  if (existing.ok) return true;
  const base = await gh(env, `/git/ref/heads/${env.BRANCH || "main"}`);
  if (!base.ok) return false;
  const { object } = await base.json();
  const created = await gh(env, "/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: object.sha }),
  });
  return created.ok;
}

async function commitUpload(env, upload, section) {
  const ext = EXT[upload.type];
  if (!ext) return { error: "Only mp4, webm, mov and m4v files" };
  const content = String(upload.data || "");
  if (!content) return { error: "Empty file" };
  if (content.length * 0.75 > MAX_UPLOAD_BYTES) return { error: "That file is too large" };

  const branch = env.UPLOAD_BRANCH || "suggestions";
  if (!(await ensureBranch(env, branch))) return { error: "Could not prepare the upload branch" };

  const slug =
    (section || "clip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) ||
    "clip";
  const path = `src/assets/videos/incoming/${Date.now()}-${slug}.${ext}`;
  const response = await gh(env, `/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Suggested clip for ${section || "the compendium"}`,
      content,
      branch,
    }),
  });
  if (!response.ok) return { error: "GitHub rejected the upload" };
  return { path, branch };
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, allowed);

    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname.startsWith("/auth/")) return auth(request, env, url, cors, allowed);
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    let data;
    try {
      data = await request.json();
    } catch (_) {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers: cors });
    }

    if (data._gotcha) return Response.json({ ok: true }, { headers: cors }); // honeypot
    const body = String(data.body || "").slice(0, MAX_FIELD).trim();
    if (!body) return Response.json({ error: "Empty suggestion" }, { status: 400, headers: cors });

    const kind = String(data.kind || "other").slice(0, 40);
    const section = String(data.section || "Whole page").slice(0, 200);
    const author = String(data.author || "").slice(0, 100);
    const media = String(data.media || "").slice(0, 500);
    const source = String(data.source || "").slice(0, 200);
    const quote = String(data.quote || "").slice(0, 1000).trim();
    const quoteMd = String(data.quoteMd || "").slice(0, MAX_FIELD).trim();
    const page = String(data.page || "").slice(0, 500);
    const title = String(data.title || "").slice(0, 120).trim();
    const sources = Array.isArray(data.sources)
      ? data.sources.slice(0, 10).map((file) => String(file).slice(0, 200))
      : [];
    const files = sources.length ? sources : source ? [source] : [];
    const before = quoteMd || quote;

    let uploaded = null;
    if (data.upload) {
      const result = await commitUpload(env, data.upload, section);
      if (result.error) return Response.json({ error: result.error }, { status: 400, headers: cors });
      uploaded = result;
    }

    /* An edit reads best as a diff: what the page says now against what is proposed. */
    const diff = before
      ? [
          "```diff",
          ...before.split("\n").map((line) => `- ${line}`),
          ...body.split("\n").map((line) => `+ ${line}`),
          "```",
        ].join("\n")
      : body;

    const issue = {
      title: title || `${section}: suggestion`,
      labels: ["suggestion", `kind:${kind}`],
      body: [
        quote ? `<!-- anchor: ${JSON.stringify({ quote, section, files })} -->` : "",
        diff,
        "",
        "| | |",
        "|---|---|",
        `| Section | ${section} |`,
        files.length ? `| Source | ${files.map((file) => `\`src/${file}\``).join(", ")} |` : "",
        page ? `| Page | ${page} |` : "",
        media ? `| Media | ${media} |` : "",
        uploaded
          ? `| Uploaded clip | [${uploaded.path}](https://github.com/${env.REPO}/blob/${uploaded.branch}/${uploaded.path}) on \`${uploaded.branch}\` |`
          : "",
        `| Credit | ${author || "anonymous"} |`,
        `| Submitted | from the site |`,
      ]
        .filter(Boolean)
        .join("\n"),
    };

    const response = await gh(env, "/issues", { method: "POST", body: JSON.stringify(issue) });

    if (!response.ok) {
      return Response.json(
        { error: "GitHub rejected the issue", status: response.status },
        { status: 502, headers: cors }
      );
    }
    const created = await response.json();
    return Response.json({ ok: true, url: created.html_url }, { headers: cors });
  },
};
