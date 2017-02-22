const got = require('got')
const Promise = require('bluebird')

async function getStream (channel) {
  const response = await got(`https://api.twitch.tv/kraken/streams/${channel}`, { json: true })
  if (response.body.stream) {
    return response.body.stream
  }
}

module.exports = function twitchLiveStatus (opts = {}) {
  const interval = opts.interval || 5 * 60 * 1000

  return (client) => {
    client.isLive = false

    update()
    setInterval(update, interval)

    async function update () {
      const stream = await getStream(opts.channel)
      if (stream && !client.isLive) {
        client.emit('streamstart', stream)
        client.isLive = stream
      } else if (!stream && client.isLive) {
        client.emit('streamend')
        client.isLive = false
      }
    }
  }
}
