import { Cell, CellStatus } from '../types';

export const createEmptyGrid = (size: number): Cell[][] => {
  const grid: Cell[][] = [];
  for (let r = 0; r < size; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < size; c++) {
      row.push({
        row: r,
        col: c,
        isMine: false,
        status: CellStatus.HIDDEN,
        neighborMines: 0,
      });
    }
    grid.push(row);
  }
  return grid;
};

export const placeMines = (
  grid: Cell[][],
  mineCount: number,
  safeRow: number,
  safeCol: number
): Cell[][] => {
  const size = grid.length;
  let minesPlaced = 0;
  const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));

  while (minesPlaced < mineCount) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);

    // Ensure we don't place a mine on the first clicked cell or its immediate neighbors
    // to guarantee a solvable start.
    const isSafeZone =
      Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1;

    if (!newGrid[r][c].isMine && !isSafeZone) {
      newGrid[r][c].isMine = true;
      minesPlaced++;
    }
  }

  // Calculate numbers
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!newGrid[r][c].isMine) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (
              nr >= 0 &&
              nr < size &&
              nc >= 0 &&
              nc < size &&
              newGrid[nr][nc].isMine
            ) {
              count++;
            }
          }
        }
        newGrid[r][c].neighborMines = count;
      }
    }
  }

  return newGrid;
};

export const revealCell = (
  grid: Cell[][],
  row: number,
  col: number
): { grid: Cell[][]; exploded: boolean; firstMove?: boolean } => {
  const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
  const cell = newGrid[row][col];

  if (cell.status !== CellStatus.HIDDEN) {
    return { grid: newGrid, exploded: false };
  }

  if (cell.isMine) {
    cell.status = CellStatus.EXPLODED;
    return { grid: newGrid, exploded: true };
  }

  // Flood fill
  const stack = [{ r: row, c: col }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const { r, c } = current;

    if (
      r < 0 ||
      r >= newGrid.length ||
      c < 0 ||
      c >= newGrid.length ||
      newGrid[r][c].status !== CellStatus.HIDDEN
    ) {
      continue;
    }

    newGrid[r][c].status = CellStatus.REVEALED;

    if (newGrid[r][c].neighborMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          stack.push({ r: r + dr, c: c + dc });
        }
      }
    }
  }

  return { grid: newGrid, exploded: false };
};

export const toggleFlag = (grid: Cell[][], row: number, col: number): Cell[][] => {
  const newGrid = grid.map((r) => r.map((c) => ({ ...c })));
  const cell = newGrid[row][col];
  
  if (cell.status === CellStatus.HIDDEN) {
    cell.status = CellStatus.FLAGGED;
  } else if (cell.status === CellStatus.FLAGGED) {
    cell.status = CellStatus.HIDDEN;
  }
  
  return newGrid;
};

export const checkWinCondition = (grid: Cell[][]): boolean => {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      const cell = grid[r][c];
      // If a non-mine is still hidden or flagged (incorrectly), game not won
      if (!cell.isMine && cell.status !== CellStatus.REVEALED) {
        return false;
      }
    }
  }
  return true;
};
