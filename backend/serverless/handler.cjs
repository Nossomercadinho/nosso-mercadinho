'use strict';

/**
 * The legacy database adapter has one transaction context per process. Keep
 * requests sequential here as well as disabling Fluid concurrency in Vercel.
 */
function createHandler({ loadApplication, env = process.env }) {
  let application;
  let tail = Promise.resolve();
  let interrupted = false;

  function prepare() {
    if (!application) {
      application = Promise.resolve().then(async () => {
        if (env.DB_CLIENT !== 'postgres' || !env.DATABASE_URL || !env.JWT_SECRET) {
          throw new Error('Configuração privada da API incompleta.');
        }
        const loaded = await loadApplication();
        await loaded.inicializarAplicacao();
        return loaded.default;
      });
      void application.catch(() => undefined);
    }
    return application;
  }

  function unavailable(res) {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) { res.end(); return; }
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(JSON.stringify({ sucesso: false, erro: 'API temporariamente indisponível.' }));
  }

  return async function handler(req, res) {
    const previous = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      if (req.aborted || res.destroyed) return;
      if (interrupted) { unavailable(res); return; }
      const app = await prepare();
      if (req.aborted || res.destroyed) return;
      res.setHeader('Cache-Control', 'private, no-store');
      await new Promise(resolve => {
        const cleanup = () => {
          res.removeListener('finish', finished);
          res.removeListener('close', closed);
          resolve();
        };
        const finished = () => cleanup();
        const closed = () => {
          // Do not let another request enter a transaction whose previous
          // response was interrupted while asynchronous work may still run.
          if (!res.writableFinished) interrupted = true;
          cleanup();
        };
        res.once('finish', finished);
        res.once('close', closed);
        try { app(req, res); }
        catch { interrupted = true; unavailable(res); }
      });
    } catch {
      // Never return connection strings, SQL errors or initialization details.
      unavailable(res);
    } finally {
      release();
    }
  };
}

module.exports = { createHandler };
