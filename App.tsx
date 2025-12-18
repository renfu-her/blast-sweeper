import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, AlertTriangle, Bomb, Pause, Play, Home, Trophy, User, Send, ChevronRight } from 'lucide-react';
import { createEmptyGrid, placeMines, revealCell, toggleFlag, checkWinCondition } from './utils/minesweeperLogic';
import { Cell, GameState, Vector, Projectile, CellStatus, LeaderboardEntry } from './types';
import GameCanvas from './components/GameCanvas';

const START_SIZE = 5;
const MAX_SIZE = 30;
const SIZE_INCREMENT = 5;
const MAX_PULL = 250; 

// Physics Constants
const PHYS_POWER = 0.15;
const PHYS_Z_POWER = 0.15;
const PHYS_GRAVITY = 0.5;
const PHYS_DRAG = 0.995; 

const playSound = (freq: number, type: OscillatorType, duration: number) => {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
        osc.stop(ctx.currentTime + duration);
    } catch(e) {}
}

const App: React.FC = () => {
  // Game State
  const [level, setLevel] = useState(1);
  const [gridSize, setGridSize] = useState(START_SIZE);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [isPaused, setIsPaused] = useState(false);
  const [mineCount, setMineCount] = useState(0);
  const [flagsUsed, setFlagsUsed] = useState(0);
  const [shake, setShake] = useState(0);

  // Performance Tracking
  const [totalProbes, setTotalProbes] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Physics & Input State
  const [dragCurrent, setDragCurrent] = useState<Vector | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeProjectile, setActiveProjectile] = useState<Projectile | null>(null);
  const [ammoType, setAmmoType] = useState<'PROBE' | 'FLAG'>('PROBE');
  const [hasFirstMoved, setHasFirstMoved] = useState(false);
  const [slingshotOrigin, setSlingshotOrigin] = useState<Vector>({ x: 0, y: 0 });
  
  // Snap / Aim State
  const [snappedVelocity, setSnappedVelocity] = useState<{ v: Vector, vz: number } | null>(null);
  const [snappedCell, setSnappedCell] = useState<{r: number, c: number} | null>(null);

  // Refs
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const demoTimeoutRef = useRef<number | null>(null);

  // Load Leaderboard
  useEffect(() => {
    const saved = localStorage.getItem('blast_sweeper_scores');
    if (saved) {
        try { setLeaderboard(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  // Save Score Logic
  const saveScore = () => {
      if (!playerName.trim()) return;
      const newEntry: LeaderboardEntry = {
          name: playerName.trim(),
          level: level,
          totalProbes: totalProbes,
          timestamp: Date.now()
      };
      const updated = [...leaderboard, newEntry];
      setLeaderboard(updated);
      localStorage.setItem('blast_sweeper_scores', JSON.stringify(updated));
      setGameState(GameState.MENU);
  };

  // Rank 1: Mastery (Level desc, then Probes asc)
  const masteryRank = useMemo(() => {
      return [...leaderboard].sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          return a.totalProbes - b.totalProbes;
      }).slice(0, 10);
  }, [leaderboard]);

  // Rank 2: Precision (Probes asc, then Level desc)
  const efficiencyRank = useMemo(() => {
      return [...leaderboard].sort((a, b) => {
          if (a.totalProbes !== b.totalProbes) return a.totalProbes - b.totalProbes;
          return b.level - a.level;
      }).slice(0, 10);
  }, [leaderboard]);

  // RWD Slingshot Position: Shifted 20px downwards on mobile
  useEffect(() => {
    const updateSlingshotPos = () => {
        const isMobile = window.innerWidth < 640;
        setSlingshotOrigin({
            x: window.innerWidth / 2,
            // Original Desktop: height - 180. Mobile: height - 160 (Moves it 20px down visually)
            y: window.innerHeight - (isMobile ? 160 : 180) 
        });
    };
    updateSlingshotPos();
    window.addEventListener('resize', updateSlingshotPos);
    return () => window.removeEventListener('resize', updateSlingshotPos);
  }, []);

  const solveForPull = useCallback((targetDist: number): number => {
    let min = 0;
    let max = 3000; 
    let iterations = 30; 
    const simulateRange = (pull: number): number => {
        let vH = pull * PHYS_POWER; 
        let vZ = pull * PHYS_Z_POWER; 
        let h = 0; 
        let d = 0; 
        for(let i=0; i<800; i++) {
            d += vH; h += vZ; vZ -= PHYS_GRAVITY; vH *= PHYS_DRAG; 
            if (h <= 0) break;
        }
        return d;
    };
    for(let i=0; i<iterations; i++) {
        const mid = (min + max) / 2;
        if (simulateRange(mid) < targetDist) min = mid;
        else max = mid;
    }
    return (min + max) / 2;
  }, []);

  // --- INTERACTIVE DEMO SYSTEM ---
  useEffect(() => {
      let isCancelled = false;
      if (gameState === GameState.MENU) {
          const wait = (ms: number) => new Promise(resolve => {
              demoTimeoutRef.current = window.setTimeout(resolve, ms);
          });

          const runDemoCycle = async () => {
              const size = 5;
              setGridSize(size);
              let demoGrid = createEmptyGrid(size);
              // Controlled placement for demo
              demoGrid[1][1].isMine = true;
              demoGrid[3][3].isMine = true;
              demoGrid[0][4].isMine = true;
              // Recalculate numbers
              for(let r=0; r<size; r++) {
                for(let c=0; c<size; c++) {
                  if(!demoGrid[r][c].isMine) {
                    let count = 0;
                    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
                      const nr=r+dr, nc=c+dc;
                      if(nr>=0 && nr<size && nc>=0 && nc<size && demoGrid[nr][nc].isMine) count++;
                    }
                    demoGrid[r][c].neighborMines = count;
                  }
                }
              }

              setGrid(demoGrid);
              setAmmoType('PROBE');
              setHasFirstMoved(true); 

              await wait(1000);

              const targets = [
                  { r: 2, c: 2, type: 'PROBE' }, // Safe
                  { r: 1, c: 1, type: 'FLAG' },  // Flag mine
                  { r: 0, c: 0, type: 'PROBE' }, // Safe
                  { r: 3, c: 3, type: 'PROBE' }  // Bomb! (Ends demo)
              ];

              for (const target of targets) {
                  if (isCancelled || gameState !== GameState.MENU) return;
                  
                  setAmmoType(target.type as any);
                  await wait(400);

                  const cellEl = document.querySelector(`[data-row="${target.r}"][data-col="${target.c}"]`);
                  if (!cellEl) continue;
                  
                  const rect = cellEl.getBoundingClientRect();
                  const targetPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                  const launchOrigin = { x: slingshotOrigin.x, y: slingshotOrigin.y - 30 };
                  
                  const dx = targetPos.x - launchOrigin.x;
                  const dy = targetPos.y - launchOrigin.y;
                  const targetRange = Math.hypot(dx, dy);
                  const requiredPull = solveForPull(targetRange);
                  const angle = Math.atan2(dy, dx);
                  const dragPos = { 
                      x: slingshotOrigin.x - Math.cos(angle) * requiredPull, 
                      y: slingshotOrigin.y - Math.sin(angle) * requiredPull 
                  };

                  setIsDragging(true);
                  const steps = 30;
                  for (let i = 0; i <= steps; i++) {
                      if (isCancelled || gameState !== GameState.MENU) return;
                      const t = i / steps;
                      setDragCurrent({ 
                        x: slingshotOrigin.x + (dragPos.x - slingshotOrigin.x) * t, 
                        y: slingshotOrigin.y + (dragPos.y - slingshotOrigin.y) * t 
                      });
                      setSnappedCell({ r: target.r, c: target.c });
                      setSnappedVelocity({
                          v: { x: Math.cos(angle) * requiredPull * PHYS_POWER, y: Math.sin(angle) * requiredPull * PHYS_POWER },
                          vz: requiredPull * PHYS_Z_POWER
                      });
                      await wait(16);
                  }
                  
                  await wait(300);
                  if (isCancelled || gameState !== GameState.MENU) return;

                  setIsDragging(false);
                  setDragCurrent(null);
                  setSnappedCell(null);
                  setSnappedVelocity(null);

                  setActiveProjectile({ 
                      id: `demo-${Date.now()}`, 
                      position: { ...slingshotOrigin, y: slingshotOrigin.y - 30 }, 
                      z: 0, 
                      velocity: { x: Math.cos(angle) * requiredPull * PHYS_POWER, y: Math.sin(angle) * requiredPull * PHYS_POWER }, 
                      vz: requiredPull * PHYS_Z_POWER, 
                      active: true, 
                      type: target.type as any 
                  });
                  playSound(400, 'square', 0.1);
                  
                  await wait(2200); 
                  if (target.r === 3 && target.c === 3) break; // End on explosion
              }

              if (!isCancelled && gameState === GameState.MENU) {
                  await wait(2000);
                  runDemoCycle();
              }
          };

          runDemoCycle();
      }
      return () => {
          isCancelled = true;
          if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
      };
  }, [gameState, solveForPull, slingshotOrigin]);

  const initLevel = useCallback((lvl: number) => {
    const size = Math.min(START_SIZE + (lvl - 1) * SIZE_INCREMENT, MAX_SIZE);
    setGridSize(size);
    const density = Math.min(0.10 + (lvl * 0.01), 0.20); 
    const mines = Math.floor(size * size * density);
    setMineCount(mines);
    setGrid(createEmptyGrid(size));
    setGameState(GameState.PLAYING);
    setIsPaused(false);
    setHasFirstMoved(false);
    setFlagsUsed(0);
    setActiveProjectile(null);
    setShake(0);
    setSnappedVelocity(null);
    setSnappedCell(null);
    if (lvl === 1) setTotalProbes(0);
  }, []);

  const handleLevelComplete = () => {
    playSound(800, 'sine', 0.2);
    setTimeout(() => { setGameState(GameState.WON); }, 500);
  };

  const handleGameOver = () => {
    playSound(150, 'sawtooth', 0.5);
    setGameState(GameState.LOST);
    setGrid(prev => prev.map(row => row.map(cell => ({ ...cell, status: cell.isMine ? CellStatus.REVEALED : cell.status }))));
    setShake(20);
  };

  const handlePause = () => setIsPaused(true);
  const handleResume = () => setIsPaused(false);
  const handleQuit = () => { setIsPaused(false); setGameState(GameState.RECORDING); };

  useEffect(() => {
      if (shake > 0) {
          const timer = setTimeout(() => setShake(0), 200);
          return () => clearTimeout(timer);
      }
  }, [shake]);

  const calculateLandingPos = (startPos: Vector, velocity: Vector, vz: number): Vector => {
      let x = startPos.x; let y = startPos.y; let z = 0; let vx = velocity.x; let vy = velocity.y; let currVz = vz;
      for(let i=0; i<800; i++) {
          x += vx; y += vy; z += currVz; currVz -= PHYS_GRAVITY; vx *= PHYS_DRAG; vy *= PHYS_DRAG;
          if(z <= 0) break;
      }
      return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== GameState.PLAYING || isPaused || activeProjectile) return;
    const pos = getClientPos(e);
    if (pos.y > window.innerHeight * 0.4 && pos.y < window.innerHeight - 80) {
        setIsDragging(true);
        setDragCurrent(pos);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientPos = getClientPos(e);
    setDragCurrent(clientPos);
    let dx = slingshotOrigin.x - clientPos.x;
    let dy = slingshotOrigin.y - clientPos.y;
    const dist = Math.hypot(dx, dy);
    let finalDx = dx, finalDy = dy;
    if (dist > MAX_PULL) { const scale = MAX_PULL / dist; finalDx *= scale; finalDy *= scale; }
    else if (dist < 20) { setSnappedVelocity(null); setSnappedCell(null); return; }
    const rawVelocity = { x: finalDx * PHYS_POWER, y: finalDy * PHYS_POWER };
    const rawVz = Math.hypot(finalDx, finalDy) * PHYS_Z_POWER;
    const startPos = { x: slingshotOrigin.x, y: slingshotOrigin.y - 30 };
    const landingPos = calculateLandingPos(startPos, rawVelocity, rawVz);
    const elements = document.elementsFromPoint(landingPos.x, landingPos.y);
    const cellEl = elements.find(el => el.getAttribute('data-cell') === 'true');
    if (cellEl) {
        const r = parseInt(cellEl.getAttribute('data-row') || '-1'), c = parseInt(cellEl.getAttribute('data-col') || '-1');
        const rect = cellEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
        setSnappedCell({ r, c });
        const launchOrigin = { x: slingshotOrigin.x, y: slingshotOrigin.y - 30 };
        const tDx = centerX - launchOrigin.x, tDy = centerY - launchOrigin.y;
        const reqPull = solveForPull(Math.hypot(tDx, tDy));
        const angle = Math.atan2(tDy, tDx);
        setSnappedVelocity({ v: { x: Math.cos(angle) * reqPull * PHYS_POWER, y: Math.sin(angle) * reqPull * PHYS_POWER }, vz: reqPull * PHYS_Z_POWER });
    } else {
        setSnappedCell(null); setSnappedVelocity({ v: rawVelocity, vz: rawVz });
    }
  };

  const handleMouseUp = () => {
    if (!isDragging || !dragCurrent) return;
    setIsDragging(false); setDragCurrent(null); setSnappedCell(null);
    let launchVelocity = { x: 0, y: 0 }, launchVz = 0;
    if (snappedVelocity) { launchVelocity = snappedVelocity.v; launchVz = snappedVelocity.vz; }
    else {
        let dx = slingshotOrigin.x - dragCurrent.x, dy = slingshotOrigin.y - dragCurrent.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 20) {
            if (dist > MAX_PULL) { const scale = MAX_PULL / dist; dx *= scale; dy *= scale; }
            launchVelocity = { x: dx * PHYS_POWER, y: dy * PHYS_POWER }; launchVz = Math.hypot(dx, dy) * PHYS_Z_POWER;
        } else { setSnappedVelocity(null); return; }
    }
    setActiveProjectile({ id: Date.now().toString(), position: { ...slingshotOrigin, y: slingshotOrigin.y - 30 }, z: 0, velocity: launchVelocity, vz: launchVz, active: true, type: ammoType });
    playSound(400, 'square', 0.1);
    setTotalProbes(prev => prev + 1);
    setSnappedVelocity(null);
  };

  const getClientPos = (e: React.MouseEvent | React.TouchEvent): Vector => {
    if ('touches' in e) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
  };

  const handleProjectileUpdate = (pos: Vector, type: 'PROBE' | 'FLAG') => {
      setActiveProjectile(null);
      const element = document.elementFromPoint(pos.x, pos.y);
      if (element) {
          const cellDiv = element.closest('[data-cell="true"]');
          if (cellDiv) {
              const r = parseInt(cellDiv.getAttribute('data-row') || '-1'), c = parseInt(cellDiv.getAttribute('data-col') || '-1');
              if (r !== -1 && c !== -1) {
                  const cell = grid[r][c];
                  if (cell.status !== CellStatus.REVEALED && cell.status !== CellStatus.EXPLODED) processHit(r, c, type);
              }
          }
      }
  };

  const processHit = (row: number, col: number, type: 'PROBE' | 'FLAG') => {
      let currentGrid = [...grid];
      setShake(5); 
      if (type === 'FLAG') {
          const newGrid = toggleFlag(currentGrid, row, col);
          setGrid(newGrid);
          setFlagsUsed(prev => (newGrid[row][col].status === CellStatus.FLAGGED ? prev + 1 : prev - 1));
          return;
      }
      if (!hasFirstMoved && gameState === GameState.PLAYING) {
          currentGrid = placeMines(currentGrid, mineCount, row, col);
          setHasFirstMoved(true);
      }
      const { grid: nextGrid, exploded } = revealCell(currentGrid, row, col);
      setGrid(nextGrid);
      if (gameState === GameState.PLAYING) {
          if (exploded) handleGameOver();
          else {
              playSound(600, 'sine', 0.05); 
              if (checkWinCondition(nextGrid)) handleLevelComplete();
          }
      } else if (gameState === GameState.MENU) {
          if (exploded) playSound(150, 'sawtooth', 0.5);
          else playSound(600, 'sine', 0.05);
      }
  };

  const handleNextLevel = () => { const nLvl = level + 1; setLevel(nLvl); initLevel(nLvl); };
  const handleRestart = () => { initLevel(level); };

  const DuckIcon = ({ color }: { color: string }) => (
      <svg width="36" height="36" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill={color} stroke="#18181b" strokeWidth="2"/>
          <circle cx="11" cy="12" r="4.5" fill="white" stroke="#18181b" strokeWidth="1.5"/>
          <circle cx="21" cy="12" r="4.5" fill="white" stroke="#18181b" strokeWidth="1.5"/>
          <circle cx="11" cy="12" r="1.8" fill="black"/>
          <circle cx="21" cy="12" r="1.8" fill="black"/>
          <ellipse cx="16" cy="22" rx="6" ry="3.5" fill="#f97316" stroke="#18181b" strokeWidth="1.5"/>
          <path d="M 7 7 L 13 10" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M 25 7 L 19 10" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
  );

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col relative overflow-hidden select-none touch-none"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp}
    >
      <GameCanvas onHit={handleProjectileUpdate} isDragging={isDragging} dragCurrent={dragCurrent} activeProjectile={activeProjectile} slingshotOrigin={slingshotOrigin} ammoType={ammoType} snappedVelocity={snappedVelocity} />

      {/* Header Bar */}
      <div className="bg-slate-800 p-2 shadow-lg border-b border-slate-700 z-30 flex justify-between items-center h-14 shrink-0 px-4">
        <h1 className="text-lg font-bold text-blue-400 tracking-wider italic">
          {gameState === GameState.MENU ? 'PROBE SYSTEMS' : `MISSION LEVEL ${level}`}
        </h1>
        <div className="flex gap-4 items-center">
            {gameState !== GameState.MENU && (
                <>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-slate-400 font-mono">SHOTS</span>
                      <span className="text-yellow-500 font-mono leading-none">{totalProbes}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-slate-400 font-mono">MINES</span>
                      <span className="text-red-400 font-mono leading-none">{mineCount - flagsUsed}</span>
                    </div>
                    <button onClick={handlePause} className="p-2 hover:bg-slate-700 rounded-full transition text-slate-300 ml-2">
                        <Pause size={20} />
                    </button>
                </>
            )}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative z-10 w-full overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-4 pb-12" style={{ transform: `translate(${(Math.random()-0.5)*shake}px, ${(Math.random()-0.5)*shake}px)` }}>
             
             <div ref={gridContainerRef} className={`bg-slate-900/50 rounded-lg p-1 border border-slate-700 shadow-2xl backdrop-blur-sm transition-all duration-700 ${gameState === GameState.MENU ? 'opacity-90' : 'opacity-100'}`}
                style={{ display: 'grid', gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, width: 'min(85vw, 60vh)', aspectRatio: '1/1' }}>
                    {grid.map((row, rIdx) => row.map((cell, cIdx) => (
                        <div key={`${rIdx}-${cIdx}`} data-cell="true" data-row={rIdx} data-col={cIdx} className={`w-full h-full text-[0.4rem] sm:text-[0.6rem] md:text-xs font-bold flex items-center justify-center select-none transition-all duration-200 ${snappedCell?.r === rIdx && snappedCell?.c === cIdx ? 'ring-4 ring-white z-10 scale-105 shadow-[0_0_20px_rgba(255,255,255,0.6)]' : ''} ${cell.status === CellStatus.HIDDEN ? 'bg-slate-600 border border-slate-500 hover:brightness-110' : ''} ${cell.status === CellStatus.FLAGGED ? 'bg-slate-700 border border-slate-600' : ''} ${cell.status === CellStatus.REVEALED ? 'bg-slate-800/80 border border-slate-700/30' : ''} ${cell.status === CellStatus.EXPLODED ? 'bg-red-600/40 border border-red-500' : ''}`}>
                            {cell.status === CellStatus.REVEALED && !cell.isMine && cell.neighborMines > 0 && (
                                <span style={{ color: ['#60a5fa', '#4ade80', '#f87171', '#818cf8', '#fbbf24'][Math.min(cell.neighborMines - 1, 4)] }}>{cell.neighborMines}</span>
                            )}
                            {cell.status === CellStatus.FLAGGED && <div className="w-[60%] h-[60%] rounded-full bg-blue-500 border-2 border-slate-800 shadow-md animate-pulse" />}
                            {cell.status === CellStatus.EXPLODED && <Bomb className="text-red-500 w-[80%] h-[80%] animate-ping" />}
                        </div>
                    )))}
            </div>

            {gameState === GameState.MENU && (
                <div className="absolute inset-0 bg-slate-950/40 flex flex-col items-center justify-center z-50 p-6 pointer-events-none">
                    <div className="bg-slate-900/95 border-2 border-blue-500 rounded-3xl shadow-[0_0_50px_rgba(59,130,246,0.4)] p-8 text-center animate-bounce-in backdrop-blur-md pointer-events-auto max-w-sm w-full">
                        <h2 className="text-4xl font-black mb-1 text-blue-400 tracking-tighter italic">BLAST SWEEPER</h2>
                        <p className="text-blue-500/60 font-mono text-[10px] tracking-[0.2em] mb-8 uppercase">Tactical Proximity Clearance</p>
                        
                        <div className="space-y-4 mb-10">
                            <button onClick={() => initLevel(1)} className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-white transition transform hover:scale-105 active:scale-95 shadow-[0_4px_0_rgb(30,58,138)] active:translate-y-1 uppercase tracking-tight">
                                Start Play!
                            </button>
                            <button onClick={() => setGameState(GameState.LEADERBOARD)} className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-slate-300 transition flex items-center justify-center gap-2 border border-slate-700">
                                <Trophy size={18} /> RANKINGS
                            </button>
                        </div>
                        <div className="flex items-center gap-2 justify-center text-[10px] text-slate-500 font-mono">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                            OPERATIONAL DEMO ACTIVE
                        </div>
                    </div>
                </div>
             )}
          </div>

          <div className="h-[130px] flex justify-center items-end pb-8 pointer-events-none relative z-40">
            {gameState !== GameState.MENU && gameState !== GameState.LEADERBOARD && gameState !== GameState.RECORDING && (
             <div className="pointer-events-auto bg-slate-900/90 p-3 rounded-3xl border border-slate-700 backdrop-blur-md shadow-2xl flex gap-8">
                <button onClick={(e) => { e.stopPropagation(); setAmmoType('PROBE'); }} className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 ${ammoType === 'PROBE' ? 'ring-[3px] ring-yellow-400 bg-slate-800' : 'bg-slate-800/50'}`}>
                    <DuckIcon color="#fcd34d" />
                    {ammoType === 'PROBE' && <div className="absolute -bottom-10 text-[10px] font-black text-yellow-400 tracking-widest bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">PROBE</div>}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setAmmoType('FLAG'); }} className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 ${ammoType === 'FLAG' ? 'ring-[3px] ring-blue-500 bg-slate-800' : 'bg-slate-800/50'}`}>
                    <DuckIcon color="#60a5fa" />
                    {ammoType === 'FLAG' && <div className="absolute -bottom-10 text-[10px] font-black text-blue-400 tracking-widest bg-blue-500/10 px-2 py-0.5 rounded border border-blue-400/20">FLAG</div>}
                </button>
             </div>
            )}
          </div>
      </div>

      {(gameState === GameState.WON || gameState === GameState.LOST || isPaused) && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-[55] backdrop-blur-sm p-4">
                <div className={`p-8 rounded-3xl border-2 text-center shadow-2xl min-w-[320px] bg-slate-900 ${isPaused ? 'border-slate-500' : gameState === GameState.WON ? 'border-green-500' : 'border-red-500'}`}>
                    <h2 className={`text-4xl font-black mb-8 italic tracking-tighter ${gameState === GameState.WON ? 'text-green-500' : gameState === GameState.LOST ? 'text-red-500' : 'text-white'}`}>
                        {isPaused ? 'PAUSED' : gameState === GameState.WON ? 'CLEARED' : 'FAILED'}
                    </h2>
                    <div className="flex flex-col gap-4">
                        {isPaused ? <button onClick={handleResume} className="px-6 py-4 bg-blue-600 rounded-2xl font-black text-xl transition transform hover:scale-105">RESUME</button> : (
                            <button onClick={gameState === GameState.WON ? handleNextLevel : handleRestart} className={`px-6 py-4 rounded-2xl font-black text-xl transition transform hover:scale-105 ${gameState === GameState.WON ? 'bg-green-600' : 'bg-red-600'}`}>
                                {gameState === GameState.WON ? 'NEXT LEVEL' : 'RETRY'}
                            </button>
                        )}
                        <button onClick={handleQuit} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-slate-400 transition">END MISSION</button>
                    </div>
                </div>
            </div>
      )}

      {gameState === GameState.RECORDING && (
          <div className="absolute inset-0 bg-black/95 flex items-center justify-center z-[60] backdrop-blur-md p-4">
              <div className="bg-slate-900 border-2 border-blue-500 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center">
                  <h2 className="text-3xl font-black text-blue-400 mb-6 italic tracking-tight">MISSION LOGS</h2>
                  <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 mb-8 grid grid-cols-2 gap-4">
                      <div><p className="text-[10px] text-slate-500 uppercase font-mono mb-1 tracking-widest">Level</p><p className="text-3xl font-black">{level}</p></div>
                      <div><p className="text-[10px] text-slate-500 uppercase font-mono mb-1 tracking-widest">Total Shots</p><p className="text-3xl font-black text-yellow-500">{totalProbes}</p></div>
                  </div>
                  <p className="text-slate-400 text-xs mb-4 uppercase tracking-[0.2em]">Enter Callsign</p>
                  <input type="text" placeholder="..." className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl p-4 text-center font-black text-3xl mb-8 text-blue-400 focus:border-blue-500 transition-all uppercase outline-none" value={playerName} onChange={(e) => setPlayerName(e.target.value.toUpperCase().slice(0, 10))} />
                  <button onClick={saveScore} disabled={!playerName.trim()} className="w-full py-5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-2xl font-black text-xl text-white transition flex items-center justify-center gap-2">ARCHIVE DATA <ChevronRight /></button>
              </div>
          </div>
      )}

      {gameState === GameState.LEADERBOARD && (
          <div className="absolute inset-0 bg-slate-950 flex flex-col z-[70] p-6 sm:p-10">
              <div className="flex justify-between items-center mb-10 shrink-0 max-w-6xl w-full mx-auto">
                  <h2 className="text-5xl font-black text-blue-500 flex items-center gap-6 italic tracking-tighter">
                      <Trophy size={48} className="text-yellow-500" /> WORLD RANKINGS
                  </h2>
                  <button onClick={() => setGameState(GameState.MENU)} className="p-4 bg-slate-900 hover:bg-slate-800 rounded-full text-slate-400 transition border border-slate-800">
                      <Home size={32} />
                  </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 flex-1 overflow-hidden max-w-6xl w-full mx-auto pb-6">
                  {/* Mastery Rank */}
                  <div className="flex flex-col h-full bg-slate-900/60 border border-blue-500/20 rounded-[2.5rem] overflow-hidden backdrop-blur-xl shadow-2xl">
                      <div className="bg-blue-900/30 p-6 border-b border-blue-500/30 flex justify-between items-center">
                          <h3 className="font-black text-blue-300 tracking-widest italic uppercase text-sm">Level Mastery</h3>
                          <Trophy size={20} className="text-blue-500" />
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                          {masteryRank.map((entry, i) => (
                              <div key={i} className="flex items-center gap-5 p-5 mb-3 bg-slate-800/40 rounded-3xl border border-transparent hover:border-blue-500/30 transition-all">
                                  <span className={`w-12 text-center font-black ${i < 3 ? 'text-yellow-400 text-3xl italic' : 'text-slate-600 text-xl'}`}>{i + 1}</span>
                                  <div className="flex-1"><p className="font-black text-blue-100 text-xl tracking-tight">{entry.name}</p></div>
                                  <div className="text-right">
                                      <p className="text-3xl font-black text-white italic">LVL {entry.level}</p>
                                      <p className="text-[10px] text-yellow-500 font-mono tracking-widest">{entry.totalProbes} SHOTS</p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
                  {/* Precision Rank */}
                  <div className="flex flex-col h-full bg-slate-900/60 border border-yellow-500/20 rounded-[2.5rem] overflow-hidden backdrop-blur-xl shadow-2xl">
                      <div className="bg-yellow-900/30 p-6 border-b border-yellow-500/30 flex justify-between items-center">
                          <h3 className="font-black text-yellow-300 tracking-widest italic uppercase text-sm">Precision Strike</h3>
                          <Send size={20} className="text-yellow-500" />
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                          {efficiencyRank.map((entry, i) => (
                              <div key={i} className="flex items-center gap-5 p-5 mb-3 bg-slate-800/40 rounded-3xl border border-transparent hover:border-yellow-500/30 transition-all">
                                  <span className={`w-12 text-center font-black ${i < 3 ? 'text-yellow-400 text-3xl italic' : 'text-slate-600 text-xl'}`}>{i + 1}</span>
                                  <div className="flex-1"><p className="font-black text-yellow-100 text-xl tracking-tight">{entry.name}</p></div>
                                  <div className="text-right">
                                      <p className="text-3xl font-black text-white italic">{entry.totalProbes} SHOTS</p>
                                      <p className="text-[10px] text-blue-500 font-mono tracking-widest">TO REACH LVL {entry.level}</p>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;