const request = require('request')
const debug = require('debug')('wololobot:users')

module.exports = function users (opts) {
  opts = Object.assign({ interval: 1 * 60 * 1000 }, opts)

  const updateUsers = (channel, client) => {
    let ircChannel = `#${channel}`
    return new Promise((resolve, reject) => {
      request(
        { uri: `http://tmi.twitch.tv/group/user/${channel}/chatters`,
          json: true },
        (err, res, body = {}) => {
          if (err) {
            debug('An error occured while trying to get the chatters for ' +
                  `channel ${channel}: ${err}`)
            reject(err)
          } else {
            try {
              let chatters = body.chatters
              client._users[ircChannel] = chatters.moderators.concat(
                chatters.staff, chatters.admins, chatters.global_mods,
                chatters.viewers
              ).map(nick => { return { name: nick, mode: '' } })
              resolve()
            } catch (e) {
              if (!(e instanceof TypeError)) throw e
              // Twitch probably didn't send a response in the right format
              debug('An error occured while trying to get the chatters for ' +
                    `channel ${channel}: ${e}`)
              reject(e)
            }
          }
        })
    })
  }

  return function (client) {
    client._users = {}
    var c = channel => client._users[channel] || (client._users[channel] = [])
    opts.channels.forEach(channel => {
      setInterval(updateUsers.bind(this, channel, client), opts.interval)
      updateUsers(channel, client)
    })
    client.users = c
  }
}
