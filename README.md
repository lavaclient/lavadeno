<img align="center" src="./assets/banner.png" alt="lavadeno banner">
<hr />
<blockquote>
  A powerful lavalink client built on the <strong>Deno</strong> Runtime
  <p><a href="https://discord.gg/CH9ubGPMV6">Discord Server</a> &bull; <a href="https://github.com/lavaclient/lavadeno">Github</a></p>
</blockquote>

- **Flexible**: Lavadeno is not restricted to a specific discord library. Meaning you only need a connection to the discord gateway for it to work.
- **Easy-to-Use**: Lavadeno has a neat and user-friendly promise-based api.
- **Lightweight**: Designed to be small and performant, it's a great choice for any sized project.


<h2 align="center">Setup</h2>

- Deno 1.3.x
- Lavalink
  - [Official](https://github.com/freyacodes/lavalink)
  - [With Filters (Unofficial)](https://github.com/melike2d/lavalink/)
- Connection to the Discord Gateway.

```ts
import { Manager } from "https://deno.land/x/lavadeno/mod.ts";

const nodes = [
  {
    id: "main",
    host: "localhost",
    port: 2333,
    password: "youshallnotpass"
  }
]

const manager = new Manager(nodes, {
  send(id, payload) {
    sendPayloadToDiscord();
  }
});
```

---

<p align="center"><a href="https://dimensional.fun">melike2d</a> &copy; 2020</p>
