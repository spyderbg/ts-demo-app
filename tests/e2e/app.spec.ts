import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createBC7DDS } from '../fixtures/bc7-dds';
import { test, expect } from '@playwright/test';

test.describe.serial('GDA Sync workspace', () => {
  test('renders an offline asset library, searches and filters actual files', async ({ page }) => {
    const errors: string[] = []; const requests: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:3467')) requests.push(request.url()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Asset library.' })).toBeVisible();
    await expect(page.locator('.asset-card')).toHaveCount(18);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.asset-card img').first()).toBeVisible();
    await page.screenshot({ path: 'build/preview-desktop.png', fullPage: true });
    await page.getByRole('textbox', { name: 'Search assets' }).fill('moss');
    await expect(page.locator('.asset-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByRole('combobox', { name: 'Filter by file format' }).selectOption('dds');
    await expect(page.locator('.asset-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'Inspect moss_ground_normal.dds' }).click();
    await expect(page.getByRole('heading', { name: 'moss_ground_normal.dds' })).toBeVisible();
    await expect(page.getByText('DDS preview supported')).toBeVisible();
    const ddsPreview = page.locator('.inspector img');
    await expect(ddsPreview).toBeVisible();
    await expect.poll(() => ddsPreview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
    await page.getByRole('combobox', { name: 'Filter by file format' }).selectOption('all');
    await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('new');
    await expect(page.locator('.asset-card')).toHaveCount(5);
    expect(errors).toEqual([]); expect(requests).toEqual([]);
  });
  test('supports list view, previews, keyboard shortcuts, and a mobile layout', async ({ page }) => {
    await page.goto('/'); await expect(page.locator('.asset-card')).toHaveCount(18);
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    await expect(page.locator('.asset-list')).toBeVisible();
    await page.getByRole('button', { name: 'Enlarge moss_ground_albedo.png preview' }).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('textbox', { name: 'Search assets' })).toBeFocused();
    await page.getByRole('button', { name: 'Grid view', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'build/preview-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  test('validates workspace folders and saves a project configuration', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
    const source = await page.getByLabel('Source folder', { exact: true }).inputValue();
    const destination = await page.getByLabel('GDA destination', { exact: true }).inputValue();
    await page.getByLabel('GDA destination', { exact: true }).fill(source);
    await page.getByRole('button', { name: 'Save connection' }).click();
    await expect(page.getByRole('status')).toContainText('must be separate');
    await page.getByLabel('GDA destination', { exact: true }).fill(destination);
    await page.getByLabel('Project name', { exact: true }).fill('Verdant Studio');
    await page.getByRole('button', { name: 'Save connection' }).click();
    await expect(page.getByRole('heading', { name: 'Asset library.' })).toBeVisible();
    await page.reload(); await expect(page.locator('.breadcrumb')).toContainText('Verdant Studio');
  });
  test('selection sync changes file status and appears in activity history', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('checkbox', { name: 'Select moss_ground_albedo.png', exact: true }).check();
    await page.getByRole('button', { name: 'Sync selected' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Sync 1 asset', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('1 asset synced');
    const card = page.locator('.asset-card').filter({ has: page.getByRole('button', { name: 'Inspect moss_ground_albedo.png', exact: true }) });
    await expect(card).toContainText('In sync');
    await page.getByRole('button', { name: 'Sync activity', exact: true }).click();
    await expect(page.getByText('Synced 1 asset to GDA')).toBeVisible();
    await page.getByText('View 1 files', { exact: true }).click();
    await expect(page.getByText('textures/forest/moss_ground_albedo.png', { exact: true })).toBeVisible();
  });
  test('syncing all pending makes the workspace current, including after reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sync all pending' }).click();
    await page.getByRole('button', { name: 'Sync 7 assets', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('7 assets synced');
    await page.getByRole('button', { name: 'Needs sync', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'All caught up.' })).toBeVisible();
    await page.reload(); await page.getByRole('button', { name: 'Needs sync', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'All caught up.' })).toBeVisible();
    await page.getByRole('button', { name: 'Rescan', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('18 assets found');
  });
  test('loads a DX10 BC7 asset in the catalog, inspector and enlarged preview', async ({ page, request }) => {
    const data = await (await request.get('/api/library')).json();
    expect(data.config.source).toContain('gda-e2e-');
    await writeFile(path.join(data.config.source, 'textures/forest/k_active_en.dds'), createBC7DDS(136, 134));
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Search assets' }).fill('k_active_en.dds');
    await expect(page.locator('.asset-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Inspect k_active_en.dds' }).click();
    await expect(page.getByText('BC7_UNORM', { exact: true })).toBeVisible();
    await expect(page.getByText('DDS preview supported')).toBeVisible();
    const image = page.locator('.inspector img');
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([136, 134]);
    await expect(image).toHaveCSS('object-fit', 'contain');
    await expect(image).toHaveCSS('filter', 'none');
    await expect(page.locator('.asset-card img')).toHaveCSS('object-fit', 'contain');
    await page.getByRole('button', { name: 'Enlarge k_active_en.dds preview' }).click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'k_active_en.dds preview', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
  });
  test('rescan recovers a failed DDS thumbnail without changing the source file', async ({ page, request }) => {
    const library = await (await request.get('/api/library')).json();
    const asset = library.assets.find((a: { name: string }) => a.name === 'k_active_en.dds');
    let fail = true;
    await page.route(`**/api/assets/${asset.id}/preview?*`, route => fail
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporary preview failure"}' })
      : route.continue());
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Search assets' }).fill('k_active_en.dds');
    await page.getByRole('button', { name: 'Inspect k_active_en.dds', exact: true }).click();
    await expect(page.getByText('No image preview available', { exact: true })).toBeVisible();
    await expect(page.locator('.asset-card img')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Rescan', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('19 assets found');
    await expect.poll(() => page.locator('.inspector img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(136);
    await expect.poll(() => page.locator('.asset-card img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(136);
    await expect(page.getByText('No image preview available', { exact: true })).not.toBeVisible();
    const rescanned = await (await request.get('/api/library')).json();
    expect(rescanned.assets.find((a: { name: string }) => a.name === 'k_active_en.dds').modifiedAt).toBe(asset.modifiedAt);
  });
  test('renews an expired server session and retries the rejected rescan once', async ({ page }) => {
    let scans = 0, sessions = 0;
    await page.route('**/api/session', route => { sessions++; return route.continue(); });
    await page.route('**/api/scan', route => {
      scans++;
      return scans === 1 ? route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Invalid session. Reload the application."}' }) : route.continue();
    });
    await page.goto('/');
    await expect(page.locator('.asset-card')).toHaveCount(19);
    await page.getByRole('button', { name: 'Rescan', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('19 assets found');
    expect(scans).toBe(2); expect(sessions).toBeGreaterThan(1);
  });
  test('stops the local application and leaves a clear closed-workspace screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
    await page.getByRole('button', { name: 'Stop application', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Stop application', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Workspace closed.' })).toBeVisible();
  });
});
