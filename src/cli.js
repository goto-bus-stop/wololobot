import knex from 'knex'
import { readFileSync as readFile } from 'fs'
import wololobot from './index'
import version from './modules/version'
import florins from './modules/florins'
import raffle from './modules/raffle'
import reddit from './modules/reddit'

export default function main(confile = 'config.json') {
  const conf = JSON.parse(readFile(confile))
  const db = knex(conf.database)

  const wb = wololobot(conf)
  wb.use(version())
  wb.use(florins({ db: db }))
  wb.use(raffle())
  wb.use(reddit(conf.reddit))

  return wb
}