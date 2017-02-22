const ms = require('ms')
const delay = require('delay')
const debug = require('debug')('wololobot:raffle')

const openUsage = '!raffle open [price] [max tickets] [?winners]'

const sum = (a, b) => a + b
const check = (n) => n != null && !isNaN(parseInt(n, 10))

module.exports = function (opts) {
  function raffle (bot, price, maxTickets, winnersNeeded) {
    let _entries = {}

    async function enter (user, tickets) {
      if (isNaN(tickets) || tickets < 0) {
        throw new Error('Invalid number of tickets.')
      }
      if (tickets > maxTickets) {
        throw new Error(`Cannot enter with more than ${maxTickets} tickets.`)
      }

      await bot.florins.unreserve(user, 'raffle')

      let luser = user.toLowerCase()
      if (tickets === 0) {
        delete _entries[luser]
        return { user, tickets: 0 }
      }

      await bot.florins.reserve(user, 'raffle', tickets * price)

      _entries[luser] = { user, tickets }
      return _entries[luser]
    }

    function entries () {
      return Object.keys(_entries).map((user) => _entries[user])
    }

    function tickets (user) {
      return (_entries[user.toLowerCase()] || {}).tickets
    }

    function entryValue (user) {
      const t = tickets(user)
      return t ? price * t : 0
    }

    function totalTickets () {
      return entries().map((entry) => entry.tickets).reduce(sum)
    }

    async function end () {
      // find winners
      let availableTickets = totalTickets()
      let availableEntries = entries()
      let winners = []
      if (availableEntries < winnersNeeded || totalTickets === 0) {
        throw new Error('Not enough entries to pick a winner!')
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

      await bot.florins.transactions(
        entries().map((entry) => ({
          username: entry.user,
          amount: -(entry.tickets * price),
          description: `${entry.tickets} raffle tickets`
        }))
      )

      await bot.florins.clearReservations('raffle')

      return winners
    }

    async function stop () {
      _entries = {}

      await bot.florins.clearReservations('raffle')
    }

    return { enter, end, stop, tickets, totalTickets, entryValue }
  }

  return function (bot) {
    bot.command('!raffle', { rank: 'mod' }, (message, command) => {
      if (['open', 'close', 'stop'].includes(command)) {
        return
      }

      const mname = message.user
      bot.send(`@${mname} !raffle Usage:`)
      bot.send(`${openUsage} - Opens a raffle.`)
      bot.send('!raffle close - Closes a raffle and picks a winner.')
      bot.send('!raffle stop - Stops a raffle and refunds florins.')
    })

    bot.command('!raffle open', { rank: 'mod' }, async (message, price, maxTickets, winners = 1) => {
      if (!bot.florins) {
        throw new Error(
          'The raffle depends on the florins module, but it doesn\'t appear to be available.')
      }
      if (bot.raffle) {
        throw new Error('Another raffle is already open.')
      }
      if (!check(price) || price < 0) {
        throw new Error(`Given ticket price is not valid. (${openUsage})`)
      }
      if (!check(maxTickets) || maxTickets < 0) {
        throw new Error(`Given maximum number of tickets is not valid. (${openUsage})`)
      }
      if (!check(winners) || winners < 0) {
        throw new Error(`Given number of winners is not valid. (${openUsage})`)
      }

      bot.raffle = raffle(bot, price, maxTickets, winners)
      bot.send(
        `Raffle opened! Tickets cost ${price} florins, ` +
        `and you can buy a maximum of ${maxTickets} tickets.`
      )
      const example = `!ticket ${Math.floor((Math.random() * maxTickets) + 1)}`
      await delay(100)
      bot.send(`Use "!ticket [number of tickets]" (e.g. "${example}") to participate!`)
      await delay(100)
      bot.send('Use "!ticket clear" to cancel your participation.')
    })

    bot.command('!raffle close', { rank: 'mod' }, async (message) => {
      if (!bot.raffle) {
        throw new Error('No raffle is currently open.')
      }

      bot.send(`Raffle closed! A total of ${bot.raffle.totalTickets()} tickets were purchased.`)

      const winners = await bot.raffle.end()
      bot.send(winners.length === 1
        ? 'And the winner is…'
        : 'And the winners are…'
      )

      await delay(ms('4 seconds'))
      winners.forEach((entry) => {
        bot.send(`@${entry.user}! (Bought ${entry.tickets} tickets)`)
      })

      bot.raffle = null
    })

    bot.command('!raffle stop', { rank: 'mod' }, async (message) => {
      await bot.raffle.stop()
      bot.send(`Raffle stopped and florins refunded.`)
      bot.raffle = null
    })

    const ticket = async (message, tickets) => {
      const uname = message.user
      tickets = tickets === 'clear' ? 0 : parseInt(tickets, 10)
      if (!bot.raffle) {
        throw new Error('No raffle is open right now.')
      }

      await bot.raffle.enter(uname, tickets)
    }

    bot.command('!ticket', ticket)
    bot.command('!tickets', ticket)
  }
}
