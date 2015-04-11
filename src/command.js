export default function command(commandName, ...argTypes) {

  return function (prototype, key, descriptor) {

    // tell the Module constructor which methods are commands
    if (!prototype._commandMethods) prototype._commandMethods = []
    prototype._commandMethods.push(key)

    let opts = {}
    if (typeof argTypes[argTypes.length - 1] === 'object') {
      opts = argTypes.pop()
    }

    if (opts.ranks) {
      let action = descriptor.value
      descriptor.value = function (...args) {
        const userType = args[0].special
        if (opts.ranks.some(rank => userType.indexOf(rank) > -1)) {
          return action.apply(this, args)
        }
      }
    }

    descriptor.value.commandName = commandName
    descriptor.value.commandParameters = argTypes

  }

}