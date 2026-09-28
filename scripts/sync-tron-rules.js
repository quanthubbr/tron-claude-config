#!/usr/bin/env node
'use strict';

const path = require('path');
const { installTronRules } = require('./lib/install-tron-rules');

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const projectRoot = path.resolve(positional[0] || process.env.INIT_CWD || process.cwd());
const dryRun = process.argv.includes('--dry-run');

const result = installTronRules(projectRoot, { dryRun });
process.exit(result.ok ? 0 : 1);
