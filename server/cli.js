#!/usr/bin/env node
// Manual trigger: `npm run regenerate`
import 'dotenv/config';
import { runPipeline } from './pipeline.js';

runPipeline()
  .then(r => {
    console.log('\n✓ saved:', r.date);
    console.log('headlines:', r.headlines.length);
    console.log('script length:', r.script.length, 'chars');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n✗ failed:', err);
    process.exit(1);
  });
