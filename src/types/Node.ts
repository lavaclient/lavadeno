export interface SocketData {
  host: string;
  port: string | number;
  password: string;
  id?: string;
  options?: SocketOptions;
}

export interface SocketOptions {
  retryDelay?: number;
  maxTries?: number;
  resumeKey?: string;
  resumeTimeout?: number;
}

export interface MemoryStats {
  free: number;
  used: number;
  allocated: number;
  reservable: number;
}

export interface CPUStats {
  cores: number;
  systemLoad: number;
  lavalinkLoad: number;
}

export interface FrameStats {
  sent?: number;
  nulled?: number;
  deficit?: number;
}

export interface NodeStats {
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: MemoryStats;
  cpu: CPUStats;
  frameStats?: FrameStats;
}