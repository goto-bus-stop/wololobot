import assign from 'object-assign'
import request from 'request'

const debug = require('debug')('wololobot:random-reddit')

const withFullStop = str => '.,…!?‽'.indexOf(str.substr(-1)) === -1? str + '.'
                          : /* already has a punctuation mark */     str

const getTitle = l => l.data.title
const sanitiseTitle = title => withFullStop(title.trim().replace(/^"|^,,|"$/g, ''))
const titles = posts => (posts || []).map(getTitle).map(sanitiseTitle)
const enquote = str => `"${str}"`

const getQuotes = (sub, min_karma, after = null) => {
  return new Promise((resolve, reject) => {
    request(
      { uri: `https://www.reddit.com/r/${sub}/top/.json?t=all&after=${after}`
      , json: true },
      (err, res, json = {}) => {
        if (err) {
          reject(err)
        } else if (json.data) {
          let quotes = titles(json.data.children.filter(quote => quote.data.ups >= min_karma))
          debug(`Got ${quotes.length} quotes (after ${after})`)
          if (json.data.after) {
            debug(`Getting quotes after ${json.data.after}`)
            getQuotes(sub, min_karma, json.data.after)
              .then(moreQuotes => resolve(quotes.concat(moreQuotes)))
          } else {
            resolve(quotes)
          }
        }
      }
    )
  })
}

export default function (opts) {
  opts = assign({
    sub: 'random'
  , min_karma: 1
  , update_interval: 5 * 60 * 1000
  }, opts)

  let quotes = []

  let updateQuotes = () => getQuotes(opts.sub, opts.min_karma).then(quotes_ => quotes = quotes_)
  updateQuotes()
  setInterval(updateQuotes, opts.update_interval)

  let quote = () => enquote(quotes[Math.floor(Math.random() * quotes.length)])

  return function reddit(bot) {
    bot.command('!quote', (message) => {
      bot.action(quote())
    })
  }
}
