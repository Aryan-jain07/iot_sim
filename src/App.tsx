import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { IoTNode, NodeState, Approach, LogEntry, AlgorithmMetrics } from './types';
import { generateNodes, buildAdjacencyList, greedyColoring, tabuSearchColoring, simulatedAnnealingColoring, runFastForwardAnalytics } from './simulation';
import { Network, Activity, Router, Terminal, Cable, ChevronLeft, Menu, Info, X, Zap, Cpu, FileText } from 'lucide-react';

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
      className={`w-full h-auto bg-[#050b14] rounded-lg border border-[#1e293b] transition-colors ${editMode ? 'shadow-[inset_0_0_20px_rgba(168,85,247,0.15)]' : ''}`}
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
        const strokeColor = isChaos ? '#ef4444' : (isAssigned ? SLOT_COLORS[node.color % SLOT_COLORS.length] : '#64748b');
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
            {node.state === 'COLLISION' && (
              <g className="pointer-events-none" style={{ filter: 'drop-shadow(0 0 15px #ef4444) drop-shadow(0 0 5px #ef4444)' }}>
                <circle cx={node.x} cy={node.y} r="14" fill="none" stroke="#ef4444" strokeWidth="5"
                   style={{ transformOrigin: `${node.x}px ${node.y}px`, animation: `explode-ring ${0.5 / speedMultiplier}s ease-out forwards`, animationPlayState: isRunning ? 'running' : 'paused' }} />
                <circle cx={node.x} cy={node.y} r="7" fill="#ef4444"
                   style={{ transformOrigin: `${node.x}px ${node.y}px`, animation: `explode-core ${0.3 / speedMultiplier}s ease-out forwards`, animationPlayState: isRunning ? 'running' : 'paused' }} />
                <path d={`M ${node.x - 10} ${node.y - 10} L ${node.x + 10} ${node.y + 10} M ${node.x + 10} ${node.y - 10} L ${node.x - 10} ${node.y + 10}`} stroke="#ffffff" strokeWidth="4" strokeLinecap="round"
                   style={{ animation: `explode-x ${0.5 / speedMultiplier}s forwards`, animationPlayState: isRunning ? 'running' : 'paused' }} />
              </g>
            )}
            
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

            <circle cx={node.x} cy={node.y} r="9" fill="#050b14" stroke={node.state === 'TRANSMIT' ? '#facc15' : strokeColor} strokeWidth={isSelected ? "3" : "2.5"} className={`transition-colors duration-200 ${editMode && !isSelected ? 'hover:stroke-purple-400' : ''}`} style={cyberpunkMode ? { filter: `drop-shadow(0 0 8px ${node.state === 'TRANSMIT' ? '#facc15' : strokeColor})` } : {}} />
            <circle cx={node.x} cy={node.y} r="3" fill={node.state === 'TRANSMIT' ? '#facc15' : strokeColor} className="transition-colors duration-200" style={{ filter: `drop-shadow(0 0 4px ${node.state === 'TRANSMIT' ? '#facc15' : strokeColor})` }} />
            
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

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden flex flex-col h-full">
      <div className="flex justify-between items-center p-4 border-b border-[#1e293b]">
        <div>
          <h3 className={`font-semibold flex items-center gap-2 ${isChaos ? 'text-red-400' : 'text-cyan-400'}`}>
            {title}
            {editMode && <span className="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/50 tracking-wider">EDIT MODE</span>}
          </h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
        {showControls && (
          !isRunning ? (
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
          )
        )}
      </div>

      <div className="p-4 flex-1">
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

