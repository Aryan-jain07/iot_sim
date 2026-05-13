import { useState, useEffect, useRef } from 'react'
import type { IoTNode } from './types'
import { generateNodes, buildAdjacencyList, assignTimeSlots } from './simulation'

const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 420;
const INTERFERENCE_RADIUS = 150;
const MAX_BATTERY = 10000;

// ─── Chaos Simulation Panel ──────────────────────────────────────────────────
function ChaosPanel({
  nodes, adjList, isRunning, collisions, packets, batteryPercent,
  onStart, onStop, canEdit, selectedNode, onNodeRightClick, onNodeLeftClick
}: {
  nodes: IoTNode[]; adjList: Map<string, string[]>;
  isRunning: boolean; collisions: number; packets: number; batteryPercent: number;
  onStart: () => void; onStop: () => void;
  canEdit: boolean; selectedNode: string | null; 
  onNodeRightClick: (id: string) => void;
  onNodeLeftClick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-orange-600">⚡ Chaos Mode</h2>
          <p className="text-xs text-slate-400">Unoptimized — random access, no coordination</p>
        </div>
        {!isRunning
          ? <button onClick={onStart} disabled={nodes.length === 0 || canEdit}
              className="bg-orange-500 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-orange-400 transition disabled:opacity-40">
              ▶ Run
            </button>
          : <button onClick={onStop}
              className="bg-slate-200 text-slate-700 text-sm px-4 py-1.5 rounded-lg hover:bg-slate-300 transition font-bold">
              ⏹ Stop
            </button>
        }
      </div>

      <div className="bg-slate-50 rounded-xl border border-orange-100 overflow-hidden">
        <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="w-full h-auto">
          {nodes.map(node =>
            (adjList.get(node.id) || []).map(neighborId => {
              const neighbor = nodes.find(n => n.id === neighborId);
              if (neighbor && node.id < neighbor.id) {
                return <line key={`${node.id}-${neighborId}`}
                  x1={node.x} y1={node.y} x2={neighbor.x} y2={neighbor.y}
                  stroke="#fed7aa" strokeWidth="2" strokeDasharray="4 4" />;
              }
              return null;
            })
          )}
          {nodes.map(node => {
            const pct = node.battery / MAX_BATTERY;
            const isSelected = selectedNode === node.id;
            return (
              <g key={node.id} 
                 onContextMenu={(e) => {
                 e.preventDefault(); // Stops the browser right-click menu
                 if (canEdit) onNodeRightClick(node.id);
                 }}
                className={canEdit ? "cursor-pointer" : ""}>
                {isRunning && node.state === 'TRANSMIT' &&
                  <circle cx={node.x} cy={node.y} r="22" className="fill-green-200 animate-ping opacity-60 pointer-events-none" />}
                {isRunning && node.state === 'COLLISION' &&
                  <circle cx={node.x} cy={node.y} r="22" className="fill-red-300 animate-ping opacity-75 pointer-events-none" />}

                <circle cx={node.x} cy={node.y} r="11"
                  className={`transition-all duration-200 
                    ${isSelected ? 'stroke-yellow-400 stroke-[4px]' : 'stroke-white stroke-2'}
                    ${canEdit && !isSelected ? 'hover:stroke-yellow-200 hover:stroke-[3px]' : ''}
                    ${isRunning && node.state === 'COLLISION' ? 'fill-red-500'
                    : isRunning && node.state === 'TRANSMIT' ? 'fill-orange-500'
                    : 'fill-slate-300'}`} />
                <text x={node.x} y={node.y - 16} fontSize="9" textAnchor="middle" className="fill-slate-500 font-semibold pointer-events-none">
                  {node.id.replace('Node_', '')}
                </text>
                <rect x={node.x - 11} y={node.y + 14} width="22" height="3" className="fill-slate-200 pointer-events-none" rx="1.5" />
                <rect x={node.x - 11} y={node.y + 14} width={22 * Math.max(0, pct)} height="3"
                  className={`${pct > 0.4 ? 'fill-green-500' : pct > 0.15 ? 'fill-yellow-500' : 'fill-red-500'} pointer-events-none`}
                  rx="1.5" style={{ transition: 'width 0.3s ease' }} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="bg-orange-50 rounded-lg p-2 border border-orange-100">
          <div className="font-bold text-orange-600">{packets}</div>
          <div className="text-xs text-slate-400">Packets</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2 border border-red-100">
          <div className="font-bold text-red-600">{collisions}</div>
          <div className="text-xs text-slate-400">Collisions</div>
        </div>
        <div className={`rounded-lg p-2 border ${batteryPercent > 50 ? 'bg-green-50 border-green-100' : batteryPercent > 20 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}>
          <div className={`font-bold ${batteryPercent > 50 ? 'text-green-600' : batteryPercent > 20 ? 'text-yellow-600' : 'text-red-600'}`}>
            {Math.round(batteryPercent)}%
          </div>
          <div className="text-xs text-slate-400">Battery</div>
        </div>
      </div>
    </div>
  );
}

// ─── Optimized Simulation Panel ──────────────────────────────────────────────
function OptimizedPanel({
  nodes, adjList, isRunning, packets, batteryPercent,
  onStart, onStop, canEdit, selectedNode, onNodeRightClick, onNodeLeftClick
}: {
  nodes: IoTNode[]; adjList: Map<string, string[]>;
  isRunning: boolean; packets: number; batteryPercent: number;
  onStart: () => void; onStop: () => void;
  canEdit: boolean; selectedNode: string | null; 
  onNodeRightClick: (id: string) => void;
  onNodeLeftClick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-blue-600">🎯 Graph Coloring</h2>
          <p className="text-xs text-slate-400">Optimized — scheduled time slots, zero collisions</p>
        </div>
        {!isRunning
          ? <button onClick={onStart} disabled={nodes.length === 0 || canEdit}
              className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-500 transition disabled:opacity-40">
              ▶ Run
            </button>
          : <button onClick={onStop}
              className="bg-slate-200 text-slate-700 text-sm px-4 py-1.5 rounded-lg hover:bg-slate-300 transition font-bold">
              ⏹ Stop
            </button>
        }
      </div>

      <div className="bg-slate-50 rounded-xl border border-blue-100 overflow-hidden">
        <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} className="w-full h-auto">
          {nodes.map(node =>
            (adjList.get(node.id) || []).map(neighborId => {
              const neighbor = nodes.find(n => n.id === neighborId);
              if (neighbor && node.id < neighbor.id) {
                return <line key={`${node.id}-${neighborId}`}
                  x1={node.x} y1={node.y} x2={neighbor.x} y2={neighbor.y}
                  stroke="#bfdbfe" strokeWidth="2" strokeDasharray="4 4" />;
              }
              return null;
            })
          )}
          {nodes.map(node => {
            const pct = node.battery / MAX_BATTERY;
            const isSelected = selectedNode === node.id;
            const slotColors = ['fill-blue-500','fill-emerald-500','fill-purple-500','fill-amber-500','fill-pink-500','fill-teal-500'];
            const assignedColor = node.color >= 0 ? slotColors[node.color % slotColors.length] : 'fill-slate-300';
            
            return (
              <g key={node.id} 
   onContextMenu={(e) => {
     e.preventDefault(); // Stops the browser right-click menu
     if (canEdit) onNodeRightClick(node.id);
   }}
   className={canEdit ? "cursor-pointer" : ""}>
                {isRunning && node.state === 'TRANSMIT' &&
                  <circle cx={node.x} cy={node.y} r="22" className="fill-blue-200 animate-ping opacity-60 pointer-events-none" />}

                <circle cx={node.x} cy={node.y} r="11"
                  className={`transition-all duration-200
                    ${isSelected ? 'stroke-yellow-400 stroke-[4px]' : 'stroke-white stroke-2'}
                    ${canEdit && !isSelected ? 'hover:stroke-yellow-200 hover:stroke-[3px]' : ''}
                    ${isRunning && node.state === 'TRANSMIT' ? assignedColor : 'fill-slate-300'}`} />
                
                {node.color >= 0 &&
                  <circle cx={node.x + 8} cy={node.y - 8} r="4" className={`${assignedColor} pointer-events-none`} />}
                <text x={node.x} y={node.y - 16} fontSize="9" textAnchor="middle" className="fill-slate-500 font-semibold pointer-events-none">
                  {node.id.replace('Node_', '')}
                </text>
                
                <rect x={node.x - 11} y={node.y + 14} width="22" height="3" className="fill-slate-200 pointer-events-none" rx="1.5" />
                <rect x={node.x - 11} y={node.y + 14} width={22 * Math.max(0, pct)} height="3"
                  className={`${pct > 0.4 ? 'fill-green-500' : pct > 0.15 ? 'fill-yellow-500' : 'fill-red-500'} pointer-events-none`}
                  rx="1.5" style={{ transition: 'width 0.3s ease' }} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
          <div className="font-bold text-blue-600">{packets}</div>
          <div className="text-xs text-slate-400">Packets</div>
        </div>
        <div className="bg-green-50 rounded-lg p-2 border border-green-100">
          <div className="font-bold text-green-600">0</div>
          <div className="text-xs text-slate-400">Collisions</div>
        </div>
        <div className={`rounded-lg p-2 border ${batteryPercent > 50 ? 'bg-green-50 border-green-100' : batteryPercent > 20 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}>
          <div className={`font-bold ${batteryPercent > 50 ? 'text-green-600' : batteryPercent > 20 ? 'text-yellow-600' : 'text-red-600'}`}>
            {Math.round(batteryPercent)}%
          </div>
          <div className="text-xs text-slate-400">Battery</div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Config & Topology
  const [nodeCount, setNodeCount] = useState(12);
  const [editMode, setEditMode] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const [adjList, setAdjList] = useState<Map<string, string[]>>(new Map());
  const [generated, setGenerated] = useState(false);

  // Chaos state
  const [chaosNodes, setChaosNodes] = useState<IoTNode[]>([]);
  const [chaosRunning, setChaosRunning] = useState(false);
  const [chaosCollisions, setChaosCollisions] = useState(0);
  const [chaosPackets, setChaosPackets] = useState(0);

  // Optimized state
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
    // Prevent huge numbers from breaking the canvas
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

  // ── Manual Edge Editing ───────────────────────────────────────────────────
  const reassignColors = (newAdj: Map<string, string[]>) => {
    setOptNodes(prev => {
      const base = prev.map(n => ({ ...n, color: -1 })); // Reset old colors
      const optimized = assignTimeSlots(base, newAdj);
      setOptMaxSlot(optimized.length > 0 ? Math.max(...optimized.map(n => n.color)) : 0);
      return optimized;
    });
  };

  const handleNodeClick = (nodeId: string) => {
    if (!selectedNode) {
      setSelectedNode(nodeId); // Select first node
    } else if (selectedNode === nodeId) {
      setSelectedNode(null);   // Deselect if clicking same node
    } else {
      // Toggle edge between selectedNode and clicked node
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
        reassignColors(next); // Update coloring immediately
        return next;
      });
      // We purposefully do NOT set selectedNode to null here.
      // This allows the user to quickly connect one node to many others!
    }
  };

  // ── Run Controls ──────────────────────────────────────────────────────────
  const handleRunBoth = () => { setChaosRunning(true); setOptRunning(true); setEditMode(false); setSelectedNode(null); };
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
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center font-sans text-slate-800">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-1">IoT Network Scheduler</h1>
        <p className="text-slate-400 text-sm">Graph Coloring vs. Random Access — live side-by-side comparison</p>
      </header>

      {/* Control Panel */}
      <div className="flex flex-col items-center mb-6 w-full max-w-4xl gap-3">
        <div className="flex flex-wrap gap-3 justify-center items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 px-2">
            <label className="text-sm font-semibold text-slate-600">Nodes:</label>
            <input 
              type="number" min="2" max="50" value={nodeCount}
              onChange={(e) => setNodeCount(Number(e.target.value))}
              className="w-14 border border-slate-300 rounded px-2 py-1 text-sm outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <button onClick={handleGenerate} disabled={eitherRunning}
            className="bg-slate-800 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 transition text-sm font-medium disabled:opacity-50">
            🔄 Auto-Generate (Distance)
          </button>
          
          <div className="h-6 w-px bg-slate-200 mx-1"></div>
          
          <button onClick={handleClearEdges} disabled={!generated || eitherRunning}
            className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 transition text-sm font-medium disabled:opacity-50">
            ✂️ Clear Edges
          </button>

          <button onClick={() => { setEditMode(!editMode); setSelectedNode(null); }} disabled={!generated || eitherRunning}
            className={`px-4 py-1.5 rounded-lg border transition text-sm font-bold disabled:opacity-50
              ${editMode ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
            {editMode ? '✍️ Editing Active...' : '✏️ Draw Connections'}
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1"></div>

          {generated && !eitherRunning && (
            <button onClick={handleRunBoth}
              className="bg-indigo-600 text-white px-5 py-1.5 rounded-lg hover:bg-indigo-500 transition text-sm font-bold">
              ▶▶ Run Both
            </button>
          )}
          {eitherRunning && (
            <button onClick={handleStopBoth}
              className="bg-red-100 text-red-600 border border-red-200 px-5 py-1.5 rounded-lg hover:bg-red-200 transition text-sm font-bold">
              ⏹ Stop Both
            </button>
          )}
        </div>

        {/* Edit mode helper text */}
        {canEdit && (
          <div className="text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 px-4 py-2 rounded-lg animate-pulse">
            <strong>Edit Mode:</strong> Click a node to select it, then click other nodes to connect or disconnect them.
          </div>
        )}
      </div>

      {/* Two simulation panels */}
      <div className="w-full max-w-7xl grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <ChaosPanel
            nodes={chaosNodes} adjList={adjList}
            isRunning={chaosRunning}
            collisions={chaosCollisions} packets={chaosPackets}
            batteryPercent={chaosBattery}
            onStart={() => setChaosRunning(true)} onStop={() => setChaosRunning(false)}
            canEdit={canEdit} selectedNode={selectedNode} onNodeRightClick={handleNodeClick}
          />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <OptimizedPanel
            nodes={optNodes} adjList={adjList}
            isRunning={optRunning}
            packets={optPackets} batteryPercent={optBattery}
            onStart={() => setOptRunning(true)} onStop={() => setOptRunning(false)}
            canEdit={canEdit} selectedNode={selectedNode} onNodeRightClick={handleNodeClick}
          />
        </div>
      </div>

      {/* Comparison strip */}
      {generated && (
        <div className="w-full max-w-7xl bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            📊 Head-to-Head Comparison
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">

            <div className="flex flex-col gap-1">
              <div className="text-xs text-slate-400 font-medium">Collision Rate</div>
              <div className="flex justify-around items-end">
                <div><div className="text-xl font-bold text-red-500">{collisionRate}%</div><div className="text-xs text-slate-400">Chaos</div></div>
                <div className="text-slate-300 text-lg">vs</div>
                <div><div className="text-xl font-bold text-green-500">0%</div><div className="text-xs text-slate-400">Optimized</div></div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-slate-400 font-medium">Avg Battery</div>
              <div className="flex justify-around items-end">
                <div><div className="text-xl font-bold text-orange-500">{Math.round(chaosBattery)}%</div><div className="text-xs text-slate-400">Chaos</div></div>
                <div className="text-slate-300 text-lg">vs</div>
                <div><div className="text-xl font-bold text-blue-500">{Math.round(optBattery)}%</div><div className="text-xs text-slate-400">Optimized</div></div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-xs text-slate-400 font-medium">Total Packets</div>
              <div className="flex justify-around items-end">
                <div><div className="text-xl font-bold text-orange-500">{chaosPackets}</div><div className="text-xs text-slate-400">Chaos</div></div>
                <div className="text-slate-300 text-lg">vs</div>
                <div><div className="text-xl font-bold text-blue-500">{optPackets}</div><div className="text-xs text-slate-400">Optimized</div></div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-1">
              <div className="text-xs text-slate-400 font-medium">Optimized Advantage</div>
              <div className="flex flex-col gap-1 w-full">
                <div className={`text-xs px-2 py-1 rounded-full font-semibold text-center ${batteryAdvantage >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {batteryAdvantage >= 0 ? '🔋 +' : '🔋 '}{batteryAdvantage}% battery
                </div>
                <div className={`text-xs px-2 py-1 rounded-full font-semibold text-center ${packetAdvantage >= 0 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {packetAdvantage >= 0 ? '📦 +' : '📦 '}{packetAdvantage}% throughput
                </div>
                <div className="text-xs px-2 py-1 rounded-full font-semibold text-center bg-purple-100 text-purple-700">
                  💥 {chaosCollisions} collisions avoided
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
