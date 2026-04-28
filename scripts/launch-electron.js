#!/usr/bin/env node
// Launcher robuste : supprime ELECTRON_RUN_AS_NODE de l'env du subprocess
// avant de lancer Electron. cross-env VAR= ne suffit pas sur Windows
// (Electron traite empty string comme truthy dans certains contextes).
//
// Usage: node scripts/launch-electron.js

delete process.env.ELECTRON_RUN_AS_NODE;

const electron = require('electron');
const { spawn } = require('child_process');

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
});

child.on('close', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
});

child.on('error', (err) => {
    console.error('Failed to launch Electron:', err);
    process.exit(1);
});
