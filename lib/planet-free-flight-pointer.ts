export type DirectionPointer = {
  onScreen: boolean;
  behind: boolean;
  /** Screen position in normalized device coordinates, only meaningful on screen. */
  x: number;
  y: number;
  /** Clockwise screen angle from "right" toward the target, in radians. */
  angle: number;
};

/** Where a target given in camera space (x right, y up, -z forward) appears to the pilot. */
export function getDirectionPointer(
  view: { x: number; y: number; z: number },
  verticalFovDegrees: number,
  aspect: number,
): DirectionPointer {
  const behind = view.z >= 0;
  const tanHalf = Math.tan(verticalFovDegrees * Math.PI / 360);
  const depth = Math.max(-view.z, 1e-12);
  const x = view.x / (depth * tanHalf * aspect);
  const y = view.y / (depth * tanHalf);
  const onScreen = !behind && Math.abs(x) <= 0.92 && Math.abs(y) <= 0.92;
  // Dead astern has no left/right preference, so point downward.
  const centred = Math.hypot(view.x, view.y) <= Math.abs(view.z) * 1e-6;
  const angle = centred ? Math.PI / 2 : Math.atan2(-view.y, view.x);
  return { onScreen, behind, x, y, angle };
}
