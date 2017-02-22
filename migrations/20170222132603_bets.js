exports.up = async (db) => {
  await db.schema.createTable('bets', (table) => {
    table.increments('id').primary()
    table.string('startedBy', 50)
    table.timestamp('startedAt').defaultTo(db.fn.now())
    table.enum('status', ['open', 'closed', 'ended'])
  })

  await db.schema.createTable('betOptions', (table) => {
    table.increments('id').primary()
    table.integer('betId')
    table.string('name')
    table.string('description')
  })

  await db.schema.createTable('betEntries', (table) => {
    table.increments('id').primary()
    table.integer('betId')
    table.integer('optionId')
    table.string('user')
    table.integer('amount')
  })
}

exports.down = async (db) => {
  await db.schema.dropTable('betEntries')
  await db.schema.dropTable('betOptions')
  await db.schema.dropTable('bets')
}
