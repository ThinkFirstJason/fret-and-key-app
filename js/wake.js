/* Fret & Key — keep the phone's screen on while the app is open.
   Uses the Screen Wake Lock API, and on iPhone also a tiny silent looping video: home-screen apps on older iOS
   accept a wake lock without honouring it, and a playing video is what iOS reliably treats as "don't sleep".
   The lock drops whenever the app is hidden, so it is taken again on return and on every tap. */
(function () {
  'use strict';
  const FK = window.FK;
  if (!FK.platform.mobile) { FK.wake = { request() {}, active: () => false }; return; }

  let lock = null, pending = false, video = null;

  function startVideo() {
    if (!video) {
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.muted = true;
      video.loop = true;
      video.preload = 'auto';
      video.disableRemotePlayback = true;
      video.setAttribute('aria-hidden', 'true');
      video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1';
      video.src = 'media/keep-awake.mp4';
      document.body.appendChild(video);
    }
    if (video.paused) video.play().catch(() => { /* needs a tap first; retried on the next one */ });
  }

  async function request() {
    if (document.visibilityState !== 'visible') return;
    if (FK.platform.ios) startVideo();
    if (!('wakeLock' in navigator) || (lock && !lock.released) || pending) {
      if (!('wakeLock' in navigator)) startVideo();
      return;
    }
    pending = true;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch (e) {
      lock = null;
      startVideo(); // refused (battery saver, no tap yet): fall back
    } finally { pending = false; }
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') request(); });
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, request, { passive: true, capture: true }));
  window.addEventListener('pageshow', request);
  request();

  FK.wake = { request, active: () => !!(lock && !lock.released) || !!(video && !video.paused) };
})();
