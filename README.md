# lavadeno &middot; [![Discord](https://discordapp.com/api/guilds/696355996657909790/embed.png)](https://discord.gg/BnQECNd) [![Version](https://img.shields.io/npm/v/lavaclient.svg?maxAge=3600)](https://npmjs.com/lavadeno) [![Codacy Badge](https://api.codacy.com/project/badge/Grade/fe049eb85ee74900ae764fc5af6a6299)](https://www.codacy.com/gh/Lavaclient/lavaclient?utm_source=github.com&utm_medium=referral&utm_content=Lavaclient/lavaclient&utm_campaign=Badge_Grade)

> lavadeno is a simple, easy-to-use, and flexible lavalink client built on the **[Deno](https://deno.land/)** Runtime.

_PS. this is just a modified version of [lavaclient](https://npmjs.com/lavaclient)_

## Warning

Lavadeno is untested and might crash... who knows... I don't know, do you?

## Examples

```ts
import { Manager } from "https://deno.land/x/lavadeno/mod.ts";

const manager = new Manager(
  [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
  {
    send: (_, payload) => {
      sendPayloadToDiscordSomeHow()
    },
    shards: 1,
  }
);

manager.on("opened", async () => {
  const player = await manager.join({
    guild: "<guild id>",
    channel: "<channel id>",
  });

  player.play("<base 64 track>");
});

// Use this method to connect all nodes.
manager.init("<client id>")

// use these methods to provide voice server & state updates to lavalink.
manager.serverUpdate({});
manager.stateUpdate({})
```
