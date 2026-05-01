import type { IoTNode } from './types';

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

  // Initialize an empty array for every node
  nodes.forEach(n => adjList.set(n.id, []));

  // Compare every node against every other node
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // If they are within range, they interfere with each other
      if (distance <= interferenceRadius) {
        adjList.get(nodes[i].id)!.push(nodes[j].id);
        adjList.get(nodes[j].id)!.push(nodes[i].id);
      }
    }
  }
  return adjList;
}

// 3. The Graph Coloring Algorithm (Time Slot Assignment)
export function assignTimeSlots(nodes: IoTNode[], adjList: Map<string, string[]>): IoTNode[] {
  // Create a copy so we don't mutate state directly (React best practice)
  const updatedNodes = nodes.map(n => ({ ...n }));

  // Map to keep track of slots assigned so far: { Node_1: 0, Node_2: 1 }
  const assignedSlots = new Map<string, number>();

  updatedNodes.forEach(node => {
    // Get the slots already taken by this node's interfering neighbors
    const neighbors = adjList.get(node.id) || [];
    const takenSlots = new Set(
      neighbors.map(n => assignedSlots.get(n)).filter((slot): slot is number => slot !== undefined)
    );

    // Find the lowest available integer starting from 0
    let currentSlot = 0;
    while (takenSlots.has(currentSlot)) {
      currentSlot++;
    }

    // Assign the slot to the node
    assignedSlots.set(node.id, currentSlot);
    node.color = currentSlot;
  });

  return updatedNodes;
}