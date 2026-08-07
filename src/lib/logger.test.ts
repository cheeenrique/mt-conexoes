import { describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  it('escreve JSON estruturado em stdout com level e timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info({ route: '/api/health', durationMs: 12 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.level).toBe('info');
    expect(line.route).toBe('/api/health');
    expect(typeof line.timestamp).toBe('string');
    spy.mockRestore();
  });
});
