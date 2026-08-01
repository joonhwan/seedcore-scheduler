@echo off
rem ---------------------------------------------------------------------------
rem  SAM Scheduler - Windows release build (4 exe files + distribution zip)
rem
rem  ASCII ONLY. Do not put Korean (or any non-ASCII) text in this file.
rem  cmd.exe parses a batch file using the *console* code page (949 on a Korean
rem  Windows). A UTF-8 encoded Korean line does not merely display as mojibake --
rem  the multi-byte sequences swallow following characters and cmd.exe ends up
rem  trying to run a garbage token as a command:
rem      'e]' is not recognized as an internal or external command
rem  Node.js output is not affected (it writes wide chars to the console
rem  directly), so all Korean explanations live in the .js file instead.
rem
rem  This wrapper only calls the pnpm script. Build order, artifact verification
rem  and zip packaging all live in apps/api/scripts/build-exe.js -- see the
rem  Korean comments there for the reasoning. Artifact file names are
rem  deliberately NOT repeated here: one source of truth, one place to fix.
rem
rem  Output:
rem    dist-exe\      the 4 exe files + query engine dll + README.txt
rem    dist-release\  sam-scheduler-exe-<date>-<commit>.zip  (ship this one)
rem
rem  NOTE: stop the dev server (pnpm dev) first. nest holds dist\ open and
rem  Windows locks query_engine-windows.dll.node, which fails with EPERM.
rem  The same failure is documented in apps/api/scripts/postinstall.js.
rem ---------------------------------------------------------------------------

rem Run from this script's own directory (the repository root), so the result is
rem the same whether it is double-clicked or called from another folder.
cd /d "%~dp0"

call pnpm -F @sam/api build:exe
if errorlevel 1 (
  echo.
  echo [build-exe] BUILD FAILED - see the log above for the cause.
  exit /b 1
)

exit /b 0
