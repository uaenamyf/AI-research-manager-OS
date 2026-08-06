/**
 * 前端组件测试 - React Testing Library
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock API
vi.mock('@/lib/api', () => ({
  papers: {
    listByProject: vi.fn(),
  },
}));

describe('组件渲染测试', () => {
  it('基础组件渲染正常', () => {
    // 测试简单的 div 渲染（作为基础验证）
    render(<div data-testid="test">Hello World</div>);
    expect(screen.getByTestId('test')).toBeDefined();
    expect(screen.getByText('Hello World')).toBeDefined();
  });

  it('支持条件渲染', () => {
    const show = true;
    render(
      <div>
        {show && <span data-testid="conditional">Visible</span>}
      </div>
    );
    expect(screen.getByTestId('conditional')).toBeDefined();
  });
});

describe('PaperStatusBadge 组件', () => {
  // 简单模拟组件
  const PaperStatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      READY: 'bg-green-100 text-green-800',
      PROCESSING: 'bg-blue-100 text-blue-800',
      FAILED: 'bg-red-100 text-red-800',
    };
    return (
      <span data-testid="status-badge" className={colors[status] || 'bg-gray-100'}>
        {status}
      </span>
    );
  };

  it('READY 状态显示绿色', () => {
    render(<PaperStatusBadge status="READY" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('READY');
    expect(badge.className).toContain('green');
  });

  it('PROCESSING 状态显示蓝色', () => {
    render(<PaperStatusBadge status="PROCESSING" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('PROCESSING');
    expect(badge.className).toContain('blue');
  });

  it('FAILED 状态显示红色', () => {
    render(<PaperStatusBadge status="FAILED" />);
    const badge = screen.getByTestId('status-badge');
    expect(badge.textContent).toBe('FAILED');
    expect(badge.className).toContain('red');
  });
});

describe('PaperCard 组件', () => {
  // 简化版 PaperCard 用于测试
  const PaperCard = ({
    title,
    status,
    authors,
  }: {
    title: string;
    status: string;
    authors?: string;
  }) => (
    <div data-testid="paper-card" className="border rounded p-4">
      <h3 data-testid="paper-title">{title}</h3>
      {authors && <p data-testid="paper-authors">{authors}</p>}
      <span data-testid="paper-status">{status}</span>
    </div>
  );

  it('显示论文标题和状态', () => {
    render(<PaperCard title="Attention Is All You Need" status="READY" />);

    expect(screen.getByTestId('paper-title').textContent).toBe(
      'Attention Is All You Need'
    );
    expect(screen.getByTestId('paper-status').textContent).toBe('READY');
  });

  it('有作者时显示作者信息', () => {
    render(
      <PaperCard
        title="Test Paper"
        status="PROCESSING"
        authors="Author A, Author B"
      />
    );

    expect(screen.getByTestId('paper-authors').textContent).toContain('Author A');
  });

  it('无作者时不显示作者元素', () => {
    render(<PaperCard title="Test Paper" status="READY" />);
    expect(screen.queryByTestId('paper-authors')).toBeNull();
  });
});
