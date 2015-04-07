import WololoBot from './index'
import Version from './modules/Version'
import { readFileSync as readFile } from 'fs'

export default function main(confile = 'config.json') {
  const conf = JSON.parse(readFile(confile))
  const wb = new WololoBot(conf)

  new Version(wb, {})
}