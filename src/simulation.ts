import type { IoTNode, Approach, AlgorithmMetrics } from './types';

// 1. Generate Random Nodes
export function generateNodes(count: number, canvasWidth: number, canvasHeight: number): IoTNode[] {
  const nodes: IoTNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `Node_${i + 1}`,
      x: Math.floor(Math.random() * (canvasWidth - 40)) + 20,
      y: Math.floor(Math.random() * (canvasHeight - 40)) + 20,
      battery: 10000,
      color: -1,     // -1 means no time slot assigned yet
      state: 'IDLE'
    });
  }
  return nodes;
}

// 2. Build the Interference Graph
export function buildAdjacencyList(nodes: IoTNode[], interferenceRadius: number): Map<string, string[]> {
  const adjList = new Map<string, string[]>();

  nodes.forEach(n => adjList.set(n.id, []));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= interferenceRadius) {
        adjList.get(nodes[i].id)!.push(nodes[j].id);
        adjList.get(nodes[j].id)!.push(nodes[i].id);
      }
    }
  }
  return adjList;
}

// 3. Greedy Graph Coloring
export function greedyColoring(nodes: IoTNode[], adjList: Map<string, string[]>): IoTNode[] {
  const updatedNodes = nodes.map(n => ({ ...n }));
  const assignedSlots = new Map<string, number>();

  updatedNodes.forEach(node => {
    const neighbors = adjList.get(node.id) || [];
    const takenSlots = new Set(
      neighbors.map(n => assignedSlots.get(n)).filter((slot): slot is number => slot !== undefined)
    );

    let currentSlot = 0;
    while (takenSlots.has(currentSlot)) {
      currentSlot++;
    }

    assignedSlots.set(node.id, currentSlot);
    node.color = currentSlot;
  });

  return updatedNodes;
}

// Helper to count conflicts
function countConflicts(nodes: IoTNode[], adjList: Map<string, string[]>, nodeMap: Map<string, IoTNode>): number {
  let conflicts = 0;
  nodes.forEach(node => {
    const neighbors = adjList.get(node.id) || [];
    neighbors.forEach(nId => {
      const neighbor = nodeMap.get(nId);
      if (neighbor && node.color !== -1 && node.color === neighbor.color) {
        conflicts++;
      }
    });
  });
  return conflicts / 2; // Each edge counted twice
}

// 4. Tabu Search Coloring (Approximation)
export function tabuSearchColoring(nodes: IoTNode[], adjList: Map<string, string[]>): IoTNode[] {
  let bestSolution = greedyColoring(nodes, adjList);
  let bestColorCount = Math.max(...bestSolution.map(n => n.color)) + 1;
  
  if (bestColorCount <= 1) return bestSolution;

  const maxIterations = 200; // Reduced for performance in UI
  let currentTargetColors = bestColorCount - 1;

  while (currentTargetColors > 0) {
    let currentSolution = nodes.map(n => ({ ...n, color: Math.floor(Math.random() * currentTargetColors) }));
    let nodeMap = new Map(currentSolution.map(n => [n.id, n]));
    let tabuList = new Map<string, number>();
    const tabuTenure = 5;
    let foundValid = false;

    for (let iter = 0; iter < maxIterations; iter++) {
      if (countConflicts(currentSolution, adjList, nodeMap) === 0) {
        foundValid = true;
        break;
      }

      let worstNodeId = '';
      let maxNodeConflicts = -1;
      
      currentSolution.forEach(node => {
        let localConflicts = 0;
        (adjList.get(node.id) || []).forEach(nId => {
          if (nodeMap.get(nId)?.color === node.color) localConflicts++;
        });
        if (localConflicts > maxNodeConflicts) {
          maxNodeConflicts = localConflicts;
          worstNodeId = node.id;
        }
      });

      if (maxNodeConflicts === 0) {
        foundValid = true;
        break;
      }

      const worstNode = nodeMap.get(worstNodeId)!;
      let bestMoveColor = worstNode.color;
      let minMoveConflicts = Infinity;

      for (let c = 0; c < currentTargetColors; c++) {
        if (c === worstNode.color) continue;
        
        const tabuKey = `${worstNode.id}-${c}`;
        if (tabuList.has(tabuKey) && tabuList.get(tabuKey)! > iter) {
           continue; 
        }

        let newConflicts = 0;
        (adjList.get(worstNode.id) || []).forEach(nId => {
          if (nodeMap.get(nId)?.color === c) newConflicts++;
        });

        if (newConflicts < minMoveConflicts) {
          minMoveConflicts = newConflicts;
          bestMoveColor = c;
        }
      }

      worstNode.color = bestMoveColor;
      tabuList.set(`${worstNode.id}-${bestMoveColor}`, iter + tabuTenure);
    }

    if (foundValid) {
      bestSolution = currentSolution.map(n => ({ ...n }));
      currentTargetColors--;
    } else {
      break;
    }
  }

  return bestSolution;
}

