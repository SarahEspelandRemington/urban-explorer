import ExpoModulesCore
import MediaPlayer

/**
 * Display-only iOS Now Playing integration (A1a).
 *
 * Populates MPNowPlayingInfoCenter with title, artist, and playback rate so
 * the lock screen shows "Streetlit — <place>" while Walk Mode is active.
 *
 * Explicitly out of scope for this slice (see A1a implementation brief):
 *   - MPRemoteCommandCenter is never registered, so there are no lock-screen
 *     transport controls (play/pause/skip) and the onPlay/onPause/onNext
 *     events below are declared (so JS-side addListener doesn't error) but
 *     never emitted.
 *   - artworkUrl is accepted for interface compatibility with the existing
 *     JS wrapper but intentionally ignored — artwork is a separately scoped
 *     fast-follow.
 *   - Elapsed time / duration are never set, since useNarration.ts does not
 *     currently expose that data.
 */
public class NowPlayingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NowPlayingModule")

    Events("onPlay", "onPause", "onNext")

    AsyncFunction("setNowPlaying") { (title: String, artist: String, isPaused: Bool, artworkUrl: String?) in
      var info: [String: Any] = [:]
      info[MPMediaItemPropertyTitle] = title
      info[MPMediaItemPropertyArtist] = artist
      info[MPNowPlayingInfoPropertyPlaybackRate] = isPaused ? 0.0 : 1.0
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    AsyncFunction("setPlaybackState") { (isPaused: Bool) in
      guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else {
        return
      }
      info[MPNowPlayingInfoPropertyPlaybackRate] = isPaused ? 0.0 : 1.0
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    AsyncFunction("clear") {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
  }
}
