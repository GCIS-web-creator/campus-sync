# CampusSync Profile Studio Effects

This integration adds the four uploaded bundles as additive profile features.

- Photo-library and camera uploads: JPEG, PNG and WebP sources (up to 10 MB), client-side crop/resize to WebP (avatar 512×512, banner 1200×500, output up to 2 MB).
- Uploaded profile images are stored in a private `profile-images` bucket. The Next.js routes create signed upload URLs and only issue view URLs for the owner or for the exact image attached to a public profile.
- The legacy `avatar_url` and `banner_url` fields remain supported. The new `avatar_path` and `banner_path` fields are additive.
- Name appearance supports up to eight custom gradient stops, angle, outline, shadow, glow, weight and spacing.
- The 22 V1/V2/V3 theme effects are catalogued for avatar and banner preview. The source bundles mark their unlock IDs as `null`; no achievement mapping or unlock grant is invented, and the database rejects saving any of these items until a real unlock row is explicitly granted.
- Existing achievement badge IDs and thresholds are unchanged. Their badge chips now render local SVG files.
- Animations pause when off-screen, can be manually paused, use reduced particle counts on small screens and honor `prefers-reduced-motion`.

The new SQL migration is additive and preserves existing profile fields, user rows, RLS and unlock history.
