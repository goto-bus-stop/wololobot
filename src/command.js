const debounce = require('debounce')

const debug = require('debug')('wololobot:command')

const appendArg = (args, arg, opt = {}) => {
  if (arg.trim() === '' && !opt.quoted) return
  if (/^\d+$/.test(arg)) arg = parseInt(arg, 10)
  args.push(arg)
}

const parse = (str) => {
  const args = []
  let i = 0
  let next
  while (i < str.length) {
    if (str[i] === ' ') {
      next = i + 1
    } else if (str[i] === '"') {
      next = str.indexOf('"', i + 1)
      if (next < 0) next = str.length
      appendArg(args, str.substring(i + 1, next), { quoted: true })
      // skip trailing quote
      next += 1
    } else {
      next = str.indexOf(' ', i + 1)
      if (next < 0) next = str.length
      appendArg(args, str.substring(i, next))
    }
    i = next
  }
  return args
}

const userLevels = {
  broadcaster: 3,
  mod: 2,
  subscriber: 1,
  viewer: 0
}

module.exports = function () {
  return function command (bot) {
    bot._commands = {}
    bot.command = (command, opts, action) => {
      if (!action) {
        [ opts, action ] = [ {}, opts ]
      }
      let execute = async (message) => {
        const params = message.trailing.slice(command.length).trim()
        message.user = typeof message.tags['display-name'] === 'string'
          ? message.tags['display-name']
          : message.parsedPrefix.user
        try {
          await action(message, ...parse(params))
        } catch (err) {
          bot.send(`@${message.user} ${err.message}`)
        }
      }

      if (opts.throttle) {
        execute = debounce(execute, opts.throttle, true)
      }

      const re = new RegExp(`^${command}\\b`, 'i')

      const cb = (message) => {
        if (message.command !== 'PRIVMSG') return
        if (re.test(message.trailing)) {
          if (opts.rank) {
            const { tags, parsedPrefix } = message
            let userType = tags.user_type || tags['user-type']
            if (parsedPrefix.user === bot.channel.slice(1)) {
              userType = 'broadcaster'
            }
            userType = typeof userType === 'string'
                     ? userType
                     : (tags.subscriber ? 'subscriber' : 'viewer')
            if (!(userLevels[userType] >= userLevels[opts.rank])) {
              debug('deny', parsedPrefix.user, userType, command, opts.rank)
              return
            }
            debug('allow', parsedPrefix.user, userType, command, opts.rank)
          }
          execute(message)
        }
      }
      bot._commands[command] = cb
      bot.on('data', cb)
    }

    bot.removeCommand = (command) => {
      if (command in bot._commands) {
        bot.off('data', bot._commands[command])
        delete bot._commands[command]
      }
    }
  }
}
