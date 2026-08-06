/**
 * 认证流程 E2E 测试 - Playwright
 * 测试：注册 → 登录 → 访问受保护页面 → 登出
 */
import { test, expect } from '@playwright/test';

test.describe('认证流程', () => {
  const testEmail = `e2e-test-${Date.now()}@example.com`;
  const testPassword = 'test-password-123';

  test('新用户注册成功', async ({ page }) => {
    await page.goto('/register');

    // 填写注册表单
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.getByRole('button', { name: /注册|register/i }).click();

    // 注册成功后应该跳转到登录或仪表板
    await expect(page).toHaveURL(/\/login|\/dashboard/);
  });

  test('用户登录成功并访问仪表板', async ({ page }) => {
    // 先注册（如果之前未注册）
    await page.goto('/register');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.getByRole('button', { name: /注册|register/i }).click();

    // 转到登录页面
    await page.goto('/login');

    // 填写登录表单
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.getByRole('button', { name: /登录|login/i }).click();

    // 登录成功后应该跳转到仪表板
    await expect(page).toHaveURL(/\/dashboard/);

    // 仪表板应该显示用户信息
    await expect(page.getByText(/Research|My Project/i)).toBeVisible();
  });

  test('错误密码登录失败', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', 'wrong-password');
    await page.getByRole('button', { name: /登录|login/i }).click();

    // 应该显示错误消息
    await expect(page.getByText(/密码|password|错误|failed/i)).toBeVisible();

    // 仍然在登录页面
    await expect(page).toHaveURL(/\/login/);
  });

  test('未登录用户无法访问受保护页面', async ({ page }) => {
    // 清除所有 cookie（确保未登录）
    await page.context().clearCookies();

    // 尝试直接访问仪表板
    await page.goto('/dashboard');

    // 应该重定向到登录页面
    await expect(page).toHaveURL(/\/login/);
  });
});
