// Full-Stack Express Server & Vite Integration
import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes/api';
import { FIXTURE_PAGES } from './server/fixtures/fixtures';
import { seedInitialDataIfEmpty } from './server/db/seed';
import { scheduler } from './server/engine/scheduler';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Strict anti-indexing headers to prevent any search engine from indexing the app
  app.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    next();
  });

  // Explicit robots.txt route
  app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    res.send('User-agent: *\nDisallow: /\n');
  });

  // Seed initial data if empty
  seedInitialDataIfEmpty();

  // 1. Local Fixture Endpoints (Requirement #76 & #77)
  app.get('/fixtures/:filename', (req, res) => {
    const filename = req.params.filename;
    if (FIXTURE_PAGES[filename]) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(FIXTURE_PAGES[filename]);
    }
    return res.status(404).send('Fixture page not found');
  });

  // 2. Mount API Routes
  app.use('/api', apiRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Price Collector & WordPress Sync System',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // 3. Vite Middleware (Dev) or Static files (Production)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 4. Start Server on Port 3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Price Collector System running at http://0.0.0.0:${PORT}`);
    // Start database-driven scheduler
    scheduler.start();
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
