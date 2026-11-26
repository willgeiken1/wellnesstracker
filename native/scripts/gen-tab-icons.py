#!/usr/bin/env python3
"""Draws the system tab bar's images from design/icons/insight-icons.json.

The system bar (NativeTabs) takes pictures, not components, so each tab's icon is rendered here: a black glyph on
a clear background, which the bar tints. One 24-point icon at 1x, 2x and 3x (24, 48 and 72 pixels), plus the filled
twin the bar shows for the open tab. Needs cairosvg (pip install cairosvg). Run: python3 native/scripts/gen-tab-icons.py
"""
import json
from pathlib import Path

import cairosvg

ROOT = Path(__file__).resolve().parents[2]
ICONS = json.loads((ROOT / "design/icons/insight-icons.json").read_text())["icons"]
OUT = ROOT / "native/assets/images/navigation"
# File name (the tab's label in native/src/features/shell/tabs.ts) to the icon it shows.
TABS = {"home": "home", "workouts": "workouts", "food": "food", "progress": "progress", "routines": "routine"}

for tab, icon in TABS.items():
    for suffix, name in (("", icon), ("-selected", f"{icon}-active")):
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="#000">{ICONS[name]}</svg>'
        for scale in (1, 2, 3):
            target = OUT / f"{tab}{suffix}{'' if scale == 1 else f'@{scale}x'}.png"
            cairosvg.svg2png(bytestring=svg.encode(), write_to=str(target), output_width=24 * scale, output_height=24 * scale)
            print(target.relative_to(ROOT))
