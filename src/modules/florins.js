const Promise = require('bluebird')

const debug = require('debug')('wololobot:florins')

module.exports = function (opts) {
  opts = Object.assign({
    delay: 4000
  , gain: 5 // 5 florins per 10 minutes
  , subGain: 10 // 10 florins per 10 minutes
  , gainInterval: 10 * 60 * 1000 // 10 minutes
  , excludeMods: false
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

  function florinsOf(user) {
    debug('florinsOf', user)
    return db('transactions')
      .select(db.raw('lower(username) as lname'))
      .sum('amount as florins')
      .where('lname', '=', user.toLowerCase())
      .then(arr => arr[0])
  }
  function florinsOfMany(users) {
    let lusers = users.map(u => u.toLowerCase())
    // maps lower case names to the original capitalised names
    let nameMap = users.reduce((map, user, i) => Object.assign(map, { [lusers[i]]: user }), {})
    return db('transactions')
      .select(db.raw('lower(username) as lname')).sum('amount as wallet')
      .whereIn('lname', lusers)
      .groupBy('lname')
      .reduce((o, t) => Object.assign(o, { [nameMap[t.lname] || t.lname]: t.wallet }), {})
      // add default 0 florins for unrecorded users
      .then(o => {
        users.forEach(u => o[u] || (o[u] = 0))
        return o
      })
  }
  function transaction(username, amount, description = '') {
    return db('transactions')
      .insert({ username: username.toLowerCase()
              , amount: amount
              , description: description })
      .then(() => debug(`Added ${amount} florins to ${username}`))
  }
  function transactions(list) {
    const inserts = list.map(t => ({ username: t.username.toLowerCase()
                                   , amount: t.amount
                                   , description: t.description || '' }))
    return db('transactions').insert(inserts)
      .then(() => debug(`Added florins to ${inserts.length} users.`))
  }

  return function (bot) {
    let florinsTimeout = null
    let florinsChecks = []
    function respondFlorins() {
      florinsOfMany(florinsChecks)
        .then(o => {
          return Object.keys(o).map(name => {
            let extra = []
            let bet = bot.bet && bot.bet.entryValue(name) || 0
            let raffle = bot.raffle && bot.raffle.entryValue(name) || 0
            if (bet) extra.push(`bet:${bet}`)
            if (raffle) extra.push(`raffle:${raffle}`)

            // user - 352[bet:20,raffle:70]
            return `${name} - ${o[name] - bet - raffle}` +
                   (extra.length ? `[${extra.join(' / ')}]` : '')
          }).join(', ')
        })
        .tap(bot.send.bind(bot))
      florinsChecks = []
      florinsTimeout = null
    }

    function gain() {
      let users = bot.users()
      transactions(users.map(u => {
        let sub = bot.isSubscriber && bot.isSubscriber(u.name)
        return { username: u.name
               , amount: sub ? opts.subGain : opts.gain
               , description: 'florins gain' }
      }))
    }

    setInterval(() => {
      if (bot.isLive) gain()
    }, opts.gainInterval)

    Object.assign(bot, { florinsOf, florinsOfMany, transaction, transactions })

    bot.command('!forcegain', { rank: 'mod' }, message => {
      gain()
    })

    bot.command('!florins', (message, ...usernames) => {
      if (!usernames.length) {
        usernames = [ message.user ]
      }
      usernames.forEach(username => {
        if (florinsChecks.indexOf(username) === -1) {
          florinsChecks.push(username)
        }
      })
      if (!florinsTimeout) {
        florinsTimeout = setTimeout(respondFlorins, opts.delay)
      }
    })

    bot.command('!transaction'
               , { rank: 'mod' }
               , (message, username, amount, description = '') => {
      const mname = message.user
      if (!/^-?\d+$/.test(amount)) {
        bot.send(`@${mname}, "${amount}" doesn't look like an integer`)
      }
      else {
        amount = parseInt(amount, 10)
        transaction(username, amount, description)
          .then(() => bot.send(amount < 0? `@${mname} Removed ${-amount} florins from ${username}.`
                              : /* _ */    `@${mname} Gave ${amount} florins to ${username}.`))
          .catch(e => bot.send(`@${mname} ${e.message}`))
      }
    })

    const topCommand = opts => (message, n = 3) => {
      if (n > 15) n = 15
      let q = db('transactions')
        .select('username', db.raw('lower(username) as lname'))
        .sum('amount as wallet')
      if (opts.excludeMods && bot.moderators) {
        q = q.whereNotIn('lname', [ bot.channel.slice(1), ...bot.moderators ]
                                    .map(name => name.toLowerCase()))
      }
      q
        .groupBy('lname')
        .orderBy('wallet', 'desc')
        .limit(n)
        .reduce((list, u, i) => list.concat([ `#${i + 1}) ${u.username} - ${u.wallet}` ]), [])
        .then(list => bot.send(`@${message.user} Top florins: ` + list.join(', ')))
    }

    bot.command('!top', topCommand({ excludeMods: opts.excludeMods }))
    bot.command('!topwithmods', topCommand({ excludeMods: false }))
  }
}
