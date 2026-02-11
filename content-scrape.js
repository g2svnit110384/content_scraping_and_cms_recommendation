/**
 * Scrape website pages into a CSV.
 * One row = one page
 * One column = one content field (banner, description, video, tiles)
 *
 * Usage examples:
 *  node scrape.js --sitemap https://example.com/sitemap.xml --out export.csv
 *  node scrape.js --urls urls.txt --out export.csv
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { createObjectCsvWriter } = require("csv-writer");
const { parseStringPromise } = require("xml2js");
const pLimit = require("p-limit");
const fs = require("fs");

// -------------------------
// CLI args (minimal parsing)
// -------------------------
function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const SITEMAP_URL = getArg("--sitemap");
const URLS_FILE = getArg("--urls");
const OUT_FILE = getArg("--out") || "export.csv";
const CONCURRENCY = Number(getArg("--concurrency") || 5);
const TIMEOUT_MS = Number(getArg("--timeout") || 20000);

// -------------------------
// Helpers
// -------------------------
function cleanText(s) {
  if (!s) return "";
  return String(s)
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function absolutizeUrl(maybeRelative, pageUrl) {
  if (!maybeRelative) return "";
  try {
    return new URL(maybeRelative, pageUrl).toString();
  } catch {
    return maybeRelative;
  }
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: TIMEOUT_MS,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ContentMigrationBot/1.0; +https://example.com/bot)",
      Accept: "text/html,application/xhtml+xml",
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return res.data;
}

async function getUrlsFromSitemap(sitemapUrl) {
  const xml = await axios.get(sitemapUrl, { timeout: TIMEOUT_MS }).then(r => r.data);
  const parsed = await parseStringPromise(xml);

  // Supports both <urlset> and <sitemapindex> (recursive)
  if (parsed.urlset?.url) {
    return parsed.urlset.url
      .map((u) => u.loc?.[0])
      .filter(Boolean);
  }

  if (parsed.sitemapindex?.sitemap) {
    const sitemapLocs = parsed.sitemapindex.sitemap
      .map((s) => s.loc?.[0])
      .filter(Boolean);

    const all = [];
    for (const sm of sitemapLocs) {
      const sub = await getUrlsFromSitemap(sm);
      all.push(...sub);
    }
    return all;
  }

  throw new Error("Unknown sitemap format (expected urlset or sitemapindex).");
}

function getUrlsFromFile(path) {
  const raw = fs.readFileSync(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

// -------------------------
// Core extraction per page
// -------------------------
function extractPageData(html, pageUrl) {
  const $ = cheerio.load(html);

  // Banner: <div class="banner">
  const $banner = $("div.banner").first();

  // "banner image": handle <img>, or background-image style
  let bannerImage = "";
  const imgSrc = $banner.find("img").first().attr("src");
  if (imgSrc) {
    bannerImage = absolutizeUrl(imgSrc, pageUrl);
  } else {
    // background-image: url(...)
    const style = $banner.attr("style") || "";
    const m = style.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
    if (m && m[2]) bannerImage = absolutizeUrl(m[2], pageUrl);
  }

  // Banner title/description/button
  // Adjust selectors if your markup differs (h1/h2/p/a etc.)
  const bannerTitle =
    cleanText($banner.find("h1").first().text()) ||
    cleanText($banner.find("h2").first().text());

  const bannerDescription =
    cleanText($banner.find("p").first().text());

  const $bannerBtn =
    $banner.find("a, button").filter((_, el) => {
      const t = cleanText($(el).text());
      return t.length > 0;
    }).first();

  const bannerButtonText = cleanText($bannerBtn.text());
  const bannerButtonLink = absolutizeUrl($bannerBtn.attr("href") || "", pageUrl);

  // Article description: <div class="main-description"> plain text
  const mainDescription = cleanText($("div.main-description").first().text());

  // Video section: <div class="article-video"> heading + embedded video link
  const $video = $("div.article-video").first();
  const videoHeading =
    cleanText($video.find("h1,h2,h3").first().text());

  // Try iframe src, otherwise anchor href, otherwise data-* attributes
  const iframeSrc = $video.find("iframe").first().attr("src");
  const aHref = $video.find("a").first().attr("href");
  const dataSrc = $video.find("[data-src]").first().attr("data-src");

  const videoEmbedUrl = absolutizeUrl(
    iframeSrc || dataSrc || aHref || "",
    pageUrl
  );

  // Tiles: <div class="related-articles"> 3 tiles
  const $tilesWrap = $("div.related-articles").first();

  // Try to identify “tile” blocks. If you have a known class, use it.
  // Common patterns: .tile, article, .card, .related-article, li
  let $tileItems = $tilesWrap.find(".tile, .card, article, li, .related-article");
  if ($tileItems.length === 0) {
    // fallback: direct children
    $tileItems = $tilesWrap.children();
  }

  const tiles = [];
  $tileItems.each((i, el) => {
    if (tiles.length >= 3) return;
    const $t = $(el);

    const heading = cleanText($t.find("h1,h2,h3,h4").first().text());
    const description = cleanText($t.find("p").first().text());

    const $link = $t.find("a").filter((_, a) => cleanText($(a).text()).length > 0).first();
    const linkTitle = cleanText($link.text());
    const linkUrl = absolutizeUrl($link.attr("href") || "", pageUrl);

    // skip empty-ish blocks
    if (heading || description || linkTitle || linkUrl) {
      tiles.push({ heading, description, linkTitle, linkUrl });
    }
  });

  // Ensure exactly 3 tiles worth of fields exist
  while (tiles.length < 3) {
    tiles.push({ heading: "", description: "", linkTitle: "", linkUrl: "" });
  }

  return {
    url: pageUrl,

    banner_image: bannerImage,
    banner_title: bannerTitle,
    banner_description: bannerDescription,
    banner_button_text: bannerButtonText,
    banner_button_link: bannerButtonLink,

    main_description: mainDescription,

    video_heading: videoHeading,
    video_embed_url: videoEmbedUrl,

    tile1_heading: tiles[0].heading,
    tile1_description: tiles[0].description,
    tile1_link_title: tiles[0].linkTitle,
    tile1_link_url: tiles[0].linkUrl,

    tile2_heading: tiles[1].heading,
    tile2_description: tiles[1].description,
    tile2_link_title: tiles[1].linkTitle,
    tile2_link_url: tiles[1].linkUrl,

    tile3_heading: tiles[2].heading,
    tile3_description: tiles[2].description,
    tile3_link_title: tiles[2].linkTitle,
    tile3_link_url: tiles[2].linkUrl,
  };
}

// -------------------------
// Main
// -------------------------
(async function main() {
  try {
    let urls = [];

    if (SITEMAP_URL) {
      urls = await getUrlsFromSitemap(SITEMAP_URL);
    } else if (URLS_FILE) {
      urls = getUrlsFromFile(URLS_FILE);
    } else {
      throw new Error("Provide --sitemap <url> or --urls <file>.");
    }

    // De-dupe + basic cleanup
    urls = Array.from(new Set(urls)).filter(Boolean);

    console.log(`Found ${urls.length} URLs`);

    const headers = [
      { id: "url", title: "url" },

      { id: "banner_image", title: "banner_image" },
      { id: "banner_title", title: "banner_title" },
      { id: "banner_description", title: "banner_description" },
      { id: "banner_button_text", title: "banner_button_text" },
      { id: "banner_button_link", title: "banner_button_link" },

      { id: "main_description", title: "main_description" },

      { id: "video_heading", title: "video_heading" },
      { id: "video_embed_url", title: "video_embed_url" },

      { id: "tile1_heading", title: "tile1_heading" },
      { id: "tile1_description", title: "tile1_description" },
      { id: "tile1_link_title", title: "tile1_link_title" },
      { id: "tile1_link_url", title: "tile1_link_url" },

      { id: "tile2_heading", title: "tile2_heading" },
      { id: "tile2_description", title: "tile2_description" },
      { id: "tile2_link_title", title: "tile2_link_title" },
      { id: "tile2_link_url", title: "tile2_link_url" },

      { id: "tile3_heading", title: "tile3_heading" },
      { id: "tile3_description", title: "tile3_description" },
      { id: "tile3_link_title", title: "tile3_link_title" },
      { id: "tile3_link_url", title: "tile3_link_url" },
    ];

    const csvWriter = createObjectCsvWriter({
      path: OUT_FILE,
      header: headers,
      alwaysQuote: true, // safer for CMS imports
    });

    const limit = pLimit(CONCURRENCY);

    const rows = [];
    const tasks = urls.map((url, idx) =>
      limit(async () => {
        try {
          const html = await fetchHtml(url);
          const data = extractPageData(html, url);
          rows.push(data);
          console.log(`[${idx + 1}/${urls.length}] OK   ${url}`);
        } catch (err) {
          console.error(`[${idx + 1}/${urls.length}] FAIL ${url} - ${err.message}`);
          // still output a row so you can see what failed
          rows.push({ url, error: err.message });
        }
      })
    );

    await Promise.all(tasks);

    // Keep output in the same order as input URLs
    const rowByUrl = new Map(rows.map(r => [r.url, r]));
    const orderedRows = urls.map(u => rowByUrl.get(u) || { url: u });

    await csvWriter.writeRecords(orderedRows);
    console.log(`\nWrote CSV: ${OUT_FILE}`);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
