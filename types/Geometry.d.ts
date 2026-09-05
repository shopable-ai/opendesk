export {};

declare global {
  /** A point in the virtual desktop's logical screen coordinate space. */
  interface OpenDeskScreenPoint {
    x: number;
    y: number;
    coordinateSpace: "screen";
  }

  /** A non-empty region in the virtual desktop's logical screen coordinate space. */
  interface OpenDeskScreenRegion {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace: "screen";
  }

  type OpenDeskGeometryTarget = OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion;

  interface OpenDeskGeometryOffsetRegion {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  interface OpenDeskGeometryPercentRegion {
    /** Percentage in the inclusive 0–100 range. */
    left: number;
    /** Percentage in the inclusive 0–100 range. */
    top: number;
    /** Percentage in the inclusive 0–100 range. */
    width: number;
    /** Percentage in the inclusive 0–100 range. */
    height: number;
  }

  interface OpenDeskGeometryError extends Error {
    code: "INVALID_ARGUMENT";
    operation: string;
  }

  interface OpenDeskGeometry {
    rect(target: OpenDeskGeometryTarget): OpenDeskScreenRegion;
    center(target: OpenDeskGeometryTarget): OpenDeskScreenPoint;
    pointOffset(target: OpenDeskGeometryTarget, x: number, y: number): OpenDeskScreenPoint;
    pointPercent(target: OpenDeskGeometryTarget, xPercent: number, yPercent: number): OpenDeskScreenPoint;
    regionOffset(target: OpenDeskGeometryTarget, region: OpenDeskGeometryOffsetRegion): OpenDeskScreenRegion;
    regionPercent(target: OpenDeskGeometryTarget, region: OpenDeskGeometryPercentRegion): OpenDeskScreenRegion;
    contains(region: OpenDeskGeometryTarget, point: OpenDeskScreenPoint): boolean;
    intersect(regionA: OpenDeskGeometryTarget, regionB: OpenDeskGeometryTarget): OpenDeskScreenRegion | null;
  }

  var Geometry: OpenDeskGeometry;
}
