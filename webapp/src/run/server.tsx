import { clsx } from 'clsx'
import * as React from 'react'

import { Serial } from './serial'
import styles from './server.module.scss'
import { Tcp } from './tcp'

import { SettingsContext } from '../settings'

interface IServerProps {
    className?: string
    onClose(): void
}

export const Server: React.FC<IServerProps> = (props) => {
    const [settings] = React.useContext(SettingsContext)

    const { onClose } = props

    return (
        <div className={clsx(styles.server, props.className)}>
            <div>
                <h1>TCP/IP Server gestartet</h1>
                <Serial />
                {settings.proxies.map((p, i) => (
                    <Tcp key={i} index={i} />
                ))}
                <button onClick={onClose}>Stop</button>
            </div>
        </div>
    )
}
