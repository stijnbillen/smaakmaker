import { expect, test } from '@playwright/test';

// T-001 criterion 2 (interface part)
test('index.html links the web app manifest (R-001 crit. 2)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});
