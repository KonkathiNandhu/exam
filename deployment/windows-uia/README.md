# Edge text-reading prototype

Requires Windows 10/11 x64 and Microsoft Edge. This is a compatibility prototype. Its native Edge reader is cross-compiled on macOS and has not been run on Windows yet.

1. Open an authorized practice quiz in Edge, with the question and all choices visible.
2. Double-click the portable AnswersLauncher.exe.
3. Click Start Exam, confirm authorization, then Select Edge window.
4. Choose the quiz window and click Refresh.

Press Ctrl+Alt+Enter to focus the overlay from another app, then press Enter to refresh. The launcher keeps the selected Edge window and reads its current tab. Delete or Backspace disconnects. The portable launcher closes on Disconnect and removes the runtime and profile it extracted into its own temporary folder. Closing the overlay also removes that folder.

The reader uses Windows UI Automation. It reads the selected Edge window only on Refresh, then checks the text again before showing the answer. No screen-sharing session, clipboard reading or screen image is used. The existing hosted server receives the visible text and ordered choices for processing.

The backend must have this prototype's text-input update deployed. It uses the existing session authentication and AI configuration. Servers requiring verified assessment origins reject this prototype because Windows accessibility cannot verify a page origin.

Initial support is limited to one question with 2–8 accessible radio-button choices. Image questions, canvas questions, hidden choices, multiple questions and inaccessible controls may be rejected. Visible text changes during processing also reject the result. After moving to another question, press Refresh to replace the displayed answer.

Company application controls or protected browser content can prevent the reader from working. The launcher reports the failure and does not change those controls. Use a company-authorized machine and assessment.

## Windows verification still required

- Select a quiz window and verify extraction on the intended assessment.
- Confirm the displayed option and text against the page.
- Change the question while processing and confirm the old answer is rejected.
- Close or minimize Edge and confirm a clear error.
- Disconnect during processing and confirm the answer clears.

The Electron and .NET runtimes are bundled. No Node.js, PowerShell script or separate .NET installation is required.

To build the native reader from source with a .NET 10 SDK, run `dotnet publish deployment/windows-uia/EdgeReader.csproj -c Release -o /path/to/output`. Place the resulting EdgeReader.exe alongside main.cjs in the launcher's resources/app folder.
