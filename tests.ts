import { startBot, cache, ws } from "https://deno.land/x/discordeno/mod.ts";
import { Lavalink } from "./deps.ts";
import { DiscordVoiceServer, DiscordVoiceState, Cluster, constants } from "./mod.ts";
import testsConfig from "./tests.config.ts";

constants.clientName = "testing!!!"
constants.useFilters = true;

const cluster = new Cluster({
    nodes: [testsConfig.node],
    sendGatewayPayload: (id, payload) => {
        const shard = cache.guilds.get(id)?.shardId;
        if (shard != null) ws.sendShardMessage(shard, payload);
    },
    userId: 568265456499294218n
})

cluster.on("nodeDisconnect", (node, { code, reason }) => {
    console.log(`[bot] (node ${node.id}) disconnected, code=${code}, reason=${reason ? `"${reason}"` : "unknown"}`)
});

cluster.on("nodeError", (_, error) => {
    void error;
});

cluster.on("nodeDebug", (node, message) => {
    console.debug(`[music] (node ${node.id}) ${message}`)
});

cluster.on("nodeConnect", async (node, reconnect) => {
    console.log(`[music] (node ${node.id}) ${reconnect ? "re" : ""}connected to node.`);

    const { tracks } = await node.rest.loadTracks(`ytsearch:jaden - everything`);

    const player = node
        .createPlayer(641816570032554014n)
        .connect(744385395424362577n);

    await player.setFilters(Lavalink.Filter.Timescale, { rate: 1.1, pitch: 1.1, speed: 1 });
    await player.play(tracks[0]);
});

startBot({
    token: testsConfig.token,
    intents: ["Guilds", "GuildVoiceStates"],
    eventHandlers: {
        ready: () => {
            console.log("[bot] ready");
            cluster.init();
        },
        raw: data => {
            switch (data.t) {
                case "VOICE_SERVER_UPDATE":
                case "VOICE_STATE_UPDATE":
                    cluster.handleVoiceUpdate(data.d as (DiscordVoiceState | DiscordVoiceServer));
                    break;
            }
        }
    }
});
