import { Socket } from "net";

import { BrowserWindow } from "electron";
import * as ipc from "ipc";
import { Proxy } from "./proxy";

/** Muster zur Erkennung eines Endpunkts bestehend aus Rechnername oder IP Adresse und TCP/IP Port. */
const endPointReg = /^([^:]+):(\d{1,5})$/;

/** Proxy zu einem TCP/IP Server. */
export class TcpProxy extends Proxy {
  /** Verbindung zum Server. */
  private _remote: Socket | undefined = new Socket();

  /** Meldet, ob die Verbindung aktiviert werden konnte. */
  onOpen?(opened: boolean): void;

  /**
   * Initialisiert eine Verbindung,
   *
   * @param server Name des lokalen TCP/IP Servers.
   * @param serverPort Lokaler Port.
   * @param _remoteServer Name des entfernten TCP/IP Servers.
   * @param _remotePort Entfernter Port.
   */
  private constructor(
    server: string,
    serverPort: number,
    private readonly _remoteServer: string,
    private readonly _remotePort: number
  ) {
    /** Lokalen Server einrichten. */
    super(server, serverPort);

    /** Fehlermeldung kann noch verbessert werden. */
    this._remote?.on("error", (e) => console.error(e.message));

    /** Automatische Neuverbindung wenn der entfernte Server neu startet. */
    this._remote?.on("close", () => {
      /** Zustand melden. */
      this.onOpen?.(false);

      /** Mit etwas Pause neu verbinden. */
      setTimeout(this.connect, 5000);
    });

    /** Eingehende Daten verarbeiten. */
    this._remote?.on("data", this.fromRemote);

    /** Erstmalige Verbindung aufbauen. */
    this.connect();
  }

  /** Eingehende Daten verarbeiten. */
  private readonly fromRemote = (data: Buffer): void => this.toClient(data);

  /** Verbindung zum entfernten Server aufsetzen. */
  private readonly connect = (): void => {
    this._remote?.connect(this._remotePort, this._remoteServer, () =>
      this.onOpen?.(true)
    );
  };

  /** Eingehende Daten an den TCP/IP Client weitergeben. */
  protected write(data: Buffer): void {
    try {
      this._remote?.write(data);
    } catch (e) {
      console.error(e.message);
    }
  }

  /** Verbindung endgültig beenden. */
  shutdown(): void {
    try {
      /** TCP/IP Client beenden. */
      this._remote?.destroy();
    } catch (e) {
      console.error(e.message);
    } finally {
      this._remote = undefined;
    }

    /** TCP/IP Server beenden. */
    super.shutdown();
  }

  /**
   * Verbindung zu einem TCP/IP Server herstellen.
   *
   * @param proxyIp IP Adresse dieser Anwendung.
   * @param tcp Gesamtkonfiguration dieser Verbindung.
   * @returns Verbindung sofern konfiguriert.
   */
  static create(
    proxyIp: string,
    tcp: ipc.IProxyConfiguration
  ): TcpProxy | undefined {
    /** Lokale Verbindung prüfen. */
    if (!tcp || tcp.port == null || tcp.port < 1024 || tcp.port > 65535) return;

    /** Entfernte Verbindung prüfen. */
    const ep = endPointReg.exec(tcp.endPoint);

    if (!ep) return;

    /** Neue Verbindung erstellen. */
    return new TcpProxy(proxyIp, tcp.port, ep[1], parseInt(ep[2]));
  }
}

const proxies: Record<string, TcpProxy> = {};

export async function openTcp(
  _win: BrowserWindow,
  request: ipc.IOpenTcpRequest,
  reply: <T extends ipc.TResponse | ipc.TNotification>(response: T) => void
): Promise<void> {
  const proxy = TcpProxy.create(request.proxyIp, request.tcp);

  if (proxy) {
    proxies[request.tcpId] = proxy;

    proxy.onClient = (connected) =>
      reply<ipc.IConnectNotification>({
        id: request.tcpId,
        connected,
        type: "notify-connect",
      });

    proxy.onOpen = (opened) =>
      reply<ipc.ITcpOpenNotification>({
        id: request.tcpId,
        opened,
        type: "notify-tcp-open",
      });

    proxy.onData = (received, sent) =>
      reply<ipc.IDataNotification>({
        id: request.tcpId,
        received,
        sent,
        type: "notify-data",
      });
  }
}

export async function closeTcp(
  _win: BrowserWindow,
  request: ipc.ICloseTcpRequest
): Promise<void> {
  const proxy = proxies[request.tcpId];

  if (!proxy) return;

  delete proxies[request.tcpId];

  proxy.shutdown();
}
