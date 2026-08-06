/**
 * 工具函数测试
 */
import { cn, formatDate } from '@/lib/utils';

describe('cn - className 合并工具', () => {
  it('合并多个 class 名称', () => {
    const result = cn('text-sm', 'font-bold');
    expect(result).toBe('text-sm font-bold');
  });

  it('处理条件 class', () => {
    const isActive = true;
    const result = cn('text-sm', isActive && 'text-blue-500');
    expect(result).toBe('text-sm text-blue-500');
  });

  it('过滤 falsy 值', () => {
    const result = cn('text-sm', false, null, undefined, '', 0);
    expect(result).toBe('text-sm');
  });
});

describe('formatDate - 日期格式化', () => {
  it('格式化 ISO 日期字符串', () => {
    const date = '2026-07-21T10:30:00.000Z';
    const result = formatDate(date);
    // 结果可能因时区有所不同，但应该包含日期部分
    expect(result).toContain('2026');
  });

  it('处理 Date 对象', () => {
    const date = new Date('2026-07-21');
    const result = formatDate(date);
    expect(result).toContain('2026');
  });
});
