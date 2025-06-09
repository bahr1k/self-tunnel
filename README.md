# self-tunnel

self-tunnel is a lightweight Node.js module that allows your application to establish a secure, outbound WebSocket tunnel to a remote service. This provides HTTPS access to your local web server (Express, Fastify, etc.) from anywhere in the world without port forwarding or a static IP address.You can register any domain (including free subdomains from providers like No-IP or ClouDNS) or use your own custom domain and configure it in one place.

## Features

-📡 Remote HTTPS access to a Node.js server behind a NAT or firewall.
-🔐 Secure tunneling over WebSockets (WSS).
-🌍 No port forwarding or public IP address required.
-⚙️ Easy integration with any Node.js application running on a local port.
-🔧 Flexible configuration via an options object or environment variables (process.env).
-🔄 Automatic reconnection and keep-alive checks.
-🕊️ Minimal dependencies (only ws). 

## How It Works

1. Your Node.js application, using self-tunnel, opens a persistent WebSocket connection to the tunnel service endpoint (device-tunnel.top).

2. The tunnel service accepts incoming HTTPS requests for your domain and forwards them over the WebSocket to your application.

3. self-tunnel receives the request, establishes a local TCP connection to your web server (e.g., on localhost:8080), sends it the request, and returns the response back through the tunnel.

## Quick Start

### 1. Pick/Register a Domain
- You can use **any** domain or subdomain.  
- If you need a free subdomain, try services like **No-IP** or **ClouDNS**.  
- Add your domain to the https://device-tunnel.top/ service.

### 2. Installation

Add the module to your project using npm or yarn:
```bash
npm install self-tunnel # or yarn add self-tunnel
```

### 3. Configure and Run

This is all you need to start a tunnel for your existing Node.js server.

**Example with Express.js:**
```js
import express from 'express';
import selfTunnel from 'self-tunnel'; 

// 1. Your application
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Hello from my local server via the tunnel!');
});

app.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);

  // 2. Start the tunnel
  const tunnel = selfTunnel({
    domain: process.env.TUNNEL_DOMAIN || 'mynodeapp.mydomain.com', // Your domain
    secret: process.env.TUNNEL_SECRET,                             // Your secret key
    localPort: PORT,                                               // Your local server's port
    debug: true                                                    // Enable debug logs
  });

  // Your server is now accessible at https://mynodeapp.mydomain.com
});
```
You can set domain and secret directly in the code or use the environment variables TUNNEL_DOMAIN and TUNNEL_SECRET for better security and flexibility.

## Accessing Multiple Devices Under One Domain

If you have multiple Node.js applications running behind the same tunnel domain, you can configure path-based routing using the device option.

- Application A uses:
selfTunnel({ domain: "myapps.example.com", device: "service-A", ... })
- Application B uses the same domain but a different device name:
selfTunnel({ domain: "myapps.example.com", device: "service-B", ... })

Clients can now access them at different URLs:
```
https://myapps.example.com/service-A/
https://myapps.example.com/service-B/
```

The tunnel service will route requests based on the device name prefix. The device marked as "primary" in the service will be accessible from the root domain path.

## Requirements

- Node.js v16.x or higher.
- A running local web server (based on Express, Fastify, http.createServer, etc.).
- A registered domain (or subdomain) pointing to a compatible tunnel service

## Configuration Reference

Initializes and starts the tunnel.
`selfTunnel(options, [app])`
app<Object>: (Optional) An Express/Connect app instance. If provided, the module will automatically add middleware to preserve the x-original-id header.

`options`<Object>
<table><tbody><tr><th><p>Parameter</p></th><th><p>Type</p></th><th><p>Description</p></th><th><p>Default</p></th><th><p>Environment Variable</p></th></tr><tr><td><p><strong><code>domain</code></strong></p></td><td><p><code>&lt;string&gt;</code></p></td><td><p><strong>(Required)</strong> Your tunnel domain.</p></td><td><p>-</p></td><td><p><code>TUNNEL_DOMAIN</code></p></td></tr><tr><td><p><strong><code>secret</code></strong></p></td><td><p><code>&lt;string&gt;</code></p></td><td><p><strong>(Required)</strong> The secret key from the tunnel service.</p></td><td><p>-</p></td><td><p><code>TUNNEL_SECRET</code></p></td></tr><tr><td><p><code>localPort</code></p></td><td><p><code>&lt;number&gt;</code></p></td><td><p>The port of your local HTTP server.</p></td><td><p><code>80</code></p></td><td><p>-</p></td></tr><tr><td><p><code>provider</code></p></td><td><p><code>&lt;string&gt;</code></p></td><td><p>The WebSocket URL of the tunnel provider.</p></td><td><p><code>wss://device-tunnel.top:3333</code></p></td><td><p>-</p></td></tr><tr><td><p><code>device</code></p></td><td><p><code>&lt;string&gt;</code></p></td><td><p>A unique device name for path-based routing.</p></td><td><p><code>'default-app'</code></p></td><td><p>-</p></td></tr><tr><td><p><code>public</code></p></td><td><p><code>&lt;boolean&gt;</code></p></td><td><p>Access mode. <code>true</code> for public, <code>false</code> for private (requires service auth).</p></td><td><p><code>false</code></p></td><td><p>-</p></td></tr><tr><td><p><code>debug</code></p></td><td><p><code>&lt;boolean&gt;</code></p></td><td><p>Set to <code>true</code> to enable verbose logging to the console.</p></td><td><p><code>false</code></p></td><td><p>-</p></td></tr><tr><td><p><code>pingInterval</code></p></td><td><p><code>&lt;number&gt;</code></p></td><td><p>Interval for sending ping requests to keep the connection alive (in ms).</p></td><td><p><code>50000</code></p></td><td><p>-</p></td></tr><tr><td><p><code>autoConnectInterval</code></p></td><td><p><code>&lt;number&gt;</code></p></td><td><p>Interval for reconnection attempts on disconnect (in ms). Set to <code>0</code> to disable.</p></td><td><p><code>30000</code></p></td><td><p>-</p></td></tr></tbody></table>



**Returned `tunnel` Object**
- tunnel.close(): Gracefully closes the WebSocket connection and all local sockets, and disables auto-reconnect.
- tunnel.pause(): Temporarily suspends request proxying by sending a suspend command to the server.
- tunnel.resume(): Resumes request handling after a pause.


## License

MIT

## Contributing / Feedback

If you find a bug, have a feature request, or want to contribute, please file an issue or submit a PR on the GitHub repo.
