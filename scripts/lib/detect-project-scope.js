#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/** Folders always installed from ECC. */
const ALWAYS_FOLDERS = ['common'];

/**
 * ECC language/domain folders installed only when project scope matches.
 * Keys must match directory names under ECC/rules/.
 */
const SCOPED_FOLDERS = [
  'csharp',
  'nuxt',
  'react',
  'react-native',
  'typescript',
  'vue',
  'web',
  'angular',
  'arkts',
  'cpp',
  'dart',
  'fsharp',
  'golang',
  'java',
  'kotlin',
  'perl',
  'php',
  'python',
  'ruby',
  'rust',
  'swift',
];

function readPackageJson(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function collectDeps(pkg) {
  const deps = new Set();
  if (!pkg) return deps;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = pkg[field];
    if (!block || typeof block !== 'object') continue;
    for (const name of Object.keys(block)) deps.add(name);
  }
  return deps;
}

function exists(projectRoot, ...relativePaths) {
  return relativePaths.some((rel) => fs.existsSync(path.join(projectRoot, rel)));
}

function hasFileExtension(projectRoot, ext, maxDepth = 2) {
  const target = ext.startsWith('.') ? ext : `.${ext}`;
  const queue = [{ dir: projectRoot, depth: 0 }];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo']);

  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(target)) return true;
      if (entry.isDirectory() && depth < maxDepth && !skip.has(entry.name)) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return false;
}

function isExpoProject(projectRoot, pkg) {
  if (exists(projectRoot, 'app.json', 'app.config.js', 'app.config.ts')) {
    try {
      const appJsonPath = path.join(projectRoot, 'app.json');
      if (fs.existsSync(appJsonPath)) {
        const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        if (appJson.expo) return true;
      }
    } catch {
      // ignore malformed app.json
    }
  }
  return Boolean(pkg && (pkg.main === 'expo-router/entry' || pkg.main === 'node_modules/expo/AppEntry.js'));
}

function detectScopedFolders(projectRoot, pkg, deps) {
  const selected = new Set();

  if (deps.has('typescript') || exists(projectRoot, 'tsconfig.json', 'tsconfig.base.json')) {
    selected.add('typescript');
  }

  if (deps.has('react')) {
    selected.add('react');
  }

  if (deps.has('react-native') || deps.has('expo') || isExpoProject(projectRoot, pkg)) {
    selected.add('react-native');
    selected.add('react');
  }

  const hasNuxt =
    deps.has('nuxt') ||
    deps.has('@nuxt/kit') ||
    exists(projectRoot, 'nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs');

  if (hasNuxt) {
    selected.add('nuxt');
  } else if (deps.has('vue') || deps.has('@vue/runtime-core')) {
    selected.add('vue');
  }

  if (
    deps.has('@angular/core') ||
    deps.has('@angular/cli') ||
    exists(projectRoot, 'angular.json')
  ) {
    selected.add('angular');
  }

  const isWebProject =
    deps.has('vite') ||
    deps.has('webpack') ||
    deps.has('parcel') ||
    deps.has('next') ||
    deps.has('astro') ||
    deps.has('svelte') ||
    deps.has('@tailwindcss/vite') ||
    deps.has('tailwindcss') ||
    deps.has('react') ||
    deps.has('vue') ||
    deps.has('@angular/core') ||
    hasNuxt ||
    exists(projectRoot, 'index.html', 'src/index.html', 'public/index.html');

  if (isWebProject) {
    selected.add('web');
  }

  if (
    hasFileExtension(projectRoot, 'csproj', 3) ||
    hasFileExtension(projectRoot, 'sln', 2) ||
    exists(projectRoot, 'global.json', 'Directory.Build.props', 'Directory.Build.targets')
  ) {
    selected.add('csharp');
  }

  if (exists(projectRoot, 'pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile', 'poetry.lock')) {
    selected.add('python');
  }

  if (exists(projectRoot, 'go.mod')) {
    selected.add('golang');
  }

  if (
    exists(projectRoot, 'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts') ||
    hasFileExtension(projectRoot, 'java', 3)
  ) {
    selected.add('java');
  }

  if (
    deps.has('kotlin') ||
    exists(projectRoot, 'build.gradle.kts') ||
    hasFileExtension(projectRoot, 'kt', 3)
  ) {
    selected.add('kotlin');
  }

  if (exists(projectRoot, 'pubspec.yaml')) {
    selected.add('dart');
  }

  if (exists(projectRoot, 'Cargo.toml')) {
    selected.add('rust');
  }

  if (
    exists(projectRoot, 'Package.swift') ||
    hasFileExtension(projectRoot, 'xcodeproj', 2) ||
    hasFileExtension(projectRoot, 'xcworkspace', 2)
  ) {
    selected.add('swift');
  }

  if (exists(projectRoot, 'composer.json')) {
    selected.add('php');
  }

  if (exists(projectRoot, 'Gemfile', 'Gemfile.lock', 'config.ru')) {
    selected.add('ruby');
  }

  if (exists(projectRoot, 'CMakeLists.txt', 'meson.build') || hasFileExtension(projectRoot, 'cpp', 3)) {
    selected.add('cpp');
  }

  if (hasFileExtension(projectRoot, 'fsproj', 3) || hasFileExtension(projectRoot, 'fsx', 3)) {
    selected.add('fsharp');
  }

  if (exists(projectRoot, 'Makefile.PL', 'cpanfile')) {
    selected.add('perl');
  }

  if (
    exists(projectRoot, 'oh-package.json5', 'build-profile.json5') ||
    hasFileExtension(projectRoot, 'ets', 4)
  ) {
    selected.add('arkts');
  }

  return selected;
}

/**
 * Returns ECC rule folder names to install for a consumer project.
 * @param {string} projectRoot
 * @returns {{ folders: string[], scoped: string[], signals: Record<string, unknown> }}
 */
function detectProjectScope(projectRoot) {
  const pkg = readPackageJson(projectRoot);
  const deps = collectDeps(pkg);
  const scoped = detectScopedFolders(projectRoot, pkg, deps);
  const folders = [...ALWAYS_FOLDERS];

  for (const name of SCOPED_FOLDERS) {
    if (scoped.has(name)) folders.push(name);
  }

  const signals = {
    packageName: pkg?.name || null,
    dependencyCount: deps.size,
    scoped: [...scoped].sort(),
  };

  return { folders: [...new Set(folders)], scoped: [...scoped].sort(), signals };
}

module.exports = {
  ALWAYS_FOLDERS,
  SCOPED_FOLDERS,
  detectProjectScope,
};
