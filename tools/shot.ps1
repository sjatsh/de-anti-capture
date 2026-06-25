param([string]$Out = "shot.png")
# Capture the app's main window (largest non-minimized electron window) via PrintWindow (DPI-aware).
Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class Shot{
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr hdc,uint f);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb,IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int Left,Top,Right,Bottom;}
}
"@
$elPids=(Get-Process electron -ErrorAction SilentlyContinue).Id
if(-not $elPids){Write-Output "NO electron";exit 1}
[Shot]::SetProcessDPIAware()|Out-Null
$script:best=[IntPtr]::Zero;$script:area=0
$cb=[Shot+EnumProc]{param($h,$p)
 if(-not [Shot]::IsWindowVisible($h) -or [Shot]::IsIconic($h)){return $true}
 $op=0;[Shot]::GetWindowThreadProcessId($h,[ref]$op)|Out-Null
 if($elPids -notcontains $op){return $true}
 $cn=New-Object System.Text.StringBuilder 256;[Shot]::GetClassNameW($h,$cn,256)|Out-Null
 if($cn.ToString() -ne "Chrome_WidgetWin_1"){return $true}
 $r=New-Object Shot+RECT;[Shot]::GetWindowRect($h,[ref]$r)|Out-Null
 $a=($r.Right-$r.Left)*($r.Bottom-$r.Top)
 if($a -gt $script:area){$script:area=$a;$script:best=$h}
 return $true
}
[Shot]::EnumWindows($cb,[IntPtr]::Zero)|Out-Null
if($script:best -eq [IntPtr]::Zero){Write-Output "NOTFOUND";exit 1}
$r=New-Object Shot+RECT;[Shot]::GetWindowRect($script:best,[ref]$r)|Out-Null
$w=$r.Right-$r.Left;$hh=$r.Bottom-$r.Top
Add-Type -AssemblyName System.Drawing
$bmp=New-Object System.Drawing.Bitmap $w,$hh
$g=[System.Drawing.Graphics]::FromImage($bmp)
$hdc=$g.GetHdc();[Shot]::PrintWindow($script:best,$hdc,2)|Out-Null;$g.ReleaseHdc($hdc)
$bmp.Save($Out,[System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("OK {0}x{1} -> {2}" -f $w,$hh,$Out)
