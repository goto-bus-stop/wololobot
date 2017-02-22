const debug = require('debug')('wololobot:florins')

module.exports = function (opts) {
  opts = Object.assign({
    delay: 4000,
    gain: 5, // 5 florins per 10 minutes
    subGain: 10, // 10 florins per 10 minutes
    gainInterval: 10 * 60 * 1000, // 10 minutes
    excludeMods: false
  }, opts)

  const { db } = opts

  db.schema.hasTable('transactions').then(exists => {
    if (exists) return debug('`transactions` table exists')

    db.schema.createTable('transactions', t => {
      t.increments('id').primary()
      t.string('username', 50).index()
      t.integer('amount').index()
      t.timestamp('time').defaultTo(db.raw('CURRENT_TIMESTAMP'))
      t.text('description')
    })
      .then(() => debug('created table'))
      .catch(e => { throw e })
  })

  function florinsOf (user) {
    debug('florinsOf', user)
    return db('transactions')
      .select(db.raw('lower(username) as lname'))
      .sum('amount as florins')
      .where('lname', '=', user.toLowerCase())
      .get(0)
  }

  async function florinsOfMany (users) {
    const lusers = users.map((name) => name.toLowerCase())
    // maps lower case names to the original capitalised names
    const nameMap = users.reduce((map, user, i) => Object.assign(map, { [lusers[i]]: user }), {})
    const florinsMap = await db('transactions')
      .select(db.raw('lower(username) as lname')).sum('amount as wallet')
      .whereIn('lname', lusers)
      .groupBy('lname')
      .reduce((o, t) => Object.assign(o, {
        [nameMap[t.lname] || t.lname]: t.wallet
      }), {})

    // add default 0 florins for unrecorded users
    users.forEach((name) => {
      if (!florinsMap[name]) {
        florinsMap[name] = 0
      }
    })
    return florinsMap
  }

  async function transaction (username, amount, description = '') {
    await db('transactions').insert({
      username: username.toLowerCase(),
      amount: amount,
      description: description
    })

    debug(`Added ${amount} florins to ${username}`)
  }

  async function transactions (list) {
    const transactionRows = list.map((transaction) => ({
      username: transaction.username.toLowerCase(),
      amount: transaction.amount,
      description: transaction.description || ''
    }))
    await db('transactions').insert(transactionRows)
    debug(`Added florins to ${transactionRows.length} users.`)
  }

  return function (bot) {
    let florinsTimeout = null
    let florinsChecks = []
    async function respondFlorins () {
      const o = await florinsOfMany(florinsChecks)

      const responses = Object.keys(o).map((name) => {
        const extra = []
        const bet = bot.bet ? bot.bet.entryValue(name) : 0
        const raffle = bot.raffle ? bot.raffle.entryValue(name) : 0
        if (bet) extra.push(`bet:${bet}`)
        if (raffle) extra.push(`raffle:${raffle}`)

        // user - 352[bet:20,raffle:70]
        return `${name} - ${o[name] - bet - raffle}` +
                (extra.length ? `[${extra.join(' / ')}]` : '')
      })

      bot.send(responses.join(', '))
      florinsChecks = []
      florinsTimeout = null
    }

    async function gain () {
      const users = bot.users()
      await transactions(users.map((user) => {
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

    Object.assign(bot, {
      florinsOf,
      florinsOfMany,
      transaction,
      transactions
    })

    bot.command('!forcegain', { rank: 'mod' }, async (message) => {
      await gain()
    })

    bot.command('!florins', (message, ...usernames) => {
      if (!usernames.length) {
        usernames = [message.user]
      }

      usernames.forEach((username) => {
        if (florinsChecks.indexOf(username) === -1) {
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
        await transaction(username, amount, description)
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
        .select('username', db.raw('lower(username) as lname'))
        .sum('amount as wallet')

      if (opts.excludeMods && bot.moderators) {
        query = query.whereNotIn('lname',
          [bot.channel.slice(1), ...bot.moderators].map((name) => (name).toLowerCase())
        )
      }

      const list = await query
        .groupBy('lname')
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
