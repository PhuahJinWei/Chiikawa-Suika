PUT YOUR BALL DRAWINGS IN THIS FOLDER
=====================================

File names (smallest friend first, 10 in total):
  01.png  02.png  03.png  04.png  05.png  06.png  07.png  08.png  09.png  10.png

Until a file exists, the game draws a placeholder face for that ball, so you can add
them one at a time. Refresh the page to see new pictures.

Shocked faces (optional), shown for a moment when a friend is hit hard, shaken or flipped:
  01_shocked.png  02_shocked.png  ...  10_shocked.png
Draw them on the same circle as the usual face, so swapping the two doesn't move anything.
Without one, that friend keeps its usual face.

Drawing templates and a size guide are in the art-templates folder at the project root
(see art-templates/README.md).

Tips for the drawings
- Square PNG with a transparent background, e.g. 512 x 512 px.
- The circle touching the edges of the square is exactly the size the physics uses.
- Don't draw an outline: the game trims the picture to that circle and adds the same
  outline to every ball. Colour the body right out to the edge; the corners are cut off.
- Balls roll and rotate. If you prefer faces to always stay upright, turn on
  せってい > かおを まっすぐ.

Different file names or formats (e.g. .webp)? Change the `image` path of each ball in
src/config/tiers.ts. Names shown in the game are also set there.
