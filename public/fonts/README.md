# CampusSync Profile Fonts

The profile studio embeds compact Latin web-font subsets in Worker static assets. Japanese characters intentionally fall back to the system Japanese sans-serif stack.

- `sakura-pop-plump-v3.woff2`: Sakura Pop Plump V3, weight 800. Glyph outlines are expanded with a vector-offset pass for fuller central strokes. Basic Latin U+0020–U+007E. Rainbow coloring is CSS, not baked into the font. License: `LICENSE-COMFORTAA-OFL-1.1.txt` (Comfortaa-derived; renamed to avoid the reserved source name).
- `mainframe.woff2`: MainFrame, weight 500. Rounded-square digital display face with squared G and single-storey a/g. Basic Latin U+0020–U+007E. License: `LICENSE-MAINFRAME.txt`.
- `modern-campussync.woff2`: Comfortaa-derived geometric rounded face with single-storey a/g. License: `LICENSE-COMFORTAA-OFL-1.1.txt`.
- `thunder-riot.woff2`: DejaVu Sans Bold-derived display face with jagged contours. License notice: `LICENSE-BITSTREAM-VERA.txt`.

The legacy database value `marshmallow` remains accepted and renders as Sakura Pop for backwards compatibility. New selections save as `sakura-pop` or `mainframe`.

These fonts are embedded as application assets and are not offered for standalone sale.
