import { expect, test } from '@playwright/test';

// T-001 criterion 2 (interface part)
test('index.html links the web app manifest (R-001 crit. 2)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});

// T-026 criterion 4 (R-025): the built page links the three icons
test('built page links svg icon, png favicon and apple-touch-icon (R-025 crit. 4)', async ({ page, request }) => {
  await page.goto('/');
  const svg = page.locator('link[rel="icon"][type="image/svg+xml"]');
  const png = page.locator('link[rel="icon"][sizes="32x32"]');
  const apple = page.locator('link[rel="apple-touch-icon"]');
  await expect(svg).toHaveCount(1);
  await expect(png).toHaveCount(1);
  await expect(apple).toHaveCount(1);
  for (const l of [svg, png, apple]) {
    const href = await l.getAttribute('href');
    const res = await request.get(new URL(href!, page.url()).toString());
    expect(res.ok(), `${href} reachable`).toBe(true);
  }
});
