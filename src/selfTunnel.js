import net from 'net';
import { WebSocket } from 'ws';

export default function selfTunnel(options = {}, app = null) {
    const tunnel = {
        url: options.provider || 'wss://device-tunnel.top:3333',
        // Tunnel connection settings
        auth: {
            domain: options.domain || process.env.TUNNEL_DOMAIN,
            secret: options.secret || process.env.TUNNEL_SECRET,
            device: options.device || 'default-app' // any valid name in URL
        },
        // Variables to store tunnel state
        suspendCommand: null,
        eofMarker: null,
        pingIntervalId: null,
        isPrimary: false,
        ws: null,
        alive: false,
        // Options
        debug: options.debug || false,
        isPublic: options.public || false,
        localPort: options.localPort || 80,

        pingInterval: options.pingInterval || 50000,
        autoConnectInterval: options.autoConnectInterval !== undefined ? options.autoConnectInterval : 30000,
        // Functions
        close: null,
        pause: null,
        resume: null
    };

    if (app) { //TODO option middleware
        app.use((req, res, next) => {
            if (req.headers['x-original-id'])
                res.setHeader('x-original-id', req.headers['x-original-id']);
            next();
        });
    }

    // Local connection management, self piping
    let localSocket = null;
    const requestQueue = [];
    let connecting = false;
    let processing = false;

    function ensureLocalConnection() {
        return new Promise((resolve, reject) => {
            if (localSocket && !localSocket.destroyed) {
                resolve(localSocket);
                return;
            }

            if (connecting) {
                // Wait for current connection attempt
                const checkConnection = () => {
                    if (localSocket && !localSocket.destroyed) {
                        resolve(localSocket);
                    } else if (!connecting) {
                        reject(new Error('Connection failed'));
                    } else {
                        setTimeout(checkConnection, 10);
                    }
                };
                checkConnection();
                return;
            }

            connecting = true;
            localSocket = net.connect({ port: tunnel.localPort, host: '127.0.0.1' }, () => {
                if (tunnel.debug) console.log('Connected to local HTTP server');
                localSocket.setKeepAlive(true, 10000);
                connecting = false;
                resolve(localSocket);
            });

            localSocket.on('error', (err) => {
                console.error('Local socket error:', err.message);
                connecting = false;
                localSocket = null;
                reject(err);
            });

            localSocket.on('close', () => {
                if (tunnel.debug) console.log('Local socket closed');
                localSocket = null;
            });
        });
    }

    async function processRequestQueue() {
        if (processing || requestQueue.length === 0) return;
        processing = true;

        while (requestQueue.length > 0) {
            const reqBuffer = requestQueue.shift();

            if (tunnel.debug)
                console.log(
                    'IN:',
                    reqBuffer.length,
                    ' bytes\n',
                    reqBuffer.subarray(0, Math.min(reqBuffer.length, 64)).toString(),
                    '...'
                );

            try {
                const socket = await ensureLocalConnection();

                const responseChunks = [];
                let responseComplete = false;
                const onData = (chunk) => {
                    responseChunks.push(chunk);
                };

                const onEnd = () => {
                    if (!responseComplete) {
                        cleanupSocketListeners();
                        const response = Buffer.concat([...responseChunks, tunnel.eofMarker]);
                        responseComplete = true;
                        handleTunnelResponse(response);
                    }
                };

                const onError = (err) => {
                    if (!responseComplete) {
                        cleanupSocketListeners();
                        responseComplete = true;
                        localSocket = null; // Force reconnection for next request
                        console.error('Local socket error:', err.message);
                    }
                };

                const cleanupSocketListeners = () => {
                    socket.off('data', onData);
                    socket.off('end', onEnd);
                    socket.off('error', onError);
                };

                socket.on('data', onData);
                socket.on('end', onEnd);
                socket.on('error', onError);
                socket.write(reqBuffer);

                let chunksLast = responseChunks.length;
                // Wait for response completion
                await new Promise((resolveWait) => {
                    const checkComplete = () => {
                        if (responseComplete) {
                            resolveWait();
                        } else {
                            if (chunksLast == 0 || chunksLast != responseChunks.length) {
                                setTimeout(checkComplete, 10);
                                chunksLast = responseChunks.length;
                            }
                            else { // Response completed
                                cleanupSocketListeners();

                                const response = Buffer.concat([...responseChunks, tunnel.eofMarker]);
                                responseComplete = true;
                                handleTunnelResponse(response);
                                resolveWait();
                            }
                        }
                    };
                    checkComplete();
                });

            } catch (error) {
                console.error('Error processing request:', error.message);
                // continue processing
            }
        }

        processing = false;
        // Check if new requests arrived while processing
        if (requestQueue.length > 0)
            setImmediate(processRequestQueue);
    }

    function handleTunnelResponse(resBuffer) {
        tunnel.ws.send(resBuffer, { binary: true }, (err) => {
            if (err)
                console.error('WebSocket send error:', err.message);
        });
        if (tunnel.debug)
            console.log(
                'Out:',
                resBuffer.length,
                ' bytes\n',
                resBuffer.subarray(0, Math.min(resBuffer.length, 64)).toString(),
                '...'
            );
    }

    function handleTunnelRequest(reqBuffer) {
        if (app && processing && localSocket) {
            localSocket.write(reqBuffer);
        }
        else {
            requestQueue.push(reqBuffer);
            if (!processing)
                processRequestQueue();
        }
    }

    // Function to connect to the wss tunnel
    function connectToTunnel() {
        cleanup();

        if (tunnel.debug) console.log(`Connecting to tunnel at ${tunnel.url}...`);
        // Create a new WebSocket connection
        const ws = new WebSocket(tunnel.url, {
            autoPong: true,
            followRedirects: false
        });
        tunnel.ws = ws;

        // Connection handler - wait for greeting
        ws.on('open', () => {
            tunnel.alive = true;
            console.log('Connection to tunnel server established');
        });

        // Message handler
        ws.on('message', (req, isBinary) => {
            try {
                if (!req || req.length <= 0) return;
                if (!isBinary) {
                    const message = req.toString();
                    if (tunnel.debug) {
                        const preview =
                            message.length > 256 ? message.substring(0, 256) + '...' : message;
                        console.log(`Received: ${preview}`);
                    }
                    // Try to parse as JSON
                    if (message.startsWith('{')) {
                        const jsonData = JSON.parse(message);
                        // Server greeting
                        if (jsonData.type === 'hello') {
                            // Send login request with credentials
                            ws.send(JSON.stringify({ type: 'login', ...tunnel.auth }));
                            if (tunnel.debug) console.log('Authorization request sent');
                            return;
                        }
                        // Handle login response
                        else if (jsonData.type === 'login' && jsonData.status === 'ok') {
                            if (tunnel.debug) console.log('Authorization successful. Starting tunnel...');
                            tunnel.isPrimary = jsonData.primary;
                            ws.send(JSON.stringify({ type: 'start', usage: tunnel.isPublic ? 'public' : 'private' }));
                            return;
                        }
                        // Handle tunnel start response
                        else if (jsonData.type === 'start') {
                            tunnel.suspendCommand = Buffer.from(jsonData.suspend);
                            tunnel.eofMarker = Buffer.from(jsonData.eof);

                            console.log(
                                tunnel.isPrimary ?
                                    `Website should be accessible at https://${tunnel.auth.domain}` :
                                    `Website should be accessible at https://${tunnel.auth.domain}/${tunnel.auth.device}`
                            );
                            return;
                        }
                        // Handle errors
                        else if (jsonData.type === 'error') {
                            console.error(`Tunnel error: ${jsonData.message}`);
                            return;
                        }
                        // Echo non-JSON message // if server busy
                        else if (message.startsWith('->')) {
                            console.log('Echo:', message.substring(2));
                            return;
                        }
                    }
                }
                // You can send suspendCommand to stop the proxy at any time.
                //ws.send(tunnel.suspendCommand, { binary: true });
            } catch (error) {
                console.error('Error processing message:', error.message);
            }

            if (req.indexOf(tunnel.suspendCommand) !== -1) {
                console.log('Received suspend command');
                // Logic to pause your server
                return;
            }
            // Forward other requests to your Web Server
            handleTunnelRequest(req);
        });

        // Connection close handler
        ws.on('close', (code, reason) => {
            console.log(`Tunnel connection closed: ${code} ${reason || 'Reason not specified'}`);
            cleanup();
            tunnel.ws = null;
            tunnel.suspendCommand = null;
            tunnel.eofMarker = null;

            // Try to reconnect after an interval
            if (tunnel.autoConnectInterval > 10000) {
                console.log('Reconnecting to tunnel in ' + (tunnel.autoConnectInterval / 1000).toFixed(0) + ' seconds...');
                setTimeout(connectToTunnel, tunnel.autoConnectInterval);
            }
        });

        // Error handler
        ws.on('error', (error) => {
            console.error('Tunnel connection error:', error.message);
            cleanup();
        });

        ws.on('pong', function pong() {
            tunnel.alive = true; // Помечаем сервер как активный
            if (tunnel.debug) console.log('Tunnel pong, alive');
        });

        if (tunnel.pingInterval > 1000)
            tunnel.pingIntervalId = setInterval(() => {
                if (!tunnel.alive) {
                    clearInterval(tunnel.pingIntervalId);
                    tunnel.pingIntervalId = null;
                    console.log('Tunnel connection lost.');
                    ws.close();
                    return;
                }
                tunnel.alive = false; // drop alive before ping
                ws.ping();
            }, tunnel.pingInterval);
    }

    function cleanup() {
        if (tunnel.pingIntervalId) {
            clearInterval(tunnel.pingIntervalId);
            tunnel.pingIntervalId = null;
        }

        // Close local socket
        if (localSocket && !localSocket.destroyed) {
            localSocket.removeAllListeners();
            localSocket.destroy();
            localSocket = null;
        }

        requestQueue.length = 0;
        connecting = false;
        processing = false;
        tunnel.alive = false;
    }

    connectToTunnel();

    tunnel.close = () => {
        cleanup();
        if (tunnel.ws) {
            tunnel.ws.close();
            tunnel.ws = null;
        }
        tunnel.autoConnectInterval = 0; // Disable auto-reconnect
    };

    tunnel.pause = () => {
        if (tunnel.ws)
            tunnel.ws.send(tunnel.suspendCommand, { binary: true });
    };

    tunnel.resume = () => {
        if (tunnel.ws)
            tunnel.ws.send(JSON.stringify({
                type: 'start',
                usage: tunnel.isPublic ? 'public' : 'private'
            }));
    };

    return tunnel;
}