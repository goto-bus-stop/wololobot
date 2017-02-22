const random = require('random-int')
const randomItem = require('random-item')
const join = require('join-component')

module.exports = () => {
  const before = [
    'classic',
    'chocolate',
    'Brussels',
    'Flemish',
    'Belgian',
    'bacon'
  ]
  const after = [
    'Nutella',
    'strawberries',
    'raspberries',
    'cream',
    'cherries',
    'apples',
    'peaches',
    'maple syrup',
    'icing',
    'sugar',
    'chocolate sauce'
  ]

  return (bot) => {
    bot.command('!waffle', (message) => {
      let waffles = `${randomItem(before)} waffles`
      const numAfter = random(3)
      if (numAfter > 0) {
        const list = []
        for (let i = 0; i < numAfter; i++) {
          list.push(randomItem(after))
        }
        waffles += ` with ${join(list)}`
      }
      bot.send(`Have some tasty ${waffles}, ${message.user}!`)
    })
  }
}
