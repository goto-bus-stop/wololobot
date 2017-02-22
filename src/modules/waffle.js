const randomInt = (max) => Math.round(Math.random() * max)

const pickRandom = (arr, amount) => {
  let str = ''
  for (let i = 0; i < amount; i++) {
    let pickIndex = randomInt(arr.length - 1)
    let pick = arr[pickIndex]
    switch(i) {
      case 0:
        str = pick
        break
      case amount - 1:
        str += ' and ' + pick
        break
      default:
        str += ', ' + pick
    }
    arr.splice(pickIndex, 1)
  }
  return str
}
module.exports = function(before = new Set(), after = new Set()) {
  ['classic', 'chocolate', 'Brussels', 'Flemish', 'Belgian', 'bacon'].forEach(item => before.add(item))
  ;['Nutella', 'strawberries', 'raspberries', 'cream', 'cherries', 'apples', 'peaches', 'maple syrup', 'icing', 'sugar', 'chocolate sauce'].forEach(item => after.add(item))
  return function(bot) {
    bot.command('!waffle', message => {
      let before_ = Array.from(before.values())
      let after_ = Array.from(after.values())
      let waffles = pickRandom(before_, 1)
      waffles += ' waffles'
      let numAfter = randomInt(3)
      if (numAfter > 0) {
        waffles += ` with ${pickRandom(after_, numAfter)}`
      }
      bot.send(`Have some tasty ${waffles}, ${message.user}!`)
    })
  }
}
