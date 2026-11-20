// テスト用の偽の YouTube IFrame API。https://www.youtube.com/iframe_api の代わりに返す。
// 再生すると時間が SPEED 倍で進む。window.__yt に呼び出しの記録を残す。
(function () {
  var SPEED = 20;
  var log = (window.__yt = { calls: [] });
  var PlayerState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  function Player(el, opts) {
    var self = this;
    var node = typeof el === "string" ? document.getElementById(el) : el;
    var frame = document.createElement("div");
    frame.setAttribute("data-testid", "fake-player");
    frame.style.cssText = "width:100%;height:100%;color:#fff;display:flex;align-items:center;justify-content:center;font:14px sans-serif";
    frame.textContent = "fake player: " + opts.videoId;
    node.replaceWith(frame);
    this.t = (opts.playerVars && opts.playerVars.start) || 0;
    this.playing = false;
    this.last = 0;
    this.events = opts.events || {};
    setTimeout(function () {
      self.events.onReady && self.events.onReady({ target: self });
    }, 50);
  }
  Player.prototype._now = function () {
    if (this.playing) {
      var n = performance.now();
      this.t += ((n - this.last) / 1000) * SPEED;
      this.last = n;
    }
    return this.t;
  };
  Player.prototype.seekTo = function (s) {
    this._now();
    this.t = s;
    log.calls.push(["seekTo", s]);
  };
  Player.prototype.playVideo = function () {
    this.last = performance.now();
    this.playing = true;
    log.calls.push(["playVideo"]);
    var self = this;
    setTimeout(function () {
      self.events.onStateChange && self.events.onStateChange({ data: PlayerState.PLAYING, target: self });
    }, 10);
  };
  Player.prototype.pauseVideo = function () {
    this._now();
    if (this.playing) log.calls.push(["pauseVideo", Math.round(this.t * 10) / 10]);
    this.playing = false;
  };
  Player.prototype.getCurrentTime = function () {
    return this._now();
  };
  Player.prototype.getPlayerState = function () {
    return this.playing ? PlayerState.PLAYING : PlayerState.PAUSED;
  };
  Player.prototype.destroy = function () {};
  window.YT = { Player: Player, PlayerState: PlayerState };
  setTimeout(function () {
    window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
  }, 0);
})();
