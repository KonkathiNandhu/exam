using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

public class EdgeWindow {
    public long handle;
    public int processId;
    public string started;
    public string title;
}
public class EdgeQuestion {
    public string text;
    public string[] choices;
}
public static class EdgeReader {
    private delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);

    public static EdgeWindow[] Windows() {
        var result = new List<EdgeWindow>();
        EnumWindows(delegate(IntPtr handle, IntPtr unused) {
            if (!IsWindowVisible(handle)) return true;
            uint processId;
            GetWindowThreadProcessId(handle, out processId);
            try {
                using (var process = Process.GetProcessById((int)processId)) {
                    if (process.ProcessName != "msedge") return true;
                    var title = new StringBuilder(512);
                    GetWindowText(handle, title, title.Capacity);
                    if (title.Length == 0) return true;
                    result.Add(new EdgeWindow {
                        handle = handle.ToInt64(), processId = (int)processId,
                        started = process.StartTime.ToUniversalTime().Ticks.ToString(),
                        title = title.ToString()
                    });
                }
            } catch (ArgumentException) { }
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }

    public static EdgeQuestion Read(long windowHandle, int expectedProcess, string started) {
        var handle = new IntPtr(windowHandle);
        uint processId;
        GetWindowThreadProcessId(handle, out processId);
        if (processId != expectedProcess || !IsWindowVisible(handle) || IsIconic(handle))
            throw new Exception("Restore the selected Edge window, or select it again.");
        using (var process = Process.GetProcessById(expectedProcess)) {
            if (process.ProcessName != "msedge" ||
                process.StartTime.ToUniversalTime().Ticks.ToString() != started)
                throw new Exception("The selected Edge window has closed. Select it again.");
        }
        var root = AutomationElement.FromHandle(handle);
        var documents = root.FindAll(TreeScope.Descendants,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
        AutomationElement document = null;
        double largest = 0;
        foreach (AutomationElement candidate in documents) {
            var current = candidate.Current;
            var rect = current.BoundingRectangle;
            if (!current.IsOffscreen && rect.Width * rect.Height > largest) {
                document = candidate;
                largest = rect.Width * rect.Height;
            }
        }
        if (document == null) throw new Exception("Edge exposes no readable document. Open the quiz tab in the selected window.");
        var viewport = document.Current.BoundingRectangle;
        var elements = document.FindAll(TreeScope.Descendants, Condition.TrueCondition);
        if (elements.Count > 5000)
            throw new Exception("This page is too complex for the prototype. Use a simpler quiz page.");
        var text = new StringBuilder();
        var choices = new List<AutomationElement>();
        foreach (AutomationElement element in elements) {
            var current = element.Current;
            var rect = current.BoundingRectangle;
            if (current.ControlType == ControlType.RadioButton) {
                if (current.IsOffscreen || rect.IsEmpty || !viewport.Contains(rect))
                    throw new Exception("Keep every answer choice fully visible. Pages with additional hidden questions are unsupported.");
                choices.Add(element);
            } else if (!current.IsOffscreen && !rect.IsEmpty && viewport.Contains(rect) &&
                current.ControlType == ControlType.Text && !String.IsNullOrWhiteSpace(current.Name)) {
                text.AppendLine(current.Name);
                if (text.Length > 24000) throw new Exception("Too much visible text. Zoom in on the question and choices.");
            }
        }
        if (choices.Count < 2 || choices.Count > 8)
            throw new Exception("Expected one question with 2 to 8 accessible radio-button choices. This layout is unsupported or incomplete.");
        choices.Sort(delegate(AutomationElement first, AutomationElement second) {
            var a = first.Current.BoundingRectangle;
            var b = second.Current.BoundingRectangle;
            int vertical = a.Top.CompareTo(b.Top);
            return vertical != 0 ? vertical : a.Left.CompareTo(b.Left);
        });
        var names = new List<string>();
        foreach (var choice in choices) {
            string name = choice.Current.Name.Trim();
            if (name.Length == 0 || name.Length > 3000)
                throw new Exception("An answer choice has no readable label. This quiz layout is unsupported.");
            names.Add(name);
        }
        if (text.Length < 5) throw new Exception("The question text is unavailable through Edge accessibility.");
        return new EdgeQuestion { text = text.ToString(), choices = names.ToArray() };
    }
}
