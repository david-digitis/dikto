// electron-builder afterPack hook: wrap the Linux binary to inject --no-sandbox
const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'linux') return;

  const appOutDir = context.appOutDir;

  // Find the executable (same name as package.json "name" field)
  const execName = context.packager.executableName;
  const execPath = path.join(appOutDir, execName);

  if (!fs.existsSync(execPath)) {
    console.log(`[afterPack] Binary not found: ${execPath}, skipping`);
    return;
  }

  // Rename the real binary
  const realBin = execPath + '.bin';
  fs.renameSync(execPath, realBin);

  // Create a wrapper script
  const wrapper = `#!/bin/bash
HERE="$(dirname "$(readlink -f "$0")")"
export ELECTRON_DISABLE_SANDBOX=1
exec "$HERE/${execName}.bin" --no-sandbox "$@"
`;
  fs.writeFileSync(execPath, wrapper, { mode: 0o755 });

  console.log(`[afterPack] Created wrapper: ${execName} -> ${execName}.bin`);
};
