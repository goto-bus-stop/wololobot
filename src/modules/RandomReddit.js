import command from '../command'
import Module from '../Module'
import request from 'request'

const debug = require('debug')('wololobot:random-reddit')

const withFullStop = str => '.,…!?‽'.indexOf(str.substr(-1)) === -1? str + '.'
                          : /* already has a punctuation mark */     str

const sanitiseTitle = title => withFullStop(title.trim().replace(/^"|^,,|"$/g, ''))

export default class RandomReddit extends Module {

  getQuote() {
    return new Promise((resolve, reject) => {
      request(
        { uri: `https://www.reddit.com/r/${this.options.sub}/random.json?_=${Math.random()}`
        , json: true },
        (err, res, [ json = null ] = []) => {
            err?          reject(err)
          : json == null? reject(new Error('No reddit posts found.'))
          : /* else */    resolve(json.data.children.map(l => l.data.title).map(sanitiseTitle))
        }
      )
    })
  }

  @command('!quote')
  sendRandomQuote() {
    this.getQuote().then(quote => { this.client.action(`"${quote}"`) })
  }

}