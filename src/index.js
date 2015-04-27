import config from '../config.json'
import { client as Client } from 'twitch-irc'
import knex from 'knex'
import irc from 'slate-irc'
import { createStream as ircparser } from 'irc-message'
import { connect } from 'net'
import command from './command'
import twitch from 'slate-irc-twitch'
import defaultChannel from './default-channel'

import 'babel/polyfill'

const debug = require('debug')('wololobot:main')

export default function wololobot(opts) {
  let connection = connect(opts)
  let parser = ircparser({ parsePrefix: true })
  parser.on('data', msg => {
    let len = msg.params.length
    parser.emit('message', {
      prefix: msg.prefix && msg.prefix.raw
    , command: msg.command
    , params: msg.params.slice(0, len - 1).join(' ')
    , trailing: msg.params[len - 1]
    , string: msg.raw
    , message: msg
    })
  })
  let bot = irc(connection, parser)
  bot.use(command())
  bot.use(twitch({ tags: true }))

  let channel = opts.channel.startsWith('#')? opts.channel
              : /* otherwise */               `#${opts.channel}`

  bot.channel = channel

  bot.on('motd', () => {
    bot.twitchinit()
  })

  bot.use(defaultChannel(channel, [ 'action', 'send', 'names'
                                  , 'ban', 'unban', 'clear', 'color', 'commercial', 'host'
                                  , 'unhost', 'mod', 'unmod', 'mods', 'r9kbeta', 'r9kbetaoff'
                                  , 'slow', 'slowoff', 'subscribers', 'subscribersoff', 'timeout' ]))
  bot.pass(config.password)
  bot.nick(config.username)
  bot.user(config.username, config.username)
  bot.join(channel)

  bot.mods()

  return bot
}
