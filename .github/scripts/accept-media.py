#!/usr/bin/env python3
"""Accept a video/media suggestion and turn it into a PR.

Reads the issue body produced by the suggestions worker, fetches the clip from the
suggestions branch, moves it into src/assets/videos/, and replaces the original
Media URL in the relevant source markdown file. If the Media URL is not found, it
falls back to appending the clip under the Section heading.

Environment:
  GITHUB_TOKEN  (optional, for private repos)
  ISSUE_NUMBER  (required)
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

REPO = "allvei/bigwalk-speedrun-guide"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
ISSUE = os.environ.get("ISSUE_NUMBER", "")


def github_api(path):
    url = f"https://api.github.com/repos/{REPO}{path}"
    req = urllib.request.Request(url)
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "bigwalk-accept-media")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def table_meta(body):
    meta = {}
    for m in re.finditer(r"\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|", body):
        key = m.group(1).strip().strip("`").strip()
        value = m.group(2).strip()
        if key == "---" or not key:
            continue
        meta[key] = value
    return meta


def main():
    if not ISSUE:
        print("ISSUE_NUMBER is required", file=sys.stderr)
        sys.exit(1)

    issue = github_api(f"/issues/{ISSUE}")
    body = issue.get("body") or ""
    meta = table_meta(body)

    source = meta.get("Source", "").strip().strip("`").strip()
    if not source.startswith("src/"):
        print(f"Invalid or missing Source: {source!r}", file=sys.stderr)
        sys.exit(1)

    media_url = meta.get("Media", "").strip()
    section = meta.get("Section", "Media").strip()
    credit = meta.get("Credit", "anonymous").strip()

    upload_field = meta.get("Uploaded clip", "")
    m = re.search(r"\[([^\]]+)\]\(([^)]+)\)", upload_field)
    if not m:
        print("No Uploaded clip link found in issue", file=sys.stderr)
        sys.exit(1)
    upload_path = m.group(1).strip().strip("`").lstrip("/")
    filename = os.path.basename(upload_path)
    if not filename:
        print("Could not determine filename", file=sys.stderr)
        sys.exit(1)

    dest_path = f"src/assets/videos/{filename}"
    public_link = f"/assets/videos/{filename}"

    # Git show handles large binary files without the 1 MB GitHub API contents limit.
    try:
        blob = subprocess.check_output(["git", "show", f"origin/suggestions:{upload_path}"])
    except subprocess.CalledProcessError as e:
        print(f"Could not fetch {upload_path} from the suggestions branch", file=sys.stderr)
        sys.exit(1)

    os.makedirs("src/assets/videos", exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(blob)

    with open(source, "r", encoding="utf-8") as f:
        md = f.read()

    if media_url and media_url in md:
        # Keep the bullet text, swap the URL for a local video link.
        md = md.replace(media_url, f"[video]({public_link})", 1)
    else:
        # Fallback: append the clip under the section heading.
        pattern = re.compile(r"^(#{1,4}\s+" + re.escape(section) + r"\s*)$", re.MULTILINE)
        match = pattern.search(md)
        if not match:
            print(f"Media URL not found and Section heading '{section}' not found", file=sys.stderr)
            sys.exit(1)
        end = match.end()
        next_heading = re.search(r"\n#{1,4}\s", md[end:])
        insert_at = end + (next_heading.start() if next_heading else len(md) - end)
        md = md[:insert_at] + f"\n\n- **{section}** by {credit}: [video]({public_link})" + md[insert_at:]

    with open(source, "w", encoding="utf-8") as f:
        f.write(md)

    branch = f"accept-media-{ISSUE}"
    subprocess.check_call(["git", "checkout", "-b", branch])
    subprocess.check_call(["git", "add", dest_path, source])
    subprocess.check_call(
        ["git", "commit", "-m", f"Accept media from issue #{ISSUE}", "-m", f"Source: {source}\nCredit: {credit}"]
    )
    subprocess.check_call(["git", "push", "origin", branch, "--force-with-lease"])

    subprocess.check_call(
        [
            "gh",
            "pr",
            "create",
            "--title",
            f"Accept media from #{ISSUE}",
            "--body",
            f"Closes #{ISSUE}",
            "--base",
            "main",
        ]
    )


if __name__ == "__main__":
    main()
