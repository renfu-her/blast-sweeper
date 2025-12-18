import React, { useRef, useEffect } from 'react';
import { Vector, Projectile } from '../types';

interface GameCanvasProps {
  onHit: (pos: Vector, type: 'PROBE' | 'FLAG') => void;
  isDragging: boolean;
  dragCurrent: Vector | null;
  activeProjectile: Projectile | null;
  slingshotOrigin: Vector;
  ammoType: 'PROBE' | 'FLAG';
  snappedVelocity?: { v: Vector, vz: number } | null;
}

const GRAVITY_Z = 0.5; 
const AIR_DRAG = 0.995;
const MAX_PULL = 250; // Updated to match App.tsx

// Particle system for explosions
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: string;
  size: number;
}

const GameCanvas: React.FC<GameCanvasProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  
  // Store props in a ref to access latest values in animation loop without re-triggering effect
  const propsRef = useRef(props);

  // Sync propsRef and handle explosion triggers
  useEffect(() => {
    const prevActive = propsRef.current.activeProjectile;
    const nextActive = props.activeProjectile;

    if (prevActive && !nextActive) {
         createExplosion(prevActive.position.x, prevActive.position.y, 0, prevActive.type === 'PROBE' ? '#fcd34d' : '#60a5fa');
    }

    propsRef.current = props;
  }, [props]);

  const createExplosion = (x: number, y: number, z: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particlesRef.current.push({
        x,
        y,
        z: z + 5, 
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        vz: Math.random() * 10,
        life: 1.0,
        color,
        size: Math.random() * 4 + 2
      });
    }
  };

  const drawShadow = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, opacity: number) => {
      ctx.save();
      ctx.scale(1, 0.5); 
      ctx.beginPath();
      ctx.arc(x, y * 2, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
      ctx.fill();
      ctx.restore();
  };

  const drawReticle = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.5); 

      // Flat style reticle
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-20, 0); ctx.lineTo(-10, 0);
      ctx.moveTo(10, 0); ctx.lineTo(20, 0);
      ctx.moveTo(0, -20); ctx.lineTo(0, -10);
      ctx.moveTo(0, 10); ctx.lineTo(0, 20);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.restore();
  };

  const drawDuck = (ctx: CanvasRenderingContext2D, x: number, y: number, z: number, radius: number, angle: number, type: 'PROBE' | 'FLAG') => {
    const drawY = y - z; 
    
    ctx.save();
    ctx.translate(x, drawY);
    ctx.rotate(angle + Math.PI / 2);

    const color = type === 'PROBE' ? '#fcd34d' : '#60a5fa'; 
    
    // Main circle body
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#18181b'; 
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes (Middle)
    const eyeOffsetY = -radius * 0.2; 
    const eyeOffsetX = radius * 0.35;
    const eyeRadius = radius * 0.25;

    // Left Eye
    ctx.beginPath(); ctx.arc(-eyeOffsetX, eyeOffsetY, eyeRadius, 0, Math.PI*2); 
    ctx.fillStyle = 'white'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-eyeOffsetX, eyeOffsetY, eyeRadius*0.4, 0, Math.PI*2);
    ctx.fillStyle = 'black'; ctx.fill();

    // Right Eye
    ctx.beginPath(); ctx.arc(eyeOffsetX, eyeOffsetY, eyeRadius, 0, Math.PI*2); 
    ctx.fillStyle = 'white'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(eyeOffsetX, eyeOffsetY, eyeRadius*0.4, 0, Math.PI*2);
    ctx.fillStyle = 'black'; ctx.fill();

    // Beak
    const beakY = radius * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, beakY, radius * 0.4, radius * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.stroke();

    // Eyebrows
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#18181b';

    ctx.beginPath();
    ctx.moveTo(-radius * 0.7, -radius * 0.5); 
    ctx.lineTo(-radius * 0.2, -radius * 0.3);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(radius * 0.7, -radius * 0.5);
    ctx.lineTo(radius * 0.2, -radius * 0.3);
    ctx.stroke();

    ctx.restore();
  };

  const drawSlingshot = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
     ctx.save();
     ctx.lineCap = 'round';
     ctx.lineJoin = 'round';
     
     ctx.beginPath();
     ctx.strokeStyle = '#5d4037'; 
     ctx.lineWidth = 14;
     
     ctx.moveTo(x - 30, y - 20);
     ctx.quadraticCurveTo(x, y + 25, x + 30, y - 20);
     ctx.stroke();

     ctx.lineWidth = 2;
     ctx.strokeStyle = '#3e2723';
     ctx.stroke(); 
     
     ctx.restore();
  };

  const drawElastic = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 5;
    ctx.stroke();
  };

  const draw = (ctx: CanvasRenderingContext2D, currentProps: GameCanvasProps) => {
    const { 
        isDragging, 
        dragCurrent, 
        activeProjectile, 
        slingshotOrigin, 
        ammoType, 
        snappedVelocity,
        onHit 
    } = currentProps;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    let effectiveDrag: Vector | null = dragCurrent;
    let effectiveIsDragging = isDragging;

    const slingshotLeft = { x: slingshotOrigin.x - 30, y: slingshotOrigin.y - 20 };
    const slingshotRight = { x: slingshotOrigin.x + 30, y: slingshotOrigin.y - 20 };
    const restingPos = { x: slingshotOrigin.x, y: slingshotOrigin.y - 20 };

    // 1. Draw Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.vz -= GRAVITY_Z; 
        p.life -= 0.03;
        if (p.z < 0) { p.z = 0; p.vz *= -0.5; p.vx *= 0.8; p.vy *= 0.8; }
        if (p.life <= 0) {
            particlesRef.current.splice(i, 1);
            continue;
        }
        const drawY = p.y - p.z;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, drawY, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    // 2. Shadow
    if (activeProjectile) {
        const sSize = Math.max(5, 12 - activeProjectile.z * 0.05); 
        const sAlpha = Math.max(0.1, 0.5 - activeProjectile.z * 0.002);
        drawShadow(ctx, activeProjectile.position.x, activeProjectile.position.y, sSize, sAlpha);
    }

    // CLAMP & AIM LOGIC
    let drawDragPos = restingPos;
    let simVelocity = { x: 0, y: 0, vz: 0 };
    let hasTarget = false;

    if (effectiveIsDragging && effectiveDrag) {
         let dx = slingshotOrigin.x - effectiveDrag.x;
         let dy = slingshotOrigin.y - effectiveDrag.y;
         const dist = Math.hypot(dx, dy);

         // Visual Clamp
         if (dist > MAX_PULL) {
             const scale = MAX_PULL / dist;
             drawDragPos = {
                 x: slingshotOrigin.x - dx * scale,
                 y: slingshotOrigin.y - dy * scale
             };
         } else {
             drawDragPos = effectiveDrag;
         }

         // If snappedVelocity exists, use that for the prediction line
         // If not, calculate from drag like before
         if (snappedVelocity) {
             simVelocity.x = snappedVelocity.v.x;
             simVelocity.y = snappedVelocity.v.y;
             simVelocity.vz = snappedVelocity.vz;
         } else {
             const POWER = 0.15;
             const Z_POWER = 0.15;
             let cDx = slingshotOrigin.x - drawDragPos.x;
             let cDy = slingshotOrigin.y - drawDragPos.y;
             simVelocity.x = cDx * POWER;
             simVelocity.y = cDy * POWER;
             simVelocity.vz = Math.hypot(cDx, cDy) * Z_POWER;
         }
         hasTarget = true;
    }


    // 3. Back Elastic
    if (hasTarget) {
        drawElastic(ctx, slingshotLeft.x, slingshotLeft.y, drawDragPos.x, drawDragPos.y);
    } else if (!activeProjectile) {
        drawElastic(ctx, slingshotLeft.x, slingshotLeft.y, restingPos.x, restingPos.y);
    }

    // 4. Projectile (Duck)
    if (activeProjectile) {
        const p = activeProjectile;
        const angle = Math.atan2(p.velocity.y, p.velocity.x);
        drawDuck(ctx, p.position.x, p.position.y, p.z, 16, angle, p.type);
    } else if (hasTarget) {
        const dx = slingshotOrigin.x - drawDragPos.x;
        const dy = slingshotOrigin.y - drawDragPos.y;
        const angle = Math.atan2(dy, dx); 
        drawDuck(ctx, drawDragPos.x, drawDragPos.y, 0, 16, angle, ammoType);
    } else {
        drawDuck(ctx, restingPos.x, restingPos.y, 0, 16, -Math.PI/2, ammoType);
    }

    // 5. Front Elastic
    if (hasTarget) {
        drawElastic(ctx, slingshotRight.x, slingshotRight.y, drawDragPos.x, drawDragPos.y);
    } else if (!activeProjectile) {
        drawElastic(ctx, slingshotRight.x, slingshotRight.y, restingPos.x, restingPos.y);
    }

    // 6. Slingshot Base
    drawSlingshot(ctx, slingshotOrigin.x, slingshotOrigin.y);

    // 7. Prediction Trajectory
    if (hasTarget) {
        let simX = slingshotOrigin.x;
        let simY = slingshotOrigin.y - 30; 
        let simZ = 0;
        let simVx = simVelocity.x;
        let simVy = simVelocity.y;
        let simVz = simVelocity.vz;

        const reticleColor = ammoType === 'PROBE' ? '#fcd34d' : '#60a5fa'; 
        
        let hasLanded = false;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        
        // Increased loop limit (150 -> 800) to ensure trajectory line reaches ground even for long shots
        for (let i = 0; i < 800; i++) {
            simX += simVx;
            simY += simVy;
            simZ += simVz;
            simVz -= GRAVITY_Z;
            simVx *= AIR_DRAG;
            simVy *= AIR_DRAG;

            if (simZ <= 0) {
                simZ = 0;
                hasLanded = true;
                break;
            }

            if (i % 3 === 0) {
                 const drawY = simY - simZ;
                 const opacity = Math.max(0.1, 1 - (i / 150)); // Adjusted fade out
                 ctx.fillStyle = i % 6 === 0 ? `rgba(255,255,255,${opacity})` : `rgba(200,200,200,${opacity*0.5})`;
                 
                 const dotSize = Math.max(1.5, 3.5 - (i * 0.015));
                 ctx.beginPath();
                 ctx.arc(simX, drawY, dotSize, 0, Math.PI * 2);
                 ctx.fill();
            }
        }

        if (hasLanded) {
            drawReticle(ctx, simX, simY, reticleColor);
        }
    }
  };

  useEffect(() => {
    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      const currentProps = propsRef.current;
      
      if (currentProps.activeProjectile && currentProps.activeProjectile.active) {
        const p = currentProps.activeProjectile;
        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        p.z += p.vz;
        p.vz -= GRAVITY_Z; 
        p.velocity.x *= AIR_DRAG;
        p.velocity.y *= AIR_DRAG;

        if (p.z <= 0) {
            p.z = 0;
            p.active = false; 
            currentProps.onHit(p.position, p.type); 
        }
        if (p.position.y < -100 || p.position.x < -100 || p.position.x > canvas.width + 100) {
            p.active = false;
            currentProps.onHit(p.position, p.type);
        }
      }

      draw(ctx, currentProps);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []); 

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-20"
    />
  );
};

export default GameCanvas;