// Enable async functions in migrations using the Knex CLI
require('async-to-gen/register')

module.exports = {
  client: 'sqlite3',
  connection: {
    filename: './Florins.sqlite'
  },
  migrations: {
    tableName: 'migrations'
  },
  useNullAsDefault: true
}
