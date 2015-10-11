import irc from 'slate-irc'
import { createStream as ircparser } from 'irc-message'
import { connect } from 'net'

export default function whispers(opts) {

  opts.host = opts.groupChannelHost
  opts.port = opts.groupChannelPort

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

  let whisperIRC = irc(stream, parser)
  whisperIRC.pass(opts.password)
  whisperIRC.nick(opts.username)
  whisperIRC.user(opts.username, opts.username)
  whisperIRC.write('CAP REQ :twitch.tv/commands twitch.tv/tags')

  return function(bot) {
    whisperIRC.on('data', (message) => {
      if (message.command !== 'WHISPER') return
      bot.emit('whisper', message)
    })

    bot.whisper = (user, message) => {
      whisperIRC.write(`PRIVMSG #jtv :/w ${user} ${message}`)
    }
  }

}
