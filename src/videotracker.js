import Log from './log'
import Tracker from './tracker'
import TrackerState from './videotrackerstate'

/**
 * Base video tracker class provides extensible tracking over video elements. See {@link Tracker}.
 * Extend this class to create your own video tracker class. Override getter methods and
 * registerListeners/unregisterListeners to provide full integration with your video experience.
 *
 * @example
 * Tracker instances should be added to Core library to start sending data:
 * nrvideo.Core.addTracker(new Tracker())
 *
 * @extends Tracker
 */
class VideoTracker extends Tracker {
  /**
   * Constructor, receives player and options.
   * Lifecycle: constructor > {@link setOptions} > {@link setPlayer} > {@link registerListeners}.
   *
   * @param {Object} [player] Player to track. See {@link setPlayer}.
   * @param {Object} [options] Options for the tracker. See {@link setOptions}.
   */
  constructor (player, options) {
    super()

    /**
     * TrackerState instance. Stores the state of the view. Tracker will automatically update the
     * state of its instance, so there's no need to modify/interact with it manually.
     * @type TrackerState
     */
    this.state = new TrackerState()

    /**
     * Another Tracker instance to track ads.
     * @type Tracker
     */
    this.adsTracker = null

    /**
     * Last bufferType value.
     * @private
     */
    this._lastBufferType = null

    options = options || {}
    this.setOptions(options)
    if (player) this.setPlayer(player, options.tag)

    Log.notice('Tracker ' + this.getTrackerName() + ' v' + this.getTrackerVersion() + ' is ready.')
  }

  /**
   * Set options for the Tracker.
   *
   * @param {Object} [options] Options for the tracker.
   * @param {Boolean} [options.isAd] True if the tracker is tracking ads. See {@link setIsAd}.
   * @param {number} [options.heartbeat] Set time between heartbeats. See {@link heartbeat}.
   * @param {Object} [options.customData] Set custom data. See {@link customData}.
   * @param {Tracker} [options.parentTracker] Set parent tracker. See {@link parentTracker}.
   * @param {Tracker} [options.adsTracker] Set ads tracker. See {@link adsTracker}.
   * @param {Object} [options.tag] DOM element to track. See {@link setPlayer}.
   */
  setOptions (options) {
    if (options) {
      if (options.adsTracker) this.setAdsTracker(options.adsTracker)
      if (typeof options.isAd === 'boolean') this.setIsAd(options.isAd)
      Tracker.prototype.setOptions.apply(this, arguments)
    }
  }

  /**
   * Set a player and/or a tag. If there was one already defined, it will call dispose() first.
   * Will call this.registerListeners() afterwards.
   *
   * @param {Object|string} player New player to save as this.player. If a string is passed,
   * document.getElementById will be called.
   * @param {DOMObject|string} [tag] Optional DOMElement to save as this.tag. If a string is passed,
   * document.getElementById will be called.
   */
  setPlayer (player, tag) {
    if (this.player || this.tag) this.dispose()

    if (typeof document !== 'undefined' && document.getElementById) {
      if (typeof player === 'string') player = document.getElementById(player)
      if (typeof tag === 'string') tag = document.getElementById(tag)
    }

    tag = tag || player // if no tag is passed, use player as both.

    this.player = player
    this.tag = tag
    this.registerListeners()
  }

  /** Returns true if the tracker is currently on ads. */
  isAd () {
    return this.state.isAd()
  }

  /** Sets if the tracker is currenlty tracking ads */
  setIsAd (isAd) {
    this.state.setIsAd(isAd)
  }

  /**
   * Use this function to set up a child ad tracker. You will be able to access it using
   * this.adsTracker.
   *
   * @param {Tracker} tracker Ad tracker to add
   */
  setAdsTracker (tracker) {
    this.disposeAdsTracker() // dispose current one
    if (tracker) {
      this.adsTracker = tracker
      this.adsTracker.setIsAd(true)
      this.adsTracker.parentTracker = this
      this.adsTracker.on('*', funnelAdEvents.bind(this))
    }
  }

  /**
   * Dispose current adsTracker.
   */
  disposeAdsTracker () {
    if (this.adsTracker) {
      this.adsTracker.off('*', funnelAdEvents)
      this.adsTracker.dispose()
    }
  }

