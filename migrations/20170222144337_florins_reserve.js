exports.up = (db) =>
  db.schema.createTable('florinReservations', (table) => {
    table.increments('id').primary()
    table.string('username', 50).index()
    table.integer('amount').index()
    table.timestamp('time').defaultTo(db.fn.now())
    table.string('purpose', 50)
  })

exports.down = (db) =>
  db.schema.dropTable('florinReservations')
