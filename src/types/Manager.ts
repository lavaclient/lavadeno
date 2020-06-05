import { SocketOptions } from "./Node.ts";

export type SendFunction = (guildId: string, payload: any) => any;

export interface ManagerOptions {
  send: SendFunction;
  shards?: number;
  userId?: string;
  socketDefaults?: SocketOptions;
}