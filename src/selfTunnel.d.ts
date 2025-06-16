declare module 'self-tunnel' {
    import { WebSocket } from 'ws';

    /**
     * Options for creating a tunnel.
     */
    export interface TunnelOptions {
        /** Tunnel server URL (default: 'wss://device-tunnel.top:3333') */
        provider?: string;
        /** Domain name for the tunnel (fallback to env.TUNNEL_DOMAIN) */
        domain?: string;
        /** Secret key for authentication (fallback to env.TUNNEL_SECRET) */
        secret?: string;
        /** Device identifier (default: 'default-app') */
        device?: string;
        /** Enable debug logging (default: false) */
        debug?: boolean;
        /** Make tunnel publicly accessible (default: false) */
        public?: boolean;
        /** Local port to forward (default: 80) */
        localPort?: number;
        /** Ping interval in ms (default: 50000) */
        pingInterval?: number;
        /** Auto-reconnect interval in ms (default: 30000) */
        autoConnectInterval?: number;
    }

    /**
     * Returned tunnel instance.
     */
    export interface TunnelInstance {
        /** Full WebSocket URL */
        url: string;

        /** Authentication info */
        auth: {
            /** Domain being used */
            domain: string | undefined;
            /** Secret key */
            secret: string | undefined;
            /** Device name */
            device: string;
        };

        /** Binary command to suspend (pause) the tunnel */
        suspendCommand: Buffer | null;
        /** EOF marker sent over the wire */
        eofMarker: Buffer | null;
        /** ID of the ping interval timer */
        pingIntervalId: NodeJS.Timeout | null;
        /** True if this client is primary in a multi-client setup */
        isPrimary: boolean;
        /** Underlying WebSocket connection */
        ws: WebSocket | null;
        /** Whether the tunnel connection is alive */
        alive: boolean;

        /** Whether debug logging is enabled */
        debug: boolean;
        /** Whether tunnel is in public mode */
        isPublic: boolean;
        /** Local port number being tunneled */
        localPort: number;

        /** Ping interval (ms) */
        pingInterval: number;
        /** Auto-reconnect interval (ms) */
        autoConnectInterval: number;

        /**
         * Close the tunnel and disable auto-reconnect.
         */
        close(): void;

        /**
         * Pause the tunnel by sending the suspend command.
         */
        pause(): void;

        /**
         * Resume the tunnel after being paused.
         */
        resume(): void;
    }

    /**
     * Create a new tunnel.
     * @param options TunnelOptions
     * @returns TunnelInstance
     */
    export default function selfTunnel(options: TunnelOptions): TunnelInstance;
}