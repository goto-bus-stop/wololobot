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

  async function createBetOptionsTable (options) {
    await db.schema.createTableIfNotExists('bet_options', (table) => {
      table.string('name').primary()
      table.string('represents')
    })

    debug('created table bet_options')
    // Clear table from previous bets if it already existed.
    await db('bet_options').del()

    const optionRows = Object.keys(options).map((name) => ({
      name: name,
      represents: options[name]
    }))
    await db('bet_options').insert(optionRows)
  }

  async function createBetEntriesTable (entries) {
    await db.schema.createTableIfNotExists('bet_entries', (table) => {
      table.string('user').primary()
      table.string('option')
      table.integer('florins')
    })

    debug('created table bet_entries')
    await db('bet_entries').del()

    const entryRows = Object.keys(entries).map((name) => entries[name])
    await db('bet_entries').insert(entryRows)
  }

  async function createBetStatusTable (status) {
    await db.schema.createTableIfNotExists('bet_status', (table) => {
      table.string('status').primary()
    })

    debug('created table bet_status')
    await db('bet_status').del()
    await db('bet_status').insert({ status: status })
  }

  function bet (bot, options, status = 'open', _entries = {}) {
    Promise.all([
      createBetOptionsTable(options),
      createBetEntriesTable(entries),
      createBetStatusTable(status)
    ]).catch((err) => {
      console.error(err.stack || err.message)
      bot.send(
        '⚠ Failed to store bet data. ' +
        'Bets will still work, but will be lost if wololobot crashes.'
      )
    })

    const optionNames = Object.keys(options).map((name) => name.toLowerCase())

    function entries () {
      return Object.keys(_entries).map((user) => _entries[user])
    }

    function valid (option) {
      return optionNames.includes(String(option).toLowerCase())
    }

    function close () {
      debug('close', pool())
      status = 'closed'
      return db('bet_status').update({ status: status })
    }

    function closed () {
      return status === 'closed'
    }

    async function enter (user, option, florins) {
      const luser = user.toLowerCase()
      option = String(option).toLowerCase()
      if (status !== 'open') {
        throw new Error(`No bets are open right now.`)
      }
      if (optionNames.indexOf(option) === -1) {
        throw new Error(`Betting option "${option}" does not exist.`)
      }
      if (florins < 0) {
        throw new Error('You can\'t place a negative bet.')
      }

      const wallet = await bot.florinsOf(user)
      debug('enter', florins, wallet)
      if (wallet.florins < florins) {
        throw new Error('You don\'t have that many florins.')
      }

      try {
        await db('bet_entries').where({ user }).del()
        await db('bet_entries').insert({ user, option, florins })
      } catch (err) { /* Ignore */ }

      _entries[luser] = { user, option, florins }
      return _entries[luser]
    }

    function pool () {
      return entries().map((e) => e.florins).reduce(sum, 0)
    }

    async function end (option) {
      option = String(option).toLowerCase()
      if (optionNames.indexOf(option) === -1) {
        throw new Error(`Betting option "${option} does not exist."`)
      }
      const winners = entries().filter((entry) => entry.option === option)
      const winningBets = winners.map((entry) => entry.florins).reduce(sum, 0)
      const total = pool()

      const payouts = winners.map((entry) => ({
        user: entry.user,
        // ceil()ing sometimes creates florins out of thin air,
        // but that seems fairer than sometimes losing them randomly
        payout: Math.ceil(entry.florins / winningBets * total)
      }))

      await db.schema
        .dropTable('bet_options')
        .dropTable('bet_entries')
        .dropTable('bet_status')
      debug('dropped betting tables')

      await bot.transactions(
        entries().map((entry) => ({
          username: entry.user,
          amount: -entry.florins,
          description: `bet on option ${entry.option}`
        }))
      )
      await bot.transactions(
        payouts.map((entry) => ({
          username: entry.user,
          amount: entry.payout,
          description: `bet payout from option ${option}`
        }))
      )

      return winners
    }

    async function clear (user) {
      user = user.toLowerCase()
      if (status !== 'open') {
        throw new Error(`No bets are open right now.`)
      }

      if (user in _entries) {
        await db('bet_entries').where({ user: _entries[user].user }).del()
        delete _entries[user]
      }
    }

    function _options () {
      return Object.keys(options).reduce((arr, o) => {
        return arr.concat([ { option: o, label: options[o] } ])
      }, [])
    }

    function optionValue (option) {
      option = String(option).toLowerCase()
      return entries().filter((entry) => entry.option === option)
                      .map((entry) => entry.florins)
                      .reduce(sum, 0)
    }

    function entryValue (user) {
      const entry = _entries[user.toLowerCase()]
      return (entry && entry.florins) || 0
    }

    debug('open', optionNames)

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
      options: _options
    }
  }

  async function restoreBet (bot) {
    const exists = await db.schema.hasTable('bet_options')
    if (!exists) {
      return
    }

    const options = await db('bet_options').select('name', 'represents')
    const lastOptions = {}
    options.forEach((option) => {
      lastOptions[option.name] = option.represents
    })

    const bets = await db('bet_entries').select('user', 'option', 'florins')
    const lastEntries = {}
    bets.forEach((bet) => {
      lastEntries[bet.user.toLowerCase()] = {
        user: bet.user,
        option: bet.option,
        florins: bet.florins
      }
    })

    const status = await db('bet_status').select('status')

    const lastStatus = status[0].status
    bot.bet = bet(bot, lastOptions, lastStatus, lastEntries)
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

      bot.bet = bet(bot, options)
      bot.send('Bet opened! Betting options:')
      bot.send(keys.reduce((arr, opt) => arr.concat([`${opt}) ${options[opt]}`]), []).join(',  '))

      const exampleKey = keys[Math.floor(keys.length * Math.random())]
      const exampleBet = Math.floor((Math.random() * 1000) + 1)
      const example = `!bet ${exampleKey} ${exampleBet}`
      await delay(100)
      bot.send(`Use !bet [option] [number of florins] (e.g. ${example}) to participate!`)
      await delay(100)
      bot.send('Use !bet clear to cancel your participation.')
    })

    bot.command('!bet close', { rank: 'mod' }, async (message) => {
      if (!bot.bet || bot.bet.closed()) {
        throw new Error('No bets are currently open.')
      }

      bot.bet.close()
      bot.send(
        `Bets closed. A total of ${bot.bet.pool()} florins were entered. ` +
        'You can no longer change your bets!'
      )
    })

    bot.command('!bet end', { rank: 'mod' }, async (message, option) => {
      if (!bot.bet) {
        throw new Error('No bets are currently running.')
      }

      const bet = bot.bet
      bot.bet = null

      const pool = bet.pool()
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

    bot.command('!bet options', { throttle: ms('10 seconds') }, () => {
      if (!bot.bet) {
        return
      }

      const closed = bot.bet.closed()

      bot.send(
        'Betting options: ' + bot.bet.options().map(showOption).join(',  ')
      )

      function showOption (opt) {
        return `${opt.option}) ${opt.label}` +
          (closed ? ` - ${bot.bet.optionValue(opt.option)} florins` : '')
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
      if (!bot.bet.valid(option)) {
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
