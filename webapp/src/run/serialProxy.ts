import { Proxy } from "./proxy";

import { ISerialConfiguration } from "ipc";
import { IConfiguration } from "../settings";

/** Klasse zum Aufbau einer TCP/IP Verbindung zu einer seriellen Leitung. */
export class SerialProxy extends Proxy {
  /** Die serielle Leitung. */
  private _port?: SerialPort;

  /** Datenstrom zur seriellen Leitung. */
  private _writer?: WritableStreamDefaultWriter;

  /** Datenstrom von der seriellen Leitung. */
  private _reader?: ReadableStreamDefaultReader<Buffer>;

  /** Meldet den erfolgreichen Aufbau zur seriellen Leitung. */
  onOpen?(): void;

  /**
   * Initialisiert eine neue Verbindung.
   *
   * @param server Rechnername für den TCP/IP Server.
   * @param port TCP/IP Port.
   * @param device Name der seriellen Leitung.
   */
  private constructor(
    server: string,
    port: number,
    public readonly device: string
  ) {
    /** TCP/IP Server konfigurieren - die seriellen Leitung wird separat verbunden. */
    super(server, port);
  }

  /** Daten des TCP/IP Clients an die serielle Leitung senden. */
  protected write(data: Buffer): void {
    this._writer?.write(data).catch((e) => console.error(e.message));
  }

  /**
   * Öffnet die Verbindung zur seriellen Leitung.
   *
   * @param port Die serielle Verbindung.
   */
  open(port: SerialPort): void {
    this._port = port;

    /** Physikalische Verbindung zur seriellen Leitung herstellen. */
    port
      .open({ baudRate: 9600, dataBits: 8, parity: "none", stopBits: 2 })
      .then(() => {
        /* Datenströme abrufen. */
        this._reader = port.readable?.getReader();
        this._writer = port.writable?.getWriter();

        /* Lesevorgang starten. */
        this.fromPort();

        /* Erfolgreiches Öffnen der Verbindung melden. */
        this.onOpen?.();
      })
      .catch((e) => console.error(e.message));
  }

  /** Daten von der seriellen Leitung entgegen nehmen. */
  private async fromPort(): Promise<void> {
    for (;;)
      try {
        /** Nächsten Datenblock einlesen und prüfen. */
        const data = await this._reader?.read();

        if (data?.done !== false) break;

        const buf = data.value;

        if (!buf?.length) break;

        /** Daten an den möglicherweise verbundenen TCP/IP Client durchreichen. */
        this.toClient(buf);
      } catch (e) {
        /** Bei der Fehlerbehandlung ist noch reichlich Luft nach oben. */
        console.error(e.message);

        break;
      }
  }

  /** Nutzung der seriellen Verbindung beenden. */
  shutdown(): void {
    try {
      this._reader?.releaseLock();
    } catch (e) {
      console.error(e.message);
    }

    try {
      this._writer?.releaseLock();
    } catch (e) {
      console.error(e.message);
    }

    try {
      this._port?.close();
    } catch (e) {
      console.error(e.message);
    }

    /** TCP/IP Server beenden. */
    super.shutdown();
  }

  /**
   * Erstellt eine neue Verbindung zu einer seriellen Leitung her.
   *
   * @param config Gesamtkonfiguration.
   * @param serial Konfiguration des Ports.
   * @returns Verbindung, sofern eine solche laut Konfiguration erwünscht ist.
   */
  static create(
    config: IConfiguration,
    serial: ISerialConfiguration
  ): SerialProxy | undefined {
    if (
      !serial.device ||
      serial.port == null ||
      serial.port < 1024 ||
      serial.port > 65535
    )
      return;

    return new SerialProxy(config.proxyIp, serial.port, serial.device);
  }
}
