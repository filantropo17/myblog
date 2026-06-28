/**
 * 多个视口截图对比
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
const CHROME = 'C:/Users/24062/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe';
const OUT = 'C:/Users/24062/Desktop/myblog/screenshots/2026-06-27/viewports';
fs.mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: '320', w: 320, h: 568 },   // iPhone SE 1
  { name: '375', w: 375, h: 812 },   // iPhone X
  { name: '414', w: 414, h: 896 },   // iPhone Plus
  { name: '768', w: 768, h: 1024 },  // iPad
];

for (const v of viewports) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    deviceScaleFactor: 2,
    isMobile: v.w < 768,
    hasTouch: v.w < 768,
  });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const h = { ...route.request().headers() };
    delete h['if-none-match'];
    delete h['if-modified-since'];
    route.continue({ headers: h });
  });
  await page.goto('http://localhost:4321/?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/vp${v.name}.png`, fullPage: false });
  // 测横向溢出
  const overflow = await page.evaluate(() => {
    return {
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  console.log(`vp ${v.name}px:`, JSON.stringify(overflow));
  await browser.close();
}
console.log('done');
