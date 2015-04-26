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

const allowed = (opts, tags) => {
  if (!opts.ranks) return true
  let type = tags.user_type || tags['user-type']
  return opts.ranks.indexOf(type) !== -1
      || opts.ranks.indexOf('subscriber') !== -1 && tags.subscriber == '1'
      || false
}

export default function () {

  return function command(bot) {
    bot._commands = {}
    bot.command = (command, opts, action) => {
      if (!action) {
        [ opts, action ] = [ {}, opts ]
      }
      let cb = message => {
        if (message.command !== 'PRIVMSG') return
        if (message.trailing.startsWith(command)) {
          let params = message.trailing.slice(command.length).trim()
          let tags = message.message.tags
          if (!allowed(opts, tags)) return

          message.message.user = tags['display-name'] || message.message.prefix.user
          action(message.message, ...parse(params))
        }
      }
      bot._commands[command] = cb
      bot.on('data', cb)
    }
    bot.removeCommand = command => {
      if (command in bot._commands) {
        bot.off('data', bot._commands[command])
        delete bot._commands[command]
      }
    }
  }

}