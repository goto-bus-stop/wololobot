import Module from '../Module'
import command from '../command'

const debug = require('debug')('wololobot:florins')

export default class Florins extends Module {

  constructor(bot, options) {
    super(bot, options)

    this._checks = []
    this._florinsTimeout = null

    this._sendQueuedFlorins = this._sendQueuedFlorins.bind(this)
  }

  getFlorins(users = []) {
    const db = this.client.db
    debug('getFlorins', users)
    return db('transactions')
      .select(db.raw('lower(username) as lname')).sum('amount as wallet')
      .whereIn('lname', users.map(u => u.toLowerCase()))
      .groupBy('lname')
      .reduce((o, { lname, wallet }) => {
        o[lname] = wallet
        return o
      }, {})
  }

  createTransaction(username, amount, message = '') {
    return this.client.db('transactions')
      .insert({ username: username.toLowerCase()
              , amount: amount
              , description: message })
  }

  @command('!florins', 'user')
  florinsCommand(asker, username = null) {
    if (!username || !this.client.isMod(asker.username)) {
      username = asker.username
    }

    if (!this._florinsTimeout) {
      this._checks = []
      this._florinsTimeout = setTimeout(this._sendQueuedFlorins, 4000)
    }
    this._checks.push(username)
  }

  @command('!transaction', 'user', 'number', { ranks: [ 'mod', 'broadcaster' ] })
  transactionCommand(moderator, username, amount, message = '') {
    const mname = moderator.username
    if (!/^-?\d+$/.test(amount)) {
      this.client.say(`@${mname}, "${amount}" doesn't look like an integer`)
    }
    else {
      amount = parseInt(amount, 10)
      this.createTransaction(username, amount, message)
        .then(() => this.client.say(amount < 0? `@${mname} Removed ${-amount} florins from @${username}.`
                                   : /* _ */    `@${mname} Gave ${amount} florins to @${username}.`))
        .catch(e => this.client.say(`@${mname} ${e.message}`))
    }
  }

  _sendQueuedFlorins() {
    this._florinsTimeout = null
    return this.getFlorins(this._checks)
      .then(o => Object.keys(o).map(name => `${name} - ${o[name]}`).join(', '))
      .tap(this.client.say.bind(this.client))
  }

}
