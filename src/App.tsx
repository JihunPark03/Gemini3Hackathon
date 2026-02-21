/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, AlertTriangle, CheckCircle, Clock, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SPEED = 250;
const INTERACT_RADIUS = 80;

type SystemStatus = 'BROKEN' | 'FIXED';

interface Systems {
  POWER: SystemStatus;
  NAV: SystemStatus;
  LIFE_SUPPORT: SystemStatus;
}

const MACHINES = [
  { id: 'POWER', x: 150, y: 150, width: 64, height: 64, name: 'POWER GENERATOR', color: '#ef4444' },
  { id: 'NAV', x: 600, y: 150, width: 64, height: 64, name: 'NAV CONSOLE', color: '#3b82f6' },
  { id: 'LIFE_SUPPORT', x: 375, y: 450, width: 64, height: 64, name: 'LIFE SUPPORT', color: '#22c55e' },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);
  const [systems, setSystems] = useState<Systems>({
    POWER: 'BROKEN',
    NAV: 'BROKEN',
    LIFE_SUPPORT: 'BROKEN',
  });
  
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [activeMachine, setActiveMachine] = useState<string | null>(null);
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const chatRef = useRef<any>(null);
  const playerRef = useRef({
    x: CANVAS_WIDTH / 2 - 32,
    y: CANVAS_HEIGHT / 2 - 32,
    width: 64,
    height: 64,
    frameX: 0,
    animTimer: 0,
    flip: false,
  });
  const keysRef = useRef<{[key: string]: boolean}>({});
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const spriteLoadedRef = useRef(false);

  useEffect(() => {
    const img = new Image();
    // Assuming the uploaded sprite sheet is available as /sprite.jpg
    // If not, it will gracefully fallback to drawing a placeholder character
    img.src = '/sprite.jpg';
    img.onload = () => {
      spriteRef.current = img;
      spriteLoadedRef.current = true;
    };
    img.onerror = () => {
      console.warn('Sprite sheet not found. Using fallback shape.');
    };
  }, []);

  const startGame = async () => {
    setGameStarted(true);
    setGameOver(false);
    setGameWon(false);
    setTimeLeft(180);
    setSystems({ POWER: 'BROKEN', NAV: 'BROKEN', LIFE_SUPPORT: 'BROKEN' });
    setMessages([]);
    
    chatRef.current = ai.chats.create({
      model: "gemini-3-pro-preview",
      config: {
        systemInstruction: `You are AURA, a ship AI. The ship has 3 critical failures.
PHASE 1: GENERATION
Generate 3 systems (POWER, NAV, LIFE-SUPPORT) each with 3 subparts.
Corrupt ONE subpart in EACH system with a error fixable by adjusting parameters in JSON.
PHASE 2: INTERFACE RULES (CRITICAL)
1. At the start, LIST only the 3 System Names and their Alert Status. 
2. DO NOT show all the JSON data at once.
3. Only show the JSON data for a system when the player says 'Switch to [System Name]' or 'Open [System]'.
4. If a player fixes the error in the active view, mark it RESOLVED and suggest they switch to another system. You MUST include the exact phrase "[SYSTEM_NAME] IS FIXED" (e.g., "POWER IS FIXED", "NAV IS FIXED", "LIFE-SUPPORT IS FIXED") in your response so the UI can update.
5. Keep track of the 'Master Timer' (which I will provide in the prompt).
6. Do not give technical details of the errors, just describe what is going wrong and let the player figure things out.
7. On follow ups on what is wrong, do not give the full answer but give leads that would help the player figure out the solution.
8. Make each problem multi-step and a bit challenging.
9. Make it so that the player will have to ask clarifying questions.
10. Do not give what steps to do that easily.
PHASE 3: WIN/LOSS
If all 3 are fixed, say 'SYSTEMS STABILIZED - MISSION SUCCESS'.
If time runs out, the ship is lost.`
      }
    });

    setIsTyping(true);
    try {
      const response = await chatRef.current.sendMessage({ message: "INITIALIZE. LIST ACTIVE ALERTS ONLY." });
      setMessages([{ role: 'aura', text: response.text }]);
    } catch (e) {
      console.error(e);
      setMessages([{ role: 'aura', text: "ERROR CONNECTING TO AURA CORE." }]);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    if (!gameStarted || gameOver || gameWon) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setGameOver(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameStarted, gameOver, gameWon]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      
      if (e.key === 'e' || e.key === 'E') {
        if (!isTerminalOpen && !gameOver && gameStarted) {
          const p = playerRef.current;
          const px = p.x + p.width / 2;
          const py = p.y + p.height / 2;
          
          for (const m of MACHINES) {
            const mx = m.x + m.width / 2;
            const my = m.y + m.height / 2;
            const dist = Math.hypot(px - mx, py - my);
            if (dist < INTERACT_RADIUS) {
              setActiveMachine(m.id);
              setIsTerminalOpen(true);
              handleAutoMessage(`Open ${m.id}`);
              break;
            }
          }
        }
      }
      
      if (e.key === 'Escape' && isTerminalOpen) {
        setIsTerminalOpen(false);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isTerminalOpen, gameOver, gameStarted]);

  useEffect(() => {
    if (!gameStarted || gameOver || gameWon) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (!isTerminalOpen) {
        const p = playerRef.current;
        let isMoving = false;
        
        if (keysRef.current['ArrowUp'] || keysRef.current['w']) { p.y -= PLAYER_SPEED * dt; isMoving = true; }
        if (keysRef.current['ArrowDown'] || keysRef.current['s']) { p.y += PLAYER_SPEED * dt; isMoving = true; }
        if (keysRef.current['ArrowLeft'] || keysRef.current['a']) { p.x -= PLAYER_SPEED * dt; p.flip = true; isMoving = true; }
        if (keysRef.current['ArrowRight'] || keysRef.current['d']) { p.x += PLAYER_SPEED * dt; p.flip = false; isMoving = true; }

        p.x = Math.max(0, Math.min(CANVAS_WIDTH - p.width, p.x));
        p.y = Math.max(0, Math.min(CANVAS_HEIGHT - p.height, p.y));

        if (isMoving) {
          p.animTimer += dt;
          if (p.animTimer > 0.1) {
            p.frameX = (p.frameX + 1) % 6;
            p.animTimer = 0;
          }
        } else {
          p.frameX = 0;
        }
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      for (let i = 0; i < CANVAS_WIDTH; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke();
      }
      for (let i = 0; i < CANVAS_HEIGHT; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke();
      }

      let nearbyMachine = null;
      const p = playerRef.current;
      const px = p.x + p.width / 2;
      const py = p.y + p.height / 2;

      MACHINES.forEach(m => {
        const isFixed = systems[m.id as keyof Systems] === 'FIXED';
        
        ctx.shadowColor = isFixed ? '#22c55e' : m.color;
        ctx.shadowBlur = 15;
        ctx.fillStyle = isFixed ? '#16a34a' : '#b91c1c';
        ctx.fillRect(m.x, m.y, m.width, m.height);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(m.x + 10, m.y + 10, m.width - 20, m.height - 20);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, m.x + m.width / 2, m.y - 15);

        const mx = m.x + m.width / 2;
        const my = m.y + m.height / 2;
        if (Math.hypot(px - mx, py - my) < INTERACT_RADIUS) {
          nearbyMachine = m;
        }
      });

      ctx.save();
      ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
      if (p.flip) ctx.scale(-1, 1);

      if (spriteLoadedRef.current && spriteRef.current) {
        const img = spriteRef.current;
        const frameW = img.width / 6;
        const frameH = img.height / 3;
        ctx.drawImage(
          img,
          p.frameX * frameW,
          0,
          frameW,
          frameH,
          -p.width / 2,
          -p.height / 2,
          p.width,
          p.height
        );
      } else {
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(10, -10, 10, 10);
      }
      ctx.restore();

      if (nearbyMachine && !isTerminalOpen) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(p.x - 60, p.y - 40, 180, 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`Press [E] to access ${nearbyMachine.name}`, p.x + p.width / 2, p.y - 20);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameStarted, gameOver, gameWon, isTerminalOpen, systems]);

  const handleAutoMessage = async (text: string) => {
    if (!chatRef.current) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsTyping(true);
    try {
      const response = await chatRef.current.sendMessage({ message: `USER COMMAND: ${text}. (Time remaining: ${timeLeft}s)` });
      processAuraResponse(response.text);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'aura', text: "ERROR: CONNECTION LOST." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !chatRef.current || isTyping) return;
    
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);
    
    try {
      const response = await chatRef.current.sendMessage({ message: `USER COMMAND: ${userMsg}. (Time remaining: ${timeLeft}s)` });
      processAuraResponse(response.text);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'aura', text: "ERROR: CONNECTION LOST." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const processAuraResponse = (text: string) => {
    setMessages(prev => [...prev, { role: 'aura', text }]);
    
    const upperText = text.toUpperCase();
    
    let updatedSystems = { ...systems };
    if (upperText.includes('POWER IS FIXED')) updatedSystems.POWER = 'FIXED';
    if (upperText.includes('NAV IS FIXED')) updatedSystems.NAV = 'FIXED';
    if (upperText.includes('LIFE-SUPPORT IS FIXED') || upperText.includes('LIFE_SUPPORT IS FIXED')) updatedSystems.LIFE_SUPPORT = 'FIXED';
    
    if (JSON.stringify(updatedSystems) !== JSON.stringify(systems)) {
      setSystems(updatedSystems);
    }

    if (upperText.includes('MISSION SUCCESS')) {
      setGameWon(true);
      setIsTerminalOpen(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans text-slate-100 p-4">
      
      {!gameStarted ? (
        <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center">
          <Terminal className="w-16 h-16 text-blue-500 mx-auto mb-6" />
          <h1 className="text-4xl font-bold tracking-tight mb-4 text-white">AURA EMERGENCY PROTOCOL</h1>
          <p className="text-slate-400 mb-8 text-lg">
            The ship has suffered 3 critical failures. You have 3 minutes to navigate the engineering bay, access the terminals, and stabilize the systems before hull integrity reaches zero.
          </p>
          <div className="flex justify-center gap-4 mb-8 text-sm text-slate-500">
            <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-lg">
              <span className="font-mono text-white">WASD / Arrows</span> to move
            </div>
            <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-lg">
              <span className="font-mono text-white">E</span> to interact
            </div>
          </div>
          <button 
            onClick={startGame}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
          >
            INITIALIZE BOOT SEQUENCE
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-lg pointer-events-auto">
              <h2 className="text-xs font-bold text-slate-400 tracking-widest mb-3">SYSTEM STATUS</h2>
              <div className="space-y-2">
                {Object.entries(systems).map(([sys, status]) => (
                  <div key={sys} className="flex items-center justify-between gap-6">
                    <span className="font-mono text-sm">{sys.replace('_', ' ')}</span>
                    {status === 'FIXED' ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                        <CheckCircle className="w-4 h-4" /> STABLE
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400 text-xs font-bold animate-pulse">
                        <AlertTriangle className="w-4 h-4" /> CRITICAL
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={`bg-slate-900/90 backdrop-blur border ${timeLeft < 30 ? 'border-red-500 text-red-500 animate-pulse' : 'border-slate-700 text-white'} p-4 rounded-xl shadow-lg flex items-center gap-3 pointer-events-auto`}>
              <Clock className="w-6 h-6" />
              <span className="font-mono text-3xl font-bold tracking-tight">{formatTime(timeLeft)}</span>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-slate-950">
            <canvas 
              ref={canvasRef} 
              width={CANVAS_WIDTH} 
              height={CANVAS_HEIGHT}
              className="block"
            />
          </div>

          <AnimatePresence>
            {isTerminalOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="absolute inset-4 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden z-20"
              >
                <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-blue-400" />
                    <span className="font-mono font-bold text-blue-400 tracking-widest">AURA // {activeMachine} TERMINAL</span>
                  </div>
                  <button 
                    onClick={() => setIsTerminalOpen(false)}
                    className="text-slate-400 hover:text-white transition-colors p-1"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-sm">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-4 rounded-lg ${
                        msg.role === 'user' 
                          ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100' 
                          : 'bg-slate-800/50 border border-slate-700 text-emerald-400'
                      }`}>
                        <div className="text-xs opacity-50 mb-2 font-bold tracking-wider">
                          {msg.role === 'user' ? 'ENGINEER' : 'AURA'}
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-slate-800/50 border border-slate-700 text-emerald-400 p-4 rounded-lg flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="p-4 bg-slate-900 border-t border-slate-800">
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder="Enter command..."
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      autoFocus
                      disabled={isTyping}
                    />
                    <button 
                      type="submit"
                      disabled={isTyping || !input.trim()}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-colors"
                    >
                      EXECUTE
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(gameOver || gameWon) && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-30 flex items-center justify-center p-8"
              >
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center">
                  {gameWon ? (
                    <>
                      <CheckCircle className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
                      <h2 className="text-3xl font-bold text-white mb-4">MISSION SUCCESS</h2>
                      <p className="text-slate-400 mb-8">All systems stabilized. Hull integrity secured. Time remaining: {formatTime(timeLeft)}</p>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-20 h-20 text-red-500 mx-auto mb-6" />
                      <h2 className="text-3xl font-bold text-white mb-4">HULL BREACH</h2>
                      <p className="text-slate-400 mb-8">Time expired. Critical systems failed. The ship has been lost.</p>
                    </>
                  )}
                  <button 
                    onClick={startGame}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white px-6 py-4 rounded-xl font-semibold transition-colors border border-slate-700"
                  >
                    RESTART SIMULATION
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
