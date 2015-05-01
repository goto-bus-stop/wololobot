import findIndex from 'array-findindex'

export default function users() {

  return function (client) {
    client._users = {}
    const c = channel => client._users[channel] || (client._users[channel] = [])
    client.on('names', ({ channel, names }) => {
      client._users[channel] = names
    })
    client.on('join', ({ channel, nick }) => {
      if (!c(channel).some(u => u.name === nick)) {
        c(channel).push({ name: nick, mode: '' })
      }
    })
    client.on('part', ({ channel, nick }) => {
      let i = findIndex(c(channel), u => u.name === nick)
      if (i !== -1) {
        c(channel).splice(i, 1)
      }
    })
    client.users = c
  }

}