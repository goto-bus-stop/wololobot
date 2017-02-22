const request = require('request')
const Promise = require('bluebird')

function getStream (channel) {
  return new Promise((resolve, reject) => {
    request(
      { method: 'GET',
        uri: `https://api.twitch.tv/kraken/streams/${channel}`,
        json: true },
      (e, _, body) => e ? reject(e)
                    : body.stream ? resolve(body.stream)
                    : reject(new Error('Stream offline.'))
    )
  })
}

module.exports = function twitchLiveStatus (opts = {}) {
  const interval = opts.interval || 5 * 60 * 1000

  return function (client) {
    client.isLive = false

    update()
    setInterval(update, interval)

    function update () {
      getStream(opts.channel)
        .then(stream => {
          if (!client.isLive) { client.emit('streamstart', stream) }
          client.isLive = stream
        })
        .catch(() => {
          if (client.isLive) { client.emit('streamend') }
          client.isLive = false
        })
    }
  }
}
