import type { BoundingBox, GridCell } from "@/lib/types";

/**
 * Subdivides a bounding box into a grid of cells each approximately
 * `stepDeg` degrees wide and tall. Iterates lat south-to-north,
 * lng west-to-east. Cell edges are clamped to the bounding box so no
 * cell exceeds the original bounds.
 */
export function generateGrid(bounds: BoundingBox, stepDeg: number): GridCell[] {
  const cells: GridCell[] = [];

  const latRange = bounds.north - bounds.south;
  const lngRange = bounds.east - bounds.west;

  const rowCount = Math.ceil(latRange / stepDeg);
  const colCount = Math.ceil(lngRange / stepDeg);

  let index = 0;

  for (let row = 0; row < rowCount; row++) {
    const cellSouth = bounds.south + row * stepDeg;
    const cellNorth = Math.min(bounds.south + (row + 1) * stepDeg, bounds.north);

    for (let col = 0; col < colCount; col++) {
      const cellWest = bounds.west + col * stepDeg;
      const cellEast = Math.min(bounds.west + (col + 1) * stepDeg, bounds.east);

      cells.push({
        bounds: {
          south: cellSouth,
          north: cellNorth,
          west: cellWest,
          east: cellEast,
        },
        index: index++,
      });
    }
  }

  return cells;
}

/**
 * Splits a single cell into 4 equal quadrants (2x2 subdivision).
 * All returned sub-cells have index -1; the caller is responsible
 * for reassigning indices.
 */
export function subdivideCell(cell: GridCell): GridCell[] {
  const { south, north, west, east } = cell.bounds;
  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;

  return [
    // SW quadrant
    { bounds: { south, north: midLat, west, east: midLng }, index: -1 },
    // SE quadrant
    { bounds: { south, north: midLat, west: midLng, east }, index: -1 },
    // NW quadrant
    { bounds: { south: midLat, north, west, east: midLng }, index: -1 },
    // NE quadrant
    { bounds: { south: midLat, north, west: midLng, east }, index: -1 },
  ];
}
