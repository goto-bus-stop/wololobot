export default class Module {

  constructor(bot, options) {
    this.client = bot
    this.options = options

    ;(this._commandMethods || []).forEach(name => {
      const action = this[name]
      bot.registerCommand(action.commandName || name, action.commandParameters, action.bind(this))
    })
  }

}