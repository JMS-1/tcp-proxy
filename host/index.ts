import { app, BrowserWindow, ipcMain } from 'electron'
import { ISerialPortsResponse, TRequestType, TResponse, TTypedRequest } from 'ipc'
import { join } from 'path'

import { listeners, THandler } from './appListeners'
import { portName } from './serialPort'
import { portNames } from './serialPorts'
import { createWindow, isProduction } from './window'

console.info(`electron ${process.versions.electron} (node.js ${process.version})`)

/** Das ist das Fenster für die Anwendung. */
let appWindow: BrowserWindow | null

/** Erstellt das Fenster für die Anwendung und startet diese darin. */
function startup(): void {
    /** Das darf natürlich nur ein einziges Mal gemacht werden. */
    if (appWindow) {
        return
    }

    /** Fenster erstellen. */
    const window = createWindow()

    appWindow = window

    appWindow.on('closed', () => {
        appWindow = null
    })

    /** So könnte man sich eine dynamische Verteilung von Nachrichten aus der Anwendung in den Host vorstellen. */
    const sendToApp = (response: TResponse): void => window.webContents.send('hostToApp', response)

    ipcMain.on('appToHost', async <T extends TRequestType>(_ev: unknown, request: TTypedRequest<T>) => {
        /** Sichere Behandlung von Fehlern. */
        try {
            /** Mögliche Bearbeitungsmethode ermitteln und ausführen - bei Bedarf auch asynchron. */
            const handler = listeners[request.type] as THandler<T>

            await handler?.(window, request, sendToApp)
        } catch (error) {
            console.error(error.message)
        }
    })

    /** Zugriff auf serielle Gerärte. */
    window.webContents.session.on('select-serial-port', (event, portList, _webContents, callback) => {
        event.preventDefault()

        portNames.splice(
            0,
            portNames.length,
            ...portList
                .map((p) => p.portName)
                .filter((n) => n.startsWith('tty') || n.startsWith('COM'))
                .sort()
        )

        sendToApp({ portNames, type: 'serial-response' } satisfies ISerialPortsResponse)

        callback(portList?.find((p) => p.portName === portName)?.portId || '')
    })

    window.webContents.session.setPermissionCheckHandler(() => true)

    window.webContents.session.setDevicePermissionHandler(() => true)

    /** In Produktion wird die in dem Electron Paket gebundelte Anwendung aufgerufen. */
    if (isProduction) {
        window.loadFile(join(__dirname, '../build/dist/index.html'))
    } else {
        /** Ansonsten der webpack-dev-server, so dass ein simultanes Debugging von Host und Anwendung möglich wird. */
        window.webContents.on('before-input-event', (_ev, inp) => {
            if (inp.key === 'F12' && !inp.control) {
                window.webContents.openDevTools({ mode: 'detach' })
            }
        })

        window.loadURL('http://localhost:3000')
    }
}

app.commandLine.appendSwitch('ignore-certificate-errors')

/** Während der Entwicklung setzen wir auf eine lokal verwaltete Electron Konfiguration - die bei Bedarf leicht gelöscht werden kann. */
if (!isProduction) {
    app.setPath('userData', join(app.getAppPath(), '../.vscode/electron'))
}

/** Anwendungsfenster starten sobald der Host bereit ist. */
app.on('ready', startup)

/** Vorsichtshalber beim Aktivieren prüfen, ob das Anwendungsfenster erzeugt werden soll. */
app.on('activate', startup)

/** Host terminieren wenn das letzte (hier einzige) Anwendungsfenster geschlossen wird. */
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
