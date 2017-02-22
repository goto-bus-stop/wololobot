const Promise = require('bluebird')
const got = require('got')

const withFullStop = (str) =>
  '.,…!?‽'.indexOf(str.substr(-1)) === -1 ? str + '.' : str

const cleanTitle = (title) =>
  withFullStop(title.trim().replace(/^"|^,,|"$/g, ''))
const enquote = (str) =>
  `"${str}"`

const getNextQuote = async (sub, minKarma, attempts = 0) => {
  const response = await got(`https://www.reddit.com/r/${sub}/random.json?_=${Math.random()}`, { json: true })
  // weeeh. property.access.is.so.much.fun()
  const post = response.body[0].data.children[0].data
  if (attempts < 5 && post.ups < minKarma) {
    return getNextQuote(sub, minKarma, attempts + 1)
  }
  return cleanTitle(post.title)
}

module.exports = function (opts) {
  opts = Object.assign({
    sub: 'random',
    min_karma: 1
  }, opts)

  let quote = getNextQuote(opts.sub, opts.min_karma)

  return function reddit (bot) {
    bot.command('!quote', { throttle: 2000 }, async (message) => {
      bot.action(enquote(await quote))
      quote = getNextQuote(opts.sub, opts.min_karma)
    })
  }
}
