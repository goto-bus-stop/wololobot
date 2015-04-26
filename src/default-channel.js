// plugin to default the channel for several commands to a given channel
export default function (channel, commands = [ 'action', 'send', 'names' ]) {

  return function (bot) {
    commands.forEach(method => {
      let orig = bot[method]
      bot[method] = (first = '', ...args) => {
        return first.charAt(0) === '#'? orig.call(bot, first, ...args)
             : /* default channel */    orig.call(bot, channel, first, ...args)
      }
    })
  }

}