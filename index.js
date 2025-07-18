const { chromium } = require("playwright");

// Configuration
const HN_NEWEST_URL = "https://news.ycombinator.com/newest";
const ARTICLES_TO_VALIDATE = 150;
const NAVIGATION_RETRIES = 3;
const NAVIGATION_TIMEOUT = 15000;
const PAGE_LOAD_DELAY = 1000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Navigates to a URL with retry logic.
 */
async function gotoWithRetries(page, url, retries = NAVIGATION_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT });
      return;
    } catch (err) {
      console.warn(`[WARN] Navigation attempt ${attempt} to ${url} failed. Retrying...`);
      if (attempt === retries) throw new Error(`[ERROR] Failed to navigate to ${url} after ${retries} attempts.`);
      await page.waitForTimeout(2000);
    }
  }
}

/**
 * Extracts Unix timestamps from the first 100 articles on the current page.
 */
async function extractArticleTimestamps(page, maxCount) {
  return page.$$eval("tr.athing", (rows, maxCount) => {
    const timestamps = [];
    for (const row of rows) {
      if (timestamps.length >= maxCount) break;
      const subtextRow = row.nextElementSibling;
      if (!subtextRow) continue;
      const ageSpan = subtextRow.querySelector("span.age");
      if (ageSpan && ageSpan.title) {
        const parts = ageSpan.title.split(" ");
        if (parts.length > 1) {
          const unixTimestamp = parseInt(parts[1], 10);
          timestamps.push(unixTimestamp);
        }
      }
    }
    return timestamps;
  }, maxCount);
}

/**
 * Checks if an array is sorted in descending order.
 */
function isSortedDescending(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] < arr[i + 1]) return false;
  }
  return true;
}

/**
 * Main validation logic for Hacker News articles.
 */
async function validateHackerNewsSorting() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  let timestamps = [];
  let pageCount = 0;

  try {
    await gotoWithRetries(page, HN_NEWEST_URL);
    while (timestamps.length < ARTICLES_TO_VALIDATE) {
      await page.waitForSelector("tr.athing");
      const pageTimestamps = await extractArticleTimestamps(page, ARTICLES_TO_VALIDATE - timestamps.length);
      timestamps = timestamps.concat(pageTimestamps);
      pageCount++;
      if (timestamps.length < ARTICLES_TO_VALIDATE) {
        const moreLink = await page.$("a.morelink");
        if (moreLink) {
          const nextPageUrl = await moreLink.getAttribute("href");
          if (nextPageUrl) {
            await gotoWithRetries(page, `https://news.ycombinator.com/${nextPageUrl}`);
            await page.waitForTimeout(PAGE_LOAD_DELAY);
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
    timestamps = timestamps.slice(0, ARTICLES_TO_VALIDATE);
    const sorted = isSortedDescending(timestamps);
    // Output summary
    console.log("\n--- QA Wolf Take Home: Hacker News Sort Validation ---");
    console.log(`Pages visited: ${pageCount}`);
    console.log(`Articles checked: ${timestamps.length}`);
    if (timestamps.length !== ARTICLES_TO_VALIDATE) {
      console.log(`❌ Only found ${timestamps.length} articles. Expected ${ARTICLES_TO_VALIDATE}.`);
    } else if (sorted) {
      console.log(`✅ The first ${ARTICLES_TO_VALIDATE} articles are sorted from newest to oldest.`);
    } else {
      console.log(`❌ The first ${ARTICLES_TO_VALIDATE} articles are NOT sorted from newest to oldest.`);
    }
    console.log("------------------------------------------------------\n");
  } catch (err) {
    console.error("[FATAL ERROR]", err);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  validateHackerNewsSorting();
}
