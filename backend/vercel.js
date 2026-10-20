'use strict';

const express = require('express');
const { createRequire } = require('node:module');
const { createHandler } = require('./serverless/handler.cjs');

const loadCompiledApplication = createRequire(__filename);

const app = express();
app.disable('x-powered-by');

// Load the compiled application only after checking the production database
// configuration, so a missing variable cannot fall back to the local SQLite DB.
// createRequire keeps the compiled application intact during bundling; Vercel's
// file tracing can still follow this literal path and include its runtime assets.
app.use(createHandler({
  loadApplication: () => loadCompiledApplication('./dist/app.js'),
}));

module.exports = app;
