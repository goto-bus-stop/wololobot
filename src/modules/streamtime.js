import request from 'request'
import tzCodes from 'timezone-abbr-offsets'
import strip from 'strip'
import assign from 'object-assign'
import countdown from 'countdown'

let debug = require('debug')('wololobot:streamtime')

// timezones.json contains offset from UTC, this converts to offset from local
// timezone.
let utcOffset = new Date().getTimezoneOffset()
for (var key in tzCodes) {
  tzCodes[key] = tzCodes[key] + utcOffset
}

const exAssign = (a, b) => (a !== void 0 && a !== null) ? a : b

const parseTimezone = str => {
  // Timezone is in UTC+|-00[[:]00] format
  let match = /UTC([+-])(\d{2})(?::?(\d{2))/.exec(str)
  let offset = 0
  if (match !== null) {
    offset = parseInt(match[2]) * 60
    if (match[2] !== void 0) {
      offset += parseInt(match[3])
    }
    offset *= (match[1] === '-') ? -1 : 1
  } else{
    // Timezone is a timezone code
    match = /[A-Z]{1,5}/.exec(str)
    if (match !== null) {
      offset = tzCodes[match[0]]
    }
    offset = -exAssign(offset, 0)
  }
  return offset
}

const parseMonth = str => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
  'Sep', 'Oct', 'Nov', 'Dec'].indexOf(str.substring(0, 3))

const invDate = usr => `@${usr} Couldn't parse time - Use \`!streamtime `+
                       `overwrite_time YYYY-MM-DD hh:mm [AM|PM] [timezone]`

const parseSchedule = str => {
  let lines = str.split('\n')
  let tz
  // First line could be a timezone definition
  if (lines[0].toLowerCase().indexOf('all times in ') === 0) {
    tz = parseTimezone(lines[0].substring(13))
    lines = lines.slice(1, lines.length)
  } else {
    tz = 0
  }
  let streams = Array()
  let regexes = [
    /(\d+)(?:st|nd|rd|th)? +([A-Za-z]+)( +\d{4})? *:? *(\d+)(?::(\d+))?(AM|PM)?(?: *- *(\d+)(?::(\d+))?(AM|PM)?)?(?: *\| *(.+))/, // ZeroEmpires format
    / *-* *([A-Za-z]+) +(\d+) *(\d{4})? *: *(.*?) +at +(\d+):(\d+) *(AM|PM) *\(([A-Za-z]+)\) *\(.*?\)/ // Resonance22 format
  ]
  lines.forEach(line => {
    let desc, start, end
    let match = regexes[0].exec(line)
    if (match !== null) {
      let day = match[1]
      let month = parseMonth(match[2])
      let year = exAssign(match[3], new Date().getFullYear())
      let startHour = parseInt(match[4])
      let startMin = exAssign(match[5], 0)
      // 12PM = Noon, 12AM = Midnight
      if (match[6] === 'PM') {
        startHour = (startHour + 12) % 24
      } else if (match[6] === 'AM' && startHour == 12) {
        startHour = 0
      }
      start = new Date(year, month, day, startHour, startMin)
      // Add offset due to timezone
      start.setMinutes(start.getMinutes() + tz)
      if (match[7] !== void 0) {
        let endHour = parseInt(match[7])
        let endMin = exAssign(match[8], 0)
        if (match[9] === 'PM') {
          endHour = (endHour + 12) % 24
        } else if (match[9] === 'AM' && endHour == 12) {
          endHour = 0
        }
        end = new Date(year, month, day, endHour, endMin)
        end.setMinutes(start.getMinutes() + tz)
        if (end < start) {
          // Assume the stream is over midnight (not 2+ midnights though)
          end.setDate(end.getDate() + 1)
        }
      }
      desc = match[10]
    } else {
      let match = regexes[1].exec(line)
      if (match !== null) {
        let month = parseMonth(match[1])
        let day = match[2]
        let year = exAssign(match[3], new Date().getFullYear())
        desc = match[4]
        let startHour = parseInt(match[5])
        let startMin = match[6]
        if (match[7] === 'PM') {
          startHour = (startHour + 12) % 24
        } else if (match[7] === 'AM' && startHour == 12) {
          startHour = 0
        }
        start = new Date(year, month, day, startHour, startMin)
        tz = parseTimezone(match[8])
        start.setMinutes(start.getMinutes() + tz)
      }
    }
    if (start !== undefined) {
      streams.push([start, end, desc])
    }
  })
  return streams
}

