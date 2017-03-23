const { connect } = require('net')
const got = require('got')
const debug = require('debug')('wololobot:connect')

function connectAsync (...args) {
  return new Promise((resolve, reject) => {
    const conn = connect(...args, () => {
      resolve(conn)
    })
    conn.on('error', reject)
  })
}

module.exports = async function getConnection (channel) {
  const { body } = await got(`https://tmi.twitch.tv/servers?channel=${channel}`, { json: true })

  for (const server of body.servers) {
    try {
      debug('attempting connection', server)
      const [host, port] = server.split(':')
      const conn = await connectAsync(port, host)
      debug('connected')
      return conn
    } catch (e) {}
  }
}
