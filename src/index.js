import config from '../config.json'
import { client as Client } from 'twitch-irc'

const debug = require('debug')('wololobot:main')

const appendArg = (args, arg, opt = {}) => {
  if (arg.trim() === '' && !opt.quoted) return
  if (/^\d+$/.test(arg)) arg = parseInt(arg, 10)
  args.push(arg)
}
const parse = str => {
  let args = [], i = 0, next
  while (i < str.length) {
    if (str[i] === ' ') {
      next = i + 1
    }
    else if (str[i] === '"') {
      next = str.indexOf('"', i + 1)
      if (next < 0) next = str.length
      appendArg(args, str.substring(i + 1, next), { quoted: true })
      // skip trailing quote
      next += 1
    }
    else {
      next = str.indexOf(' ', i + 1)
      if (next < 0) next = str.length
      appendArg(args, str.substring(i, next))
    }
    i = next
  }
  return args
}

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

  registerCommand(name, parameters, action) {
    this._commands.set(name, { parameters, action })
  }

  onMessage(time, user, message) {
    for (let [ command, action ] of this._commands) {
      if (message.startsWith(command)) {
        debug('command', command, user, message)
        action.action(user, ...parse(message).slice(1))
      }
    }
  }

}