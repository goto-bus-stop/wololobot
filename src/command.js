export default function command(commandName, ...argTypes) {

  return function (prototype, key, descriptor) {

    // tell the Module constructor which methods are commands
    if (!prototype._commandMethods) prototype._commandMethods = []
    prototype._commandMethods.push(key)

    descriptor.value.commandName = commandName
    descriptor.value.commandParameters = argTypes

  }

}