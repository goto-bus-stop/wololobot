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
