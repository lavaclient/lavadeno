import {
    startBot,
    cache,
    ws,
    Embed,
    CreateMessage,
    sendMessage,
    getUser,
} from "https://deno.land/x/discordeno/mod.ts";
import { ms } from "https://raw.githubusercontent.com/denolib/ms/master/ms.ts";

import { Lavalink } from "../deps.ts";
import { DiscordVoiceServer, DiscordVoiceState, Cluster, constants, Player } from "../mod.ts";
import { Queue } from "./queue.ts";
import testsConfig from "./tests.config.ts";

constants.clientName = "lavadeno-testing";
constants.useFilters = false;

const cluster = new Cluster({
    nodes: [testsConfig.node],
    sendGatewayPayload: (id, payload) => {
        const shard = cache.guilds.get(id)?.shardId;
        if (shard != null) ws.sendShardMessage(shard, payload);
    },
    userId: 870267613635309618n,
});

const queues: Map<bigint, Queue> = new Map();

cluster.on("nodeDisconnect", (node, code, reason) => {
    console.log(
        `[bot] (node ${node.id}) disconnected, code=${code}, reason=${reason ? `"${reason}"` : "unknown"
        }`
    );
});

cluster.on("nodeError", (_, error) => {
    void error;
});

cluster.on("nodeDebug", (node, message) => {
    console.debug(`[music] (node ${node.id}) ${message}`);
});

cluster.on("nodeConnect", (node, reconnect) => {
    console.log(`[music] (node ${node.id}) ${reconnect ? "re" : ""}connected to node.`);
    node.rest.routePlanner.status().then(status => console.dir(status));
});

startBot({
    token: testsConfig.token,
    intents: ["Guilds", "GuildMessages", "GuildVoiceStates"],
    eventHandlers: {
        ready: () => {
            console.log("[bot] ready");
            cluster.init();
        },
        raw: data => {
            switch (data.t) {
                case "VOICE_SERVER_UPDATE":
                case "VOICE_STATE_UPDATE":
                    cluster.handleVoiceUpdate(data.d as DiscordVoiceState | DiscordVoiceServer);
                    break;
            }
        },
        messageCreate: async message => {
            if (message.isBot || !message.content.startsWith("!")) {
                return;
            }

            const [command, ...args] = message.content.slice(1).trim().split(/\s+/g);

            switch (command.toLowerCase()) {
                case "volume": {
                    const player = cluster.players.get(message.guildId);
                    if (!player?.connected) {
                        return message.reply(
                            embed("A player for this guild doesn't exist."),
                            false
                        );
                    }

                    player.setVolume(+args[0]);
                    break;
                }
                case "join": {
                    let player = cluster.players.get(message.guildId);
                    if (player?.connected) {
                        return message.reply(
                            embed("A player for this guild already exists"),
                            false
                        );
                    }

                    const vc = message.guild?.voiceStates?.get(message.authorId);
                    if (!vc?.channelId) {
                        return message.reply(embed("You need to join a voice channel!"), false);
                    }

                    player ??= cluster.createPlayer(message.guildId);
                    player.connect(vc.channelId, { deafen: true });
                    createQueue(player, message.channelId);

                    return message.reply(embed(`Connected to <#${vc.channelId}>`), false);
                }
                case "nowplaying": {
                    const player = cluster.players.get(message.guildId);
                    if (!player?.connected) {
                        return message.reply(
                            embed("A player for this guild doesn't exist."),
                            false
                        );
                    }

                    const current = queues.get(player.guildId)?.current;
                    if (!current) {
                        return message.reply(embed("Nothing is currently playing."), false);
                    }

                    const requester = current.requester && (await getUser(current.requester));
                    return message.reply(
                        embed(
                            `**Duration:** ${ms(current.length, {
                                long: true,
                            })}`,
                            {
                                title: current.title,
                                url: current.uri,
                                footer: requester
                                    ? {
                                        text: `It was requested by ${requester.username}#${requester.discriminator}`,
                                    }
                                    : undefined,
                                thumbnail: { url: current.thumbnail },
                            }
                        ),
                        false
                    );
                }
                case "nightcore": {
                    const player = cluster.players.get(message.guildId);
                    if (!player?.connected) {
                        return message.reply(
                            embed("A player for this guild doesn't exist."),
                            false
                        );
                    }

                    player.filters.timescale = player.filters.timescale?.rate !== 1.0
                        ? { rate: 1.09, pitch: 1.125, speed: 1 }
                        : { rate: 1, pitch: 1, speed: 1 };

                    player.setFilters();

                    return message.reply(
                        embed(
                            `${player.filters.timescale?.pitch === 1 ? "Enabled" : "Disabled"
                            } **nightcore**!`
                        ),
                        false
                    );
                }
                case "play": {
                    const vc = message.guild?.voiceStates?.get(message.authorId);
                    if (!vc?.channelId) {
                        return message.reply(embed("You need to join a voice channel!"), false);
                    }

                    let player = cluster.players.get(message.guildId);
                    if (player && player.channelId !== vc.channelId) {
                        return message.reply(embed(`Join <#${player.channelId}> bozo`), false);
                    }

                    const query = args.join(" ");
                    const results = await cluster.rest.loadTracks(
                        /^https?:\/\//.test(query) ? query : `ytsearch:${query}`
                    );

                    let tracks: Lavalink.Track[] = [],
                        msg = "";
                    switch (results.loadType) {
                        case "LOAD_FAILED":
                        case "NO_MATCHES":
                            return message.reply(embed("uh oh something went wrong"), false);
                        case "PLAYLIST_LOADED":
                            tracks = results.tracks;
                            msg = `Queued playlist [**${results.playlistInfo.name}**](${query}), it has a total of **${tracks.length}** tracks.`;
                            break;
                        case "TRACK_LOADED":
                        case "SEARCH_RESULT": {
                            const [track] = results.tracks;
                            tracks = [track];
                            msg = `Queued [**${track.info.title}**](${track.info.uri})`;
                            break;
                        }
                    }

                    if (!player?.connected) {
                        player ??= cluster.createPlayer(message.guildId);
                        await player.connect(vc.channelId, { deafen: true });
                    }

                    await message.reply(embed(msg), false);

                    const queue =
                        queues.get(player.guildId) ?? createQueue(player, message.channelId);

                    queue.add(tracks, message.authorId);
                    if (!queue.started) {
                        queue.start();
                    }
                }
            }
        },
    },
});

function createQueue(player: Player, channelId: bigint): Queue {
    const queue = new Queue(player);
    queues.set(player.guildId, queue);

    queue.on("trackStart", song => {
        sendMessage(
            channelId,
            embed(`Now playing [**${song.title}**](${song.uri}) <@${song.requester}>`)
        );
    });

    return queue;
}

function embed(description: string, other: Omit<Embed, "description"> = {}): CreateMessage {
    other.color ??= 0xfff269;
    return { embeds: [{ description, ...other }] };
}
