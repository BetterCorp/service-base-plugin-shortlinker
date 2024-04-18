import {
  BSBPluginConfig,
  BSBPluginEvents,
  BSBService,
  BSBServiceConstructor,
  ServiceEventsBase,
} from "@bettercorp/service-base";
import {Fastify} from "@bettercorp/service-base-plugin-fastify";
import {Tools} from "@bettercorp/tools/lib/Tools";
import {z} from "zod";
import {Client as ShortLinker} from "../service-shortlinker-backend/plugin";

export const secSchema = z.object({});

export class Config
    extends BSBPluginConfig<typeof secSchema> {
  migrate(toVersion: string, fromVersion: string | null, fromConfig: any) {
    return fromConfig;
  }

  validationSchema = secSchema;
}

export interface ServiceTypes
    extends BSBPluginEvents {
  onEvents: ServiceEventsBase;
  emitEvents: ServiceEventsBase;
  onReturnableEvents: ServiceEventsBase;
  emitReturnableEvents: ServiceEventsBase;
  onBroadcast: ServiceEventsBase;
  emitBroadcast: ServiceEventsBase;
}


export class Plugin
    extends BSBService<Config, ServiceTypes> {
  initBeforePlugins?: string[] | undefined;
  initAfterPlugins?: string[] | undefined;
  runBeforePlugins?: string[] | undefined;
  runAfterPlugins?: string[] | undefined;
  methods = {};
  private fastify: Fastify;

  dispose?(): void;

  run(): void | Promise<void> {
  }

  private shortLinker: ShortLinker;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.fastify = new Fastify(this as any);
    this.shortLinker = new ShortLinker(this);
  }

  public async init(): Promise<void> {
    await this.fastify.get("/:linkKey/", async (reply, params, query, request) => {
      if (params.linkKey == "" || params.linkKey == "chrome.css.map") {
        return reply.status(404)
                    .send("Not found");
      }
      reply.header("Access-Control-Allow-Origin", "-");
      reply.header("Access-Control-Allow-Methods", "GET");
      reply.header("Access-Control-Allow-Headers", "-");
      
      let ip = (
          request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"] || request.ip
      );
      if (Tools.isArray(ip)) {
        ip = ip[0];
      }
      let userAgent = request.headers["user-agent"] ?? "";
      if (Tools.isArray(userAgent)) {
        userAgent = userAgent[0];
      }
      let referer = request.headers["referer"] ?? "";
      if (Tools.isArray(referer)) {
        referer = referer[0];
      }
      let origin = request.headers["host"] ?? "";
      if (Tools.isArray(origin)) {
        origin = origin[0];
      }

      const link = await this.shortLinker.getShortlink(params.linkKey, ip, userAgent, referer, origin);

      if (link && link.link) {
        return reply.redirect(link.link.redirectTo);
      }
      if (link && link.domain.defaultRedirectTo) {
        return reply.redirect(link.domain.defaultRedirectTo);
      }
      return reply.status(404)
                  .send("Not found");
    });

  }

}
