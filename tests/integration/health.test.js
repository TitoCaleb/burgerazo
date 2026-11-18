import { describe, it, expect, afterAll } from 'vitest';
import { createAppServer } from '../../server/app.js';

describe('health', () => {
  const { httpServer, io } = createAppServer();
  afterAll(() => io.close());

  it('GET /health responds ok', async () => {
    await new Promise((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address();
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
