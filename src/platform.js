const { exec } = require('child_process');

/**
 * Detect if the currently focused window is a terminal
 * Used to skip auto-paste in terminals (clipboard-only instead)
 */
async function isTerminalFocused() {
  const platform = process.platform;

  if (platform === 'win32') {
    return new Promise((resolve) => {
      exec('powershell -command "(Get-Process | Where-Object {$_.MainWindowHandle -eq (Add-Type -MemberDefinition \'[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();\' -Name \'Win32\' -Namespace \'Win32\' -PassThru)::GetForegroundWindow()}).ProcessName"',
        { timeout: 2000 },
        (err, stdout) => {
          if (err) return resolve(false);
          const name = stdout.trim().toLowerCase();
          const terminals = ['windowsterminal', 'cmd', 'powershell', 'pwsh', 'conhost', 'alacritty', 'wezterm'];
          resolve(terminals.some(t => name.includes(t)));
        });
    });
  }

  if (platform === 'linux') {
    const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
    // Wayland: use gdbus to query GNOME Shell for focused window name
    // X11: use xdotool
    const cmd = isWayland
      ? `gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "global.display.focus_window ? global.display.focus_window.get_wm_class() : ''" 2>/dev/null || echo ""`
      : 'xdotool getactivewindow getwindowname 2>/dev/null || echo ""';

    return new Promise((resolve) => {
      exec(cmd, { timeout: 2000 }, (err, stdout) => {
        if (err) return resolve(false);
        const name = stdout.trim().toLowerCase();
        const terminals = ['terminal', 'konsole', 'alacritty', 'kitty', 'wezterm', 'foot', 'tilix', 'gnome-terminal', 'ptyxis'];
        resolve(terminals.some(t => name.includes(t)));
      });
    });
  }

  return false;
}

module.exports = { isTerminalFocused };
