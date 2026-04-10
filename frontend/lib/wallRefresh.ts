/** After add-to-wall, My Store refetches with retries (replica lag / navigation timing). */
export const WALL_EXPECT_REFRESH_KEY = 'qwerty_expect_wall_refresh';

export function markWallExpectRefresh(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(WALL_EXPECT_REFRESH_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}
