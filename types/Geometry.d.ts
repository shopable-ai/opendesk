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

  type OpenDeskGeometryHorizontalEdges =
    | { left: number; width: number; right?: never }
    | { right: number; width: number; left?: never }
    | { left: number; right: number; width?: never };

  type OpenDeskGeometryVerticalEdges =
    | { top: number; height: number; bottom?: never }
    | { bottom: number; height: number; top?: never }
    | { top: number; bottom: number; height?: never };

  /** Exactly two horizontal and exactly two vertical edge constraints. */
  type OpenDeskGeometryEdgeRegion = OpenDeskGeometryHorizontalEdges & OpenDeskGeometryVerticalEdges;

  interface OpenDeskGeometryInsets {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }

  type OpenDeskGeometryInset = number | OpenDeskGeometryInsets;

  type OpenDeskGeometryAnchorPosition =
    | "top-left"
    | "top-center"
    | "top-right"
    | "center-left"
    | "center"
    | "center-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";

  interface OpenDeskGeometryAnchorOptions {
    inset?: OpenDeskGeometryInset;
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
    regionByEdges(target: OpenDeskGeometryTarget, options: OpenDeskGeometryEdgeRegion): OpenDeskScreenRegion;
    inset(target: OpenDeskGeometryTarget, margins: OpenDeskGeometryInset): OpenDeskScreenRegion;
    anchorPoint(
      target: OpenDeskGeometryTarget,
      position: OpenDeskGeometryAnchorPosition,
      options?: OpenDeskGeometryAnchorOptions,
    ): OpenDeskScreenPoint;
    contains(region: OpenDeskGeometryTarget, point: OpenDeskScreenPoint): boolean;
    intersect(regionA: OpenDeskGeometryTarget, regionB: OpenDeskGeometryTarget): OpenDeskScreenRegion | null;
  }

  var Geometry: OpenDeskGeometry;
}
