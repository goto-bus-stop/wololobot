const ms = require('ms')
const delay = require('delay')
const debug = require('debug')('wololobot:bets')

const sum = (a, b) => a + b

const parse = (str) => {
             // "a) option1 b) option2"
  const rx = /([a-z]+)\)(.*?)(?:\s[a-z]+\)|$)/g
  const options = {}
  let match
  while ((match = rx.exec(str))) {
    rx.lastIndex -= match[1].length + 2
    options[ match[1].toLowerCase() ] = match[2].trim()
  }
  return options
}

module.exports = function bets (opts) {
  const { db } = opts

  function betManager (bot, betId) {
    function getBetEntries () {
      return db('betEntries')
        .where('betId', '=', betId)
        .leftJoin('betOptions', 'betEntries.optionId', 'betOptions.id')
        .select(
          'betEntries.user as user',
          'betEntries.amount as amount',
          'betEntries.optionId as optionId',
          'betOptions.name as option'
        )
    }

    async function valid (option) {
      return !!(await getBetOption(option))
    }

    async function getStatus () {
      const bet = await db('bets')
        .select('status')
        .where('id', '=', betId)
        .first()
      return bet.status
    }

    async function close () {
      debug('close', await pool())

      await db('bets')
        .where('id', '=', betId)
        .update({ status: 'closed' })
    }

    async function closed () {
      return await getStatus() === 'closed'
    }

    function getBetOption (name) {
      return db('betOptions')
        .where('betId', '=', betId)
        .where('name', '=', String(name).toLowerCase())
        .first()
    }

    async function enter (user, optionName, florins) {
      const status = await getStatus()
      if (status !== 'open') {
        throw new Error(`The current bet has been ${status}.`)
      }

      const option = await getBetOption(optionName)
      if (!option) {
        throw new Error(`Betting option "${optionName}" does not exist.`)
      }

      if (florins < 0) {
        throw new Error('You can\'t place a negative bet.')
      }

      const wallet = await bot.florinsOf(user)
      debug('enter', florins, wallet)
      if (wallet.florins < florins) {
        throw new Error('You don\'t have that many florins.')
      }

      // Remove user's old bets.
      await db('betEntries').where('betId', '=', betId)
        .where('user', '=', user.toLowerCase())
        .delete()

      const inserted = await db('betEntries').insert({
        betId,
        optionId: option.id,
        user: user.toLowerCase(),
        amount: florins
      })

      // Return the new entry.
      return db('betEntries').where('id', '=', inserted[0]).first()
    }

    async function pool () {
      const result = await db('betEntries')
        .where('betId', '=', betId)
        .sum('amount as total')
        .first()

      return result.total
    }

    async function end (optionName) {
      const winningOption = await getBetOption(optionName)
      if (!winningOption) {
        throw new Error(`Betting option "${optionName} does not exist."`)
      }

      await db('bets')
        .where('id', '=', betId)
        .update({ status: 'ended' })
      debug('ended')

      const allEntries = await getBetEntries()
      debug('allEntries')

      const winners = await db('betEntries')
        .where('betId', '=', betId)
        .where('optionId', '=', winningOption.id)
      debug('winners', winners)
      const winningBets = winners.map((entry) => entry.amount).reduce(sum, 0)
      const total = await pool()
      debug('pool', total)

      const payouts = winners.map((entry) => ({
        user: entry.user,
        // ceil()ing sometimes creates florins out of thin air,
        // but that seems fairer than sometimes losing them randomly
        payout: Math.ceil(entry.amount / winningBets * total)
      }))

      await bot.transactions(
        allEntries.map((entry) => ({
          username: entry.user,
          amount: -entry.amount,
          description: `bet on option ${entry.option}`
        }))
      )

      await bot.transactions(
        payouts.map((entry) => ({
          username: entry.user,
          amount: entry.payout,
          description: `bet payout from option ${winningOption.name}`
        }))
      )

      return winners
    }

    async function clear (user) {
      if (await getStatus() !== 'open') {
        throw new Error('No bets are open right now.')
      }

      await db('betEntries')
        .where('betId', '=', betId)
        .where('user', '=', user.toLowerCase())
        .delete()
    }

    function getBetOptions () {
      return db('betOptions').where('betId', '=', betId)
    }

    async function optionValue (optionName) {
      const option = await getBetOption(optionName)

      const result = await db('betEntries')
        .where('betId', '=', betId)
        .where('optionId', '=', option.id)
        .sum('amount as total')
        .first()

      return result.total || 0
    }

    async function entryValue (user) {
      const value = await db('betEntries')
        .where('betId', '=', betId)
        .where('user', '=', user.toLowerCase())
        .first()

      return value.amount || 0
    }

    debug('open')

    return {
      valid,
      close,
      closed,
      end,
      enter,
      clear,
      pool,
      entryValue,
      optionValue,
      options: getBetOptions
    }
  }

  async function createBet (bot, options) {
    const betId = await db('bets')
      .insert({ status: 'open' })
      .get(0)

    const optionRows = Object.keys(options).map((name) => ({
      betId,
      name,
      description: options[name]
    }))
    await db('betOptions').insert(optionRows)

    return betManager(bot, betId, options)
  }

  async function restoreBet (bot) {
    const openBet = await db('bets').where('status', '!=', 'ended').first()

    if (openBet) {
      debug('restoring bet', openBet.id)

      bot.bet = betManager(bot, openBet.id)
    }
  }

  return function (bot) {
    restoreBet(bot).catch(
      (err) => debug('Failed to restore bets', err.message))

    bot.command('!bet open', { rank: 'mod' }, async (message) => {
      if (!bot.florinsOf) {
        throw new Error('Bets require the florins module, but it doesn\'t appear to be available.')
      }
      if (bot.bet) {
        throw new Error('Another bet is already open.')
      }

      const options = parse(message.trailing)
      const keys = Object.keys(options)

      bot.bet = await createBet(bot, options)
      bot.send('Bet opened! Betting options:')
      bot.send(keys.map((opt) => `${opt}) ${options[opt]}`).join(',  '))

      const exampleKey = keys[Math.floor(keys.length * Math.random())]
      const exampleBet = Math.floor((Math.random() * 1000) + 1)
      const example = `!bet ${exampleKey} ${exampleBet}`

      await delay(100)
      bot.send(`Use !bet [option] [number of florins] (e.g. ${example}) to participate!`)
      await delay(100)
      bot.send('Use !bet clear to cancel your participation.')
    })

    bot.command('!bet close', { rank: 'mod' }, async (message) => {
      if (!bot.bet || await bot.bet.closed()) {
        throw new Error('No bets are currently open.')
      }

      await bot.bet.close()
      const pool = await bot.bet.pool()
      bot.send(
        `Bets closed. A total of ${pool} florins were entered. ` +
        'You can no longer change your bets!'
      )
    })

    bot.command('!bet end', { rank: 'mod' }, async (message, option) => {
      if (!bot.bet) {
        throw new Error('No bets are currently running.')
      }

      const bet = bot.bet
      bot.bet = null

      const pool = await bet.pool()
      const winners = await bet.end(option)
      if (winners.length === 0) {
        bot.send(
          'Bets ended! Nobody bet on the winning option. The pool will ' +
          'be donated to villager orphans instead.'
        )
      } else {
        bot.send(
          `Bets ended! Congratulations to the ${winners.length} people ` +
          `who bet on option "${option}": ${pool} florins were awarded.`
        )
      }
    })

    bot.command('!bet stop', { rank: 'mod' }, (message) => {
      bot.bet = null
      bot.send('Bets closed and florins refunded.')
    })

    bot.command('!bet clear', async (message) => {
      if (!bot.bet) {
        return
      }

      await bot.bet.clear(message.user)
    })

    bot.command('!bet options', { throttle: ms('10 seconds') }, async () => {
      if (!bot.bet) {
        return
      }

      const closed = await bot.bet.closed()

      const options = []
      for (const option of await bot.bet.options()) {
        options.push(showOption(option))
      }

      bot.send(
        'Betting options: ' + (await Promise.all(options)).join(',  ')
      )

      async function showOption (opt) {
        const message = `${opt.name}) ${opt.description}`
        if (!closed) {
          return message
        }
        const value = await bot.bet.optionValue(opt.name)
        return `${message} - ${value} florins`
      }
    })

    bot.command('!bet', async (message, option, florins) => {
      if (['open', 'close', 'clear', 'end', 'stop', 'show', 'options'].includes(option)) {
        return
      }

      if (!bot.bet) {
        throw new Error('No bets are open right now.')
      }
      if (!option) {
        throw new Error('You must provide an option to bet on. (!bet [option] [florins])')
      }
      if (!(await bot.bet.valid(option))) {
        throw new Error(`Betting option "${option}" does not exist.`)
      }
      florins = parseInt(florins, 10)
      if (!isFinite(florins) || florins < 0) {
        throw new Error('You specified an invalid number of florins.')
      }

      await bot.bet.enter(message.user, option, florins)
    })
  }
}