  /**
   * Prepares tracker to dispose. Calls unregisterListener and drops references to player and tag.
   */
  dispose () {
    this.stopHeartbeat()
    this.disposeAdsTracker()
    this.unregisterListeners()
    this.player = null
    this.tag = null
  }

  /**
   * Override this method to register listeners to player/tag.
   * @example
   * class SpecificTracker extends Tracker {
   *  registerListeners() {
   *    this.player.on('play', () => this.playHandler)
   *  }
   *
   *  playHandler() {
   *    this.send(VideoTracker.Events.REQUESTED)
   *  }
   * }
   */
  registerListeners () { }

  /**
   * Override this method to unregister listeners to player/tag created in registerListeners
   * @example
   * class SpecificTracker extends Tracker {
   *  registerListeners() {
   *    this.player.on('play', () => this.playHandler)
   *  }
   *
   *  unregisterListeners() {
   *    this.player.off('play', () => this.playHandler)
   *  }
   *
   *  playHandler() {
   *    this.send(VideoTracker.Events.REQUESTED)
   *  }
   * }
   */
  unregisterListeners () { }

  /**
   * Trackers will generate unique id's for every new video iteration. If you have your own unique
   * view value, you can override this method to return it.
   * If the tracker has a parentTracker defined, parent viewId will be used.
   */
  getViewId () {
    if (this.parentTracker) {
      return this.parentTracker.getViewId()
    } else {
      return this.state.getViewId()
    }
  }

  /**
   * Trackers will generate unique id's for every new video session. If you have your own unique
   * view value, you can override this method to return it.
   * If the tracker has a parentTracker defined, parent viewId will be used.
   */
  getViewSession () {
    if (this.parentTracker) {
      return this.parentTracker.getViewSession()
    } else {
      return this.state.getViewSession()
    }
  }

  /** Override to return the Id of the video. */
  getVideoId () {
    return null
  }

  /** Override to return Title of the video. */
  getTitle () {
    return null
  }

  /** Override to return True if the video is live. */
  isLive () {
    return null
  }

  /** Override to return Bitrate (in bits) of the video. */
  getBitrate () {
    return null
  }

  /** Calculates consumed bitrate using webkitVideoDecodedByteCount. */
  getWebkitBitrate () {
    if (this.tag && this.tag.webkitVideoDecodedByteCount) {
      let bitrate
      if (this._lastWebkitBitrate) {
        bitrate = this.tag.webkitVideoDecodedByteCount
        let delta = bitrate - this._lastWebkitBitrate
        let seconds = this.getHeartbeat() / 1000
        bitrate = Math.round((delta / seconds) * 8)
      }
      this._lastWebkitBitrate = this.tag.webkitVideoDecodedByteCount
      return bitrate || null
    }
  }

  /** Override to return Name of the rendition (ie: 1080p). */
  getRenditionName () {
    return null
  }

  /** Override to return Target Bitrate of the rendition. */
  getRenditionBitrate () {
    return null
  }

  /**
   * This method will return 'up', 'down' or null depending on if the bitrate of the rendition
   * have changed from the last time it was called.
   *
   * @param {boolean} [saveNewRendition=false] If true, current rendition will be stored to be used
   * the next time this method is called. This allows you to call this.getRenditionShift() without
   * saving the current rendition and thus preventing interferences with RENDITION_CHANGE events.
   */
  getRenditionShift (saveNewRendition) {
    let current = this.getRenditionBitrate()
    let last
    if (this.isAd()) {
      last = this._lastAdRendition
      if (saveNewRendition) this._lastAdRendition = current
    } else {
      last = this._lastRendition
      if (saveNewRendition) this._lastRendition = current
    }

    if (!current || !last) {
      return null
    } else {
      if (current > last) {
        return 'up'
      } else if (current < last) {
        return 'down'
      } else {
        return null
      }
    }
  }

  /** Override to return renidtion actual Height (before re-scaling). */
  getRenditionHeight () {
    return this.tag ? this.tag.videoHeight : null
  }

  /** Override to return rendition actual Width (before re-scaling). */
  getRenditionWidth () {
    return this.tag ? this.tag.videoWidth : null
  }

  /** Override to return Duration of the video, in ms. */
  getDuration () {
    return this.tag ? this.tag.duration : null
  }

