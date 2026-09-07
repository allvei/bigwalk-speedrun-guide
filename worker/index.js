/**
 * Cloudflare Worker: receives anonymous suggestions from the site and files them as GitHub
 * issues, so submitters never need a GitHub account. An attached video is committed to the
 * UPLOAD_BRANCH branch first and linked from the issue, for a maintainer to review.
 *
 * Deploy:
 *   npm i -g wrangler
 *   cd worker && wrangler deploy
 *   wrangler secret put GITHUB_TOKEN   # fine-grained PAT, Contents + Issues read+write, this repo
 * Then set `suggestions.endpoint` in src/_data/site.json to the worker URL.
 */
const MAX_FIELD = 20000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const EXT = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v" };

function corsHeaders(origin, allowed) {
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
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

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
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
    const page = String(data.page || "").slice(0, 500);

    let uploaded = null;
    if (data.upload) {
      const result = await commitUpload(env, data.upload, section);
      if (result.error) return Response.json({ error: result.error }, { status: 400, headers: cors });
      uploaded = result;
    }

    const issue = {
      title: `[${kind}] ${section}`,
      labels: ["suggestion", `kind:${kind}`],
      body: [
        quote ? `<!-- anchor: ${JSON.stringify({ quote, section })} -->` : "",
        `**Section:** ${section}`,
        source ? `**Source file:** \`src/${source}\`` : "",
        page ? `**Page:** ${page}` : "",
        media ? `**Media:** ${media}` : "",
        uploaded
          ? `**Uploaded clip:** [${uploaded.path}](https://github.com/${env.REPO}/blob/${uploaded.branch}/${uploaded.path}) on branch \`${uploaded.branch}\``
          : "",
        `**Credit:** ${author || "anonymous"}`,
        "",
        quote ? `> ${quote.replace(/\n/g, "\n> ")}` : "",
        "---",
        "",
        body,
        "",
        "_Submitted anonymously from the site._",
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
