# Demo GIF plan

A finished GIF is **not** included — it must come from a real screen recording of the extension
running (fabricating one would misrepresent the product). This is the complete recipe.

## Storyboard (4 beats, ~12 s total)

| # | Duration | On screen |
| --- | --- | --- |
| 1 | 2 s | Explorer shows a small project folder; `robot.bbmodel` visible. Cursor moves to it. |
| 2 | 2.5 s | Right-click → context menu open; cursor highlights **Extract BBModel Contents**. Hold ~1 s so viewers can read it. |
| 3 | 3 s | Click. Progress notification ("Extracting robot.bbmodel — Converting geometry…") plays; success toast appears with **Open Folder**. |
| 4 | 4.5 s | `robot_extracted/` expands in the Explorer: `bedrock/`, `textures/`. Click `bedrock/geometry.json`, show the JSON for a beat; end on `textures/robot.png` preview. Cut. |

Loop cleanly: end state (folder expanded) → cut back to beat 1 works fine since the mouse starts
near the same file.

## Recording setup

- **Window size:** set the VS Code window to exactly **1280×800** (`Developer: Toggle Screencast
  Mode` optional but nice — it shows clicks). Use the default Dark Modern theme, zoom level +1
  (`Ctrl+=` once) so text is legible when scaled down.
- **Capture region:** the VS Code window only — never the whole desktop (avoids leaking personal
  items). Close unrelated sidebars/panels; hide the status bar clutter if you like
  (`workbench.statusBar.visible: false`).
- **Recorder:** anything that outputs MP4/MKV — OBS Studio (free, all platforms), or Windows
  Game Bar (`Win+Alt+R`). Record at 30 fps; the GIF will be downsampled to 12–15 fps.
- Use the fixture `animated_bot.bbmodel` (rename to `robot.bbmodel` for the demo if you want a
  friendlier name).

## Converting to GIF with FFmpeg

Two-pass palette conversion gives small, clean GIFs:

```bash
ffmpeg -i demo.mp4 -vf "fps=14,crop=1280:800:0:0,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" -y palette.png
```

```bash
ffmpeg -i demo.mp4 -i palette.png -filter_complex "fps=14,crop=1280:800:0:0,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -y demo.gif
```

- Adjust `crop=W:H:X:Y` if your recording includes any margin.
- Target: **960 px wide, 14 fps, ≤ 10 s, under ~4 MB** (README-friendly). If it's heavy, drop to
  `scale=800:-1` or `fps=12` before sacrificing duration.
- Trim start/end first if needed: add `-ss 0.8 -t 11` after the first `-i demo.mp4` in **both**
  commands.
- Optional final squeeze: `gifsicle -O3 --lossy=40 demo.gif -o demo.min.gif`.

Put the result at `media/demo.gif` and embed it near the top of the README:

```markdown
![Right-clicking a .bbmodel file and extracting its contents](media/demo.gif)
```

(If you publish to the Marketplace, the image must be reachable — either committed to the repo
with a raw GitHub URL or shipped in the package.)

## Accessibility

- **Alt text:** `Screen recording of Visual Studio Code: the user right-clicks a file named
  robot.bbmodel in the Explorer, chooses "Extract BBModel Contents", a progress notification
  completes, and a robot_extracted folder appears containing bedrock JSON files and a decoded
  texture.`
- Keep at least ~1 s of stillness on each readable state (menu open, success toast, final tree)
  so the loop is parseable without pausing.
- Don't rely on color alone — the storyboard's information is structural (menus, filenames), so
  it reads fine in grayscale.
- Consider also committing the source MP4 (`media/demo.mp4`); videos allow pausing and are more
  screen-reader-tool friendly than GIFs, and GitHub renders MP4s in READMEs too.
