import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe", args: ["--disable-gpu","--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://127.0.0.1:62111/?case=legacy-lengths-only", { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="walls-panel"]');
await page.locator("button", { hasText: /outline/i }).first().click();
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const row = document.querySelector(".flex.flex-wrap.items-end");
  const lab = row?.querySelector("label");
  const inp = row?.querySelector("input");
  const cs = getComputedStyle(row), lc = getComputedStyle(lab), ic = getComputedStyle(inp);
  return { flexWrap: cs.flexWrap, rowW: row.clientWidth, rowMinW: cs.minWidth, labDisplay: lc.display, labW: lab.getBoundingClientRect().width, inpW: ic.width, inpMinW: ic.minWidth, rowRect: row.getBoundingClientRect().width, children: row.children.length };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
