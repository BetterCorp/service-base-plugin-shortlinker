import {
  BSBPluginConfig,
  BSBPluginEvents,
  BSBService, BSBServiceClient,
  BSBServiceConstructor, IPluginLogger,
  ServiceEventsBase,
} from "@bettercorp/service-base";
import * as fs from "fs";
import * as path from "path";
import {z} from "zod";
import {ShortDomain, ShortLink, ShortLinkLog, ShortLinkPerson} from "../../index";
import {Writable} from "stream";

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
  onEvents: {};
  emitEvents: ServiceEventsBase;
  onReturnableEvents: {
    getShortlink(key: string, ip: string, userAgent: string, referer: string, origin: string): Promise<ShortLinkPerson | null>;
  };
  emitReturnableEvents: ServiceEventsBase;
  onBroadcast: ServiceEventsBase;
  emitBroadcast: ServiceEventsBase;
}

export class Client
    extends BSBServiceClient<Plugin> {
  dispose(): void {
  }

  async init(): Promise<void> {
  }

  async run(): Promise<void> {
  }

  public pluginName = "service-shortlinker-backend";
  initBeforePlugins?: string[] | undefined;
  initAfterPlugins?: string[] | undefined;
  runBeforePlugins?: string[] | undefined;
  runAfterPlugins?: string[] | undefined;


  public async getShortlink(key: string, ip: string, userAgent: string, referer: string, origin: string): Promise<ShortLinkPerson | null> {
    return await this.events.emitEventAndReturn("getShortlink", 5, key, ip, userAgent, referer, origin);
  }
}

export class Plugin
    extends BSBService<Config, ServiceTypes> {
  initBeforePlugins?: string[] | undefined;
  initAfterPlugins?: string[] | undefined;
  runBeforePlugins?: string[] | undefined;
  runAfterPlugins?: string[] | undefined;
  methods = {};

  dispose(): void {
    this.db.dispose();
  }

  run(): void | Promise<void> {
  }

  private storageDir: string;
  private db: DB;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.storageDir = path.join(this.cwd, "./config");
    this.db = new DB(this.storageDir, this.log);
  }

  public async init(): Promise<void> {
    console.log(typeof this.db);
    await this.events.onReturnableEvent("getShortlink", async (key: string, ip: string, userAgent: string, referer: string, origin: string) => {
      const domain = this.db.getDomainByOrigin(origin);
      if (domain === null) {
        return null;
      }
      if (!domain.active) {
        return null;
      }
      const link = this.db.getLinkByKey(key);
      if (link === null) {
        return {
          domain,
          link: null,
        };
      }
      if (link.domainId !== domain.id) {
        return null;
      }
      if (!link.active) {
        return {
          domain,
          link: null,
        };
      }
      if (link.activeFrom !== null && link.activeFrom > Date.now()) {
        return {
          domain,
          link: null,
        };
      }
      if (link.activeTo !== null && link.activeTo < Date.now()) {
        return {
          domain,
          link: null,
        };
      }
      this.db.addLog({
        linkId: link.key,
        domainId: domain.id,
        ip,
        userAgent,
        referer,
        timestamp: new Date().toISOString(),
      });
      return {
        domain,
        link,
      };
    });
  }

}

class DB {
  private readonly storageDir: string;

  private handles: Array<{
    linkId: string,
    filePath: string,
    created: number,
    lastUsed: number,
    handle: Writable
  }> = [];
  private cleanupHandler: NodeJS.Timeout;

  public dispose() {
    clearInterval(this.cleanupHandler);
  }

  private log: IPluginLogger;

  constructor(storageDir: string, log: IPluginLogger) {
    this.storageDir = storageDir;
    this.log = log;

    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, {recursive: true});
    }
    if (!fs.existsSync(path.join(storageDir, "domains.json"))) {
      fs.writeFileSync(path.join(storageDir, "domains.json"), "[]");
    }
    if (!fs.existsSync(path.join(storageDir, "links.json"))) {
      fs.writeFileSync(path.join(storageDir, "links.json"), "[]");
    }
    if (!fs.existsSync(path.join(storageDir, "logs"))) {
      fs.mkdirSync(path.join(storageDir, "logs"), {recursive: true});
    }

    this.cleanupHandler = setInterval(() => this.cleanupHandles(), 1000 * 60);
  }

  public getDomains(): Array<ShortDomain> {
    return JSON.parse(fs.readFileSync(path.join(this.storageDir, "domains.json"), "utf-8"));
  }

  public getLinks(): Array<ShortLink> {
    return JSON.parse(fs.readFileSync(path.join(this.storageDir, "links.json"), "utf-8"));
  }

  public getDomain(id: string): ShortDomain | null {
    return this.getDomains()
               .find((d) => d.id === id) ?? null;
  }

  public getDomainByOrigin(origin: string): ShortDomain | null {
    return this.getDomains()
               .find((d) => d.domain === origin) ?? null;
  }

  public getLinkByKey(key: string): ShortLink | null {
    return this.getLinks()
               .find((d) => d.key === key) ?? null;
  }

  public addLog(log: ShortLinkLog) {
    let handler = this.handles.find((h) => h.linkId === log.linkId);
    if (handler === undefined) {
      let logDir = path.join(this.storageDir, `./logs/${log.domainId}`);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, {recursive: true});
      }
      let logFile = path.join(logDir, `./${log.linkId}.log`);
      let handle = fs.createWriteStream(logFile, {flags: "a"});
      handler = {
        linkId: log.linkId,
        filePath: logFile,
        created: Date.now(),
        lastUsed: Date.now(),
        handle,
      };
      this.handles.push(handler);
    }
    handler.lastUsed = Date.now();
    handler.handle.write(`${log.timestamp} [${log.ip}] [${log.userAgent}] [${log.referer}]\n`);
    this.log.reportStat(`shortlinker-link-${log.domainId}-${log.linkId}`, 1);
  }

  private async cleanupHandles(): Promise<void> {
    if (this.handles.length === 0) {
      return;
    }
    this.log.debug("Cleaning up handles ({handles})", {handles: this.handles.length});
    const now = Date.now();
    while (this.handles.filter(x => x.lastUsed < now - 1000 * 60 * 60).length > 0) {
      const handle = this.handles.find(x => x.lastUsed < now - 1000 * 60 * 60);
      if (handle === undefined) {
        this.log.error("Could not find handle to close!");
        break;
      }
      this.log.info("Closing handle for {linkId} - {filePath}", {linkId: handle.linkId, filePath: handle.filePath});
      handle.handle.end();
      this.handles = this.handles.filter(x => x !== handle);
    }
  }
}