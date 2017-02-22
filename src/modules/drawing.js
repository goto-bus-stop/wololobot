const debug = require('debug')('wololobot:drawing')

const removeFromArr = (arr, el) => {
  let i
  while ((i = arr.indexOf(el)) !== -1) {
    arr.splice(i, 1)
  }
  return arr
}

module.exports = function (opts) {
  opts = Object.assign({
    subChances: 2,     // Number of tickets for subs
    normalChances: 1  // Number of tickets for non-subs
  }, opts)

  let entrants = []
  let winners = []
  let nEntrants = 0
  let open = false

  function pickRandom () {
    debug(`Picking a random entrant out of ${entrants}`)
    let rand = entrants[Math.floor(Math.random() * entrants.length)]
    winners.push(rand)
    entrants = removeFromArr(entrants, rand)
  }

  function winnersStr () {
    if (winners.length === 0) {
      return 'There are no winners!'
    } else if (winners.length === 1) {
      return `The winner is ${winners[0]}`
    }
    return `The winners are: ${winners.join(', ')}`
  }

  return function drawing (bot) {
    bot.command('!play', (message) => {
      if (!open) {
        return
      }
      message.user = message.user.toLowerCase()
      if (entrants.indexOf(message.user) !== -1) {
        return
      }
      nEntrants++
      const weight = message.tags.subscriber === '1'
        ? opts.subChances
        : opts.normalChances
      for (let i = 0; i < weight; i++) {
        entrants.push(message.user)
      }
    })

    bot.command('!draw open', { rank: 'mod' }, (message) => {
      entrants = []
      open = true
      nEntrants = 0

      bot.send(
        'New drawing opened! To enter, type !play. Subscribers have ' +
        `${opts.subChances / opts.normalChances}x higher chances to ` +
        'win. Type !draw close <number of players> to end the drawing.'
      )
    })

    bot.command('!draw close', { rank: 'mod' }, (message, number) => {
      open = false
      number = parseInt(number)
      if (isNaN(number)) {
        bot.send(`@${message.user} Usage: !draw close <number of players>`)
        return
      }
      if (number > nEntrants) {
        bot.send(`@${message.user} Only ${nEntrants} people entered the drawing. Do !draw close` +
      `again with a number up to ${nEntrants}.`)
        return
      }
      winners = []
      for (let i = number; i > 0; i--) {
        pickRandom()
      }
      bot.send(winnersStr())
    })

    bot.command('!draw reroll', { rank: 'mod' }, (message, user) => {
      if (user === void 0) {
        bot.send(`@${message.user} Usage: !draw reroll <user>`)
        return
      }
      user = user.toLowerCase()
      let i = winners.indexOf(user)
      if (i === -1) {
        bot.send(`'${user}' didn't win the drawing!`)
        return
      }
      if (entrants.length === 0) {
        bot.send('There are no entrants remaining! Open another drawing with !draw open')
        return
      }
      winners.splice(i, 1)
      pickRandom()
      bot.send(`${user} has been replaced with ${winners[winners.length - 1]}`)
    })

    bot.command('!winners', (message) => {
      bot.send(winnersStr())
    })
  }
}
