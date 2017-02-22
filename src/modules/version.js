const pack = require('../../package.json')

module.exports = function () {
  return function (bot) {
    bot.command('!version', () => {
      bot.send(`${pack.name} v${pack.version}`)
    })
  }
}
