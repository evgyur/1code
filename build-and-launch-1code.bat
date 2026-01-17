@echo off
REM Master batch file that does everything: builds, copies, and launches 1Code
REM This script handles the complete workflow automatically

echo ========================================
echo 1Code - Complete Build and Launch
echo ========================================
echo This script will:
echo   1. Clone repository (if needed)
echo   2. Install Bun (if needed)
echo   3. Build the application
echo   4. Copy to D:\1code
echo   5. Launch the application
echo ========================================
echo.

set "REPO_PATH=C:\Users\user\.github\1code"
set "BUILD_PATH=%REPO_PATH%\release\win-unpacked"
set "DEST_PATH=D:\1code"

REM ========================================
REM STEP 1: Setup Repository
REM ========================================
echo [1/5] Checking repository...
if not exist "%REPO_PATH%" (
    echo Repository not found. Cloning...
    
    REM Create parent directory if it doesn't exist
    if not exist "C:\Users\user\.github" (
        mkdir "C:\Users\user\.github"
    )
    
    REM Check if git is installed
    where git >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: Git is not installed!
        echo Please install Git from https://git-scm.com/
        pause
        exit /b 1
    )
    
    git clone https://github.com/21st-dev/1code.git "%REPO_PATH%"
    if %errorlevel% neq 0 (
        echo ERROR: Failed to clone repository!
        pause
        exit /b %errorlevel%
    )
    echo Repository cloned successfully!
) else (
    echo Repository found at %REPO_PATH%
)
echo.

REM ========================================
REM STEP 2: Setup Bun
REM ========================================
echo [2/5] Checking Bun installation...
set "BUN_PATH=%USERPROFILE%\.bun\bin\bun.exe"
where bun >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%BUN_PATH%" (
        set "PATH=%PATH%;%USERPROFILE%\.bun\bin"
        echo Bun found in default location.
    ) else (
        echo Bun not found. Installing...
        
        where powershell >nul 2>&1
        if %errorlevel% neq 0 (
            echo ERROR: PowerShell is not available!
            pause
            exit /b 1
        )
        
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
        if %errorlevel% neq 0 (
            echo ERROR: Failed to install Bun!
            pause
            exit /b %errorlevel%
        )
        
        if exist "%BUN_PATH%" (
            set "PATH=%PATH%;%USERPROFILE%\.bun\bin"
            echo Bun installed successfully!
        ) else (
            echo ERROR: Bun installation failed!
            pause
            exit /b 1
        )
    )
)

REM Verify bun is available
where bun >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%BUN_PATH%" (
        set "PATH=%PATH%;%USERPROFILE%\.bun\bin"
    ) else (
        echo ERROR: Bun is not available!
        pause
        exit /b 1
    )
)

bun --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Bun verification failed!
    pause
    exit /b 1
)
echo Bun is ready!
echo.

REM ========================================
REM STEP 3: Build Application
REM ========================================
echo [3/5] Building application...
cd /d "%REPO_PATH%"

if not exist "package.json" (
    echo ERROR: package.json not found!
    pause
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
bun install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b %errorlevel%
)
echo Dependencies installed!
echo.

REM Download Claude binary
echo Downloading Claude binary...
bun run claude:download >nul 2>&1
if %errorlevel% equ 0 (
    echo Claude binary ready!
) else (
    echo Warning: Claude binary download skipped (may already exist)
)
echo.

REM Build
echo Building application...
bun run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b %errorlevel%
)
echo Build completed!
echo.

REM Package for Windows
echo Packaging for Windows...
bun run package:win
if %errorlevel% neq 0 (
    echo ERROR: Packaging failed!
    pause
    exit /b %errorlevel%
)
echo Packaging completed!
echo.

REM Verify build output
if not exist "%BUILD_PATH%\1Code.exe" (
    echo ERROR: Build output not found at %BUILD_PATH%\1Code.exe
    pause
    exit /b 1
)
echo Build verified: 1Code.exe found!
echo.

REM ========================================
REM STEP 4: Copy to D:\1code
REM ========================================
echo [4/5] Copying to D:\1code...

REM Preserve update-1code.bat if it exists
set "TEMP_BAT=%TEMP%\1code_update_backup.bat"
if exist "%DEST_PATH%\update-1code.bat" (
    copy /y "%DEST_PATH%\update-1code.bat" "%TEMP_BAT%" >nul
)

REM Create destination folder if it doesn't exist
if not exist "%DEST_PATH%" (
    mkdir "%DEST_PATH%"
)

REM Copy all files
echo Copying files...
robocopy "%BUILD_PATH%" "%DEST_PATH%" /E /IS /IT /R:0 /W:0 /NP /NFL /NDL >nul

set COPY_ERROR=%errorlevel%
if %COPY_ERROR% gtr 7 (
    echo WARNING: Some files may have failed to copy (exit code: %COPY_ERROR%)
    echo Continuing anyway...
) else (
    echo Copy completed successfully!
)

REM Restore update-1code.bat if it was preserved
if exist "%TEMP_BAT%" (
    copy /y "%TEMP_BAT%" "%DEST_PATH%\update-1code.bat" >nul
    del /q "%TEMP_BAT%" >nul 2>&1
)
echo.

REM ========================================
REM STEP 5: Launch Application
REM ========================================
echo [5/5] Launching application...

if exist "%DEST_PATH%\1Code.exe" (
    echo Starting 1Code.exe...
    start "" "%DEST_PATH%\1Code.exe"
    echo.
    echo ========================================
    echo SUCCESS! Application launched!
    echo ========================================
    echo.
    echo Build location: %BUILD_PATH%
    echo Application location: %DEST_PATH%
    echo.
) else (
    echo ERROR: 1Code.exe not found at %DEST_PATH%!
    echo Please check the build output.
    pause
    exit /b 1
)

timeout /t 2 >nul
exit /b 0