  /** Override to return Playhead (currentTime) of the video, in ms. */
  getPlayhead () {
    return this.tag ? this.tag.currentTime : null
  }

  /**
   * Override to return Language of the video. We recommend using locale notation, ie: en_US.
   * {@see https://gist.github.com/jacobbubu/1836273}
   */
  getLanguage () {
    return null
  }

  /** Override to return URL of the resource being played. */
  getSrc () {
    return this.tag ? this.tag.currentSrc : null
  }

  /** Override to return Playrate (speed) of the video. ie: 1.0, 0.5, 1.25... */
  getPlayrate () {
    return this.tag ? this.tag.playbackRate : null
  }

  /** Override to return True if the video is currently muted. */
  isMuted () {
    return this.tag ? this.tag.muted : null
  }

  /** Override to return True if the video is currently fullscreen. */
  isFullscreen () {
    return null
  }

  /** Override to return the CDN serving the content. */
  getCdn () {
    return null
  }

  /** Override to return the Name of the player. */
  getPlayerName () {
    return this.getTrackerName()
  }

  /** Override to return the Version of the player. */
  getPlayerVersion () {
    return null
  }

  /** Override to return current FPS (Frames per second). */
  getFps () {
    return null
  }

  /**
   * Override to return if the player was autoplayed. By default: this.tag.autoplay
   */
  isAutoplayed () {
    return this.tag ? this.tag.autoplay : null
  }

  /**
   * Override to return the player preload attribute. By default: this.tag.preload
   */
  getPreload () {
    return this.tag ? this.tag.preload : null
  }

  // Only for ads
  /**
   * Override to return Quartile of the ad. 0 before first, 1 after first quartile, 2 after
   * midpoint, 3 after third quartile, 4 when completed.
   */
  getAdQuartile () {
    return null
  }

  /**
   * Override to return the position of the ad. Use {@link Constants.AdPositions} enum
   * to fill this data.
   */
  getAdPosition () {
    if (this.parentTracker) {
      return this.parentTracker.state.isStarted ? 'mid' : 'pre'
    }
    else {
      return null
    }
  }

  /**
   * Override to return the ad partner. ie: ima, freewheel...
   */
  getAdPartner () {
    return null
  }

  /**
   * Override to return the creative id of the ad.
   */
  getAdCreativeId () {
    return null
  }

  /**
   * Do NOT override. This method fills all the appropiate attributes for tracked video.
   *
   * @param {object} [att] Collection of key value attributes
   * @return {object} Filled attributes
   * @final
   */
  getAttributes (att) {
    att = Tracker.prototype.getAttributes.apply(this, arguments)

    if (typeof att.isAd === 'undefined') att.isAd = this.isAd()
    att.viewSession = this.getViewSession()
    att.viewId = this.getViewId()
    att.playerName = this.getPlayerName()
    att.playerVersion = this.getPlayerVersion()

    try {
      att.pageUrl = window.location.href
    } catch (err) { /* skip */ }

    if (this.isAd()) { // Ads
      att.adId = this.getVideoId()
      att.adTitle = this.getTitle()
      att.adBitrate = this.getBitrate() || this.getWebkitBitrate()
      att.adRenditionName = this.getRenditionName()
      att.adRenditionBitrate = this.getRenditionBitrate()
      att.adRenditionHeight = this.getRenditionHeight()
      att.adRenditionWidth = this.getRenditionWidth()
      att.adDuration = this.getDuration()
      att.adPlayhead = this.getPlayhead()
      att.adLanguage = this.getLanguage()
      att.adSrc = this.getSrc()
      att.adCdn = this.getCdn()
      att.adIsMuted = this.isMuted()
      att.adFps = this.getFps()
      // ad exclusives
      att.adQuartile = this.getAdQuartile()
      att.adPosition = this.getAdPosition()
      att.adCreativeId = this.getAdCreativeId()
      att.adPartner = this.getAdPartner()
    } else { // no ads
      att.contentId = this.getVideoId()
      att.contentTitle = this.getTitle()
      att.contentIsLive = this.isLive()
      att.contentBitrate = this.getBitrate() || this.getWebkitBitrate()
      att.contentRenditionName = this.getRenditionName()
      att.contentRenditionBitrate = this.getRenditionBitrate()
      att.contentRenditionHeight = this.getRenditionHeight()
      att.contentRenditionWidth = this.getRenditionWidth()
      att.contentDuration = this.getDuration()
      att.contentPlayhead = this.getPlayhead()
      att.contentLanguage = this.getLanguage()
      att.contentSrc = this.getSrc()
      att.contentPlayrate = this.getPlayrate()
      att.contentIsFullscreen = this.isFullscreen()
      att.contentIsMuted = this.isMuted()
      att.contentCdn = this.getCdn()
      att.contentIsAutoplayed = this.isAutoplayed()
      att.contentPreload = this.getPreload()
      att.contentFps = this.getFps()
      if (this.adsTracker != null && this.adsTracker.state.totalAdPlaytime > 0) {
        att.totalAdPlaytime = this.adsTracker.state.totalAdPlaytime;
      }
    }

    this.state.getStateAttributes(att)

    for (let key in this.customData) {
      att[key] = this.customData[key]
    }

    return att
  }

