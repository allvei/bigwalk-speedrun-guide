import markdownItAnchor from "markdown-it-anchor";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({ "src/CNAME": "CNAME" });
  eleventyConfig.addWatchTarget("src/assets");

  eleventyConfig.ignores.add("src/assets/**");
  eleventyConfig.ignores.add("src/admin/**");

  eleventyConfig.amendLibrary("md", (md) =>
    md.set({ linkify: true, typographer: false }).use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.headerLink(),
      level: [2, 3, 4],
    })
  );

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
