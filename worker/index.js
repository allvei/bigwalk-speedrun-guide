/**
 * Optional Cloudflare Worker: receives anonymous suggestions from the site and
 * files them as GitHub issues, so submitters never need a GitHub account.
 *
 * Deploy:
 *   npm i -g wrangler
 *   cd worker && wrangler deploy
 *   wrangler secret put GITHUB_TOKEN     # fine-grained PAT, Issues: read+write on this repo only
 * Then set `suggestions.endpoint` in src/_data/site.json to the worker URL.
 */
const MAX_FIELD = 20000;

function corsHeaders(origin, allowed) {
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
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
    const page = String(data.page || "").slice(0, 500);

    const issue = {
      title: `[${kind}] ${section}`,
      labels: ["suggestion", `kind:${kind}`],
      body: [
        `**Section:** ${section}`,
        source ? `**Source file:** \`src/${source}\`` : "",
        page ? `**Page:** ${page}` : "",
        media ? `**Media:** ${media}` : "",
        `**Credit:** ${author || "anonymous"}`,
        "",
        "---",
        "",
        body,
        "",
        "_Submitted anonymously from the site._",
      ]
        .filter(Boolean)
        .join("\n"),
    };

    const response = await fetch(`https://api.github.com/repos/${env.REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "big-walk-compendium-suggestions",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(issue),
    });

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
