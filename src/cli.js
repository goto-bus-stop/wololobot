import WololoBot from './index'
import Version from './modules/Version'
import Florins from './modules/Florins'
import RandomReddit from './modules/RandomReddit'
import { readFileSync as readFile } from 'fs'

export default function main(confile = 'config.json') {
  const conf = JSON.parse(readFile(confile))
  const wb = new WololoBot(conf)

  new Version(wb, {})
  new Florins(wb, {})
  new RandomReddit(wb, conf.RandomReddit || { sub: 'random' })

  wb.connect()

  return wb
}