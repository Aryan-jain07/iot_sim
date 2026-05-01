// src/types.ts

export type NodeState = 'SLEEP' | 'IDLE' | 'TRANSMIT' | 'COLLISION';

export interface IoTNode {
    id: string;
    x: number;         // X coordinate on the visual canvas
    y: number;         // Y coordinate on the visual canvas
    battery: number;   // Current energy level
    color: number;     // Assigned Time Slot (-1 means unassigned)
    state: NodeState;  // Current action in the simulation loop
}