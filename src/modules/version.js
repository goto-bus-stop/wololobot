import pack from '../../package.json'

export default function () {

  return function (bot) {
    bot.command('!version', () => {
      bot.send(`${pack.name} v${pack.version}`)
    })
  }

}