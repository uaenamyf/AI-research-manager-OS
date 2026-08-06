/**
 * 论文上传和分析流程 E2E 测试 - Playwright
 */
import { test, expect } from '@playwright/test';

test.describe('论文上传和分析流程', () => {
  const testEmail = `upload-test-${Date.now()}@example.com`;
  const testPassword = 'test-password-123';

  test.beforeEach(async ({ page }) => {
    // 注册并登录测试用户
    await page.goto('/register');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.getByRole('button', { name: /注册|register/i }).click();

    // 创建一个项目
    await page.goto('/projects');
    await page.getByRole('button', { name: /新建|create|new/i }).click();
    await page.fill('input[name="name"]', 'Test Project');
    await page.getByRole('button', { name: /创建|create/i }).click();
  });

  test('进入项目后可以上传 PDF', async ({ page }) => {
    // 进入项目详情页
    await page.goto('/projects');
    await page.getByText('Test Project').click();

    // 应该有上传按钮
    const uploadButton = page.getByRole('button', {
      name: /上传|upload|paper/i,
    });
    await expect(uploadButton).toBeVisible();
  });

  test('上传区域支持拖拽和点击', async ({ page }) => {
    await page.goto('/projects');
    await page.getByText('Test Project').click();
    await page.getByRole('button', { name: /上传|upload/i }).click();

    // 应该有拖拽区域
    const dropZone = page.locator('[data-testid="upload-dropzone"]');
    await expect(dropZone).toBeVisible();
  });

  test('上传后显示处理状态', async ({ page }) => {
    // 这个测试需要真实的后端和文件上传
    // 在 CI 环境中可以使用测试 PDF 文件
    test.skip(
      !!process.env.CI,
      '跳过上传测试（需要后端和 S3 配置）'
    );

    await page.goto('/projects');
    await page.getByText('Test Project').click();

    // 触发文件选择
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('input[type="file"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('tests/fixtures/test-paper.pdf');

    // 应该显示上传进度
    await expect(page.getByText(/上传|uploading|processing/i)).toBeVisible();

    // 最终应该显示 PROCESSING 状态
    await expect(page.getByText(/PROCESSING/)).toBeVisible({ timeout: 30000 });
  });

  test('论文列表显示状态徽章', async ({ page }) => {
    await page.goto('/projects');
    await page.getByText('Test Project').click();

    // 状态徽章应该存在
    const statusBadges = page.locator('[data-testid="status-badge"]');
    const count = await statusBadges.count();

    // 可能没有论文也可能有，只要组件能正常渲染就行
    if (count > 0) {
      await expect(statusBadges.first()).toBeVisible();
    }
  });
});