export default function(opts) {

  opts = assign({
    schedImage: 'http://static-cdn.jtvnw.net/jtv_user_pictures/panel-23728458-image-15fb69742e4863a7-320.jpeg' // Use ZeroEmpires' schedule image by default
  , lateBy: 5 // Minutes for which the 'Should have started' message is shown
  , updateInterval: 5 * 60 * 1000 // Interval (in ms) in which the streamtimes are updated
  }, opts)
  const { db } = opts

  let overwrite = {
    msg: null,
    time: null
  }
  let tableExists = false

  db.schema.hasTable('streamtime_overwrites').then(ex => {
    tableExists = ex
    if (!tableExists) {
      db.schema.createTable('streamtime_overwrites', t=> {
        t.integer('id').primary()
        t.string('value', 255)
      }).then(() => {
        // 1 = Message, 2 = Time
        db('streamtime_overwrites').insert([ { id: 1, value: null }
                                           , { id: 2, value: null } ])
        .then(() => {
          debug('Created table for !streamtime overwrites')
          tableExists = true
        })
      }).catch(e => { throw e })
    } else {
      db('streamtime_overwrites').select('value').orderBy('id').then(o => {
        overwrite.msg = o[0].value
        overwrite.time = (o[1].value === null) ? null
                                             : new Date(parseInt(o[1].value))
      })
    }
  })

  let streams = []
  let foundPanel = false

  function setOverwriteMsg(value) {
    if (!tableExists) {
      return null
    }
    overwrite.msg = value
    db('streamtime_overwrites')
      .update({ value: value })
      .where({ id: 1 })
      .catch(e => { throw e })
  }

  function setOverwriteTime(value) {
    if (!tableExists) {
      return null
    }
    overwrite.time = value
    db('streamtime_overwrites')
      .update({ value: (value !== null) ? value.getTime() : value})
      .where({ id: 2 })
      .catch(e => { throw e })
  }

  function getTimes(channel) {
    return new Promise((resolve, reject) => {
      request(
        { uri: `https://api.twitch.tv/api/channels/${channel.slice(1)}/panels`
        , json: true },
        (err, res, panels = []) => {
          if (err) {
            debug(`An error occured while trying to get the panels: ${err}`)
            reject(err)
          } else {
            streams = []
            try {
              foundPanel = panels.some(panel => {
                if ((panel.data.title !== void 0 &&
                    panel.data.title.toLowerCase() === 'schedule') ||
                    panel.data.image === opts.schedImage) {
                  streams = parseSchedule(strip(panel.html_description))
                  debug(strip(panel.html_description))
                  return true
                }
              })
              resolve()
            } catch (e) {
              if (!(e instanceof TypeError)) {
                throw e
              }
              // Probably an Internal Server Error of sorts, just ignore that.
              debug(`An error occured while trying to get the panels: ${e}`)
              reject(e)
            }
          }
        }
      )
    })
  }

  function getNext() {
    let next = Infinity
    let now = new Date()
    streams.some(stream => {
      let start = new Date(stream[0])
      start.setMinutes(start.getMinutes() + opts.lateBy)
      if (start < next && start > now) {
        next = stream
      }
    })
    if (next === Infinity) {
      return null
    }
    return next
  }

  return function(bot) {

    bot.command('!streamtime overwrite', { rank: 'mod' }, (message, extra) => {
      if ([ '_time', '_discard' ].indexOf(extra) !== -1) {
        return
      }
      let msg = message.trailing.slice(21).trim()
      if (msg.length === 0) {
        return bot.send(`@${message.user} Usage: !streamtime overwrite `+
                        `<message> (use $time$ to include a countdown to the `+
                        `next stream)`)
      }
      setOverwriteMsg(msg)
      debug(`Message overwritten by ${message.user} with ${msg}`)
      bot.send(`@${message.user} !streamtime has been overwritten`)
    })

    bot.command('!streamtime overwrite_time'
                , { rank: 'mod' }
                , (message) => {
      let spl = message.trailing.slice(26).trim().split(' ')
      if (spl.length < 3 || spl.length > 4) {
        return bot.send(invDate(message.user))
      }
      let year, month, day, hour, min
      let spl2 = spl[0].split('-')
      if (spl2.length !== 3) {
        return bot.send(invDate(message.user))
      }
      [year, month, day] = spl2
      let spl3 = spl[1].split(':')
      if (spl3.length === 1) {
        hour = parseInt(spl[1])
        min = 0
      } else if (spl3.length === 2) {
        debug(spl3);
        [hour, min] = spl3.map(i => parseInt(i))
      } else {
        return bot.send(invDate(message.user))
      }
      debug(hour, min)
      if (spl[2] === 'PM') {
        hour = (hour + 12) % 24
      } else if (spl[2] === 'AM' && hour == 12) {
        hour = 0
      } else if (spl[2] !== 'AM') {
        min += parseTimezone(spl[2])
      }
      if (spl.length === 4) {
        min += parseTimezone(spl[3])
      }
      debug(hour, min)
      let time = new Date(year, parseInt(month) - 1, day, hour, min)
      if (isNaN(time.getTime())) {
        return bot.send(invDate(message.user))
      }
      setOverwriteTime(time)
      bot.send(`@${message.user} Time for the next stream has been ` +
               `overwritten (next stream is now in `+
               `${countdown(overwrite.time).toString()}).`)
      debug(`Time to next stream overwritten by ${message.user} with ${time}`)
    })

    bot.command('!streamtime overwrite_discard'
                , { rank: 'mod' }
                , (message) => {
      setOverwriteMsg(null)
      setOverwriteTime(null)
      bot.send(`@${message.user} Overwrite has been discarded.`)
      debug(`Overwrite discarded by ${message.user}`)
    })

    bot.command('!streamtime update'
                , { throttle: 10000 }
                , (message) => {
      getTimes(bot.channel)
        .then(() => bot.send(`@${message.user} Updated.`))
        .catch(err => bot.send(`@${message.user} Couldn't update streamtimes.`))
    })

    bot.command('!streamtime', (message, extra) => {
      if ([ 'overwrite', 'overwrite_time', 'overwrite_discard', 'update' ]
          .indexOf(extra) !== -1) {
        return
      }
      if (bot.isLive && extra !== 'next') {
        return bot.send("It's live! F5!")
      }
      let next = getNext()
      if (overwrite.msg !== null) {
        let msg = overwrite.msg
        if (overwrite.time !== null) {
          let now = new Date()
          if (overwrite.time < now &&
              overwrite.time > now.setMinutes(now.getMinutes - 5)) {
            return bot.send('The stream should have started a second ago!')
          }
          msg = msg.replace(/\$iftime\{(.*?)}/, '$1')
          msg = msg.replace('$time', countdown(overwrite.time).toString())
        } else if (next !== null) {
          msg = msg.replace(/\$iftime\{(.*?)}/, '$1')
          msg = msg.replace('$time', countdown(next[0]).toString())
        } else {
          msg = msg.replace(/\$iftime\{(.*?)}/, '')
        }
        return bot.send(msg)
      } else if (overwrite.time !== null) {
        return bot.send(`Stream in ${countdown(overwrite.time).toString()}.`)
      }
      if (next === null) {
        return bot.send(`There are currently no scheduled streams :/`)
      }
      if (next[0] < new Date()) {
        return bot.send('The stream should have started a second ago!')
      }
      let desc = exAssign(next[2], 'Stream')
      return bot.send(`${desc} in ${countdown(next[0]).toString()}`)
    })

    getTimes(bot.channel)
    setInterval(() => getTimes(bot.channel), opts.updateInterval);

  }

}
