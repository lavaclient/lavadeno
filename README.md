<img align="center" src="./assets/banner.png" alt="lavadeno banner">
<hr />
<blockquote>
  A powerful lavalink client built on the <strong>Deno</strong> Runtime
  <p><a href="https://discord.gg/CH9ubGPMV6">Discord Server</a> &bull; <a href="https://github.com/lavaclient/lavadeno">Github</a></p>
</blockquote>

- **Flexible:** Lavadeno is a generic library, meaning you can use it with just a connection to the discord gateway, no library restriction.
- **Easy-to-Use**: Lavadeno has a neat and user-friendly promise-based api.
- **Lightweight:** Designed to be small and performant, it's a great choice for any sized project.

<h2 align="center">Setup</h2>

- Deno Runtime
- Lavalink
  - [Official](https://github.com/freyacodes/lavalink)
  - [With Filters (Unofficial)](https://github.com/melike2d/lavalink/)
- Connection to the Discord Gateway.

#### Single Node

```ts
import { Node } from "https://deno.land/x/lavadeno/mod.ts";

const node = new Node({
    connection: {
        host: "localhost",
        port: 2333,
        password: "youshallnotpass",
    },
    sendGatewayPayload: (id, payload) => sendPayloadToDiscord(),
});

node.on("connect", node => console.log(`now connected...`));

node.connect(870267613635309618n);
```
#### Multiple Nodes

```ts
import { Cluster } from "https://deno.land/x/lavadeno/mod.ts";

const cluster = new Cluster({
    nodes: [
        {
            id: "main",
            host: "localhost",
            port: 2333,
            password: "youshallnotpass",
        },
    ]
    sendGatewayPayload: (id, payload) => sendPayloadToDiscord(),
});

cluster.on("nodeConnect", node => console.log(`node "${node.id}" is now connected...`));

cluster.init(870267613635309618n);
```

### Resuming/Reconnecting

LavaDeno supports exponential backoff and basic reconnection types, along with *manual* reconnecting.

```ts
const node = new Node({
    connection: {
        resuming: {
           key: "lavad3n0ftw" 
        }

        // exponential backoff
        reconnect: {
            type: "exponential",
            maxDelay: 15000,
            initialDelay: 1000,
            tries: -1 // unlimited
        }

        // basic 
        reconnect: {
            type: "basic",
            delay: 5000.
            tries: 5
        }
    }
}) 
```

---

<p align="center"><a href="https://dimensional.fun">melike2d</a> &copy; 2018 - 2021</p>
