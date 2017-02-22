exports.up = (db) =>
  db.schema.createTable('transactions', (table) => {
    table.increments('id').primary()
    table.string('username', 50).index()
    table.integer('amount').index()
    table.timestamp('time').defaultTo(db.raw('CURRENT_TIMESTAMP'))
    table.text('description')
  })

exports.down = (knex) =>
  db.schema.dropTable('transactions')
