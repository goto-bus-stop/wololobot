import Promise from 'bluebird'
const debug = require('debug')('wololobot:raffle')

const openUsage = '!raffle open [price] [max tickets] [?winners]'

const check = n => n != null && !isNaN(parseInt(n, 10))

export default function (opts) {

  function raffle(bot, price, maxTickets, winnersNeeded) {
    let _entries = {}

    function enter(user, tickets) {
      if (isNaN(tickets))
        return Promise.reject(new Error('Invalid number of tickets.'))
      if (tickets > maxTickets)
        return Promise.reject(new Error(`Cannot enter with more than ${maxTickets} tickets.`))
      if (tickets < 0)
        return Promise.reject(new Error('Cannot enter with a negative amount of tickets.'))

      let luser = user.toLowerCase()
      if (tickets === 0) {
        delete _entries[luser]
        return Promise.resolve({ user, tickets: 0 })
      }

      return bot.florinsOf(user).then(florins => {
        if (florins > tickets * price)
          return Promise.reject(new Error('You don\'t have that many florins.'))

        _entries[luser] = { user, tickets }
        return _entries[luser]
      })
    }
    function entries() {
      return Object.keys(_entries).map(u => _entries[u])
    }
    function tickets(user) {
      return _entries[user.toLowerCase()].tickets
    }
    function totalTickets() {
      return Object.keys(_entries).reduce((total, user) => total + _entries[user].tickets, 0)
    }
    function end() {
      // find winners
      let availableTickets = totalTickets()
        , availableEntries = entries()
        , winners = []
      if (availableEntries < winnersNeeded || totalTickets === 0) {
        return Promise.reject(new Error('Not enough entries to pick a winner!'))
      }
      while (winners.length < winnersNeeded) {
        // pick winning ticket
        let winningTicket = Math.floor(availableTickets * Math.random())
        let currentTicket = 0
        // find & remove winner
        for (let i = 0, l = availableEntries.length; i < l; i++) {
          currentTicket += availableEntries[i].tickets
          if (currentTicket >= winningTicket) {
            availableTickets -= availableEntries[i].tickets
            debug('winner', winningTicket)
            winners.push(availableEntries[i])
            availableEntries.splice(i, 1)
            break
          }
        }
      }
      debug('winners', winners)

      return bot.transactions(
        entries().map(entry => ({ username: entry.user
                                , amount: -(entry.tickets * price)
                                , description: `${entry.tickets} raffle tickets` }))
      ).return(winners)
    }
    function stop() {
      _entries = {}
    }

    return { enter, end, stop, tickets, totalTickets }
  }

  return function (bot) {
    bot.command('!raffle'
               , { rank: 'mod' }
               , (message, command) => {
      if (command === 'open' || command === 'close' || command === 'stop') return
      const mname = message.user
      bot.send(`@${mname} !raffle Usage:`)
      bot.send(`${openUsage} - Opens a raffle.`)
      bot.send(`!raffle close - Closes a raffle and picks a winner.`)
      bot.send(`!raffle stop - Stops a raffle and refunds florins.`)
    })
    bot.command('!raffle open'
               , { rank: 'mod' }
               , (message, price, maxTickets, winners = 1) => {
      const mname = message.user
      if (!bot.florinsOf)
        return bot.send(`@${mname} The raffle depends on the florins module, ` +
                        `but it doesn't appear to be available.`)
      if (bot.raffle)
        return bot.send(`@${mname} Another raffle is already open.`)
      if (!check(price))
        return bot.send(`@${mname} Given ticket price is not valid. (${openUsage})`)
      if (!check(maxTickets))
        return bot.send(`@${mname} Given maximum number of tickets is not valid. (${openUsage})`)
      if (!check(winners))
        return bot.send(`@${mname} Given number of winners is not valid. (${openUsage})`)

      bot.raffle = raffle(bot, price, maxTickets, winners)
      bot.send(`Raffle opened! Tickets cost ${price} florins, ` +
               `and you can buy a maximum of ${maxTickets} tickets.`)
      let example = `!ticket ${Math.floor(Math.random() * maxTickets + 1)}`
      setTimeout(() => { bot.send(`Use "!ticket [number of tickets]" ` +
                                  `(e.g. "${example}") to participate!`) }, 100)
      setTimeout(() => { bot.send(`Use "!ticket clear" to cancel your participation.`) }, 200)
    })
    bot.command('!raffle close'
               , { rank: 'mod' }
               , (message) => {
      const mname = message.user
      if (!bot.raffle)
        return bot.send(`@${mname} No raffle is currently open.`)
      bot.send(`Raffle closed! A total of ${bot.raffle.totalTickets()} tickets were purchased.`)
      bot.raffle.end()
        .then(winners => {
          bot.send(winners.length === 1? 'And the winner is…'
                  : /* otherwise */      'And the winners are…')
          setTimeout(() => {
            winners.forEach(entry => {
              bot.send(`@${entry.user}! (Bought ${entry.tickets} tickets)`)
            })
          }, 4000)
        })
      delete bot.raffle
    })
    bot.command('!raffle stop'
               , { rank: 'mod' }
               , (message) => {
      bot.send(`Raffle stopped and florins refunded.`)
      bot.raffle.stop()
      delete bot.raffle
    })
    const ticket = (message, tickets) => {
      const uname = message.user
      tickets = tickets === 'clear'? 0
              : /* otherwise */      parseInt(tickets, 10)
      if (!bot.raffle) return bot.send(`@${uname} No raffle is open right now.`)
      bot.raffle.enter(uname, tickets)
        .catch(e => bot.send(`@${uname} ${e.message}`))
    }
    bot.command('!ticket', ticket)
    bot.command('!tickets', ticket)
  }

}