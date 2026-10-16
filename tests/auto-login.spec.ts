import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.PLAYWRIGHT_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || '';

test.describe.configure({ retries: 1 });

async function loginIfNeeded(page: any) {
  // Check if already logged in
  const isLoggedIn = await page.evaluate(() => {
    const token = localStorage.getItem('ngf_token');
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  });

  if (!isLoggedIn) {
    console.log('Not logged in, performing login...');
    // Wait for login form
    await page.waitForSelector('input[name="username"]', { timeout: 15000 });
    
    // Fill credentials
    await page.fill('input[name="username"]', ADMIN_USERNAME);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    
    // Submit login - no full navigation in SPA, wait for dashboard to appear
    await page.click('button[type="submit"]:has-text("Sign in")');
    
    // Wait for dashboard to appear (AppShell renders)
    await page.waitForSelector('h2:has-text("Dashboard")', { timeout: 20000 });
    
    // Verify login by checking localStorage
    const loggedIn = await page.evaluate(() => {
      const token = localStorage.getItem('ngf_token');
      return !!token;
    });
    
    if (!loggedIn) {
      // Wait a bit more and check again
      await page.waitForTimeout(1000);
      const loggedIn2 = await page.evaluate(() => {
        const token = localStorage.getItem('ngf_token');
        return !!token;
      });
      expect(loggedIn2).toBe(true);
    }
  }
}

test.describe('Automatic Playwright Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('should auto-login as Admin and reach dashboard', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    
    await loginIfNeeded(page);
    
    // Verify dashboard loads
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15000 });
    
    // Verify admin navigation is present - check for navigation buttons
    // The sidebar might be collapsed, so check for the navigation area
    const navButtons = page.locator('nav button');
    await expect(navButtons.first()).toBeVisible({ timeout: 10000 });
    
    // Check for at least some navigation items by their accessible names
    await expect(page.locator('button[title="Dashboard"], button:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
    
    // Verify user identity in header
    await expect(page.locator('button:has-text("TONY JOSEPH")')).toBeVisible({ timeout: 10000 });
  });

  test('should have valid session that survives page reload', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    
    await loginIfNeeded(page);
    
    // Verify initial load
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15000 });
    
    // Reload the page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for session to be restored
    await page.waitForTimeout(500);
    
    // Should still be logged in
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("TONY JOSEPH")')).toBeVisible({ timeout: 10000 });
  });

  test('should access protected API endpoints with browser session', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');
    
    await loginIfNeeded(page);
    
    // Get the token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('ngf_token'));
    expect(token).toBeTruthy();
    
    // Test dashboard API with Authorization header
    const dashboardResponse = await page.request.get(`${BASE_URL}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(dashboardResponse.ok()).toBe(true);
    const dashboardData = await dashboardResponse.json();
    expect(dashboardData.success).toBe(true);
    expect(dashboardData.data.metrics).toBeDefined();

    // Test org hierarchy API (admin only)
    const orgResponse = await page.request.get(`${BASE_URL}/api/branches/org-hierarchy`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(orgResponse.ok()).toBe(true);
    const orgData = await orgResponse.json();
    expect(orgData.success).toBe(true);
    expect(orgData.data.branches).toBeDefined();
  });

  test('should NOT access protected pages without authentication', async ({ page, context }) => {
    // Clear all storage
    await context.clearCookies();
    await page.goto(BASE_URL);
    
    // Clear localStorage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Should show login form
    await expect(page.locator('input[name="username"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h1:has-text("Sign in")')).toBeVisible();

    // Try to access dashboard API directly - should fail
    const response = await page.request.get(`${BASE_URL}/api/dashboard`);
    expect(response.status()).toBe(401);
  });
});

test.describe('Role-specific login tests', () => {
  test('should login as Manager (Vincent Antony) if credentials available', async ({ page }) => {
    const managerUsername = process.env.PLAYWRIGHT_MANAGER_USERNAME || '';
    const managerPassword = process.env.PLAYWRIGHT_MANAGER_PASSWORD || '';
    
    if (!managerUsername || !managerPassword) {
      test.skip();
      return;
    }

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Clear any existing session
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Login as manager
    await page.waitForSelector('input[name="username"]', { timeout: 15000 });
    await page.fill('input[name="username"]', managerUsername);
    await page.fill('input[name="password"]', managerPassword);
    await page.click('button[type="submit"]:has-text("Sign in")');
    await page.waitForSelector('h2:has-text("Dashboard")', { timeout: 20000 });

    // Verify manager dashboard loads
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15000 });
    
    // Verify manager navigation - should see Staff menu
    const staffMenuItems = page.locator('nav button');
    await expect(staffMenuItems.first()).toBeVisible({ timeout: 10000 });
  });

  test('should login as Collection Agent if credentials available', async ({ page }) => {
    const agentUsername = process.env.PLAYWRIGHT_AGENT_USERNAME || '';
    const agentPassword = process.env.PLAYWRIGHT_AGENT_PASSWORD || '';
    
    if (!agentUsername || !agentPassword) {
      test.skip();
      return;
    }

    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Clear any existing session
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Login as agent
    await page.waitForSelector('input[name="username"]', { timeout: 15000 });
    await page.fill('input[name="username"]', agentUsername);
    await page.fill('input[name="password"]', agentPassword);
    await page.click('button[type="submit"]:has-text("Sign in")');
    await page.waitForSelector('h2:has-text("Dashboard")', { timeout: 20000 });

    // Verify agent dashboard loads
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15000 });
    
    // Agent should see their specific menu
    await expect(page.locator('button:has-text("Assigned Verifications")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Assigned Customers")')).toBeVisible({ timeout: 10000 });
  });
});