function AnalyticsDashboard({ data }: { data: AlgorithmMetrics[] }) {
  if (!data || data.length === 0) return null;


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

  const optimizationData = formattedData.filter(d => d.scheme !== 'chaos');

  return (
    <div className="mt-8 flex flex-col gap-6">


      {/* Scheme Comparison Table */}
      <div className="bg-[#0B1020] border border-[#1e293b] rounded-xl p-5 shadow-xl shadow-purple-900/5">
        <h3 className="text-white font-bold mb-4">Scheme Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="text-xs uppercase text-slate-500 border-b border-[#1e293b]">
              <tr>
                <th className="px-4 py-3">Scheme</th>
                <th className="px-4 py-3">Slots</th>
                <th className="px-4 py-3">Collisions</th>
                <th className="px-4 py-3">Success</th>
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
                  <td className="px-4 py-4">{row.successRate}%</td>
                  <td className="px-4 py-4">{row.avgDelay} ms</td>
                  <td className="px-4 py-4">{row.energy}</td>
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'comparison'>('dashboard');
  const [showLogsSidebar, setShowLogsSidebar] = useState(false);
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
            const collided = new Set<string>();
            attempting.forEach(id => {
              const neighbors = adjList.get(id) || [];
              if (neighbors.some(nId => attempting.has(nId))) collided.add(id);
            });

            updated = currentNodes.map(node => {
              if (node.battery <= 0) return { ...node, state: 'SLEEP' as NodeState, hasDataPacket: node.hasDataPacket };
              if (collided.has(node.id)) {
                tickCollisions++;
                return { ...node, state: 'COLLISION' as NodeState, battery: Math.max(0, node.battery - 300), hasDataPacket: node.hasDataPacket };
              } else if (attempting.has(node.id)) {
                tickSuccesses++;
                successfulTransmitters.add(node.id);
                return { ...node, state: 'TRANSMIT' as NodeState, battery: Math.max(0, node.battery - 150), hasDataPacket: node.hasDataPacket };
              }
              return { ...node, state: 'IDLE' as NodeState, battery: Math.max(0, node.battery - 50), hasDataPacket: node.hasDataPacket };
            });
            tickCollisions = Math.floor(tickCollisions / 2);
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
    <section className="bg-[#0B1020] border border-[#1e293b] rounded-2xl p-6 shadow-xl shadow-cyan-900/5 mb-8">
      <div className="flex items-center justify-between mb-6">
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
        <div className="flex flex-col gap-3 col-span-1 md:col-span-4">
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400">IoT Nodes</label>
            <span className="bg-[#1e293b] text-purple-300 text-xs px-2 py-0.5 rounded-full">{nodeCount}</span>
          </div>
          <input type="range" min="5" max="50" value={nodeCount} onChange={(e) => setNodeCount(Number(e.target.value))} onPointerUp={() => { if (isGenerated) handleConfirmGenerate(); }} onTouchEnd={() => { if (isGenerated) handleConfirmGenerate(); }} disabled={isAnyRunning} className={isAnyRunning ? 'opacity-50 cursor-not-allowed' : ''} />
        </div>
        <div className="flex flex-col gap-3 col-span-1 md:col-span-4">
          <div className="flex justify-between items-center text-sm">
            <label className="text-slate-400">Edge density</label>
            <span className="bg-[#1e293b] text-purple-300 text-xs px-2 py-0.5 rounded-full">{edgeDensity}</span>
          </div>
          <input type="range" min="0.05" max="0.4" step="0.01" value={edgeDensity} onChange={(e) => setEdgeDensity(Number(e.target.value))} onPointerUp={() => { if (isGenerated) handleConfirmGenerate(); }} onTouchEnd={() => { if (isGenerated) handleConfirmGenerate(); }} disabled={isAnyRunning} className={isAnyRunning ? 'opacity-50 cursor-not-allowed' : ''} />
        </div>
        <div className="flex flex-col gap-3 col-span-1 md:col-span-4">
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
    <div className="flex h-screen bg-[#050b14] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 bg-[#0B1020] border-r border-[#1e293b] flex flex-col z-20`}>
        <div className={`p-6 border-b border-[#1e293b] flex items-center ${isSidebarCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'}`}>
          {!isSidebarCollapsed && (
            <h2 className="text-lg font-bold text-white flex items-center gap-2 cursor-pointer select-none" onClick={handleTitleClick} title="Click 5 times for a surprise">
              <Network size={20} className={`text-cyan-400 ${cyberpunkMode ? 'animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]' : ''}`} />
              <span className="truncate">IoT Simulator</span>
            </h2>
          )}
          <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="text-slate-400 hover:text-white transition-colors">
            {isSidebarCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button onClick={() => setActiveTab('dashboard')} title="Dashboard" className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3 rounded-lg font-medium text-sm transition-colors ${activeTab === 'dashboard' ? 'bg-cyan-950/30 text-cyan-400 border border-cyan-900/50' : 'text-slate-400 hover:text-slate-200 hover:bg-[#0f172a]'}`}>
            <Router size={18} className="shrink-0" /> {!isSidebarCollapsed && <span>Dashboard</span>}
          </button>
          <button onClick={() => setActiveTab('comparison')} title="Comparison" className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3 rounded-lg font-medium text-sm transition-colors ${activeTab === 'comparison' ? 'bg-cyan-950/30 text-cyan-400 border border-cyan-900/50' : 'text-slate-400 hover:text-slate-200 hover:bg-[#0f172a]'}`}>
            <Cable size={18} className="shrink-0" /> {!isSidebarCollapsed && <span>Comparison</span>}
          </button>
          <div className="flex-1"></div>
          <button onClick={() => setShowLogsSidebar(!showLogsSidebar)} title="Logs Panel" className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-4'} py-3 rounded-lg font-medium text-sm transition-colors ${showLogsSidebar ? 'bg-cyan-950/30 text-cyan-400 border border-cyan-900/50' : 'text-slate-400 hover:text-slate-200 hover:bg-[#0f172a]'}`}>
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
              <Terminal size={18} className="shrink-0" /> {!isSidebarCollapsed && <span>Logs Panel</span>}
            </div>
            {!isSidebarCollapsed && <span className="text-[10px] bg-[#1e293b] px-2 py-0.5 rounded-full">{logs.length}</span>}
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative bg-glow-theme">
        <div className="p-8">
          <header className="max-w-6xl mx-auto mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[#0B1020] p-1.5 rounded border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                <Network size={18} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]" />
              </div>
              <span className="text-xs font-medium text-slate-300">
                IoT Energy Optimisation <span className="text-slate-500 mx-1">·</span> Graph Coloring
              </span>
            </div>
            <h1 className="text-5xl font-extrabold text-white mb-5 tracking-tight drop-shadow-sm">
              Color the network. <span className="text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]">Save the energy.</span>
            </h1>
            <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
              Compare <span className="text-slate-200 font-medium">Greedy</span>, <span className="text-slate-200 font-medium">Tabu Search</span>, and <span className="text-slate-200 font-medium">Simulated Annealing</span> on dynamically generated IoT topologies. Visualise collisions, delay, and energy waste when scheduling is left to chance.
            </p>
          </header>

          {activeTab === 'dashboard' && (
            <div className="max-w-6xl mx-auto pb-20">
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
                         className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${approachB === algo ? 'bg-[#1e293b] text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
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
                onStart={() => setRunningA(true)} onStop={() => setRunningA(false)}
                onNodeMove={handleNodeMove} onNodeMoveEnd={handleNodeMoveEnd}
                onNodeRightClick={handleNodeRightClick} selectedNode={selectedNode} editMode={editMode} speedMultiplier={speedMultiplier}
                sourceNodeId={sourceNodeId} sinkNodeId={sinkNodeId} route={route} onNodeSelect={setSelectedNode}
              />
              <NetworkPanel 
                title="Optimized Network" subtitle={getApproachName(approachB)} approach={approachB}
                nodes={nodesB} adjList={adjList} isRunning={runningB} packets={packetsB} collisions={collisionsB} batteryPercent={batteryB}
                onStart={() => setRunningB(true)} onStop={() => setRunningB(false)}
                onNodeMove={handleNodeMove} onNodeMoveEnd={handleNodeMoveEnd}
                onNodeRightClick={handleNodeRightClick} selectedNode={selectedNode} editMode={editMode} speedMultiplier={speedMultiplier}
                sourceNodeId={sourceNodeId} sinkNodeId={sinkNodeId} route={route} onNodeSelect={setSelectedNode}
              />
            </div>
            {isGenerated && <AnalyticsDashboard data={analyticsData} />}
          </div>
        )}

        {activeTab === 'comparison' && (
          <div className="max-w-6xl mx-auto h-full flex flex-col pb-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Compare Approaches</h2>
              <p className="text-slate-400 text-sm">Select any two algorithms to compare their performance side by side.</p>
            </div>
            {paramsSection}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-[500px]">
              <div className="flex flex-col gap-4">
                <select value={approachA} onChange={e => setApproachA(e.target.value as Approach)} className="bg-[#0B1020] border border-[#1e293b] text-white rounded-lg p-3 outline-none focus:border-cyan-500">
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
                <select value={approachB} onChange={e => setApproachB(e.target.value as Approach)} className="bg-[#0B1020] border border-[#1e293b] text-white rounded-lg p-3 outline-none focus:border-cyan-500">
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
