const ms = require('ms')
const irc = require('slate-irc')
const { createStream: ircparser } = require('irc-message')
const { connect } = require('net')
const debounce = require('debounce')
const command = require('./command')
const twitch = require('slate-irc-twitch')
const defaultChannel = require('./default-channel')
const twitchUsers = require('./twitch-users')
const twitchLiveStatus = require('./twitch-live-status')
const twitchSubs = require('./twitch-subs')

module.exports = function wololobot (opts) {
  const stream = opts.stream || connect(opts)
  const parser = ircparser({ parsePrefix: true })
  parser.on('data', msg => {
    const len = msg.params.length
    parser.emit('message', {
      prefix: msg.prefix && msg.prefix.raw,
      parsedPrefix: msg.prefix,
      command: msg.command,
      params: msg.params.slice(0, len - 1).join(' '),
      trailing: msg.params[len - 1],
      string: msg.raw,
      tags: msg.tags
    })
  })

  const channel = opts.channel.startsWith('#') ? opts.channel : `#${opts.channel}`

  const bot = irc(stream, parser)
  bot.use(command())
  bot.use(twitchUsers({ channels: [ channel.slice(1) ] }))
  bot.use(twitch({ init: true, tags: true }))
  bot.use(twitchLiveStatus({ channel: channel.slice(1) }))
  bot.use(twitchSubs({ channel: channel.slice(1), token: '' }))

  bot.channel = channel

  bot.use(defaultChannel(channel, [
    'action', 'send', 'names', 'users',
    'ban', 'unban', 'clear', 'color', 'commercial', 'host',
    'unhost', 'mod', 'unmod', 'mods', 'r9kbeta', 'r9kbetaoff',
    'slow', 'slowoff', 'subscribers', 'subscribersoff', 'timeout'
  ]))
  bot.pass(opts.password)
  bot.nick(opts.username)
  bot.user(opts.username, opts.username)
  bot.join(channel)

  bot.on('motd', () => {
    bot.mods(channel)
  })
  bot.on('mode', debounce(() => {
    bot.mods(channel)
  }, ms('1 second')))

  return bot
}
