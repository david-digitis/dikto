# Dikto — coupe/retablit le son de la sortie audio par defaut (Windows Core Audio).
# Usage: powershell -File mute.ps1 mute|unmute
#   mute   -> coupe seulement si le son n'etait pas deja coupe, affiche "did-mute" sinon "noop"
#   unmute -> retablit le son
# Note: les appels COM se font dans le C# compile (interface IUnknown = vtable pure,
#        que PowerShell ne peut pas invoquer directement).
param([Parameter(Mandatory = $true)][ValidateSet('mute', 'unmute')][string]$action)

$ErrorActionPreference = 'Stop'
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
  // 11 methodes placeholders (occupent les slots de la vtable avant SetMute/GetMute)
  int f1(); int f2(); int f3(); int f4(); int f5(); int f6();
  int f7(); int f8(); int f9(); int f10(); int f11();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool bMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
  int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams,
               [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
  int f1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

public static class DiktoVol {
  static Guid IID = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
  static IAudioEndpointVolume Get() {
    IMMDeviceEnumerator e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev;
    Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 0, out dev)); // eRender, eConsole
    object o;
    Marshal.ThrowExceptionForHR(dev.Activate(ref IID, 23, IntPtr.Zero, out o)); // CLSCTX_ALL
    return (IAudioEndpointVolume)o;
  }
  public static bool IsMuted() {
    bool m; Marshal.ThrowExceptionForHR(Get().GetMute(out m)); return m;
  }
  public static void SetMute(bool mute) {
    Guid g = Guid.Empty; Marshal.ThrowExceptionForHR(Get().SetMute(mute, ref g));
  }
}
'@

    if ($action -eq 'mute') {
        if (-not [DiktoVol]::IsMuted()) { [DiktoVol]::SetMute($true); Write-Output 'did-mute' }
        else { Write-Output 'noop' }
    }
    else {
        [DiktoVol]::SetMute($false)
        Write-Output 'ok'
    }
}
catch {
    Write-Output ('err: ' + $_.Exception.Message)
    exit 1
}
