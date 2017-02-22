const indexBy = require('index-by')
const groupBy = require('group-by')
const ms = require('ms')
const debug = require('debug')('wololobot:florins')

module.exports = function (opts) {
  opts = Object.assign({
    delay: ms('4 seconds'),
    gain: 5, // 5 florins per 10 minutes
    subGain: 10, // 10 florins per 10 minutes
    gainInterval: ms('10 minutes'),
    excludeMods: false
  }, opts)

  const { db } = opts

  function makeFlorins () {
    /**
     * Find the current florins balance for a single user.
     */
    function florinsOf (user) {
      debug('florinsOf', user)
      return db('transactions')
        .sum('amount as florins')
        .where('username', '=', user.toLowerCase())
        .get(0)
    }

    /**
     * Find the current florins balance of multiple users.
     *
     * Returns a Promise for an object:
     *   `{ [user]: florins }`
     */
    async function florinsOfMany (users) {
      const lusers = users.map((name) => name.toLowerCase())
      // maps lower case names to the original capitalised names
      const nameMap = indexBy(users, (user) => user.toLowerCase())
      const florinsMap = await db('transactions')
        .select('username')
        .sum('amount as wallet')
        .whereIn('username', lusers)
        .groupBy('username')
        .reduce((o, t) => Object.assign(o, {
          [nameMap[t.username] || t.username]: t.wallet
        }), {})

      // add default 0 florins for unrecorded users
      users.forEach((name) => {
        if (!florinsMap[name]) {
          florinsMap[name] = 0
        }
      })
      return florinsMap
    }

    /**
     * Add florins to a user's balance. Use negative `amount`s to remove
     * florins.
     */
    async function transaction (username, amount, description = '') {
      await db('transactions').insert({
        username: username.toLowerCase(),
        amount: amount,
        description: description
      })

      debug(`Added ${amount} florins to ${username}`)
    }

    /**
     * Bulk add florins.
     */
    async function transactions (list) {
      if (list.length === 0) {
        return
      }

      const transactionRows = list.map((transaction) => ({
        username: transaction.username.toLowerCase(),
        amount: transaction.amount,
        description: transaction.description || ''
      }))
      await db('transactions').insert(transactionRows)
      debug(`Added florins to ${transactionRows.length} users.`)
    }

    /**
     *
     */
    async function reserve (user, purpose, amount) {
      const wallet = await florinsOf(user)
      if (wallet.florins < amount) {
        throw new Error('You don\'t have that many florins.')
      }

      await db('florinReservations').insert({
        username: user.toLowerCase(),
        amount,
        purpose
      })
    }

    async function unreserve (user, purpose) {
      await db('florinReservations')
        .where('username', '=', user.toLowerCase())
        .where('purpose', '=', purpose)
        .delete()
    }

    async function clearReservations (purpose) {
      await db('florinReservations')
        .where('purpose', '=', purpose)
        .delete()
    }

    function getReservations (user) {
      return db('florinReservations')
        .where('username', '=', user.toLowerCase())
    }

    async function getReservationsMany (users) {
      const lusers = users.map((user) => user.toLowerCase())
      const userNameMap = indexBy(users, (user) => user.toLowerCase())
      const name = (lname) => userNameMap[lname] || lname

      const reservations = await db('florinReservations')
        .select('username', 'purpose', 'amount')
        .whereIn('username', lusers)

      const reservationsMap = groupBy(reservations, (res) => name(res.username))
      // Add empty lists for users without reservations.
      users.forEach((name) => {
        reservationsMap[name] = reservationsMap[name] || []
      })
      return reservationsMap
    }

    return {
      of: florinsOf,
      ofMany: florinsOfMany,
      transaction,
      transactions,
      reserve,
      unreserve,
      clearReservations,
      getReservations,
      getReservationsMany
    }
  }

  return function (bot) {
    bot.florins = makeFlorins()

    let florinsTimeout = null
    let florinsChecks = []

    async function respondFlorins () {
      const wallets = await bot.florins.ofMany(florinsChecks)
      const reservations = await bot.florins.getReservationsMany(florinsChecks)

      const responses = Object.keys(wallets).map((name) => {
        const extra = reservations[name]
          .map((res) => `${res.purpose}:${res.amount}`)
        const reserved = reservations[name]
          .reduce((total, res) => total + res.amount, 0)

        // user - 352[bet:20,raffle:70]
        return `${name} - ${wallets[name] - reserved}` +
          (extra.length ? `[${extra.join(' / ')}]` : '')
      })

      bot.send(responses.join(', '))
      florinsChecks = []
      florinsTimeout = null
    }

    async function gain () {
      const users = bot.users()
      await bot.florins.transactions(users.map((user) => {
        const sub = bot.isSubscriber && bot.isSubscriber(user.name)
        return {
          username: user.name,
          amount: sub ? opts.subGain : opts.gain,
          description: 'florins gain'
        }
      }))
    }

    setInterval(() => {
      if (bot.isLive) gain()
    }, opts.gainInterval)

    bot.command('!forcegain', { rank: 'mod' }, async (message) => {
      await gain()
    })

    bot.command('!florins', (message, ...usernames) => {
      if (!usernames.length) {
        usernames = [message.user]
      }

      usernames.forEach((username) => {
        if (florinsChecks.includes(username)) {
          florinsChecks.push(username)
        }
      })

      if (!florinsTimeout) {
        florinsTimeout = setTimeout(respondFlorins, opts.delay)
      }
    })

    bot.command('!transaction', { rank: 'mod' }, async (message, username, amount, description = '') => {
      const mname = message.user
      if (!/^-?\d+$/.test(amount)) {
        throw new Error(`"${amount}" doesn't look like an integer`)
      } else {
        amount = parseInt(amount, 10)
        await bot.florins.transaction(username, amount, description)
        if (amount < 0) {
          bot.send(`@${mname} Removed ${-amount} florins from ${username}.`)
        } else {
          bot.send(`@${mname} Gave ${amount} florins to ${username}.`)
        }
      }
    })

    const topCommand = (opts) => async (message, n = 3) => {
      if (n > 15) n = 15
      let query = db('transactions')
        .select('username')
        .sum('amount as wallet')

      if (opts.excludeMods && bot.moderators) {
        query = query.whereNotIn('username',
          [bot.channel.slice(1), ...bot.moderators].map((name) => (name).toLowerCase())
        )
      }

      const list = await query
        .groupBy('username')
        .orderBy('wallet', 'desc')
        .limit(n)
        .reduce((list, user, i) => list.concat([
          `#${i + 1}) ${user.username} - ${user.wallet}`
        ]), [])

      bot.send(`@${message.user} Top florins: ` + list.join(', '))
    }

    bot.command('!top', topCommand({ excludeMods: opts.excludeMods }))
    bot.command('!topwithmods', topCommand({ excludeMods: false }))
  }
}
