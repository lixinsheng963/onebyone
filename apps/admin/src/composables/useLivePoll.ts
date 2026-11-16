import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * A small, deliberately boring live-refresh loop:
 * - one request in flight at a time
 * - recursive setTimeout (never overlapping intervals)
 * - pauses while the tab is hidden
 * - exponential backoff after failures, then resets on success
 *
 * Pages use this only for read-only refreshes. A local dirty flag/form guard
 * must still be applied by any page that contains an editable form.
 */
export function useLivePoll(
  task: () => Promise<unknown> | unknown,
  intervalMs: number,
  options: { enabled?: () => boolean } = {}
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let failures = 0;
  const lastError = ref('');

  const schedule = (delay: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, Math.max(500, delay));
  };

  const run = async () => {
    if (stopped) return;
    if (options.enabled && !options.enabled()) {
      schedule(intervalMs);
      return;
    }
    if (document.hidden) {
      schedule(intervalMs);
      return;
    }
    if (running) return;
    running = true;
    try {
      await task();
      failures = 0;
      lastError.value = '';
      schedule(intervalMs);
    } catch (error) {
      failures += 1;
      lastError.value = error instanceof Error ? error.message : '刷新失败';
      schedule(Math.min(30_000, intervalMs * 2 ** Math.min(failures, 5)));
    } finally {
      running = false;
    }
  };

  const onVisibility = () => {
    if (!document.hidden) schedule(250);
  };

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility);
    schedule(250);
  });

  onBeforeUnmount(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return { refresh: run, lastError };
}
