@echo off
REM Batch file to build 1Code on Windows
REM This will clone the repo to C:\Users\user\.github\1code and build there

echo ========================================
echo 1Code Windows Build Script
echo ========================================
echo.

set "REPO_PATH=C:\Users\user\.github\1code"

REM Step 1: Check if repository folder exists, if not clone it
if not exist "%REPO_PATH%" (
    echo Repository not found at %REPO_PATH%
    echo Cloning repository...
    echo.
    
    REM Create parent directory if it doesn't exist
    if not exist "C:\Users\user\.github" (
        mkdir "C:\Users\user\.github"
    )
    
    REM Check if git is installed
    where git >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: Git is not installed or not in PATH!
        echo Please install Git from https://git-scm.com/
        pause
        exit /b 1
    )
    
    REM Clone the repository
    git clone https://github.com/21st-dev/1code.git "%REPO_PATH%"
    if %errorlevel% neq 0 (
        echo ERROR: Failed to clone repository!
        pause
        exit /b %errorlevel%
    )
    echo Repository cloned successfully!
    echo.
) else (
    echo Repository found at %REPO_PATH%
    echo.
)

REM Step 2: Navigate to repository folder
cd /d "%REPO_PATH%"
echo Working directory: %CD%
echo.

REM Step 3: Check if bun is installed, if not install it
set "BUN_PATH=%USERPROFILE%\.bun\bin\bun.exe"
where bun >nul 2>&1
if %errorlevel% neq 0 (
    REM Check if bun exists in default installation location
    if exist "%BUN_PATH%" (
        set "PATH=%PATH%;%USERPROFILE%\.bun\bin"
        echo Bun found in default location, added to PATH for this session.
    ) else (
        echo Bun is not installed!
        echo Installing Bun...
        echo.
        
        REM Check if PowerShell is available
        where powershell >nul 2>&1
        if %errorlevel% neq 0 (
            echo ERROR: PowerShell is not available!
            echo Please install Bun manually from https://bun.sh/
            pause
            exit /b 1
        )
        
        REM Install Bun using PowerShell
        powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
        if %errorlevel% neq 0 (
            echo ERROR: Failed to install Bun!
            echo Please install Bun manually from https://bun.sh/
            pause
            exit /b %errorlevel%
        )
        
        REM Add Bun to PATH for this session
        if exist "%BUN_PATH%" (
            set "PATH=%PATH%;%USERPROFILE%\.bun\bin"
            echo Bun installed successfully!
        ) else (
            echo.
            echo WARNING: Bun installation may have completed, but executable not found.
            echo Please close this window and run the script again in a new terminal.
            echo Or manually add %USERPROFILE%\.bun\bin to your PATH.
            pause
            exit /b 1
        )
    )
)

REM Verify bun is now available
where bun >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%BUN_PATH%" (
        set "PATH=%PATH%;%USERPROFILE%\.bun\bin"
    ) else (
        echo ERROR: Bun is still not available after installation attempt!
        echo Please install Bun manually and ensure it's in your PATH.
        echo Download from: https://bun.sh/
        pause
        exit /b 1
    )
)

echo Bun found: 
bun --version
echo.

REM Step 4: Check if package.json exists
if not exist "package.json" (
    echo ERROR: package.json not found in %REPO_PATH%!
    echo Please make sure you're in the correct directory.
    pause
    exit /b 1
)

REM Step 5: Install dependencies
echo ========================================
echo Step 1: Installing dependencies...
echo ========================================
bun install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies!
    pause
    exit /b %errorlevel%
)
echo Dependencies installed successfully!
echo.

REM Step 6: Download Claude binary (if needed)
echo ========================================
echo Step 2: Downloading Claude binary...
echo ========================================
bun run claude:download
if %errorlevel% neq 0 (
    echo WARNING: Failed to download Claude binary, continuing anyway...
) else (
    echo Claude binary downloaded successfully!
)
echo.

REM Step 7: Build the application
echo ========================================
echo Step 3: Building application...
echo ========================================
bun run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    pause
    exit /b %errorlevel%
)
echo Build completed successfully!
echo.

REM Step 8: Package for Windows
echo ========================================
echo Step 4: Packaging for Windows...
echo ========================================
bun run package:win
if %errorlevel% neq 0 (
    echo ERROR: Windows packaging failed!
    pause
    exit /b %errorlevel%
)
echo.

REM Step 9: Show results and optionally launch
echo ========================================
echo Build completed successfully!
echo ========================================
echo.
echo Output location: %REPO_PATH%\release\win-unpacked
echo.

if exist "%REPO_PATH%\release\win-unpacked\1Code.exe" (
    echo SUCCESS: 1Code.exe found in release\win-unpacked folder!
    echo.
    
    REM Ask if user wants to copy and launch
    set /p LAUNCH="Do you want to copy to D:\1code and launch now? (Y/N): "
    if /i "%LAUNCH%"=="Y" (
        echo.
        echo Running update script...
        call "%~dp0update-1code.bat"
        exit /b 0
    ) else (
        echo.
        echo You can now:
        echo   1. Run update-1code.bat to copy and launch
        echo   2. Or run build-and-launch-1code.bat for everything
        echo   3. Or manually copy from %REPO_PATH%\release\win-unpacked
    )
) else (
    echo WARNING: 1Code.exe not found in expected location.
    echo Please check %REPO_PATH%\release\ folder for output files.
)

echo.
pause
