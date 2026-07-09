#!/usr/bin/env node
'use strict';

const path = require('path');
const { installEccRules } = require('./lib/install-ecc-rules');

const projectRoot = path.resolve(process.argv[2] || process.env.INIT_CWD || process.cwd());
const dryRun = process.argv.includes('--dry-run');

const result = installEccRules(projectRoot, { dryRun });
process.exit(result.ok ? 0 : 1);
