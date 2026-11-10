using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Threading;

internal static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr owner, string text, string title, uint type);

    private static int Main()
    {
        using var instance = new Mutex(true, @"Local\AnswerOverlayPortable", out bool first);
        if (!first)
        {
            MessageBox(IntPtr.Zero, "Answer Overlay is already running. After selecting an Edge window, press Ctrl+Alt+Enter to refresh.", "Answer Overlay", 0);
            return 0;
        }

        string directory = Path.Combine(Path.GetTempPath(), "AnswerOverlay-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(directory);
            using (var stream = typeof(Program).Assembly.GetManifestResourceStream("LauncherPayload.zip")
                ?? throw new InvalidOperationException("The launcher package is incomplete."))
            using (var archive = new ZipArchive(stream))
                archive.ExtractToDirectory(directory);

            var options = new ProcessStartInfo(Path.Combine(directory, "AnswersLauncher.exe"))
            {
                WorkingDirectory = directory,
                UseShellExecute = false,
            };
            options.Environment["ANSWER_OVERLAY_PROFILE"] = Path.Combine(directory, "Profile");
            using var process = Process.Start(options) ?? throw new InvalidOperationException("The overlay did not start.");
            process.WaitForExit();
            return process.ExitCode;
        }
        catch (Exception error)
        {
            MessageBox(IntPtr.Zero, error.Message, "Answer Overlay", 0x10);
            return 1;
        }
        finally
        {
            for (int attempt = 0; Directory.Exists(directory); attempt++)
            {
                try { Directory.Delete(directory, recursive: true); }
                catch (Exception error) when (error is IOException || error is UnauthorizedAccessException)
                {
                    if (attempt == 9)
                    {
                        MessageBox(IntPtr.Zero, "Could not remove the launcher temporary files:\n" + directory, "Answer Overlay", 0x30);
                        break;
                    }
                    Thread.Sleep(300);
                }
            }
        }
    }
}
