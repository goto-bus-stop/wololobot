const debug = require('debug')('wololobot:mute')

module.exports = function (opts) {
  const name = opts.username

  return function mute (bot) {
    const send = bot.send

    bot.command(`!mute ${name}`, { rank: 'mod' }, () => {
      bot.send = (message) => debug(`Tried to send "${message}", but was muted`)
      debug('Muted')
    })

    bot.command(`!unmute ${name}`, { rank: 'mod' }, () => {
      bot.send = send
      debug('Unmuted')
    })
  }
}
