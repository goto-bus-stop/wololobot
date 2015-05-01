import assign from 'object-assign'
import Promise from 'bluebird'

const debug = require('debug')('wololobot:florins')

export default function (opts) {
  opts = assign({
    delay: 4000
  }, opts)

  const { db } = opts
  function florinsOf(user) {
    return db('transactions')
      .sum('amount as florins')
      .where('lower(username)', '=', user.toLowerCase())
  }
  function florinsOfMany(users) {
    let lusers = users.map(u => u.toLowerCase())
    let nameMap = users.reduce((map, user, i) => assign(map, { [lusers[i]]: user }), {})
    return db('transactions')
      .select(db.raw('lower(username) as lname')).sum('amount as wallet')
      .whereIn('lname', lusers)
      .groupBy('lname')
      .reduce((o, t) => assign(o, { [nameMap[t.lname] || t.lname]: t.wallet }), {})
  }
  function transaction(username, amount, description = '') {
    return db('transactions').insert({ username: username.toLowerCase()
                                     , amount: amount
                                     , description: description })
  }
  function transactions(list) {
    return Promise.all(list.map(t => transaction(t.username, t.amount, t.description)))
  }

  return function (bot) {
    let florinsTimeout = null
    let florinsChecks = []
    function respondFlorins() {
      florinsOfMany(florinsChecks)
        .then(o => Object.keys(o)
                         .map(name => `${name} - ${o[name]}`)
                         .join(', '))
        .tap(bot.send.bind(bot))
      florinsChecks = []
      florinsTimeout = null
    }

    assign(bot, { florinsOf, florinsOfMany, transaction, transactions })

    bot.command('!florins', (message, username = null) => {
      if (!username) {
        username = message.user
      }
      if (florinsChecks.indexOf(username) === -1) {
        florinsChecks.push(username)
        if (!florinsTimeout) {
          florinsTimeout = setTimeout(respondFlorins, opts.delay)
        }
      }
    })

    bot.command('!transaction'
               , { ranks: [ 'mod' ] }
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

    bot.command('!top', (message, n = 3) => {
      if (n > 15) n = 15
      db('transactions')
        .select('username').sum('amount as wallet')
        .groupBy('username')
        .orderBy('wallet', 'desc')
        .limit(n)
        .reduce((list, u, i) => list.concat([ `#${i + 1}) ${u.username} - ${u.wallet}` ]), [])
        .then(list => bot.send(`@${message.user} Top florins: ` + list.join(', ')))
    })
  }
}
