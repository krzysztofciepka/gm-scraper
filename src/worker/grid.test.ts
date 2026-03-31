import { describe, it, expect } from "vitest";
import { generateGrid, subdivideCell } from "@/worker/grid";
import type { BoundingBox, GridCell } from "@/lib/types";

const WARSAW: BoundingBox = {
  north: 52.4,
  south: 52.1,
  east: 21.2,
  west: 20.8,
};

describe("generateGrid", () => {
  it("returns cells that fully cover the bounding box", () => {
    const cells = generateGrid(WARSAW, 0.1);

    // Southernmost cell starts at south boundary
    const southEdge = Math.min(...cells.map((c) => c.bounds.south));
    expect(southEdge).toBe(WARSAW.south);

    // Northernmost cell ends at north boundary
    const northEdge = Math.max(...cells.map((c) => c.bounds.north));
    expect(northEdge).toBe(WARSAW.north);

    // Westernmost cell starts at west boundary
    const westEdge = Math.min(...cells.map((c) => c.bounds.west));
    expect(westEdge).toBe(WARSAW.west);

    // Easternmost cell ends at east boundary
    const eastEdge = Math.max(...cells.map((c) => c.bounds.east));
    expect(eastEdge).toBe(WARSAW.east);
  });

  it("no cell exceeds the bounding box edges", () => {
    const cells = generateGrid(WARSAW, 0.15);
    for (const cell of cells) {
      expect(cell.bounds.south).toBeGreaterThanOrEqual(WARSAW.south);
      expect(cell.bounds.north).toBeLessThanOrEqual(WARSAW.north);
      expect(cell.bounds.west).toBeGreaterThanOrEqual(WARSAW.west);
      expect(cell.bounds.east).toBeLessThanOrEqual(WARSAW.east);
    }
  });

  it("smaller step produces more cells", () => {
    const coarse = generateGrid(WARSAW, 0.2);
    const fine = generateGrid(WARSAW, 0.1);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });

  it("assigns sequential indices starting at 0", () => {
    const cells = generateGrid(WARSAW, 0.1);
    cells.forEach((cell, i) => {
      expect(cell.index).toBe(i);
    });
  });

  it("produces correct cell count for evenly divisible bounds", () => {
    const bounds: BoundingBox = { north: 1.0, south: 0.0, east: 1.0, west: 0.0 };
    const cells = generateGrid(bounds, 0.5);
    // 2 rows x 2 cols = 4 cells
    expect(cells.length).toBe(4);
  });

  it("iterates lat south-to-north, lng west-to-east (row-major order)", () => {
    const bounds: BoundingBox = { north: 1.0, south: 0.0, east: 1.0, west: 0.0 };
    const cells = generateGrid(bounds, 0.5);
    // cell 0: south row, west col
    expect(cells[0].bounds.south).toBeCloseTo(0.0);
    expect(cells[0].bounds.west).toBeCloseTo(0.0);
    // cell 1: south row, east col
    expect(cells[1].bounds.south).toBeCloseTo(0.0);
    expect(cells[1].bounds.west).toBeCloseTo(0.5);
    // cell 2: north row, west col
    expect(cells[2].bounds.south).toBeCloseTo(0.5);
    expect(cells[2].bounds.west).toBeCloseTo(0.0);
    // cell 3: north row, east col
    expect(cells[3].bounds.south).toBeCloseTo(0.5);
    expect(cells[3].bounds.west).toBeCloseTo(0.5);
  });

  it("handles bounds where step does not evenly divide the range (last cell clamped)", () => {
    const bounds: BoundingBox = { north: 1.0, south: 0.0, east: 1.0, west: 0.0 };
    const cells = generateGrid(bounds, 0.3);
    // ceil(1/0.3) = 4 rows * 4 cols = 16 cells, last cells clamped to 1.0
    expect(cells.length).toBe(16);
    const northEdge = Math.max(...cells.map((c) => c.bounds.north));
    expect(northEdge).toBe(1.0);
    const eastEdge = Math.max(...cells.map((c) => c.bounds.east));
    expect(eastEdge).toBe(1.0);
  });
});

describe("subdivideCell", () => {
  const parent: GridCell = {
    bounds: { north: 2.0, south: 0.0, east: 2.0, west: 0.0 },
    index: 5,
  };

  it("returns exactly 4 sub-cells", () => {
    const subs = subdivideCell(parent);
    expect(subs.length).toBe(4);
  });

  it("all sub-cells have index -1", () => {
    const subs = subdivideCell(parent);
    subs.forEach((s) => expect(s.index).toBe(-1));
  });

  it("sub-cells are half the size in both dimensions", () => {
    const subs = subdivideCell(parent);
    const parentLatSpan = parent.bounds.north - parent.bounds.south;
    const parentLngSpan = parent.bounds.east - parent.bounds.west;
    for (const s of subs) {
      const latSpan = s.bounds.north - s.bounds.south;
      const lngSpan = s.bounds.east - s.bounds.west;
      expect(latSpan).toBeCloseTo(parentLatSpan / 2);
      expect(lngSpan).toBeCloseTo(parentLngSpan / 2);
    }
  });

  it("sub-cells collectively cover the parent exactly", () => {
    const subs = subdivideCell(parent);
    expect(Math.min(...subs.map((s) => s.bounds.south))).toBeCloseTo(parent.bounds.south);
    expect(Math.max(...subs.map((s) => s.bounds.north))).toBeCloseTo(parent.bounds.north);
    expect(Math.min(...subs.map((s) => s.bounds.west))).toBeCloseTo(parent.bounds.west);
    expect(Math.max(...subs.map((s) => s.bounds.east))).toBeCloseTo(parent.bounds.east);
  });

  it("produces 4 distinct quadrants with no gaps or overlaps", () => {
    const subs = subdivideCell(parent);
    const midLat = (parent.bounds.south + parent.bounds.north) / 2;
    const midLng = (parent.bounds.west + parent.bounds.east) / 2;

    // Each sub-cell must have north > south and east > west
    for (const s of subs) {
      expect(s.bounds.north).toBeGreaterThan(s.bounds.south);
      expect(s.bounds.east).toBeGreaterThan(s.bounds.west);
    }

    // One sub-cell should occupy each quadrant
    const swCell = subs.find(
      (s) => s.bounds.south === parent.bounds.south && s.bounds.west === parent.bounds.west
    );
    expect(swCell).toBeDefined();
    expect(swCell!.bounds.north).toBeCloseTo(midLat);
    expect(swCell!.bounds.east).toBeCloseTo(midLng);

    const neCell = subs.find(
      (s) => s.bounds.north === parent.bounds.north && s.bounds.east === parent.bounds.east
    );
    expect(neCell).toBeDefined();
    expect(neCell!.bounds.south).toBeCloseTo(midLat);
    expect(neCell!.bounds.west).toBeCloseTo(midLng);
  });
});
