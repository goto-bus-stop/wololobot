import command from '../command'
import Module from '../Module'
import pack from '../../package.json'

export default class Version extends Module {

  @command('!version')
  sendVersion() {
    this.client.say(pack.name + ' v' + pack.version)
  }

}