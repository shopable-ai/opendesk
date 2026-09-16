/* Bounded Frozen-Snapshot visual fixture. Not AX/UIA and not a Native provider. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeasureVisual = api;
})(globalThis, function () {
  'use strict';
  const DEFAULTS = Object.freeze({
    version: 'visual-roi/v1', throttleMs: 64, minMove: 7,
    roiWidth: 768, roiHeight: 384, maxVisited: 60000,
    maxArea: 50000, maxAreaRatio: .50, minSide: 12, minFillRatio: .70,
    maxDurationMs: 12, maxCacheEntries: 8, minAlpha: 255,
  });
  const copy = x => x == null ? x : structuredClone(x);
  const inside = (p, r) => p && r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const similar = (a, b, tolerance) => !!(a && b && a[3] === b[3]
    && (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2 <= 3*tolerance*tolerance);

  function create(options = {}, clock = () => performance.now()) {
    const config = Object.freeze({...DEFAULTS, ...options});
    for (const key of ['roiWidth','roiHeight','maxVisited','maxArea','maxCacheEntries','minSide']) {
      if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new RangeError(key);
    }
    if (config.roiWidth * config.roiHeight > 1048576 || config.maxVisited > 1048576
      || !Number.isFinite(config.maxDurationMs) || config.maxDurationMs <= 0
      || !Number.isFinite(config.minFillRatio) || !Number.isFinite(config.maxAreaRatio)
      || !Number.isFinite(config.minMove) || config.minMove < 0
      || !Number.isFinite(config.throttleMs) || config.throttleMs < 16
      || config.minAlpha !== 255 || config.minFillRatio <= 0 || config.minFillRatio > 1
      || config.maxAreaRatio <= 0 || config.maxAreaRatio >= 1) throw new RangeError('unsafe visual budget');
    let source = null, cache = [], miss = null;
    const stats = {visualResolveCount: 0, visualCacheHit: 0, visualCacheMiss: 0,
      floodFillRuns: 0, maxPixelsVisited: 0, maxResolveMs: 0, rejections: {}};
    function reset(next = null) {
      if (next && (!next.snapshotId || !next.image || !Number.isSafeInteger(next.image.width) || !Number.isSafeInteger(next.image.height) || next.image.width <= 0 || next.image.height <= 0
        || next.image.data.length !== next.image.width * next.image.height * 4
        || !next.origin || !next.referenceBounds
        || !['x','y'].every(k => Number.isFinite(next.origin[k]))
        || !['x','y','width','height'].every(k => Number.isFinite(next.referenceBounds[k]))
        || next.referenceBounds.width <= 0 || next.referenceBounds.height <= 0)) throw new TypeError('invalid frozen source');
      source = next; cache = []; miss = null;
    }
    function seedAt(point) {
      if (!source || !inside(point, source.referenceBounds)) return null;
      const x = Math.floor(point.x-source.origin.x), y = Math.floor(point.y-source.origin.y);
      const {width, height, data} = source.image;
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      return Array.from(data.slice((y*width+x)*4, (y*width+x)*4+4));
    }
    function reuse(point, tolerance) {
      const seed = seedAt(point);
      if (!seed) return {hit: false, candidate: null};
      const found = cache.find(entry => entry.tolerance === tolerance
        && inside(point, entry.candidate.rect) && similar(seed, entry.seed, tolerance));
      if (found) { stats.visualCacheHit++; return {hit: true, candidate: copy(found.candidate)}; }
      // Negative caching is only local to the failed seed, never to a whole window.
      if (miss && miss.tolerance === tolerance && distance(point, miss.point) < config.minMove
        && similar(seed, miss.seed, tolerance)) {
        stats.visualCacheHit++; return {hit: true, candidate: null};
      }
      stats.visualCacheMiss++;
      return {hit: false, candidate: null};
    }
    function resolve(point, tolerance = 8, isCurrent = () => true) {
      if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 64) throw new RangeError('color tolerance');
      if (!source || !isCurrent()) return null;
      const reused = reuse(point, tolerance);
      if (reused.hit) return reused.candidate;
      const seed = seedAt(point);
      if (!seed) return null;
      const start = clock();
      let visited = 0;
      function reject(reason) {
        stats.rejections[reason] = (stats.rejections[reason] || 0) + 1;
        stats.maxPixelsVisited = Math.max(stats.maxPixelsVisited, visited);
        stats.maxResolveMs = Math.max(stats.maxResolveMs, clock()-start);
        if (reason !== 'cancelled') miss = {point: {...point}, seed, tolerance};
        return null;
      }
      stats.visualResolveCount++;
      if (seed[3] < config.minAlpha) return reject('transparent');
      const {image, origin, referenceBounds: ref, snapshotId} = source;
      const {width, height, data} = image;
      const sx = Math.floor(point.x-origin.x), sy = Math.floor(point.y-origin.y);
      const left = Math.max(0, Math.ceil(ref.x-origin.x), sx-Math.floor(config.roiWidth/2));
      const top = Math.max(0, Math.ceil(ref.y-origin.y), sy-Math.floor(config.roiHeight/2));
      const right = Math.min(width, Math.floor(ref.x+ref.width-origin.x), left+config.roiWidth);
      const bottom = Math.min(height, Math.floor(ref.y+ref.height-origin.y), top+config.roiHeight);
      const rw = right-left, rh = bottom-top;
      if (rw <= 0 || rh <= 0 || sx < left || sx >= right || sy < top || sy >= bottom) return reject('outside-roi');
      // Allocation is bounded by ROI, not by desktop/window dimensions.
      const seen = new Uint8Array(rw*rh);
      const queue = new Int32Array(Math.min(config.maxVisited, rw*rh));
      let head = 0, tail = 1, count = 0, failure = '', minX = sx, maxX = sx, minY = sy, maxY = sy;
      queue[0] = (sy-top)*rw+sx-left; seen[queue[0]] = 1; visited = 1;
      stats.floodFillRuns++;
      function enqueue(x, y) {
        if (x < left || x >= right || y < top || y >= bottom || failure) return;
        const i = (y-top)*rw+x-left;
        if (seen[i]) return;
        if (visited >= config.maxVisited) { failure = 'pixel-budget'; return; }
        seen[i] = 1; visited++;
        const j = (y*width+x)*4;
        if (data[j+3] < config.minAlpha) return;
        const d = (data[j]-seed[0])**2 + (data[j+1]-seed[1])**2 + (data[j+2]-seed[2])**2;
        if (d > 3*tolerance*tolerance) return;
        if (tail >= queue.length) { failure = 'pixel-budget'; return; }
        queue[tail++] = i;
      }
      while (head < tail && !failure) {
        if ((head & 255) === 0) {
          if (!isCurrent() || !source || source.snapshotId !== snapshotId) return reject('cancelled');
          if (clock()-start > config.maxDurationMs) return reject('time-budget');
        }
        const i = queue[head++], x = left+i%rw, y = top+Math.floor(i/rw);
        // Truncated component/whole-background is not a reliable rectangle.
        if (x === left || x === right-1 || y === top || y === bottom-1) return reject('open-boundary');
        count++; minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y);
        const boxArea = (maxX-minX+1)*(maxY-minY+1);
        if (boxArea > config.maxArea || boxArea > ref.width*ref.height*config.maxAreaRatio) return reject('area-budget');
        enqueue(x-1,y); enqueue(x+1,y); enqueue(x,y-1); enqueue(x,y+1);
      }
      if (failure) return reject(failure);
      if (!isCurrent()) return reject('cancelled');
      const rect = {x: origin.x+minX, y: origin.y+minY, width: maxX-minX+1, height: maxY-minY+1};
      const fill = count/(rect.width*rect.height);
      if (rect.width < config.minSide || rect.height < config.minSide || fill < config.minFillRatio) return reject('irregular-or-small');
      const elapsedMs = clock()-start;
      if (elapsedMs > config.maxDurationMs) return reject('time-budget');
      const candidate = {
        id: `visual-${snapshotId}-${minX}-${minY}-${rect.width}-${rect.height}`, label: '颜色区域', rect,
        parentId: null, role: null, provider: 'pixel-region-growing', reliability: 'estimated-not-semantic',
        semantic: false, state: 'preview', snapshotId,
        evidence: {prototypeOnly: true, algorithm: config.version, tolerance, colorMetric: 'rgb-rms', connectivity: 4,
          roi: {x: origin.x+left, y: origin.y+top, width: rw, height: rh}, pixels: count, visited,
          boundingBoxFillRatio: fill, elapsedMs},
      };
      stats.maxPixelsVisited = Math.max(stats.maxPixelsVisited, visited);
      stats.maxResolveMs = Math.max(stats.maxResolveMs, elapsedMs);
      cache = [{candidate: copy(candidate), seed, tolerance}, ...cache.filter(e => e.candidate.id !== candidate.id)]
        .sort((a,b) => a.candidate.rect.width*a.candidate.rect.height-b.candidate.rect.width*b.candidate.rect.height)
        .slice(0, config.maxCacheEntries);
      miss = null;
      return candidate;
    }
    return {config, stats, reset, reuse, resolve, seedAt};
  }
  return Object.freeze({DEFAULTS, create, similar});
});
