// src/types.ts

export type NodeState = 'SLEEP' | 'IDLE' | 'TRANSMIT' | 'COLLISION' | 'FAILED_TX';

export interface IoTNode {
    id: string;
    x: number;         // X coordinate on the visual canvas
    y: number;         // Y coordinate on the visual canvas
    battery: number;   // Current energy level
    color: number;     // Assigned Time Slot (-1 means unassigned)
    state: NodeState;  // Current action in the simulation loop
    hasDataPacket?: boolean; // Holds the routed data packet
}

export type Approach = 'chaos' | 'greedy' | 'tabu' | 'sa';

export interface LogEntry {
    id: string;
    timestamp: Date;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    panel?: 'A' | 'B';
}

export interface AlgorithmMetrics {
    scheme: Approach;
    slots: number;
    collisions: number;
    successRate: number; 
    avgDelay: number;    
    energy: number;      
    throughput: number;  
    timeMs: number;      
}