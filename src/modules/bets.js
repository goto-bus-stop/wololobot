import assign from 'object-assign'

const debug = require('debug')('wololobot:bets')

const sum = (a, b) => a + b

const last = arr => arr[arr.length - 1]
const parse = str => {
           // "a) option1 b) option2"
  let rx = /([a-z]+)\)(.*?)(?:\s[a-z]+\)|$)/g
  let match
  let options = {}
  while (match = rx.exec(str)) {
    rx.lastIndex -= match[1].length + 2
    options[ match[1].toLowerCase() ] = match[2].trim()
  }
  return options
}

export default function bets(opts) {

  function bet(bot, options) {
    const optionNames = Object.keys(options).map(n => n.toLowerCase())
    let status = 'open'
    let _entries = {}

    function entries() {
      return Object.keys(_entries).map(u => _entries[u])
    }
    function valid(option) {
      return optionNames.indexOf(String(option).toLowerCase()) !== -1
    }
    function close() {
      debug('close', pool())
      status = 'closed'
    }
    function closed() {
      return status === 'closed'
    }
    function enter(user, option, florins) {
      let luser = user.toLowerCase()
      option = String(option).toLowerCase()
      if (status !== 'open')
        return Promise.reject(new Error(`No bets are open right now.`))
      if (optionNames.indexOf(option) === -1)
        return Promise.reject(new Error(`Betting option "${option}" does not exist.`))
      if (florins < 0)
        return Promise.reject(new Error('You can\'t place a negative bet.'))
      return bot.florinsOf(user).then(wallet => {
        debug('enter', florins, wallet)
        if (wallet.florins < florins)
          return Promise.reject(new Error('You don\'t have that many florins.'))
        return _entries[luser] = { user, option, florins }
      })
    }
    function pool() {
      return entries().map(e => e.florins).reduce(sum, 0)
    }
    function end(option) {
      option = String(option).toLowerCase()
      if (optionNames.indexOf(option) === -1)
        return Promise.reject(new Error(`Betting option "${option} does not exist."`))
      let winners = entries().filter(e => e.option === option)
      let winningBets = winners.map(e => e.florins).reduce(sum, 0)
      let total = pool()

      let payouts = winners.map(e => ({
        user: e.user
        // ceil()ing sometimes creates florins out of thin air,
        // but that seems fairer than sometimes losing them randomly
      , payout: Math.ceil(e.florins / winningBets * total)
      }))

      return bot.transactions(
        entries().map(e => ({ username: e.user
                            , amount: -e.florins
                            , description: `bet on option ${e.option}` }))
      ).then(() => bot.transactions(
        payouts.map(e => ({ username: e.user
                          , amount: e.payout
                          , description: `bet payout from option ${option}` }))
      )).return(winners)
    }
    function clear(user) {
      user = user.toLowerCase()
      if (status !== 'open')
        return Promise.reject(new Error(`No bets are open right now.`))
      if (user in _entries) delete _entries[user]
      return Promise.resolve()
    }
    function _options() {
      return Object.keys(options).reduce((arr, o) => {
        return arr.concat([ { option: o, label: options[o] } ])
      }, [])
    }
    function optionValue(option) {
      option = String(option).toLowerCase()
      return entries().filter(e => e.option === option)
                      .map(e => e.florins)
                      .reduce(sum, 0)
    }
    function entryValue(user) {
      let entry = _entries[user.toLowerCase()]
      return entry && entry.florins || 0
    }

    debug('open', optionNames)

    return { valid, close, closed, end,
             enter, clear,
             pool, entryValue, optionValue,
             options: _options }
  }

  return function (bot) {

    bot.command('!bet open'
               , { rank: 'mod' }
               , (message) => {
      const mname = message.user
      if (!bot.florinsOf)
        return bot.send(`@${mname} Bets require the florins module, ` +
                        `but it doesn't appear to be available.`)
      if (bot.bet)
        return bot.send(`@${mname} Another bet is already open.`)

      let options = parse(message.trailing)
      let keys = Object.keys(options)

      bot.bet = bet(bot, options)
      bot.send('Bet opened! Betting options:')
      bot.send(keys.reduce((arr, opt) => arr.concat([ `${opt}) ${options[opt]}` ]), [])
                   .join(',  '))

      let example = `!bet ${keys[Math.floor(keys.length * Math.random())]} ` +
                    Math.floor(Math.random() * 1000 + 1)
      setTimeout(() => bot.send(`Use !bet [option] [number of florins] (e.g. ${example}) to participate!`), 100)
      setTimeout(() => bot.send('Use !bet clear to cancel your participation.'), 200)
    })

    bot.command('!bet close'
               , { rank: 'mod' }
               , (message) => {
      const mname = message.user
      if (!bot.bet || bot.bet.closed())
        return bot.send(`@${mname} No bets are currently open.`)
      bot.bet.close()
      bot.send(`Bets closed. A total of ${bot.bet.pool()} florins were entered. ` +
               `You can no longer change your bets!`)
    })

    bot.command('!bet end'
               , { rank: 'mod' }
               , (message, option) => {
      const mname = message.user
      if (!bot.bet)
        return bot.send(`@${mname} No bets are currently running.`)

      let pool = bot.bet.pool()
      bot.bet.end(option)
        .then(winners => {
          if (winners.length === 0) {
            bot.send(`Bets ended! Nobody bet on the winning option. The pool will ` +
                     `be donated to villager orphans instead.`)
          }
          else {
            bot.send(`Bets ended! Congratulations to the ${winners.length} people ` +
                     `who bet on option "${option}": ${pool} florins were awarded.`)
          }
        })
        .catch(e => bot.send(`@${mname} ${e.message}`))
      bot.bet = null
    })

    bot.command('!bet stop'
               , { rank: 'mod' }
               , (message) => {
      bot.bet = null
      bot.send('Bets closed and florins refunded.')
    })

    bot.command('!bet clear', (message) => {
      if (!bot.bet)
        return
      bot.bet.clear(message.user)
        .catch(e => bot.send(`@${message.user} ${e.message}`))
    })

    bot.command('!bet options', { throttle: 10000 }, () => {
      if (!bot.bet)
        return
      let closed = bot.bet.closed()
      bot.send(
        'Betting options: ' +
        bot.bet.options()
               .map(opt => `${opt.option}) ${opt.label}` +
                           (closed ? ` - ${bot.bet.optionValue(opt.option)} florins` : ''))
               .join(',  ')
      )
    })

    bot.command('!bet', (message, option, florins) => {
      const uname = message.user
      florins = parseInt(florins, 10)
      if ([ 'open', 'close', 'clear', 'end', 'stop', 'show', 'options' ]
          .indexOf(option) !== -1)
        return
      if (!bot.bet)
        return bot.send(`@${uname} No bets are open right now.`)
      if (!option)
        return bot.send(`@${uname} You must provide an option to bet on. ` +
                        `(!bet [option] [florins])`)
      if (!bot.bet.valid(option))
        return bot.send(`@${uname} Betting option "${option}" does not exist.`)
      if (isNaN(florins) || florins < 0)
        return bot.send(`@${uname} You specified an invalid number of florins.`)
      bot.bet.enter(uname, option, florins)
        .catch(e => bot.send(`@${uname} ${e.message}`))
    })
  }

}
