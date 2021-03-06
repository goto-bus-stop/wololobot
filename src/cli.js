const knex = require('knex')
const { readFileSync: readFile } = require('fs')
const wololobot = require('./index')
const version = require('./modules/version')
const florins = require('./modules/florins')
const raffle = require('./modules/raffle')
const bets = require('./modules/bets')
const reddit = require('./modules/reddit')
const streamtime = require('./modules/streamtime')
const drawing = require('./modules/drawing')
const mute = require('./modules/mute')
const waffle = require('./modules/waffle')

module.exports = async function main (confile = 'config.json') {
  const conf = JSON.parse(readFile(confile))
  const db = knex(require('../knexfile'))

  const wb = await wololobot(conf)

  await db.migrate.latest()

  wb.use(version())
  wb.use(florins({ db: db, excludeMods: true }))
  wb.use(raffle())
  wb.use(bets({ db: db }))
  wb.use(reddit(conf.reddit))
  wb.use(streamtime({ db: db }))
  wb.use(drawing())
  wb.use(mute({ username: conf.username }))
  wb.use(waffle())

  return wb
}
