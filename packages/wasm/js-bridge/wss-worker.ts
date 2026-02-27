import { WssWorker, ConnectionState } from '../pkg/buzzu_wasm';

export interface WssWorkerConfig {
  url: string;
  peerId: string;
  roomId: string;
  onMessage?: (message: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class ChatWssWorker {
  private worker: WssWorker;
  private config: WssWorkerConfig;

  constructor(config: WssWorkerConfig) {
    this.config = config;
    this.worker = new WssWorker(config.url, config.peerId, config.roomId);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (this.config.onConnect) {
      this.worker.on('connect', this.createCallback(this.config.onConnect));
    }

    if (this.config.onDisconnect) {
      this.worker.on('disconnect', this.createCallback(this.config.onDisconnect));
    }

    if (this.config.onMessage) {
      this.worker.on('chat', this.createMessageCallback(this.config.onMessage));
      this.worker.on('peer_list', this.createMessageCallback(this.config.onMessage));
      this.worker.on('offer', this.createMessageCallback(this.config.onMessage));
      this.worker.on('answer', this.createMessageCallback(this.config.onMessage));
      this.worker.on('ice_candidate', this.createMessageCallback(this.config.onMessage));
    }

    if (this.config.onError) {
      this.worker.on('error', this.createErrorCallback(this.config.onError));
    }
  }

  private createCallback(fn: () => void): Function {
    return function(): void {
      fn();
    };
  }

  private createMessageCallback(fn: (message: any) => void): Function {
    return function(message: any): void {
      fn(message);
    };
  }

  private createErrorCallback(fn: (error: Error) => void): Function {
    return function(error: any): void {
      fn(new Error(error?.message || 'Unknown error'));
    };
  }

  connect(): void {
    try {
      this.worker.connect();
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  disconnect(): void {
    this.worker.disconnect();
  }

  sendChatMessage(message: string): void {
    try {
      this.worker.send_message('chat', message);
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  sendOffer(toPeer: string, sdp: string): void {
    try {
      this.worker.send_offer(toPeer, sdp);
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  sendAnswer(toPeer: string, sdp: string): void {
    try {
      this.worker.send_answer(toPeer, sdp);
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  sendIceCandidate(toPeer: string, candidate: string): void {
    try {
      this.worker.send_ice_candidate(toPeer, candidate);
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  getConnectionState(): ConnectionState {
    return this.worker.get_connection_state();
  }

  getPeerId(): string {
    return this.worker.get_peer_id();
  }

  getRoomId(): string {
    return this.worker.get_room_id();
  }

  isConnected(): boolean {
    return this.getConnectionState() === ConnectionState.Connected;
  }
}