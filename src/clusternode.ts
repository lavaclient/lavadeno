import { Node } from "./node.ts";

import type { Cluster } from "./cluster.ts";
import type { ConnectionInfo } from "./connection.ts";

export class ClusterNode extends Node {
    readonly id: string;
    readonly cluster: Cluster;

    constructor(id: string, cluster: Cluster, options: ConnectionInfo) {
        super({
            connection: options,
            sendGatewayPayload: (id, p) => cluster.sendGatewayPayload(id, p),
        });

        this.id = id;
        this.cluster = cluster;
    }

}