import config from '../config.json'
import { client as Client } from 'twitch-irc'

const debug = require('debug')('wololobot:main')

export default class WololoBot extends Client {

  constructor(opts) {
    super(opts)
    this._commands = new Map()
    this._channel = opts.channel

    this.on('chat', this.onMessage.bind(this))
    this.once('connected', () => this.join(this._channel))

    // Add default channel parameter to existing methods
    ;[ 'action', 'ban', 'clear', 'color', 'commercial', 'host', 'mod', 'mods', 'say', 'slow'
    , 'slowoff', 'subscribers', 'subscribersoff', 'timeout', 'unban', 'unhost', 'unmod', 'isMod'
    ].forEach(method => {
      let orig = this[method]
      this[method] = (...args) => {
        return args.length === orig.length? orig.apply(this, args)
             : /* default channel */        orig.call(this, this._channel, ...args)
      }
    })
  }

  registerCommand(name, action) {
    this._commands.set(name, action)
  }

  onMessage(time, user, message) {
    for (let [ command, action ] of this._commands) {
      if (message.startsWith(command)) {
        debug('command', command, user, message)
        action(user, message)
      }
    }
  }

}