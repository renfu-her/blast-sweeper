export enum CellStatus {
  HIDDEN = 'HIDDEN',
  REVEALED = 'REVEALED',
  FLAGGED = 'FLAGGED',
  EXPLODED = 'EXPLODED'
}

export interface Cell {
  row: number;
  col: number;
  isMine: boolean;
  status: CellStatus;
  neighborMines: number;
}

export interface GameConfig {
  gridSize: number; // N x N
  mineCount: number;
  level: number;
}

export interface Vector {
  x: number;
  y: number;
}

export interface Projectile {
  id: string;
  position: Vector; // x, y (Ground coordinates)
  z: number;        // Altitude
  velocity: Vector; // vx, vy (Ground velocity)
  vz: number;       // Vertical velocity
  active: boolean;
  type: 'PROBE' | 'FLAG';
}

export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST',
  RECORDING = 'RECORDING',
  LEADERBOARD = 'LEADERBOARD'
}

export interface LeaderboardEntry {
  name: string;
  level: number;
  totalProbes: number;
  timestamp: number;
}