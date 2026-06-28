/**
 * 内存版滑动窗口限流器（按 IP 统计写入）。
 * 对于 2C2G 的目标机器来说已经足够。多实例场景请替换为 Redis。
 */

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(ip: string, maxPerWindow: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (bucket.count >= maxPerWindow) return false;
  bucket.count++;
  return true;
}

/** 定期清理过期的桶。启动时调用一次即可。 */
export function startRateLimitCleanup(intervalMs = 5 * 60_000) {
  setInterval(() => {
    const cutoff = Date.now() - intervalMs;
    for (const [ip, b] of buckets.entries()) {
      if (b.windowStart < cutoff) buckets.delete(ip);
    }
  }, intervalMs).unref();
}
