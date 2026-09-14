import { describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { validateBody } from './middleware/validate';
import { registerSchema } from './validation/schemas';

describe('app', () => {
  it('can be imported without starting the server', () => {
    expect(typeof app.handle).toBe('function');
  });

  it('registers the health endpoint on the composed app', () => {
    const healthRoute = app.router.stack.find((layer: { route?: { path?: string } }) => layer.route?.path === '/api/health');

    expect(healthRoute).toBeDefined();
  });

  it('returns schema errors for invalid request bodies', () => {
    const req = { body: { email: 'invalid', password: 'short', name: '' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    validateBody(registerSchema)(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid request body',
        issues: expect.any(Array),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
