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
