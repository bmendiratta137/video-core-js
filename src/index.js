import Backend from './backend'
import NRInsightsBackend from './plugins/nrinsightsbackend'
import Core from './core'
import Constants from './constants'
import Chrono from './chrono'
import Log from './log'
import Emitter from './emitter'
import Tracker from './tracker'
import VideoTracker from './videotracker'
import VideoTrackerState from './videotrackerstate'
import pkg from '../package.json'

const version = pkg.version

export {
  Constants,
  Chrono,
  Log,
  Emitter,
  Tracker,
  VideoTracker,
  VideoTrackerState,
  Core,
  Backend,
  NRInsightsBackend,
  version
}
