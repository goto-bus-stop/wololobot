import assign from 'object-assign'
import request from 'request'

const debug = require('debug')('wololobot:random-reddit')

const withFullStop = str => '.,…!?‽'.indexOf(str.substr(-1)) === -1? str + '.'
                          : /* already has a punctuation mark */     str

const getTitle = l => l.data.title
const sanitiseTitle = title => withFullStop(title.trim().replace(/^"|^,,|"$/g, ''))
const titles = posts => (posts || []).map(getTitle).map(sanitiseTitle)
const enquote = str => `"${str}"`

const quote = sub => {
  return new Promise((resolve, reject) => {
    request(
      { uri: `https://www.reddit.com/r/${sub}/random.json?_=${Math.random()}`
      , json: true },
      (err, res, [ json = null ] = []) => {
          err?       reject(err)
        : json.data? resolve(titles(json.data.children))
        : /* else */ reject(new Error('No reddit posts found.'))
      }
    )
  })
}

export default function (opts) {
  opts = assign({
    sub: 'random'
  }, opts)
  return function reddit(bot) {
    bot.command('!quote', (message) => {
      quote(opts.sub)
        .then(enquote)
        .then(bot.action.bind(bot))
    })
  }
}