import { useState, useEffect, useRef } from 'react'
import type { IoTNode } from './types'
import { generateNodes, buildAdjacencyList, assignTimeSlots } from './simulation'

const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 420;
const INTERFERENCE_RADIUS = 150;
const MAX_BATTERY = 10000;

// ─── Shared Theme Helpers ────────────────────────────────────────────────────
const getTheme = (isDark: boolean) => ({
  bg: isDark ? 'bg-[#0B1020]' : 'bg-slate-50',
  card: isDark ? 'bg-[#151B2E] border-[#1e2746]' : 'bg-white border-slate-200',
  text: isDark ? 'text-slate-200' : 'text-slate-800',
  textMuted: isDark ? 'text-slate-400' : 'text-slate-500',
  gridBg: isDark ? 'bg-[#0B1020] border-[#1e2746]' : 'bg-slate-50 border-orange-100',
  edgeLine: isDark ? '#1e293b' : '#e2e8f0',
});

// ─── Chaos Simulation Panel ──────────────────────────────────────────────────
function ChaosPanel({
  nodes, adjList, isRunning, collisions, packets, batteryPercent,
  onStart, onStop, canEdit, selectedNode, onNodeRightClick, onNodeLeftClick, isDark
}: {
  nodes: IoTNode[]; adjList: Map<string, string[]>;
  isRunning: boolean; collisions: number; packets: number; batteryPercent: number;
  onStart: () => void; onStop: () => void;
  canEdit: boolean; selectedNode: string | null; 
  onNodeRightClick: (id: string) => void;
  onNodeLeftClick: (id: string) => void;
  isDark: boolean;
}) {
  const theme = getTheme(isDark);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-orange-500">⚡ Chaos Mode</h2>
          <p className={`text-xs ${theme.textMuted}`}>Unoptimized random access</p>
        </div>
        {!isRunning
          ? <button onClick={onStart} disabled={nodes.length === 0 || canEdit}
              className="bg-orange-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-orange-500 transition disabled:opacity-40 font-bold shadow-lg shadow-orange-900/20">
              ▶ Run
            </button>
          : <button onClick={onStop}
              className={`${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'} text-sm px-4 py-1.5 rounded-lg hover:bg-slate-700 transition font-bold`}>
              ⏹ Stop
            </button>
        }
      </div>

      <div className={`${theme.gridBg} rounded-xl overflow-hidden shadow-inner transition-colors duration-500`}>
        <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="w-full h-auto">
          {nodes.map(node =>
            (adjList.get(node.id) || []).map(neighborId => {
              const neighbor = nodes.find(n => n.id === neighborId);
              if (neighbor && node.id < neighbor.id) {
                return <line key={`${node.id}-${neighborId}`}
                  x1={node.x} y1={node.y} x2={neighbor.x} y2={neighbor.y}
                  stroke={theme.edgeLine} strokeWidth="2" strokeDasharray="4 4" className="transition-colors duration-500" />;
              }
              return null;
            })
          )}
          {nodes.map(node => {
            const pct = node.battery / MAX_BATTERY;
            const isSelected = selectedNode === node.id;
            
            // Core Theme Colors
            let nodeColor = isDark ? 'fill-slate-600' : 'fill-slate-300';
            if (node.state === 'COLLISION') nodeColor = 'fill-red-500';
            if (node.state === 'TRANSMIT') nodeColor = 'fill-yellow-400';

            return (
              <g key={node.id} 
                 onClick={() => onNodeLeftClick(node.id)}
                 onContextMenu={(e) => {
                   e.preventDefault(); 
                   if (canEdit) onNodeRightClick(node.id);
                 }}
                 className="cursor-pointer">
                
                {isRunning && node.state === 'TRANSMIT' &&
                  <circle cx={node.x} cy={node.y} r="22" className="fill-yellow-400/20 animate-ping opacity-60 pointer-events-none" />}
                {isRunning && node.state === 'COLLISION' &&
                  <circle cx={node.x} cy={node.y} r="22" className="fill-red-500/40 animate-ping opacity-75 pointer-events-none" />}

                <circle cx={node.x} cy={node.y} r="11"
                  className={`transition-all duration-200 ${nodeColor}
                    ${isSelected ? 'stroke-cyan-400 stroke-[4px]' : isDark ? 'stroke-[#151B2E] stroke-2' : 'stroke-white stroke-2'}
                    ${canEdit && !isSelected ? 'hover:stroke-cyan-400 hover:stroke-[3px]' : ''}`} />
                
                <text x={node.x} y={node.y - 16} fontSize="9" textAnchor="middle" className={`${isDark ? 'fill-slate-400' : 'fill-slate-500'} font-semibold pointer-events-none`}>
                  {node.id.replace('Node_', '')}
                </text>
                
                <rect x={node.x - 11} y={node.y + 14} width="22" height="3" className={`${isDark ? 'fill-slate-800' : 'fill-slate-200'} pointer-events-none`} rx="1.5" />
                <rect x={node.x - 11} y={node.y + 14} width={22 * Math.max(0, pct)} height="3"
                  className={`${pct > 0.4 ? 'fill-green-500' : pct > 0.15 ? 'fill-yellow-500' : 'fill-red-500'} pointer-events-none`}
                  rx="1.5" style={{ transition: 'width 0.3s ease' }} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className={`${isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-orange-50 border-orange-100'} rounded-lg p-2 border transition-colors duration-500`}>
          <div className="font-bold text-orange-500">{packets}</div>
          <div className={`text-[10px] uppercase tracking-wide font-bold ${theme.textMuted}`}>Packets</div>
        </div>
        <div className={`${isDark ? 'bg-red-900/20 border-red-900/50' : 'bg-red-50 border-red-100'} rounded-lg p-2 border transition-colors duration-500`}>
          <div className="font-bold text-red-500">{collisions}</div>
          <div className={`text-[10px] uppercase tracking-wide font-bold ${theme.textMuted}`}>Collisions</div>
        </div>
        <div className={`rounded-lg p-2 border transition-colors duration-500 ${batteryPercent > 50 ? (isDark ? 'bg-green-900/20 border-green-900/50' : 'bg-green-50 border-green-100') : batteryPercent > 20 ? (isDark ? 'bg-yellow-900/20 border-yellow-900/50' : 'bg-yellow-50 border-yellow-100') : (isDark ? 'bg-red-900/20 border-red-900/50' : 'bg-red-50 border-red-100')}`}>
          <div className={`font-bold ${batteryPercent > 50 ? 'text-green-500' : batteryPercent > 20 ? 'text-yellow-500' : 'text-red-500'}`}>
            {Math.round(batteryPercent)}%
          </div>
          <div className={`text-[10px] uppercase tracking-wide font-bold ${theme.textMuted}`}>Battery</div>
        </div>
      </div>
    </div>
  );
}

// ─── Optimized Simulation Panel ───────────────────────────────────────────────
function OptimizedPanel({
  nodes, adjList, isRunning, packets, batteryPercent,
  onStart, onStop, canEdit, selectedNode, onNodeRightClick, onNodeLeftClick, isDark
}: {
  nodes: IoTNode[]; adjList: Map<string, string[]>;
  isRunning: boolean; packets: number; batteryPercent: number;
  onStart: () => void; onStop: () => void;
  canEdit: boolean; selectedNode: string | null; 
  onNodeRightClick: (id: string) => void;
  onNodeLeftClick: (id: string) => void;
  isDark: boolean;
}) {
  const theme = getTheme(isDark);
  const slotIndicatorColors = ['fill-cyan-400','fill-purple-500','fill-pink-500','fill-blue-500','fill-orange-500','fill-teal-400'];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-cyan-400">🎯 Graph Coloring</h2>
          <p className={`text-xs ${theme.textMuted}`}>Zero-collision scheduling</p>
        </div>
        {!isRunning
          ? <button onClick={onStart} disabled={nodes.length === 0 || canEdit}
              className="bg-cyan-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-cyan-500 transition disabled:opacity-40 font-bold shadow-lg shadow-cyan-900/20">
              ▶ Run
            </button>
          : <button onClick={onStop}
              className={`${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'} text-sm px-4 py-1.5 rounded-lg hover:bg-slate-700 transition font-bold`}>
              ⏹ Stop
            </button>
        }
      </div>

      <div className={`${theme.gridBg} rounded-xl overflow-hidden shadow-inner transition-colors duration-500`}>
        <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="w-full h-auto">
          {nodes.map(node =>
            (adjList.get(node.id) || []).map(neighborId => {
              const neighbor = nodes.find(n => n.id === neighborId);
              if (neighbor && node.id < neighbor.id) {
                return <line key={`${node.id}-${neighborId}`}
                  x1={node.x} y1={node.y} x2={neighbor.x} y2={neighbor.y}
                  stroke={theme.edgeLine} strokeWidth="2" strokeDasharray="4 4" className="transition-colors duration-500" />;
              }
              return null;
            })
          )}
          {nodes.map(node => {
            const pct = node.battery / MAX_BATTERY;
            const isSelected = selectedNode === node.id;
            
            // Core Theme Colors: Green -> Optimized, Yellow -> Transmit
            const isAssigned = node.color >= 0;
            let nodeColor = isDark ? 'fill-slate-600' : 'fill-slate-300';
            if (isAssigned) nodeColor = 'fill-emerald-500'; // Green -> Optimized
            if (node.state === 'TRANSMIT') nodeColor = 'fill-yellow-400'; // Yellow -> Active

            const assignedIndicator = isAssigned ? slotIndicatorColors[node.color % slotIndicatorColors.length] : 'fill-transparent';
            
            return (
              <g key={node.id}
                 onClick={() => onNodeLeftClick(node.id)}
                 onContextMenu={(e) => {
                   e.preventDefault(); 
                   if (canEdit) onNodeRightClick(node.id);
                 }}
                 className="cursor-pointer">
                {isRunning && node.state === 'TRANSMIT' &&
                  <circle cx={node.x} cy={node.y} r="22" className="fill-yellow-400/20 animate-ping opacity-60 pointer-events-none" />}

                <circle cx={node.x} cy={node.y} r="11"
                  className={`transition-all duration-200 ${nodeColor}
                    ${isSelected ? 'stroke-cyan-400 stroke-[4px]' : isDark ? 'stroke-[#151B2E] stroke-2' : 'stroke-white stroke-2'}
                    ${canEdit && !isSelected ? 'hover:stroke-cyan-400 hover:stroke-[3px]' : ''}`} />
                
                {/* Tiny dot to show WHICH time slot they belong to */}
                {isAssigned &&
                  <circle cx={node.x + 8} cy={node.y - 8} r="3.5" className={`${assignedIndicator} pointer-events-none stroke-[#151B2E] stroke-[1.5px]`} />}
                
                <text x={node.x} y={node.y - 16} fontSize="9" textAnchor="middle" className={`${isDark ? 'fill-slate-400' : 'fill-slate-500'} font-semibold pointer-events-none`}>
                  {node.id.replace('Node_', '')}
                </text>
                
                <rect x={node.x - 11} y={node.y + 14} width="22" height="3" className={`${isDark ? 'fill-slate-800' : 'fill-slate-200'} pointer-events-none`} rx="1.5" />
                <rect x={node.x - 11} y={node.y + 14} width={22 * Math.max(0, pct)} height="3"
                  className={`${pct > 0.4 ? 'fill-green-500' : pct > 0.15 ? 'fill-yellow-500' : 'fill-red-500'} pointer-events-none`}
                  rx="1.5" style={{ transition: 'width 0.3s ease' }} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className={`${isDark ? 'bg-cyan-900/20 border-cyan-900/50' : 'bg-blue-50 border-blue-100'} rounded-lg p-2 border transition-colors duration-500`}>
          <div className="font-bold text-cyan-500">{packets}</div>
          <div className={`text-[10px] uppercase tracking-wide font-bold ${theme.textMuted}`}>Packets</div>
        </div>
        <div className={`${isDark ? 'bg-green-900/20 border-green-900/50' : 'bg-green-50 border-green-100'} rounded-lg p-2 border transition-colors duration-500`}>
          <div className="font-bold text-green-500">0</div>
          <div className={`text-[10px] uppercase tracking-wide font-bold ${theme.textMuted}`}>Collisions</div>
        </div>
        <div className={`rounded-lg p-2 border transition-colors duration-500 ${batteryPercent > 50 ? (isDark ? 'bg-green-900/20 border-green-900/50' : 'bg-green-50 border-green-100') : batteryPercent > 20 ? (isDark ? 'bg-yellow-900/20 border-yellow-900/50' : 'bg-yellow-50 border-yellow-100') : (isDark ? 'bg-red-900/20 border-red-900/50' : 'bg-red-50 border-red-100')}`}>
          <div className={`font-bold ${batteryPercent > 50 ? 'text-green-500' : batteryPercent > 20 ? 'text-yellow-500' : 'text-red-500'}`}>
            {Math.round(batteryPercent)}%
          </div>
          <div className={`text-[10px] uppercase tracking-wide font-bold ${theme.textMuted}`}>Battery</div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(true);
  const theme = getTheme(isDark);

  const [nodeCount, setNodeCount] = useState(12);
  const [editMode, setEditMode] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);

  const [adjList, setAdjList] = useState<Map<string, string[]>>(new Map());
  const [generated, setGenerated] = useState(false);

  const [chaosNodes, setChaosNodes] = useState<IoTNode[]>([]);
  const [chaosRunning, setChaosRunning] = useState(false);
  const [chaosCollisions, setChaosCollisions] = useState(0);
  const [chaosPackets, setChaosPackets] = useState(0);

  const [optNodes, setOptNodes] = useState<IoTNode[]>([]);
  const [optRunning, setOptRunning] = useState(false);
  const [_optCurrentSlot, setOptCurrentSlot] = useState(0);
  const [optMaxSlot, setOptMaxSlot] = useState(0);
  const [optPackets, setOptPackets] = useState(0);
  const optSlotRef = useRef(0); 

  const eitherRunning = chaosRunning || optRunning;
  const canEdit = editMode && !eitherRunning;

  // ── Network Generation ────────────────────────────────────────────────────
  const handleGenerate = () => {
    const safeCount = Math.min(Math.max(nodeCount, 2), 50);
    const base = generateNodes(safeCount, CANVAS_WIDTH, CANVAS_HEIGHT);
    const adj = buildAdjacencyList(base, INTERFERENCE_RADIUS);
    const optimized = assignTimeSlots(base.map(n => ({ ...n })), adj);
    
    setAdjList(adj);
    setChaosNodes(base.map(n => ({ ...n, state: 'IDLE' as const })));
    setOptNodes(optimized);
    setOptMaxSlot(optimized.length > 0 ? Math.max(...optimized.map(n => n.color)) : 0);
    
    resetSimulations();
    setGenerated(true);
    setInspectedNodeId(null);
  };

  const handleClearEdges = () => {
    if (!generated) return;
    const nextAdj = new Map<string, string[]>();
    chaosNodes.forEach(n => nextAdj.set(n.id, []));
    setAdjList(nextAdj);
    reassignColors(nextAdj);
    setSelectedNode(null);
  };

  const resetSimulations = () => {
    setChaosRunning(false);
    setOptRunning(false);
    setChaosCollisions(0);
    setChaosPackets(0);
    setOptPackets(0);
    setOptCurrentSlot(0);
    optSlotRef.current = 0;
  }

  // ── Edge & Node Editing ───────────────────────────────────────────────────
  const reassignColors = (newAdj: Map<string, string[]>) => {
    setOptNodes(prev => {
      const base = prev.map(n => ({ ...n, color: -1 })); 
      const optimized = assignTimeSlots(base, newAdj);
      setOptMaxSlot(optimized.length > 0 ? Math.max(...optimized.map(n => n.color)) : 0);
      return optimized;
    });
  };

  const handleNodeClick = (nodeId: string) => {
    if (!selectedNode) {
      setSelectedNode(nodeId); 
    } else if (selectedNode === nodeId) {
      setSelectedNode(null);   
    } else {
      setAdjList(prev => {
        const next = new Map(prev);
        const edges1 = next.get(selectedNode) || [];
        const edges2 = next.get(nodeId) || [];

        if (edges1.includes(nodeId)) {
          next.set(selectedNode, edges1.filter(id => id !== nodeId));
          next.set(nodeId, edges2.filter(id => id !== selectedNode));
        } else {
          next.set(selectedNode, [...edges1, nodeId]);
          next.set(nodeId, [...edges2, selectedNode]);
        }
        reassignColors(next); 
        return next;
      });
    }
  };

  const handleRemoveEdge = (nodeA: string, nodeB: string) => {
    setAdjList(prev => {
      const next = new Map(prev);
      const edgesA = next.get(nodeA) || [];
      const edgesB = next.get(nodeB) || [];
      next.set(nodeA, edgesA.filter(id => id !== nodeB));
      next.set(nodeB, edgesB.filter(id => id !== nodeA));
      reassignColors(next);
      return next;
    });
  };

  const handleDeleteNode = (nodeIdToDelete: string) => {
    setChaosNodes(prev => prev.filter(n => n.id !== nodeIdToDelete));
    setAdjList(prevAdj => {
      const nextAdj = new Map(prevAdj);
      nextAdj.delete(nodeIdToDelete); 
      nextAdj.forEach((neighbors, key) => {
        nextAdj.set(key, neighbors.filter(id => id !== nodeIdToDelete));
      });
      setOptNodes(prevOpt => {
        const remaining = prevOpt.filter(n => n.id !== nodeIdToDelete).map(n => ({ ...n, color: -1 }));
        const optimized = assignTimeSlots(remaining, nextAdj);
        setOptMaxSlot(optimized.length > 0 ? Math.max(...optimized.map(n => n.color)) : 0);
        return optimized;
      });
      return nextAdj;
    });
    if (selectedNode === nodeIdToDelete) setSelectedNode(null);
    setInspectedNodeId(null); 
  };

  // ── Run Controls ──────────────────────────────────────────────────────────
  const handleRunBoth = () => { setChaosRunning(true); setOptRunning(true); setEditMode(false); setSelectedNode(null); setInspectedNodeId(null); };
  const handleStopBoth = () => { setChaosRunning(false); setOptRunning(false); };

  // ── Chaos Loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chaosRunning) return;
    const interval = setInterval(() => {
      setChaosNodes(currentNodes => {
        const attempting = new Set(currentNodes.filter(() => Math.random() < 0.20).map(n => n.id));
        const collided = new Set<string>();
        attempting.forEach(id => {
          const neighbors = adjList.get(id) || [];
          if (neighbors.some(nId => attempting.has(nId))) collided.add(id);
        });

        let tickCollisions = 0, tickSuccesses = 0;
        const updated = currentNodes.map(node => {
          if (collided.has(node.id)) {
            tickCollisions++;
            return { ...node, state: 'COLLISION' as const, battery: Math.max(0, node.battery - 300) };
          } else if (attempting.has(node.id)) {
            tickSuccesses++;
            return { ...node, state: 'TRANSMIT' as const, battery: Math.max(0, node.battery - 150) };
          }
          return { ...node, state: 'SLEEP' as const, battery: Math.max(0, node.battery - 5) };
        });

        setChaosCollisions(p => p + Math.floor(tickCollisions / 2));
        setChaosPackets(p => p + tickSuccesses);
        return updated;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [chaosRunning, adjList]);

  // ── Optimized Loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!optRunning) return;
    const interval = setInterval(() => {
      const nextSlot = optSlotRef.current >= optMaxSlot ? 0 : optSlotRef.current + 1;
      optSlotRef.current = nextSlot;
      setOptCurrentSlot(nextSlot);

      setOptNodes(currentNodes => {
        let tickSuccesses = 0;
        const updated = currentNodes.map(node => {
          const transmitting = node.color === nextSlot;
          if (transmitting) tickSuccesses++;
          return {
            ...node,
            battery: Math.max(0, node.battery - (transmitting ? 150 : 5)),
            state: transmitting ? 'TRANSMIT' as const : 'SLEEP' as const,
          };
        });
        setOptPackets(p => p + tickSuccesses);
        return updated;
      });
    }, 600);
    return () => clearInterval(interval);
  }, [optRunning, optMaxSlot]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const chaosBattery = chaosNodes.length > 0 ? (chaosNodes.reduce((s, n) => s + n.battery, 0) / chaosNodes.length / MAX_BATTERY) * 100 : 0;
  const optBattery = optNodes.length > 0 ? (optNodes.reduce((s, n) => s + n.battery, 0) / optNodes.length / MAX_BATTERY) * 100 : 0;
  const collisionRate = (chaosPackets + chaosCollisions) > 0 ? Math.round((chaosCollisions / (chaosPackets + chaosCollisions)) * 100) : 0;
  const batteryAdvantage = Math.round(optBattery - chaosBattery);
  const packetAdvantage = chaosPackets > 0 ? Math.round(((optPackets - chaosPackets) / chaosPackets) * 100) : 0;

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} p-6 flex flex-col items-center font-sans transition-colors duration-500 relative`}>
      
      {/* Dark Mode Toggle */}
      <button 
        onClick={() => setIsDark(!isDark)} 
        className={`absolute top-6 right-8 px-4 py-2 rounded-full font-bold text-sm transition-all duration-300 shadow-md flex items-center gap-2
          ${isDark ? 'bg-[#1e293b] text-cyan-400 border border-[#334155] hover:bg-[#283548]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
      >
        {isDark ? '☀️ Light Mode' : '🌙 Dark Mode'}
      </button>

      <header className="mb-6 text-center pt-2">
        <h1 className={`text-4xl font-extrabold mb-2 tracking-tight ${isDark ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-500 to-emerald-400' : 'text-slate-800'}`}>
          Network Operations Center
        </h1>
        <p className={`${theme.textMuted} text-sm font-medium uppercase tracking-widest`}>Graph Coloring vs. Random Access</p>
      </header>

      {/* Control Panel */}
      <div className="flex flex-col items-center mb-6 w-full max-w-4xl gap-3">
        <div className={`flex flex-wrap gap-3 justify-center items-center ${theme.card} p-3 rounded-2xl shadow-sm border transition-colors duration-500`}>
          <div className="flex items-center gap-2 px-2">
            <label className={`text-sm font-semibold ${theme.text}`}>Nodes:</label>
            <input 
              type="number" min="2" max="50" value={nodeCount}
              onChange={(e) => setNodeCount(Number(e.target.value))}
              className={`w-14 border rounded px-2 py-1 text-sm outline-none font-mono transition-colors
                ${isDark ? 'bg-[#0B1020] border-[#334155] text-white focus:border-cyan-500' : 'border-slate-300 focus:border-blue-500'}`}
            />
          </div>

          <button onClick={handleGenerate} disabled={eitherRunning}
            className={`px-4 py-1.5 rounded-lg transition text-sm font-bold shadow-sm disabled:opacity-50
              ${isDark ? 'bg-[#1e293b] text-white hover:bg-[#2a3850]' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
            🔄 Auto-Generate
          </button>
          
          <div className={`h-6 w-px ${isDark ? 'bg-[#334155]' : 'bg-slate-200'} mx-1`}></div>
          
          <button onClick={handleClearEdges} disabled={!generated || eitherRunning}
            className={`px-4 py-1.5 rounded-lg border transition text-sm font-bold disabled:opacity-50
              ${isDark ? 'bg-transparent border-[#334155] text-slate-300 hover:bg-[#1e293b]' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'}`}>
            ✂️ Clear Edges
          </button>

          <button onClick={() => { setEditMode(!editMode); setSelectedNode(null); }} disabled={!generated || eitherRunning}
            className={`px-4 py-1.5 rounded-lg border transition text-sm font-bold disabled:opacity-50 shadow-sm
              ${editMode 
                ? (isDark ? 'bg-purple-900/40 text-purple-300 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-purple-100 text-purple-700 border-purple-300') 
                : (isDark ? 'bg-transparent text-slate-300 border-[#334155] hover:bg-[#1e293b]' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50')}`}>
            {editMode ? '✍️ Editing Active...' : '✏️ Draw Connections'}
          </button>

          <div className={`h-6 w-px ${isDark ? 'bg-[#334155]' : 'bg-slate-200'} mx-1`}></div>

          {generated && !eitherRunning && (
            <button onClick={handleRunBoth}
              className={`px-5 py-1.5 rounded-lg transition text-sm font-bold shadow-lg
                ${isDark ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/20' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
              ▶▶ Run Both
            </button>
          )}
          {eitherRunning && (
            <button onClick={handleStopBoth}
              className={`px-5 py-1.5 rounded-lg transition text-sm font-bold shadow-sm border
                ${isDark ? 'bg-red-900/30 text-red-400 border-red-900/50 hover:bg-red-900/50' : 'bg-red-100 text-red-600 border-red-200 hover:bg-red-200'}`}>
              ⏹ Stop Both
            </button>
          )}
        </div>

        {canEdit && (
          <div className={`text-sm px-4 py-2 rounded-lg animate-pulse border
            ${isDark ? 'bg-purple-900/20 text-purple-300 border-purple-500/30' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
            <strong>Edit Mode:</strong> <b>Right-click</b> nodes to connect them. <b>Left-click</b> a node to view its details or delete it.
          </div>
        )}
      </div>

      {/* Node Inspector Panel */}
      {inspectedNodeId && (
        <div className={`w-full max-w-5xl p-5 rounded-2xl shadow-xl border mb-6 flex flex-wrap items-center justify-between animate-fade-in relative transition-colors duration-500
          ${isDark ? 'bg-[#1e293b] border-purple-500/30 shadow-[0_4px_30px_rgba(168,85,247,0.1)]' : 'bg-white border-indigo-200'}`}>
          <button onClick={() => setInspectedNodeId(null)} className={`absolute top-3 right-5 font-bold text-xl transition hover:scale-110 ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}>
            ✕
          </button>

          {(() => {
            const node = optNodes.find(n => n.id === inspectedNodeId);
            if (!node) return null;
            const neighbors = adjList.get(node.id) || [];
            
            return (
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-6">
                  {/* Avatar */}
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-inner
                    ${node.color === 0 ? 'bg-cyan-500' : node.color === 1 ? 'bg-purple-500' : node.color === 2 ? 'bg-pink-500' : node.color === 3 ? 'bg-blue-500' : node.color === 4 ? 'bg-orange-500' : 'bg-slate-500'}`}>
                    {node.id.replace('Node_', '')}
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-8">
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Assigned Slot</span>
                        <span className={`font-mono font-bold text-lg ${isDark ? 'text-white' : 'text-slate-700'}`}>
                          {node.color >= 0 ? `Slot ${node.color}` : 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-[120px]">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Battery Status</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>{Math.round((node.battery / MAX_BATTERY) * 100)}%</span>
                          <div className={`w-16 rounded-full h-2.5 ${isDark ? 'bg-[#0B1020]' : 'bg-slate-200'}`}>
                            <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${(node.battery / MAX_BATTERY) * 100}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Neighbor Chips */}
                    <div className="flex flex-col">
                      <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Interfering Neighbors</span>
                      <div className="flex flex-wrap gap-2">
                        {neighbors.length === 0 ? (
                          <span className="text-sm font-bold text-slate-500 italic">No interference detected</span>
                        ) : (
                          neighbors.map(nId => (
                            <div key={nId} className={`flex items-center pl-2 pr-1 py-1 rounded text-xs font-bold border
                              ${isDark ? 'bg-orange-900/20 text-orange-400 border-orange-900/50' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                              Node {nId.replace('Node_', '')}
                              {canEdit && (
                                <button 
                                  onClick={() => handleRemoveEdge(node.id, nId)} 
                                  className={`ml-1 rounded-full w-5 h-5 flex items-center justify-center transition
                                    ${isDark ? 'text-orange-500 hover:bg-orange-500/20 hover:text-red-400' : 'text-orange-400 hover:text-red-500 hover:bg-orange-100'}`}
                                >✕</button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {canEdit && (
                  <div className={`flex flex-col justify-center ml-4 border-l pl-6 h-full ${isDark ? 'border-[#334155]' : 'border-slate-100'}`}>
                    <button 
                      onClick={() => handleDeleteNode(node.id)} 
                      className={`px-4 py-2 rounded-lg text-sm font-bold border transition shadow-sm flex items-center gap-2
                        ${isDark ? 'bg-red-900/20 text-red-400 border-red-900/50 hover:bg-red-900/40 hover:text-red-300' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:text-red-700'}`}
                    >
                      <span className="text-lg">🗑️</span> Delete Node
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Two simulation panels */}
      <div className="w-full max-w-7xl grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className={`${theme.card} rounded-2xl shadow-sm border p-4 transition-colors duration-500`}>
          <ChaosPanel
            nodes={chaosNodes} adjList={adjList} isRunning={chaosRunning} collisions={chaosCollisions} packets={chaosPackets} batteryPercent={chaosBattery}
            onStart={() => setChaosRunning(true)} onStop={() => setChaosRunning(false)}
            canEdit={canEdit} selectedNode={selectedNode} onNodeRightClick={handleNodeClick} onNodeLeftClick={setInspectedNodeId} isDark={isDark}
          />
        </div>
        <div className={`${theme.card} rounded-2xl shadow-sm border p-4 transition-colors duration-500`}>
          <OptimizedPanel
            nodes={optNodes} adjList={adjList} isRunning={optRunning} packets={optPackets} batteryPercent={optBattery}
            onStart={() => setOptRunning(true)} onStop={() => setOptRunning(false)}
            canEdit={canEdit} selectedNode={selectedNode} onNodeRightClick={handleNodeClick} onNodeLeftClick={setInspectedNodeId} isDark={isDark}
          />
        </div>
      </div>

      {/* Comparison strip */}
      {generated && (
        <div className={`w-full max-w-7xl ${theme.card} rounded-2xl shadow-sm border p-5 transition-colors duration-500`}>
          <h3 className={`text-[11px] font-bold uppercase tracking-widest mb-4 ${theme.textMuted}`}>
            📊 Head-to-Head Comparison
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">

            <div className="flex flex-col gap-1">
              <div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Collision Rate</div>
              <div className="flex justify-around items-end">
                <div><div className="text-2xl font-black text-red-500">{collisionRate}%</div><div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Chaos</div></div>
                <div className="text-slate-500 text-lg">vs</div>
                <div><div className="text-2xl font-black text-green-500">0%</div><div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Optimized</div></div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Avg Battery</div>
              <div className="flex justify-around items-end">
                <div><div className="text-2xl font-black text-orange-500">{Math.round(chaosBattery)}%</div><div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Chaos</div></div>
                <div className="text-slate-500 text-lg">vs</div>
                <div><div className="text-2xl font-black text-cyan-500">{Math.round(optBattery)}%</div><div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Optimized</div></div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Total Packets</div>
              <div className="flex justify-around items-end">
                <div><div className="text-2xl font-black text-orange-500">{chaosPackets}</div><div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Chaos</div></div>
                <div className="text-slate-500 text-lg">vs</div>
                <div><div className="text-2xl font-black text-cyan-500">{optPackets}</div><div className={`text-[10px] font-bold uppercase ${theme.textMuted}`}>Optimized</div></div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-1">
              <div className={`text-[10px] font-bold uppercase ${theme.textMuted} mb-1`}>Optimized Advantage</div>
              <div className="flex flex-col gap-1.5 w-full">
                <div className={`text-xs px-2 py-1 rounded font-bold text-center ${isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'}`}>
                  {batteryAdvantage >= 0 ? '🔋 +' : '🔋 '}{batteryAdvantage}% battery
                </div>
                <div className={`text-xs px-2 py-1 rounded font-bold text-center ${isDark ? 'bg-cyan-900/30 text-cyan-400' : 'bg-cyan-100 text-cyan-700'}`}>
                  {packetAdvantage >= 0 ? '📦 +' : '📦 '}{packetAdvantage}% throughput
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
