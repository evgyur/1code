@echo off
REM Batch file to update and launch 1Code.exe

echo Starting update process...

REM Step 1: Preserve update-1code.bat if it exists
set "TEMP_BAT=%TEMP%\1code_update_backup.bat"
if exist "D:\1code\update-1code.bat" (
    echo Preserving update-1code.bat...
    copy /y "D:\1code\update-1code.bat" "%TEMP_BAT%" >nul
)

REM Step 2: Create destination folder if it doesn't exist
if not exist "D:\1code" (
    mkdir "D:\1code"
    echo Created D:\1code folder
)

REM Step 3: Copy the entire folder from Windows build location (overwrites existing files)
set "BUILD_PATH=C:\Users\user\.github\1code\release\win-unpacked"

echo Copying entire win-unpacked folder from build location...
echo Source: %BUILD_PATH%
echo Destination: D:\1code
echo.

REM Check if source exists
if not exist "%BUILD_PATH%" (
    echo ERROR: Build folder not found at %BUILD_PATH%
    echo Please run build-1code-windows.bat first to build the application!
    pause
    exit /b 1
)

REM Copy all files (overwrites existing)
robocopy "%BUILD_PATH%" "D:\1code" /E /IS /IT /R:0 /W:0 /NP /NFL /NDL

set COPY_ERROR=%errorlevel%
REM Robocopy returns 0-7 for success (0=no changes, 1=copied files, 2-7=extra files), 8+ for errors
REM We accept 0-7 as success since symlinks may fail but files should copy
if %COPY_ERROR% leq 7 (
    echo Copy completed (exit code: %COPY_ERROR% - some symlinks may have been skipped)
) else (
    echo WARNING: Some files may have failed to copy (exit code: %COPY_ERROR%)
    echo Continuing anyway - checking if 1Code.exe exists...
)

REM Step 4: Restore update-1code.bat if it was preserved
if exist "%TEMP_BAT%" (
    echo Restoring update-1code.bat...
    copy /y "%TEMP_BAT%" "D:\1code\update-1code.bat" >nul
    del /q "%TEMP_BAT%" >nul 2>&1
)

REM Step 5: Verify 1Code.exe exists and start the application
echo Checking for 1Code.exe...
if exist "D:\1code\1Code.exe" (
    echo Found 1Code.exe, starting application...
    start "" "D:\1code\1Code.exe"
    echo Application started!
) else (
    echo ERROR: 1Code.exe not found in D:\1code!
    echo Please check if the copy operation completed successfully.
    dir "D:\1code" /b
    pause
    exit /b 1
)

echo.
echo Update completed successfully!
timeout /t 3 >nul