// 5. Simulated Annealing Coloring (Approximation)
export function simulatedAnnealingColoring(nodes: IoTNode[], adjList: Map<string, string[]>): IoTNode[] {
  let bestSolution = greedyColoring(nodes, adjList);
  let bestColorCount = Math.max(...bestSolution.map(n => n.color)) + 1;
  
  if (bestColorCount <= 1) return bestSolution;

  let currentTargetColors = bestColorCount - 1;

  while (currentTargetColors > 0) {
    let currentSolution = nodes.map(n => ({ ...n, color: Math.floor(Math.random() * currentTargetColors) }));
    let nodeMap = new Map(currentSolution.map(n => [n.id, n]));
    let currentEnergy = countConflicts(currentSolution, adjList, nodeMap);
    let initialTemp = 10.0;
    let coolingRate = 0.95;
    let temp = initialTemp;
    let foundValid = false;

    for (let iter = 0; iter < 200; iter++) { // Reduced for performance
      if (currentEnergy === 0) {
        foundValid = true;
        break;
      }

      const randomIdx = Math.floor(Math.random() * currentSolution.length);
      const node = currentSolution[randomIdx];
      const oldColor = node.color;
      let newColor = oldColor;
      if (currentTargetColors > 1) {
        while(newColor === oldColor) {
          newColor = Math.floor(Math.random() * currentTargetColors);
        }
      }

      node.color = newColor;
      const newEnergy = countConflicts(currentSolution, adjList, nodeMap);
      
      const deltaE = newEnergy - currentEnergy;
      
      if (deltaE < 0 || Math.random() < Math.exp(-deltaE / temp)) {
        currentEnergy = newEnergy; 
      } else {
        node.color = oldColor; 
      }
      
      temp *= coolingRate;
    }

    if (foundValid) {
      bestSolution = currentSolution.map(n => ({ ...n }));
      currentTargetColors--;
    } else {
      break;
    }
  }

  return bestSolution;
}

export function runFastForwardAnalytics(
  originalNodes: IoTNode[], 
  adjList: Map<string, string[]>
): AlgorithmMetrics[] {
  const approaches: Approach[] = ['chaos', 'greedy', 'tabu', 'sa'];
  const metricsList: AlgorithmMetrics[] = [];
  const TICKS = 100;
  
  for (const approach of approaches) {
    let coloredNodes: IoTNode[] = [];
    let timeMs = 0;
    
    // Time the coloring algorithm
    const start = performance.now();
    if (approach === 'chaos') {
      coloredNodes = originalNodes.map(n => ({ ...n, color: -1 }));
    } else if (approach === 'greedy') {
      coloredNodes = greedyColoring(originalNodes.map(n => ({ ...n, color: -1 })), adjList);
    } else if (approach === 'tabu') {
      coloredNodes = tabuSearchColoring(originalNodes.map(n => ({ ...n, color: -1 })), adjList);
    } else if (approach === 'sa') {
      coloredNodes = simulatedAnnealingColoring(originalNodes.map(n => ({ ...n, color: -1 })), adjList);
    }
    timeMs = performance.now() - start;

    let slots = approach === 'chaos' ? 1 : (coloredNodes.length > 0 ? Math.max(...coloredNodes.map(n => n.color)) + 1 : 1);
    if (slots < 1) slots = 1;

    let totalCollisions = 0;
    let totalSuccesses = 0;
    let totalAttempts = 0;
    let nodes = [...coloredNodes].map(n => ({ ...n, battery: 10000 }));

    // Run 100 ticks
    let slotRef = 0;
    for (let t = 0; t < TICKS; t++) {
      if (approach === 'chaos') {
        const attempting = new Set(nodes.filter(n => n.battery > 0 && Math.random() < 0.20).map(n => n.id));
        const collisionAt = new Set<string>();
        const failedTransmitters = new Set<string>();

        nodes.forEach(node => {
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

        totalAttempts += attempting.size;
        totalCollisions += failedTransmitters.size;
        totalSuccesses += attempting.size - failedTransmitters.size;

        nodes = nodes.map(node => {
          let batteryDrain = 50;
          if (attempting.has(node.id)) {
             batteryDrain = failedTransmitters.has(node.id) ? 300 : 150;
          }
          return { ...node, battery: Math.max(0, node.battery - batteryDrain) };
        });
      } else {
        const nextSlot = slotRef >= slots - 1 ? 0 : slotRef + 1;
        slotRef = nextSlot;

        nodes = nodes.map(node => {
          const transmitting = node.color === nextSlot && node.battery > 0;
          if (transmitting) {
            totalAttempts++;
            totalSuccesses++;
          }
          const drain = transmitting ? 150 : (node.battery > 0 ? 5 : 0);
          return {
            ...node,
            battery: Math.max(0, node.battery - drain)
          };
        });
      }
    }

    const energyConsumed = originalNodes.length * 10000 - nodes.reduce((sum, n) => sum + n.battery, 0);
    const successRate = totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0;
    const throughput = totalSuccesses / TICKS;
    
    let avgDelay = 0;
    if (approach === 'chaos') {
      avgDelay = totalAttempts > 0 ? (totalAttempts / totalSuccesses) * 45 : 0;
    } else {
      avgDelay = (slots / 2) * 10; 
    }

    metricsList.push({
      scheme: approach,
      slots,
      collisions: totalCollisions,
      successRate: Number(successRate.toFixed(1)),
      avgDelay: Number(avgDelay.toFixed(1)),
      energy: Math.round(energyConsumed / 1000), 
      throughput: Number(throughput.toFixed(3)),
      timeMs: Number(timeMs.toFixed(1))
    });
  }
  
  return metricsList;
}
