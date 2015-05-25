wololobot
=========

Chat bot for the ZeroEmpires Twitch.tv stream, with loyalty stream currency
(florins), bets, and raffles.

## Building

1. `npm install`
1. `npm run build`

## Configuration

1. Copy `config.json.sample` to `config.json`
1. Set your Twitch bot username, [password](https://twitchapps.com/tmi), and the
   channel your bot should run in.
1. Set your database paths. You can use any database supported by
   [knex](http://knexjs.org/#Installation-client). The "database" config option
   is passed straight to Knex.

## Running

With debug info:

    npm start

Without debug info:

    bin/wololobot

With `forever`:

    forever start bin/wololobot

## License

[MIT](./LICENSE)
