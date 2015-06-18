import knex from 'knex'
import irc from 'slate-irc'
import { createStream as ircparser } from 'irc-message'
import { connect } from 'net'
import command from './command'
import twitch from 'slate-irc-twitch'
import defaultChannel from './default-channel'
import twitchUsers from './users'
import twitchLiveStatus from './twitch-live-status'
import twitchSubs from './twitch-subs'

import 'babel/polyfill'

const debug = require('debug')('wololobot:main')

export default function wololobot(opts) {
  let stream = opts.stream || connect(opts)
  let parser = ircparser({ parsePrefix: true })
  parser.on('data', msg => {
    let len = msg.params.length
    parser.emit('message', {
      prefix: msg.prefix && msg.prefix.raw
    , parsedPrefix: msg.prefix
    , command: msg.command
    , params: msg.params.slice(0, len - 1).join(' ')
    , trailing: msg.params[len - 1]
    , string: msg.raw
    , tags: msg.tags
    })
  })

  let channel = opts.channel.startsWith('#')? opts.channel
              : /* otherwise */               `#${opts.channel}`

  let bot = irc(stream, parser)
  bot.use(command())
  bot.use(twitchUsers({ channels: [ channel.slice(1) ] }))
  bot.use(twitch({ init: true, tags: true }))
  bot.use(twitchLiveStatus({ channel: channel.slice(1) }))
  bot.use(twitchSubs({ channel: channel.slice(1)
                     , token: '' }))

  bot.channel = channel

  bot.use(defaultChannel(channel, [ 'action', 'send', 'names', 'users'
                                  , 'ban', 'unban', 'clear', 'color', 'commercial', 'host'
                                  , 'unhost', 'mod', 'unmod', 'mods', 'r9kbeta', 'r9kbetaoff'
                                  , 'slow', 'slowoff', 'subscribers', 'subscribersoff', 'timeout' ]))
  bot.pass(opts.password)
  bot.nick(opts.username)
  bot.user(opts.username, opts.username)
  bot.join(channel)

  bot.mods()

  return bot
}
