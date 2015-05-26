import knex from 'knex'
import { readFileSync as readFile } from 'fs'
import wololobot from './index'
import version from './modules/version'
import florins from './modules/florins'
import raffle from './modules/raffle'
import bets from './modules/bets'
import reddit from './modules/reddit'
import streamtime from './modules/streamtime'

export default function main(confile = 'config.json') {
  const conf = JSON.parse(readFile(confile))
  const db = knex(conf.database)

  const wb = wololobot(conf)
  wb.use(version())
  wb.use(florins({ db: db }))
  wb.use(raffle())
  wb.use(bets())
  wb.use(reddit(conf.reddit))
  wb.use(streamtime({ channel: (conf.channel[0] === '#') ?
                                 conf.channel.slice(1)
                               : conf.channel
                    , db: db }))

  return wb
}
