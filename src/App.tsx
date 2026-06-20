import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { IoTNode, NodeState, Approach, LogEntry, AlgorithmMetrics } from './types';
import { generateNodes, buildAdjacencyList, greedyColoring, tabuSearchColoring, simulatedAnnealingColoring, runFastForwardAnalytics } from './simulation';
import { Network, Activity, Router, Terminal, Cable, ChevronLeft, Menu, Info, X, Zap, Cpu, FileText, Maximize2, Minimize2, BarChart2, PieChart, Share2, Wifi, GitMerge, Code, Database, Server } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement } from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement
);

const CANVAS_WIDTH = 550;
const CANVAS_HEIGHT = 400;
const MAX_BATTERY = 10000;

const SLOT_COLORS = [
  '#06b6d4', '#a855f7', '#ec4899', '#3b82f6', '#f97316', '#10b981', '#eab308',
];

function getApproachName(app: Approach) {
  switch(app) {
    case 'chaos': return 'Random Access (Chaos)';
    case 'greedy': return 'Greedy Coloring';
    case 'tabu': return 'Tabu Search';
    case 'sa': return 'Simulated Annealing';
    default: return 'Unknown';
  }
}

const getShortestPath = (sourceId: string, sinkId: string, adjList: Map<string, string[]>): string[] | null => {
  if (sourceId === sinkId) return [sourceId];
  const queue = [[sourceId]];
  const visited = new Set([sourceId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = path[path.length - 1];
    const neighbors = adjList.get(node) || [];
    for (const neighbor of neighbors) {
      if (neighbor === sinkId) return [...path, neighbor];
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null;
};

const applyColoring = (nodes: IoTNode[], adj: Map<string, string[]>, algo: Approach) => {
  if (algo === 'chaos') return nodes.map(n => ({ ...n, color: -1 }));
  switch (algo) {
    case 'tabu': return tabuSearchColoring(nodes, adj);
    case 'sa': return simulatedAnnealingColoring(nodes, adj);
    case 'greedy': default: return greedyColoring(nodes, adj);
  }
};


interface SimulationCanvasProps {
  nodes: IoTNode[]; adjList: Map<string, string[]>;
  onNodeMove: (id: string, dx: number, dy: number) => void;
  onNodeMoveEnd: () => void;
  approach: Approach;
  isRunning: boolean;
  editMode?: boolean;
  selectedNode?: string | null;
  onNodeRightClick?: (id: string) => void;
  cyberpunkMode?: boolean;
  speedMultiplier?: number;
  sourceNodeId?: string | null;
  sinkNodeId?: string | null;
  route?: string[] | null;
  onNodeSelect?: (id: string) => void;
}

function SimulationCanvas({ 
  nodes, adjList, onNodeMove, onNodeMoveEnd, approach, isRunning, editMode, selectedNode, onNodeRightClick, cyberpunkMode, speedMultiplier = 1, sourceNodeId, sinkNodeId, route, onNodeSelect
}: SimulationCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const isChaos = approach === 'chaos';

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    if (isRunning) return;
    if (onNodeSelect) onNodeSelect(id);
    setDraggingId(id);
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
    onNodeMove(draggingId, svgP.x, svgP.y);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingId) {
      setDraggingId(null);
      (e.target as Element).releasePointerCapture(e.pointerId);
      onNodeMoveEnd();
    }
  };

  const nodeMap = React.useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      className={`w-full h-full min-h-0 bg-[#050b14] rounded-lg border border-[#1e293b] transition-colors ${editMode ? 'shadow-[inset_0_0_20px_rgba(168,85,247,0.15)]' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {nodes.map(node =>
        (adjList.get(node.id) || []).map(neighborId => {
          const neighbor = nodeMap.get(neighborId);
          if (neighbor && node.id < neighborId) {
            return (
              <line
                key={`${node.id}-${neighborId}`}
                x1={node.x} y1={node.y} x2={neighbor.x} y2={neighbor.y}
                stroke={cyberpunkMode ? "#ec4899" : (editMode ? "#64748b" : "#334155")}
                strokeWidth={cyberpunkMode ? "2" : "1.5"}
                strokeDasharray={cyberpunkMode ? "0" : "4 4"}
                className="transition-colors duration-300"
                style={cyberpunkMode ? { filter: 'drop-shadow(0 0 5px #ec4899)' } : {}}
              />
            );
          }
          return null;
        })
      )}

      {route && route.length > 1 && (
        <path
          d={`M ${route.map(id => {
            const n = nodeMap.get(id);
            return n ? `${n.x},${n.y}` : '';
          }).join(' L ')}`}
          fill="none" stroke="#10b981" strokeWidth="5" strokeDasharray="8 8"
          className={`pointer-events-none ${isRunning ? 'animate-pulse' : ''}`}
          style={{ filter: 'drop-shadow(0 0 10px #10b981)' }}
        />
      )}

      {nodes.map(node => {
        if (node.state !== 'TRANSMIT' && node.state !== 'COLLISION') return null;
        const isCollision = node.state === 'COLLISION';

        let isRoutedHopBase = false;
        let nextHopId: string | null = null;

        if (route && !isCollision) {
           const myIdx = route.indexOf(node.id);
           if (myIdx !== -1) {
             const carrier = nodes.find(n => n.hasDataPacket);
             if (carrier) {
               const carrierIdx = route.indexOf(carrier.id);
               if (myIdx === carrierIdx - 1) {
                 isRoutedHopBase = true;
                 nextHopId = carrier.id;
               } else if (carrierIdx === 0 && myIdx === route.length - 2) {
                 // The node before sink transmitted, packet reached sink and wrapped to source
                 isRoutedHopBase = true;
                 nextHopId = route[route.length - 1];
               }
             }
           }
        }

        return (adjList.get(node.id) || []).map(neighborId => {
          const target = nodeMap.get(neighborId);
          if (!target) return null;

          const isRoutedHop = isRoutedHopBase && neighborId === nextHopId;
          const packetColor = isCollision ? '#ef4444' : (isRoutedHop ? '#10b981' : '#facc15');
          const packetSize = isRoutedHop ? "6" : (isCollision ? "4" : "3");
          const opacity = isRoutedHop ? "1" : "0.5";

          const uniqueKey = `packet-${node.id}-${neighborId}-${node.battery}`;
          return (
            <circle 
              key={uniqueKey} 
              cx="0" 
              cy="0" 
              r={packetSize} 
              fill={packetColor} 
              className="pointer-events-none" 
              style={{ 
                filter: `drop-shadow(0 0 5px ${packetColor})`, 
                opacity,
                '--startX': `${node.x}px`,
                '--startY': `${node.y}px`,
                '--endX': `${target.x}px`,
                '--endY': `${target.y}px`,
                animation: `traverse-packet ${0.4 / speedMultiplier}s linear forwards`,
                animationPlayState: isRunning ? 'running' : 'paused'
              } as React.CSSProperties} 
            />
          );
        });
      })}

      {nodes.map(node => {
        const isAssigned = node.color >= 0;
        const strokeColor = isChaos ? '#3b82f6' : (isAssigned ? SLOT_COLORS[node.color % SLOT_COLORS.length] : '#64748b');
        const pct = node.battery / MAX_BATTERY;
        const isSelected = selectedNode === node.id;
        
        return (
          <g key={node.id} 
             onPointerDown={(e) => {
               if (e.button !== 2) handlePointerDown(e, node.id);
             }} 
             onContextMenu={(e) => { 
               e.preventDefault(); 
               if (onNodeRightClick) onNodeRightClick(node.id); 
             }}
             className={isRunning ? '' : 'cursor-pointer'} 
             style={{ touchAction: 'none' }}>
            
            {/* Removed the expanding yellow ping animation based on user request */}
            
            {node.id === sourceNodeId && <circle cx={node.x} cy={node.y} r="15" fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 2" className="pointer-events-none" />}
            {node.id === sinkNodeId && <circle cx={node.x} cy={node.y} r="15" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 2" className="pointer-events-none" />}
            
            {node.hasDataPacket && route && (() => {
              let isReceivingThisTick = false;
              if (isRunning) {
                const myIdx = route.indexOf(node.id);
                if (myIdx !== -1) {
                  let prevNodeIdx = myIdx - 1;
                  if (myIdx === 0) prevNodeIdx = route.length - 2;
                  if (prevNodeIdx >= 0 && prevNodeIdx < route.length) {
                    const prevNodeId = route[prevNodeIdx];
                    const prevNode = nodes.find(n => n.id === prevNodeId);
                    if (prevNode && prevNode.state === 'TRANSMIT') {
                      isReceivingThisTick = true;
                    }
                  }
                }
              }
              return (
                <g className="pointer-events-none" style={isReceivingThisTick ? { animation: `receive-packet ${0.4 / speedMultiplier}s forwards`, animationPlayState: isRunning ? 'running' : 'paused' } : {}}>
                  <circle cx={node.x} cy={node.y} r="12" fill="none" stroke="#10b981" strokeWidth="4" style={{ filter: 'drop-shadow(0 0 8px #10b981)' }} />
                  <circle cx={node.x} cy={node.y} r="6" fill="#10b981" style={{ filter: 'drop-shadow(0 0 5px #10b981)' }} />
                </g>
              );
            })()}

            {isSelected && (
              <circle cx={node.x} cy={node.y} r="14" fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="4 2" className="pointer-events-none" />
            )}

            <circle cx={node.x} cy={node.y} r="9" fill="#050b14" stroke={node.state === 'COLLISION' || node.state === 'FAILED_TX' ? '#ef4444' : node.state === 'TRANSMIT' ? '#facc15' : strokeColor} strokeWidth={isSelected ? "3" : "2.5"} className={`transition-colors duration-200 ${editMode && !isSelected ? 'hover:stroke-purple-400' : ''}`} style={cyberpunkMode ? { filter: `drop-shadow(0 0 8px ${node.state === 'COLLISION' || node.state === 'FAILED_TX' ? '#ef4444' : node.state === 'TRANSMIT' ? '#facc15' : strokeColor})` } : {}} />
            <circle cx={node.x} cy={node.y} r="3" fill={node.state === 'COLLISION' ? '#ef4444' : node.state === 'TRANSMIT' || node.state === 'FAILED_TX' ? '#facc15' : strokeColor} className="transition-colors duration-200" style={{ filter: `drop-shadow(0 0 4px ${node.state === 'COLLISION' ? '#ef4444' : node.state === 'TRANSMIT' || node.state === 'FAILED_TX' ? '#facc15' : strokeColor})` }} />
            
            <rect x={node.x - 10} y={node.y + 14} width="20" height="3" className="fill-[#1e293b] pointer-events-none" rx="1.5" />
            <rect x={node.x - 10} y={node.y + 14} width={20 * Math.max(0, pct)} height="3" className={`${pct > 0.4 ? 'fill-green-500' : pct > 0.15 ? 'fill-yellow-500' : 'fill-red-500'} pointer-events-none transition-all duration-300`} rx="1.5" />
          </g>
        );
      })}
    </svg>
  );
}

function NetworkPanelBase({
  title, subtitle, nodes, adjList, isRunning, packets, collisions, batteryPercent,
  onStart, onStop, onNodeMove, onNodeMoveEnd, onNodeRightClick, selectedNode, editMode, approach, showControls = true, cyberpunkMode, speedMultiplier = 1, sourceNodeId, sinkNodeId, route, onNodeSelect
}: {
  title: string; subtitle: string;
  nodes: IoTNode[]; adjList: Map<string, string[]>;
  isRunning: boolean; packets: number; collisions: number; batteryPercent: number;
  onStart: () => void; onStop: () => void;
  onNodeMove: (id: string, dx: number, dy: number) => void;
  onNodeMoveEnd: () => void;
  onNodeRightClick?: (id: string) => void;
  selectedNode?: string | null;
  editMode?: boolean;
  approach: Approach;
  showControls?: boolean;
  cyberpunkMode?: boolean;
  speedMultiplier?: number;
  sourceNodeId?: string | null;
  sinkNodeId?: string | null;
  route?: string[] | null;
  onNodeSelect?: (id: string) => void;
}) {
  const isChaos = approach === 'chaos';
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-[#0f172a]/95 backdrop-blur-xl flex flex-col" : "bg-[#0f172a]/60 backdrop-blur-sm border border-[#1e293b]/80 rounded-2xl overflow-hidden flex flex-col h-full shadow-[0_8px_30px_rgb(0,0,0,0.3)] transition-all hover:border-cyan-500/30 group relative"}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="flex justify-between items-center p-4 border-b border-[#1e293b]/80 bg-[#0B1020]/50 relative z-10">
        <div>
          <h3 className={`font-semibold flex items-center gap-2 ${isChaos ? 'text-red-400' : 'text-cyan-400'}`}>
            {title}
            {editMode && <span className="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/50 tracking-wider">EDIT MODE</span>}
          </h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
        {showControls && (
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button onClick={onStart} disabled={nodes.length === 0 || editMode}
                className={`text-sm px-4 py-1.5 rounded-lg font-bold transition disabled:opacity-40
                  ${isChaos ? 'bg-red-950 text-red-400 hover:bg-red-900 border border-red-800/50' 
                            : 'bg-cyan-950 text-cyan-400 hover:bg-cyan-900 border border-cyan-800/50'}`}>
                ▶ Run
              </button>
            ) : (
              <button onClick={onStop}
                className="bg-[#1e293b] text-slate-300 text-sm px-4 py-1.5 rounded-lg hover:bg-slate-700 transition font-bold border border-[#334155]">
                ⏹ Stop
              </button>
            )}
            <button onClick={() => setIsFullscreen(!isFullscreen)}
              className="bg-[#1e293b] text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition border border-[#334155] flex items-center justify-center"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col min-h-0">
        <SimulationCanvas
          nodes={nodes}
          adjList={adjList}
          onNodeMove={onNodeMove}
          onNodeMoveEnd={onNodeMoveEnd}
          approach={approach}
          isRunning={isRunning}
          editMode={editMode}
          selectedNode={selectedNode}
          onNodeRightClick={onNodeRightClick}
          cyberpunkMode={cyberpunkMode}
          speedMultiplier={speedMultiplier}
          sourceNodeId={sourceNodeId}
          sinkNodeId={sinkNodeId}
          route={route}
          onNodeSelect={onNodeSelect}
        />

        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          <div className="bg-[#050b14] border border-[#1e293b] rounded-lg p-2">
            <div className={`font-bold ${isChaos ? 'text-red-400' : 'text-cyan-400'}`}>{packets}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Packets</div>
          </div>
          <div className="bg-[#050b14] border border-[#1e293b] rounded-lg p-2">
            <div className="font-bold text-red-500">{collisions}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Collisions</div>
          </div>
          <div className="bg-[#050b14] border border-[#1e293b] rounded-lg p-2">
            <div className={`font-bold ${batteryPercent > 50 ? 'text-green-500' : batteryPercent > 20 ? 'text-yellow-500' : 'text-red-500'}`}>
              {Math.round(batteryPercent)}%
            </div>
            <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Battery</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const NetworkPanel = React.memo(NetworkPanelBase, (prev, next) => {
  return prev.nodes === next.nodes &&
         prev.adjList === next.adjList &&
         prev.isRunning === next.isRunning &&
         prev.packets === next.packets &&
         prev.collisions === next.collisions &&
         prev.batteryPercent === next.batteryPercent &&
         prev.approach === next.approach &&
         prev.editMode === next.editMode &&
         prev.selectedNode === next.selectedNode &&
         prev.title === next.title &&
         prev.subtitle === next.subtitle &&
         prev.cyberpunkMode === next.cyberpunkMode &&
         prev.speedMultiplier === next.speedMultiplier &&
         prev.sourceNodeId === next.sourceNodeId &&
         prev.sinkNodeId === next.sinkNodeId &&
         prev.route === next.route;
});

function AlgorithmDiagram({ algo }: { algo: string }) {
  if (algo === 'greedy') {
    return (
      <div className="bg-[#0B1020] p-4 rounded-lg border border-[#1e293b] mb-4 flex justify-center items-center shadow-inner">
        <svg width="280" height="120" viewBox="0 0 280 120" className="text-slate-400 text-[10px] font-sans">
           <line x1="50" y1="60" x2="125" y2="30" stroke="#334155" strokeWidth="2" strokeDasharray="4" />
           <line x1="50" y1="60" x2="125" y2="90" stroke="#334155" strokeWidth="2" strokeDasharray="4" />
           <line x1="125" y1="30" x2="200" y2="60" stroke="#334155" strokeWidth="2" strokeDasharray="4" />
           <line x1="125" y1="90" x2="200" y2="60" stroke="#334155" strokeWidth="2" strokeDasharray="4" />
           
           <circle cx="50" cy="60" r="14" fill="#050b14" stroke="#06b6d4" strokeWidth="3" />
           <text x="50" y="64" textAnchor="middle" fill="#06b6d4" fontSize="12" fontWeight="bold">1</text>

           <circle cx="125" cy="30" r="14" fill="#050b14" stroke="#a855f7" strokeWidth="3" />
           <text x="125" y="34" textAnchor="middle" fill="#a855f7" fontSize="12" fontWeight="bold">2</text>

           <circle cx="125" cy="90" r="14" fill="#050b14" stroke="#ec4899" strokeWidth="3" />
           <text x="125" y="94" textAnchor="middle" fill="#ec4899" fontSize="12" fontWeight="bold">3</text>

           <circle cx="200" cy="60" r="14" fill="#050b14" stroke="#64748b" strokeWidth="3" strokeDasharray="4" />
           <text x="200" y="64" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="bold">?</text>

           <rect x="175" y="10" width="70" height="20" rx="4" fill="#0f172a" stroke="#1e293b" />
           <text x="210" y="24" textAnchor="middle" fill="#3b82f6" fontWeight="bold">Picks 4</text>
           <path d="M 210 30 L 210 40 M 206 36 L 210 40 L 214 36" fill="none" stroke="#3b82f6" strokeWidth="2" />
        </svg>
      </div>
    );
  }
  
  if (algo === 'tabu') {
    return (
      <div className="bg-[#0B1020] p-4 rounded-lg border border-[#1e293b] mb-4 flex justify-center items-center shadow-inner">
        <svg width="280" height="120" viewBox="0 0 280 120" className="text-slate-400 text-[10px] font-sans">
           <line x1="60" y1="60" x2="140" y2="60" stroke="#ef4444" strokeWidth="2" />
           
           <circle cx="60" cy="60" r="14" fill="#050b14" stroke="#06b6d4" strokeWidth="3" />
           <text x="60" y="64" textAnchor="middle" fill="#06b6d4" fontSize="12" fontWeight="bold">1</text>

           <circle cx="140" cy="60" r="14" fill="#050b14" stroke="#06b6d4" strokeWidth="3" />
           <text x="140" y="64" textAnchor="middle" fill="#06b6d4" fontSize="12" fontWeight="bold">1</text>

           <text x="100" y="50" textAnchor="middle" fill="#ef4444" fontWeight="bold">Conflict!</text>

           <rect x="170" y="20" width="90" height="40" rx="4" fill="#0f172a" stroke="#1e293b" />
           <text x="215" y="35" textAnchor="middle" fill="#e2e8f0" fontWeight="bold" fontSize="9">TABU LIST</text>
           <text x="215" y="50" textAnchor="middle" fill="#64748b" fontSize="9">Node B 🚫 2</text>

           <path d="M 140 80 Q 140 100 160 100 L 155 95 M 160 100 L 155 105" fill="none" stroke="#a855f7" strokeWidth="2" />
           <text x="200" y="104" fill="#a855f7" fontWeight="bold">Must pick 3</text>
        </svg>
      </div>
    );
  }

  if (algo === 'sa') {
    return (
      <div className="bg-[#0B1020] p-4 rounded-lg border border-[#1e293b] mb-4 flex justify-center items-center shadow-inner">
        <svg width="280" height="120" viewBox="0 0 280 120" className="text-slate-400 text-[10px] font-sans">
           <rect x="20" y="20" width="10" height="60" rx="5" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
           <circle cx="25" cy="85" r="10" fill="#ef4444" />
           <rect x="22" y="40" width="6" height="40" fill="#ef4444" />
           <text x="45" y="88" fill="#ef4444" fontWeight="bold">Hot</text>
           
           <path d="M 60 40 Q 120 0 180 40 T 260 80" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="4" />
           
           <circle cx="120" cy="20" r="14" fill="#050b14" stroke="#ec4899" strokeWidth="3" />
           <text x="120" y="45" textAnchor="middle" fill="#ec4899" fontWeight="bold">Worse State</text>
           <text x="120" y="58" textAnchor="middle" fill="#ec4899" fontSize="8">(Accepted anyway)</text>

           <circle cx="230" cy="70" r="14" fill="#050b14" stroke="#06b6d4" strokeWidth="3" />
           <text x="230" y="100" textAnchor="middle" fill="#06b6d4" fontWeight="bold">Global Min</text>
        </svg>
      </div>
    );
  }

  return null;
}

function AlgorithmInfoModal({ algo, onClose }: { algo: Approach, onClose: () => void }) {
  const content = {
    greedy: {
      title: "Greedy Coloring",
      desc: "Assigns time slots to nodes by picking the first available slot that doesn't conflict with neighbors. It is extremely fast to compute but often uses more slots than necessary. However, compared to standard Random Access, it guarantees zero collisions."
    },
    tabu: {
      title: "Tabu Search",
      desc: "An iterative metaheuristic search that maintains a 'tabu list' of recently visited states to avoid getting stuck in local optima. It continuously refines the slot assignment to minimize total slots. It strikes a great balance between computation time and energy efficiency."
    },
    sa: {
      title: "Simulated Annealing",
      desc: "A probabilistic optimization inspired by metallurgy. Early in the process, it occasionally accepts worse assignments to explore the possibility space, slowly 'cooling down' to converge on a highly optimized, near-perfect slot allocation. It is slower but yields the tightest schedules."
    },
    chaos: { title: "Random Access", desc: "Randomly transmits packets." }
  }[algo];

  if (!content || algo === 'chaos') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-6 shadow-2xl max-w-md w-full mx-4 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-cyan-900/30 p-2 rounded-lg text-cyan-400">
            <Info size={24} />
          </div>
          <h3 className="text-xl font-bold text-white">{content.title} vs Chaos</h3>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed mb-4">
          {content.desc}
        </p>

        <AlgorithmDiagram algo={algo} />

        <div className="bg-[#050b14] p-4 rounded-lg border border-[#1e293b]">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Vs. Random Access (Chaos)</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            In standard Random Access, nodes transmit probabilistically, leading to massive energy waste from collisions and retransmissions. {content.title} pre-calculates an interference-free schedule, guaranteeing 100% successful packet delivery and saving enormous amounts of battery life at the cost of upfront computation.
          </p>
        </div>
      </div>
    </div>
  );
}

function AnalysisTab({ data, setActiveTab, hasSimulationStarted }: { data: AlgorithmMetrics[], setActiveTab: (t: 'dashboard'|'comparison'|'analysis') => void, hasSimulationStarted: boolean }) {
  if (!data || data.length === 0 || !hasSimulationStarted) {
    return (
      <div className="text-center py-20 bg-[#0B1020] border border-[#1e293b] rounded-xl">
        <BarChart2 size={48} className="mx-auto text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-300">Simulation Pending</h3>
        <p className="text-slate-500 mt-2">Please start the simulation in the Dashboard to view real-time analysis.</p>
        <button onClick={() => setActiveTab('dashboard')} className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors">Go to Dashboard</button>
      </div>
    );
  }

  const schemeColors: Record<string, string> = {
    'No Coloring': '#ef4444',
    'Greedy': '#06b6d4',
    'Tabu': '#ec4899',
    'SA': '#a855f7'
  };

  const formattedData = data.map(d => ({
    ...d,
    name: d.scheme === 'chaos' ? 'No Coloring' : d.scheme === 'greedy' ? 'Greedy' : d.scheme === 'tabu' ? 'Tabu' : 'SA',
    fillColor: schemeColors[d.scheme === 'chaos' ? 'No Coloring' : d.scheme === 'greedy' ? 'Greedy' : d.scheme === 'tabu' ? 'Tabu' : 'SA']
  }));

  const chartOptions = {
    responsive: true,
    animation: {
      duration: 2000,
      easing: 'easeOutQuart' as const
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        borderColor: '#1e293b',
        borderWidth: 1
      }
    },
    scales: {
      y: { grid: { color: '#1e293b' }, border: { dash: [4, 4] }, ticks: { color: '#64748b' } },
      x: { grid: { display: false }, ticks: { color: '#64748b' } }
    }
  };

  const createChartData = (label: string, dataKey: keyof typeof formattedData[0]) => ({
    labels: formattedData.map(d => d.name),
    datasets: [{
      label,
      data: formattedData.map(d => Number(d[dataKey])),
      backgroundColor: formattedData.map(d => d.fillColor),
      borderRadius: 4
    }]
  });

  const bestSuccess = [...formattedData].sort((a, b) => b.successRate - a.successRate)[0];
  const lowestEnergy = [...formattedData].sort((a, b) => a.energy - b.energy)[0];
  const bestThroughput = [...formattedData].sort((a, b) => b.throughput - a.throughput)[0];
  const lowestDelay = [...formattedData].filter(d => d.successRate > 0).sort((a, b) => a.avgDelay - b.avgDelay)[0] || formattedData[0];

  const coloringAlgos = formattedData.filter(d => d.scheme !== 'chaos');
  const allColoringSameSuccess = coloringAlgos.length > 0 && coloringAlgos.every(d => d.successRate === bestSuccess.successRate);
  const allColoringSameEnergy = coloringAlgos.length > 0 && coloringAlgos.every(d => d.energy === lowestEnergy.energy);
  const allColoringSameThroughput = coloringAlgos.length > 0 && coloringAlgos.every(d => d.throughput === bestThroughput.throughput);
  const allColoringSameDelay = coloringAlgos.length > 0 && coloringAlgos.every(d => d.avgDelay === lowestDelay.avgDelay);

  const lineChartData = {
    labels: formattedData.map(d => d.name),
    datasets: [
      {
        label: 'Success Rate (%)',
        data: formattedData.map(d => d.successRate),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Collisions',
        data: formattedData.map(d => d.collisions),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true,
        yAxisID: 'y1',
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1200,
      easing: 'easeOutQuart' as const
    },
    plugins: {
      legend: { position: 'top' as const, labels: { color: '#cbd5e1' } },
      tooltip: { backgroundColor: '#0f172a', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: '#1e293b', borderWidth: 1 }
    },
    scales: {
      y: { type: 'linear' as const, display: true, position: 'left' as const, grid: { color: '#1e293b' }, ticks: { color: '#64748b' } },
      y1: { type: 'linear' as const, display: true, position: 'right' as const, grid: { display: false }, ticks: { color: '#64748b' } },
      x: { grid: { display: false }, ticks: { color: '#64748b' } }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10"><PieChart size={64} /></div>
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Highest Success Rate</div>
          <div className="text-2xl font-bold text-white mb-2">{bestSuccess.successRate.toFixed(1)}%</div>
          <div className="text-sm">Achieved by <span style={{color: allColoringSameSuccess ? '#10b981' : bestSuccess.fillColor}} className="font-bold">{allColoringSameSuccess ? 'Graph Coloring' : bestSuccess.name}</span></div>
        </div>
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10"><Zap size={64} /></div>
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Lowest Energy Use</div>
          <div className="text-2xl font-bold text-white mb-2">{lowestEnergy.energy.toFixed(0)}</div>
          <div className="text-sm">Achieved by <span style={{color: allColoringSameEnergy ? '#10b981' : lowestEnergy.fillColor}} className="font-bold">{allColoringSameEnergy ? 'Graph Coloring' : lowestEnergy.name}</span></div>
        </div>
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10"><Activity size={64} /></div>
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Best Throughput</div>
          <div className="text-2xl font-bold text-white mb-2">{bestThroughput.throughput.toFixed(2)}</div>
          <div className="text-sm">Achieved by <span style={{color: allColoringSameThroughput ? '#10b981' : bestThroughput.fillColor}} className="font-bold">{allColoringSameThroughput ? 'Graph Coloring' : bestThroughput.name}</span></div>
        </div>
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10"><Router size={64} /></div>
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Lowest Avg Delay</div>
          <div className="text-2xl font-bold text-white mb-2">{lowestDelay.avgDelay.toFixed(1)} ms</div>
          <div className="text-sm">Achieved by <span style={{color: allColoringSameDelay ? '#10b981' : lowestDelay.fillColor}} className="font-bold">{allColoringSameDelay ? 'Graph Coloring' : lowestDelay.name}</span></div>
        </div>
      </div>

      <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-xl">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Activity size={16} className="text-purple-400"/> Non-Coloring vs Coloring Comparison</h3>
        <div className="h-64 lg:h-80 w-full">
          <Line data={lineChartData} options={lineChartOptions} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><PieChart size={16} className="text-cyan-400"/> Success Rate (%)</h3>
          <Bar data={createChartData('Success Rate', 'successRate')} options={chartOptions} />
        </div>
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Zap size={16} className="text-yellow-400"/> Energy Consumption</h3>
          <Bar data={createChartData('Energy', 'energy')} options={chartOptions} />
        </div>
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Activity size={16} className="text-green-400"/> Throughput</h3>
          <Bar data={createChartData('Throughput', 'throughput')} options={chartOptions} />
        </div>
        <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Network size={16} className="text-red-400"/> Collisions</h3>
          <Bar data={createChartData('Collisions', 'collisions')} options={chartOptions} />
        </div>
      </div>

      <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-xl shadow-purple-900/5">
        <h3 className="text-white font-bold mb-4">Detailed Metrics Table</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="text-xs uppercase text-slate-500 border-b border-[#1e293b]">
              <tr>
                <th className="px-4 py-3">Scheme</th>
                <th className="px-4 py-3">Slots Used</th>
                <th className="px-4 py-3">Collisions</th>
                <th className="px-4 py-3">Success Rate</th>
                <th className="px-4 py-3">Avg Delay</th>
                <th className="px-4 py-3">Energy</th>
                <th className="px-4 py-3">Throughput</th>
              </tr>
            </thead>
            <tbody>
              {formattedData.map((row, idx) => (
                <tr key={idx} className="border-b border-[#1e293b]/50 hover:bg-[#0f172a]/50 transition-colors">
                  <td className="px-4 py-4 font-medium text-slate-200">{row.name}</td>
                  <td className="px-4 py-4">{row.slots}</td>
                  <td className={`px-4 py-4 ${row.collisions > 0 ? 'text-red-400' : 'text-slate-400'}`}>{row.collisions}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${row.successRate > 90 ? 'bg-green-900/30 text-green-400' : row.successRate > 50 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'}`}>
                      {row.successRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-4">{row.avgDelay.toFixed(1)} ms</td>
                  <td className="px-4 py-4">{row.energy.toFixed(0)}</td>
                  <td className="px-4 py-4">{row.throughput.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DomainCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="group relative bg-[#0f172a]/60 backdrop-blur-md border border-[#1e293b] p-6 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] hover:border-cyan-500/30 cursor-default">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div className="flex items-center gap-4 mb-4 relative z-10">
        <div className="p-3 bg-[#050b14] rounded-xl border border-[#1e293b] shadow-inner group-hover:shadow-cyan-500/20 transition-all">
          {icon}
        </div>
        <h3 className="text-xl font-bold text-white">{title}</h3>
      </div>
      <p className="text-slate-400 leading-relaxed relative z-10 text-sm">{description}</p>
    </div>
  );
}

function HomeTab({ setActiveTab }: { setActiveTab: (t: 'dashboard' | 'comparison' | 'analysis') => void }) {
  const floatingIcons = [
    { Icon: Router, size: 24, top: '15%', left: '10%', delay: '0s', color: 'text-cyan-500/10', anim: 'animate-float-1' },
    { Icon: Cpu, size: 32, top: '65%', left: '85%', delay: '2s', color: 'text-purple-500/10', anim: 'animate-float-2' },
    { Icon: Code, size: 20, top: '15%', left: '80%', delay: '1s', color: 'text-green-500/10', anim: 'animate-float-3' },
    { Icon: Network, size: 40, top: '75%', left: '15%', delay: '3s', color: 'text-blue-500/10', anim: 'animate-float-1' },
    { Icon: Wifi, size: 28, top: '40%', left: '8%', delay: '1.5s', color: 'text-pink-500/10', anim: 'animate-float-2' },
    { Icon: Database, size: 24, top: '35%', left: '88%', delay: '2.5s', color: 'text-yellow-500/10', anim: 'animate-float-3' },
    { Icon: Server, size: 28, top: '25%', left: '25%', delay: '4s', color: 'text-indigo-500/10', anim: 'animate-float-2' },
    { Icon: Activity, size: 20, top: '55%', left: '12%', delay: '0.5s', color: 'text-red-500/10', anim: 'animate-float-3' },
    { Icon: Terminal, size: 32, top: '80%', left: '75%', delay: '3.5s', color: 'text-emerald-500/10', anim: 'animate-float-1' },
    { Icon: Zap, size: 24, top: '10%', left: '50%', delay: '1.2s', color: 'text-yellow-500/10', anim: 'animate-float-2' },
    { Icon: GitMerge, size: 28, top: '60%', left: '30%', delay: '2.8s', color: 'text-cyan-500/10', anim: 'animate-float-3' },
    { Icon: Share2, size: 36, top: '30%', left: '60%', delay: '4.5s', color: 'text-purple-500/10', anim: 'animate-float-1' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-16 relative animate-slide-up-morph min-h-full flex flex-col justify-center">
      {/* Decorative floating background elements */}
      <div className="absolute top-20 right-20 w-64 h-64 bg-cyan-600/10 rounded-full blur-3xl animate-pulse -z-10"></div>
      <div className="absolute bottom-20 left-20 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl animate-pulse delay-1000 -z-10"></div>
      
      {/* Floating Interactive Tech Icons */}
      {floatingIcons.map((item, i) => {
        const Icon = item.Icon;
        return (
          <div key={i} className={`absolute z-0 ${item.anim} pointer-events-none`} style={{ top: item.top, left: item.left, animationDelay: item.delay }}>
            <Icon size={item.size} className={`${item.color} drop-shadow-md`} />
          </div>
        );
      })}


      <div className="text-center mb-20 relative z-10">
        <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-8 tracking-tighter drop-shadow-lg leading-tight">
          Color the network.<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 animate-gradient-x">Save the energy.</span>
        </h1>
        <p className="text-slate-400 max-w-3xl mx-auto text-xl leading-relaxed mb-12">
          A professional-grade Time Division Multiple Access (TDMA) simulator. Compare advanced Graph Coloring heuristics against chaotic random access to visualize interference, packet delay, and battery waste.
        </p>
        <div className="flex justify-center gap-6">
          <button onClick={() => setActiveTab('dashboard')} className="px-10 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-500 transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_40px_rgba(6,182,212,0.6)] transform hover:-translate-y-1">
            <Router size={20} /> Launch Simulator
          </button>
        </div>
      </div>

      <div className="mb-24 w-full relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/30 border border-purple-900/50 text-purple-400 text-xs font-bold uppercase tracking-widest mb-6 mx-auto flex w-max">
          Interdisciplinary Architecture
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-center text-white mb-12 drop-shadow-sm">Built on 4 Academic Pillars</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DomainCard icon={<Share2 className="text-cyan-400"/>} title="Discrete Mathematics" description="Graph theory fundamentals: defining sensor networks as adjacency matrices and utilizing proper node coloring to map conflict-free TDMA time slots." />
          <DomainCard icon={<Cpu className="text-blue-400"/>} title="Internet of Things (IoT)" description="Simulating energy-constrained distributed sensor nodes. Analyzes battery drainage profiles during transmissions and idle listening states." />
          <DomainCard icon={<Wifi className="text-green-400"/>} title="Computer Networks" description="MAC layer scheduling, collision domains, and hidden terminal problems. Visualizes how orchestrated scheduling prevents packet collisions." />
          <DomainCard icon={<GitMerge className="text-purple-400"/>} title="Design & Analysis of Algorithms" description="Applying and analyzing the time complexity vs. optimality tradeoff of heuristic approximations like Tabu Search and Simulated Annealing for NP-Hard problems." />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
        <div className="bg-[#0B1020]/80 backdrop-blur-sm border border-[#1e293b] p-6 rounded-2xl hover:border-cyan-500/30 transition-colors shadow-lg">
          <div className="bg-cyan-950/30 w-12 h-12 rounded-lg flex items-center justify-center mb-4 border border-cyan-900/50">
            <Network className="text-cyan-400" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">Dynamic Topologies</h3>
          <p className="text-slate-400 text-sm leading-relaxed">Generate random IoT sensor networks with adjustable node counts and edge densities to test algorithms under varying interference conditions.</p>
        </div>
        <div className="bg-[#0B1020]/80 backdrop-blur-sm border border-[#1e293b] p-6 rounded-2xl hover:border-purple-500/30 transition-colors shadow-lg">
          <div className="bg-purple-950/30 w-12 h-12 rounded-lg flex items-center justify-center mb-4 border border-purple-900/50">
            <Cpu className="text-purple-400" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">Advanced Heuristics</h3>
          <p className="text-slate-400 text-sm leading-relaxed">Implementations of Greedy Coloring, Tabu Search, and Simulated Annealing algorithms optimized for Time Division Multiple Access (TDMA) scheduling.</p>
        </div>
        <div className="bg-[#0B1020]/80 backdrop-blur-sm border border-[#1e293b] p-6 rounded-2xl hover:border-green-500/30 transition-colors shadow-lg">
          <div className="bg-green-950/30 w-12 h-12 rounded-lg flex items-center justify-center mb-4 border border-green-900/50">
            <BarChart2 className="text-green-400" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">Real-time Analytics</h3>
          <p className="text-slate-400 text-sm leading-relaxed">Deep-dive into performance metrics including Success Rate, Energy Consumption, Throughput, and Average Delay with interactive visualizations.</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'comparison' | 'analysis'>('home');
  const [showLogsSidebar, setShowLogsSidebar] = useState(false);
  const [hasSimulationStarted, setHasSimulationStarted] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [infoPopup, setInfoPopup] = useState<Approach | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cyberpunkMode, setCyberpunkMode] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AlgorithmMetrics[]>([]);
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  const [sinkNodeId, setSinkNodeId] = useState<string | null>(null);
  const [route, setRoute] = useState<string[] | null>(null);
  const clickCountRef = useRef(0);
  const clickTimeoutRef = useRef<number | undefined>(undefined);

  const handleTitleClick = () => {
    clickCountRef.current += 1;
    if (clickCountRef.current === 5) {
      setCyberpunkMode(prev => !prev);
      clickCountRef.current = 0;
    }
    clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = window.setTimeout(() => {
      clickCountRef.current = 0;
    }, 1000);
  };

  const addLog = useCallback((message: string, type: LogEntry['type'], panel?: 'A' | 'B') => {
    setLogs(prev => {
      const newLog: LogEntry = { id: Math.random().toString(), timestamp: new Date(), message, type, panel };
      return [newLog, ...prev].slice(0, 300);
    });
  }, []);



  const [nodeCount, setNodeCount] = useState(27);
  const [edgeDensity, setEdgeDensity] = useState(0.16);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [adjList, setAdjList] = useState<Map<string, string[]>>(new Map());
  const [isGenerated, setIsGenerated] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    if (sourceNodeId && sinkNodeId) {
      setRoute(getShortestPath(sourceNodeId, sinkNodeId, adjList));
    } else {
      setRoute(null);
    }
  }, [sourceNodeId, sinkNodeId, adjList]);

  const [approachA, setApproachA] = useState<Approach>('chaos');
  const [nodesA, setNodesA] = useState<IoTNode[]>([]);
  const [runningA, setRunningA] = useState(false);
  const [packetsA, setPacketsA] = useState(0);
  const [collisionsA, setCollisionsA] = useState(0);
  const [maxSlotA, setMaxSlotA] = useState(0);
  const slotRefA = useRef(0);

  const [approachB, setApproachB] = useState<Approach>('greedy');
  const [nodesB, setNodesB] = useState<IoTNode[]>([]);
  const [runningB, setRunningB] = useState(false);
  const [packetsB, setPacketsB] = useState(0);
  const [collisionsB, setCollisionsB] = useState(0);
  const [maxSlotB, setMaxSlotB] = useState(0);
  const slotRefB = useRef(0);

  const calculateInterferenceRadius = (density: number) => density * 600;

  const handleGenerate = useCallback(() => {
    const radius = calculateInterferenceRadius(edgeDensity);
    const nodes = generateNodes(nodeCount, CANVAS_WIDTH, CANVAS_HEIGHT);
    const adj = buildAdjacencyList(nodes, radius);
    
    setAdjList(adj);
    
    const reColoredA = applyColoring(nodes.map(n => ({ ...n, state: 'IDLE' })), adj, approachA);
    setNodesA(reColoredA);
    setMaxSlotA(reColoredA.length > 0 ? Math.max(...reColoredA.map(n => n.color)) : 0);

    const reColoredB = applyColoring(nodes.map(n => ({ ...n, state: 'IDLE' })), adj, approachB);
    setNodesB(reColoredB);
    setMaxSlotB(reColoredB.length > 0 ? Math.max(...reColoredB.map(n => n.color)) : 0);
    
    // Generate analytics data in background
    setTimeout(() => {
      const metrics = runFastForwardAnalytics(nodes, adj);
      setAnalyticsData(metrics);
    }, 10);
    
    setRunningA(false); setRunningB(false);
    setCollisionsA(0); setCollisionsB(0);
    setPacketsA(0); setPacketsB(0);
    setEditMode(false); setSelectedNode(null);
    setSourceNodeId(null); setSinkNodeId(null);
    slotRefA.current = 0; slotRefB.current = 0;

    addLog(`Generated new network with ${nodeCount} nodes and ${edgeDensity} edge density.`, 'info');
  }, [nodeCount, edgeDensity, approachA, approachB, addLog]);

  const handleConfirmGenerate = () => {
    handleGenerate();
    setIsGenerated(true);
  };

  const confirmReset = () => {
    setAdjList(new Map());
    setNodesA([]); setNodesB([]);
    setAnalyticsData([]);
    setRunningA(false); setRunningB(false);
    setCollisionsA(0); setCollisionsB(0);
    setPacketsA(0); setPacketsB(0);
    setEditMode(false); setSelectedNode(null);
    setSourceNodeId(null); setSinkNodeId(null);
    setIsGenerated(false); setShowResetModal(false);
    setHasSimulationStarted(false);
    addLog('Network cleared.', 'warning');
  };

  useEffect(() => {
    if (isGenerated && nodesA.length > 0) {
      const base = nodesA.map(n => ({ ...n, color: -1 }));
      const reColored = applyColoring(base, adjList, approachA);
      setNodesA(reColored);
      setMaxSlotA(reColored.length > 0 ? Math.max(...reColored.map(n => n.color)) : 0);
      addLog(`Panel A switched to ${getApproachName(approachA)}`, 'info', 'A');
    }
  }, [approachA]);

  useEffect(() => {
    if (isGenerated && nodesB.length > 0) {
      const base = nodesB.map(n => ({ ...n, color: -1 }));
      const reColored = applyColoring(base, adjList, approachB);
      setNodesB(reColored);
      setMaxSlotB(reColored.length > 0 ? Math.max(...reColored.map(n => n.color)) : 0);
      addLog(`Panel B switched to ${getApproachName(approachB)}`, 'info', 'B');
    }
  }, [approachB]);

  const handleNodeMove = (id: string, nx: number, ny: number) => {
    setNodesA(prev => prev.map(n => n.id === id ? { ...n, x: nx, y: ny } : n));
    setNodesB(prev => prev.map(n => n.id === id ? { ...n, x: nx, y: ny } : n));
  };

  const handleNodeMoveEnd = () => {
    const radius = calculateInterferenceRadius(edgeDensity);
    const adj = buildAdjacencyList(nodesA, radius);
    setAdjList(adj);
    
    const reColoredA = applyColoring(nodesA.map(n => ({ ...n, color: -1 })), adj, approachA);
    setNodesA(reColoredA);
    setMaxSlotA(reColoredA.length > 0 ? Math.max(...reColoredA.map(n => n.color)) : 0);

    const reColoredB = applyColoring(nodesB.map(n => ({ ...n, color: -1 })), adj, approachB);
    setNodesB(reColoredB);
    setMaxSlotB(reColoredB.length > 0 ? Math.max(...reColoredB.map(n => n.color)) : 0);

    setTimeout(() => {
      const metrics = runFastForwardAnalytics(nodesA, adj);
      setAnalyticsData(metrics);
    }, 10);
  };

  const handleNodeRightClick = (nodeId: string) => {
    if (!editMode) return;
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
        
        const reColoredA = applyColoring(nodesA.map(n => ({ ...n, color: -1 })), next, approachA);
        setNodesA(reColoredA);
        setMaxSlotA(reColoredA.length > 0 ? Math.max(...reColoredA.map(n => n.color)) : 0);

        const reColoredB = applyColoring(nodesB.map(n => ({ ...n, color: -1 })), next, approachB);
        setNodesB(reColoredB);
        setMaxSlotB(reColoredB.length > 0 ? Math.max(...reColoredB.map(n => n.color)) : 0);

        setTimeout(() => {
          const metrics = runFastForwardAnalytics(nodesA, next);
          setAnalyticsData(metrics);
        }, 10);

        return next;
      });
      setSelectedNode(null);
    }
  };

  const useSimulationLoop = (
    running: boolean, approach: Approach, setNodes: React.Dispatch<React.SetStateAction<IoTNode[]>>,
    adjList: Map<string, string[]>, setCollisions: React.Dispatch<React.SetStateAction<number>>,
    setPackets: React.Dispatch<React.SetStateAction<number>>, maxSlot: number, slotRef: React.MutableRefObject<number>,
    panelId: 'A' | 'B', speedMultiplier: number, currentRoute: string[] | null
  ) => {
    useEffect(() => {
      if (!running) {
        return;
      }
      let ticks = 0;
      const interval = setInterval(() => {
        ticks++;
        setNodes(currentNodes => {
          let tickCollisions = 0, tickSuccesses = 0;
          let updated: IoTNode[];
          const successfulTransmitters = new Set<string>();

          if (approach === 'chaos') {
            const attempting = new Set(currentNodes.filter(n => n.battery > 0 && Math.random() < 0.20).map(n => n.id));
            const collisionAt = new Set<string>();
            const failedTransmitters = new Set<string>();

            currentNodes.forEach(node => {
               const neighbors = adjList.get(node.id) || [];
               const txNeighbors = neighbors.filter(nId => attempting.has(nId));

               if (attempting.has(node.id)) {
                  if (txNeighbors.length > 0) {
                     collisionAt.add(node.id);
                     failedTransmitters.add(node.id);
                     txNeighbors.forEach(n => failedTransmitters.add(n));
                  }
               } else {
                  if (txNeighbors.length > 1) {
                     collisionAt.add(node.id);
                     txNeighbors.forEach(n => failedTransmitters.add(n));
                  }
               }
            });

            updated = currentNodes.map(node => {
              if (node.battery <= 0) return { ...node, state: 'SLEEP' as NodeState, hasDataPacket: node.hasDataPacket };
              
              let batteryDrain = 50; 
              if (attempting.has(node.id)) {
                 batteryDrain = failedTransmitters.has(node.id) ? 300 : 150;
              }

              let nextState: NodeState = 'IDLE';
              if (attempting.has(node.id)) {
                 nextState = failedTransmitters.has(node.id) ? 'FAILED_TX' : 'TRANSMIT';
              } else if (collisionAt.has(node.id)) {
                 nextState = 'COLLISION'; 
              }

              if (attempting.has(node.id) && !failedTransmitters.has(node.id)) {
                 tickSuccesses++;
                 successfulTransmitters.add(node.id);
              }
              
              return { ...node, state: nextState, battery: Math.max(0, node.battery - batteryDrain), hasDataPacket: node.hasDataPacket };
            });
            tickCollisions += failedTransmitters.size;
          } else {
            const nextSlot = slotRef.current >= maxSlot ? 0 : slotRef.current + 1;
            slotRef.current = nextSlot;

            updated = currentNodes.map(node => {
              const transmitting = node.color === nextSlot && node.battery > 0;
              if (transmitting) {
                tickSuccesses++;
                successfulTransmitters.add(node.id);
              }
              const drain = transmitting ? 150 : (node.battery > 0 ? 5 : 0);
              return {
                ...node,
                battery: Math.max(0, node.battery - drain),
                state: (transmitting ? 'TRANSMIT' : 'SLEEP') as NodeState,
                hasDataPacket: node.hasDataPacket
              };
            });
          }

          if (currentRoute && currentRoute.length > 0) {
             const carrier = updated.find(n => n.hasDataPacket);
             if (carrier) {
                if (successfulTransmitters.has(carrier.id)) {
                    const routeIndex = currentRoute.indexOf(carrier.id);
                    if (routeIndex !== -1 && routeIndex < currentRoute.length - 1) {
                        const nextHopId = currentRoute[routeIndex + 1];
                        carrier.hasDataPacket = false;
                        const nextHopNode = updated.find(n => n.id === nextHopId);
                        if (nextHopNode) nextHopNode.hasDataPacket = true;
                    } else if (routeIndex === currentRoute.length - 1) {
                        carrier.hasDataPacket = false;
                        const sourceNode = updated.find(n => n.id === currentRoute[0]);
                        if (sourceNode) sourceNode.hasDataPacket = true;
                    }
                }
             } else {
                const sourceNode = updated.find(n => n.id === currentRoute[0]);
                if (sourceNode) sourceNode.hasDataPacket = true;
             }
          } else {
             updated.forEach(n => n.hasDataPacket = false);
          }

          setCollisions(p => p + tickCollisions);
          setPackets(p => p + tickSuccesses);
          
          if (tickCollisions > 0) {
            addLog(`Tick: ${tickCollisions} collisions detected!`, 'error', panelId);
          } else if (ticks % 3 === 0 && tickSuccesses > 0) {
            addLog(`Tick: ${tickSuccesses} packets transmitted cleanly.`, 'success', panelId);
          }

          return updated;
        });
      }, 600 / speedMultiplier);
      return () => clearInterval(interval);
    }, [running, approach, adjList, maxSlot, panelId, speedMultiplier, currentRoute]);
  };

  useSimulationLoop(runningA, approachA, setNodesA, adjList, setCollisionsA, setPacketsA, maxSlotA, slotRefA, 'A', speedMultiplier, route);
  useSimulationLoop(runningB, approachB, setNodesB, adjList, setCollisionsB, setPacketsB, maxSlotB, slotRefB, 'B', speedMultiplier, route);

  const batteryA = nodesA.length > 0 ? (nodesA.reduce((s, n) => s + n.battery, 0) / nodesA.length / MAX_BATTERY) * 100 : 0;
  const batteryB = nodesB.length > 0 ? (nodesB.reduce((s, n) => s + n.battery, 0) / nodesB.length / MAX_BATTERY) * 100 : 0;

  const isAnyRunning = runningA || runningB;

  const paramsSection = (
    <section className="bg-[#0f172a]/80 backdrop-blur-md border border-[#1e293b]/80 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.4)] mb-8 relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-50 group-hover:opacity-100 transition-opacity"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/10 via-transparent to-transparent pointer-events-none"></div>
      <div className="relative z-10 flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-white font-medium">
          <Activity size={18} className="text-cyan-400" />
          <h2>Simulation Parameters</h2>
        </div>
        {editMode && (
          <div className="text-xs text-purple-400 bg-purple-900/20 px-3 py-1 rounded border border-purple-900/50 animate-pulse">
            Right-click two nodes to connect or disconnect them.
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
        <div className="flex flex-col gap-3 col-span-1 md:col-span-4 relative z-10">
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400">IoT Nodes</label>
            <span className="bg-[#1e293b] text-purple-300 text-xs px-2 py-0.5 rounded-full">{nodeCount}</span>
          </div>
          <input type="range" min="5" max="50" value={nodeCount} onChange={(e) => setNodeCount(Number(e.target.value))} onPointerUp={() => { if (isGenerated) handleConfirmGenerate(); }} onTouchEnd={() => { if (isGenerated) handleConfirmGenerate(); }} disabled={isAnyRunning} className={isAnyRunning ? 'opacity-50 cursor-not-allowed' : ''} />
        </div>
        <div className="flex flex-col gap-3 col-span-1 md:col-span-4 relative z-10">
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400">Edge density</label>
            <span className="bg-[#1e293b] text-purple-300 text-xs px-2 py-0.5 rounded-full">{edgeDensity}</span>
          </div>
          <input type="range" min="0.05" max="0.4" step="0.01" value={edgeDensity} onChange={(e) => setEdgeDensity(Number(e.target.value))} onPointerUp={() => { if (isGenerated) handleConfirmGenerate(); }} onTouchEnd={() => { if (isGenerated) handleConfirmGenerate(); }} disabled={isAnyRunning} className={isAnyRunning ? 'opacity-50 cursor-not-allowed' : ''} />
        </div>
        <div className="flex flex-col gap-3 col-span-1 md:col-span-4 relative z-10">
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400">Simulation Speed</label>
            <span className="bg-[#1e293b] text-purple-300 text-xs px-2 py-0.5 rounded-full">{speedMultiplier}x</span>
          </div>
          <input type="range" min="0.1" max="5" step="0.1" value={speedMultiplier} onChange={(e) => setSpeedMultiplier(Number(e.target.value))} />
        </div>
        <div className="flex flex-row gap-3 col-span-1 md:col-span-12 justify-end mt-2">
          {selectedNode && (
            <div className="flex-1 flex gap-2 items-center bg-purple-900/10 px-3 py-2 rounded-lg border border-purple-500/20 mr-auto">
               <span className="text-purple-300 font-medium text-xs">Node {selectedNode.replace('Node_', '')} selected:</span>
               <button onClick={() => setSourceNodeId(selectedNode)} className={`text-xs px-2 py-1 rounded font-bold transition-colors ${sourceNodeId === selectedNode ? 'bg-green-600 text-white' : 'bg-[#0f172a] text-green-400 hover:bg-[#1e293b] border border-green-800'}`}>Set Source</button>
               <button onClick={() => setSinkNodeId(selectedNode)} className={`text-xs px-2 py-1 rounded font-bold transition-colors ${sinkNodeId === selectedNode ? 'bg-blue-600 text-white' : 'bg-[#0f172a] text-blue-400 hover:bg-[#1e293b] border border-blue-800'}`}>Set Sink</button>
               {(sourceNodeId === selectedNode || sinkNodeId === selectedNode) && (
                 <button onClick={() => {
                   if (sourceNodeId === selectedNode) setSourceNodeId(null);
                   if (sinkNodeId === selectedNode) setSinkNodeId(null);
                 }} className="text-[10px] px-2 py-1 rounded font-bold bg-[#0f172a] text-slate-400 hover:text-white transition-colors ml-2 border border-[#334155]">Clear</button>
               )}
            </div>
          )}
          <button onClick={handleConfirmGenerate} disabled={isAnyRunning} className={`bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 ${isAnyRunning ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Zap size={16} /> {isGenerated ? 'Regenerate' : 'Generate & Analyze'}
          </button>
          {isGenerated && (
            <button onClick={() => setShowResetModal(true)} disabled={isAnyRunning} className={`bg-[#0f172a] hover:bg-[#1e293b] text-slate-300 font-medium py-2 px-3 rounded-lg border border-[#334155] transition-all flex items-center justify-center gap-1 ${isAnyRunning ? 'opacity-50 cursor-not-allowed' : ''}`} title="Reset">
              <Cpu size={16} />
            </button>
          )}
          {isGenerated && (
            <button onClick={() => { setEditMode(!editMode); setSelectedNode(null); }} disabled={isAnyRunning} className={`text-sm font-medium py-2 px-3 rounded-lg transition flex items-center justify-center gap-1 ${editMode ? 'bg-purple-900/50 border border-purple-500 text-purple-300' : 'bg-[#0f172a] hover:bg-[#1e293b] border border-[#334155] text-slate-300'} ${isAnyRunning ? 'opacity-50 cursor-not-allowed' : ''}`} title={editMode ? 'Stop Editing' : 'Draw/Edit Mode'}>
              <span>✏️</span> {editMode ? 'Stop Edit' : 'Edit'}
            </button>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 font-sans overflow-hidden">
      {/* Top Navigation Header */}
      <header className="h-16 bg-[#0B1020] border-b border-[#1e293b] flex items-center justify-between px-6 shrink-0 z-20 shadow-sm relative">
        <div className="flex items-center gap-3 select-none cursor-pointer" onClick={handleTitleClick} title="Click 5 times for a surprise">
           <Network size={24} className={`text-cyan-500 ${cyberpunkMode ? 'animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]' : ''}`} />
           <span className="font-bold text-lg tracking-tight text-white">IoT Sim<span className="text-cyan-500">.</span></span>
        </div>
        
        {activeTab === 'home' ? (
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500 animate-in fade-in duration-500 absolute left-1/2 -translate-x-1/2">
             <div className="flex items-center gap-2">
               <span className="relative flex h-2 w-2">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
               </span>
               <span className="text-cyan-400 tracking-wide">Simulation Engine Ready</span>
             </div>
          </div>
        ) : (
          <nav className="hidden md:flex items-center gap-1 bg-[#0f172a] p-1 rounded-lg border border-[#1e293b] absolute left-1/2 -translate-x-1/2">
            <button onClick={() => setActiveTab('home')} className="px-4 py-1.5 rounded-md text-sm font-medium transition-all text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50">Home</button>
            <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-[#1e293b] text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50'}`}>Simulator</button>
            <button onClick={() => setActiveTab('comparison')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'comparison' ? 'bg-[#1e293b] text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50'}`}>Compare</button>
            <button onClick={() => setActiveTab('analysis')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'analysis' ? 'bg-[#1e293b] text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50'}`}>Analytics</button>
          </nav>
        )}

        <div className="flex items-center gap-3">
           {activeTab !== 'home' && (
             <button onClick={() => setShowLogsSidebar(!showLogsSidebar)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${showLogsSidebar ? 'bg-cyan-950/30 text-cyan-400 border-cyan-900/50 shadow-sm' : 'bg-[#0f172a] text-slate-400 border-[#1e293b] hover:text-slate-200 hover:bg-[#1e293b]'}`}>
               <Terminal size={16} />
               <span className="hidden sm:inline">Logs</span>
               {logs.length > 0 && <span className="bg-cyan-900/50 text-cyan-300 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{logs.length}</span>}
             </button>
           )}
        </div>
      </header>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 overflow-y-auto bg-glow-theme">
          {activeTab === 'home' && <HomeTab setActiveTab={setActiveTab} />}
          
          {activeTab !== 'home' && (
            <div className="p-6 md:p-8 flex-1">
              {activeTab === 'dashboard' && (
                <div className="max-w-7xl mx-auto pb-10 animate-slide-morph">
                  <div className="mb-6 flex items-end justify-between">
                    <div>
                      <h2 className="text-3xl font-bold text-white mb-2">Network Simulator</h2>
                      <p className="text-slate-400 text-base">Visualize algorithm behavior in real-time on a single topology.</p>
                    </div>
                  </div>
            {paramsSection}
            {/* Dashboard specifically locks Panel A to Chaos and B to user choice */}
            <div className="mb-6 flex flex-col gap-3">
               <div className="flex items-center gap-4">
                 <label className="text-sm font-medium text-slate-400 whitespace-nowrap">Coloring Algorithm (Optimized Panel):</label>
                 <div className={`flex flex-1 bg-[#0f172a] rounded-lg p-1 border border-[#1e293b] ${isAnyRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                   {['greedy', 'tabu', 'sa'].map((algo) => (
                     <div key={algo} className="flex-1 flex relative">
                       <button
                         onClick={() => setApproachB(algo as Approach)}
                         className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${approachB === algo ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] scale-[1.02]' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1e293b]/50'}`}
                       >
                         {getApproachName(algo as Approach).replace(' Coloring', '')}
                       </button>
                       <button 
                         onClick={(e) => { e.stopPropagation(); setInfoPopup(algo as Approach); }}
                         className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-cyan-400 transition-colors bg-[#0f172a] rounded-md opacity-70 hover:opacity-100"
                         title="Algorithm Info"
                       >
                         <Info size={14} />
                       </button>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <NetworkPanel 
                title="Chaos Network" subtitle="Unoptimized Random Access" approach="chaos"
                nodes={nodesA} adjList={adjList} isRunning={runningA} packets={packetsA} collisions={collisionsA} batteryPercent={batteryA}
                onStart={() => { setRunningA(true); setHasSimulationStarted(true); }} onStop={() => setRunningA(false)}
                onNodeMove={handleNodeMove} onNodeMoveEnd={handleNodeMoveEnd}
                onNodeRightClick={handleNodeRightClick} selectedNode={selectedNode} editMode={editMode} speedMultiplier={speedMultiplier}
                sourceNodeId={sourceNodeId} sinkNodeId={sinkNodeId} route={route} onNodeSelect={setSelectedNode}
              />
              <NetworkPanel 
                title="Optimized Network" subtitle={getApproachName(approachB)} approach={approachB}
                nodes={nodesB} adjList={adjList} isRunning={runningB} packets={packetsB} collisions={collisionsB} batteryPercent={batteryB}
                onStart={() => { setRunningB(true); setHasSimulationStarted(true); }} onStop={() => setRunningB(false)}
                onNodeMove={handleNodeMove} onNodeMoveEnd={handleNodeMoveEnd}
                onNodeRightClick={handleNodeRightClick} selectedNode={selectedNode} editMode={editMode} speedMultiplier={speedMultiplier}
                sourceNodeId={sourceNodeId} sinkNodeId={sinkNodeId} route={route} onNodeSelect={setSelectedNode}
              />
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="max-w-7xl mx-auto h-full flex flex-col pb-10 animate-slide-morph">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-white mb-2">Performance Analysis</h2>
              <p className="text-slate-400 text-base">Detailed breakdown of algorithmic efficiency, throughput, and energy consumption.</p>
            </div>
            <AnalysisTab data={analyticsData} setActiveTab={setActiveTab} hasSimulationStarted={hasSimulationStarted} />
          </div>
        )}

        {activeTab === 'comparison' && (
                <div className="max-w-7xl mx-auto h-full flex flex-col pb-10 animate-slide-morph">
                  <div className="mb-6">
                    <h2 className="text-3xl font-bold text-white mb-2">Algorithm Comparison</h2>
                    <p className="text-slate-400 text-base">Select any two approaches to compare their performance side by side.</p>
                  </div>
            {paramsSection}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-[500px]">
              <div className="flex flex-col gap-4">
                <select value={approachA} onChange={e => setApproachA(e.target.value as Approach)} className="bg-[#0f172a]/80 backdrop-blur-md border border-[#1e293b] text-white rounded-xl p-3.5 outline-none focus:border-cyan-500 shadow-inner font-semibold cursor-pointer transition-colors hover:bg-[#1e293b]/80">
                  <option value="chaos">Random Access (Chaos)</option>
                  <option value="greedy">Greedy Coloring</option>
                  <option value="tabu">Tabu Search</option>
                  <option value="sa">Simulated Annealing</option>
                </select>
                <NetworkPanel 
                  title={`Panel A`} subtitle={getApproachName(approachA)} approach={approachA}
                  nodes={nodesA} adjList={adjList} isRunning={runningA} packets={packetsA} collisions={collisionsA} batteryPercent={batteryA}
                  onStart={() => setRunningA(true)} onStop={() => setRunningA(false)}
                  onNodeMove={handleNodeMove} onNodeMoveEnd={handleNodeMoveEnd}
                  onNodeRightClick={handleNodeRightClick} selectedNode={selectedNode} editMode={editMode} speedMultiplier={speedMultiplier}
                  sourceNodeId={sourceNodeId} sinkNodeId={sinkNodeId} route={route} onNodeSelect={setSelectedNode}
                />
              </div>
              <div className="flex flex-col gap-4">
                <select value={approachB} onChange={e => setApproachB(e.target.value as Approach)} className="bg-[#0f172a]/80 backdrop-blur-md border border-[#1e293b] text-white rounded-xl p-3.5 outline-none focus:border-cyan-500 shadow-inner font-semibold cursor-pointer transition-colors hover:bg-[#1e293b]/80">
                  <option value="chaos">Random Access (Chaos)</option>
                  <option value="greedy">Greedy Coloring</option>
                  <option value="tabu">Tabu Search</option>
                  <option value="sa">Simulated Annealing</option>
                </select>
                <NetworkPanel 
                  title={`Panel B`} subtitle={getApproachName(approachB)} approach={approachB}
                  nodes={nodesB} adjList={adjList} isRunning={runningB} packets={packetsB} collisions={collisionsB} batteryPercent={batteryB}
                  onStart={() => setRunningB(true)} onStop={() => setRunningB(false)}
                  onNodeMove={handleNodeMove} onNodeMoveEnd={handleNodeMoveEnd}
                  onNodeRightClick={handleNodeRightClick} selectedNode={selectedNode} editMode={editMode} speedMultiplier={speedMultiplier}
                  sourceNodeId={sourceNodeId} sinkNodeId={sinkNodeId} route={route} onNodeSelect={setSelectedNode}
                />
              </div>
            </div>
                </div>
              )}
            </div>
          )}

          {/* Global Footer */}
          <footer className="mt-auto py-8 border-t border-[#1e293b]/50 bg-[#0B1020]/50 backdrop-blur">
            <div className="max-w-7xl mx-auto px-6 text-center flex flex-col items-center gap-2">
              <Network size={20} className="text-cyan-500 opacity-50 mb-2" />
              <p className="text-sm text-slate-500 font-medium">
                Advanced IoT Simulation Engine
              </p>
              <p className="text-xs text-slate-600">
                Designed to evaluate TDMA scheduling heuristics (Greedy, Tabu Search, Simulated Annealing) against Random Access collisions.
              </p>
            </div>
          </footer>
        </main>

        {/* Right Logs Sidebar */}
      {showLogsSidebar && (
        <aside className="w-80 bg-[#0B1020] border-l border-[#1e293b] flex flex-col h-full shadow-2xl transition-all duration-300">
          <div className="p-4 border-b border-[#1e293b] flex justify-between items-center bg-[#050b14]">
            <div className="flex items-center gap-2 text-white font-bold">
              <FileText size={18} className="text-cyan-400" />
              <h2>Network Logs</h2>
            </div>
            <button onClick={() => setLogs([])} className="px-3 py-1 bg-[#0f172a] hover:bg-[#1e293b] text-slate-300 rounded text-xs border border-[#334155] transition-colors">
              Clear
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-2">
            {logs.length === 0 ? (
              <div className="text-slate-500 text-center py-10 px-4">No logs available. Start simulation to trace.</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex flex-col gap-1 p-2 bg-[#050b14] border border-[#1e293b] rounded-md">
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>{log.timestamp.toLocaleTimeString()}</span>
                    {log.panel && <span className="bg-[#1e293b] text-slate-300 px-1.5 py-0.5 rounded">PANEL {log.panel}</span>}
                  </div>
                  <span className={`${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warning' ? 'text-yellow-400' :
                    log.type === 'success' ? 'text-green-400' :
                    'text-cyan-400'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      )}
      </div>

      {/* Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-2">Reset Network?</h3>
            <p className="text-slate-400 text-sm mb-6">
              This will clear all nodes, edges, and simulation data. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 bg-[#0f172a] hover:bg-[#1e293b] border border-[#334155] transition-colors">
                Cancel
              </button>
              <button onClick={confirmReset} className="px-4 py-2 rounded-lg text-sm font-medium text-red-100 bg-red-600 hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-colors">
                Reset Network
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Popup Modal */}
      {infoPopup && <AlgorithmInfoModal algo={infoPopup} onClose={() => setInfoPopup(null)} />}
    </div>
  );
}
