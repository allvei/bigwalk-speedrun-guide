import markdownItAnchor from "markdown-it-anchor";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/CNAME": "CNAME" });
  eleventyConfig.addWatchTarget("src/assets");

  eleventyConfig.ignores.add("src/assets/**");

  eleventyConfig.amendLibrary("md", (md) =>
    md.set({ linkify: true, typographer: false }).use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.headerLink(),
      level: [2, 3, 4],
      slugify: (heading) =>
        heading
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
    })
  );

  /* Markdown writes site-root paths, which break wherever the site is served from a
     subdirectory (GitHub Pages). Only the prefix is missing, so it is added here. */
  const prefix = (process.env.PATH_PREFIX || "/").replace(/\/+$/, "");
  eleventyConfig.addTransform("assetPrefix", (content, outputPath) => {
    if (!prefix || !outputPath || !outputPath.endsWith(".html")) return content;
    return content.replace(/(src|href)="\/assets\//g, `$1="${prefix}/assets/`);
  });

  /* An image alone in a paragraph becomes a figure, its alt text the caption. */
  eleventyConfig.addTransform("figures", (content, outputPath) => {
    if (!outputPath || !outputPath.endsWith(".html")) return content;
    return content.replace(
      /<p>(<img [^>]*>)<\/p>/g,
      (match, img) => {
        const alt = /alt="([^"]*)"/.exec(img);
        if (!alt || !alt[1]) return match;
        return `<figure>${img}<figcaption>${alt[1]}</figcaption></figure>`;
      }
    );
  });

  /* The contents list is built here rather than in the browser, so it is painted with the
     rest of the page instead of appearing once scripts run. */
  eleventyConfig.addTransform("toc", (content, outputPath) => {
    if (!outputPath || !outputPath.endsWith(".html")) return content;
    const items = [];
    const headings = /<(h[234]) id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
    let match = headings.exec(content);
    while (match) {
      const text = match[3].replace(/<[^>]*>/g, "").replace(/\s*#\s*$/, "").trim();
      items.push(`<li class="lvl-${match[1][1]}"><a href="#${match[2]}">${text}</a></li>`);
      match = headings.exec(content);
    }
    if (!items.length) return content;
    return content.replace(
      '<nav id="toc-nav"></nav>',
      `<nav id="toc-nav"><ul>${items.join("")}</ul></nav>`
    );
  });

  eleventyConfig.addCollection("sections", (collection) =>
    collection
      .getFilteredByGlob("src/content/*.md")
      .sort((a, b) => a.data.order - b.data.order)
  );

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: process.env.PATH_PREFIX || "/",
  };
}
