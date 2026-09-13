// Codex v2 atlas: retain the original artwork and its authored frame timings.
const durations: Record<number, number[]> = {
  0: [280,110,110,140,140,320],
  1: [120,120,120,120,120,120,120,220],
  2: [120,120,120,120,120,120,120,220],
  3: [140,140,140,280],
};
export function huajuanFrame(state: string, seconds: number, right: boolean) {
  // The existing atlas has no sleep row. Hold its closed-eye idle pose.
  if (state === 'sleep') return { row: 0, column: 1 };
  const row = state === 'walk' || state === 'chase' ? (right ? 1 : 2) : state === 'play' ? 3 : 0;
  const times = durations[row];
  let time = Math.max(0, seconds * 1000) % times.reduce((a,b) => a+b, 0);
  for (let column = 0; column < times.length; column++) {
    if (time < times[column]) return { row, column };
    time -= times[column];
  }
  return { row, column: 0 };
}
