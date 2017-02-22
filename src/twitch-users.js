const got = require('got')
const debug = require('debug')('wololobot:users')

module.exports = function users (opts) {
  opts = Object.assign({ interval: 1 * 60 * 1000 }, opts)

  const updateUsers = async (channel, client) => {
    const ircChannel = `#${channel}`
    const response = await got(`http://tmi.twitch.tv/group/user/${channel}/chatters`, { json: true })

    const chatters = response.body.chatters
    client._users[ircChannel] = chatters.moderators.concat(
      chatters.staff,
      chatters.admins,
      chatters.global_mods,
      chatters.viewers
    ).map((nick) => ({
      name: nick,
      mode: ''
    }))
  }

  return (client) => {
    client._users = {}
    opts.channels.forEach((channel) => {
      setInterval(() => updateUsers(channel, client), opts.interval)
      updateUsers(channel, client)
    })
    client.users = (channel) =>
      client._users[channel] || (client._users[channel] = [])
  }
}
