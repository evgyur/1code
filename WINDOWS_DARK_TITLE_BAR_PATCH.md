# Windows Dark Title Bar Patch

This patch implements a dark title bar for Windows that matches the app's theme.

## What This Patch Does

1. **Removes Native Title Bar**: Uses frameless window (`frame: false`) on Windows to hide the white native title bar
2. **Custom Title Bar Component**: Creates a custom dark title bar with window controls (minimize, maximize, close)
3. **Theme Integration**: The custom title bar automatically matches the app's dark/light theme
4. **Menu Bar**: Hides the menu bar by default (press Alt to show)

## Files Modified

- `src/main/windows/main.ts` - Window creation with frameless mode
- `src/preload/index.ts` - Window control IPC handlers (already existed)
- `src/renderer/components/windows-title-bar.tsx` - **NEW** Custom title bar component
- `src/renderer/features/layout/agents-layout.tsx` - Added Windows title bar to layout
- `src/renderer/lib/themes/theme-provider.tsx` - Removed titleBarOverlay sync (not needed with frameless)
- `CLAUDE.md` - Updated build instructions
- `BUILD_WINDOWS.md` - Updated build instructions

## To Apply This Patch

```bash
# Make sure you're on the latest main branch
git checkout main
git pull origin main

# Apply the patch
git apply windows-dark-title-bar.patch

# If there are conflicts, resolve them and then:
git add -A
git commit -m "Add Windows dark title bar support"
```

## Manual Application (if patch fails)

If the patch doesn't apply cleanly, you can manually apply these changes:

### 1. Window Creation (`src/main/windows/main.ts`)

Add frameless window configuration:
```typescript
...(process.platform === "win32" && {
  frame: false, // Remove native title bar
  autoHideMenuBar: true, // Hide menu bar (user can press Alt to show)
}),
```

### 2. Create Title Bar Component (`src/renderer/components/windows-title-bar.tsx`)

Create the custom title bar component (see the file for full implementation).

### 3. Add to Layout (`src/renderer/features/layout/agents-layout.tsx`)

Import and add the title bar:
```typescript
import { WindowsTitleBar } from "../../components/windows-title-bar"

// In the return statement, add:
<WindowsTitleBar />
```

## Compatibility

This patch is designed to work with:
- Current version (0.0.19)
- Future versions (as long as the file structure remains similar)

The patch uses:
- Standard Electron APIs (`frame: false`, `autoHideMenuBar`)
- React component structure
- Existing IPC handlers for window controls

## Testing

After applying the patch:
1. Run `npm run build && npm run package`
2. Launch the app
3. Verify the title bar is dark when dark mode is enabled
4. Test window controls (minimize, maximize, close)
5. Test window dragging (drag by title bar area)

## Notes

- The menu bar is hidden by default. Press `Alt` to show it.
- The title bar automatically matches the app theme (dark/light)
- Window controls are functional and styled to match the theme