  /**
   * Sends custom event and registers a timeSince attribute.
   * @param {Object} [actionName] Custom action name.
   * @param {Object} [timeSinceAttName] Custom timeSince attribute name.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendCustom (actionName, timeSinceAttName, att) {
    att = att || {}
    this.send(actionName, att)
    this.state.setTimeSinceAttribute(timeSinceAttName)
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendPlayerReady (att) {
    if (this.state.goPlayerReady()) {
      att = att || {}
      this.send(VideoTracker.Events.PLAYER_READY, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners. Calls
   * {@link startHeartbeat}.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendRequest (att) {
    if (this.state.goRequest()) {
      let ev = this.isAd() ? VideoTracker.Events.AD_REQUEST : VideoTracker.Events.CONTENT_REQUEST
      this.send(ev, att)
      this.startHeartbeat()
      this.state.goHeartbeat()
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendStart (att) {
    if (this.state.goStart()) {
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_START
        if (this.parentTracker) this.parentTracker.state.isPlaying = false
      } else {
        ev = VideoTracker.Events.CONTENT_START
      }
      this.send(ev, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners. Calls
   * {@link stopHeartbeat}.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendEnd (att) {
    if (this.state.goEnd()) {
      att = att || {}
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_END
        att.timeSinceAdRequested = this.state.timeSinceRequested.getDeltaTime()
        att.timeSinceAdStarted = this.state.timeSinceStarted.getDeltaTime()
        if (this.parentTracker) this.parentTracker.state.isPlaying = true
      } else {
        ev = VideoTracker.Events.CONTENT_END
        att.timeSinceRequested = this.state.timeSinceRequested.getDeltaTime()
        att.timeSinceStarted = this.state.timeSinceStarted.getDeltaTime()
      }
      this.stopHeartbeat()
      this.send(ev, att)
      if (this.parentTracker && this.isAd()) this.parentTracker.state.goLastAd()
      this.state.goViewCountUp()
      this.state.totalPlaytime = 0
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendPause (att) {
    if (this.state.goPause()) {
      let ev = this.isAd() ? VideoTracker.Events.AD_PAUSE : VideoTracker.Events.CONTENT_PAUSE
      this.send(ev, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendResume (att) {
    if (this.state.goResume()) {
      att = att || {}
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_RESUME
        att.timeSinceAdPaused = this.state.timeSincePaused.getDeltaTime()
      } else {
        ev = VideoTracker.Events.CONTENT_RESUME
        att.timeSincePaused = this.state.timeSincePaused.getDeltaTime()
      }
      this.send(ev, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendBufferStart (att) {
    if (this.state.goBufferStart()) {
      att = att || {}
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_BUFFER_START
      } else {
        ev = VideoTracker.Events.CONTENT_BUFFER_START
      }

      att = this.buildBufferAttributes(att)
      this._lastBufferType = att.bufferType
      
      this.send(ev, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendBufferEnd (att) {
    if (this.state.goBufferEnd()) {
      att = att || {}
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_BUFFER_END
        att.timeSinceAdBufferBegin = this.state.timeSinceBufferBegin.getDeltaTime()
      } else {
        ev = VideoTracker.Events.CONTENT_BUFFER_END
        att.timeSinceBufferBegin = this.state.timeSinceBufferBegin.getDeltaTime()
      }

      att = this.buildBufferAttributes(att)
      // Set the bufferType attribute of the last BUFFER_START
      if (this._lastBufferType != null) {
        att.bufferType = this._lastBufferType
      }

      this.send(ev, att)
      this.state.initialBufferingHappened = true
    }
  }
  
  buildBufferAttributes(att) {
    if (att.timeSinceStarted == undefined || att.timeSinceStarted < 100) {
      att.isInitialBuffering = !this.state.initialBufferingHappened
    }
    else {
      att.isInitialBuffering = false
    }

    att.bufferType = this.state.calculateBufferType(att.isInitialBuffering)
    
    att.timeSinceResumed = this.state.timeSinceResumed.getDeltaTime()
    att.timeSinceSeekEnd = this.state.timeSinceSeekEnd.getDeltaTime()

    return att
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendSeekStart (att) {
    if (this.state.goSeekStart()) {
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_SEEK_START
      } else {
        ev = VideoTracker.Events.CONTENT_SEEK_START
      }
      this.send(ev, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendSeekEnd (att) {
    if (this.state.goSeekEnd()) {
      att = att || {}
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_SEEK_END
        att.timeSinceAdSeekBegin = this.state.timeSinceSeekBegin.getDeltaTime()
      } else {
        ev = VideoTracker.Events.CONTENT_SEEK_END
        att.timeSinceSeekBegin = this.state.timeSinceSeekBegin.getDeltaTime()
      }
      this.send(ev, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   * @param {String} att.state Download requires a string to distinguish different states.
   */
  sendDownload (att) {
    att = att || {}
    if (!att.state) Log.warn('Called sendDownload without { state: xxxxx }.')
    this.send(VideoTracker.Events.DOWNLOAD, att)
    this.state.goDownload()
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendError (att) {
    att = att || {}
    att.isAd = this.isAd()
    this.state.goError()
    let ev = this.isAd() ? VideoTracker.Events.AD_ERROR : VideoTracker.Events.CONTENT_ERROR
    this.send(ev, att)
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendRenditionChanged (att) {
    att = att || {}
    att.timeSinceLastRenditionChange = this.state.timeSinceLastRenditionChange.getDeltaTime()
    att.shift = this.getRenditionShift(true)
    let ev
    if (this.isAd()) {
      ev = VideoTracker.Events.AD_RENDITION_CHANGE
    } else {
      ev = VideoTracker.Events.CONTENT_RENDITION_CHANGE
    }
    this.send(ev, att)
    this.state.goRenditionChange()
  }

  /**
   * Sends associated event and changes view state. Heartbeat will automatically be sent every
   * 10 seconds. There's no need to call this manually.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   * @param {number} att.url Url of the clicked ad.
   *
   */
  sendHeartbeat (att) {
    if (this.state.isRequested) {
      let ev
      if (this.isAd()) {
        ev = VideoTracker.Events.AD_HEARTBEAT
      } else {
        ev = VideoTracker.Events.CONTENT_HEARTBEAT
      }
      this.send(ev, att)
      this.state.goHeartbeat()
    }
  }

  // Only ads
  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendAdBreakStart (att) {
    if (this.isAd() && this.state.goAdBreakStart()) {
      this.state.totalAdPlaytime = 0;
      if (this.parentTracker) this.parentTracker.state.isPlaying = false
      this.send(VideoTracker.Events.AD_BREAK_START, att)
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   */
  sendAdBreakEnd (att) {
    if (this.isAd() && this.state.goAdBreakEnd()) {
      att = att || {}
      att.timeSinceAdBreakBegin = this.state.timeSinceAdBreakStart.getDeltaTime()
      this.send(VideoTracker.Events.AD_BREAK_END, att)
      // Just in case AD_END not arriving, because of an AD_ERROR
      if (this.parentTracker) this.parentTracker.state.isPlaying = true
      this.stopHeartbeat()
      if (this.parentTracker && this.isAd()) this.parentTracker.state.goLastAd()
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   * @param {number} att.quartile Number of the quartile.
   */
  sendAdQuartile (att) {
    if (this.isAd()) {
      att = att || {}
      if (!att.quartile) Log.warn('Called sendAdQuartile without { quartile: xxxxx }.')
      att.timeSinceLastAdQuartile = this.state.timeSinceLastAdQuartile.getDeltaTime()
      this.send(VideoTracker.Events.AD_QUARTILE, att)
      this.state.goAdQuartile()
    }
  }

  /**
   * Sends associated event and changes view state. An internal state machine will prevent
   * duplicated events. Should be associated to an event using registerListeners.
   * @param {Object} [att] Collection of key:value attributes to send with the request.
   * @param {number} att.url Url of the clicked ad.
   */
  sendAdClick (att) {
    if (this.isAd()) {
      att = att || {}
      if (!att.url) Log.warn('Called sendAdClick without { url: xxxxx }.')
      this.send(VideoTracker.Events.AD_CLICK, att)
    }
  }
}

/**
 * Enumeration of events fired by this class.
 *
 * @static
 * @memberof VideoTracker
 * @enum {String}
 */
VideoTracker.Events = {
  // Player
  /** The player is ready to start sending events. */
  PLAYER_READY: 'PLAYER_READY',
  /** Downloading data. */
  DOWNLOAD: 'DOWNLOAD',
  /** An error happened */
  ERROR: 'ERROR',

  // Video
  /** Content video has been requested. */
  CONTENT_REQUEST: 'CONTENT_REQUEST',
  /** Content video started (first frame shown). */
  CONTENT_START: 'CONTENT_START',
  /** Content video ended. */
  CONTENT_END: 'CONTENT_END',
  /** Content video paused. */
  CONTENT_PAUSE: 'CONTENT_PAUSE',
  /** Content video resumed. */
  CONTENT_RESUME: 'CONTENT_RESUME',
  /** Content video seek started */
  CONTENT_SEEK_START: 'CONTENT_SEEK_START',
  /** Content video seek ended. */
  CONTENT_SEEK_END: 'CONTENT_SEEK_END',
  /** Content video beffering started */
  CONTENT_BUFFER_START: 'CONTENT_BUFFER_START',
  /** Content video buffering ended */
  CONTENT_BUFFER_END: 'CONTENT_BUFFER_END',
  /** Content video heartbeat, en event that happens once every 30 seconds while the video is playing. */
  CONTENT_HEARTBEAT: 'CONTENT_HEARTBEAT',
  /** Content video stream qwuality changed. */
  CONTENT_RENDITION_CHANGE: 'CONTENT_RENDITION_CHANGE',
  /** Content video error. */
  CONTENT_ERROR: 'CONTENT_ERROR',

  // Ads only
  /** Ad video has been requested. */
  AD_REQUEST: 'AD_REQUEST',
  /** Ad video started (first frame shown). */
  AD_START: 'AD_START',
  /** Ad video ended. */
  AD_END: 'AD_END',
  /** Ad video paused. */
  AD_PAUSE: 'AD_PAUSE',
  /** Ad video resumed. */
  AD_RESUME: 'AD_RESUME',
  /** Ad video seek started */
  AD_SEEK_START: 'AD_SEEK_START',
  /** Ad video seek ended */
  AD_SEEK_END: 'AD_SEEK_END',
  /** Ad video beffering started */
  AD_BUFFER_START: 'AD_BUFFER_START',
  /** Ad video beffering ended */
  AD_BUFFER_END: 'AD_BUFFER_END',
  /** Ad video heartbeat, en event that happens once every 30 seconds while the video is playing. */
  AD_HEARTBEAT: 'AD_HEARTBEAT',
  /** Ad video stream qwuality changed. */
  AD_RENDITION_CHANGE: 'AD_RENDITION_CHANGE',
  /** Ad video error. */
  AD_ERROR: 'AD_ERROR',
  /** Ad break (a block of ads) started. */
  AD_BREAK_START: 'AD_BREAK_START',
  /** Ad break ended. */
  AD_BREAK_END: 'AD_BREAK_END',
  /** Ad quartile happened. */
  AD_QUARTILE: 'AD_QUARTILE',
  /** Ad has been clicked. */
  AD_CLICK: 'AD_CLICK'
}

// Private members
function funnelAdEvents (e) {
  this.send(e.type, e.data)
}

export default VideoTracker
