# Ball drawing templates

Guides for drawing the 10 ball pictures that go in `public/balls/01.png` … `10.png`.
This folder is not part of the game build.

| File | Use it for |
| --- | --- |
| `ball-template.png` | Every ball. 1024×1024, transparent. The image's edges are the ball's edge in the game (what bumps). The brown ring is the outline the game draws on every ball. |
| `size-guide.png` | How big each ball really is next to the others, and roughly how many pixels wide it shows on a phone. |

## How to use

1. Open a template in your drawing app as the bottom layer, and draw on layers above it.
2. **Don't draw an outline.** The game trims your picture to the ball's circle and adds the same
   hand-drawn outline to every ball (the brown ring). Colour the character's body out to at
   least the dashed pink line (the ring covers the rest), and keep faces inside it. The faint
   lines mark the centre, an eye line and a mouth line, as a starting point.
3. Hide the template layer, then export a transparent PNG. Any size works (512×512 is plenty);
   keep it square and keep the circle where the template put it.
4. Save it as `public/balls/NN.png` and refresh the game.
5. Optional: draw a shocked face on the same circle and save it as `public/balls/NN_shocked.png`.
   The game swaps to it for a moment when the friend is hit hard, shaken or flipped.

## Tips

- **Small balls are tiny on a phone.** Ball 01 is only about 25 px wide on screen. Give the
  small balls big, simple features (dot eyes, small blush, bold lines), or the details will
  disappear. Big balls (08–10) can take finer detail.
- **Anything outside the circle is cut off** in the game, so there's no need to tidy the corners.
- **Balls roll.** Faces will be seen sideways and upside down, unless the player turns on
  せってい > かおを まっすぐ.

## Regenerating

If you change ball sizes or names in `src/config/tiers.ts`, rebuild the size guide (Windows
PowerShell, from the project folder):

```powershell
.\art-templates\make-size-guide.ps1 -TiersFile .\src\config\tiers.ts -OutFile .\art-templates\size-guide.png
```

`make-templates.ps1 -OutDir .\art-templates` rebuilds the drawing template.
