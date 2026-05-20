import type { IoTNode } from './types'

// Helper to count active wireless collisions in a given schedule configuration
function countCollisions(nodes: IoTNode[], adjList: Map<string, string[]>): number {
  let collisions = 0;
  nodes.forEach(node => {
    const neighbors = adjList.get(node.id) || [];
    neighbors.forEach(neighborId => {
      const neighbor = nodes.find(n => n.id === neighborId);
      // If neighbors share a time slot, it's an active link collision
      if (neighbor && node.color === neighbor.color && node.color !== -1) {
        collisions++;
      }
    });
  });
  return collisions / 2; // Edges are bidirectional
}

// 1. GREEDY APPROACH (Constructive baseline)
export function assignTimeSlots(nodes: IoTNode[], adjList: Map<string, string[]>): IoTNode[] {
  const result = nodes.map(n => ({ ...n, color: -1 }));
  result.forEach(node => {
    const neighbors = adjList.get(node.id) || [];
    const usedColors = new Set<number>();
    
    neighbors.forEach(neighborId => {
      const neighbor = result.find(n => n.id === neighborId);
      if (neighbor && neighbor.color !== -1) {
        usedColors.add(neighbor.color);
      }
    });

    let color = 0;
    while (usedColors.has(color)) {
      color++;
    }
    node.color = color;
  });
  return result;
}

// 2. SIMULATED ANNEALING APPROACH
export function assignSlotsAnnealing(nodes: IoTNode[], adjList: Map<string, string[]>): IoTNode[] {
  // Start with an initial state, then optimize it
  let currentSchedule = assignTimeSlots(nodes, adjList);
  let currentCost = countCollisions(currentSchedule, adjList);
  
  let temperature = 100.0;
  const coolingRate = 0.95;
  const maxSlots = Math.max(5, nodes.length);

  while (temperature > 0.1) {
    const nextSchedule = currentSchedule.map(n => ({ ...n }));
    // Tweak a random node's time slot window
    const randomNode = nextSchedule[Math.floor(Math.random() * nextSchedule.length)];
    randomNode.color = Math.floor(Math.random() * maxSlots);

    const nextCost = countCollisions(nextSchedule, adjList);
    const energyDelta = nextCost - currentCost;

    // Thermodynamic decision check
    if (energyDelta < 0 || Math.random() < Math.exp(-energyDelta / temperature)) {
      currentSchedule = nextSchedule;
      currentCost = nextCost;
    }
    temperature *= coolingRate;
  }
  return currentSchedule;
}

// 3. TABU SEARCH APPROACH
export function assignSlotsTabu(nodes: IoTNode[], adjList: Map<string, string[]>): IoTNode[] {
  let bestSchedule = assignTimeSlots(nodes, adjList);
  let currentSchedule = bestSchedule.map(n => ({ ...n }));
  
  // Short-term memory map tracking: NodeID -> Forbidden until Iteration X
  const tabuList = new Map<string, number>(); 
  const maxIterations = 50;
  const tabuTenure = 5;

  for (let iter = 0; iter < maxIterations; iter++) {
    let bestMoveSchedule: IoTNode[] | null = null;
    let bestMoveCost = Infinity;
    let chosenNodeId = '';

    // Evaluate neighborhood slot modifications
    currentSchedule.forEach(node => {
      if (tabuList.has(node.id) && (tabuList.get(node.id) || 0) > iter) return; // Skip tabu routes

      for (let slot = 0; slot < 6; slot++) {
        if (slot === node.color) continue;
        const candidate = currentSchedule.map(n => n.id === node.id ? { ...n, color: slot } : { ...n });
        const cost = countCollisions(candidate, adjList);

        if (cost < bestMoveCost) {
          bestMoveCost = cost;
          bestMoveSchedule = candidate;
          chosenNodeId = node.id;
        }
      }
    });

    if (bestMoveSchedule) {
      currentSchedule = bestMoveSchedule;
      tabuList.set(chosenNodeId, iter + tabuTenure); // Apply temporary Tabu restriction

      if (countCollisions(currentSchedule, adjList) < countCollisions(bestSchedule, adjList)) {
        bestSchedule = currentSchedule;
      }
    }
  }
  return bestSchedule;
}
